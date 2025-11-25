# Video Sequencing Analysis Report

## Executive Summary

The TimedTextPlayer component manages sequential playback of multiple `<video>` elements to create a seamless virtual timeline. However, the current implementation has **critical race conditions** that allow multiple videos to play simultaneously, especially under poor network conditions or during seek operations.

**Root Cause**: Event-driven architecture without central state enforcement, combined with asynchronous `play()` calls and arbitrary timing delays.

---

## Current Architecture

### Core Concept

The player maintains a virtual timeline where multiple media elements (with `data-t` attributes) are played in sequence:

```
Virtual Timeline:  [0--------10--------20--------30]
Video A:          [0----10]
                         data-t="0,10" offset="0"
Video B:                 [10----20]
                         data-t="5,15" offset="10"
Video C:                          [20----30]
                         data-t="10,20" offset="20"
```

### Key State Variables

- **`time`**: Current position in virtual timeline (pseudo-time)
- **`playing`**: Boolean indicating if playback is active
- **`_players`**: NodeList of all media elements
- **`_duration`**: Total duration of virtual timeline

### Player Selection Logic

**`_playerAtTime(time: number)`** (src/timedtext-player.ts:721-730)

```typescript
private _playerAtTime(time: number): HTMLMediaElement | undefined {
  const players = Array.from(this._players);
  return players.find(p => {
    const [start, end] = (p.getAttribute('data-t') ?? '0,0').split(',').map(v => parseFloat(v));
    const offset = parseFloat(p.getAttribute('data-offset') ?? '0');
    return start <= time - offset + start && time - offset + start <= end;
  }) ?? (players.length > 0 ? players[players.length - 1] : undefined);
}
```

Converts virtual time to player-specific time and finds the player whose range contains that time.

**`_currentPlayer()`** (src/timedtext-player.ts:732-734)

```typescript
private _currentPlayer(): HTMLMediaElement | undefined {
  return this._playerAtTime(this.time);
}
```

Returns the player that should be active at the current virtual time.

---

## Current Playback Flow

### 1. Normal Sequential Playback

**Event Handler**: `_onTimeUpdate()` (src/timedtext-player.ts:891-939)

```typescript
private _onTimeUpdate(e: Event & { target: HTMLAudioElement | HTMLVideoElement }) {
  const { target: player } = e;
  const [start, end] = (player.getAttribute('data-t') ?? '0,0').split(',').map(v => parseFloat(v));
  const offset = parseFloat(player.getAttribute('data-offset') ?? '0');

  const players = Array.from(this._players);
  const i = players.indexOf(player as HTMLVideoElement);
  const nextPlayer = i <= players.length - 1 ? players[i + 1] : null;

  if (player.currentTime < start) {
    player.pause();  // Player started too early
  } else if (start <= player.currentTime && player.currentTime <= end) {
    this.time = player.currentTime - start + offset;  // Update virtual time

    // Preload next player
    if (nextPlayer) {
      const [start3] = (nextPlayer.getAttribute('data-t') ?? '0,0').split(',').map(v => parseFloat(v));
      if (nextPlayer.currentTime !== start3) {
        this._seekMediaElement(nextPlayer, start3, 'nextPlayer');
      }
    }

    this.dispatchEvent(new CustomEvent('timeupdate'));
    this._dispatchTimedTextEvent();
  } else if (end <= player.currentTime) {
    player.pause();  // Player reached its end
    this._currentCue = null;
    if (nextPlayer) nextPlayer.play();  // ⚠️ ISSUE: Async play() call
  }
}
```

**Flow**:

1. Current player fires `timeupdate` events continuously
2. Virtual `time` is updated based on player's `currentTime`
3. When player reaches its `end`, it pauses and triggers `nextPlayer.play()`
4. Next player starts from its preloaded position

### 2. Seek Operation

**Method**: `_seek()` (src/timedtext-player.ts:845-872)

```typescript
private _seek(time: number, _emitTimeUpdate = false, message: string) {
  if (time < 0) return;
  const player = this._playerAtTime(time);
  if (!player) return;

  const currentPlayer = this._currentPlayer();
  const [start] = (player.getAttribute('data-t') ?? '0,0').split(',').map(v => parseFloat(v));
  const offset = parseFloat(player.getAttribute('data-offset') ?? '0');

  const playing = !!this.playing;
  if (playing && currentPlayer && currentPlayer !== player) {
    currentPlayer.pause();  // ⚠️ Only pauses ONE player
  }

  this._seekMediaElement(player, time - offset + start, '_seek');
  if (playing && currentPlayer && currentPlayer !== player) this.playing = true;
}
```

**Flow**:

1. Find target player for the seek time
2. Pause current player if it's different from target
3. Seek target player to the calculated time
4. If was playing, mark as playing (but doesn't explicitly call `play()`)

### 3. Safety Mechanism: \_onPlaying

**Event Handler**: `_onPlaying()` (src/timedtext-player.ts:587-597)

```typescript
private _onPlaying(e: Event & { target: HTMLAudioElement | HTMLVideoElement }) {
  setTimeout(() => {
    if (this._currentPlayer() !== e.target) {
      debug('pause other player', e.target);
      (e.target as HTMLMediaElement).pause();
      return;
    } else {
      this._relayEvent(e);
    }
  }, 200);  // ⚠️ 200ms delay creates race window
}
```

**Intent**: Catch and pause any player that starts playing when it shouldn't.

**Problem**: The 200ms delay allows a window where multiple players can be playing simultaneously.

---

## Identified Issues

### Issue #1: Race Condition in \_onPlaying (CRITICAL)

**Location**: src/timedtext-player.ts:587-597

**Problem**: The 200ms delay in `_onPlaying()` creates a race window.

**Scenario**:

```
t=0ms:   Video A starts playing (not current player)
t=50ms:  Video B (current player) is playing
t=0-200ms: Both videos are playing simultaneously
t=200ms: _onPlaying timeout fires, checks if Video A is current player, pauses it
```

**Why 200ms?**: The delay appears arbitrary and likely added to work around some edge case, but it introduces a worse problem.

**Evidence**:

- On fast networks: Window is short, may go unnoticed
- On slow networks: Buffering delays extend the overlap window
- On seek operations: Multiple players may buffer simultaneously

### Issue #2: Async play() Without Promise Handling (CRITICAL)

**Location**: src/timedtext-player.ts:937

```typescript
if (nextPlayer) nextPlayer.play(); // Returns Promise<void>
```

**Problem**:

- `HTMLMediaElement.play()` returns a `Promise`
- The promise is neither awaited nor error-handled
- If `play()` fails (common on mobile, autoplay restrictions), it fails silently
- If `play()` is slow (buffering), state becomes inconsistent

**Better approach**:

```typescript
if (nextPlayer) {
  nextPlayer
    .play()
    .then(() => {
      // Ensure all other players are paused
    })
    .catch(err => {
      console.error('Failed to play next video', err);
      // Handle autoplay restrictions
    });
}
```

### Issue #3: No Central "Only One Player" Enforcement (CRITICAL)

**Problem**: Player exclusivity is enforced through scattered event handlers rather than a central state machine.

**Current approach**:

- `_onPlaying`: Tries to pause non-current players (with delay)
- `_onTimeUpdate`: Handles transitions
- `_seek`: Pauses current player only
- `public play()`: Doesn't pause other internal players

**Missing**: A method like `_ensureOnlyPlayerPlaying(player)` that:

1. Pauses ALL players
2. Ensures target player is at correct time
3. Calls `play()` on target player only
4. Updates state atomically

### Issue #4: Insufficient Pausing During Seek (HIGH)

**Location**: src/timedtext-player.ts:857-860

```typescript
if (playing && currentPlayer && currentPlayer !== player) {
  debug('pause current player in seek', currentPlayer);
  currentPlayer.pause();
}
```

**Problem**: Only pauses `currentPlayer`, but what if another player is also playing due to buffering delays or previous race conditions?

**Scenario**:

```
State: Video A is playing (current), Video B is buffering
Action: User seeks to Video C's time range
Result:
  - Video A is paused ✓
  - Video C is seeked ✓
  - Video B finishes buffering and starts playing ✗
  - Video C eventually plays ✗
  - Both Video B and C are playing simultaneously
```

### Issue #5: Network-Induced Timing Issues (HIGH)

**Scenario: Late Buffering Start**

```
Timeline:
t=10s  : User at Video B's range, Video B should play
t=10s  : Video B starts buffering (slow network)
t=12s  : Video A (previous clip) was never paused, still playing
t=15s  : Video B finishes buffering, starts playing
t=15s  : Both Video A and Video B are now playing
t=15.2s: _onPlaying fires for Video B (200ms delay expired)
t=15.2s: _currentPlayer() still returns Video B, so it continues
t=15s-?: Video A continues playing until its timeupdate handler realizes it's past its end
```

### Issue #6: No State Locking/Mutex (MEDIUM)

**Problem**: Multiple events can fire in rapid succession, each modifying state:

- Multiple `timeupdate` events
- `playing` events from different players
- `seeked` events
- `canplay` events

Without a mutex or state machine, these events can interleave and cause inconsistent state.

**Example**:

```
Event Queue:
1. timeupdate (Video A) - sets this.time = 9.8
2. timeupdate (Video A) - sets this.time = 10.1, triggers transition
3. playing (Video B) - should be current, passes check
4. playing (Video A) - buffering finally completed, passes check due to race
```

### Issue #7: public play() Doesn't Ensure Single Player (MEDIUM)

**Location**: src/timedtext-player.ts:110-130

```typescript
public play() {
  let player = this._currentPlayer();
  if (!player) return;

  if (this.duration - this.currentTime < 0.4) {
    this._seek(0, false, 'play()');
    player = this._playerAtTime(0);
    player!.play();  // ⚠️ No pause of other players
  } else {
    player!.play();  // ⚠️ No pause of other players
  }

  // Only pauses other timedtext-player instances, not internal players
  const players = Array.from(document.querySelectorAll('timedtext-player'));
  players.forEach(p => {
    if (p !== this) p.pause();
  });
}
```

**Issue**: Pauses other `<timedtext-player>` components in the document, but doesn't pause other video elements within THIS instance.

### Issue #8: Next Player Preloading May Conflict (LOW)

**Location**: src/timedtext-player.ts:918-924

```typescript
if (nextPlayer) {
  const [start3] = (nextPlayer.getAttribute('data-t') ?? '0,0').split(',').map(v => parseFloat(v));
  if (nextPlayer.currentTime !== start3) {
    this._seekMediaElement(nextPlayer, start3, 'nextPlayer');
  }
}
```

**Intent**: Preload next player for smooth transition.

**Issue**: Seeks next player without checking if it's playing or buffering, potentially causing visual glitches or audio blips.

---

## Root Causes Summary

1. **Event-Driven Without State Machine**: Relies on event handlers reacting independently rather than a central state controller
2. **Async Operations Without Coordination**: `play()` calls don't coordinate with each other
3. **Timing-Based Safety Net**: The 200ms delay is a symptom of architectural issues, not a solution
4. **No Mutex/Lock**: Multiple events can modify state concurrently
5. **Optimistic Concurrency**: Assumes operations complete instantly when they're actually async

---

## Proposed Improvements

### Improvement #1: Central State Machine with Mutex

**Goal**: Ensure only one player can be in "playing" state at a time.

```typescript
private _playbackMutex: boolean = false;

private async _ensureOnlyPlayerPlaying(targetPlayer: HTMLMediaElement): Promise<void> {
  if (this._playbackMutex) {
    console.warn('Playback state change already in progress');
    return;
  }

  this._playbackMutex = true;

  try {
    // 1. Pause ALL players except target
    const players = Array.from(this._players);
    await Promise.all(
      players
        .filter(p => p !== targetPlayer && !p.paused)
        .map(p => {
          p.pause();
          return Promise.resolve(); // pause() is sync but wrap for consistency
        })
    );

    // 2. Ensure target is at correct time
    const [start] = (targetPlayer.getAttribute('data-t') ?? '0,0').split(',').map(v => parseFloat(v));
    if (Math.abs(targetPlayer.currentTime - start) > 0.1) {
      targetPlayer.currentTime = start;
    }

    // 3. Play target
    if (this.playing && targetPlayer.paused) {
      await targetPlayer.play();
    }
  } catch (err) {
    console.error('Failed to ensure single player', err);
    // Handle autoplay restrictions, user interaction required, etc.
  } finally {
    this._playbackMutex = false;
  }
}
```

**Usage**: Replace direct `play()` calls with `_ensureOnlyPlayerPlaying(player)`.

### Improvement #2: Remove 200ms Delay, Use Immediate Check

**Current** (src/timedtext-player.ts:587-597):

```typescript
private _onPlaying(e: Event & { target: HTMLAudioElement | HTMLVideoElement }) {
  setTimeout(() => {
    if (this._currentPlayer() !== e.target) {
      debug('pause other player', e.target);
      (e.target as HTMLMediaElement).pause();
      return;
    } else {
      this._relayEvent(e);
    }
  }, 200);
}
```

**Improved**:

```typescript
private _onPlaying(e: Event & { target: HTMLAudioElement | HTMLVideoElement }) {
  const target = e.target as HTMLMediaElement;
  const currentPlayer = this._currentPlayer();

  if (currentPlayer !== target) {
    debug('pause other player immediately', target);
    target.pause();
    return;
  }

  // Defensive: ensure no other player is playing
  this._pauseAllExcept(target);
  this._relayEvent(e);
}

private _pauseAllExcept(targetPlayer: HTMLMediaElement): void {
  const players = Array.from(this._players);
  players.forEach(p => {
    if (p !== targetPlayer && !p.paused) {
      debug('pause other active player', p);
      p.pause();
    }
  });
}
```

### Improvement #3: Handle Async play() Properly

**Current** (src/timedtext-player.ts:937):

```typescript
if (nextPlayer) nextPlayer.play();
```

**Improved**:

```typescript
if (nextPlayer) {
  this._transitionToPlayer(nextPlayer);
}

private async _transitionToPlayer(player: HTMLMediaElement): Promise<void> {
  debug('transitioning to player', player);

  // 1. Pause all other players
  this._pauseAllExcept(player);

  // 2. Ensure player is at correct time
  const [start] = (player.getAttribute('data-t') ?? '0,0').split(',').map(v => parseFloat(v));
  if (Math.abs(player.currentTime - start) > 0.1) {
    player.currentTime = start;
  }

  // 3. Play with error handling
  try {
    await player.play();
    debug('player started successfully', player);
  } catch (err) {
    console.error('Failed to play next video', err, player);

    // Handle autoplay restrictions
    if (err.name === 'NotAllowedError') {
      // User interaction required
      this.dispatchEvent(new CustomEvent('autoplayblocked', { detail: { player, error: err } }));
    }
  }
}
```

### Improvement #4: Comprehensive Pause on Seek

**Current** (src/timedtext-player.ts:857-860):

```typescript
if (playing && currentPlayer && currentPlayer !== player) {
  currentPlayer.pause();
}
```

**Improved**:

```typescript
// Always pause ALL players during seek, regardless of target
const players = Array.from(this._players);
players.forEach(p => {
  if (!p.paused) {
    debug('pause player during seek', p);
    p.pause();
  }
});

// Then seek and potentially play target
this._seekMediaElement(player, time - offset + start, '_seek');

if (playing) {
  // Use the new transition method
  this._transitionToPlayer(player);
}
```

### Improvement #5: Add Playback State Validation

**Add method to validate and repair state**:

```typescript
private _validatePlaybackState(): void {
  const players = Array.from(this._players);
  const playingPlayers = players.filter(p => !p.paused);

  if (playingPlayers.length > 1) {
    console.warn('Multiple players playing detected', playingPlayers);

    // Emergency repair: pause all except current
    const currentPlayer = this._currentPlayer();
    playingPlayers.forEach(p => {
      if (p !== currentPlayer) {
        console.warn('Emergency pause of unexpected player', p);
        p.pause();
      }
    });
  }

  if (this.playing && playingPlayers.length === 0) {
    console.warn('State says playing but no player is playing');
    // Could auto-repair by starting current player
  }
}
```

**Call periodically**:

```typescript
// In connectedCallback or similar
setInterval(() => this._validatePlaybackState(), 500);
```

### Improvement #6: Refactor public play() to Use Central Method

**Current** (src/timedtext-player.ts:110-130):

```typescript
public play() {
  let player = this._currentPlayer();
  if (!player) return;

  if (this.duration - this.currentTime < 0.4) {
    this._seek(0, false, 'play()');
    player = this._playerAtTime(0);
    player!.play();
  } else {
    player!.play();
  }

  const players = Array.from(document.querySelectorAll('timedtext-player'));
  players.forEach(p => {
    if (p !== this) p.pause();
  });
}
```

**Improved**:

```typescript
public play() {
  let player = this._currentPlayer();
  if (!player) return;

  // Handle end-of-timeline restart
  if (this.duration - this.currentTime < 0.4) {
    this._seek(0, false, 'play()');
    player = this._playerAtTime(0);
  }

  // Pause other timedtext-player instances
  const players = Array.from(document.querySelectorAll('timedtext-player'));
  players.forEach(p => {
    if (p !== this) p.pause();
  });

  // Use central method to ensure single player
  this._transitionToPlayer(player);
}
```

### Improvement #7: Add Play Request Queue

**Handle rapid play/pause/seek operations**:

```typescript
private _playbackQueue: Array<() => Promise<void>> = [];
private _processingQueue: boolean = false;

private async _queuePlaybackOperation(operation: () => Promise<void>): Promise<void> {
  this._playbackQueue.push(operation);

  if (!this._processingQueue) {
    this._processingQueue = true;

    while (this._playbackQueue.length > 0) {
      const op = this._playbackQueue.shift();
      if (op) {
        try {
          await op();
        } catch (err) {
          console.error('Playback operation failed', err);
        }
      }
    }

    this._processingQueue = false;
  }
}

// Usage
public play() {
  this._queuePlaybackOperation(async () => {
    const player = this._currentPlayer();
    if (player) {
      await this._transitionToPlayer(player);
    }
  });
}
```

---

## Testing Strategy

### Test Case 1: Rapid Seek Operations

```typescript
test('rapid seek should not cause multiple players to play', async () => {
  const player = new TimedTextPlayer();
  // Setup with 3 videos

  player.currentTime = 5;
  await wait(100);
  player.currentTime = 15;
  await wait(100);
  player.currentTime = 25;
  await wait(100);

  const playingPlayers = Array.from(player._players).filter(p => !p.paused);
  expect(playingPlayers.length).toBeLessThanOrEqual(1);
});
```

### Test Case 2: Network Delay Simulation

```typescript
test('buffering delay should not cause overlap', async () => {
  const player = new TimedTextPlayer();
  // Setup with 2 videos

  // Simulate slow buffering on Video B
  const videoB = player._players[1];
  videoB.addEventListener('play', e => {
    // Delay actual playing by 2 seconds
    setTimeout(() => {
      videoB.dispatchEvent(new Event('playing'));
    }, 2000);
    e.preventDefault();
  });

  player.play();
  player.currentTime = 15; // Jump to Video B

  await wait(2500); // Wait for delayed playing event

  const playingPlayers = Array.from(player._players).filter(p => !p.paused);
  expect(playingPlayers.length).toBe(1);
  expect(playingPlayers[0]).toBe(videoB);
});
```

### Test Case 3: Autoplay Restriction Handling

```typescript
test('autoplay block should dispatch event', async () => {
  const player = new TimedTextPlayer();

  // Mock play() to fail
  const videoA = player._players[0];
  videoA.play = jest.fn().mockRejectedValue(new DOMException('NotAllowedError'));

  const autoplayBlockedHandler = jest.fn();
  player.addEventListener('autoplayblocked', autoplayBlockedHandler);

  await player.play();

  expect(autoplayBlockedHandler).toHaveBeenCalled();
});
```

---

## Priority Recommendations

### Immediate (P0):

1. **Remove 200ms delay** in `_onPlaying` → Replace with immediate check + `_pauseAllExcept()`
2. **Add `_pauseAllExcept()` method** → Call before any `play()` operation
3. **Handle `play()` promises** → Add `.catch()` at minimum for all `play()` calls

### Short-term (P1):

4. **Implement `_transitionToPlayer()` method** → Centralize player transitions
5. **Add state validation** → Periodic check for multiple playing players
6. **Refactor `_seek()` to pause all players** → Not just current player

### Medium-term (P2):

7. **Implement mutex/lock mechanism** → Prevent concurrent state modifications
8. **Add playback operation queue** → Serialize rapid operations
9. **Comprehensive test suite** → Cover all identified scenarios

### Long-term (P3):

10. **Full state machine refactor** → Replace event-driven approach with explicit state management
11. **Add telemetry** → Track and report multi-player incidents
12. **Buffering preload strategy** → Intelligent preloading without conflicts

---

## Conclusion

The double-play bug is caused by **architectural issues** in the event-driven design, not simple logic errors. The 200ms delay in `_onPlaying` is a band-aid that creates more problems than it solves.

**Key Insight**: The web's `HTMLMediaElement` API is inherently asynchronous (buffering, seeking, play/pause), but the current implementation treats it as if it were synchronous. This mismatch creates race conditions.

**Recommended Approach**:

1. **Short-term**: Add defensive `_pauseAllExcept()` calls before every transition
2. **Long-term**: Refactor to explicit state machine with async/await coordination

The improvements proposed are **backward compatible** and can be implemented incrementally, starting with P0 items to immediately reduce the bug frequency.

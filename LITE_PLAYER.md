# Lite Player Documentation

## Overview

`lite-player.ts` is a simplified version of `timedtext-player.ts` that uses a **single static video element** while maintaining support for transcript/remix loading and effects/overlays. It's designed to be fully compatible with media-chrome.

## Key Differences from timedtext-player

### Simplified Architecture

| Feature | timedtext-player | lite-player |
|---------|------------------|-------------|
| Video Elements | Multiple (one per clip) | Single static video |
| Video Source | Dynamic (from transcript) | Static: `https://stream.mux.com/A3VXy02VoUinw01pwyomEO3bHnG4P32xzV7u1j1FSzjNg/high.mp4` |
| Player Coordination | Complex multi-player sync | Simple single-player event handling |
| Video Switching | Runtime switching between players | No switching needed |
| Seek Logic | Multi-player seek coordination | Direct video seek |
| Play/Pause Logic | Coordinate multiple players | Single player control |

### Retained Features

✅ **Transcript/Remix Loading** - Full support via `transcriptSelector` and `parseTranscript()`
✅ **Effects/Overlays** - Rendered over the static video based on timeline
✅ **Timed Text Events** - Dispatches `playhead` events with clip/section data
✅ **Scale System** - Responsive scaling for overlays
✅ **HLS Support** - Via hls.js
✅ **Media-Chrome Compatible** - Full HTMLMediaElement API

### Removed Complexity

❌ Multiple video element management
❌ Player coordination logic (`_playerAtTime`, `_currentPlayer`, etc.)
❌ Multi-player seek synchronization
❌ Complex play/pause state management across players
❌ Player readiness tracking
❌ Inter-player transition logic

## API

### Properties

```typescript
// Video Configuration
@property() poster?: string;
@property() src: string = DEFAULT_VIDEO_SRC;

// Transcript/Remix
@property({ attribute: 'transcript' }) transcriptSelector?: string;
@property({ attribute: 'player' }) playerSelector?: string;
@property({ attribute: 'pause-mutation-observer' }) pauseMutationObserver: string;

// State (Read-only from outside)
@state() time: number;
@state() track: Track | null;
```

### HTMLMediaElement API

All standard HTMLMediaElement properties and methods are supported:

**Properties (getters/setters):**
- `currentTime: number`
- `volume: number`
- `muted: boolean`
- `playbackRate: number`
- `loop: boolean`

**Properties (read-only):**
- `duration: number`
- `paused: boolean`
- `ended: boolean`
- `seeking: boolean`
- `readyState: number`
- `networkState: number`
- `buffered: TimeRanges`
- `seekable: TimeRanges`
- `textTracks: TextTrackList`
- `error: MediaError | null`

**Methods:**
- `play(): Promise<void>`
- `pause(): void`
- `load(): void`

### Custom Methods

```typescript
// Parse transcript from DOM
parseTranscript(): void

// Reload remix at specific time
reloadRemix(time?: number): { track: Track, duration: number } | null

// Get current section from timeline
getCurrentSection(): any

// Get version
getVersion(): string
```

### Events

#### Standard Media Events
All standard HTMLMediaElement events are relayed:
- `play`, `pause`, `playing`, `ended`
- `timeupdate`, `durationchange`, `progress`
- `seeked`, `seeking`
- `volumechange`, `ratechange`
- `loadstart`, `loadedmetadata`, `loadeddata`, `canplay`, `canplaythrough`
- `waiting`, `stalled`, `suspend`, `abort`, `emptied`, `error`

#### Custom Events

**`playhead`** - Fired on time update with timed text information
```typescript
detail: {
  counter: number;        // Event counter
  text: string[];         // Timed text content
  time: number;           // Current time
  offset: number;         // Clip offset
  pseudo: boolean;        // Is pseudo-time event
  pseudoTime?: number;    // Pseudo time value
  transcript: string;     // Transcript selector
  media: string;          // Media URL
  timedText: any;         // Timed text object
  clip: any;              // Current clip
  section: any;           // Current section
}
```

**`cuechange`** - Fired when active caption cue changes
```typescript
detail: {
  cue: VTTCue;           // Active VTT cue
}
```

## Usage

### Basic Usage

```html
<lite-player
  poster="poster.jpg"
  src="https://stream.mux.com/xyz/high.mp4">
</lite-player>
```

### With Transcript/Remix

```html
<article id="transcript">
  <section data-media-src="video1.mp4">
    <p data-t="0,5">First segment</p>
  </section>
  <section data-media-src="video2.mp4">
    <p data-t="0,8">Second segment</p>
  </section>
</article>

<lite-player
  transcript="#transcript"
  poster="poster.jpg">
</lite-player>
```

### With Media-Chrome

```html
<media-controller>
  <lite-player
    slot="media"
    transcript="#transcript"
    poster="poster.jpg">
  </lite-player>

  <media-control-bar>
    <media-play-button></media-play-button>
    <media-mute-button></media-mute-button>
    <media-time-range></media-time-range>
    <media-time-display></media-time-display>
    <media-duration-display></media-duration-display>
    <media-volume-range></media-volume-range>
    <media-fullscreen-button></media-fullscreen-button>
  </media-control-bar>
</media-controller>
```

### With Effects/Overlays

Effects are defined in the transcript structure and automatically rendered over the video:

```html
<template id="text-overlay">
  <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
              opacity: ${fadeIn}; font-size: 48px; color: white;">
    ${cue}
  </div>
</template>

<article id="transcript">
  <section data-media-src="video.mp4">
    <p data-t="0,5" data-effect="#text-overlay">Segment with overlay</p>
  </section>
</article>
```

## How It Works

### Architecture Flow

1. **Initialization**
   - Component connects to DOM
   - Parses transcript if `transcriptSelector` provided
   - Sets up MutationObserver for transcript changes
   - Loads static video source

2. **Timeline Processing**
   - `_dom2otio()` converts transcript DOM to OTIO timeline
   - Calculates total duration from all clips
   - Stores track structure in component state

3. **Playback**
   - Single video plays the static source
   - `_onTimeUpdate()` handler updates component time
   - `_clipAtTime()` finds current clip/section in timeline
   - Effects are calculated and rendered based on current time

4. **Effects Rendering**
   - On each render, checks all clips in timeline
   - For active clip, evaluates all effects
   - Effects within time range are rendered in overlay layer
   - Template interpolation provides progress, fadeIn, cue text, etc.

5. **Event Flow**
   ```
   Video Element → Event Handler → Relay to lite-player → Dispatch Custom Event
   ```

### Overlay System

The overlay system renders effects on top of the video:

1. **Positioning**: Absolute positioning over video container
2. **Z-index**: Overlay layer sits above video
3. **Pointer Events**: Disabled to allow video controls to work
4. **Scaling**: Responsive scaling based on parent container size (1920x1080 base)

### Timeline Synchronization

While the video plays a static source, the component:
- Tracks current time via `timeupdate` events
- Maps video time to timeline position
- Identifies current clip and section
- Renders appropriate effects/overlays
- Dispatches `playhead` events with timeline context

## Media-Chrome Compatibility

Lite-player is **fully compatible** with media-chrome:

✅ **Discovery**: Uses `slot="media"` attribute
✅ **Required Interface**: Implements `play()`, `paused`, event listeners
✅ **HTMLMediaElement API**: Complete property/method implementation
✅ **Event Relaying**: All standard media events relayed
✅ **Property Proxying**: All properties proxy to underlying video element

See `MEDIA_CHROME_COMPATIBILITY.md` for detailed compatibility analysis.

## Build

```bash
# Build TypeScript
npm run build

# Output
dist/lite-player.js (61KB)
```

## Testing Checklist

- [ ] Video loads and plays static source
- [ ] Transcript parsing works correctly
- [ ] Effects/overlays render at correct times
- [ ] Timeline events dispatch with correct data
- [ ] Media-chrome controls work (play, pause, seek, volume)
- [ ] HLS streams work correctly
- [ ] Cue change events fire correctly
- [ ] Scale system responds to container resize
- [ ] MutationObserver updates timeline on transcript changes

## Performance Considerations

### Advantages over timedtext-player

1. **Single Video Element**: No overhead of managing multiple video elements
2. **Simpler State**: No complex player coordination state
3. **Easier Debugging**: Single video element makes debugging straightforward
4. **Better Performance**: No player switching overhead

### Trade-offs

1. **Static Source**: Cannot switch between different video sources dynamically
2. **Timeline Mismatch**: Video timeline doesn't match remix timeline (effects/overlays compensate)

## Use Cases

Perfect for:
- ✅ Overlaying effects on a single video source
- ✅ Timed text annotations over video
- ✅ Video players with dynamic overlay content
- ✅ Media-chrome integration with timeline effects
- ✅ Remix timelines for annotation/overlay purposes only

Not suitable for:
- ❌ Playing multiple video clips in sequence
- ❌ Dynamic video source switching
- ❌ Video editing with source manipulation

## File Size

- **Source**: `src/lite-player.ts` (~20KB)
- **Compiled**: `dist/lite-player.js` (~61KB)
- **Comparison**: Smaller than timedtext-player.js due to removed multi-player logic

## Dependencies

- `lit` - Web components framework
- `hls.js` - HLS streaming support
- `./utils` - Shared utilities (interpolate, dom2otio, findClip, etc.)
- `./interfaces` - TypeScript interfaces (Track, etc.)

## Future Enhancements

Possible improvements:
- [ ] Configurable video source via property
- [ ] Multiple video source support with switching
- [ ] Performance optimization for overlay rendering
- [ ] WebVTT generation from timeline
- [ ] Timeline scrubbing preview
- [ ] Overlay caching for better performance

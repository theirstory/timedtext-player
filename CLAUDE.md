# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TimedText Player is a web component built with LitElement that synchronizes timed text (subtitles/captions) with video playback. It manages multiple video players and handles complex timing scenarios with HLS streaming support.

## Development Commands

### Building

```bash
npm run build              # Compile TypeScript and inject version
npm run build:watch        # Compile with watch mode
npm run clean              # Remove dist directory
npm run bundle             # Create bundled version with Rollup
```

### Testing

```bash
npm test                   # Run tests in both dev and prod modes
npm run test:dev           # Run tests in development mode (verbose errors)
npm run test:watch         # Run tests with watch mode
npm run test:prod          # Run tests in production mode
npm run test:prod:watch    # Run tests in prod mode with watch
```

### Linting & Formatting

```bash
npm run lint               # Run both lit-analyzer and ESLint
npm run lint:eslint        # Lint TypeScript files with ESLint
npm run lint:lit-analyzer  # Type-check lit-html templates
npm run format             # Format files with Prettier
```

### Development Server

```bash
npm run serve              # Start dev server in development mode (http://localhost:8000)
npm run serve:prod         # Start dev server in production mode
```

### Analysis

```bash
npm run analyze            # Generate custom elements manifest
npm run analyze:watch      # Generate manifest with watch mode
npm run checksize          # Bundle and check gzipped size
```

## Architecture

### Core Components

**TimedTextPlayer (`src/timedtext-player.ts`)**

- Main web component (`<timedtext-player>`) extending LitElement
- Manages multiple `<video>` or `<audio>` elements with `data-t` attributes containing time ranges
- Coordinates playback across multiple media elements to create seamless transitions
- Handles seeking, time synchronization, and active element management
- Dispatches custom events for time updates and cue changes

**Clock (`src/Clock.ts`)**

- Frame-rate-based timing system using `requestAnimationFrame`
- Provides consistent callbacks at specified FPS for time updates
- Used to synchronize timed text display with video playback

**Utilities (`src/utils.ts`)**

- `dom2otio()`: Converts DOM structure to OTIO (OpenTimelineIO) format
- `interpolate()`: Template string interpolation with HTML escaping for security
- `findClip()` / `findTimedText()`: Timeline navigation helpers
- VTT generation and token annotation for WebVTT subtitle tracks

**Interfaces (`src/interfaces.ts`)**

- TypeScript definitions for OTIO schema objects (Track, Clip, TimedText, Effect, Gap)
- Follows OpenTimelineIO structure for timeline representation

### Key Concepts

**Time Ranges (`data-t` attribute)**
Media elements are annotated with `data-t="start,end"` attributes representing their position in the virtual timeline. The player calculates pseudo-time offsets to create continuous playback.

**Scale System**
The component uses a complex scale system with memoization to convert between:

- Virtual timeline time (pseudo-time)
- Actual media element time (currentTime)
- DOM structure to OTIO timeline representation

**HLS Support**
Uses hls.js for HTTP Live Streaming support with automatic quality switching.

**Debug Mode**
Enable by:

- Adding `?debug` to URL (changes styles)
- Setting `localStorage.setItem('debug-player', 'true')` for console logs

## Build Process

1. TypeScript compiles `src/**/*.ts` → `dist/**/*.js`
2. `scripts/inject-version.js` replaces `__TIMEDTEXT_PLAYER_VERSION__` placeholder
3. Rollup bundles all dependencies into `dist/timedtext-player.bundled.js`
4. Custom elements manifest is generated to `custom-elements.json`

The project uses ES2021 target and strict TypeScript checking.

## Important Notes

- The tsconfig is very strict (`noImplicitAny`, `noUnusedLocals`, `noImplicitReturns`, etc.)
- Uses Lit 3.0 with decorators (`@customElement`, `@property`, `@state`, `@queryAll`)
- Entry point for bundling is the compiled `dist/timedtext-player.js`
- Uses `lit/static-html.js` for dynamic tag names
- Supports both development and production builds via MODE environment variable

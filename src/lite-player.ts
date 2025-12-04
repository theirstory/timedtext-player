/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { LitElement, css, html } from 'lit';
import Hls from 'hls.js';
import { customElement, state, property, query } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { interpolate, dom2otio, findClip, findTimedText, stripTags, generateBlackVideoURL } from './utils';
import { Track } from './interfaces';

// Create a simple debug function to avoid import issues
const isDebugEnabled = typeof localStorage !== 'undefined' && localStorage.getItem('debug-player') === 'true';
const debug = typeof console !== 'undefined' && isDebugEnabled ? console.log.bind(console, '[lite-player]') : () => {};

// const DEFAULT_VIDEO_SRC = 'https://stream.mux.com/A3VXy02VoUinw01pwyomEO3bHnG4P32xzV7u1j1FSzjNg/high.mp4';

/**
 * Lite Player - A simplified version of timedtext-player that uses a single static video
 * with support for transcript/remix loading and effects/overlays.
 *
 * @fires All standard HTMLMediaElement events (play, pause, timeupdate, etc.)
 * @fires playhead - Custom event with timed text information
 * @fires cuechange - Custom event when active cue changes
 */
@customElement('lite-player')
export class LitePlayer extends LitElement {
  static override styles = css`
    :host {
      display: block;
      position: relative;
    }
    .container {
      position: relative;
      width: 100%;
      height: 100%;
    }
    video {
      width: 100%;
      height: 100%;
    }
    .container > video {
      display: none;
    }
    .active {
      /* outline: 4px solid red; */
      display: block !important;
    }
    .wrapper {
      position: relative;
      display: none;
      /* display: block; */
      color: white;
    }
    .overlay-layer {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
  `;

  @query('video')
  private _video!: HTMLVideoElement;

  // ============================================================================
  // Properties
  // ============================================================================

  @property({ type: String })
  poster: string | undefined;

  @property({ type: String })
  src = ''; // DEFAULT_VIDEO_SRC;

  @state()
  time = 0;

  @state()
  private _duration = 0;

  @state()
  track: Track | null = null;

  @state()
  _currentCue: VTTCue | null = null;

  @state()
  _clip: any = null;

  @state()
  private _isBuffering = false;

  private _trackVideoStates = new Map<
    HTMLVideoElement,
    { readyState: number; networkState: number; canPlay: boolean; canPlayThrough: boolean }
  >();

  // ============================================================================
  // HTMLMediaElement API - Properties
  // ============================================================================

  private _getAllTrackVideos(): HTMLVideoElement[] {
    return Array.from(this.renderRoot.querySelectorAll('div.wrapper video'));
  }

  get currentTime(): number {
    return this._video?.currentTime ?? this.time;
  }

  set currentTime(value: number) {
    if (this._video) {
      this._video.currentTime = value;
    }
    this.time = value;
  }

  get duration(): number {
    return this._video?.duration ?? this._duration;
  }

  get paused(): boolean {
    return this._video?.paused ?? true;
  }

  get ended(): boolean {
    return this._video?.ended ?? false;
  }

  get seeking(): boolean {
    return this._video?.seeking ?? false;
  }

  get volume(): number {
    return this._video?.volume ?? 1;
  }

  set volume(value: number) {
    if (this._video) {
      this._video.volume = value;
    }
  }

  get muted(): boolean {
    return this._video?.muted ?? false;
  }

  set muted(value: boolean) {
    if (this._video) {
      this._video.muted = value;
    }
  }

  get playbackRate(): number {
    return this._video?.playbackRate ?? 1;
  }

  set playbackRate(value: number) {
    if (this._video) {
      this._video.playbackRate = value;
    }
  }

  get loop(): boolean {
    return this._video?.loop ?? false;
  }

  set loop(value: boolean) {
    if (this._video) {
      this._video.loop = value;
    }
  }

  get readyState(): number {
    const trackVideos = this._getAllTrackVideos();
    if (trackVideos.length === 0) return this._video?.readyState ?? 0;
    const states = [this._video?.readyState ?? 0, ...trackVideos.map(v => v.readyState)];
    return Math.min(...states);
  }

  get networkState(): number {
    const trackVideos = this._getAllTrackVideos();
    const states = [this._video?.networkState ?? 0, ...trackVideos.map(v => v.networkState)];
    if (states.includes(2)) return 2; // NETWORK_LOADING
    return Math.max(...states);
  }

  get buffered(): TimeRanges {
    return (
      this._video?.buffered ??
      ({
        length: 0,
        start: () => 0,
        end: () => 0,
      } as TimeRanges)
    );
  }

  get seekable(): TimeRanges {
    return (
      this._video?.seekable ??
      ({
        length: 0,
        start: () => 0,
        end: () => 0,
      } as TimeRanges)
    );
  }

  get textTracks(): TextTrackList {
    return this._video?.textTracks ?? ([] as any as TextTrackList);
  }

  get error(): MediaError | null {
    return this._video?.error ?? null;
  }

  get isBuffering(): boolean {
    return this._isBuffering;
  }

  // ============================================================================
  // HTMLMediaElement API - Methods
  // ============================================================================

  play(): Promise<void> {
    if (!this._video) {
      return Promise.reject(new DOMException('Video element not ready', 'InvalidStateError'));
    }

    // Get all videos involved, including main and track videos
    const trackVideos = this._getAllTrackVideos();
    const allVideos = [this._video, ...trackVideos];

    // If any video is not sufficiently ready, reject
    // readyState of 3 (HAVE_FUTURE_DATA) or 4 (HAVE_ENOUGH_DATA) is considered "ready"
    const notReadyVideo = allVideos.find(video => !video || video.readyState < 3);
    if (notReadyVideo) {
      return Promise.reject(new DOMException('Not all video elements are ready', 'InvalidStateError'));
    }

    return this._video.play();
  }

  pause(): void {
    if (this._video) {
      this._video.pause();
    }
    // pause all wrapped videos
    const activeVideos = this.renderRoot.querySelectorAll('div video');
    activeVideos.forEach(video => (video as HTMLVideoElement).pause());
  }

  load(): void {
    if (this._video) {
      this._video.load();
    }
  }

  // ============================================================================
  // Transcript/Remix Handling
  // ============================================================================

  @property({ type: String, attribute: 'transcript' })
  transcript: string | undefined;

  @property({ type: String, attribute: 'player' })
  playerSelector: string | undefined;

  @property({ type: String, attribute: 'pause-mutation-observer' })
  pauseMutationObserver = 'false';

  private _observer: MutationObserver | undefined = undefined;

  private _dom2otio(sections: NodeListOf<HTMLElement> | undefined, _targetTime = 0) {
    const { track, duration } = dom2otio(sections) ?? {};
    debug('_dom2otio', { duration });

    // Force scale recomputation when DOM structure changes
    this._forceScaleRecompute();

    this.track = track ?? null;
    this._duration = duration ?? 0;

    generateBlackVideoURL(duration ?? 0).then(url => {
      console.log('generateBlackVideoURL', { url, duration });
      this.src = url;
    });

    debug('dispatch durationchange', { track, duration });
    this.dispatchEvent(new CustomEvent('durationchange'));

    return { track, duration };
  }

  public parseTranscript() {
    if (!this.transcript) return;

    const article = document.querySelector(this.transcript) as HTMLElement;
    if (!article) return;

    const sections: NodeListOf<HTMLElement> | undefined = article.querySelectorAll('section[data-media-src]');
    this._dom2otio(sections);
  }

  private _reloadRemix(time = 0) {
    if (!this.transcript) {
      debug('no transcript selector');
      return null;
    }

    debug('remixChange?', time);
    const article = document.querySelector(this.transcript) as HTMLElement;

    if (!article) {
      debug('no article');
      return null;
    }

    const sections: NodeListOf<HTMLElement> | undefined = article.querySelectorAll('section[data-media-src]');
    return this._dom2otio(sections, time);
  }

  public reloadRemix(time = 0) {
    return this._reloadRemix(time);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private callback(mutationList: any, _observer: MutationObserver) {
    if (this.pauseMutationObserver === 'true') return;

    let article;
    let widget;
    let nonwidgets = 0;

    for (const mutation of mutationList) {
      article = mutation.target.closest('article');
      widget = mutation.target.closest('.widget');
      if (!widget) nonwidgets++;
    }

    if (nonwidgets === 0) return;
    if (!article) return;

    const sections: NodeListOf<HTMLElement> | undefined = article.querySelectorAll('section[data-media-src]');
    this._dom2otio(sections);

    article.addEventListener('click', this._transcriptClick.bind(this));
  }

  // ============================================================================
  // Scale System (for overlays)
  // ============================================================================

  private _scale = 1;
  private _scaleCallCount = 0;
  private _scaleUpdateInterval = 60;

  private _forceScaleRecompute() {
    this._scaleCallCount = 0;
  }

  private _getScale() {
    this._scaleCallCount++;

    if (this._scaleCallCount === 1 || this._scaleCallCount % this._scaleUpdateInterval === 0) {
      const parent = this.parentElement as HTMLElement;
      const scaleX = parent.clientWidth / 1920;
      const scaleY = parent.clientHeight / 1080;
      this._scale = Math.min(scaleX, scaleY);
    }

    return this._scale;
  }

  // ============================================================================
  // Timed Text / Effects Logic
  // ============================================================================

  private _clipAtTime(time: number): any {
    if (!this.track) return {};

    const section = this.track.children.find((c, i, arr) => {
      const offset = arr.slice(0, i).reduce((acc, c) => acc + c.source_range.duration, 0);
      const start = c.source_range.start_time;
      const end = c.source_range.start_time + c.source_range.duration;
      const sourceTime = time - offset + start;
      return start <= sourceTime && sourceTime <= end;
    });
    if (!section) return {};

    const offset = this.track.children
      .slice(0, this.track.children.indexOf(section))
      .reduce((acc, c) => acc + c.source_range.duration, 0);
    const sourceTime = time - offset + section.source_range.start_time;

    const clip = findClip(section.children, sourceTime);
    if (!clip) {
      console.log('no clip at time', time, { section });
      return { section, clip: null, timedText: null };
    }

    let timedText = findTimedText(clip?.timed_texts ?? [], sourceTime);

    const altTimedText = findTimedText([...(clip?.timed_texts ?? [])].reverse(), sourceTime);

    if (!timedText && altTimedText) {
      timedText = altTimedText;
    }

    return { section, clip, timedText, offset };
  }

  _section = null;
  _timedText = null;
  _timedTextTime = 0;
  _eventCounter = 0;

  private _dispatchTimedTextEvent(time?: number | undefined) {
    const { section, clip, timedText } = this._clipAtTime(time ?? this.time);
    if (!section || !clip) return;

    const sectionIndex = this.track?.children.indexOf(section);
    const offset = this.track?.children.slice(0, sectionIndex).reduce((acc, c) => acc + c.source_range.duration, 0);

    if (this._clip !== clip) {
      this._clip = clip;
    }

    if (this.time) {
      debug('dispatch playhead');
      this.dispatchEvent(
        new CustomEvent('playhead', {
          bubbles: true,
          detail: {
            counter: this._eventCounter++,
            text: timedText?.texts,
            time: this.time,
            offset,
            pseudo: !!time,
            pseudoTime: time,
            transcript: this.transcript,
            media: section.media_reference.target,
            timedText,
            clip,
            section,
          },
        }),
      );
      this._timedText = timedText;
      this._timedTextTime = time ?? this.time;
    }
  }

  private _transcriptClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target) return;

    let element = target;

    // FIXME use closest as limit to go up and look down
    if (!element.getAttribute('data-t')) {
      element = element.querySelector('[data-t]') as HTMLElement;
    }
    if (!element) {
      element = target.parentElement?.querySelector('[data-t]') as HTMLElement;
    }
    if (!element) {
      element = target.parentElement?.parentElement?.querySelector('[data-t]') as HTMLElement;
    }
    if (!element) {
      element = target.parentElement?.parentElement?.parentElement?.querySelector('[data-t]') as HTMLElement;
    }

    // if (element?.nodeName !== 'SPAN') return;
    if (!element || !element?.getAttribute('data-t')) return;

    // const sectionElement = element.parentElement?.parentElement;
    const sectionElement = element.closest('section'); // this.parents(element, 'section')[0];

    const section = this.track?.children.find(c => c.metadata.element === sectionElement);

    if (!section) return;

    const sectionIndex = this.track?.children.indexOf(section);
    const offset =
      this.track?.children.slice(0, sectionIndex).reduce((acc, c) => acc + c.source_range.duration, 0) ?? 0;

    let start;
    if (element.getAttribute('data-t')) {
      const f = (element.getAttribute('data-t') ?? '0,0').split(',').map(v => parseFloat(v));
      start = f[0];
    } else {
      start = parseFloat(element.getAttribute('data-m') ?? '') / 1e3;
    }

    // seek past start if section start time is word start time
    // TODO randomise that 0.02
    const time =
      start - section.source_range.start_time + offset + (start === section.source_range.start_time ? 0.02 : 0);

    // this.currentPseudoTime = time;
    // this._seek(time, false, '_transcriptClick()');
    this.currentTime = time;
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private _relayEvent(e: Event) {
    debug('relay event', e.type);
    this.dispatchEvent(new CustomEvent(e.type, { bubbles: true, composed: true }));
  }

  private _onPause(e: Event & { target: HTMLVideoElement }) {
    this._relayEvent(e);
    const activeVideos = this.renderRoot.querySelectorAll('div.wrapper video');
    activeVideos.forEach(video => (video as HTMLVideoElement).pause());
  }

  private _onTimeUpdate(e: Event & { target: HTMLVideoElement }) {
    this.time = e.target.currentTime;
    this.dispatchEvent(new CustomEvent('timeupdate', { bubbles: true, composed: true }));
    this._dispatchTimedTextEvent();

    const { clip: currentClip, offset } = this._clipAtTime(this.time);
    const duration = currentClip?.source_range.duration;
    const start = currentClip?.source_range.start_time;
    const end = start + duration;
    const src = currentClip?.media_reference.target;

    const targetTime = this.time - offset + start;

    const video = this.renderRoot.querySelector('div.active video') as HTMLVideoElement;
    console.log('video', { video, src, start, end, time: this.time, offset, targetTime });

    if (!video) return;

    if (Math.abs(video.currentTime - targetTime) > 1) {
      video.currentTime = targetTime;
    }
    if (video.paused && !this.paused) video.play();
    if (!video.paused && this.paused) video.pause();
    // pause all other videos
    const activeVideos = this.renderRoot.querySelectorAll('div.wrapper:not(.active) video');
    activeVideos.forEach(video => (video as HTMLVideoElement).pause());
  }

  private _cueChange(e: Event & { target: HTMLTrackElement }) {
    const track = e.target as HTMLTrackElement;
    const cues = track.track?.activeCues ?? [];

    if (cues.length > 0) {
      if (cues.length > 1) {
        console.warn('multiple cues', cues);
      }
      const cue = cues[0];
      if (this._currentCue !== cue) {
        this._currentCue = cue as VTTCue;
        debug('dispatch cuechange', cue);
        this.dispatchEvent(
          new CustomEvent('cuechange', {
            detail: { cue },
          }),
        );
      }
    } else {
      this._currentCue = null;
    }
  }

  // ============================================================================
  // Track Video Event Handlers (Aggregate State)
  // ============================================================================

  private _allVideosCanPlay(): boolean {
    const trackVideos = this._getAllTrackVideos();
    if (trackVideos.length === 0) return (this._video?.readyState ?? 0) >= 3; // HAVE_FUTURE_DATA
    const mainReady = (this._video?.readyState ?? 0) >= 3;
    const allTrackReady = trackVideos.every(v => v.readyState >= 3);
    return mainReady && allTrackReady;
  }

  private _allVideosCanPlayThrough(): boolean {
    const trackVideos = this._getAllTrackVideos();
    if (trackVideos.length === 0) return (this._video?.readyState ?? 0) >= 4; // HAVE_ENOUGH_DATA
    const mainReady = (this._video?.readyState ?? 0) >= 4;
    const allTrackReady = trackVideos.every(v => v.readyState >= 4);
    return mainReady && allTrackReady;
  }

  private _onTrackVideoWaiting(_e: Event & { target: HTMLVideoElement }) {
    this._isBuffering = true;
    this.dispatchEvent(new CustomEvent('waiting', { bubbles: true, composed: true }));
  }

  private _onTrackVideoCanPlay(e: Event & { target: HTMLVideoElement }) {
    this._trackVideoStates.set(e.target, {
      readyState: e.target.readyState,
      networkState: e.target.networkState,
      canPlay: true,
      canPlayThrough: e.target.readyState >= 4,
    });

    if (this._allVideosCanPlay()) {
      this._isBuffering = false;
      this.dispatchEvent(new CustomEvent('canplay', { bubbles: true, composed: true }));
    }
  }

  private _onTrackVideoCanPlayThrough(e: Event & { target: HTMLVideoElement }) {
    const state = this._trackVideoStates.get(e.target);
    if (state) {
      state.canPlayThrough = true;
      state.readyState = e.target.readyState;
    } else {
      this._trackVideoStates.set(e.target, {
        readyState: e.target.readyState,
        networkState: e.target.networkState,
        canPlay: e.target.readyState >= 3,
        canPlayThrough: true,
      });
    }

    if (this._allVideosCanPlayThrough()) {
      this._isBuffering = false;
      this.dispatchEvent(new CustomEvent('canplaythrough', { bubbles: true, composed: true }));
    }
  }

  private _onTrackVideoStalled(_e: Event & { target: HTMLVideoElement }) {
    this._isBuffering = true;
    this.dispatchEvent(new CustomEvent('stalled', { bubbles: true, composed: true }));
  }

  private _onTrackVideoSuspend(_e: Event & { target: HTMLVideoElement }) {
    this.dispatchEvent(new CustomEvent('suspend', { bubbles: true, composed: true }));
  }

  private _onTrackVideoProgress(_e: Event & { target: HTMLVideoElement }) {
    this.dispatchEvent(new CustomEvent('progress', { bubbles: true, composed: true }));
  }

  // ============================================================================
  // HLS Support
  // ============================================================================

  private _hls() {
    const video = this._video;
    if (!video) return;

    debug('video src?', video.src);
    if (Hls.isSupported() && (video.src.endsWith('.m3u8') || video.src.startsWith('data:'))) {
      const hls = new Hls();
      hls.on(Hls.Events.ERROR, function (event, data) {
        console.error('HLS error', event, data);
      });
      hls.loadSource(video.src);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS support
    }
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  override connectedCallback(): void {
    super.connectedCallback();

    if (!this.transcript) return;

    const article = document.querySelector(this.transcript) as HTMLElement;
    if (!article) return;

    // Set up mutation observer
    this._observer = new MutationObserver(this.callback.bind(this));
    this._observer.observe(article, { attributes: true, childList: true, subtree: true });

    // Parse transcript
    const sections: NodeListOf<HTMLElement> | undefined = article.querySelectorAll('section[data-media-src]');
    this._dom2otio(sections);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();

    // Clean up observer
    if (this._observer) {
      this._observer.disconnect();
      this._observer = undefined;
    }
  }

  // ============================================================================
  // Rendering
  // ============================================================================

  override render() {
    setTimeout(() => this._hls(), 10);

    // Calculate overlays if we have track data
    const overlays = this.track
      ? this.track.children.flatMap((clip, i) => {
          const arr = this.track?.children ?? [];
          const offset = arr.slice(0, i).reduce((acc, c) => acc + c.source_range.duration, 0);
          const duration = clip.source_range.duration;

          // Check if this clip is active
          const active = offset <= this.time && this.time < offset + duration;
          if (!active) return [];

          // Render effects for this clip
          return clip.effects.flatMap(effect => {
            const id = `${clip.metadata.id}-${effect.metadata.id}`;
            const start = effect.source_range.start_time - clip.source_range.start_time + offset;
            const end = start + effect.source_range.duration;

            if (start <= this.time && this.time < end) {
              const fadeIn = this.time - start <= 2 ? (this.time - start) / 2 : 1;
              const progress = (this.time - start) / effect.source_range.duration;
              const template = document.createElement('template');
              template.innerHTML = interpolate(
                (document.querySelector<HTMLTemplateElement>(effect.metadata.data.effect)?.innerHTML ?? '').trim(),
                {
                  progress,
                  fadeIn,
                  ...effect.metadata?.data,
                  cue: stripTags(this._currentCue?.text ?? ''),
                  width: '1920px',
                  height: '1080px',
                  scale: this._getScale().toFixed(3),
                },
              );
              return { id, children: template.content.childNodes as NodeListOf<HTMLElement> };
            }
            return null;
          });
        })
      : [];

    // Extract unique sources from track clips
    const sources = this.track ? [...new Set(this.track.children.map(clip => clip.media_reference.target))] : [];

    return html`
      <div class="container">
        <video
          .src=${this.src}
          .poster=${this.poster ?? ''}
          @timeupdate=${this._onTimeUpdate}
          @play=${this._relayEvent}
          @pause=${this._onPause}
          @playing=${this._relayEvent}
          @ended=${this._relayEvent}
          @seeked=${this._relayEvent}
          @seeking=${this._relayEvent}
          @canplay=${this._relayEvent}
          @canplaythrough=${this._relayEvent}
          @durationchange=${this._relayEvent}
          @loadedmetadata=${this._relayEvent}
          @loadeddata=${this._relayEvent}
          @loadstart=${this._relayEvent}
          @waiting=${this._relayEvent}
          @volumechange=${this._relayEvent}
          @ratechange=${this._relayEvent}
          @progress=${this._relayEvent}
          @abort=${this._relayEvent}
          @emptied=${this._relayEvent}
          @stalled=${this._relayEvent}
          @suspend=${this._relayEvent}
          @error=${this._relayEvent}
        >
          <track kind="captions" srclang="en" src="" @cuechange=${this._cueChange} />
        </video>

        ${repeat(
          sources,
          src => src,
          src => {
            const { clip: currentClip, section } = this._clipAtTime(this.time);
            const active = currentClip?.media_reference.target === src || section?.media_reference.target === src;

            return html`<div class=${active ? 'active wrapper' : 'wrapper'} style="width: 100%; height: 100%;">
              <video
                preload="auto"
                src=${src}
                @waiting=${this._onTrackVideoWaiting}
                @canplay=${this._onTrackVideoCanPlay}
                @canplaythrough=${this._onTrackVideoCanPlayThrough}
                @stalled=${this._onTrackVideoStalled}
                @suspend=${this._onTrackVideoSuspend}
                @progress=${this._onTrackVideoProgress}
              ></video>
            </div>`;
          },
        )}
        ${overlays.length > 0
          ? html`
              <div class="overlay-layer">
                ${repeat(
                  overlays,
                  overlay => overlay?.id,
                  overlay => html`${overlay?.children}`,
                )}
              </div>
            `
          : ''}
      </div>
    `;
  }

  /**
   * Returns the version of the timedtext-player package.
   */
  public getVersion(): string {
    return '__TIMEDTEXT_PLAYER_VERSION__';
  }

  getCurrentSection() {
    return this._clipAtTime(this.time).section;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'lite-player': LitePlayer;
  }
}

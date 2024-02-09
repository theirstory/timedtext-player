/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {LitElement, css} from 'lit';
import {html, unsafeStatic} from 'lit/static-html.js';
import {customElement, state, property, queryAll} from 'lit/decorators.js';
import {finder} from '@medv/finder';

import {interpolate} from './utils';
import {Clip, Gap, Metadata, TimedText, TimeRange, Track} from './interfaces';

@customElement('timedtext-player')
export class TimedTextPlayer extends LitElement {
  static override styles = css`
    :host {
      display: block;
    }
    .active {
      outline: 4px solid red;
      /* display: block; */
    }
    video {
      margin: 10px;
      /* display: none; */
    }
  `;

  @state()
  time = 0;

  set currentTime(time: number) {
    this._seek(time);
  }

  get currentTime() {
    return this.time;
  }

  get seeking() {
    const players = Array.from(this._players);
    return players.some((p) => p.seeking);
  }

  @state()
  playing = false;

  get paused() {
    return !this.playing;
  }

  public play() {
    const player = this._currentPlayer();
    if (!player) return;
    player.play();
  }

  public pause() {
    const player = this._currentPlayer();
    if (!player) return;
    player.pause();
  }

  @state()
  _duration = 0;

  get duration() {
    return this._duration;
  }

  _muted = false;

  set muted(muted: boolean) {
    this._players.forEach((p) => p.muted = muted);
  }

  get muted() {
    return this._muted;
  }

  _volume = 1;

  get volume() {
    return this._volume;
  }

  set volume(volume: number) {
    this._players.forEach((p) => p.volume = volume);
  }

  @property({type: Object}) // TODO make it state
  track: Track | null = null;

  @queryAll('*[data-t]') // TODO make it work with all players?
  _players!: NodeListOf<HTMLMediaElement>;

  _playersReady: HTMLMediaElement[] = [];

  private isPlayerReady(player: HTMLMediaElement) {
    return this._playersReady.includes(player);
  }

  _playersEventsCounter: Map<HTMLMediaElement, Record<string, number>> = new Map();

  get playersEventsCounter() {
    return Array.from(this._playersEventsCounter.entries()).map(([player, eventsCounter]) => {
      return {player, eventsCounter};
    });
  }

  private _dom2otio(sections: NodeListOf<HTMLElement> | undefined) {
    if (!sections) return;

    this.track = {
      OTIO_SCHEMA: 'Track.1',
      name: 'Transcript',
      kind: 'Video',
      children: Array.from(sections).map((s): Clip => {
        const src = s.getAttribute('data-media-src');
        const [start, end] = (s.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));

        return {
          OTIO_SCHEMA: 'Clip.1',
          source_range: {
            start_time: start,
            duration: end - start
          },
          media_reference: {
            OTIO_SCHEMA: 'MediaReference.1',
            target: src,
          },
          metadata: {
            element: s,
            selector: finder(s, {root: s.parentElement}),
          },
          children: Array.from(s.children).map((c): Clip | Gap => {
            const [start, end] = (c.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));

            return {
              OTIO_SCHEMA: 'Clip.1',
              source_range: {
                start_time: start,
                duration: end - start
              },
              media_reference: {
                OTIO_SCHEMA: 'MediaReference.1',
                target: src,
              },
              metadata: {
                element: c,
                transcript: c.textContent,
                selector: finder(c, {root: s.parentElement}),
              },
              timed_texts: Array.from(c.children).map((t) => {
                const [start, end] = (t.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));
                return {
                  OTIO_SCHEMA: 'TimedText.1',
                  marked_range: {
                    start_time: start,
                    duration: end - start
                  },
                  texts: t.textContent ?? '',
                  style_ids: [],
                  metadata: {
                    element: t,
                    selector: finder(t, {root: s.parentElement}),
                  },
                } as unknown as TimedText;
              }),
            } as unknown as Clip;
          }).reduce((acc, c, i, arr) => {
            if (i === 0 || i === arr.length - 1) return [...acc, c];
            const prev = arr[i - 1];
            if (c.source_range.start_time === prev.source_range.start_time + prev.source_range.duration) return [...acc, c];
            const gap = { // TODO TBD if this is gap or speechless clip?
              OTIO_SCHEMA: 'Gap.1',
              source_range: {
                start_time: prev.source_range.start_time + prev.source_range.duration,
                duration: c.source_range.start_time - (prev.source_range.start_time + prev.source_range.duration)
              },
              media_reference: {
                OTIO_SCHEMA: 'MediaReference.1',
                target: src,
              }
            } as unknown as Gap;
            return [...acc, gap, c];
          }, [] as Clip[] | Gap[]),
        } as unknown as Clip;
      }),
      markers: [],
      metadata: {},
    } as Track;

    console.log({track: this.track});

    this._duration = this.track.children.reduce((acc, c) => acc + c.source_range.duration, 0);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private callback(mutationList: any, _observer: MutationObserver) {
    let article;
    for (const mutation of mutationList) {
      if (mutation.type === "childList") {
        console.log("A child node has been added or removed.");
        article = mutation.target;
      } else if (mutation.type === "attributes") {
        console.log(`The ${mutation.attributeName} attribute was modified.`);
      }
    }

    console.log({mutationList, _observer, article: article});
    if (!article) return;
    const sections: NodeListOf<HTMLElement> | undefined = article.querySelectorAll('section[data-media-src]');
    console.log({sections});
    this._dom2otio(sections);
  }

  _observer: MutationObserver | undefined = undefined;


  // TODO transcriptSelector property

  @property({type: String, attribute: 'player'})
  playerTemplateSelector = '';

  override render() {
    return html`
      ${this.track ? this.track.children.map((clip, i, arr) => {
        const offset = arr.slice(0, i).reduce((acc, c) => acc + c.source_range.duration, 0);
        const duration = clip.source_range.duration;

        const template = document.createElement('template');
        template.innerHTML = interpolate((document.querySelector<HTMLTemplateElement>(this.playerTemplateSelector)?.innerHTML ?? '').trim(), { src: clip.media_reference.target });
        const node = template.content.childNodes[0] as HTMLElement;
        const tag = node.nodeName.toLowerCase();
        const attrs = Array.from(node.attributes).map((attr) => `${(attr.name)}=${attr.value !== '' ? attr.value : '""' }`);
        // console.log({a: Array.from(node.attributes), attrs})

        // TODO add node children
        return html`<${unsafeStatic(tag)} ${unsafeStatic(attrs.join(' '))}
            data-t=${`${clip.source_range.start_time},${clip.source_range.start_time + duration}`}
            data-offset=${offset}
            class=${offset <= this.time && this.time < offset + duration ? 'active' : ''}

            @timeupdate=${this._onTimeUpdate}
            @canplay=${this._onCanPlay}
            @play=${this._onPlay}
            @pause=${this._onPause}
            @loadedmetadata=${this._onLoadedMetadata}

            @abort=${this._relayEvent}
            @canplaythrough=${this._relayEvent}
            @durationchange=${this._relayEvent}
            @emptied=${this._relayEvent}
            @ended=${this._relayEvent}
            @loadeddata=${this._relayEvent}
            @loadstart=${this._relayEvent}
            @playing=${this._relayEvent}
            @progress=${this._relayEvent}
            @ratechange=${this._relayEvent}
            @seeked=${this._onSeeked}
            @seeking=${this._relayEvent}
            @suspend=${this._relayEvent}
            @waiting=${this._relayEvent}
            @error=${this._relayEvent}
            @volumechange=${this._relayEvent}
          ></${unsafeStatic(tag)}>`;
      }) : null}
      <div style="height: 40px"></div>
      <!-- <slot name="transcript" @slotchange=${this.handleSlotchange} @click=${this.handleSlotClick}></slot> -->
    `;
  }

  private _countEvent(e: Event & {target: HTMLAudioElement | HTMLVideoElement}) {
    if (this._playersEventsCounter.has(e.target as HTMLMediaElement)) {
      const eventsCounter = this._playersEventsCounter.get(e.target as HTMLMediaElement) ?? {};
      const counter = eventsCounter[e.type] ?? 0;
      this._playersEventsCounter.set(e.target as HTMLMediaElement, {...eventsCounter, [e.type]: counter + 1});
    } else {
      this._playersEventsCounter.set(e.target as HTMLMediaElement, {[e.type]: 1});
    }
  }

  private _relayEvent(e: Event & {target: HTMLAudioElement | HTMLVideoElement}) {
    this._countEvent(e);
    console.log(e.type);
    // this.dispatchEvent(new CustomEvent(e.type));
  }

  private _ready() {
    // this.dispatchEvent(new CustomEvent('ready'));
    console.log('ready');
    const url = new URL(window.location.href);
    const t = url.searchParams.get('t');
    console.log({t});
    if (t) {
      const time = parseFloat(t.split(',')[0] ?? '0');
      setTimeout(() => {
        this._seek(time);
        setTimeout(() => this._playerAtTime(time)?.play(), 1000);
      }, 1000);
    }
  }

  private _onLoadedMetadata(e: Event & {target: HTMLAudioElement | HTMLVideoElement}) {
    this._countEvent(e);
    // this.dispatchEvent(new CustomEvent(e.type));

    if (this._playersReady.includes(e.target as HTMLMediaElement)) return;
    this._playersReady.push(e.target as HTMLMediaElement);

    // if all players are ready
    if (this._playersReady.length === this._players.length) {
      this._ready();
    }
  }

  private _onSeeked(e: Event & {target: HTMLAudioElement | HTMLVideoElement}) {
    this._countEvent(e);
    const {target: player} = e;
    const [start, end] = (player.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));
    const offset = parseFloat(player.getAttribute('data-offset') ?? '0');

    if (start <= player.currentTime && player.currentTime <= end) {
      if (this.playing && player.paused && player.currentTime - start + offset === this.time) player.play();
    }
  }

  override connectedCallback() {
    super.connectedCallback();
    const article = document.getElementById('transcript');
    console.log({article});

    if (!article) return;
    this._observer = new MutationObserver(this.callback.bind(this));
    this._observer.observe(article, { attributes: true, childList: true, subtree: true });

    const sections: NodeListOf<HTMLElement> | undefined = article.querySelectorAll('section[data-media-src]');
    console.log({sections});
    this._dom2otio(sections);

    article.addEventListener('click', this._transcriptClick.bind(this));
  }

  private _transcriptClick(e: MouseEvent) {
    const element = e.target as HTMLElement;
    if (!element || element?.nodeName !== 'SPAN') return;

    console.log({element});

    const sectionElement = element.parentElement?.parentElement; // this.parents(element, 'section')[0];

    console.log({sectionElement});

    const section = this.track?.children.find((c) => c.metadata.element === sectionElement);

    console.log({section});
    if (!section) return;

    const sectionIndex = this.track?.children.indexOf(section);
    const offset = this.track?.children.slice(0, sectionIndex).reduce((acc, c) => acc + c.source_range.duration, 0) ?? 0;

    console.log({sectionIndex, offset});

    const [start, end] = (element.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));
    const time = start - section.source_range.start_time + offset;

    console.log(time)

    this._seek(time);
  }

  private _playerAtTime(time: number): HTMLMediaElement | undefined {
    const players = Array.from(this._players);
    return players.find((p) => {
      const [start, end] = (p.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));
      const offset = parseFloat(p.getAttribute('data-offset') ?? '0');
      return start <= time - offset + start && time - offset + start <= end;
    });
  }

  private _currentPlayer(): HTMLMediaElement | undefined {
    return this._playerAtTime(this.time);
  }

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

    const offset = this.track.children.slice(0, this.track.children.indexOf(section)).reduce((acc, c) => acc + c.source_range.duration, 0);
    const sourceTime = time - offset + section.source_range.start_time;

    const clip = section.children.find((c) => {
      const start = c.source_range.start_time;
      const end = c.source_range.start_time + c.source_range.duration;
      return start <= sourceTime && sourceTime <= end;
    });
    if (!clip) return {section, clip: null, timedText: null};

    let timedText = clip.timed_texts?.find((t) => { // find in range
      const start = t.marked_range.start_time;
      const end = t.marked_range.start_time + t.marked_range.duration;
      return start <= sourceTime && sourceTime <= end;
    })

    const altTimedText = clip.timed_texts?.find((t) => { // find in gap before
      const start = t.marked_range.start_time;
      return sourceTime < start;
    }) ?? [...(clip?.timed_texts ?? [])].reverse().find((t) => { // find in gap after
      const start = t.marked_range.start_time;
      return start <= sourceTime;
    });

    if (!timedText && altTimedText) {
      console.log({time, offset, sourceTime, altTimedText});
      timedText = altTimedText;
    }

    return {section, clip, timedText};
  }

  _section = null;
  _clip = null;
  _timedText = null;
  private _dispatchTimedTextEvent() {
    const {section, clip, timedText} = this._clipAtTime(this.time);
    if (!section || !clip) return;

    const sectionIndex = this.track?.children.indexOf(section);
    const offset = this.track?.children.slice(0, sectionIndex).reduce((acc, c) => acc + c.source_range.duration, 0);

    // if (this._section !== section) {
    //   this.dispatchEvent(new CustomEvent('playhead', {detail: {section, offset}}));
    //   this._section = section;
    // }
    // if (this._clip !== clip) {
    //   this.dispatchEvent(new CustomEvent('playhead', {detail: {clip, section, offset}}));
    //   this._clip = clip;
    // }
    if (this._timedText !== timedText) {
      this.dispatchEvent(new CustomEvent('playhead', {detail: {timedText, clip, section, offset}}));
      this._timedText = timedText;
    }
  }


  private _seek(time: number) {
    const player = this._playerAtTime(time);
    console.log({time, player});
    if (!player) return;

    const currentPlayer = this._currentPlayer();

    const [start] = (player.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));
    const offset = parseFloat(player.getAttribute('data-offset') ?? '0');

    const playing = !!this.playing;
    if (playing && currentPlayer && currentPlayer !== player) currentPlayer.pause();
    player.currentTime = time - offset + start;
    if (playing && currentPlayer && currentPlayer !== player) this.playing = true;
  }


  _triggerTimeUpdateTimeout = 0;
  private _triggerTimeUpdate() {
    clearTimeout(this._triggerTimeUpdateTimeout);
    if (this.seeking) return;

    const player = this._currentPlayer();
    if (!player) return;

    player.dispatchEvent(new Event('timeupdate'));
    if (this.playing) this._triggerTimeUpdateTimeout = setTimeout(() => requestAnimationFrame(this._triggerTimeUpdate.bind(this)), 1000 / 15); // TODO better 15fps?
  }

  private _onTimeUpdate(e: Event & {target: HTMLAudioElement | HTMLVideoElement}) {
    this._countEvent(e);
    if (this.playing && this.seeking) return;

    const {target: player} = e;
    const [start, end] = (player.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));
    const offset = parseFloat(player.getAttribute('data-offset') ?? '0');

    const players = Array.from(this._players);
    const i = players.indexOf(player as HTMLVideoElement);
    const nextPlayer = i <= players.length - 1 ? players[i + 1] : null;

    if (player.currentTime < start) {
      player.currentTime = start;
      player.pause();
    } else if (start <= player.currentTime && player.currentTime <= end) {
      // if (this.playing && player.paused && player.currentTime - start + offset === this.time) player.play();
      if (player.currentTime !== start) this.time = player.currentTime - start + offset; // FIXME: that "if" to avoid 1st seek time update
      if (nextPlayer) {
        const [start3] = (nextPlayer.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));
        if (nextPlayer.currentTime !== start3) nextPlayer.currentTime = start3;
      }
      this.dispatchEvent(new CustomEvent('timeupdate'));
      this._dispatchTimedTextEvent();
    } else if (end < player.currentTime) {
      player.pause();
      if (nextPlayer) nextPlayer.play();
    }
  }

  private _onCanPlay(e: Event & {target: HTMLAudioElement | HTMLVideoElement}) {
    this._countEvent(e);
    const {target: player} = e;

    if (player.currentTime > 0) return;
    const [start] = (player.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));

    player.currentTime = start;
  }

  private _onPlay(e: Event & {target: HTMLAudioElement | HTMLVideoElement}) {
    this._countEvent(e);
    const {target: player} = e;
    const [start, end] = (player.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));

    if (start <= player.currentTime && player.currentTime <= end) {
      this.playing = true;
      this.dispatchEvent(new CustomEvent('play'));
    }

    this._triggerTimeUpdate();
  }

  private _onPause(e: Event & {target: HTMLAudioElement | HTMLVideoElement}) {
    this._countEvent(e);
    if (this.seeking) return;

    const {target: player} = e;
    const [start, end] = (player.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));

    if (start <= player.currentTime && player.currentTime <= end) {
      this.playing = false;
      this.dispatchEvent(new CustomEvent('pause'));
    }
  }

  private handleSlotClick(e: MouseEvent & {target: HTMLElement}) {
    if (e.target.nodeName !== 'SPAN') return;
    // const [start, end] = (e.target.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));
  }

  private handleSlotchange(e: Event & {target: HTMLSlotElement}) {
    console.log('SLOT CHANGE');
    const childNodes = e.target.assignedNodes({flatten: true});

    const article = childNodes.find((n) => n.nodeName === 'ARTICLE') as HTMLElement | undefined;
    if (!article) return;

    this._observer = new MutationObserver(this.callback.bind(this));
    this._observer.observe(article, { attributes: true, childList: true, subtree: true });

    const sections: NodeListOf<HTMLElement> | undefined = article?.querySelectorAll('section[data-media-src]') ;
    this._dom2otio(sections);
  }



  // protected override createRenderRoot() {
  //   return this;
  // }
}

declare global {
  interface HTMLElementTagNameMap {
    'timedtext-player': TimedTextPlayer;
  }
}


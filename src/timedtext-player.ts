/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {LitElement, css} from 'lit';
import {html, unsafeStatic} from 'lit/static-html.js';
import {customElement, state, property, queryAll} from 'lit/decorators.js';
import {repeat} from 'lit/directives/repeat.js';

import {interpolate, dom2otio} from './utils';
import {Track} from './interfaces';


@customElement('timedtext-player')
export class TimedTextPlayer extends LitElement {
  static override styles = document.location.href.indexOf('debug') > 0 ? css`
    :host {
      display: block;
    }
    .active {
      outline: 4px solid red;
      /* display: block !important; */
    }
    *[data-t] {
      margin: 10px;
    }
    .wrapper {
      position: relative;
      display: inline-block;
      /* display: none; */
      color: white;
    }
    video::cue {
      /* margin-bottom: 40px !important; */
      color: green !important;
    }
    video::cue(.yellow) {
      color: yellow;
    }
    ::cue:past {
      color: white;
    }
    ::cue:future {
      color: grey;
    }
  ` : css`
  :host {
      display: block;
    }
    .active {
      /* outline: 4px solid red; */
      display: block !important;
    }
    .wrapper {
      position: relative;
      /* display: inline-block; */
      display: none;
      color: white;
    }
    video::cue {
      text-wrap: balance;
    }
  `;

  @property({type: Number})
  width: number | undefined;

  @property({type: Number})
  height: number | undefined;

  @property({type: String})
  poster: string | undefined;


  @state()
  time = 0;

  set currentTime(time: number) {
    console.log({setCurrentTime: time});
    this._seek(time);
    // cancel end
    this._end = this._duration;
  }

  get currentTime() {
    return this.time;
  }

  set currentPseudoTime(time: number) {
    this._dispatchTimedTextEvent(time);
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
    let player = this._currentPlayer();
    console.log({player}, this.currentTime, this.duration);
    if (!player) return;

    if (this.duration - this.currentTime < 0.4) { // FIXME
      this._seek(0);
      player = this._playerAtTime(0);
      player!.play();
    } else {
      player!.play();
    }
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
    this._muted = muted;
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

  @state()
  track: Track | null = null;

  @queryAll('*[data-t]') // TODO make it work with all players?
  _players!: NodeListOf<HTMLMediaElement>;

  _playersReady: HTMLMediaElement[] = [];

  // private isPlayerReady(player: HTMLMediaElement) {
  //   return this._playersReady.includes(player);
  // }


  // textTracks: TextTrack[] = [];

  _playersEventsCounter: Map<HTMLMediaElement, Record<string, number>> = new Map();

  get playersEventsCounter() {
    return Array.from(this._playersEventsCounter.entries()).map(([player, eventsCounter]) => {
      return {player, eventsCounter};
    });
  }

  private _getEventsCounter(player: HTMLMediaElement) {
    return this._playersEventsCounter.get(player);
  }



  private _dom2otio(sections: NodeListOf<HTMLElement> | undefined) {
    const {track, duration} = dom2otio(sections) ?? {};
    if (!track || !duration) return;

    this.track = track;
    this._duration = duration;
    this.dispatchEvent(new CustomEvent('durationchange'));
    setTimeout(() => this._seek(0.1, true), 800); // FIXME MUX issue?
  }

  @property({type: String, attribute: 'pause-mutation-observer'})
  pauseMutationObserver = "false";

  public parseTranscript() {
    const article = document.querySelector(this.transcriptTemplateSelector) as HTMLElement;

    console.log({article});

    if (!article) return;
    const sections: NodeListOf<HTMLElement> | undefined = article.querySelectorAll('section[data-media-src]');
    console.log({sections});
    this._dom2otio(sections);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private callback(mutationList: any, _observer: MutationObserver) {
    if (this.pauseMutationObserver === "true") return; // FIXME property should be boolean but in react I get string

    let article;
    for (const mutation of mutationList) {
      article = mutation.target.closest('article');
      if (mutation.type === "childList") {
        console.log("A child node has been added or removed.");
        // article = mutation.target;
      } else if (mutation.type === "attributes") {
        console.log(`The ${mutation.attributeName} attribute was modified.`);
        // article = mutation.target.closest('article')
      }
    }

    console.log({mutationList, _observer, article: article});
    if (!article) return;
    const sections: NodeListOf<HTMLElement> | undefined = article.querySelectorAll('section[data-media-src]');
    console.log({sections});
    if (!sections || sections.length === 0) return;
    this._dom2otio(sections);
  }

  _observer: MutationObserver | undefined = undefined;


  // TODO transcriptSelector property

  @property({type: String, attribute: 'player'})
  playerTemplateSelector = '';


  @property({type: String, attribute: 'transcript'})
  transcriptTemplateSelector = 'article'; // TODO article has section data-t?

  override render() {
    let overlay;
    // if (this._clip && (this._clip as Clip).metadata.data.effect) {
    //   const clip = this._clip as Clip;
    //   const template = document.createElement('template');
    //   template.innerHTML = interpolate((document.querySelector<HTMLTemplateElement>(clip.metadata.data.effect)?.innerHTML ?? '').trim(), { src: clip.media_reference.target, ...clip.metadata?.data });
    //   overlay = template.content.childNodes as NodeListOf<HTMLElement>;

    // }
    // console.log({overlay, clip: this._clip});


    let size = this.width ? `width: ${this.width}px !important;` : '';
    size += this.height ? `height: ${this.height}px !important;` : '';
    return html`<div style="${size}">
      ${this.track && this.track.children.length > 0 ?
      repeat(this.track.children, (clip) => clip.metadata.id, (clip, i) => {
      // this.track.children.map((clip, i, arr) => {
        const arr = this.track?.children ?? [];
        const offset = arr.slice(0, i).reduce((acc, c) => acc + c.source_range.duration, 0);
        const duration = clip.source_range.duration;

        const template = document.createElement('template');
        template.innerHTML = interpolate((document.querySelector<HTMLTemplateElement>(clip.metadata.playerTemplateSelector ?? this.playerTemplateSelector)?.innerHTML ?? '').trim(), {
          src: clip.media_reference.target,
          captions: clip.metadata.captionsUrl,
          ...clip.metadata?.data,
          width: this.width ?? 'auto',
          height: this.height ?? 'auto',
        });
        const node = template.content.childNodes[0] as HTMLElement;
        const tag = node.nodeName.toLowerCase();
        const attrs = Array.from(node.attributes).map((attr) => `${(attr.name)}=${attr.value !== '' ? attr.value : '""' }`);
        const siblings = Array.from(template.content.childNodes).slice(1);

        const overlays = clip.effects.flatMap((effect) => {
          const start = effect.source_range.start_time - clip.source_range.start_time + offset;
          const end = start + effect.source_range.duration;
          // console.log({start, end, time: this.time});
          if (start <= this.time && this.time < end) {
            const progress = (this.time - start) / effect.source_range.duration;
            const template = document.createElement('template');
            template.innerHTML = interpolate((document.querySelector<HTMLTemplateElement>(effect.metadata.data.effect)?.innerHTML ?? '').trim(), {progress, ...effect.metadata?.data});
            return template.content.childNodes as NodeListOf<HTMLElement>;
          }
          return null;
        });

        return html`<div class=${offset <= this.time && this.time < offset + duration ? 'active wrapper' : 'wrapper'} style="${size}"><${unsafeStatic(tag)} ${unsafeStatic(attrs.join(' '))}
            data-t=${`${clip.source_range.start_time},${clip.source_range.start_time + duration}`}
            data-offset=${offset}
            _class=${offset <= this.time && this.time < offset + duration ? 'active' : ''}
            style="${size}"
            poster="${this.poster ?? ''}"

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
            >
              <track default kind="captions" srclang="en" src="${clip.metadata.captionsUrl}" />
              ${node.children}
            </${unsafeStatic(tag)}>
            ${siblings}
            <!-- overlays -->
            ${overlays}
          </div>`;
      }) : html`<video style="${size}" poster="${this.poster ?? ''}"></video>`}
      ${overlay}
      </div>
      <div style="height: 40px"></div>
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
    // TODO whitelist what events to relay
    // this.dispatchEvent(new CustomEvent(e.type));
  }

  _start = 0;
  _end = 0;

  private _ready() {
    // this.dispatchEvent(new CustomEvent('ready'));
    console.log('ready');
    const url = new URL(window.location.href);
    const t = url.searchParams.get('t');

    console.log({t});

    if (t) {
      const [start, end] = t.split(',').map(v => parseFloat(v));

      this._start = start;
      this._end = end;

      console.log({_start: this._start, _end: this._end});

      setTimeout(() => {
        this._seek(start);
        setTimeout(() => this._playerAtTime(start)?.play(), 1000);
      }, 1000);
    } else {
      this._end = this._duration;
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
    // const article = document.getElementById('transcript');
    const article = document.querySelector(this.transcriptTemplateSelector) as HTMLElement;

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

    // const sectionElement = element.parentElement?.parentElement;
    const sectionElement =  element.closest('section'); // this.parents(element, 'section')[0];

    // console.log({sectionElement});

    const section = this.track?.children.find((c) => c.metadata.element === sectionElement);

    console.log({section});
    if (!section) return;

    const sectionIndex = this.track?.children.indexOf(section);
    const offset = this.track?.children.slice(0, sectionIndex).reduce((acc, c) => acc + c.source_range.duration, 0) ?? 0;

    console.log({sectionIndex, offset});

    let start;
    if (element.getAttribute('data-t')) {
      const f = (element.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));
      start = f[0];
    } else {
      start = parseFloat(element.getAttribute('data-m') ?? '') / 1e3;
    }

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
      return start <= sourceTime && sourceTime < end;
    });
    if (!clip) return {section, clip: null, timedText: null};

    let timedText = clip.timed_texts?.find((t) => { // find in range
      const start = t.marked_range.start_time;
      const end = t.marked_range.start_time + t.marked_range.duration;
      return start <= sourceTime && sourceTime < end; // FIXME off by one, use < end
    })

    // const altTimedText = clip.timed_texts?.find((t) => { // find in gap before
    //   const start = t.marked_range.start_time;
    //   return sourceTime < start;
    // }) ?? [...(clip?.timed_texts ?? [])].reverse().find((t) => { // find in gap after
    //   const start = t.marked_range.start_time;
    //   return start <= sourceTime;
    // });

    const altTimedText = [...(clip?.timed_texts ?? [])].reverse().find((t) => { // find in gap after
      const start = t.marked_range.start_time;
      return start <= sourceTime;
    });



    if (!timedText && altTimedText) {
      // console.log({time, offset, sourceTime, altTimedText});
      timedText = altTimedText;
    }

    return {section, clip, timedText};
  }

  _section = null;
  @state()
  _clip = null;
  _timedText = null;
  _timedTextTime = 0;
  _eventCounter = 0;
  private _dispatchTimedTextEvent(time?: number | undefined) {
    const {section, clip, timedText} = this._clipAtTime(time ?? this.time);
    if (!section || !clip) return;

    const sectionIndex = this.track?.children.indexOf(section);
    const offset = this.track?.children.slice(0, sectionIndex).reduce((acc, c) => acc + c.source_range.duration, 0);

    // if (this._section !== section) {
    //   this.dispatchEvent(new CustomEvent('playhead', {detail: {section, offset}}));
    //   this._section = section;
    // }
    if (this._clip !== clip) {
      // this.dispatchEvent(new CustomEvent('playhead', {detail: {clip, section, offset}}));
      this._clip = clip;
    }
    // if (this._timedText !== timedText) {
    if (this._timedTextTime !== time && this.time) {
        this.dispatchEvent(new CustomEvent('playhead', {
        bubbles: true,
        detail: {
          counter: this._eventCounter++,
          text: timedText?.texts,
          time: this.time,
          offset,
          pseudo: !!time,
          pseudoTime: time,
          transcript: this.transcriptTemplateSelector,
          media: section.media_reference.target,
          timedText,
          clip,
          section,
        }
      }));
      this._timedText = timedText;
      this._timedTextTime = time ?? this.time;
    } else {
      console.log('same timed text', time ?? this.time);
    }
    // TODO emit also source href, such that source pane can be activated and have sync karaoke?
  }


  private _seek(time: number, emitTimeUpdate = false) {
    const player = this._playerAtTime(time);
    console.log('_seek', {time, player});
    if (!player) return;

    const currentPlayer = this._currentPlayer();

    const [start] = (player.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));
    const offset = parseFloat(player.getAttribute('data-offset') ?? '0');

    const playing = !!this.playing;
    if (playing && currentPlayer && currentPlayer !== player) currentPlayer.pause();
    // player.currentTime = time - offset + start;
    this._seekMediaElement(player, time - offset + start, '_seek');
    if (playing && currentPlayer && currentPlayer !== player) this.playing = true;

    // if (emitTimeUpdate) { // FIXME
    //   console.log('events fired');
    //   this.dispatchEvent(new CustomEvent('progress'));
    //   this.dispatchEvent(new CustomEvent('timeupdate'));
    //   this.dispatchEvent(new CustomEvent('durationchange'));
    //   // this.time = time;
    // }
  }


  _triggerTimeUpdateTimeout = 0;
  private _triggerTimeUpdate() {
    clearTimeout(this._triggerTimeUpdateTimeout);
    if (this.seeking) return;

    const player = this._currentPlayer();
    if (!player) return;

    player.dispatchEvent(new Event('timeupdate'));
    if (this.playing) this._triggerTimeUpdateTimeout = setTimeout(() => requestAnimationFrame(this._triggerTimeUpdate.bind(this)), 1000 / 15); // TODO use Clock
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

    // test for end from media fragment URI
    if (this._end !== this._duration && this.time >= this._end) player.pause();

    if (player.currentTime < start) {
      // player.currentTime = start;
      // this._seekMediaElement(player, start, '_onTimeUpdate < start');
      player.pause();
    } else if (start <= player.currentTime && player.currentTime <= end) {
      // if (this.playing && player.paused && player.currentTime - start + offset === this.time) player.play();
      if (player.currentTime !== start) this.time = player.currentTime - start + offset; // FIXME: that "if" to avoid 1st seek time update
      // this.time = player.currentTime - start + offset;
      if (nextPlayer) {
        const [start3] = (nextPlayer.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));
        if (nextPlayer.currentTime !== start3) {
          // nextPlayer.currentTime = start3;
          this._seekMediaElement(nextPlayer, start3, 'nextPlayer');
        }
      }
      this.dispatchEvent(new CustomEvent('timeupdate'));
      this._dispatchTimedTextEvent();
    } else if (end <= player.currentTime) {
      player.pause();
      // TEST simulate overlap on clips
      // setTimeout(() => {
      //   player.pause();
      // }, 5000);
      if (nextPlayer) nextPlayer.play();
    }
  }

  private _seekMediaElement(element: HTMLAudioElement | HTMLVideoElement, time: number, label: string) {
    console.log(`seeking ${label} to ${time}`, element);
    element.currentTime = time;
  }

  private _onCanPlay(e: Event & {target: HTMLAudioElement | HTMLVideoElement}) {
    this._countEvent(e);
    const {target: player} = e;

    // if (player.currentTime > 0) return;
    if ((this._getEventsCounter(player)?.canplay ?? -1) > 1) return;
    const [start] = (player.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));

    // player.currentTime = start;
    this._seekMediaElement(player, start, '_onCanPlay');
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


  private _isLastPlayer(player: HTMLAudioElement | HTMLVideoElement) {
    const players = Array.from(this._players);
    return players.indexOf(player) === players.length - 1;
  }

  private _onPause(e: Event & {target: HTMLAudioElement | HTMLVideoElement}) {
    this._countEvent(e);
    if (this.seeking) return;

    const {target: player} = e;
    const [start, end] = (player.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));

    if (this._isLastPlayer(player)) {
      this.playing = false;
      this.dispatchEvent(new CustomEvent('pause'));
      this.dispatchEvent(new CustomEvent('ended'));
      return;
    }

    if (start <= player.currentTime && player.currentTime <= end) {
      this.playing = false;
      this.dispatchEvent(new CustomEvent('pause'));
    }
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




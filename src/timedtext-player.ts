/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {LitElement, css} from 'lit';
import {html, unsafeStatic} from 'lit/static-html.js';
import {customElement, state, property, queryAll} from 'lit/decorators.js';

import {finder} from '@medv/finder';

import {interpolate} from './utils';
import {Clip, Gap, TimedText, Track, Effect} from './interfaces';


// class TextTrack {
//   constructor(players: NodeListOf<HTMLMediaElement>) {
//     this._players = players;
//   }

//   _players: NodeListOf<HTMLMediaElement>;

//   _mode = 'showing' as TextTrackMode;

//   get mode(): TextTrackMode {
//     return this._mode;
//   }

//   set mode(mode: TextTrackMode) {
//     console.log(`setting mode to ${mode}`, this._players);
//     this._mode = mode;
//     this._players.forEach((p) => {
//       const track = p.textTracks[0];
//       if (track) track.mode = mode;
//     });
//   }
// }

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
    video {
      /* width: 640px; */
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
    *[data-t] {
      /* margin: 10px; */
    }
    .wrapper {
      position: relative;
      /* display: inline-block; */
      display: none;
      color: white;
    }
    video {
      /* width: 320px; */
    }
    video::cue {
      /* padding-bottom: 40px !important; */
      /* color: red !important; */
    }
  `;

  @property({type: Number})
  width: number | undefined;

  @property({type: Number})
  height: number | undefined;


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

  // const sections: NodeListOf<HTMLElement> | undefined = article.querySelectorAll('section[data-media-src]');
  private _dom2otio(sections: NodeListOf<HTMLElement> | undefined) {
    if (!sections) return;

    this.track = {
      OTIO_SCHEMA: 'Track.1',
      name: 'Transcript',
      kind: 'Video',
      children: Array.from(sections).map((s): Clip => {
        const src = s.getAttribute('data-media-src');
        const [start, end] = (s.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));

        const children: NodeListOf<HTMLElement> | undefined = s.querySelectorAll('p[data-t]:not(*[data-effect]), div[data-t]:not(*[data-effect])');
        const effects: NodeListOf<HTMLElement> | undefined = s.querySelectorAll('div[data-t][data-effect]');

        return {
          OTIO_SCHEMA: 'Clip.1', // TODO: verify with OTIO spec, should be Composable?
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
            selector: finder(s, {root: s.parentElement as HTMLElement}),
            playerTemplateSelector: s.getAttribute('data-player'),
            data: s.getAttributeNames().filter(n => n.startsWith('data-')).reduce((acc, n) => ({...acc, [n.replace('data-', '').replace('-', '_')]: s.getAttribute(n)}), {}),
          },
          children: Array.from(children).map((c): Clip | Gap => {
            const [start, end] = (c.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));
            const children: NodeListOf<HTMLElement> | undefined = c.querySelectorAll('*[data-t],*[data-m]');
            const segmenter = new (Intl as any).Segmenter('en', { granularity: 'sentence' }); // TODO language detection? from page?
            // const text = c.textContent ?? ''; // TBD this has a lot of whitespace and might have non timed text?
            const text = Array.from(children).map((t) => t.textContent).join(' '); // TBD this is the timed text only
            const sentences = [...segmenter.segment(text)[Symbol.iterator]()].map(({index, segment: text}) => ({index, text}));

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
                selector: finder(c, {root: s.parentElement as HTMLElement}),
                data: c.getAttributeNames().filter(n => n.startsWith('data-')).reduce((acc, n) => ({...acc, [n.replace('data-', '').replace('-', '_')]: c.getAttribute(n)}), {}),
                text,
                sentences,
              },
              timed_texts: Array.from(children).map((t, i, arr) => {
                let start, end;
                if (t.getAttribute('data-t')) {
                  const f = (t.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));
                  start = f[0];
                  end = f[1];
                } else {
                  start = parseFloat(t.getAttribute('data-m') ?? '') / 1e3;
                  end = start + parseFloat(t.getAttribute('data-d') ?? '') / 1e3;
                }

                const prefix = arr.slice(0, i).map((t) => t.textContent ?? '').join(' ') + (i > 0 ? ' ' : '');
                const textOffset = prefix.length;
                const text = (t.textContent ?? '');
                const sentence = Array.from(sentences).reverse().find(({index}) => textOffset >= index);
                const sos = sentence?.index === textOffset;
                const eos = sentence?.index + sentence?.text.trim().length === textOffset + text.length;
                const punct = !!text.trim().charAt(text.length - 1).match(/\p{P}/gu);

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
                    selector: finder(t, {root: s.parentElement as HTMLElement}),
                    textOffset,
                    sos,
                    eos,
                    length: text.length,
                    punct,
                    // ruby: `<ruby>${text}<rt>${eos ? 'eos ' : ''}${sos ? 'sos ' : ''}${punct ? 'punct ' : ''}</rt></ruby>`,
                    ruby: `<ruby>${text}</ruby>`, // FIXME
                  },
                } as unknown as TimedText;
              }),
              effects: [],
            } as unknown as Clip;
          }) //
          .map((p) => {
            const tt = (p as Clip).timed_texts ?? [];

            tt.forEach((t, i, arr) => {
              if (i === 0) return;
              const prev = arr[i - 1];
              if (t.metadata.sos) prev.metadata.eos = true;
            });

            tt.forEach((t, i, arr) => {
              if (i === 0) {
                t.metadata.lastBreak = 0;
                t.metadata.captionGroup = `c${p.source_range.start_time}-${t.metadata.lastBreak}`;
                return;
              }

              t.metadata.lastBreak = arr[i - 1].metadata.lastBreak;
              t.metadata.captionGroup = `c${p.source_range.start_time}-${t.metadata.lastBreak}`;

              if (t.metadata.textOffset + t.metadata.length - t.metadata.lastBreak >= 37 * 2 || i === arr.length - 1) {
                const candidates = arr.slice(i - 5 < 0 ? 0 : i - 5, i);

                // find previous punctuation
                let item =
                  candidates.reverse().find(({metadata: { eos }}) => eos) ?? candidates.find(({metadata: { punct }}) => punct) ?? t;
                item.metadata.pilcrow0 = true;

                //  avoid widows
                if (i < tt.length - 5) {
                  // look ahead 2 items for punctuation
                  item = tt.slice(i, i + 3).find(({metadata: { punct }}) => punct) ?? t;
                  item.metadata.pilcrow2 = true;
                } else if (i >= tt.length - 5) {
                  // we have few items left, use first candidates (eos, punct)
                  item = tt.slice(i).find(({metadata: { eos }}) => eos) ?? candidates.find(({metadata: { punct }}) => punct) ?? t;
                  item.metadata.pilcrow3 = true;
                }

                t.metadata.pilcrow = true;
                t.metadata.lastBreak = t.metadata.textOffset + t.metadata.length + 1;
                // item.metadata.lastBreak = item.metadata.textOffset + item.metadata.length + 1;
              }
            });

            return p;
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
          effects: Array.from(effects).map((effect): Effect => {
            return {
              name: effect.getAttribute('data-effect') ?? '',
              metadata: {
                element: effect,
                selector: finder(effect, {root: s.parentElement as HTMLElement}),
                data: effect.getAttributeNames().filter(n => n.startsWith('data-')).reduce((acc, n) => ({...acc, [n.replace('data-', '').replace('-', '_')]: effect.getAttribute(n)}), {}),
              },
              source_range: {
                start_time: parseFloat(effect.getAttribute('data-t')?.split(',')[0] ?? '0'),
                duration: parseFloat(effect.getAttribute('data-t')?.split(',')[1] ?? '0') - parseFloat(effect.getAttribute('data-t')?.split(',')[0] ?? '0'),
              }
            } as unknown as Effect;
          })
        } as unknown as Clip;
      }).map((segment) => {
        segment.metadata.captions = this.getCaptions(segment);
        segment.metadata.captionsUrl = URL.createObjectURL(new Blob([segment.metadata.captions], { type: "text/vtt" }))
        return segment;
      }),
      markers: [],
      metadata: {},
      effects: [],
    } as Track;

    console.log({track: this.track});



    this._duration = this.track.children.reduce((acc, c) => acc + c.source_range.duration, 0);
    // this.textTracks = [new TextTrack(this._players)]
  }

  private getCaptions(segment: Clip): string {
    const clips = segment.children;
    const timedTexts = clips.flatMap((c) => c.timed_texts ?? []);
    const grouped = timedTexts.reduce((acc, obj) => {
      // Initialize the sub-array for the group if it doesn't exist
      if (!acc[obj.metadata.captionGroup]) {
          acc[obj.metadata.captionGroup] = [];
      }
      // Append the object to the correct group
      acc[obj.metadata.captionGroup].push(obj);
      return acc;
    }, {} as Record<string, TimedText[]>);

    const captions = Object.values(grouped);
    console.log({captions});

    const captions2 = captions.reduce((acc, g) => {
      const p = g.findIndex(t => t.metadata.pilcrow);
      const p0 = g.findIndex(t => t.metadata.pilcrow0);

      if (p0 < p) {
        const tail = g.slice(p0 + 1);
        tail[tail.length - 1].metadata.glue = true;
        tail[tail.length - 1].metadata.pilcrow = false;
        tail[tail.length - 1].metadata.pilcrow4 = true;
        return [...acc, g.slice(0, p0 + 1), tail];
      }
      // default
      return [...acc, g];
    }, [] as TimedText[][]);

    const captions3 = captions2.reduce((acc, g, i) => {
      if (i === 0) return [...acc, g];
      const prev = acc.pop();

      if (prev && prev[prev.length - 1]?.metadata?.glue) {
        return [...acc, [...prev, ...g]];
      }

      // default
      return [...acc, prev, g];
    }, [] as (TimedText[] | undefined)[]);

    console.log({captions2, captions3});

    const formatSeconds = (seconds: number): string => seconds ? new Date(parseFloat(seconds.toFixed(3)) * 1000).toISOString().substring(11, 23) : '00:00:00:000';

    let vttOut = ['WEBVTT',
    '',
    'Kind: captions',
    'Language: en-US', // TODO lift language from transcript?
    '',
    ''].join('\n');

    (captions3 as any).forEach((tt: TimedText[], i: number) => {
      const first = tt[0];
      const last = tt[tt.length - 1];
      // let text = tt.map(t => t.texts)
      const text = tt.map((t) => t.metadata.ruby
        // + (t.metadata.pilcrow ? '<c.yellow>¶</c>' : '')
        // + (t.metadata.pilcrow0 ? '<c.yellow>◊</c>' : '')
        // + (t.metadata.pilcrow2 ? '<c.yellow>†</c>' : '')
        // + (t.metadata.pilcrow3 ? '<c.yellow>‡</c>' : '')
        // + (t.metadata.pilcrow4 ? '<c.yellow>⌑</c>' : '')
        + `<${formatSeconds(t.marked_range.start_time)}>`).join(' ');
      // const text = tt.map((t) => `<${formatSeconds(t.marked_range.start_time)}>` + '<c>' + t.texts + '</c>' + (t.metadata.pilcrow ? '<c.yellow>¶</c>' : '') + (t.metadata.pilcrow2 ? '<c.yellow>*</c>' : '')).join(' ');
      const id = `${i}`;
      vttOut += `${id}\n${formatSeconds(first?.marked_range?.start_time)} --> ${formatSeconds(last?.marked_range?.start_time + last?.marked_range?.duration)}\n${text}\n\n`;
    });

    return vttOut;
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


    return html`<div style="width: 100%; height: 100%">
      ${this.track && this.track.children.length > 0 ? this.track.children.map((clip, i, arr) => {
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

        // if (overlays?.length ?? 0 > 0)
        // console.log({overlays});

        return html`<div class=${offset <= this.time && this.time < offset + duration ? 'active wrapper' : 'wrapper'} style="width: 100%; height: 100%"><${unsafeStatic(tag)} ${unsafeStatic(attrs.join(' '))}
            data-t=${`${clip.source_range.start_time},${clip.source_range.start_time + duration}`}
            data-offset=${offset}
            _class=${offset <= this.time && this.time < offset + duration ? 'active' : ''}
            style="width: 100%; height: 100%"

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
      }) : html`<video style="width: 100%; height: 100%" poster="https://placehold.co/620x400?text=no+signal"></video>`}
      ${overlay}
      </div>
      <!-- <div style="height: 40px"></div> -->
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
    if (this._timedTextTime !== time ?? this.time) {
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


  private _seek(time: number) {
    const player = this._playerAtTime(time);
    console.log('_seek', {time, player});
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
      // TEST simulate overlap on clips
      // setTimeout(() => {
      //   player.pause();
      // }, 5000);
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



// TODO move
// const groupBy = <T>(array: Array<T>, property: (x: T) => string): { [key: string]: Array<T> } =>
//   array.reduce((memo: { [key: string]: Array<T> }, x: T) => {
//     if (!memo[property(x)]) {
//       memo[property(x)] = [];
//     }
//     memo[property(x)].push(x);
//     return memo;
//   }, {});



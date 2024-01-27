/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {LitElement, css} from 'lit';
import {html, unsafeStatic} from 'lit/static-html.js';
import {customElement, state, property, queryAll} from 'lit/decorators.js';

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

  @property({type: Object})
  track: Track | null = null;

  @queryAll('*[data-t]')
  _players!: NodeListOf<HTMLMediaElement>;

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
              },
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

            @abort=${this._relayEvent}
            @canplaythrough=${this._relayEvent}
            @durationchange=${this._relayEvent}
            @emptied=${this._relayEvent}
            @ended=${this._relayEvent}
            @loadeddata=${this._relayEvent}
            @loadedmetadata=${this._relayEvent}
            @loadstart=${this._relayEvent}
            @playing=${this._relayEvent}
            @progress=${this._relayEvent}
            @ratechange=${this._relayEvent}
            @seeked=${this._relayEvent}
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

  private _relayEvent(e: Event & {target: HTMLAudioElement | HTMLVideoElement}) {
    // this.dispatchEvent(new CustomEvent(e.type));
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

  }

  private _playerAtTime(time: number): HTMLMediaElement | undefined {
    const players = Array.from(this._players);
    return players.find((p) => {
      const [start, end] = (p.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));
      const offset = parseFloat(p.getAttribute('data-offset') ?? '0');
      return start <= time - offset && time - offset <= end;
    });
  }

  private _currentPlayer(): HTMLMediaElement | undefined {
    return this._playerAtTime(this.time);
  }

  private _seek(time: number) {
    const player = this._playerAtTime(time);
    if (!player) return;

    const [start] = (player.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));
    const offset = parseFloat(player.getAttribute('data-offset') ?? '0');

    player.currentTime = time - offset + start;
  }

  private _onTimeUpdate(e: Event & {target: HTMLAudioElement | HTMLVideoElement}) {
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
      if (player.currentTime !== start) this.time = player.currentTime - start + offset;
      if (nextPlayer) {
        const [start3] = (nextPlayer.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));
        if (nextPlayer.currentTime !== start3) nextPlayer.currentTime = start3;
      }
      this.dispatchEvent(new CustomEvent('timeupdate'));
    } else if (end < player.currentTime) {
      player.pause();
      if (nextPlayer) nextPlayer.play();
    }
  }

  private _onCanPlay(e: Event & {target: HTMLAudioElement | HTMLVideoElement}) {
    const {target: player} = e;

    if (player.currentTime > 0) return;
    const [start] = (player.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));

    player.currentTime = start;
  }

  private _onPlay(e: Event & {target: HTMLAudioElement | HTMLVideoElement}) {
    const {target: player} = e;
    const [start, end] = (player.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));

    if (start <= player.currentTime && player.currentTime <= end) {
      this.playing = true;
      this.dispatchEvent(new CustomEvent('play'));
    }
  }

  private _onPause(e: Event & {target: HTMLAudioElement | HTMLVideoElement}) {
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

  // protected parents(el: HTMLElement | null, selector: string) {
  //   const parents = [];
  //   while ((el = el?.parentNode as HTMLElement) && el.ownerDocument !== document) {
  //     if (!selector || el.matches(selector)) parents.push(el);
  //   }
  //   return parents;
  // }

  // protected override createRenderRoot() {
  //   return this;
  // }
}

declare global {
  interface HTMLElementTagNameMap {
    'timedtext-player': TimedTextPlayer;
  }
}


//// TODO move to utils:

function interpolate(str:string, params: {[key: string]: any}) {
  let names = Object.keys(params);
  let vals = Object.values(params);
  return new Function(...names, `return \`${str}\`;`)(...vals);
}

//// TODO move to types:

interface Metadata {
  [key: string]: any;
}

// interface RationalTime {
//   OTIO_SCHEMA: string;
//   rate: number;
//   value: number;
// }

interface TimeRange {
  OTIO_SCHEMA: string;
  // duration: RationalTime | Number;
  // start_time: RationalTime | Number;
  duration: number;
  start_time: number;
}

interface Clip {
  OTIO_SCHEMA: string;
  markers: any[]; // Replace 'any' with a more specific type if markers have a defined structure
  media_reference: any | null; // Replace 'any' with a specific type if media references have a defined structure
  metadata: Metadata;
  name: string;
  source_range: TimeRange;
}

interface Gap { // TODO: verify with OTIO spec
  OTIO_SCHEMA: string;
  markers: any[]; // Replace 'any' with a more specific type if markers have a defined structure
  media_reference: any | null; // Replace 'any' with a specific type if media references have a defined structure
  metadata: Metadata;
  name: string;
  source_range: TimeRange;
}

interface Track {
  OTIO_SCHEMA: string;
  // children: (Clip | Transition)[]; // Assuming Transition is another interface you have defined
  children: Clip[]; // Assuming Transition is another interface you have defined
  kind: string;
  markers: any[]; // Replace 'any' with a more specific type if markers have a defined structure
  metadata: Metadata;
  name: string;
  // source_range: TimeRange | null;
}


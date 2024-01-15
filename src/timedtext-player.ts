/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {LitElement, html, css} from 'lit';
import {customElement, property, query, queryAll} from 'lit/decorators.js';
import {queryAssignedElements} from 'lit/decorators/query-assigned-elements.js';
// import { createSilentAudio } from 'create-silent-audio';

@customElement('timedtext-player')
export class TimedTextPlayer extends LitElement {
  static override styles = css`
    :host {
      display: block;
    }
  `;

  @property({type: Number})
  time = 0;

  @property({type: Boolean})
  playing = false;

  @property({type: Number})
  duration = 0;

  @property({type: Object})
  track: Track | null = null;

  @queryAll('video[data-t]')
  _players!: NodeListOf<HTMLVideoElement>;

  @queryAssignedElements({slot: 'transcript', selector: 'article'})
  _article!: NodeListOf<HTMLElement>;

  // @queryAssignedElements()
  // unnamedSlotEls!: Array<HTMLElement>;

  @query('audio')
  _reference!: HTMLAudioElement;


  override render() {
    // ${sections.map(s => html`<video controls src=${s.getAttribute('data-media-src') ?? ''} @timeupdate=${this._onTimeUpdate}></video>`)}
    const silence = "https://s3-eu-west-1.amazonaws.com/files.hyperaud.io/tmp/3600-silence.wav"; // createSilentAudio(this.duration, 44100);

    return html`
      <audio controls src=${silence} @timeupdate=${this._onTimeUpdate} @play=${this._onPlay} @pause=${this._onPause} style="width: 100%"></audio>
      <p>Time: ${this.time}</p>
      <hr />
      ${this.track ? this.track.children.map((clip, i, arr) => {
        const offset = arr.slice(0, i).reduce((acc, c) => acc + c.source_range.duration, 0);
        const duration = clip.source_range.duration;
        return html`<video controls data-t=${`${clip.source_range.start_time},${clip.source_range.start_time + duration}`} data-t2=${`${offset},${offset + duration}`} src=${clip.media_reference.target}></video>`;
      }) : null}
      <hr />
      <slot name="transcript" @slotchange=${this.handleSlotchange} @click=${this.handleSlotClick}></slot>
    `;
  }

  private _onTimeUpdate() {
    this.time = this._reference.currentTime;
    this._syncPlayers();
  }

  private _onPlay() {
    this.playing = true;
    this._syncPlayers();
  }

  private _onPause() {
    this.playing = false;
    this._syncPlayers();
  }

  private _syncPlayers() {
    this._players.forEach((player) => {
      const [start] = (player.getAttribute('data-t') ?? '0,0' ).split(',').map(v => parseFloat(v));
      const [start2, end2] = (player.getAttribute('data-t2') ?? '0,0' ).split(',').map(v => parseFloat(v));
      if (start2 <= this.time && this.time <= end2) {
        if (this.time - start2 + start - player.currentTime > 0.3) player.currentTime = this.time - start2 + start;
        if (this.playing) {
          player.play();
        } else player.pause();
      } else player.pause();
    });
  }

  private handleSlotClick(e: MouseEvent & {target: HTMLElement}) {
    console.log({e, s: window.getSelection()});
  }

  private handleSlotchange(e: Event & {target: HTMLSlotElement}) {
    const childNodes = e.target.assignedNodes({flatten: true});
    const article = childNodes.find((n) => n.nodeName === 'ARTICLE') as HTMLElement | undefined;
    const sections: NodeListOf<HTMLElement> | undefined = article?.querySelectorAll('section[data-media-src]') ;
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
          }
        } as unknown as Clip;
      }),
      markers: [],
      metadata: {},
    } as Track;

    console.log({track: this.track});

    this.duration = this.track.children.reduce((acc, c) => acc + c.source_range.duration, 0);
    console.log({duration: this.duration});

  // EOF
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


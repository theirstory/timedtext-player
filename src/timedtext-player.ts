import {LitElement, html, css} from 'lit';
import {customElement, property, query, queryAll} from 'lit/decorators.js';
import {queryAssignedElements} from 'lit/decorators/query-assigned-elements.js';

@customElement('timedtext-player')
export class TimedTextPlayer extends LitElement {
  static override styles = css`
    :host {
      display: block;
    }
  `;

  @property({type: Number})
  time = 0;

  @queryAll('section[data-media]')
  _sections!: NodeListOf<HTMLElement>;

  @queryAssignedElements({slot: 'transcript', selector: 'article'})
  _article!: NodeListOf<HTMLElement>;

  // @queryAssignedElements()
  // unnamedSlotEls!: Array<HTMLElement>;

  @query('video')
  _video!: HTMLVideoElement;

  @property({type: Number})
  _updated!: Number;

  override render() {
    let sections: HTMLElement[] = [];
    Array.from(this._article).forEach((article) => {
        sections = Array.from(article.querySelectorAll('section[data-media]'));
    });

    return html`
      ${sections.map(s => html`<video controls src=${s.getAttribute('data-media') ?? ''} @timeupdate=${this._onTimeUpdate}></video>`)}
      <p>Time: ${this.time}</p>
      <slot name="transcript" @slotchange=${this.handleSlotchange} @click=${this.handleSlotClick}></slot>
    `;
  }

  private _onTimeUpdate() {
    // TODO: track time update per player
    this.time = this._video.currentTime;
  }

  private handleSlotClick(e: MouseEvent & {target: HTMLElement}) {
    console.log({e, s: window.getSelection()});
    const target = e.target;
    const data = JSON.parse(target.getAttribute('data-words') ?? '[]');
    const offset = window.getSelection()?.focusOffset ?? 0;
    // find word at offset
    const word = data.find((w: any) => w.offset >= offset - 13); // FIXME: hardcoded 13
    console.log({word, offset});
    if (word) {
      this._video.currentTime = word.start;
    }
  }

  private handleSlotchange(e: Event & {target: HTMLSlotElement}) {
    const childNodes = e.target.assignedNodes({flatten: true});
    console.log({childNodes});
    this._updated = Date.now(); 
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

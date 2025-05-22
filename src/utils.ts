/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prefer-const */
import { finder } from '@medv/finder';

import { Clip, TimedText, Track, Gap, Effect } from './interfaces';

import { annotateTokens, generateVTT, type Token, type TokenMetadata } from 'timedtext-vtt';

function escapeHTML(str: string): string {
  const escapeChars: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.toString().replace(/[&<>"']/g, char => escapeChars[char]);
}

export function interpolate(str: string, params: { [key: string]: any }) {
  let names = Object.keys(params);
  let vals = Object.values(params);
  return new Function(...names, `return \`${str}\`;`)(...vals.map(escapeHTML));
}

export function getTimeRange(element: HTMLElement): number[] {
  return (element.getAttribute('data-t') ?? '0,0').split(',').map(v => parseFloat(v));
}

export function getOffset(element: HTMLElement): number {
  return parseFloat(element.getAttribute('data-offset') ?? '0');
}

export function getCaptions(segment: Clip): string {
  const clips = segment.children;
  const timedTexts = clips.flatMap(c => c.timed_texts ?? []);
  console.log({ clips, timedTexts });

  const tokens: Token[] = timedTexts.map(
    ({ texts: text, marked_range: { start_time, duration } }) =>
      ({
        text: text ?? '',
        start: start_time,
        duration,
        metadata: {} as TokenMetadata,
      } as Token),
  );

  console.log({ tokens });

  const annotatedTokens = annotateTokens(tokens);
  const vttOut = generateVTT([annotatedTokens], true);

  // const grouped = timedTexts.reduce((acc, obj) => {
  //   // Initialize the sub-array for the group if it doesn't exist
  //   if (!acc[obj.metadata.captionGroup]) {
  //     acc[obj.metadata.captionGroup] = [];
  //   }
  //   // Append the object to the correct group
  //   acc[obj.metadata.captionGroup].push(obj);
  //   return acc;
  // }, {} as Record<string, TimedText[]>);

  // const captions = Object.values(grouped);
  // console.log({ captions });

  // const captions2 = captions.reduce((acc, g) => {
  //   const p = g.findIndex(t => t.metadata.pilcrow);
  //   const p0 = g.findIndex(t => t.metadata.pilcrow0);

  //   if (p0 < p) {
  //     const tail = g.slice(p0 + 1);
  //     tail[tail.length - 1].metadata.glue = true;
  //     tail[tail.length - 1].metadata.pilcrow = false;
  //     tail[tail.length - 1].metadata.pilcrow4 = true;
  //     return [...acc, g.slice(0, p0 + 1), tail];
  //   }
  //   // default
  //   return [...acc, g];
  // }, [] as TimedText[][]);

  // const captions3 = captions2.reduce((acc, g, i) => {
  //   if (i === 0) return [...acc, g];
  //   const prev = acc.pop();

  //   if (prev && prev[prev.length - 1]?.metadata?.glue) {
  //     return [...acc, [...prev, ...g]];
  //   }

  //   // default
  //   return [...acc, prev, g];
  // }, [] as (TimedText[] | undefined)[]);

  // console.log({ captions2, captions3 });

  // const formatSeconds = (seconds: number): string =>
  //   seconds ? new Date(parseFloat(seconds.toFixed(3)) * 1000).toISOString().substring(11, 23) : '00:00:00:000';

  // let vttOut = [
  //   'WEBVTT',
  //   '',
  //   'Kind: captions',
  //   'Language: en-US', // TODO lift language from transcript?
  //   '',
  //   '',
  // ].join('\n');

  // (captions3 as any).forEach((tt: TimedText[], i: number) => {
  //   const first = tt[0];
  //   const last = tt[tt.length - 1];
  //   // let text = tt.map(t => t.texts)
  //   const text = tt
  //     .map(
  //       t => `<${formatSeconds(t.marked_range.start_time)}>` + t.metadata.ruby,
  //       // + (t.metadata.pilcrow ? '<c.yellow>¶</c>' : '')
  //       // + (t.metadata.pilcrow0 ? '<c.yellow>◊</c>' : '')
  //       // + (t.metadata.pilcrow2 ? '<c.yellow>†</c>' : '')
  //       // + (t.metadata.pilcrow3 ? '<c.yellow>‡</c>' : '')
  //       // + (t.metadata.pilcrow4 ? '<c.yellow>⌑</c>' : '')
  //     )
  //     .join(' ');
  //   // const text = tt.map((t) => `<${formatSeconds(t.marked_range.start_time)}>` + '<c>' + t.texts + '</c>' + (t.metadata.pilcrow ? '<c.yellow>¶</c>' : '') + (t.metadata.pilcrow2 ? '<c.yellow>*</c>' : '')).join(' ');
  //   const id = `${i}`;
  //   vttOut += `${id}\n${formatSeconds(first?.marked_range?.start_time)} --> ${formatSeconds(
  //     last?.marked_range?.start_time + last?.marked_range?.duration,
  //   )} line:85% \n${text}\n\n`;
  // });

  return vttOut;
}

export function generateSecureUniqueId(length = 16): string {
  const array = new Uint8Array(length / 2);
  window.crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function dom2otio(
  sections: NodeListOf<HTMLElement> | undefined,
): { track: Track; duration: number } | undefined {
  if (!sections) {
    console.log('No sections found');
    return;
  }

  const track = {
    OTIO_SCHEMA: 'Track.1',
    name: 'Transcript',
    kind: 'Video',
    children: Array.from(sections)
      .map((s): Clip => {
        const src = s.getAttribute('data-media-src');
        const id = s.getAttribute('id') ?? generateSecureUniqueId();
        const [start, end] = (s.getAttribute('data-t') ?? '0,0').split(',').map(v => parseFloat(v));
        let metadata = {};
        try {
          metadata = JSON.parse(s.getAttribute('data-metadata') ?? '{}');
        } catch (ignored) {
          /* */
        }

        const children: NodeListOf<HTMLElement> | undefined = s.querySelectorAll(
          'p[data-t]:not(*[data-effect]), div[data-t]:not(*[data-effect])',
        );
        const effects: NodeListOf<HTMLElement> | undefined = s.querySelectorAll('div[data-t][data-effect]');

        // console.log('TRACK', {src, id, start, end, children, effects});

        return {
          OTIO_SCHEMA: 'Clip.1', // TODO: verify with OTIO spec, should be Composable?
          source_range: {
            start_time: start,
            duration: end - start,
          },
          media_reference: {
            OTIO_SCHEMA: 'MediaReference.1',
            target: src,
          },
          metadata: {
            ...metadata,
            id,
            element: s,
            selector: finder(s, { root: s.parentElement as HTMLElement }),
            playerTemplateSelector: s.getAttribute('data-player'),
            data: s
              .getAttributeNames()
              .filter(n => n.startsWith('data-'))
              .reduce((acc, n) => ({ ...acc, [n.replace('data-', '').replace('-', '_')]: s.getAttribute(n) }), {}),
          },
          children: Array.from(children)
            .map((c): Clip | Gap => {
              const [start, end] = (c.getAttribute('data-t') ?? '0,0').split(',').map(v => parseFloat(v));
              const children: NodeListOf<HTMLElement> | undefined = c.querySelectorAll('*[data-t],*[data-m]');
              const segmenter = new (Intl as any).Segmenter('en', { granularity: 'sentence' }); // TODO language detection? from page?
              // const text = c.textContent ?? ''; // TBD this has a lot of whitespace and might have non timed text?
              const text = Array.from(children)
                .map(t => t.textContent)
                .join(' '); // TBD this is the timed text only
              const sentences = [...segmenter.segment(text)[Symbol.iterator]()].map(({ index, segment: text }) => ({
                index,
                text,
              }));

              let metadata2 = {};
              try {
                metadata2 = JSON.parse(c.getAttribute('data-metadata') ?? '{}');
              } catch (ignored) {
                /* */
              }

              return {
                OTIO_SCHEMA: 'Clip.1',
                source_range: {
                  start_time: start,
                  duration: end - start,
                },
                media_reference: {
                  OTIO_SCHEMA: 'MediaReference.1',
                  target: src,
                },
                metadata: {
                  ...metadata,
                  ...metadata2,
                  element: c,
                  transcript: c.textContent,
                  selector: finder(c, { root: s.parentElement as HTMLElement }),
                  data: c
                    .getAttributeNames()
                    .filter(n => n.startsWith('data-'))
                    .reduce(
                      (acc, n) => ({ ...acc, [n.replace('data-', '').replace('-', '_')]: c.getAttribute(n) }),
                      {},
                    ),
                  text,
                  sentences,
                },
                timed_texts: Array.from(children).map((t, i, arr) => {
                  let start, end;
                  if (t.getAttribute('data-t')) {
                    const f = (t.getAttribute('data-t') ?? '0,0').split(',').map(v => parseFloat(v));
                    start = f[0];
                    end = f[1];
                  } else {
                    start = parseFloat(t.getAttribute('data-m') ?? '') / 1e3;
                    end = start + parseFloat(t.getAttribute('data-d') ?? '') / 1e3;
                  }

                  const prefix =
                    arr
                      .slice(0, i)
                      .map(t => t.textContent ?? '')
                      .join(' ') + (i > 0 ? ' ' : '');
                  const textOffset = prefix.length;
                  const text = t.textContent ?? '';
                  const sentence = Array.from(sentences)
                    .reverse()
                    .find(({ index }) => textOffset >= index);
                  const sos = sentence?.index === textOffset;
                  const eos = sentence?.index + sentence?.text.trim().length === textOffset + text.length;
                  const punct = !!text
                    .trim()
                    .charAt(text.length - 1)
                    .match(/\p{P}/gu);

                  return {
                    OTIO_SCHEMA: 'TimedText.1',
                    marked_range: {
                      start_time: start,
                      duration: end - start,
                    },
                    texts: t.textContent ?? '',
                    style_ids: [],
                    metadata: {
                      element: t,
                      selector: finder(t, { root: s.parentElement as HTMLElement }),
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
            .map(p => {
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

                if (
                  t.metadata.textOffset + t.metadata.length - t.metadata.lastBreak >= 37 * 2 ||
                  i === arr.length - 1
                ) {
                  const candidates = arr.slice(i - 5 < 0 ? 0 : i - 5, i);

                  // find previous punctuation
                  let item =
                    candidates.reverse().find(({ metadata: { eos } }) => eos) ??
                    candidates.find(({ metadata: { punct } }) => punct) ??
                    t;
                  item.metadata.pilcrow0 = true;

                  //  avoid widows
                  if (i < tt.length - 5) {
                    // look ahead 2 items for punctuation
                    item = tt.slice(i, i + 3).find(({ metadata: { punct } }) => punct) ?? t;
                    item.metadata.pilcrow2 = true;
                  } else if (i >= tt.length - 5) {
                    // we have few items left, use first candidates (eos, punct)
                    item =
                      tt.slice(i).find(({ metadata: { eos } }) => eos) ??
                      candidates.find(({ metadata: { punct } }) => punct) ??
                      t;
                    item.metadata.pilcrow3 = true;
                  }

                  t.metadata.pilcrow = true;
                  t.metadata.lastBreak = t.metadata.textOffset + t.metadata.length + 1;
                  // item.metadata.lastBreak = item.metadata.textOffset + item.metadata.length + 1;
                }
              });

              return p;
            })
            .reduce((acc, c, i, arr) => {
              if (i === 0 || i === arr.length - 1) return [...acc, c];
              const prev = arr[i - 1];
              if (c.source_range.start_time === prev.source_range.start_time + prev.source_range.duration)
                return [...acc, c];
              const gap = {
                // TODO TBD if this is gap or speechless clip?
                OTIO_SCHEMA: 'Gap.1',
                source_range: {
                  start_time: prev.source_range.start_time + prev.source_range.duration,
                  duration: c.source_range.start_time - (prev.source_range.start_time + prev.source_range.duration),
                },
                media_reference: {
                  OTIO_SCHEMA: 'MediaReference.1',
                  target: src,
                },
              } as unknown as Gap;
              return [...acc, gap, c];
            }, [] as Clip[] | Gap[]),
          effects: Array.from(effects).map((effect): Effect => {
            return {
              name: effect.getAttribute('data-effect') ?? '',
              metadata: {
                element: effect,
                selector: finder(effect, { root: s.parentElement as HTMLElement }),
                data: effect
                  .getAttributeNames()
                  .filter(n => n.startsWith('data-'))
                  .reduce(
                    (acc, n) => ({ ...acc, [n.replace('data-', '').replace('-', '_')]: effect.getAttribute(n) }),
                    {},
                  ),
              },
              source_range: {
                start_time: parseFloat(effect.getAttribute('data-t')?.split(',')[0] ?? '0'),
                duration:
                  parseFloat(effect.getAttribute('data-t')?.split(',')[1] ?? '0') -
                  parseFloat(effect.getAttribute('data-t')?.split(',')[0] ?? '0'),
              },
            } as unknown as Effect;
          }),
        } as unknown as Clip;
      })
      .map(segment => {
        segment.metadata.captions = getCaptions(segment);
        segment.metadata.captionsUrl = URL.createObjectURL(new Blob([segment.metadata.captions], { type: 'text/vtt' }));
        return segment;
      }),
    markers: [],
    metadata: {},
    effects: [],
  } as Track;

  const duration = track.children.reduce((acc, c) => acc + c.source_range.duration, 0);

  // console.log({ track, duration });

  // this.track = track;
  // this._duration = duration;
  // this.dispatchEvent(new CustomEvent('durationchange'));
  // this.textTracks = [new TextTrack(this._players)]
  return { track, duration };
}

export function findClip(clips: Clip[], sourceTime: number): Clip | null {
  let left = 0;
  let right = clips.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const clip = clips[mid];
    const start = clip.source_range.start_time;
    const end = start + clip.source_range.duration;

    if (start <= sourceTime && sourceTime < end) {
      return clip;
    } else if (sourceTime < start) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  return null;
}

export function findTimedText(timedTexts: TimedText[], sourceTime: number): TimedText | null {
  let left = 0;
  let right = timedTexts.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const tt = timedTexts[mid];
    const start = tt.marked_range.start_time;
    const end = start + tt.marked_range.duration;

    if (start <= sourceTime && sourceTime < end) {
      return tt;
    } else if (sourceTime < start) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  return null;
}

export function stripTags(str: string): string {
  return str.replace(/<\/?[^>]+(>|$)/g, '');
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Metadata {
  [key: string]: any;
}

// interface RationalTime {
//   OTIO_SCHEMA: string;
//   rate: number;
//   value: number;
// }

export interface TimeRange {
  OTIO_SCHEMA: string;
  // duration: RationalTime | Number;
  // start_time: RationalTime | Number;
  duration: number;
  start_time: number;
}

export interface Clip {
  OTIO_SCHEMA: string;
  markers: any[]; // Replace 'any' with a more specific type if markers have a defined structure
  effects: Effect[];
  media_reference: any | null; // Replace 'any' with a specific type if media references have a defined structure
  metadata: Metadata;
  name: string;
  source_range: TimeRange;
  children: Clip[]; // FIXME this should not be here, make section a composition of clips
  timed_texts: TimedText[] | null;
}

export interface Gap { // TODO: verify with OTIO spec
  OTIO_SCHEMA: string;
  markers: any[]; // Replace 'any' with a more specific type if markers have a defined structure
  media_reference: any | null; // Replace 'any' with a specific type if media references have a defined structure
  metadata: Metadata;
  name: string;
  source_range: TimeRange;
}

export interface Track {
  OTIO_SCHEMA: string;
  // children: (Clip | Transition)[]; // Assuming Transition is another interface you have defined
  children: Clip[]; // Assuming Transition is another interface you have defined
  kind: string;
  markers: any[]; // Replace 'any' with a more specific type if markers have a defined structure
  metadata: Metadata;
  name: string;
  // source_range: TimeRange | null;
  effects: Effect[];
}

export interface TimedText {
  OTIO_SCHEMA: string;
  metadata: Metadata;
  name: string;
  color: string;
  marked_range: TimeRange;
  texts: string | string[];
  style_ids: string[];
}

export interface Effect {
  OTIO_SCHEMA: string;
  name: string;
  metadata: Metadata;
  source_range: TimeRange; // TODO: verify with OTIO spec
}

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

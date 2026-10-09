# Recorded match sounds

The game uses the following publicly available recordings, downloaded on 2026-10-09. Every source page explicitly licenses its recording under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). A copy of the complete legal text is included in [CC0-1.0.txt](./CC0-1.0.txt). Attribution is voluntary under CC0 and is provided below for traceability and to thank the recordists.

| Bundled file | Recording and author | Source page | Public media URL |
| --- | --- | --- | --- |
| `volleyball-outdoor.mp3` | **09_Volleyball outdoor hit-2.wav** — 16HPanskaResatko_Matej | https://freesound.org/people/16HPanskaResatko_Matej/sounds/497968/ | https://cdn.freesound.org/previews/497/497968_10813207-hq.mp3 |
| `volleyball-spike.mp3` | **Volleyball spike** — Luisa_Sanchez | https://freesound.org/people/Luisa_Sanchez/sounds/813420/ | https://cdn.freesound.org/previews/813/813420_17552599-hq.mp3 |
| `referee-whistle.mp3` | **Trillerpfeife/ Whistle** — Musik-Fan | https://freesound.org/people/Musik-Fan/sounds/631849/ | https://cdn.freesound.org/previews/631/631849_13817463-hq.mp3 |
| `sand-footsteps.mp3` | **Water Splash and sand footsteps** — Peludo | https://opengameart.org/content/water-splash-and-sand-footsteps | https://opengameart.org/sites/default/files/sand_footsteps_0.mp3 |

Peludo requests a link to the game's itch.io page: [RNAn](https://rnan.itch.io/). The sand recording is recorded foley described by its creator as a webcam/tapioca-bag experiment; it is used for sandy takeoff and landing texture.

## Playback preparation

The bundled MP3 files are unchanged public previews/downloads, totaling **440,767 bytes**. The Freesound previews are used under the same CC0 dedication as the source recordings. No account, original-file download restriction, or copyrighted game/video audio is used.

`src/audio.js` fetches the four files before a gesture, and the first intentional sound gesture creates/resumes Web Audio and decodes them once. It creates short mono PCM snippets in memory: isolated outdoor contacts and spike contacts (290 ms), sand impacts (320 ms), and one whistle blast (up to 850 ms). The contacts are found by ranking 15 ms RMS windows with at least 420 ms separation; their short fades omit long room/background tails. The whistle starts at the first substantial waveform onset. Processing removes DC/low rumble, adds short fades and normalizes each snippet below a 0.72 peak.

Toss/receive/serve use outdoor volleyball contacts, with softer filtering and lower gain for tosses. Spikes use the recorded spike. Blocks layer two short volleyball contacts with a 25 ms offset. Playback varies slightly in pitch and uses restrained stereo positioning. Strong contacts have a quiet synthesized low accent; UI and scoring cues retain lightweight synthesized notes. Sand takeoff/landing and referee whistles are recorded samples. All match samples and scoring cues share the effects bus, independently controlled by the effects setting; the quieter melody/sea ambience uses the separate music bus. A compressor, bounded final soft limiter, and 24-voice limit protect overlap headroom. A lightweight contact fallback is only used if a sample fails to load/decode.

## File integrity

| File | SHA-256 |
| --- | --- |
| `volleyball-outdoor.mp3` | `1fd9868dc0c851c4bca731fdef651db57db55f72807a7fdbd7d32f215eb99fbe` |
| `volleyball-spike.mp3` | `c7234cfcde008c6a0ea8b0c0d645182fc768fb2ec037044037551a9a73432f9f` |
| `referee-whistle.mp3` | `a26702b9fe1a8493fff94b26f01a09746aede14bd6450df7ca7f9c1b95d1a707` |
| `sand-footsteps.mp3` | `f61ed2653df85f23485a4a4ecc57dfdd6f4bf77301fa7cc67fdd1c993a9979d6` |

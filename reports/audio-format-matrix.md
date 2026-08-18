# Audio format matrix

Date: 2026-08-18

The public audio matrix is verified against the exact shipped custom
single-thread build:

- FFmpeg `n5.1.4`, configured as an LGPL 2.1-or-later allowlist build;
- Emscripten `3.1.40`;
- `@ffmpeg/ffmpeg` `0.12.15` and `@ffmpeg/util` `0.12.2`;
- `ffmpeg-core.wasm` 1,581,272 bytes.

The old GPL `@ffmpeg/core` 0.12.10 runtime is no longer served. The direct
custom-core check and browser E2E matrix convert every input fixture to every
advertised output format. Each generated file is independently opened with
host `ffprobe`, and the browser engine probes the output before reporting
success.

| Input fixture | Detected container/codec | MP3 | WAV | M4A (AAC) | FLAC | OGG (Vorbis) |
| --- | --- | --- | --- | --- | --- | --- |
| `tone.mp3` | MP3 / MP3 | verified | verified | verified | verified | verified |
| `tone-1s.wav` | WAV / PCM s16le | verified | verified | verified | verified | verified |
| `tone.m4a` | M4A / AAC | verified | verified | verified | verified | verified |
| `tone.aac` | ADTS AAC / AAC | verified | verified | verified | verified | verified |
| `tone.flac` | FLAC / FLAC | verified | verified | verified | verified | verified |
| `tone.ogg` | OGG / Vorbis | verified | verified | verified | verified | verified |

Raw AAC is an input-only format in the public UI; AAC output is wrapped in the verified M4A container. OGG is limited to the verified native Vorbis path; the application-defined encoder template forces stereo and enables the exact build's experimental native Vorbis encoder. Generic OGG/Opus and arbitrary FFmpeg codecs are not advertised.

Additional behavior fixtures cover a 0.50-second exact trim, a 3-second reordered merge, a smaller compressed MP3 with duration preserved, corrupt input rejection, repeated jobs, and a no-request-body privacy check.

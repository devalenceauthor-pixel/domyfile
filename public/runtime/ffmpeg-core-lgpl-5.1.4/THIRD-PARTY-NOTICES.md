# DoMyFile media runtime notices

This directory contains the versioned single-thread FFmpeg/WASM runtime used by
DoMyFile's browser-side audio engine. User files are not sent to this runtime
from a server; the runtime is downloaded as an application asset and runs in a
worker in the user's browser.

## Included components

- FFmpeg `n5.1.4`, configured and built as an LGPL v2.1-or-later build. See
  `FFMPEG-LICENSE.md` and `COPYING.LGPLv2.1`.
- LAME `3.100`, encoder-only static library, used through FFmpeg's
  `libmp3lame` encoder. See `LAME-COPYING`, `LAME-LICENSE`, and `LAME-README`.
- The `ffmpeg.wasm` JavaScript integration and the `@ffmpeg/ffmpeg`/
  `@ffmpeg/util` application packages are MIT-licensed. See
  `FFMPEG-WASM-LICENSE`.
- Emscripten-generated runtime support is covered by the permissive MIT and
  University of Illinois/NCSA notices in `EMSCRIPTEN-LICENSE`.

Only the components listed in the build report are enabled. No GPL FFmpeg
component, x264, x265, or nonfree external component is included in this
runtime. Native Vorbis encoding is used for OGG output; its verified command
template enables FFmpeg's experimental-codec switch and normalizes encoded
output to two channels because this exact native encoder has that limitation.

This notice bundle is informational and does not replace the applicable license
texts or a release-specific corresponding-source offer.

# Custom FFmpeg LGPL core

Date: 2026-08-18  
Status: audio runtime and four narrow browser video paths integrated and verified; general Video Engine deferred

## Executive conclusion

DoMyFile no longer ships the GPL `@ffmpeg/core` runtime. The shared browser
media engine now loads the versioned custom runtime at
`/runtime/ffmpeg-core-lgpl-5.1.4`.

The exact FFmpeg build reports **LGPL version 2.1 or later** and was configured
with `--disable-gpl`, `--disable-nonfree`, and `--disable-everything` followed
by an explicit audio allowlist. It contains no x264, x265, or other GPL/nonfree
external codec. The only FFmpeg external codec library is an encoder-only LAME
3.100 build. The LAME archive was configured with `--disable-decoder`, so it
does not include the optional GPL MPGLIB decoder objects.

This is an LGPL-family runtime classification, not a patent clearance. The
distribution must satisfy FFmpeg's LGPL 2.1-or-later terms, LAME's LGPL v2
terms, and the notice/source obligations of the exact build. MP3, AAC, and
other codec patent or royalty questions remain separate legal matters.

The core was built and verified directly on the host. **Docker was not used
and is not required.** The runtime binary and configure flags were not changed
for the narrow browser video paths: existing MOV/MP4 demux/mux, AAC decode,
and MP3 encode support are sufficient because video is never decoded or
re-encoded. No GPL/nonfree video codec was added.

## Exact build inputs

| Component | Exact revision | Role |
| --- | --- | --- |
| FFmpeg | `n5.1.4`, commit `4729204c17f756e186d622060088371d10b34f7e` | Codec, demuxer, muxer, filter, and probe implementation |
| ffmpeg.wasm glue | `v0.12.10`, commit `c3a763857c5e615ae8674715ad5e4f63ff469e9d` | Single-thread worker-compatible Emscripten glue |
| LAME | `3.100`, commit `2badea1974ae36cb8312afe99cff1e6b3b5decee` | MP3 encoder only |
| Emscripten | `3.1.40`, commit `5c27e79dd0a9c4e27ef2326841698cdd4f6b5784` | WASM compiler/runtime |
| GNU Make | `4.4.1` | Host build utility |
| Application wrapper | `@ffmpeg/ffmpeg` `0.12.15`, `@ffmpeg/util` `0.12.2` | MIT-licensed browser worker wrapper/utilities |

The checked-in build record is
[`scripts/ffmpeg-lgpl-core/BUILD.md`](../scripts/ffmpeg-lgpl-core/BUILD.md).

## Exact FFmpeg configuration

The following is the exact option set recorded in FFmpeg's generated
`ffbuild/config.mak`:

```text
--target-os=none
--arch=x86_32
--enable-cross-compile
--disable-asm
--disable-stripping
--disable-programs
--disable-doc
--disable-debug
--disable-runtime-cpudetect
--disable-autodetect
--disable-pthreads
--disable-w32threads
--disable-os2threads
--disable-gpl
--disable-nonfree
--disable-version3
--disable-everything
--disable-network
--disable-bzlib
--disable-lzma
--disable-iconv
--disable-avdevice
--disable-postproc
--disable-swscale
--enable-small
--nm=emnm
--ar=emar
--ranlib=emranlib
--cc=emcc
--cxx=em++
--objcc=emcc
--dep-cc=emcc
--extra-cflags='-I/d/vibecode/domyfile/.build/emsdk-install-fixed/include -O3 -msimd128'
--extra-cxxflags='-I/d/vibecode/domyfile/.build/emsdk-install-fixed/include -O3 -msimd128'
--extra-ldflags=-L/d/vibecode/domyfile/.build/emsdk-install-fixed/lib
--enable-protocol=file
--enable-demuxer='aac,concat,flac,mov,mp3,ogg,wav'
--enable-muxer='flac,ipod,mov,mp3,ogg,wav'
--enable-parser='aac,flac,mpegaudio,vorbis'
--enable-bsf=aac_adtstoasc
--enable-decoder='aac,flac,mp3,pcm_f32le,pcm_f64le,pcm_s16be,pcm_s16le,pcm_s24be,pcm_s24le,pcm_s32le,vorbis'
--enable-encoder='aac,flac,libmp3lame,pcm_s16le,vorbis'
--enable-filter='anull,atrim,aformat,aresample,concat'
--enable-libmp3lame
```

The path-bearing flags above are host paths from the reproducible build
workspace. The build instructions use the equivalent `<encoder-install>`
placeholder so the process can be repeated on another host.

The configure banner reports:

```text
License: LGPL version 2.1 or later
External libraries: libmp3lame
Libraries: avcodec avformat swresample avfilter avutil
```

The link is a single-thread Emscripten module with the shape expected by the
existing `@ffmpeg/ffmpeg` worker:

```text
-O3 -msimd128 -sWASM_BIGINT -sUSE_SDL=2
-sMODULARIZE -sINITIAL_MEMORY=32MB -sALLOW_MEMORY_GROWTH
-sEXPORT_NAME=createFFmpegCore
-sEXPORTED_FUNCTIONS=_ffmpeg,_ffprobe,_abort,_malloc
-sEXPORTED_RUNTIME_METHODS=FS,setValue,getValue,UTF8ToString,lengthBytesUTF8,stringToUTF8
-lworkerfs.js -sEXPORT_ES6
```

The Emscripten SDL2 port is a runtime/build support dependency of the
ffmpeg.wasm module, not an enabled audio/video codec. No standalone FFmpeg
CLI binary is shipped; the embedded `ffmpeg` and `ffprobe` entry points are
called by the isolated worker.

## Included allowlist

The final configure output includes only the following relevant components:

- Demuxers: `aac`, `concat`, `flac`, `mov`, `mp3`, `ogg`, `wav`.
- Muxers: `flac`, `ipod`, `mov`, `ogg`, `mp3`, `wav`.
- Decoders: `aac`, `flac`, `mp3`, `pcm_f32le`, `pcm_f64le`, `pcm_s16be`,
  `pcm_s16le`, `pcm_s24be`, `pcm_s24le`, `pcm_s32le`, `vorbis`.
- Encoders: native `aac`, native `flac`, `pcm_s16le`, native `vorbis`, and
  `libmp3lame`.
- Parsers: `aac`, `flac`, `mpegaudio`, `vorbis`, plus the `ac3` parser pulled
  by FFmpeg as a dependency.
- Bitstream filters: `aac_adtstoasc`, plus FFmpeg's `vp9_superframe`
  dependency reported by the build.
- Filters: `anull`, `atrim`, `aformat`, `aresample`, `concat`. `atrim` is
  required by FFmpeg's `-t` output-duration path used for partial trim.
- Protocols: `file` only.
- Libraries: `avcodec`, `avformat`, `swresample`, `avfilter`, `avutil`.
- No programs, input devices, output devices, network protocols, video
  encoders, or video format claims are enabled for the product.

The `ffprobe` command source is embedded only to validate generated media. Its
global command-line state is explicitly reset between calls so the reused
browser runtime can probe sequential jobs safely.

Excluded by construction:

- `--enable-gpl` and all GPL FFmpeg components;
- `--enable-nonfree` and nonfree external components;
- x264, x265, `libvpx`, `libtheora`, `libvorbis`, `libopus`, FDK AAC, and other
  external codec libraries not in the allowlist;
- network, subtitle, font, image, device, post-processing, and scaling
  components.

The public UI advertises the exact six-input/five-output audio matrix below
plus the narrow video matrix recorded in `reports/video-browser-matrix.md`. It
does not advertise generic FFmpeg support.

## Narrow browser video extension

The existing exact runtime supports four local video adapters without a
rebuild:

| Tool | Input signature and streams | Runtime path | Output validation |
|---|---|---|---|
| Trim Video | MP4 or QuickTime MOV; one H.264 video and zero or one AAC audio stream; start at a packet keyframe | Packet-level keyframe probe plus `-c copy` trim/remux; video is not decoded | MP4 `ftyp`, H.264 video, matching AAC presence, dimensions, duration; non-keyframe start is a typed rejection |
| Video to MP3 | MP4 or QuickTime MOV; one H.264 video and one AAC audio stream | AAC audio extraction plus `libmp3lame`; video is not decoded | ID3/MP3 signature, one MP3 audio stream, no video, duration |
| MOV to MP4 | QuickTime MOV; one H.264 video and zero or one AAC audio stream | `-c copy` remux through the `mov` muxer with `mp42` brand | MP4 `ftyp`, H.264 video, matching AAC presence, dimensions, duration |
| Video Converter | MP4 or QuickTime MOV; one H.264 video and zero or one AAC audio stream | `-c copy` remux through the `mov` muxer with `qt  ` or `mp42` brand | Requested MOV/MP4 `ftyp`, H.264 video, matching AAC presence, dimensions, duration |

The custom build has no H.264 decoder or video encoder, so these paths cannot
silently re-encode video. The application rejects non-MP4/MOV signatures,
non-H.264 video, non-AAC audio, extra streams, and missing audio for Video to
MP3 before processing; Trim additionally rejects starts that are not packet
 keyframes. The exact fixture and direct-core checks are in
`tests/fixtures/video/README.md` and
`scripts/verify-ffmpeg-video-browser.mjs`.

## LAME external-library audit

LAME's source identifies the library as GNU Library General Public License
version 2 and warns separately about possible MP3 patent claims. The final
encoder archive is:

```text
File: .build/emsdk-install-fixed/lib/libmp3lame.a
SHA-256: EF63C61F1205F5323E2C470B562A1EFE42E3DB3A85D46352607D31907BE82A34
```

Its members are encoder objects only:

```text
VbrTag.o bitstream.o encoder.o fft.o gain_analysis.o id3tag.o lame.o
mpglib_interface.o newmdct.o presets.o psymodel.o quantize.o quantize_pvt.o
reservoir.o set_get.o tables.o takehiro.o util.o vbrquantize.o version.o
```

The archive was made after configuring LAME with `--disable-decoder`.
`mpglib_interface.o` is the empty interface object retained by LAME's build;
the GPL MPGLIB decoder objects (`common.o`, `dct64_i386.o`, `decode_i386.o`,
`interface.o`, `layer1.o`, `layer2.o`, `layer3.o`, `tabinit.o`, and related
decoder objects) are not present. A binary scan of the linked core also found
no MPGLIB decoder symbols.

The runtime includes `LAME-COPYING`, `LAME-LICENSE`, and `LAME-README`. The
LAME license is handled as a separate LGPL v2 component; it does not change
the FFmpeg configure banner to GPL, but its exact terms and static-link
obligations must be included in the release review.

## Runtime assets and size

The old GPL runtime was removed from the public asset path and moved
recoverably to `.build/retired-gpl-runtime` for audit history. The package
dependency `@ffmpeg/core` was removed from `package.json` and the lockfile.

| Runtime | JavaScript | WASM | JavaScript SHA-256 | WASM SHA-256 |
| --- | ---: | ---: | --- | --- |
| Old `@ffmpeg/core` 0.12.10 GPL build | 111,804 bytes | 32,232,419 bytes | `67A48F11645F85439F3FDE4F2119042C16B374B910206B7A7A24F342E28DCAE3` | `9F57947A5BD530D8F00C5B3F2CB2A3492FAA7E5D823315342D6A8656D0A6B7B7` |
| Custom FFmpeg n5.1.4 LGPL allowlist | 87,360 bytes | 1,583,516 bytes | `B5D3D5C113B9B07032F8C1A7567592171849894579F746AB24688C8F5C292B03` | `8C504FA5F9639BFF83F4815D4005238EB2641DB002A39D79351F88FC19F0441F` |

The custom WASM is approximately 95% smaller than the old WASM asset. It is
lazy-loaded only by the media engine and runs in the existing FFmpeg worker;
user files remain in browser memory and are never sent to the runtime asset
host or any processing service.

The public runtime directory includes:

- `ffmpeg-core.js` and `ffmpeg-core.wasm`;
- `FFMPEG-LICENSE.md` and `COPYING.LGPLv2.1`;
- `LAME-COPYING`, `LAME-LICENSE`, and `LAME-README`;
- `FFMPEG-WASM-LICENSE` and `EMSCRIPTEN-LICENSE`;
- `THIRD-PARTY-NOTICES.md` and `SOURCE-OFFER.md`.

## Audio compatibility revalidation

Every generated file was independently opened with the host `ffprobe` after
the custom core probed it. The matrix is 30/30. The old runtime's previous
30/30 result is retained here for comparison; the custom runtime is the only
runtime now used by the application.

Legend: each cell is `old runtime / custom runtime`.

| Input fixture | MP3 | WAV | M4A (AAC) | FLAC | OGG (Vorbis) |
| --- | --- | --- | --- | --- | --- |
| `tone.mp3` — MP3 | verified / verified | verified / verified | verified / verified | verified / verified | verified / verified |
| `tone-1s.wav` — WAV / PCM s16le | verified / verified | verified / verified | verified / verified | verified / verified | verified / verified |
| `tone.m4a` — M4A / AAC | verified / verified | verified / verified | verified / verified | verified / verified | verified / verified |
| `tone.aac` — raw ADTS AAC / AAC | verified / verified | verified / verified | verified / verified | verified / verified | verified / verified |
| `tone.flac` — FLAC / FLAC | verified / verified | verified / verified | verified / verified | verified / verified | verified / verified |
| `tone.ogg` — OGG / Vorbis | verified / verified | verified / verified | verified / verified | verified / verified | verified / verified |

Exact custom-core output expectations:

| Output | Container probe | Codec probe | Encoding path |
| --- | --- | --- | --- |
| MP3 | `mp3` | `mp3` | LAME `libmp3lame`, tested bitrate presets |
| WAV | `wav` | `pcm_s16le` | FFmpeg-native PCM |
| M4A | `mov,mp4,m4a,...` | `aac` | FFmpeg-native AAC, `+faststart` |
| FLAC | `flac` | `flac` | FFmpeg-native FLAC |
| OGG | `ogg` | `vorbis` | FFmpeg-native Vorbis, `-strict -2`, forced stereo |

Raw AAC is input-only in the public UI. AAC output is always the verified M4A
container. Native Vorbis in FFmpeg n5.1.4 has a two-channel limitation in this
build, so the application-defined OGG encode template forces `-ac 2`; this is
documented behavior, not a generic codec promise. Safe same-format remux/copy
paths remain available where the input stream already matches the output.

## Application integration

The existing shared media engine was retained. The only runtime selection is
the versioned custom path in `media-engine.ts`; command construction remains in
typed application templates in `options.ts`. No user-supplied FFmpeg argument
is accepted.

The integration preserves:

- lazy core loading only when a media route starts processing;
- the worker boundary and one heavy encode per tab;
- reuse of a stable loaded core between sequential jobs;
- virtual filesystem cleanup after every job;
- safe cancellation through worker reset/termination;
- typed validation and mapped user-facing processing errors;
- independent output probing before success;
- local-only input/output file handling and privacy regression coverage.

## Verification performed

The direct custom-core matrix command is:

```text
node scripts/verify-ffmpeg-lgpl-core.mjs
```

It checks the embedded FFmpeg/Emscripten versions and configure string,
converts all 30 cells, probes each result inside the custom core and again
with an independent host `ffprobe`, checks duration tolerance, and asserts
that verification files are removed from the virtual filesystem. The same
loaded module is reused across the full sequence, including probe/encode/
probe cycles.

The direct trim smoke check also uses the exact application template with
`-ss 0.25 -t 0.5` and produced a valid 44,178-byte PCM WAV. The browser suite
additionally covers trim duration, converter codec/container,
merge order and duration, compression size and duration, corrupt input,
repeated jobs, and the no-request-body privacy check.

Final project verification:

- `node scripts/verify-ffmpeg-lgpl-core.mjs`: passed, 30/30 cells; forbidden
  external encoders absent from the runtime's encoder listing; virtual
  filesystem cleanup verified.
- `node scripts/verify-ffmpeg-video-browser.mjs`: passed; Video to MP3 and MOV
  to MP4 output signatures, streams, duration, exact runtime allowlist, and
  virtual filesystem cleanup verified.
- Direct partial-trim smoke: passed, `0.25`–`0.75` seconds produced a valid
  44,178-byte PCM WAV.
- `pnpm test`: passed, 6 test files and 36 tests.
- `pnpm exec playwright test tests/e2e/video.e2e.spec.ts`: passed, 3 browser
  tests covering both released video routes, repeated jobs, errors, outputs,
  mobile layout, object-URL cleanup, and no request-body privacy.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed with 0 errors, warnings, or hints.
- `pnpm build`: passed, 32 static pages generated. Astro emitted only its
  existing large-chunk advisory; it did not fail the build.

## Licensing and release obligations

The runtime includes the applicable license and notice texts, but a local
source checkout is not itself a public corresponding-source offer. Before a
commercial release, publish a stable, machine-readable source archive tied to
the runtime hashes above. It must include:

- exact FFmpeg and LAME sources;
- the ffmpeg.wasm glue and ffprobe namespace/reset changes;
- configure/link flags and build scripts;
- the encoder-only LAME archive recipe;
- all applicable license, copyright, and notice files.

The LGPL classification does not resolve patent or royalty exposure. Obtain a
separate review for MP3/LAME, AAC/MPEG, MP4/MOV, and any future codec/container
claims. Do not enable or advertise a component merely because it is technically
available upstream.

## Limitations and recommended next action

- The public support list is limited to the exact 30-cell audio matrix and the
  narrow H.264/AAC browser video matrix in `reports/video-browser-matrix.md`.
- OGG/Vorbis encoding is forced to stereo in the custom core's tested path.
- No generic FFmpeg arguments, codecs, or containers are exposed.
- General Video Engine implementation is intentionally not started. The
  released paths make no HEVC/x264/x265 or general video conversion claim.
- The source-offer URL still needs to be wired into the release process; the
  checked-in `SOURCE-OFFER.md` records the obligation but is not a substitute
  for publishing the corresponding source.

Recommended next action: have counsel review the exact LGPL/LAME notice and
source package plus the MP3/AAC/MP4/MOV patent caveats, then publish the
corresponding source alongside the versioned runtime. Keep Compress PDF and
Compress Video behind the ADR-008 server fallback gates until their native
engines and privacy infrastructure are approved.

## Primary upstream sources

- [FFmpeg n5.1.4 source](https://github.com/FFmpeg/FFmpeg/tree/n5.1.4)
- [FFmpeg n5.1.4 license](https://github.com/FFmpeg/FFmpeg/blob/n5.1.4/LICENSE.md)
- [FFmpeg LGPL text](https://github.com/FFmpeg/FFmpeg/blob/n5.1.4/COPYING.LGPLv2.1)
- [FFmpeg legal guidance](https://www.ffmpeg.org/legal.html)
- [ffmpeg.wasm v0.12.10 source](https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v0.12.10)
- [LAME source project](https://github.com/lameproject/lame)
- [LAME 3.100 release files](https://sourceforge.net/projects/lame/files/lame/3.100/)
- [Emscripten source and license](https://github.com/emscripten-core/emscripten/tree/3.1.40)

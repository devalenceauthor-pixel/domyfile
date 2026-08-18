# FFmpeg/WASM license audit

Date: 2026-08-17

## Executive conclusion

The exact media runtime currently shipped by DoMyFile is a GPL build, not an LGPL-only build. It must not be treated as license-neutral or used as the unreviewed baseline for a production Video Engine.

The decisive evidence is both local and upstream:

- `node_modules/@ffmpeg/core/package.json` declares `GPL-2.0-or-later`.
- The shipped binary reports FFmpeg `5.1.4` and contains `--enable-gpl`, `--enable-libx264`, and `--enable-libx265`.
- FFmpeg's upstream license documentation identifies `libx264` and `libx265` as GPL libraries and states that enabling GPL components changes the resulting FFmpeg build to GPL.

The current verified DoMyFile audio matrix does not require x264 or x265. A separately built, auditable LGPL-compatible core should be able to retain the current audio paths, subject to re-running the complete fixture matrix and collecting the required third-party notices. Video implementation should wait for that core decision.

This is a technical audit, not legal advice.

## Exact installed and shipped artifacts

Installed package versions:

| Package | Version | Installed package declaration |
| --- | --- | --- |
| `@ffmpeg/core` | `0.12.10` | `GPL-2.0-or-later` |
| `@ffmpeg/ffmpeg` | `0.12.15` | MIT |
| `@ffmpeg/util` | `0.12.2` | MIT |

The project ships the ESM core files copied from `@ffmpeg/core@0.12.10`:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `public/runtime/ffmpeg-core-0.12.10/ffmpeg-core.js` | 111,804 | `67A48F11645F85439F3FDE4F2119042C16B374B910206B7A7A24F342E28DCAE3` |
| `public/runtime/ffmpeg-core-0.12.10/ffmpeg-core.wasm` | 32,232,419 | `9F57947A5BD530D8F00C5B3F2CB2A3492FAA7E5D823315342D6A8656D0A6B7B7` |

The public ESM files and the installed ESM files have identical hashes. The installed `@ffmpeg/core` package contains only `dist` and `package.json`; it does not contain a `LICENSE`, `COPYING`, `NOTICE`, or source archive. The project currently has no public FFmpeg license/source-notice bundle.

## Exact compiled build

The binary was initialized directly and queried with `ffmpeg -version`. It reports:

```text
ffmpeg version 5.1.4
built with emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.40
```

The exact embedded configuration string is:

```text
--target-os=none --arch=x86_32 --enable-cross-compile --disable-asm --disable-stripping --disable-programs --disable-doc --disable-debug --disable-runtime-cpudetect --disable-autodetect --nm=emnm --ar=emar --ranlib=emranlib --cc=emcc --cxx=em++ --objcc=emcc --dep-cc=emcc --extra-cflags='-I/opt/include -O3 -msimd128' --extra-cxxflags='-I/opt/include -O3 -msimd128' --disable-pthreads --disable-w32threads --disable-os2threads --enable-gpl --enable-libx264 --enable-libx265 --enable-libvpx --enable-libmp3lame --enable-libtheora --enable-libvorbis --enable-libopus --enable-zlib --enable-libwebp --enable-libfreetype --enable-libfribidi --enable-libass --enable-libzimg
```

Not present in the configuration:

- `--enable-nonfree` — the build is not marked unredistributable by this flag.
- `--enable-version3` — the build reports the GPL v2-or-later path, not GPLv3-only.
- `--enable-libfdk-aac` — current AAC processing uses FFmpeg's native AAC codec, not FDK AAC.
- pthreads and the Windows/OS2 thread modes — this is the single-thread core.

The runtime's encoder/decoder listings confirm the relevant compiled paths:

- audio: native `aac`, native `flac`, native PCM, `libmp3lame`, `libvorbis`, and `libopus`;
- video: `libx264`, `libx265`, `libvpx`, `libvpx-vp9`, `libtheora`, and `libwebp`, plus native video codecs.

## Why the current core is GPL

FFmpeg itself is primarily LGPL 2.1-or-later, but its upstream license file states that optional GPL components are activated by `--enable-gpl`, and that the resulting FFmpeg build becomes GPL v2-or-later. The same file lists both `libx264` and `libx265` among the GPL-compatible external libraries that require the GPL build option.

This core has all three GPL indicators:

1. the package metadata says `GPL-2.0-or-later`;
2. the embedded configure line contains `--enable-gpl`;
3. the binary statically includes `libx264` and `libx265`.

The MIT license of the `@ffmpeg/ffmpeg` JavaScript wrapper does not relicense the FFmpeg-derived WebAssembly core. The wrapper and utility packages can retain their MIT notices, but the combined distribution still has to comply with the core and bundled-library licenses.

## Bundled external libraries and licensing impact

The exact build explicitly links these external libraries:

| Configure component | Observed role | Audit consequence |
| --- | --- | --- |
| `libx264` | H.264 encoding | GPL; direct reason the core cannot be LGPL-only. |
| `libx265` | HEVC encoding | GPL; direct reason the core cannot be LGPL-only. |
| `libvpx` | VP8/VP9 encoding and decoding | Not identified as the GPL trigger; retain its exact upstream notice if kept. |
| `libmp3lame` | MP3 encoding | LGPL external library; its notice and source must be handled separately. |
| `libtheora` | Theora encoding/decoding | Retain its exact upstream notice if kept. |
| `libvorbis` | Vorbis encoding/decoding | Xiph documents the implementation under a BSD-like license. |
| `libopus` | Opus encoding/decoding | Not currently advertised by DoMyFile; retain its exact notice if later exposed. |
| `zlib` | Compression support | Retain its zlib notice if kept. |
| `libwebp` | WebP image codec support | Retain its exact upstream notice if kept. |
| `libfreetype`, `libfribidi`, `libass` | Subtitle/font support | Retain each exact upstream notice if kept. |
| `libzimg` | Image scaling/color support | Retain its exact upstream notice if kept. |

This list is based on the binary's embedded configure string, not on generic ffmpeg.wasm documentation. The final compliance bundle must be generated from the exact source revisions used for a replacement build, including transitive dependencies such as Ogg support used by Vorbis.

## Redistribution obligations

Before distributing the current core as part of DoMyFile, the release needs a legal/compliance decision and, at minimum, a corresponding-source and notices package. The practical obligations are:

- provide the applicable GPL v2-or-later license text and FFmpeg copyright/attribution notices;
- provide the exact corresponding source for FFmpeg 5.1.4, the ffmpeg.wasm integration/build modifications, and every bundled external library at the revisions used;
- provide build scripts, patches, and the exact configure/build command so the source corresponds to the shipped WASM and JavaScript glue;
- provide each external library's license and attribution files, including LAME, x264, x265, libvpx, libtheora, libvorbis, libopus, zlib, libwebp, FreeType, FriBidi, libass, zimg, and transitive dependencies that are actually linked;
- publish the source archive or a valid written source offer with the distributed runtime. The safest implementation for a static site is a stable source/notice URL on the same site as the versioned runtime;
- keep the source archive tied to the exact runtime hashes above, rather than linking to a moving repository branch.

The current installed package and `public/runtime` directory do not satisfy these release-artifact expectations by themselves because they contain no license/source bundle.

The FFmpeg upstream legal checklist specifically calls for source corresponding exactly to the binaries, the configure line, a changes diff, and source hosted alongside the binary. Its legal page also warns that commercial products may have separate patent exposure for MPEG-family codecs.

## Current advertised audio codecs

The public audio matrix uses:

- MP3: `libmp3lame` encoder;
- WAV: native PCM;
- M4A: native FFmpeg AAC encoder in an MP4/M4A container;
- FLAC: native FFmpeg FLAC encoder;
- OGG: `libvorbis` encoder, explicitly limited to Vorbis.

No current advertised audio path uses x264, x265, FDK AAC, or another GPL/nonfree external audio library. Therefore, the current audio feature set does not itself require the GPL video libraries.

There are still non-copyleft legal concerns to review before commercial distribution:

- MP3 and AAC are MPEG-family codecs and may have jurisdiction-specific patent/licensing obligations. FFmpeg's own legal guidance does not give a patent clearance and specifically warns commercial products about MPEG-related patents.
- LAME and Vorbis bring their own notices even though they do not make this build GPL by themselves.
- The presence of `libopus` in the runtime is not an advertised DoMyFile capability, so it should not be added to public format lists without a separate fixture and notice review.

The current AAC path is preferable to adding FDK AAC from a redistribution perspective: FFmpeg identifies FDK AAC as a separately licensed library with patent terms, and this core does not enable it.

## Can a custom LGPL-compatible core support DoMyFile?

### Existing audio requirements

Yes, technically. A custom allowlisted core can retain the tested audio behavior with:

- native AAC, FLAC, and PCM;
- `libmp3lame` for MP3;
- `libvorbis` plus its Ogg dependency for OGG/Vorbis;
- the required audio demuxers, muxers, parsers, filters, and `ffprobe` support.

The custom build must omit `--enable-gpl`, `--enable-libx264`, and `--enable-libx265`, and must not enable `--enable-nonfree`. It should use `--disable-everything` plus an explicit audio allowlist so future codec additions cannot silently change the license profile. The complete existing audio fixture matrix must be rerun against the new hashes before any public format list changes.

### Planned video requirements

The answer is conditional, and the current generic video registry is not enough to establish a verified codec matrix:

- Video-to-MP3 can likely keep supported video decoders and the existing MP3 path without x264/x265 encoding.
- MOV/MP4 remuxing can be supported for compatible existing streams without re-encoding, subject to fixtures.
- WebM with VP8/VP9 and Vorbis/Opus can remain a candidate LGPL-compatible encode path through `libvpx` and the audio libraries.
- Exact trim can use stream copy when safe; re-encoded trim requires a tested encoder for the selected output.
- Compress Video requires re-encoding. H.264 MP4/MOV output cannot rely on `libx264` in an LGPL-only core. It must either be deferred, use a separately approved encoder/runtime such as a WebCodecs path, or narrow output to a tested non-GPL codec/container such as VP8/VP9 WebM.
- HEVC/H.265 output must be removed from an LGPL-compatible core unless a separate licensing decision authorizes x265 or another encoder.

Recommended video scope for the first custom-core spike: video-to-MP3, safe remux/stream-copy cases, and VP8/VP9 WebM encode paths. Do not advertise generic MP4/MOV/WebM support until every input/output codec combination is fixture-tested against the replacement core.

## Recommended next action

1. Do not start Video Engine implementation against the current shipped core.
2. Obtain product/legal approval for either GPL distribution or an LGPL-compatible custom core. The recommended product path is the custom core.
3. Build a minimal, allowlisted replacement core without GPL/nonfree components; do not change the application engine yet.
4. Produce a versioned runtime, complete source/notice bundle, and independent license review tied to its hashes.
5. Re-run the existing audio matrix, then define and test a narrow video matrix before changing the video registry or UI.

## Primary sources

- [ffmpeg.wasm v0.12.10 source tree](https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v0.12.10)
- [ffmpeg.wasm v0.12.10 Dockerfile/build configuration](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v0.12.10/Dockerfile)
- [FFmpeg license file](https://github.com/FFmpeg/FFmpeg/blob/master/LICENSE.md)
- [FFmpeg legal and redistribution guidance](https://www.ffmpeg.org/legal.html)
- [FFmpeg LGPLv2.1 text](https://github.com/FFmpeg/FFmpeg/blob/master/COPYING.LGPLv2.1)
- [Xiph Vorbis licensing FAQ](https://xiph.org/vorbis/faq/)
- [FFmpeg's FDK AAC licensing note](https://github.com/mstorsjo/fdk-aac/blob/master/libAACenc/include/aacenc_lib.h)


# Host-only FFmpeg LGPL core build

This is the build record for the versioned runtime in
`public/runtime/ffmpeg-core-lgpl-5.1.4`. The build is intentionally host-only;
Docker is not required or used.

## Pinned inputs

| Input | Revision |
| --- | --- |
| FFmpeg | `n5.1.4`, commit `4729204c17f756e186d622060088371d10b34f7e` |
| ffmpeg.wasm glue | `v0.12.10`, commit `c3a763857c5e615ae8674715ad5e4f63ff469e9d` |
| LAME | `3.100`, commit `2badea1974ae36cb8312afe99cff1e6b3b5decee` |
| Emscripten | `3.1.40`, commit `5c27e79dd0a9c4e27ef2326841698cdd4f6b5784` |
| GNU Make | `4.4.1` host utility |

The final encoder archive is built with LAME's `--disable-decoder` setting.
Its archive members are encoder objects only plus the empty
`mpglib_interface.o`; it does not contain LAME's optional MPGLIB decoder
objects. This matters because MPGLIB carries separate GPL-licensed code.

## FFmpeg configure line

The core was configured with the following exact flags:

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
--extra-cflags="-I<encoder-install>/include -O3 -msimd128"
--extra-cxxflags="-I<encoder-install>/include -O3 -msimd128"
--extra-ldflags="-L<encoder-install>/lib"
--enable-protocol=file
--enable-demuxer=aac,concat,flac,mov,mp3,ogg,wav
--enable-muxer=flac,ipod,mov,mp3,ogg,wav
--enable-parser=aac,flac,mpegaudio,vorbis
--enable-bsf=aac_adtstoasc
--enable-decoder=aac,flac,mp3,pcm_f32le,pcm_f64le,pcm_s16be,pcm_s16le,pcm_s24be,pcm_s24le,pcm_s32le,vorbis
--enable-encoder=aac,flac,libmp3lame,pcm_s16le,vorbis
--enable-filter=anull,atrim,aformat,aresample,concat
--enable-libmp3lame
```

`<encoder-install>` is the host build prefix, not a runtime path. The
configure banner reports `LGPL version 2.1 or later` and lists only
`libmp3lame` as an external library.

## Embedded entry points

The upstream ffmpeg.wasm v0.12.10 bind layer was retained for the worker
protocol and extended with the application-required `ffprobe` entry point.
The embedded `ffprobe` source is namespaced before linking so it can coexist
with `ffmpeg`, and its process-global command-line state is reset between
calls. Without that reset, a reused browser runtime rejects the second probe.

The link uses the single-thread Emscripten module shape expected by
`@ffmpeg/ffmpeg`:

```text
-sMODULARIZE -sEXPORT_NAME=createFFmpegCore
-sINITIAL_MEMORY=32MB -sALLOW_MEMORY_GROWTH
-sWASM_BIGINT -sUSE_SDL=2 -lworkerfs.js
-sEXPORTED_FUNCTIONS=_ffmpeg,_ffprobe,_abort,_malloc
-sEXPORTED_RUNTIME_METHODS=FS,setValue,getValue,UTF8ToString,lengthBytesUTF8,stringToUTF8
```

The runtime contains no standalone CLI program; the `ffmpeg` and `ffprobe`
entry points are embedded command functions used by the worker wrapper.

## Verification

Run the exact-core verification from the project root:

```text
node scripts/verify-ffmpeg-lgpl-core.mjs
```

That check loads the generated ESM/WASM directly, verifies the embedded
FFmpeg/Emscripten versions and non-GPL configure line, converts all 30 cells
of the six-input/five-output audio matrix, independently probes every output
with host `ffprobe`, checks duration tolerance, and asserts that temporary
virtual filesystem entries are gone.

The browser E2E suite then exercises trim, converter, merge, compression,
corrupt-input handling, repeated jobs, and the no-file-upload privacy check
through the shared media engine.

## Narrow browser video extension

The Video to MP3, MOV to MP4, and Video Converter release paths did not require a binary rebuild.
The existing MOV/MP4 demuxer and muxer, AAC decoder, and libmp3lame encoder
are sufficient because the video stream is never decoded or re-encoded.

The application-defined video allowlist is:

- MP4 or QuickTime MOV signature, one H.264 video stream, and one AAC audio
  stream for Video to MP3.
- QuickTime MOV signature, one H.264 video stream, and zero or one AAC audio
  stream for MOV to MP4.
- MP4 or QuickTime MOV signature, one H.264 video stream, and zero or one AAC
  audio stream for Video Converter; output is an MP4/MOV remux only.
- No extra stream types, arbitrary FFmpeg arguments, H.264 decoder, video
  encoder, GPL codec, or nonfree codec.

MOV to MP4 writes through the existing mov muxer with an mp42 brand and
stream-copy arguments. The exact runtime and virtual filesystem checks are
covered by scripts/verify-ffmpeg-video-browser.mjs; the source fixtures and
rejected cases are documented in tests/fixtures/video/README.md.

# Released browser video matrix

Date: 2026-08-18  
Status: VID-02, VID-03, VID-04, and VID-05 production-ready; VID-01 server fallback implemented separately

## Decision

DoMyFile remains browser-first. Existing production-ready browser tools remain
local and unchanged. Four formerly deferred video routes passed their fixture,
output, privacy, mobile, licensing, and production release gates:

| Route | Boundary | Status |
|---|---|---|
| Trim Video | Browser | Production-ready · keyframe-aligned stream-copy only |
| Video to MP3 | Browser | Production-ready |
| MOV to MP4 | Browser | Production-ready |
| Video Converter | Browser | Production-ready · verified MP4/MOV stream-copy remux only |

This browser matrix does not cover the server-bound Compress Video route.
Its engine, container, and temporary-upload behavior are recorded in
`reports/video-compression-server.md`. Compress PDF is covered by the
corresponding server report.

## Supported input matrix

| Tool | Container signature | Required streams | Output behavior |
|---|---|---|---|
| Trim Video | ISO-BMFF MP4 ftyp with an allowlisted MP4 brand, or QuickTime MOV with qt  brand | Exactly one H.264 video stream and zero or one AAC audio stream; no extra stream types; start must match a verified video packet keyframe | Endpoints are checked locally; the selected range is remuxed to MP4 with H.264/AAC stream copy, preserving dimensions and supported audio; non-keyframe starts are rejected |
| Video to MP3 | ISO-BMFF MP4 ftyp with an allowlisted MP4 brand, or QuickTime MOV with qt  brand | Exactly one H.264 video stream and exactly one AAC audio stream; no extra stream types | Video is discarded; AAC is transcoded to a valid MP3 using the selectable 96/128/192 kbps preset; duration is checked |
| MOV to MP4 | QuickTime MOV ftyp with qt  brand only | Exactly one H.264 video stream and zero or one AAC audio stream; no extra stream types | Streams are remuxed with copy through the existing MOV muxer and an mp42 brand; duration, dimensions, and audio presence are checked |
| Video Converter | ISO-BMFF MP4 ftyp with an allowlisted MP4 brand, or QuickTime MOV ftyp with qt  brand | Exactly one H.264 video stream and zero or one AAC audio stream; no extra stream types | Selected MP4 or MOV output is remuxed with copy through the existing MOV muxer using mp42 or qt  branding; duration, dimensions, and audio presence are checked |

The matrix is enforced from file signatures and FFprobe stream metadata. File
extensions and MIME labels are only preliminary input hints. Trim keyframes are
read from video packet flags; the browser runtime does not decode H.264.

## Rejected cases

- WebM, Matroska, AVI, unknown, corrupt, truncated, or unrecognised
  containers: unsupported container or corrupt-file error.
- MP4 input to MOV to MP4: QuickTime MOV container error.
- Video codecs other than H.264, including MPEG-4 Part 2 and future HEVC or
  ProRes inputs: incompatible video codec error.
- Audio codecs other than AAC: incompatible audio codec error.
- Video Converter output is limited to MP4 and MOV. It does not claim generic
  WebM, Matroska, AVI, or cross-codec conversion.
- More than one video stream, more than one audio stream, subtitles, data,
  attachments, or other stream types: unsupported stream layout error.
- Video to MP3 without an audio stream: no-audio-stream error.
- Trim Video with a start that is not a verified video keyframe:
  `KEYFRAME_BOUNDARY_REQUIRED`; arbitrary between-keyframe cuts are not
  approximated or silently re-encoded.

Unsupported video is never silently re-encoded or uploaded.

## Runtime and licensing

The exact shipped runtime remains
public/runtime/ffmpeg-core-lgpl-5.1.4, FFmpeg n5.1.4, single-thread
ffmpeg.wasm-compatible worker core. No WASM binary, configure flag, H.264
decoder, or video encoder was added.

The existing allowlist already supplies the required MOV demuxer, MOV muxer,
AAC decoder, file protocol, and encoder-only libmp3lame path. Trim Video and
MOV to MP4 use the custom build's MOV muxer with an mp42 brand because the
build does not expose a separate mp4 muxer name. Video Converter uses the same
muxer with either an mp42 or qt  brand. Trim's keyframe probe uses packet flags
and does not require a video decoder; video is never re-encoded.

The build remains configured with --disable-gpl and --disable-nonfree. No GPL
or nonfree codec was added. LGPL classification does not resolve MP3, AAC,
MP4, or MOV patent/royalty questions; those remain a separate legal review.
Host FFmpeg codecs used to generate test fixtures are not shipped or linked
into the browser runtime.

## Browser lifecycle and privacy

- The media module and runtime are lazy-loaded only when a media job starts.
- A shared exclusive queue permits one heavy media job per tab; sequential
  jobs reuse a stable runtime.
- File signatures are checked before probe/process work.
- Temporary input, output, probe, and concat paths are deleted from the
  virtual filesystem in finally blocks.
- Input byte buffers are cleared when possible; transferred/detached worker
  buffers are safely ignored because they are already unreachable.
- Output object URLs are revoked on Process another, page teardown, and
  replacement.
- No file bytes, metadata, or filenames are sent to an API, analytics,
  storage service, or training system.

## Fixtures and verification

Real browser fixtures live in tests/fixtures/video and include:

- MP4 H.264/AAC and QuickTime MOV H.264/AAC supported inputs;
- H.264 video-only input;
- four-second MP4/MOV H.264 fixtures with a deliberate two-second keyframe
  interval for aligned and non-aligned trim tests;
- MPEG-4 Part 2 video, PCM audio, and WebM VP8/Opus rejected inputs.

The direct runtime checks are scripts/verify-ffmpeg-video-browser.mjs,
scripts/verify-ffmpeg-trim-browser.mjs, and
scripts/verify-ffmpeg-video-converter-browser.mjs. The Video Converter check
validates MP4-to-MOV and MOV-to-MP4 remux signatures, streams, dimensions,
duration, host FFprobe output, VFS cleanup, and the absence of a video encoder
for Compress Video. The Trim check validates aligned MP4
and MOV copies, non-keyframe duration failure, video-only streams, output
signatures, independent host FFprobe output, packet keyframe discovery, and
virtual filesystem cleanup.

The targeted Playwright suites are tests/e2e/video.e2e.spec.ts and
tests/e2e/trim-video.e2e.spec.ts. The Trim suite covers MP4/MOV, audio and
video-only output, keyframe-sensitive rejection, incompatible/corrupt input,
repeated jobs, object URL cleanup, mobile layout, no request bodies, and no
fixture names in request URLs.

## Infrastructure and cost implications

The four released routes add no server infrastructure, storage, upload egress,
queue, rate-limit, or native-container cost. Their cost is client CPU, memory,
battery, and download bandwidth. The narrow stream-copy/extraction design
avoids shipping a general video codec build and avoids server processing for
files that meet the local quality bar. Trim's keyframe restriction is the
explicit tradeoff for keeping arbitrary video bytes on-device.

The server-bound tools use the scoped ADR-008 stack:

1. Cloudflare Worker gateway for opaque job creation, MIME/magic validation,
   request limits, and rate limiting.
2. Private R2 temporary object with direct short-lived upload and download
   permissions.
3. Cloudflare Queue for bounded asynchronous work.
4. One isolated, non-root Cloudflare Container per job with pinned native
   engines: pikepdf JobBuilder for Compress PDF and a separately licensed
   native FFmpeg build for Compress Video.
5. Independent output validation, deletion on success/failure/cancellation,
   short TTL backstop, and content-free operational logs.

That server plane creates variable CPU, temporary storage, egress, abuse
protection, observability, and licensing costs. None of those costs apply to
the four released browser routes.

## Current release note

The two server-bound routes are now enabled in the registry with explicit
temporary-upload disclosure. Final public traffic remains gated on commercial
codec/patent review and the deployment checklist in
`server/fallback-worker/README.md`.

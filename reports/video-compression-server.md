# Compress Video server evaluation

Date: 2026-08-18

## Decision

Compress Video is enabled as a server-bound tool using a pinned native FFmpeg
8.1.2 build in the isolated container. The build enables only the required
file/pipe protocols, MP4/MOV and Matroska/WebM demux/mux paths, H.264 and
MPEG-4 Part 2 input decoders, and libvpx VP9/libopus output encoders.
Commands are fixed in the processor; callers cannot supply FFmpeg arguments.

The output is WebM with VP9 video and Opus audio when the input contains its
supported single AAC audio stream. Dimensions are retained, duration is
checked within a bounded tolerance, and audio presence is retained. A result
is offered only when it is at least 5% smaller than the input.

## Supported matrix

| Input | Required streams | Output | Audio |
|---|---|---|---|
| MP4 | exactly one H.264 or MPEG-4 Part 2 video stream; zero or one AAC stream | WebM / VP9 | Opus when AAC is present |
| MOV/QuickTime | exactly one H.264 or MPEG-4 Part 2 video stream; zero or one AAC stream | WebM / VP9 | Opus when AAC is present |

Other containers, codecs, extra streams, corrupt files, oversized dimensions,
and unsupported audio are rejected. The output is checked with ffprobe,
`video/webm`/WebM magic bytes, stream counts, codec names, dimensions,
duration, and actual object size.

## Presets

| Preset | VP9 CRF | Opus bitrate |
|---|---:|---:|
| Quality | 32 | 96k |
| Balanced | 38 | 64k |
| Smaller | 43 | 48k |

The profile strips metadata and uses only `-map 0:v:0` and optional
`-map 0:a:0?`. No arbitrary user command or network input protocol is
available.

## Representative benchmark

The benchmark below runs the processor command profile inside the built
production image and validates the resulting files with that image's ffprobe.

| Fixture | Input | Output | Savings | Duration | Dimensions | Audio |
|---|---:|---:|---:|---:|---|---:|
| `mp4-h264-aac.mp4` | 14,820 | 10,656 | 28.10% | 1.029 s | 160×90 | 1 |
| `mp4-h264-no-audio.mp4` | 1,441 | 769 | 46.63% | 1.000 s | 160×90 | 0 |
| `mov-h264-aac.mov` | 14,871 | 10,656 | 28.34% | 1.029 s | 160×90 | 1 |

## Limits and isolation

The server fallback envelope is 256 MiB input/output, 600 seconds duration,
1920×1080 maximum dimensions, 3 GiB process memory, 240 CPU seconds, 300
wall-clock seconds, two concurrent jobs, and a 15-minute job TTL. FFmpeg is
run without shell interpolation, with file/pipe protocols only, bounded output,
CPU/memory limits, a wall timeout, and a non-root container user.

## Licensing

The FFmpeg binary is built with `--disable-gpl` and `--disable-nonfree`, with
no x264/x265. FFmpeg is classified as LGPL 2.1-or-later for this build;
libvpx and libopus are BSD-3-Clause. H.264 decoding remains an input
capability, not an output encoder. Software-license classification does not
clear codec patents or royalties, so public production still requires the
separate commercial codec/patent review recorded in the container license
status.

## Boundary and privacy

The route uses the shared Worker → private R2 → Queue → isolated Container →
private R2 → short-lived download path. Input/output objects use opaque job
IDs, are deleted on success/failure/cancellation/expiry, and have an R2
lifecycle rule as a backstop. No filenames, file bytes, frames, or content
metadata are logged or sent to analytics/training systems. The UI discloses
the temporary upload before the file is submitted.

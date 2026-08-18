# ADR-008: Scoped server fallback for deferred tools

**Status:** Accepted and implemented; browser implementation for VID-02, VID-03, VID-04, and VID-05 released; PDF-01 and VID-01 server fallback paths enabled  
**Date:** 2026-08-18

## Context

DoMyFile is browser-first. Existing production-ready routes already
process files locally and have browser privacy, worker cleanup, output
validation, and regression-test guarantees. Moving those tools to a server
would weaken the product promise and add infrastructure without solving a
quality problem. The four narrow browser video paths classified in this ADR
have since passed their independent fixture and release gates and are now
production-ready.

The remaining two server-bound routes are deferred for concrete engine gaps:

- the browser Compress PDF spike found no general structural compressor that
  meaningfully reduced representative PDFs without losing selectable text or
  vector content;
- the shipped custom FFmpeg/WASM runtime is an intentionally small,
  single-thread audio-focused allowlist with narrow MOV/MP4 demux/mux support
  and no general video codec path;
- exact arbitrary video trimming remains unavailable locally: stream-copy trim
  is safe only when the start is a verified keyframe, while browser video
  re-encoding requires a separate demux/mux layer, uneven WebCodecs support,
  and codec/licensing decisions. The narrow keyframe-aligned Trim Video path
  is therefore browser-side; exact arbitrary trimming remains out of scope.

The product needs a principled fallback policy rather than treating server
processing as a general migration path.

## Decision

1. Keep every current production-ready route browser-side and unchanged.
2. Permit temporary server processing only for deferred tools whose local
   implementation cannot meet the required quality, performance, or format
   bar.
3. Classify the deferred tools as follows:

   | ID | Tool | Boundary | Decision |
   |---|---|---|---|
   | PDF-01 | Compress PDF | Server fallback | Use a native PDF optimizer after a quality and license gate. |
   | VID-01 | Compress Video | Server fallback | Native video re-encoding is required for predictable presets and resource behavior. |
   | VID-02 | Trim Video | Browser | Ship a narrow H.264 MP4/MOV stream-copy path that accepts only verified keyframe-aligned starts and rejects arbitrary non-keyframe starts. |
   | VID-03 | Video to MP3 | Browser | Add a narrow local extraction adapter that reuses the verified audio encode path. |
   | VID-04 | MOV to MP4 | Browser | Add a narrow local remux path for verified compatible streams; reject unsupported codecs. |
   | VID-05 | Video Converter | Browser | A verified MP4/MOV H.264 remux path with optional AAC audio is reliable locally; unsupported broad conversion remains rejected. |

4. No route is Hybrid at this time. A Hybrid boundary requires a
   measurable local fast-path benefit, one explicit support matrix, and an
   ADR update before implementation.
5. The implementation-specific fixture, privacy, resource, and engine gates
   for PDF-01 and VID-01 have passed. Their controls are enabled with an
   explicit temporary-upload disclosure. Final public launch remains gated on
   commercial codec/patent review and deployment compliance.
6. The release gate for the current production-ready registry is complete:
   every registered route is production-ready and no route is deferred. The
   four narrow browser video paths remain local; PDF-01 and VID-01 use the
   server fallback plane described below. The registry may grow or split
   generic intents without treating a fixed route count as a release goal.

## Recommended server stack

The server plane is a separate optional path alongside static Astro assets:

```text
Browser
  ↓ disclosed job creation
Cloudflare Worker gateway
  ↓ rate limit + schema/size checks
Private R2 temporary object (direct short-lived upload)
  ↓ job ID only
Cloudflare Queue
  ↓
Isolated per-job Cloudflare Container
  ├─ pikepdf JobBuilder (Compress PDF)
  └─ pinned native FFmpeg build (Compress Video)
  ↓ independent output validation
Private R2 temporary result
  ↓ short-lived download
Deletion + TTL backstop
```

The gateway owns the public API and never accepts arbitrary native-engine
arguments. The queue message contains only an opaque job ID, allowlisted tool
ID, validated options, and expiry metadata; it never contains file bytes.

### Native PDF engine

pikepdf 10.11.0 `JobBuilder` is the selected engine. Its profile generates
object streams, recompresses Flate streams, and selectively recompresses
embedded images while retaining the surrounding PDF structure. The processor
must keep text and vector objects and must never vectorize text or rasterize
pages.

qpdf may be used for structural cleanup or validation, but is not sufficient
alone for the product requirement: its documented optimization does not
resample JPEG-backed images and is not a general lossy compressor.

pikepdf is MPL-2.0. Its qpdf dependency, Pillow bridge, and pypdf validator
are recorded in the container license inventory. No MuPDF binary is used. The
inventory is an engineering classification and source-recording step, not a
substitute for final commercial compliance sign-off.

### Native video engine

Use a pinned native FFmpeg container build only for VID-01 in the current V1
scope. A future server-classified video tool would require its own matrix and
ADR update.
The build must have an explicit demuxer/decoder/encoder/muxer allowlist,
fixed command templates, no network protocols, and an independently verified
fixture matrix. H.264, HEVC, AAC, MP3, and other patent- or license-sensitive
paths require separate legal review. The existing browser LGPL media runtime
does not approve the native video build.

## Temporary file lifecycle and privacy

- Before upload, show: “This file is temporarily uploaded for processing and
  deleted automatically after the job.” Avoid exposing implementation labels
  such as “browser-only” or “server-side” as normal tool copy.
- Create an opaque job ID and issue a short-lived, single-object upload
  permission scoped to a private temporary R2 object.
- Validate expected content length, MIME, magic bytes, and a safe parser/probe
  before queueing expensive work. Never trust an extension alone.
- Enforce per-tool file, page/duration, decoded-dimension, memory, CPU, wall
  time, output, concurrency, and job-TTL limits. Limits are set from fixture
  benchmarks, not guessed in a route component.
- Run one job in a clean isolated container with a pinned image, non-root
  process, bounded temporary disk, no shell interpolation, no arbitrary
  arguments, and no external input/network protocol access.
- Delete the input object as soon as processing no longer needs it. Delete the
  result after the download window or successful transfer, and delete
  non-content status metadata at job expiry. A bucket lifecycle rule is a
  backstop because lifecycle deletion is asynchronous.
- Log only opaque job ID, tool ID, phase, stable error code, coarse size bucket,
  and timing needed for operations. Never log file bytes, filename, extracted
  text, metadata, frames, command output, or object keys containing content.
- Do not send uploaded content to analytics, training systems, profiling,
  crash-reporting, or third-party conversion APIs.

## Consequences

Positive:

- the browser privacy promise remains intact for all existing tools;
- only quality-blocked deferred tools incur upload, compute, and operational
  complexity;
- native PDF/video engines can provide predictable quality and resource
  limits;
- the static site remains cheap and independently deployable.

Costs and risks:

- server-bound tools add Workers, R2, Queues, container, observability, abuse,
  and legal/compliance work;
- temporary storage and native processing add variable cost and egress/CPU
  exposure even when objects are deleted quickly;
- native video codecs require separate license/patent review;
- anonymous jobs require rate limits and hard resource caps to prevent abuse;
- progress becomes job-state communication rather than a purely local UI.

## Implementation gates

For each server-bound tool:

1. Complete the engine spike and representative fixture matrix.
2. Define the allowlisted input/output formats and resource envelope.
3. Implement gateway validation, rate limiting, upload disclosure, status,
   cancellation, expiry, deletion, and no-content logging.
4. Build and scan the isolated native container and record exact hashes,
   licenses, notices, and source obligations.
5. Add integration tests for invalid MIME/magic bytes, hostile/corrupt input,
   limits, retries, timeout, deletion, output validity, and privacy.
6. Run mobile/browser tests for the UI and independently verify output files.
7. Update the registry boundary and enable the route only after all release
   gates pass.

## References

- `reports/pdf-compression-spike.md`
- `reports/pdf-compression-server.md`
- `reports/video-compression-server.md`
- `reports/ffmpeg-lgpl-core.md`
- `reports/audio-format-matrix.md`
- [pikepdf JobBuilder documentation](https://pikepdf.readthedocs.io/en/latest/topics/jobs.html)
- [qpdf size optimization documentation](https://qpdf.readthedocs.io/en/stable/cli.html#optimizing-file-size)
- [FFmpeg license and legal considerations](https://ffmpeg.org/legal.html)
- [FFmpeg.wasm usage and worker documentation](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/main/apps/website/docs/getting-started/usage.md)
- [Cloudflare R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [Cloudflare R2 object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
- [Cloudflare Containers limits and instance types](https://developers.cloudflare.com/containers/platform-details/limits/)
- [Cloudflare Containers pricing](https://developers.cloudflare.com/containers/pricing/)

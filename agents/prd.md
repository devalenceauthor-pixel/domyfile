# PRD - DoMyFile

**Status:** Draft for implementation  
**Version:** 1.5
**Last updated:** 2026-08-19
**Source of truth for:** product scope, user behavior, functional requirements, and acceptance criteria.

> Technical implementation belongs in `architecture.md`. Visual rules belong in `design.md`.

## 1. Product

**Product name:** DoMyFile  
**Positioning:** Simple file tools that just work.

DoMyFile is a fast, privacy-first web application for common image, PDF, Word/document, audio, and video tasks.

Users should be able to open a tool, select a file, process it, and download the result without creating an account or installing software.

DoMyFile prioritizes a smaller set of genuinely useful, high-demand tools over a large catalog of rarely used utilities.

The public product name must be written as **DoMyFile** in prose and metadata. A lowercase **domyfile** wordmark may be used visually when defined by `design.md`.

## 2. Goals

- Solve common file problems with minimal steps.
- Make core tools usable on desktop and mobile browsers.
- Process user files locally in the browser whenever technically feasible, with a narrowly scoped temporary server fallback only when local processing cannot meet the quality, performance, or format requirements.
- Require no account for V1 file processing.
- Keep tool behavior consistent across categories.
- Give every public tool a dedicated, indexable URL.
- Share processing engines internally instead of duplicating implementation per route.

## 3. Non-Goals for V1

- User accounts or profiles.
- Cloud file storage or file history.
- Collaboration or document sharing.
- AI media generation or AI video enhancement.
- Professional timeline-based media editing.
- OCR for scanned PDFs. Text-based PDF-to-DOCX conversion is in scope, but exact
  layout recovery is not guaranteed and image-only PDFs are rejected.
- Server-side processing for current browser tools. Explicitly approved server-bound tools may use a temporary server fallback under the rules in Section 8.
- Permanent storage of uploaded or generated files.
- Tool-count growth for its own sake.

## 4. Users and Core Job

### Primary users

People who need a quick file conversion or lightweight edit without installing dedicated software, including students, office workers, creators, developers, and mobile users.

### Core job-to-be-done

When a file is too large, incompatible, incorrectly formatted, or needs a simple modification, the user wants to fix it quickly and download a usable result.

## 5. V1 Tool Scope

V1 is the production-ready public tool set represented by the typed tool
registry. The route count is intentionally not fixed: multiple routes may use
the same processing engine, and a generic tool may be split into clearer
input-to-output intents when that improves usability and discoverability. Do
not create artificial tools merely to increase the count.

### PDF and Document

| ID | Tool | Input | Output | Required behavior |
|---|---|---|---|---|
| PDF-01 | Compress PDF | PDF | PDF | Reduce size when safely possible; preserve page count; never silently rasterize the whole document as the default method. |
| PDF-02 | Merge PDF | 2+ PDFs | PDF | Reorder input files before merge; preserve page order within each file. |
| PDF-03 | Split PDF | PDF | PDF(s) | Split by page ranges or selected pages; support multiple outputs. |
| PDF-09 | JPG to PDF | JPG | PDF | Reorder JPG images; choose page fit/orientation; one or multiple images per job. |
| PDF-10 | PNG to PDF | PNG | PDF | Reorder PNG images; choose page fit/orientation; one or multiple images per job. |
| PDF-11 | WebP to PDF | WebP | PDF | Reorder WebP images; choose page fit/orientation; one or multiple images per job. |
| PDF-05 | PDF to JPG | PDF | JPG(s) | Convert selected or all pages; multi-page output can be downloaded together. |
| PDF-06 | Organize PDF | PDF | PDF | Reorder, delete, and duplicate pages in one workspace. |
| PDF-07 | Rotate PDF | PDF | PDF | Rotate selected pages or all pages by supported right-angle increments. |
| PDF-08 | Watermark PDF | PDF + text/image | PDF | Apply a visible watermark with placement, opacity, and scale controls. |

### Image

| ID | Tool | Input | Output | Required behavior |
|---|---|---|---|---|
| IMG-01 | Compress Image | JPG/PNG/WebP | Same or selected format | Preserve dimensions by default; expose compression/quality control; batch-capable. |
| IMG-02 | Resize Image | JPG/PNG/WebP | Same or selected format | Resize by pixels or percentage; preserve aspect ratio by default; batch-capable. |
| IMG-03 | Crop Image | JPG/PNG/WebP | Same or selected format | Visual crop with freeform and common aspect ratios. |
| IMG-05 | PNG to JPG | PNG | JPG | Replace transparency with a chosen background; default background is white. |
| IMG-06 | JPG to PNG | JPG | PNG | Preserve dimensions and orientation. |
| IMG-07 | JPG to WebP | JPG | WebP | Preserve dimensions and provide a fixed WebP output. |
| IMG-08 | HEIC to JPG | HEIC/HEIF | JPG | Decode supported HEIC/HEIF images and output a broadly compatible JPG. |
| IMG-09 | PNG to WebP | PNG | WebP | Preserve dimensions and provide a fixed WebP output. |
| IMG-10 | WebP to JPG | WebP | JPG | Replace transparency with a white background and provide a fixed JPG output. |
| IMG-11 | WebP to PNG | WebP | PNG | Preserve dimensions and provide a fixed PNG output. |
| IMG-12 | Remove Background | JPG/PNG/WebP | Transparent PNG | Run a local segmentation model on one image and expose original/result previews with honest edge-quality limits. |
| IMG-13 | Image Upscaler | JPG/PNG/WebP | PNG | Run a fixed 3× ONNX super-resolution model on one image; do not substitute Canvas-only resizing. |

### Word and Document

| ID | Tool | Input | Output | Required behavior |
|---|---|---|---|---|
| DOC-01 | DOCX to TXT | DOCX | TXT | Extract readable paragraph text locally; reject legacy DOC, corrupt, empty, or unsupported documents. |
| DOC-02 | DOCX to HTML | DOCX | HTML | Create a complete semantic HTML download from readable DOCX content; do not promise pixel-perfect Word layout. |
| DOC-03 | TXT to DOCX | TXT | DOCX | Create a predictable DOCX with one paragraph per source line; do not infer headings or styling. |
| DOC-04 | DOCX to PDF | DOCX | PDF | Use the isolated native document fallback for stronger pagination, text, table, and embedded-media fidelity than a browser snapshot. |
| DOC-05 | PDF to DOCX | Text-based PDF | DOCX | Use native PDF import for editable structure where possible; reject encrypted/image-only PDFs because there is no OCR claim. |
| DOC-06 | HTML to DOCX | HTML | DOCX | Convert a safe supported HTML subset locally, including headings, paragraphs, lists, tables, and links. |
| DOC-07 | Merge DOCX | 2+ DOCX | DOCX | Merge compatible main-document content, styles, numbering, hyperlinks, and embedded raster images with page breaks between sources. |
| DOC-08 | Compress DOCX | DOCX | DOCX | Recompress supported embedded JPEG media locally with explicit quality presets and offer output only when reduction is useful. |
| DOC-09 | Extract Images from DOCX | DOCX | Images/ZIP | Extract embedded package media without transcoding; do not claim chart, shape, or icon extraction. |
| DOC-10 | DOCX Metadata Cleaner | DOCX | DOCX | Remove supported core, application, and custom properties while disclosing metadata outside the supported scope. |

### Video

| ID | Tool | Input | Output | Required behavior |
|---|---|---|---|---|
| VID-01 | Compress Video | Supported video | Video | Expose useful compression presets; retain audio unless user chooses otherwise; clearly communicate estimated tradeoffs. |
| VID-02 | Trim Video | Verified MP4/MOV H.264 video | MP4 | Select a keyframe-aligned start and end position; output only the selected range through stream copy; reject non-keyframe starts rather than re-encoding. |
| VID-03 | Video to MP3 | Supported video | MP3 | Extract audio and encode to MP3 with selectable quality. |
| VID-04 | MOV to MP4 | MOV | MP4 | Produce a broadly compatible MP4 while preserving dimensions and audio when supported. |
| VID-05 | Video Converter | Verified MP4/MOV with H.264 video and optional AAC audio | MP4 or MOV | Remux the explicitly supported containers with stream copy; reject unsupported codecs and containers. |

### Audio

| ID | Tool | Input | Output | Required behavior |
|---|---|---|---|---|
| AUD-01 | Trim Audio | Supported audio | Audio | Select start and end positions and export the selected segment. |
| AUD-02 | Audio Converter | Supported audio | Supported audio | Convert between explicitly supported common audio formats. |
| AUD-03 | Merge Audio | 2+ audio files | Audio | Reorder inputs and create one continuous output. |
| AUD-04 | Compress Audio | Supported audio | Audio | Reduce bitrate/file size using understandable quality presets. |

### Processing boundary decisions

Existing production-ready routes remain browser-side and unchanged by this
policy. VID-02, VID-03, VID-04, and VID-05 were classified as browser-side
paths and are production-ready after their independent fixture, output,
privacy, mobile, and licensing gates passed. PDF-01 and VID-01 now have
approved server engines, tested output contracts, and enabled temporary
server-bound controls; public launch remains subject to the final commercial
codec/patent and deployment-compliance review recorded in their reports.

| ID | Decision | Boundary | Why |
|---|---|---|---|
| PDF-01 | Use server-side processing | Server fallback | The browser spike did not find a general structural compressor that meaningfully reduces representative PDFs while preserving selectable text and vector content. |
| VID-01 | Use server-side processing | Server fallback | Predictable video compression requires video re-encoding, which is too resource-intensive and codec/licensing-sensitive for the current browser runtime and mobile quality bar. |
| VID-02 | Keep browser-side | Browser | A narrow H.264 stream-copy path can produce accurate container-tolerant ranges when the start is a verified video keyframe; non-keyframe starts are rejected with a typed error because the current LGPL runtime has no video re-encoder. |
| VID-03 | Keep browser-side | Browser | Audio extraction can reuse the local audio encoding path with a narrow, explicitly verified video-container/audio-codec matrix and does not require video encoding. |
| VID-04 | Keep browser-side | Browser | A narrow MOV-to-MP4 remux path can preserve compatible video/audio streams without re-encoding; unsupported source codecs are rejected instead of silently uploaded or converted. |
| VID-05 | Keep browser-side | Browser | A narrow MP4/MOV H.264 remux path with optional AAC audio is useful and reliable with the current MOV muxer; broad cross-codec/container conversion remains unsupported and is rejected. |
| IMG-12 | Keep browser-side | Browser | A quantized local segmentation model produces a transparent PNG from one JPG, PNG, or WebP input. The model/runtime loads only when processing starts; CPU/WASM is the baseline and fine hair, fur, translucent objects, shadows, and busy scenes can need cleanup. |
| IMG-13 | Keep browser-side | Browser | A fixed 3× ONNX super-resolution model performs actual luminance enhancement on 224×224 tiles; WebAssembly is the compatibility fallback and WebGPU is opportunistic. The route has a tested source-size limit and does not promise recovered original detail. |
| DOC-01 | Keep browser-side | Browser | Mammoth extracts readable DOCX text without requiring a server or promising layout preservation. |
| DOC-02 | Keep browser-side | Browser | Mammoth creates readable semantic HTML with external file access disabled; complex Word layout may need cleanup. |
| DOC-03 | Keep browser-side | Browser | The docx writer creates a simple DOCX from plain text with predictable one-line-per-paragraph output. |
| DOC-04 | Use native server fallback | Server fallback | Browser rendering produced an insufficient document-fidelity bar. The isolated LibreOffice Writer conversion is used with strict limits, output validation, temporary deletion, and an explicit non-pixel-perfect disclosure. |
| DOC-05 | Use native server fallback | Server fallback | Text-only extraction would materially disappoint normal PDF-to-Word expectations. Native PDF import can retain useful structure and images where supported; selectable text is required and OCR is not provided. |
| DOC-06 | Keep browser-side | Browser | A restricted HTML whitelist can create an editable DOCX without executing scripts or claiming CSS/layout fidelity. |
| DOC-07 | Keep browser-side | Browser | ZIP/XML relationship handling is bounded to compatible main-document content and embedded raster media; unsupported section-specific complexity is disclosed. |
| DOC-08 | Keep browser-side | Browser | Recompressing only embedded JPEGs avoids rasterizing document text and offers a result only when the package becomes meaningfully smaller. |
| DOC-09 | Keep browser-side | Browser | DOCX package media can be copied out reliably without a server or lossy transcoding. |
| DOC-10 | Keep browser-side | Browser | Supported property parts can be cleaned without flattening the editable document, while unsupported hidden data remains disclosed. |

No deferred route is currently classified as Hybrid. A hybrid route may be introduced only if a concrete local fast path and a server fallback share one explicit, tested support matrix and the added complexity has a measurable user benefit.

The released browser video matrix is intentionally narrow:

- Video to MP3 accepts a verified MP4 or QuickTime MOV signature with exactly
  one H.264 video stream and one AAC audio stream. It extracts the audio and
  encodes a validated MP3 locally.
- MOV to MP4 accepts a verified QuickTime MOV signature with exactly one H.264
  video stream and zero or one AAC audio stream. It remuxes with stream copy,
  preserves supported streams and duration, and rejects incompatible codecs or
  extra stream types.
- Video Converter accepts a verified MP4 or QuickTime MOV signature with
  exactly one H.264 video stream and zero or one AAC audio stream. It remuxes
  between MP4 and MOV with stream copy, preserves dimensions, streams, and
  duration, and rejects unsupported combinations.
- Trim Video accepts a verified MP4 or QuickTime MOV signature with exactly one
  H.264 video stream and zero or one AAC audio stream. It reads video packet
  keyframe timestamps locally, accepts only keyframe-aligned starts, and
  stream-copies the selected range to MP4 while preserving dimensions and
  supported audio. Non-keyframe starts are rejected; no video re-encode is
  attempted.
- WebM and other containers, non-H.264 video, non-AAC audio, corrupt files, and
  missing audio for Video to MP3, and non-keyframe Trim Video starts are
  rejected with typed errors before a result is offered.

## 6. Core Experience

All tools follow the same high-level flow unless a tool genuinely requires an exception:

1. Open tool page.
2. Select file(s) using picker or drag-and-drop.
3. Validate file type and basic integrity.
4. Show selected file(s) and relevant options.
5. Start processing.
6. Show processing state and progress when measurable.
7. Show result summary or preview when practical.
8. Download result.
9. Allow the user to start another job without refreshing the page.
10. Release temporary in-memory resources when no longer needed.

### Server fallback exception

For a route classified as `Server fallback`, the product may temporarily upload the selected file only after showing a concise disclosure that the file is uploaded for processing and automatically deleted. The flow must expose upload, queued, processing, success, error, cancellation, and expiry states, and must never silently send a browser-side tool's file to the server.

## 7. Shared Functional Requirements

### File selection and validation

- **FR-CORE-01:** File picker and drag-and-drop must be supported on applicable tools.
- **FR-CORE-02:** Unsupported formats must be rejected before expensive processing starts.
- **FR-CORE-03:** Validation must not rely only on filename extension when a stronger browser-side check is practical.
- **FR-CORE-04:** Original user files must never be modified in place.
- **FR-CORE-05:** Batch-capable tools must show each file and its current state.

### Processing

- **FR-CORE-06:** A processing job must expose clear idle, ready, processing, success, and error states.
- **FR-CORE-07:** One failed batch item must not discard already successful items.
- **FR-CORE-08:** Long-running jobs should be cancellable when the underlying engine supports cancellation safely.
- **FR-CORE-09:** The UI must remain responsive during expensive processing.
- **FR-CORE-10:** Tools must not claim support for a format or capability that the active engine cannot reliably produce.
- **FR-CORE-15:** A server fallback must validate the declared tool, options, MIME, magic bytes, and resource envelope before expensive processing begins.
- **FR-CORE-16:** A server fallback must provide measurable progress when the engine exposes it and an honest indeterminate state otherwise.
- **FR-CORE-17:** Server fallback jobs must expose a useful error or expiry state and must not leave the user waiting indefinitely.

### Result and download

- **FR-CORE-11:** Every successful job must provide an obvious download action.
- **FR-CORE-12:** Multiple generated files must support a practical combined-download flow.
- **FR-CORE-13:** Output names must be deterministic and human-readable.
- **FR-CORE-14:** The user must be able to process another file after completion without a full page reload.

## 8. Privacy and Data Rules

- **PR-01:** User file contents stay on the user's device by default. Only routes explicitly classified as `Server fallback` may temporarily upload file bytes for processing.
- **PR-02:** User files and generated outputs must never be permanently persisted. Server fallback objects may exist only in a private temporary workspace with explicit deletion and TTL safeguards.
- **PR-03:** Browser-side tool requests must not contain file bytes or derived private content. Server fallback uploads are allowed only after the required disclosure and only to the approved temporary processing path.
- **PR-04:** Analytics must never contain file content, filename, local path, extracted text, media frames, or document metadata.
- **PR-05:** Temporary object URLs, workers, in-memory references, server workspace files, input objects, and output objects must be released or deleted after use, failure, cancellation, or expiry.
- **PR-06:** No account or authentication may be required to process or download a file in V1.
- **PR-07:** Server fallback processing must not write file content, extracted content, filenames, media frames, or document metadata to logs, analytics, training datasets, or third-party services.
- **PR-08:** Normal tool UI must describe the user-visible behavior. It must not expose unnecessary implementation labels such as `browser-only` or `server-side`; server fallback tools must clearly disclose the temporary upload and automatic deletion near the upload action.

## 9. Error and Edge Cases

| Case | Expected behavior |
|---|---|
| No file selected | Processing action remains unavailable. |
| Unsupported format | Reject before processing and state supported formats. |
| Corrupt/unreadable file | Stop safely and show a useful error. |
| Password-protected/unsupported PDF | Explain that the file cannot be processed by the current tool. |
| One batch item fails | Keep other successful results available. |
| Browser lacks required capability | Explain the limitation instead of crashing or hanging. |
| Job is cancelled | Stop when safely supported and clean temporary resources. |
| Output would not meaningfully improve the file | Explain this rather than claiming a successful optimization. |
| Memory pressure or oversized input | Warn or reject according to the engine's tested limits. |
| Server upload or processing is unavailable | Keep the original local file untouched, show a specific retry/try-later message, and do not offer a fabricated result. |
| Server job expires or is rate-limited | Explain that the temporary job ended or the request limit was reached; delete any temporary objects. |

## 10. SEO and Discoverability Requirements

- **SEO-01:** Every tool has one stable canonical URL.
- **SEO-02:** Every tool page has a unique title, description, H1, explanatory copy, and relevant related-tool links.
- **SEO-03:** Specific intent routes such as `/image/png-to-jpg` may reuse the same engine as the general converter without duplicating processing code.
- **SEO-04:** Tool pages must render meaningful HTML before the processing engine is loaded.
- **SEO-05:** `sitemap.xml` and `robots.txt` must include/index the intended public tool pages.
- **SEO-06:** Do not generate thin near-duplicate pages solely to increase URL count.

## 11. Non-Functional Requirements

### Usability

- **NFR-01:** Core flows must work from a 360 px wide viewport upward.
- **NFR-02:** Primary actions must be keyboard accessible.
- **NFR-03:** Processing state must never depend only on color.
- **NFR-04:** Errors must explain what failed and what the user can do next.

### Performance

- **NFR-05:** Heavy engines must load only on routes that need them.
- **NFR-06:** Expensive processing must not block the main UI thread when an appropriate Worker/WASM path exists.
- **NFR-07:** No unbounded batch concurrency is allowed.
- **NFR-08:** Static content must remain lightweight even when media-processing binaries are large.

### Reliability

- **NFR-09:** A tool failure must not crash the entire application shell.
- **NFR-10:** Generated files must be validated at least for expected type/signature and non-zero output before being offered as successful results.
- **NFR-11:** File-size limits must be based on tested browser behavior and configured per engine, not invented per page.
- **NFR-12:** Server fallback limits must be configured per tool for bytes, duration/pages, decoded dimensions, memory, CPU time, output size, concurrency, and job lifetime.
- **NFR-13:** Server fallback processing must be isolated from the static site and from other jobs, with bounded concurrency and no user-controlled command execution.

## 12. Analytics

Allowed V1 events are limited to product behavior, for example:

- `tool_open`
- `file_selected`
- `process_started`
- `process_success`
- `process_failed`
- `download_clicked`

Events may include tool ID, category, generic error code, and coarse timing information. They must not include user file data prohibited by Section 8.

## 13. Release Gates

A tool must not be marked production-ready until:

- The required behavior in the tool matrix is implemented.
- Supported input/output formats are verified with test fixtures.
- Expected errors and unsupported cases are handled.
- The output opens correctly in an independent parser/player/viewer where practical.
- Mobile behavior has been tested.
- Privacy requirements remain satisfied.
- No dependency with unacceptable licensing or redistribution terms is introduced.

### Special gates

- **Compress PDF:** Do not ship a fake compressor that silently rasterizes every page by default or destroys selectable text merely to reduce file size. The selected pikepdf `JobBuilder` native/server optimizer passes the fixture gate for page count, selectable text, content structure, annotations, output validity, meaningful reduction, resource limits, and license inventory; qpdf alone is not sufficient for the required selective image optimization.
- **HEIC to JPG:** Decoder choice must pass browser compatibility, output quality, bundle/runtime size, and license review.
- **Remove Background:** Quality is evaluated on representative clean-object, portrait, hair/fur, soft-edge, busy-photo, textured-illustration, shadow, alpha-PNG, and high-resolution fixtures. The retained implementation uses the existing temporary fallback plane with a pinned BiRefNet-lite ONNX checkpoint and CPU ONNX Runtime; the former `@imgly/background-removal` AGPL package is not used. The public route is currently held: its static page is excluded and no upload/job is accepted until the container build, model hash, private lifecycle, resource limits, visual QA, measured runtime, security, and license/compliance gates pass.
- **Image Upscaler:** The route must use the pinned ONNX super-resolution model and must not regress to Canvas-only interpolation. The fixed 3× result, model size, browser memory limit, and model-based quality limitation must remain disclosed.
- **Word/document tools:** Browser DOCX routes remain content-focused and do not claim legacy `.doc` support or pixel-perfect Word layout. DOCX to PDF and PDF to DOCX use the separate native fallback contract; the former discloses application/font differences, and the latter requires selectable text and discloses that exact layout recovery and OCR are not guaranteed.
- **Audio/Video tools:** Supported formats must match the actual FFmpeg/WASM
  build. The released video routes use the exact narrow matrix above; do not
  advertise unsupported codecs or imply general video conversion.

### Server fallback gates

A server-processed tool must additionally pass:

- upload disclosure and private temporary storage tests;
- MIME and magic-byte validation, parser validation, and bounded resource checks;
- rate-limit, concurrency, cancellation, timeout, and expiry behavior;
- isolated execution with a pinned native engine and application-defined command templates;
- output validation in an independent parser/player/viewer;
- automatic deletion on success, failure, cancellation, and TTL backstop;
- an audit proving no file content or private metadata reaches logs, analytics, training systems, or unrelated services;
- dependency, codec, patent, and redistribution review.

## 14. Definition of Done

A V1 feature is done only when:

- Its functional requirements and tool-specific behavior pass.
- Happy path and representative failure paths are tested.
- Output files are valid and downloadable.
- The interface remains usable during processing.
- Temporary resources are cleaned up.
- No user file is transmitted for browser-side tools. A server fallback tool may transmit only through its disclosed, temporary, deletion-enforced path and must not persist the file.
- Relevant automated tests pass.
- No unresolved runtime error remains in supported browsers.
- Documentation is updated when behavior, support, or constraints change.

## 15. Companion Documents

- `architecture.md` defines implementation, deployment, processing engines, and technical boundaries.
- `design.md` defines DoMyFile's visual system, interaction details, responsive layout, component appearance, graphic resources, and UI copy conventions.
- `adr/008-deferred-server-fallback.md` records the narrow server fallback policy and deferred-tool classification.
- Neither companion document may silently expand or contradict the product scope defined here.

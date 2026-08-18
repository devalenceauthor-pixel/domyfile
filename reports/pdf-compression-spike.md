# Compress PDF technical spike

Date: 2026-08-17

## Decision

This report is the historical browser-only baseline. No tested browser-only
strategy met the product gate for a general-purpose compressor without either
failing to reduce size or destroying selectable text/vector content. That
browser conclusion still stands; the current server-bound implementation and
its separate engine gate are recorded in `reports/pdf-compression-server.md`.

The existing PDF Engine is unchanged, and no fake Compress PDF processor is exposed. The benchmark harness and generated fixtures are retained for future re-evaluation.

## Strategies evaluated

### 1. `pdf-lib` rewrite with object streams

Load the PDF with `pdf-lib` and save it with `useObjectStreams: true`.

- Preserves page count.
- Preserved PDF.js text item counts in every text-bearing fixture.
- Does not recompress existing JPEGs or provide a general compression-level control.
- Produced no meaningful reduction in the representative set.

### 2. `pdf-lib` rewrite without object streams

This is a useful control comparison, not a candidate implementation.

- Preserves page count and text.
- Increased the text-heavy fixture by 77.67%.
- Increased the other fixtures by 0.30–0.35%.
- Rejected because it can make files materially larger.

### 3. PDF.js canvas rasterization followed by JPEG-backed PDF creation

Render every page with PDF.js, encode each canvas as JPEG quality 75, and create a new PDF with `pdf-lib`.

- Validated independently with both PDF.js and `pdf-lib`.
- Preserved page count.
- Reduced image-heavy and mixed files substantially.
- Flattened every page into an image: selectable text and vector content were lost.
- Increased the text-heavy fixture by 9,051.96% in the browser benchmark.
- Rejected as a default compressor because the quality/content trade-off is unacceptable and misleading for normal documents.

### 4. Selective embedded-image re-encoding

This is the only strategy that could potentially reduce image-heavy PDFs while retaining text/vector content. The current stack does not provide a safe high-level path for replacing arbitrary embedded image XObjects while preserving the surrounding PDF structure. PDF.js exposes resolved image objects for rendering, not a PDF writer; `pdf-lib` exposes image embedding but not a general embedded-image replacement/compression API.

It was rejected for this spike rather than implemented through undocumented low-level object manipulation.

## Browser benchmark

Representative fixtures were processed in the browser using the exact PDF.js and pdf-lib versions in the app. All generated outputs were independently parsed, had the original page count, and had non-zero valid PDF structure.

| Fixture | Input | Object-stream rewrite | Raster/JPEG output | Raster time | Raster heap delta | Text items source → raster |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Text-heavy | 23,815 B | 23,818 B (-0.01%) | 2,179,539 B (-9,051.96%) | 1,186 ms | +6.8 MB | 1,512 → 0 |
| Image-heavy | 490,752 B | 490,754 B (0%) | 80,288 B (83.64%) | 341 ms | +4.1 MB | 0 → 0 |
| Mixed-content | 656,030 B | 656,033 B (0%) | 139,935 B (78.67%) | 630 ms | -27.1 MB* | 24 → 0 |
| Already-optimized | 130,832 B | 130,838 B (0%) | 22,755 B (82.61%) | 180 ms | +1.4 MB | 3 → 0 |

The fixture generator creates a fresh PDF trailer identifier on each run, so regenerated copies can differ by a few bytes. The browser table is the recorded browser run; the JSON report contains the latest Node-side control run.

The object-stream rewrite preserved text counts at 1,512, 24, and 3 for the text-bearing fixtures. Its browser processing times were 22.5 ms, 42.9 ms, 5.1 ms, and 1.5 ms respectively. The no-object-stream control increased the text-heavy file to 42,312 B and the other files by 0.30–0.35%.

\* Heap deltas use Chrome's `performance.memory` measurement and are GC-sensitive; they are directional observations, not a peak-memory limit. The raster path also holds a decoded canvas and PDF output during processing, so larger real-world documents need additional browser-limit testing before any future implementation.

## Quality and product conclusion

The raster path is only meaningful for PDFs that are already image-like, but the application cannot safely infer that all pages are disposable images. Applying it to text-heavy, mixed, or already-optimized PDFs would silently convert useful document structure into pixels. The lossless path cannot honestly promise a smaller result and sometimes increases size.

The browser-only Compress PDF path remains deferred. The separate server
evaluation selected pikepdf `JobBuilder` for selective embedded-image
optimization; see `reports/pdf-compression-server.md` for the current route
decision and benchmark.

## Bundle warning investigation

The Vite warning is caused by the PDF runtime, not by an accidental import into the general site shell. The final static build emits:

| Asset shape | Minified size |
| --- | ---: |
| PDF.js worker (`pdf.worker.min`) | 1,262,398 B |
| PDF.js/pdf-lib engine chunk after minified entry-point change | 860,304 B |
| Custom structural PDF worker | 428,265 B |

The official minified PDF.js browser entry point safely reduces the final engine chunk from approximately 862,540 B to 860,304 B. In an intermediate benchmark-only build Vite split the same runtime into an approximately 845 KB shared chunk plus a 15 KB wrapper; the total was effectively unchanged. The parser/render runtime remains approximately 860 KB and the worker remains approximately 1.26 MB. The warning is therefore expected for a PDF route that genuinely supports parsing and rendering. It is already route-lazy and absent from the non-PDF page bundles. Raising Vite's warning threshold would only hide the condition, so no warning-suppression workaround was added.

## Privacy

The benchmark accepts local `File` objects, uses PDF.js/pdf-lib/canvas in the browser, and has no upload or persistence path. A static audit found no `fetch`, XHR, beacon, analytics, or API submission in the PDF processing path.

## Additional browser candidate: qpdf WASM

The upstream qpdf documentation was reviewed for its `--optimize-images` mode, and the browser wrapper `qpdf-run` was evaluated from its published package and upstream source. The wrapper runs qpdf in a Web Worker over `Uint8Array` data and does not upload files. Its published wrapper is MIT-licensed; the bundled qpdf runtime is Apache-2.0. The tested WASM payload is approximately 1.8 MB before route loading and browser cache effects.

The candidate produced valid PDFs in Chromium with the exact four representative fixtures. PDF.js text extraction and pdf-lib page parsing were used to validate the outputs:

| Fixture | Input | qpdf output | Change | Pages | Text items |
| --- | ---: | ---: | ---: | ---: | ---: |
| Text-heavy | 23,816 B | 23,762 B | 0.23% smaller | 12 | 1,512 |
| Image-heavy | 490,752 B | 490,783 B | 0.01% larger | 6 | 0 |
| Mixed-content | 656,029 B | 656,032 B | no meaningful change | 8 | 24 |
| Already-optimized | 130,831 B | 130,913 B | 0.06% larger | 1 | 3 |

The browser run had no console errors, and all outputs retained valid PDF structure and page/text counts. However, qpdf's image optimization targets non-DCT image streams; the representative image-heavy and mixed fixtures contain JPEG-backed content and therefore do not get a useful reduction. The already-optimized fixture becomes larger. The wrapper also does not provide the supported high-level selective image-XObject rewrite API needed to target arbitrary embedded JPEGs with a product-controlled quality policy.

This candidate therefore does not pass the browser product gate: it cannot
honestly promise meaningful reduction across representative PDFs, while the
raster fallback destroys selectable text and vectors. No qpdf package is
shipped in the browser bundle. The server-bound implementation is evaluated
separately in `reports/pdf-compression-server.md`.

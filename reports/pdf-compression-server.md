# Compress PDF server evaluation

Date: 2026-08-18

## Decision

Compress PDF is enabled as a server-bound tool. The selected engine is
`pikepdf` 10.11.0 using its `JobBuilder` image-optimization path, with qpdf
serialization supplied by the pikepdf wheel. The profile generates object
streams, recompresses Flate streams, and selectively recompresses embedded
images. It does not rasterize pages.

This is a new reason to revisit the browser spike: the current pikepdf
`JobBuilder` path provides a supported selective embedded-image optimizer that
the browser PDF.js/pdf-lib stack did not provide. The rejected browser
approaches remain rejected: pdf-lib rewrites are not general compression,
qpdf-only optimization does not materially reduce the JPEG-backed fixtures,
and full-page rasterization destroys selectable text and vector structure.

## Output contract

- Input: PDF, `application/pdf`, `%PDF-` magic bytes.
- Output: valid PDF, `application/pdf`, `%PDF-` magic bytes.
- Page count is preserved.
- Pages with source text must retain extractable text.
- Content streams and annotation counts may not decrease.
- Embedded image optimization is selective; pages are never converted to
  raster images as a fallback.
- The result is offered only when it is smaller by at least 5%.
- Otherwise the job ends with `NO_USEFUL_REDUCTION` and no output is offered.

## Representative benchmark

The benchmark uses the same processor profile and validation path as the
container. Size fields are bytes; savings are calculated from the actual
input/output files.

| Fixture | Input | Output | Savings | Pages | Text pages preserved | Result |
|---|---:|---:|---:|---:|---:|---|
| `compress-text-heavy.pdf` | 23,816 | — | — | — | — | `NO_USEFUL_REDUCTION` |
| `compress-image-heavy.pdf` | 490,752 | 358,771 | 26.89% | 6 | 0 | compressed |
| `compress-mixed-content.pdf` | 656,029 | 480,016 | 26.83% | 8 | 8 | compressed |
| `compress-already-optimized.pdf` | 130,831 | 86,909 | 33.57% | 1 | 1 | compressed |

The text-heavy no-reduction result is intentional. It prevents the product
from claiming success for a document where the selected profile cannot make a
useful improvement.

## Limits and isolation

The server fallback envelope is 50 MiB input, 60 MiB output, 200 pages, 150M
decoded image pixels, 1.5 GiB process memory, 60 CPU seconds, 120 wall-clock
seconds, two concurrent jobs, and a 15-minute job TTL. The Worker rejects
declared size/MIME errors before upload; the Worker and container both inspect
magic bytes; pikepdf and pypdf validate the output before it reaches the
download path.

## Licensing

pikepdf is MPL-2.0; its qpdf dependency is recorded as Apache-2.0 with the
upstream optional Artistic-2.0 notice; Pillow is under its HPND/PIL license;
pypdf is BSD-3-Clause. The container retains the version inventory and source
references in `server/fallback-worker/container/`. No MuPDF binary is used.
This is an engineering inventory, not a substitute for DoMyFile's final
commercial compliance sign-off.

## Boundary

The route uses the shared Worker → private R2 → Queue → isolated Container →
private R2 → short-lived download path. Input/output objects use opaque job
IDs, are deleted on success/failure/cancellation/expiry, and have an R2
lifecycle rule as a backstop. No filenames, file bytes, extracted text, or
content-derived metadata are logged or sent to analytics/training systems.

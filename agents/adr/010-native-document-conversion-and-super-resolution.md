# ADR-010: Native document conversion and model-backed image upscaling

**Status:** Accepted for implementation review
**Date:** 2026-08-19

## Context

The first browser-only Word implementation could produce readable DOCX/PDF
results, but a browser HTML snapshot for DOCX to PDF and text extraction for
PDF to DOCX would materially undershoot normal user expectations. The existing
DoMyFile fallback plane already provides private temporary objects, queueing,
isolated containers, resource limits, and output validation. Image Upscaler
also needs to be distinct from Resize Image: Canvas interpolation alone is not
super-resolution.

## Decision

- Extend the existing server fallback allowlist with DOC-04 DOCX to PDF and
  DOC-05 PDF to DOCX.
- Install a pinned Debian LibreOffice Writer/Draw headless package set in the
  existing container image. Use fixed filters, a per-job temporary user profile,
  no network input, strict CPU/memory/wall/output limits, and independent PDF or
  DOCX validation.
- Require a modern DOCX ZIP for DOCX to PDF. Require a readable, selectable,
  unencrypted PDF for PDF to DOCX. Do not run OCR and do not promise exact Word
  round-tripping; disclose likely differences in fonts, fields, forms, columns,
  and complex positioning.
- Keep DOCX to TXT, DOCX to HTML, TXT to DOCX, HTML to DOCX, Merge DOCX,
  Compress DOCX, Extract Images from DOCX, and DOCX Metadata Cleaner in the
  browser with their narrower documented contracts.
- Implement Image Upscaler with lazy `onnxruntime-web` and the Apache-2.0
  ONNX Model Zoo `super-resolution-10.onnx` model. Use the model's fixed 224×224
  luminance input and 3× output, tile larger inputs within a tested 2 MP source
  limit, and use Canvas only for color/alpha preparation and reconstruction.
  Keep WebAssembly as the fallback provider and try WebGPU opportunistically.

## Alternatives rejected

- A browser HTML-to-canvas/jsPDF snapshot was rejected for DOCX to PDF because
  it loses too much pagination, embedded media, and document structure.
- PDF.js text extraction plus a newly generated simple DOCX was rejected for
  PDF to DOCX because it would materially disappoint users expecting editable
  structure and images. Scanned/image-only PDFs remain unsupported without OCR.
- Canvas-only upscaling was rejected because it only interpolates pixels and is
  functionally equivalent to Resize Image.
- A new web framework, paid conversion API, or separate native service was not
  needed; the existing server fallback plane is extended narrowly.

## License and release gate

LibreOffice is distributed under MPL-2.0 together with additional bundled
third-party notices; the exact Debian package set and notices are recorded in
`server/fallback-worker/container/LICENSE-STATUS.md` and
`THIRD-PARTY-NOTICES.md`. This is a software-license inventory, not a blanket
commercial or patent clearance. The ONNX Runtime Web library is MIT and the
super-resolution model is Apache-2.0; those runtime and model obligations are
listed separately in the public notice. Production deployment still requires
owner/legal review of the complete native image and the existing AGPL
background-removal route.

## Consequences

- DOCX/PDF quality is improved at the cost of temporary upload, native image
  size, operational capacity, and an explicit server disclosure.
- PDF to DOCX is useful for text-based PDFs but is not OCR or guaranteed layout
  reconstruction.
- Upscaler downloads a small model only on first use, uses more memory than a
  resize operation, and has a fixed 3× output and source-size limit.
- Existing browser tools and their processing behavior are unchanged.

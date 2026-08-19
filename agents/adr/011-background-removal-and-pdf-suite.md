# ADR-011: BiRefNet-lite server path and focused PDF suite expansion

**Status:** Accepted for implementation review; production deployment held
**Date:** 2026-08-19

## Context

The original Remove Background browser path used IMG.LY/ISNet. Targeted
representative fixtures showed that the implementation could return large
background islands on textured or photographic scenes, while first-use CPU
processing took roughly 12–28 seconds on the local test device and required a
large browser model/runtime transfer. The IMG.LY package also introduced an
AGPL release gate.

The PDF category already had valid merge, split, organize, rotate, image-to-PDF,
PDF-to-JPG, watermark, and Compress PDF routes. Users still needed focused
PNG/WebP rendering, embedded-image extraction, text/HTML/metadata workflows,
light overlays, crop, metadata cleanup, TXT packaging, and form flattening.

## Decision

### Remove Background

- Keep the Remove Background source implementation and its original/checkerboard
  workspace flow for a future re-enable; while the release gate is open, do not
  publish `/image/remove-background/` or accept public processing jobs.
- Move inference to the existing server fallback as `IMG-12`; do not add a new
  VPS or paid third-party API.
- Pin `BiRefNet_lite-ONNX/model.onnx` at commit
  `de15b22ba131738a16dff04aab8bdf8dc32e3ac1`, with SHA-256
  `5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333`.
  The Hugging Face Xet content identifier for the same file is
  `917a4cd3931af9b7855c779fc4627ac742ebfa29b26f06ddee70d2ca567805df` and
  is recorded separately from the byte-level SHA-256.
- Use ONNX Runtime 1.20.1 CPU inference in the existing isolated container.
- Size the existing container at 2 vCPUs, 8 GiB hard memory, and 16 GB disk,
  with a 7 GiB working-memory budget and a separate 10 GiB virtual
  address-space guard. Deployment-class measurement showed that the pinned
  checkpoint peaks above the previous 4 GiB tier; two ONNX Runtime intra-op
  threads were faster than four on the measured two-vCPU instance.
- Normalize to 1024×1024 with ImageNet statistics, decode a sigmoid mask,
  resize alpha with BICUBIC, multiply by source PNG alpha, and zero only alpha
  values below 2/255. Do not hard-threshold, choose only the largest component,
  or apply destructive morphology.
- Keep strict MIME/magic, pixel, dimension, memory, CPU, wall-time, private
  object, expiry, cleanup, and output-PNG validation rules.

### PDF suite

- Reuse PDF.js for parsing/rendering/previews/extraction and pdf-lib for
  structural operations.
- Add only distinct routes: PDF to PNG, PDF to WebP, embedded-image extraction,
  page numbers, header/footer, CropBox crop, PDF to Text, PDF to HTML, metadata
  viewer, metadata cleaner, TXT to PDF, and supported form flattening.
- Keep output claims narrow: extracted images are decoded/re-encoded raster
  objects, metadata cleaner removes documented standard fields and catalog XMP,
  PDF-to-HTML is simple page-organized text HTML, and flattening covers supported
  interactive forms rather than every annotation type.
- Use local ZIP packaging for multi-image output; keep PDF-to-DOCX and DOCX-to-PDF
  canonical in the Word category.

## Alternatives rejected or deferred

- Keeping the old browser model was rejected after the textured-background
  fixture failure and AGPL release gate.
- A new native service or external paid image API was rejected; the existing
  fallback plane is sufficient.
- Aggressive alpha thresholding, largest-component-only cleanup, and fake
  quality modes were rejected because they damage valid hair, fur, separated
  foreground objects, and soft edges.
- OCR/searchable PDF, repair, password protection/unlock, grayscale, general
  PDF page resize, and HTML-to-PDF are deferred until a reliable output-quality
  contract is available. Optimize PDF is not a second route because it would
  duplicate Compress PDF behavior.

## License and release gate

ONNX Runtime and the BiRefNet-lite checkpoint are recorded as separate MIT
items, with source, commit, and hash in the container notices and the public
model-status notice. The removed IMG.LY AGPL dependency is not present in the
application dependency graph. The container must still be built, scanned,
visually QA'd, benchmarked warm/cold, and reviewed for complete release
compliance before public traffic is enabled.

PDF.js and pdf-lib remain under their existing project notices. New PDF routes
do not add a native binary, WASM runtime, or model.

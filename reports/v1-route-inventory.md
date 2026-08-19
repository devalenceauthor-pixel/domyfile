# DoMyFile V1 route inventory

Audit date: 2026-08-19

The typed registry is the source of truth for the production-ready public tool
set. It currently contains 52 public tool routes, all production-ready at the
route/engine level, with four explicitly disclosed temporary server-fallback
routes and 48 browser-side routes. The count is allowed to change when a
generic intent is split into a clearer input-to-output route.

## Production-ready

### Image — 11

| ID | Route | Engine |
|---|---|---|
| IMG-01 | `/image/compress-image/` | Shared Image Engine |
| IMG-02 | `/image/resize-image/` | Shared Image Engine |
| IMG-03 | `/image/crop-image/` | Shared Image Engine + local visual crop editor |
| IMG-05 | `/image/png-to-jpg/` | Shared Image Engine |
| IMG-06 | `/image/jpg-to-png/` | Shared Image Engine |
| IMG-07 | `/image/jpg-to-webp/` | Shared Image Engine |
| IMG-08 | `/image/heic-to-jpg/` | Shared Image Engine + lazy `heic-to@1.5.2` adapter |
| IMG-09 | `/image/png-to-webp/` | Shared Image Engine |
| IMG-10 | `/image/webp-to-jpg/` | Shared Image Engine |
| IMG-11 | `/image/webp-to-png/` | Shared Image Engine |
| IMG-13 | `/image/upscale-image/` | Lazy ONNX super-resolution model |

### PDF — 22

| ID | Route | Engine |
|---|---|---|
| PDF-01 | `/pdf/compress-pdf/` | Server fallback · pikepdf JobBuilder selective image optimization |
| PDF-02 | `/pdf/merge-pdf/` | Shared PDF Engine |
| PDF-03 | `/pdf/split-pdf/` | Shared PDF Engine |
| PDF-05 | `/pdf/pdf-to-jpg/` | Shared PDF Engine |
| PDF-06 | `/pdf/organize-pdf/` | Shared PDF Engine |
| PDF-07 | `/pdf/rotate-pdf/` | Shared PDF Engine |
| PDF-08 | `/pdf/watermark-pdf/` | Shared PDF Engine |
| PDF-09 | `/pdf/jpg-to-pdf/` | Shared PDF Engine |
| PDF-10 | `/pdf/png-to-pdf/` | Shared PDF Engine |
| PDF-11 | `/pdf/webp-to-pdf/` | Shared PDF Engine |
| PDF-12 | `/pdf/pdf-to-png/` | Shared PDF Engine · PDF.js raster render |
| PDF-13 | `/pdf/pdf-to-webp/` | Shared PDF Engine · PDF.js raster render |
| PDF-14 | `/pdf/extract-images-from-pdf/` | Shared PDF Engine · PDF.js embedded raster extraction |
| PDF-15 | `/pdf/add-page-numbers/` | Shared PDF Engine · pdf-lib selectable overlay |
| PDF-16 | `/pdf/header-footer-pdf/` | Shared PDF Engine · pdf-lib selectable overlay |
| PDF-17 | `/pdf/crop-pdf/` | Shared PDF Engine · pdf-lib CropBox edit |
| PDF-18 | `/pdf/pdf-to-text/` | Shared PDF Engine · PDF.js selectable-text extraction |
| PDF-19 | `/pdf/pdf-to-html/` | Shared PDF Engine · PDF.js simple semantic HTML extraction |
| PDF-20 | `/pdf/pdf-metadata-viewer/` | Shared PDF Engine · PDF.js metadata report |
| PDF-21 | `/pdf/clean-pdf-metadata/` | Shared PDF Engine · pdf-lib supported metadata cleanup |
| PDF-22 | `/pdf/txt-to-pdf/` | Shared PDF Engine · pdf-lib text packaging |
| PDF-23 | `/pdf/flatten-pdf/` | Shared PDF Engine · pdf-lib supported form flattening |

### Word and Document — 10

| ID | Route | Engine |
|---|---|---|
| DOC-01 | `/word/docx-to-txt/` | Lazy Mammoth DOCX parser |
| DOC-02 | `/word/docx-to-html/` | Lazy Mammoth DOCX parser |
| DOC-03 | `/word/txt-to-docx/` | Lazy `docx` browser writer |
| DOC-04 | `/word/docx-to-pdf/` | Server fallback · pinned LibreOffice Writer |
| DOC-05 | `/word/pdf-to-docx/` | Server fallback · pinned LibreOffice PDF import |
| DOC-06 | `/word/html-to-docx/` | Local supported HTML-to-DOCX writer |
| DOC-07 | `/word/merge-docx/` | Local DOCX package/document engine |
| DOC-08 | `/word/compress-docx/` | Local DOCX package/media engine |
| DOC-09 | `/word/extract-images-from-docx/` | Local ZIP package media extraction |
| DOC-10 | `/word/docx-metadata-cleaner/` | Local DOCX package metadata cleanup |

### Audio — 4

| ID | Route | Engine |
|---|---|---|
| AUD-01 | `/audio/trim-audio/` | Approved LGPL FFmpeg/WASM audio runtime |
| AUD-02 | `/audio/audio-converter/` | Approved LGPL FFmpeg/WASM audio runtime |
| AUD-03 | `/audio/merge-audio/` | Approved LGPL FFmpeg/WASM audio runtime |
| AUD-04 | `/audio/compress-audio/` | Approved LGPL FFmpeg/WASM audio runtime |

### Video — 5

| ID | Route | Engine |
|---|---|---|
| VID-01 | `/video/compress-video/` | Server fallback · pinned native FFmpeg VP9/Opus container |
| VID-02 | `/video/trim-video/` | Shared LGPL FFmpeg/WASM media runtime · verified keyframe-aligned H.264 stream-copy trim |
| VID-03 | `/video/video-to-mp3/` | Shared LGPL FFmpeg/WASM media runtime · verified H.264/AAC extraction |
| VID-04 | `/video/mov-to-mp4/` | Shared LGPL FFmpeg/WASM media runtime · verified H.264/AAC stream-copy remux |
| VID-05 | `/video/video-converter/` | Shared LGPL FFmpeg/WASM media runtime · verified MP4/MOV H.264 stream-copy remux |

## Removed routes and redirects

| Removed public URL | Permanent redirect |
|---|---|
| `/image/image-converter/` | `/image/` |
| `/pdf/images-to-pdf/` | `/pdf/` |

The replacement routes use fixed input and output formats. No same-format
conversion route or generic conversion card remains in the registry.

## Public trust pages

The production public HTML inventory also includes these four indexable trust
pages outside the tool registry:

- `/about/`
- `/privacy/`
- `/terms/`
- `/open-source/`

Together with the homepage, catalog, five category hubs, and 52 tool routes,
the current sitemap contains 63 canonical indexable URLs. A Contact page is
not published until the owner provides a real support/privacy/legal contact
address or hosted contact URL.

## Server-bound release note

PDF-01, VID-01, DOC-04, and DOC-05 are production-ready at the route/engine
level and disclose temporary upload before processing. Public production
traffic remains gated on the final native-image compliance checklist in
`server/fallback-worker/README.md`.

## Held / disabled

IMG-12 `/image/remove-background/` remains in the source registry and native
release documentation but is not a public route. Its static page is excluded,
it is absent from the catalog, search, internal links, and sitemap, and the
browser fallback client rejects the tool before creating a job. The native
container, real Worker → Queue → R2 → Container lifecycle, cleanup proof,
deployment-class performance, security scan, and final license/compliance
review remain open in `reports/background-removal-native-release-gate.md`.

## PDF capability inventory

### Existing and reused

Merge, split-by-range, organize/delete/duplicate/reorder, rotate, JPG/PNG/WebP
to PDF, PDF to JPG, watermark, and Compress PDF already existed and were not
reimplemented. PDF to DOCX and DOCX to PDF remain canonical Word routes rather
than duplicate PDF-category routes.

### New and implemented

PDF to PNG, PDF to WebP, embedded-image extraction, page numbers,
header/footer, CropBox crop, PDF to Text, PDF to HTML, metadata viewer, metadata
cleaner, TXT to PDF, and supported form flattening. New image outputs are
downloadable individually and as a local ZIP where the route produces multiple
files.

### Redundant or not worth implementing now

“Optimize PDF” would duplicate the existing Compress PDF behavior, so it is not
a second route. A full PDF editor, DRM bypass, and format-keyword variants are
outside the focused intent model.

### Deferred

Password protection/unlock, repair, OCR/searchable PDF, grayscale, general PDF
page resize, and HTML to PDF remain deferred because the current stack does not
provide a sufficiently reliable encrypted-output, repair-recovery, OCR/text-
layer, or layout-preservation contract. The existing Word route remains the
canonical DOCX/PDF conversion surface.

## Unsupported

No implemented route claims to support the deferred capabilities above. No
artificial routes were added to reach a target count, and no route reports a
fake success or exposes an output download without a validated processor.

## Static and SEO inventory

- All public tool routes are generated from production-ready entries in the
  typed registry at build time; held entries remain source-only.
- Each focused conversion route has a unique title, meta description, H1,
  accepted input list, fixed output, FAQ copy, related links, and canonical URL.
- `sitemap.xml` is derived from the current registry plus the four public trust
  pages, so removed generic routes are absent and focused routes are included.
- The old generic URLs remain covered by permanent static redirects and are not
  included in the sitemap.
- Canonical, Open Graph URL, sitemap, and robots URLs use the production origin
  `https://domyfile.web.id` at every build; no environment variable is needed.
- Category and tool pages render visible breadcrumbs and matching
  `BreadcrumbList` JSON-LD. The homepage renders `WebSite` JSON-LD and tool
  pages render registry-driven `WebApplication` JSON-LD.
- Trust pages render visible Home → page breadcrumbs and matching
  `BreadcrumbList` JSON-LD. No `Organization` or `Person` schema is emitted.
- The selected HEIC decoder notice, license, and source-offer assets are copied
  to `dist/runtime/heic-to-1.5.2/` and linked from the Open source & licenses
  page.

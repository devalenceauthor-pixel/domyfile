# DoMyFile V1 route inventory

Audit date: 2026-08-18

The typed registry is the source of truth for the production-ready public tool
set. It currently contains 29 public tool routes, all production-ready, with
two explicitly disclosed temporary server-fallback routes and 27 browser-side
routes. The count is allowed to change when a generic intent is split into a
clearer input-to-output route.

## Production-ready

### Image — 10

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

### PDF and Document — 10

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

Together with the homepage, catalog, four category hubs, and 29 tool routes,
the current sitemap contains 39 canonical indexable URLs. A Contact page is
not published until the owner provides a real support/privacy/legal contact
address or hosted contact URL.

## Server-bound release note

PDF-01 and VID-01 are production-ready at the route/engine level and disclose
temporary upload before processing. Public production traffic remains gated on
the final commercial codec/patent review for H.264 input and the deployment
compliance checklist in `server/fallback-worker/README.md`.

## Unsupported

None. No artificial routes were added to reach a target count, and no route
reports a fake success or exposes an output download without a validated
processor.

## Static and SEO inventory

- All public tool routes are generated from the typed registry at build time.
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

# DoMyFile Phase 7 performance and Core Web Vitals report

Audit date: 2026-08-18

## Scope and outcome

Phase 7 audited the static production build, representative route loading,
heavy-runtime boundaries, mobile layout readiness, and current live asset
delivery. No processing behavior, tool support, SEO copy, route structure, or
completed Phase 1–6 implementation was changed.

One measured initial-load bottleneck was fixed: the header/footer logo was a
1254 × 1254 PNG weighing 583,731 bytes while rendered at 42 × 42 pixels. A
visually equivalent 128 × 128 PNG weighing 14,237 bytes now serves the UI and
favicon. The original high-resolution logo remains the social preview image.

Targeted Cloudflare Pages cache rules were added for fingerprinted Astro
chunks, versioned processing runtimes, and the versioned UI logo. They are
included in the built dist/_headers file and will take effect on the next
deployment.

## Measurement method and field-data availability

Lab measurements used Lighthouse 13.4.1 against the built static preview at
http://127.0.0.1:4321:

- desktop preset;
- Lighthouse default mobile profile, including 412 × 823 screen emulation and
  simulated mobile throttling;
- performance category only;
- initial navigation only, with no file selection or processing action.

Representative routes measured locally:

- homepage, /tools/, /image/;
- lightweight image, HEIC to JPG, Merge PDF;
- Trim Audio, MOV to MP4, Compress PDF, Compress Video;
- About and Privacy.

The current live deployment was also spot-checked with Lighthouse and HTTP
headers. No CrUX or Search Console field Core Web Vitals data was available to
this audit. INP is therefore not a measured field value; TBT and main-thread
work are used only as lab responsiveness proxies.

## Local before/after baseline

Values below are Lighthouse total-byte-weight and LCP measurements. Byte
values are rounded to KiB; timings are rounded to milliseconds.

| Route | Desktop bytes before | Desktop bytes after | Desktop LCP after | Mobile bytes after | Mobile LCP after |
|---|---:|---:|---:|---:|---:|
| Homepage | 613.9 KiB | 57.7 KiB | 307 ms | 43.8 KiB | 1,218 ms |
| /tools/ | 616.9 KiB | 60.8 KiB | 316 ms | 46.6 KiB | 1,221 ms |
| /image/ | 599.2 KiB | 43.1 KiB | 317 ms | 43.1 KiB | 1,297 ms |
| Lightweight image | 614.9 KiB | 58.8 KiB | 332 ms | 57.1 KiB | 1,273 ms |
| HEIC to JPG | 615.6 KiB | 59.5 KiB | 329 ms | 56.9 KiB | 1,208 ms |
| Merge PDF | 615.9 KiB | 59.7 KiB | 332 ms | 56.9 KiB | 1,211 ms |
| Trim Audio | 616.2 KiB | 60.0 KiB | 340 ms | 57.1 KiB | 1,214 ms |
| MOV to MP4 | 616.4 KiB | 60.3 KiB | 331 ms | 57.0 KiB | 1,215 ms |
| Compress PDF | 615.9 KiB | 59.8 KiB | 332 ms | 57.2 KiB | 1,217 ms |
| Compress Video | 616.7 KiB | 60.5 KiB | 333 ms | 57.2 KiB | 1,221 ms |
| About | 590.7 KiB | 34.5 KiB | 319 ms | 34.5 KiB | 1,257 ms |
| Privacy | 590.9 KiB | 34.8 KiB | 314 ms | 34.8 KiB | 1,209 ms |

Post-change local results across all 12 routes:

- desktop LCP: 307–340 ms;
- mobile LCP: 1,208–1,297 ms;
- FCP: 272–300 ms desktop and 982–1,193 ms mobile;
- CLS: 0 for every measured route;
- TBT: 0 ms for every measured route;
- Lighthouse performance score: 100 for every post-change route.

The pre-change mobile run contained a 4.1–4.2 second LCP outlier on several
text-heavy routes. A rerun of Trim Audio measured 1.21 seconds, so that
baseline was noisy; the post-change twelve-route run was consistently
1.21–1.30 seconds.

The UI logo request fell from approximately 584 KiB to 14.2 KiB. This was the
primary byte reduction. Initial JavaScript was unchanged by the fix:

- content/trust pages: approximately 7.7 KiB of JavaScript;
- category and catalog pages: approximately 8.9 KiB;
- tool pages: approximately 28.6 KiB.

## LCP findings

Lighthouse identified static text as the LCP candidate rather than a heavy
processing asset:

- homepage: hero description or nearby hero text;
- category pages: category-context heading;
- tool pages: the tool H1 or intro;
- trust pages: the opening factual paragraph.

The hero is CSS/live markup rather than a blocking raster image. No blocking
font request, processing runtime, or action-time preview was found on the
initial path. The logo reduction removes a large competing request without
changing the visual hierarchy.

The local post-change results meet the LCP readiness target of 2.5 seconds.
Current live desktop spot checks also measured below 1.11 seconds, but the live
deployment still downloads the old 571 KiB logo and must not be treated as the
post-change result until redeployed.

## CLS findings

CLS was 0 across the local desktop/mobile set and the live spot checks.

Stability protections already present and retained:

- the header logo has explicit 42 × 42 dimensions;
- tool icons have explicit dimensions;
- category visual space is reserved by CSS and images are lazy-loaded;
- preview frames reserve minimum space before user files are selected;
- server fallback banners are static before upload;
- no font swap or external font request occurs.

No useful UI was hidden to achieve the CLS result.

## Responsiveness and main-thread work

Post-change desktop main-thread work ranged from 83 ms on trust pages to
448 ms on the homepage. Script evaluation was approximately 4–10 ms per
route, and TBT was 0 ms throughout the navigation audits.

The search/filter controls use small vanilla JavaScript islands. No Astro
client directives are present; static headings, SEO copy, FAQs, breadcrumbs,
cards, and footer remain server-rendered HTML. Tool pages load the shared
workspace shell but do not load a processing engine until the relevant
workspace path needs it.

No file selection, drag/reorder, preview generation, or processing action was
run in this phase. Those interactions remain outside this performance-only
verification scope.

## Bundle and runtime loading audit

The production build contains these large route-lazy assets:

- HEIC adapter chunk: approximately 2.86 MiB;
- PDF.js worker: approximately 1.23 MiB;
- PDF engine chunk: approximately 0.84 MiB;
- second PDF worker support chunk: approximately 0.42 MiB;
- FFmpeg WASM core: approximately 1.51 MiB;
- media engine chunk: approximately 26 KiB.

Initial Lighthouse requests confirmed:

- HEIC to JPG does not request the HEIC adapter before processing;
- PDF routes do not request PDF.js or its workers before a PDF workspace needs
  them;
- audio/video routes do not request FFmpeg, the WASM core, or media engine
  before a preview or processing path needs them;
- Compress PDF and Compress Video load only the normal tool shell and
  server-fallback UI;
- no FFmpeg, HEIC, PDF worker, or media-engine preload/modulepreload was found.

The current lazy boundaries satisfy the architecture requirement that static
content remain lightweight. The large runtime download remains an action-time
cost for users who actually need that format; no safe broad runtime rewrite was
justified by the initial-load audit.

## Fonts

The build contains no Geist/Geist Mono font files, @font-face declarations,
font preloads, or external font requests. The current UI uses a system sans
stack and Geist Mono is only a fallback name for technical metadata.

This produces no font-swap layout shift and no font network cost. Exact Geist
font delivery is a design-parity decision for a later, separately measured
change; it was not introduced merely to improve synthetic scores.

## Images and CSS

- The UI logo now uses the 128 × 128 optimized asset while preserving its
  42 × 42 layout box.
- The original logo remains available for og:image and social previews.
- Tool icons use explicit dimensions and lazy loading.
- Category workflow graphics are below the critical path and lazy-loaded.
- The single compiled stylesheet is approximately 48 KiB on disk and about
  10 KiB in the local Lighthouse transfer breakdown after compression.
- No duplicate stylesheet or framework runtime was found.

## Network and Cloudflare behavior

The current live deployment returns Brotli-compressed HTML, CSS, and
JavaScript. HTML is served with max-age=0 and must-revalidate, which is
appropriate for static HTML that may be redeployed. The current live
fingerprinted Astro CSS/JS and versioned WASM asset responses are still using
short or zero cache windows:

- Astro CSS/JS: public, max-age=14400, must-revalidate;
- FFmpeg WASM: public, max-age=0, must-revalidate;
- old public logo: public, max-age=14400, must-revalidate.

The new public/_headers rules target only:

- /_astro/* fingerprinted build assets;
- the versioned 128 px UI logo;
- the versioned FFmpeg runtime directory;
- the versioned HEIC runtime directory.

They set public, max-age=31556952, immutable. The built dist/_headers file was
verified. Live header verification must be repeated after deployment because
the current production site is serving an older build.

No broad cache rule was added. Redirects, Pages behavior, and server-fallback
endpoints were not changed.

## Mobile findings

Lighthouse mobile audits passed the Core Web Vitals readiness targets on the
post-change local build. A targeted 412 × 823 browser check also confirmed:

- homepage H1, hero search, and category discovery remain present;
- /tools/ contains all 29 static tool cards;
- image, HEIC, PDF, audio, and video workspaces expose their H1, breadcrumb,
  upload zone, and processing control;
- the mobile navigation remains available through the existing menu button;
- no content-only route requires a processing runtime to become usable.

No browser processing action or media preview was executed.

## Live production spot check

The current deployed site was measured separately because it does not yet
contain the Phase 6 build:

- nine live desktop routes measured 627.4–628.1 KiB, with the old logo at
  approximately 571 KiB, LCP 591–1,108 ms, CLS 0, and TBT 0 ms;
- four live mobile routes measured 612.3–627.9 KiB, with LCP 1,710–1,896 ms,
  CLS 0, and TBT 0 ms.

Direct live route checks found:

- /about/ returns 404;
- /privacy/ returns 404;
- /terms/ returns 404;
- /open-source/ returns 404;
- live sitemap.xml contains 35 URLs rather than the current local 39-URL
  inventory;
- live pages still reference the old domyfile-logo.png UI asset.

This is a deployment-state mismatch inherited from the pre-Phase-6
deployment, not a new Phase 7 route or content change.

## Verification run

Passed:

- pnpm check — 86 files, 0 errors, 0 warnings, 0 hints;
- pnpm lint;
- pnpm build — 40 static pages;
- pnpm verify:seo — 39 indexable routes, 39 sitemap URLs, no broken internal
  links;
- pnpm verify:phase2a;
- pnpm verify:phase2b — 29 unique titles/meta/H1s, 116 unique FAQs, top
  similarity 0.249, average 0.057;
- pnpm verify:phase3 — no orphan or weak pages;
- pnpm verify:phase6;
- Lighthouse desktop/mobile representative route audits;
- targeted mobile DOM/layout checks at 412 × 823;
- live HTTP header, asset, route, and sitemap spot checks.

No Image, PDF, HEIC, Audio, Video, FFmpeg, server-fallback, or media
processing regression suite was run.

## Files changed

- public/_headers
- public/assets/domyfile-logo-128.png
- src/components/ui/Brand.astro
- src/layouts/SiteLayout.astro
- reports/seo-phase7.md

## Remaining Phase 7 issues

1. Deploy the verified build before treating the logo reduction, immutable
   asset headers, 39-route sitemap, and Phase 6 trust pages as live.
2. After deployment, recheck Cloudflare response headers for /_astro/*,
   /assets/domyfile-logo-128.png, and the versioned runtime directories.
3. Real INP, CrUX, and Search Console field data remain unavailable; collect
   them after production traffic exists.
4. The original high-resolution social preview logo remains larger than ideal,
   but it is not part of the initial page request and is not a Core Web Vitals
   blocker.

No additional SEO phase has started.

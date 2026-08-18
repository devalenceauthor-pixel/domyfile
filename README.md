# DoMyFile

DoMyFile is a browser-first file utility site for common image, PDF, audio,
and video workflows.

Production site: <https://domyfile.web.id>

## What is included

The current production-ready catalog contains 29 tools:

- **Image** — compress, resize, crop, convert JPG/PNG/WebP, and convert HEIC to JPG.
- **PDF** — compress, merge, split, organize, rotate, watermark, convert PDF to JPG, and create PDFs from JPG/PNG/WebP.
- **Audio** — trim, convert, merge, and compress supported audio formats.
- **Video** — compress, trim, extract MP3, and convert supported MP4/MOV containers.

The complete route and engine inventory is maintained in
[`reports/v1-route-inventory.md`](reports/v1-route-inventory.md).

## Processing and privacy

DoMyFile is local by default. Browser-local tools keep selected files on the
user's device and produce local downloads.

Compress PDF and Compress Video use an explicitly disclosed temporary server
workflow. Uploaded input and generated output are short-lived and cleaned up
through the application lifecycle and storage backstop. See the public
[Privacy page](https://domyfile.web.id/privacy/) for the current distinction.

DoMyFile does not require an account, provide file history, or use uploaded
file content for analytics or model training.

## Development

Install dependencies and start the Astro development server:

```bash
pnpm install
pnpm dev
```

Useful checks:

```bash
pnpm check
pnpm lint
pnpm build
pnpm verify:seo
pnpm verify:phase2a
pnpm verify:phase2b
pnpm verify:phase3
pnpm verify:phase6
```

The static production output is written to `dist/`. Preview it locally with:

```bash
pnpm preview
```

## Deployment

The main site is deployed as a static Cloudflare Pages project. After a
verified build, deploy the `dist/` directory to the `domyfile` Pages project:

```bash
wrangler pages deploy dist --project-name domyfile
```

The optional server fallback plane is maintained separately under
[`server/fallback-worker/`](server/fallback-worker/). It is reserved for
Compress PDF and Compress Video and requires the credentials, storage, queue,
license, and compliance gates documented in its README before production use.

## Repository structure

- `src/` — Astro pages, shared UI, tool registry, processing engines, and workers.
- `public/` — static graphics, runtime assets, license notices, redirects, and headers.
- `scripts/` — build and SEO verification utilities.
- `reports/` — route, engine, licensing, and SEO audit records.
- `tests/` — unit fixtures and browser test specifications.
- `agents/` — product, architecture, design, and SEO project documentation.

## Trust and licensing

Public trust information is available at:

- [About](https://domyfile.web.id/about/)
- [Privacy](https://domyfile.web.id/privacy/)
- [Terms](https://domyfile.web.id/terms/)
- [Open source and licenses](https://domyfile.web.id/open-source/)

Third-party license texts, notices, and source-offer records are kept with the
corresponding runtime assets under `public/runtime/`.

For support, privacy questions, legal or licensing notices, and general
feedback, contact `support@domyfile.web.id`.

# DoMyFile

DoMyFile is a browser-first file utility site for common image, PDF,
Word/document, audio, and video workflows.

Production site: <https://domyfile.web.id>

## What is included

The current production-ready catalog contains 52 focused tools:

- **Image** — compress, resize, crop, run model-backed 3× super-resolution, and convert supported JPG/PNG/WebP/HEIC files.
- **PDF** — compress, merge, split, organize, rotate, watermark, crop, number, extract, clean, flatten, render PDF pages to JPG/PNG/WebP, extract text/HTML/images/metadata, and create PDFs from JPG/PNG/WebP/TXT.
- **Word & Document** — convert DOCX/PDF with the temporary native document path, convert TXT/HTML/DOCX locally, merge documents, extract images, compress supported media, and clean supported metadata.
- **Audio** — trim, convert, merge, and compress supported audio formats.
- **Video** — compress, trim, extract MP3, and convert supported MP4/MOV containers.

The complete route and engine inventory is maintained in
[`reports/v1-route-inventory.md`](reports/v1-route-inventory.md).

## Processing and privacy

DoMyFile is local by default. Browser-local tools keep selected files on the
user's device and produce local downloads.

Compress PDF, Compress Video, DOCX to PDF, and PDF to DOCX use an explicitly
disclosed temporary server workflow. Uploaded input and generated output are
short-lived and cleaned up through the application lifecycle and storage
backstop. Remove Background remains held and does not accept uploads. See the public
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
pnpm verify:new
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
Compress PDF, Compress Video, DOCX to PDF, and PDF to DOCX. The held
Remove Background implementation remains in source but must not receive
public traffic until the container, lifecycle, performance, security, and
license gates documented in its release report are complete.

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

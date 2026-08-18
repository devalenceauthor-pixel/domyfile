# DoMyFile Phase 6 trust and transparency report

## Scope and outcome

Phase 6 strengthened factual product identity, privacy transparency, terms
visibility, licensing navigation, and trust-page discoverability. No file
processing behavior, tool support matrix, or processing engine was changed.

The public indexable inventory increased from 35 product pages to 39 pages by
adding four trust pages:

- `/about/`
- `/privacy/`
- `/terms/`
- `/open-source/`

## About status

Added `/about/` with factual descriptions of:

- DoMyFile as a browser-first file toolkit;
- Image, PDF & Document, Audio, and Video categories;
- the current local-by-default processing model;
- the two temporary server-bound compression tools;
- the canonical website `https://domyfile.web.id`;
- supported-format and limitation transparency.

No company, founder, team, address, founding story, credential, customer, or
social-proof claim was added.

## Contact status

support@domyfile.web.id is the public contact destination for support, privacy
questions, legal/licensing notices, and general feedback.

Cloudflare Email Routing forwards the address to a verified destination inbox,
and end-to-end inbound delivery has been tested successfully. The footer and
relevant trust pages expose it as a mailto link. No personal address or
unnecessary personal information is published.

## Privacy changes

Added `/privacy/` with separate factual sections for:

### Browser-local tools

- selected file bytes remain in the browser/device path;
- no upload to the DoMyFile processing service;
- generated results are offered as local downloads;
- browser limits and unsupported/corrupt inputs may prevent a result.

### Temporary server tools

Compress PDF and Compress Video are identified by name. The page explains
that:

- upload occurs only to create the requested compressed result;
- the temporary workspace is private and job-scoped;
- the current application job window is 15 minutes;
- input/output cleanup runs on success, download, failure, cancellation, and
  expiry;
- a storage lifecycle rule is a backstop for delayed cleanup and is configured
  for no more than one day;
- temporary processing is not file history or permanent storage.

The page also states that file contents, filenames, local paths, extracted
text, media frames, and document content metadata are not sent to analytics,
training systems, or third-party conversion services. It distinguishes
non-content operational/security metadata from file contents rather than
claiming that infrastructure produces no logs at all.

The two server-bound tool disclosures were also made more specific before the
upload/process action: the upload is only for the compression result and
temporary data is deleted when the job completes or expires.

## Terms / acceptable-use recommendation

Added `/terms/` as a concise product-use summary covering:

- lawful file use and user rights/responsibility;
- prohibited abuse, malware, disruption, and control bypass;
- browser-local versus temporary server processing;
- temporary cleanup and no file-history promise;
- service availability, resource limits, unsupported/corrupt/encrypted files;
- no guarantee that every file will process or compress usefully.

The page clearly states that it is not a complete legal agreement and requires
professional legal review before being treated as binding terms. Legal notices
can be sent to support@domyfile.web.id; professional legal review is still
required before treating the page as binding terms.

## License and open-source transparency

Added `/open-source/` as a consolidated index for:

- the versioned FFmpeg/WASM runtime license, LGPL text, LAME notices,
  Emscripten notices, third-party notices, and corresponding-source offer;
- the HEIC decoder license, notice, and source-offer files;
- pinned native fallback dependencies for Compress PDF and Compress Video;
- exact upstream source links for FFmpeg, libvpx, libopus, pikepdf, Pillow,
  and pypdf.

The page preserves the distinction between a license classification and
commercial codec/patent clearance. It does not claim that the repository's
source-offer records alone satisfy every deployed-release obligation. The
exact runtime texts and release-specific corresponding-source bundle remain
authoritative.

The raw runtime files remain publicly accessible under their versioned
`/runtime/` paths. No license text was rewritten or replaced with a summary.

## Server-processing disclosure status

Passed. Compress PDF and Compress Video continue to show a temporary-upload
banner before the workspace upload action. The page-level content and new
Privacy page use the same local-versus-temporary-server distinction.

Global copy was corrected to say **local by default** rather than implying
that every route is client-side only.

## Trust navigation changes

The footer now provides compact links to:

- About DoMyFile;
- Privacy;
- Contact support;
- Terms of use;
- Open source & licenses.

The homepage privacy section links to the full Privacy page, and the Privacy
and Terms pages expose the same support destination.

## Entity and schema decision

- Existing homepage `WebSite` structured data remains the factual product-level
  identity signal.
- New trust pages use visible Home → page breadcrumbs and matching
  `BreadcrumbList` JSON-LD.
- No `Organization` or `Person` schema was added because the project does not
  contain verified organization, founder, employee, address, telephone, or
  social-account facts.

## Author and expertise strategy

No authors were attached to tool pages. DoMyFile benefits more from factual
product-level transparency, processing-boundary documentation, supported
format matrices, limitations, and license/source records than from synthetic
biographies.

## External authority plan for later phases

No backlinks or external listings were created. Future legitimate options are:

- accurate software/product directories;
- developer and product-launch platforms with a genuine product listing;
- relevant technical communities where DoMyFile can answer questions usefully;
- independent editorial reviews only when earned through a real product and
  verifiable experience.

Avoid paid or spam link schemes, mass directory submissions, fabricated
reviews, and undisclosed promotion.

## Verification run

Completed:

- `pnpm check`
- `pnpm lint`
- `pnpm build` — 40 static pages generated, including 39 indexable routes and
  the intentional 404 page
- `pnpm verify:seo` — 39 indexable routes, 29 tool routes, 39 sitemap URLs, no
  broken internal links
- `pnpm verify:phase2a`
- `pnpm verify:phase2b`
- `pnpm verify:phase3` — no orphan or weak pages
- `pnpm verify:phase6` — trust-page metadata, breadcrumbs/schema, privacy/
  terms/license markers, server disclosures, and internal links

No processing regression suites, media E2E tests, or file-processing tests were
run.

Follow-up verification after publishing the confirmed contact destination and
updating the public trust references:

- pnpm check — 86 files, 0 errors, 0 warnings, 0 hints
- pnpm lint — passed
- pnpm build — 40 static pages generated
- pnpm verify:seo — 39 indexable routes, 29 tool routes, 39 sitemap URLs, no
  broken internal links
- pnpm verify:phase6 — contact/trust-page references, metadata, breadcrumbs/
  schema, privacy/terms/license markers, server disclosures, and internal
  links passed

No processing regression suites were run for this follow-up.

## Remaining Phase 6 issues

1. The Terms page needs professional legal review before being treated as
   binding terms.
2. The exact corresponding-source bundle and commercial codec/patent review
   for the deployed native fallback image remain release/compliance work.

Phase 7 has not started.

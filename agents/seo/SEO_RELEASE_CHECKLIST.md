# SEO Release Checklist

Use this gate for every new or materially changed public route, tool, page, or content template. Adapt the commands and thresholds to the project; do not copy DoMyFile-specific counts as universal requirements.

## Release record

- Route(s):
- Page type:
- Owner:
- Primary intent:
- Indexability decision: `indexable` / `noindex` / `redirect` / `404-410` / `private`
- Production canonical:
- Source-of-truth content row:
- Related hub/parent:
- Verification date:

## 1. Scope and factual source

- [ ] The route has one clear user/search intent.
- [ ] The route is present in the route inventory/registry.
- [ ] The content matrix is complete for the page type.
- [ ] Inputs, outputs, controls, batch behavior, limitations, and result behavior match the implementation.
- [ ] Processing/privacy mode is recorded accurately: local, temporary server, persistent, or not applicable.
- [ ] Any owner, legal, licensing, or compliance fact needed for publication is confirmed.

## 2. Route and indexability

- [ ] The route's status and indexability match the release record.
- [ ] An indexable page returns crawlable HTML with useful content in the initial response.
- [ ] A noindex/private page is not accidentally in the sitemap.
- [ ] A redirect/removed route is not self-canonical and is not in the sitemap.
- [ ] The route is linked from an appropriate crawlable hub or parent page.
- [ ] No broken internal link, orphan route, stale host, localhost URL, or accidental `noindex` remains.

## 3. Intent and content quality

- [ ] Title, meta description, and H1 are unique, natural, and match the primary intent.
- [ ] The body explains the actual task, supported inputs/outputs, important controls, tradeoffs, limitations, privacy mode, and result.
- [ ] Copy is meaningfully different from sibling pages; replacing only a format name is not enough.
- [ ] FAQ questions/answers are operation-specific where FAQs are used; generic privacy text does not dominate every page.
- [ ] Overlapping routes were consolidated or explicitly differentiated in copy and links.
- [ ] No unsupported claims such as “best”, “fastest”, “unlimited”, “lossless”, or “local-only” were added.
- [ ] A static similarity/duplicate-content check was run for the affected sibling cluster.

## 4. Metadata and technical signals

- [ ] Exactly one title, meta description, and H1 are rendered.
- [ ] Exactly one self-referencing canonical is rendered for an indexable route.
- [ ] Canonical uses the production origin and agreed trailing-slash policy.
- [ ] `og:url` matches canonical; social title/description are sensible.
- [ ] Breadcrumbs are visible and crawlable where the information architecture has hierarchy.
- [ ] Structured data is valid, visible-content-backed, and free of invented ratings, reviews, prices, people, or organizations.
- [ ] Sitemap inclusion/exclusion matches the indexability decision.
- [ ] Robots and managed CDN/host directives do not accidentally block the intended page.

## 5. Internal-link graph

- [ ] The page receives at least one contextual inbound link from a relevant hub or page.
- [ ] Important pages receive enough contextual links for the project's scale; do not inflate counts with repeated blocks.
- [ ] Related links represent the next likely user action or a genuine adjacent intent.
- [ ] Cross-category links are workflow-relevant, not SEO-only.
- [ ] Anchor text names the destination; no “click here”, “try this”, or generic repeated labels.
- [ ] Static graph verification reports no new orphan or weak page.

## 6. AI/search access policy

- [ ] The effective crawler policy was reviewed for the page/domain, including managed robots if applicable.
- [ ] Search/discovery, user-triggered fetch, AI input/grounding, and training were considered separately.
- [ ] The change does not unblock training access merely to pursue search visibility.
- [ ] Content Signals, robots directives, and WAF/AI controls are not being treated as interchangeable.
- [ ] No claim is made that a crawler permission guarantees AI inclusion, citation, or ranking.

## 7. Trust and privacy

- [ ] If the route uploads files, the temporary server-processing disclosure appears before the action.
- [ ] Local-processing claims are true for this exact route; global “everything stays on-device” wording is not used incorrectly.
- [ ] Privacy, Terms, Contact, and open-source/licensing references remain consistent.
- [ ] Any public contact destination is real and monitored.
- [ ] No fake testimonials, reviews, users, company history, authors, credentials, or social proof were introduced.

## 8. Performance and UX

- [ ] The page is usable before any heavy optional runtime is loaded.
- [ ] PDF/media/WASM/decoder runtimes are route-lazy and, where appropriate, action-lazy.
- [ ] LCP, layout stability, and responsiveness were checked on a representative mobile viewport.
- [ ] Target readiness is documented: LCP ≤ 2.5 s, INP < 200 ms, CLS < 0.1, or a project-specific alternative with justification.
- [ ] Images, fonts, previews, inserted rows, banners, and breadcrumbs do not cause avoidable layout shift.
- [ ] No useful UI was hidden and no processing was moved to the main thread solely to improve a synthetic score.

## 9. Verification

- [ ] Production build passes.
- [ ] Type/check and affected lint pass.
- [ ] Static SEO verifier passes.
- [ ] Route, canonical, metadata, sitemap, robots, and structured-data audits pass.
- [ ] Internal-link and content-similarity audits pass.
- [ ] Targeted browser/live smoke checks pass where static checks cannot prove behavior.
- [ ] Full product-processing suites were skipped unless this change directly affects processing behavior.

## 10. Production and monitoring

- [ ] Deployment completed from the verified build.
- [ ] Production route returns the expected status and canonical HTML.
- [ ] Sitemap and robots are live on the production host.
- [ ] Redirects and managed CDN behavior were checked in production.
- [ ] Search Console sitemap/indexing action was performed only by an authenticated owner/agent with access; otherwise it is recorded as a manual follow-up.
- [ ] Post-release monitoring owner and review date are recorded.
- [ ] Not-yet-available Search Console data is labeled `not available`, not zero.

## Stop-ship conditions

Do not release the route as indexable if any of these is true:

- its primary intent or factual content row is missing;
- its processing/privacy claims are unverified;
- it is a near-duplicate route with no user-visible distinction;
- canonical, sitemap, robots, and indexability decisions disagree;
- it is orphaned or only reachable through JavaScript interactions;
- it exposes invented trust/schema claims;
- its production response differs from the verified build in a way that affects SEO;
- a required owner/legal/compliance decision is still unresolved.

## Evidence to attach to the change

- route/content-matrix diff;
- before/after metadata and similarity results;
- internal-link graph delta;
- verification commands/results;
- production URL smoke result;
- Search Console action or manual follow-up;
- remaining risks and owner decisions.

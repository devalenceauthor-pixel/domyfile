# Universal SEO Framework

Version 1.0 — distilled from the DoMyFile SEO Phase 1–7 reports and generalized for reuse.

This is an operating framework for public websites, tools, and content-heavy applications. It is not a promise of rankings. It defines the evidence, decisions, and release gates needed to make pages crawlable, useful, understandable, trustworthy, and measurable.

`Universal rule` means a reusable default. `DoMyFile evidence` means a measured case-study result; it is not a universal target or a value to copy blindly.

## 1. Operating principles

1. Fix the page model before polishing copy. A page that is not reachable, indexable, canonical, or distinct cannot be rescued by better keywords.
2. Use facts as the source of truth. Every public claim about inputs, outputs, limits, privacy, processing, licensing, or performance must be supported by the implementation or an owner-provided fact.
3. Give each indexable route one primary search intent. Consolidate overlapping routes or make the difference explicit and useful.
4. Measure before and after. Record the baseline, the change, the verification, and any remaining decision. Do not report unavailable data as zero or as a pass.
5. Treat shared UI as a component, not as the page's SEO value. Reusable controls are fine; reusable body copy, FAQs, and metadata need review for duplication.
6. Separate discovery from ranking. Search Console, sitemaps, structured data, and AI crawler access improve discoverability and understanding; none guarantees a ranking or inclusion.
7. Separate AI search/grounding from AI training. Make a deliberate crawler policy instead of allowing or blocking every AI crawler as a group.
8. Keep static SEO work isolated from product behavior. Do not run or change file-processing, payment, or other unrelated systems unless the SEO change directly affects them.

## 2. Project setup: establish the page model

Before changing routes or content, create a route inventory. The inventory is the contract between the product, content, and SEO implementation.

For every public route, record:

| Field | Required decision |
|---|---|
| URL/slug | Stable production path and trailing-slash policy |
| Page type | Homepage, hub, tool, documentation, trust page, campaign, redirect, or utility |
| Indexability | Indexable, noindex, redirect, 404/410, or private/app-only |
| Primary intent | The single job the page satisfies |
| Audience/problem | Who needs it and what problem they are solving |
| Inputs/outputs | What the page accepts and produces, where relevant |
| Processing/privacy mode | Local, server-side temporary, persistent, or not applicable |
| Canonical | The one preferred URL |
| Parent/hub | The page that gives it topical context |
| Related pages | Contextual links with a reason for each relationship |
| Structured data | Only types supported by visible facts |
| Evidence | Source file, registry entry, owner fact, or verification result |

Do not create an indexable route until its primary intent and factual row are complete. Do not create keyword-variant routes whose only difference is a modifier such as “free”, “online”, or “fast”.

### Indexability decisions

- Indexable pages belong in the sitemap, have a self-referencing canonical, and are reachable through crawlable links.
- Redirects, noindex pages, 404/410 responses, and private workspaces do not belong in the sitemap.
- A page that is useful to users but not intended for search can remain accessible while being explicitly marked noindex.
- Do not use JavaScript-only visibility to decide what a crawler should understand. The initial HTML should contain the correct page content for the route.

## 3. The seven-phase workflow

Run the phases in order, but keep them repeatable. A new route normally goes through the release checklist rather than triggering a full-site rewrite.

### Phase 1 — Technical SEO baseline

#### Crawlability and route correctness

- Enumerate routes from the registry/build output as well as navigation.
- Verify every intended indexable route returns the expected HTML response and is not accidentally `noindex`.
- Ensure important pages are reachable with normal crawlable `<a href>` links.
- Check for broken internal links, orphan pages, stale routes, accidental localhost/example hosts, and client-only pages that expose no useful HTML.

#### Canonicals, metadata, and redirects

- Use one canonical production origin and one trailing-slash policy.
- Put exactly one self-referencing canonical on each indexable page.
- Keep `og:url` aligned with the canonical.
- Prevent query parameters and alternate hosts from creating competing canonical signals.
- Send removed or renamed routes through a direct, permanent redirect to the closest valid replacement. Avoid chains and loops.
- Check both custom-domain and legacy-host behavior when a CDN or host-level redirect is involved.

#### Sitemap and robots

- Generate the sitemap from the same route/indexability source of truth.
- Include only canonical, public, indexable production URLs.
- Declare the absolute sitemap URL in `robots.txt`.
- Allow ordinary search crawlers unless a documented product policy says otherwise.
- Inspect the effective production `robots.txt`, including managed CDN/host directives. A repository file may not override a managed layer.
- Treat robots directives and Content Signals as access/usage preferences, not universal technical enforcement. Use the CDN/WAF control when actual enforcement is required.

#### Structured data and breadcrumbs

- Add only schema types supported by visible, factual content.
- Use shared helpers driven by the route/content registry.
- Do not invent ratings, reviews, download counts, prices, authors, organizations, addresses, or social profiles.
- Add visible breadcrumbs where the information architecture has hierarchy, for example `Home → Category → Tool`, and keep the `BreadcrumbList` aligned with the visible links.

#### Phase 1 acceptance gate

The phase passes when the route inventory, live HTML, canonical policy, redirects, sitemap, robots policy, structured data, breadcrumbs, and metadata audit agree. A build-only pass is not enough if deployment can change the response.

### Phase 2 — Factual content architecture and on-page intent

Create one structured content matrix for every indexable page. Store it in the project's source of truth, not only in generated templates.

Minimum fields for a tool or task page:

```text
slug
category
primary_intent
accepted_input
output
processing_mode
key_controls
batch_behavior
quality_or_compatibility_tradeoffs
limits_and_unsupported_cases
result_or_download_behavior
operation_specific_faq_topics
contextual_related_tools
long_tail_opportunity
canonical_decision
evidence/source
```

Content should explain the actual task, inputs, outputs, controls, batch behavior, tradeoffs, limitations, processing/privacy mode, and result. Keep it concise; usefulness matters more than word count.

#### Differentiation rules

- One route should have one primary intent.
- If two routes share functionality, either consolidate them or explain the user-visible difference in the title, H1, body, FAQs, and internal links.
- Titles, meta descriptions, and H1s must be unique and natural, but metadata uniqueness alone does not make pages distinct.
- A shared workflow such as “Select → Configure → Download” may remain in the UI; it must not be the main differentiator for every page.
- Use operation-specific FAQs. A shared privacy question can be useful, but a page should not inherit the same FAQ set merely because it shares a component.
- Never claim “best”, “fastest”, “unlimited”, “lossless”, “secure”, or “local-only” unless the claim is provable for that exact route.

#### Anti-duplication guardrails

Audit at least:

- initial/static HTML for category and hub pages;
- repeated body paragraphs and workflow instructions;
- repeated FAQ questions and answers;
- repeated metadata suffixes;
- pairwise or cluster similarity among sibling pages;
- intent overlap and cannibalization candidates.

Use the baseline to find suspicious clusters, not as a reason to add filler until an arbitrary score is reached. Review the meaning of the pages and improve the factual differences.

#### Category/hub pages

- A category page should contain only the relevant entities in its initial HTML.
- The all-items catalog may remain on a master hub, but do not ship every category's full card list into every category page and hide it with JavaScript.
- Add short, factual category context: what the category handles, supported families, major task groups, and relevant processing/privacy notes.
- Hubs should help users and crawlers choose the next page; they are not a place for long SEO filler.

### Phase 3 — Contextual internal-link graph

Model internal links as a graph, not as a pile of repeated “related tools” blocks.

Universal requirements:

- Every indexable page is reachable from at least one crawlable hub or parent.
- Important pages receive contextual inbound links, not only a generic catalog link.
- Category hubs link to their own relevant pages.
- Related links reflect the next likely user action or a genuine adjacent intent.
- Cross-category links are added only when a workflow continues naturally.
- Anchors name the destination clearly; avoid “click here”, “try this”, and repeated generic labels.
- Generate a static graph report with inbound links, outbound contextual links, orphan pages, weak pages, and hub-to-page relationships.
- Set a project-specific minimum for contextual inbound links. Do not maximize link counts or add sitewide repetition merely to improve a metric.

### Phase 4 — Search Console and indexing workflow

Run this after the production foundation is live.

1. Create and verify the appropriate property, preferably a domain property when the owner controls DNS.
2. Submit the one canonical production sitemap.
3. Confirm the sitemap is read successfully.
4. Inspect a small, representative priority set: homepage, master hub, category hubs, and several high-intent pages.
5. Request indexing only when useful and access is available; do not submit every URL repeatedly.
6. Record indexed/excluded pages, impressions, clicks, CTR, position, queries, landing pages, crawl issues, canonical issues, and sitemap status.
7. Review at sensible intervals such as 7, 14, and 28 days, then adjust based on observed queries and page performance.

Rules:

- A sitemap is a discovery hint, not an indexing or ranking guarantee.
- If the agent has no authenticated Search Console access, it must not claim that a property was verified, a sitemap was submitted, or an indexing request was made.
- Before data exists, write `not available` rather than `0`.
- Do not rewrite useful pages solely because they are not indexed immediately. Diagnose canonical, robots, page value, links, and crawl status first.

### Phase 5 — AI discovery and crawler policy

Maintain a crawler policy matrix. Classify each relevant operator using current primary documentation:

| Class | Meaning |
|---|---|
| Search/discovery | Builds a search index or returns links/excerpts |
| User-triggered fetch | Retrieves a page because a user requested it |
| AI input/grounding | Uses current content for retrieval or generated answers |
| Training | Uses content for model training or fine-tuning |
| Unknown/mixed | Purpose is unclear or controls are combined |

Then decide, per operator:

- whether public search discovery is allowed;
- whether user-triggered access is allowed;
- whether real-time grounding is allowed;
- whether training is allowed;
- whether the distinction can actually be enforced;
- what owner decision is required when controls are combined.

Do not unblock every AI bot to chase visibility. Do not assume blocking a training token removes a site from normal search. Do not claim that allowing a crawler guarantees inclusion in an AI answer.

Where supported, keep the policy explicit: search allowed, AI input/grounding allowed only when intended, training disallowed where separable, and unknown/mixed cases documented for owner review. Treat Cloudflare/host-managed robots, Content Signals, and WAF/AI Crawl Control as separate layers.

Make pages easy to understand without AI-specific filler: clear H1, task summary, supported inputs/outputs, limitations, privacy mode, useful FAQs, semantic headings, crawlable links, and consistent structured data. Never add hidden text.

### Phase 6 — Trust, transparency, and compliance boundaries

Provide a factual trust layer appropriate to the product:

- About/product identity: what the product does and what it does not claim.
- Contact: a real, monitored path for support, privacy, legal, and licensing questions.
- Privacy: distinguish local processing from temporary server processing; explain purpose, lifecycle, deletion, operational metadata, analytics, and training use only as supported by the architecture.
- Terms/acceptable use: cover lawful use, user responsibility, availability, limits, temporary processing, and unsupported/corrupt inputs. Flag the need for professional legal review.
- Open source/licensing: preserve exact notices and source-offer obligations; do not summarize obligations inaccurately.
- Server-processing disclosure: show it before upload/process actions, not only in a footer.
- Entity/schema accuracy: never manufacture a founder, company, address, phone, social profile, review, or credential.

Keep legal, licensing, patent, and codec compliance decisions visible as separate owner/compliance work. Do not treat a technically complete trust page as legal approval.

### Phase 7 — Performance and Core Web Vitals release gate

Measure representative routes on desktop and mobile. Distinguish lab metrics from field data; never fabricate field data.

Target readiness values used in the DoMyFile work:

- LCP ≤ 2.5 s
- INP < 200 ms
- CLS < 0.1

TBT is a useful lab responsiveness proxy, not a Core Web Vital. Record FCP, transferred bytes, critical requests, JS execution, and route/runtime chunks when useful.

Audit and protect:

- the actual LCP element, fonts, CSS, logo, and above-the-fold assets;
- layout shifts from fonts, images, previews, banners, breadcrumbs, and inserted rows;
- unnecessary hydration and main-thread work;
- heavy runtimes, WASM, PDF workers, media engines, and decoders;
- mobile initial viewport and interaction readiness;
- hashed asset caching and CDN behavior;
- loading and cleanup behavior for heavy tools.

Heavy processing should remain route-lazy and, where appropriate, action-lazy. Do not preload a runtime that the user may never use. Do not chase a synthetic score by hiding useful UI, degrading visible quality, or moving processing onto the main thread. Do not add broad CDN cache rules without a measured need.

## 4. Verification and evidence standard

Every phase report should contain:

1. Scope and explicit non-goals.
2. Baseline measurements and the measurement method.
3. Decisions made and why.
4. Files/routes/configuration changed.
5. Before-and-after results.
6. Verification actually run, including what was deliberately not run.
7. Production status versus local/build status.
8. Remaining blockers, owner inputs, legal/compliance items, and follow-up monitoring.

For a static SEO change, the default verification set is build, type/check, lint, route inventory, canonical/metadata audit, sitemap, robots, structured data, internal links, content-duplication checks, and targeted live smoke checks. Full product-processing suites are out of scope unless the change touches processing behavior.

## 5. DoMyFile evidence: what the framework was distilled from

The following results are reported case-study evidence. They demonstrate the method; they are not universal quotas.

| Area | Reported DoMyFile evidence | Reusable lesson |
|---|---|---|
| Technical baseline | 38 HTML files: 35 indexable pages, 29 tool pages, 4 category pages, `/tools/`, and the homepage; redirects/404 excluded | Inventory the build, then decide indexability explicitly |
| Category duplication | Category pages initially shipped all 29 cards in static HTML; raw word overlap was approximately 99.2–99.6% | Render the correct entities in the initial HTML; do not rely on client-side hiding |
| Content quality | 20/29 pages shared the same three FAQs; 154 of 406 FAQ pairs had similarity ≥ 0.75; generic clusters were around 0.93–0.98 | Audit supporting copy, not only title/meta/H1 |
| Content result | 29/29 tool pages covered; FAQ sets went from 23 unique questions to 116/116 unique; highest similarity fell 0.935→0.249 and average 0.402→0.057 | Use a factual matrix and intent-specific copy; measure before/after |
| Intent model | MOV→MP4 stayed directional while Video Converter remained broader; Compress vs Resize and PDF/Audio operations were separated | Keep routes only when the user-visible intent is actually distinct |
| Internal graph | 29 direct category-to-tool links, 96 contextual outbound tool links, every tool had at least 3 contextual inbound links, 0 orphan and 0 weak pages | Use a graph report and contextual discovery, not repeated link blocks |
| Search Console | Production readiness initially covered 35 canonical URLs; the domain property was verified through DNS, the sitemap was submitted, and its status became Success | Separate technical readiness, owner actions, and observed indexing data |
| AI policy | Search/discovery was kept separate from training; examples distinguished OAI-SearchBot/GPTBot and Googlebot/Google-Extended; Content Signals were treated as supplementary | Classify crawler purpose and document tradeoffs per operator |
| Trust layer | `/about/`, `/privacy/`, `/terms/`, and `/open-source/` were added; server-processed PDF/video tools disclosed temporary upload; no invented Organization/Person facts were added | Trust is factual transparency, not fabricated authority |
| Performance | Logo reduced from 584 KB to about 14 KB; local mobile LCP was reported around 1.21–1.30 s, CLS 0, TBT 0; heavy runtimes stayed lazy | Optimize measured bottlenecks while preserving UX and processing architecture |
| Final production proof | Cloudflare Pages production reported successful deployment; final sitemap had 39 canonical URLs; trust pages returned 200; optimized logo was live at 14,237 bytes; immutable caching was verified | Recheck the deployed response after local/build work |

## 6. Adaptation guide for another project

Copy the workflow, not the DoMyFile nouns or counts.

Replace these project-specific inputs:

- canonical origin and host/CDN behavior;
- route registry and page types;
- content matrix fields required by the product;
- privacy/processing modes;
- category/hub taxonomy;
- meaningful related-page relationships;
- crawler policy and owner preferences;
- trust/legal/licensing facts;
- representative performance routes and thresholds;
- verification commands and production smoke checks.

Keep these invariants:

- facts before copy;
- one intent per indexable route;
- correct initial HTML;
- canonical/sitemap/robots agreement;
- contextual internal-link graph;
- explicit AI policy;
- factual trust pages;
- measured performance gate;
- evidence-backed release notes.

The companion `SEO_RELEASE_CHECKLIST.md` turns these invariants into a route-level gate. `AGENTS_SEO_RULES.md` is the compact version for an agent instruction file.

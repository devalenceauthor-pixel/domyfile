# SEO Phase 5: AI discovery and crawler policy

## Scope and outcome

Phase 5 audited DoMyFile's live crawler policy, Cloudflare-managed robots
behavior, AI-readable page structure, and current metadata. No processing
behavior or broad Phase 2B content was changed.

The current policy allows normal search and selected AI search/user access
while blocking separately identifiable training crawlers. No technical
indexing blocker was found.

## Crawler policy matrix

| Crawler | Classification | Effective policy | Phase 5 position |
|---|---|---:|---|
| Googlebot | Search/discovery | Allow | Keep allowed. |
| OAI-SearchBot | ChatGPT Search/discovery | Allow | Keep allowed; access does not guarantee inclusion. [OpenAI crawler guidance](https://developers.openai.com/api/docs/bots) |
| GPTBot | Training | Block | Keep blocked. |
| ChatGPT-User | User-triggered fetch/grounding | Allow | Appropriate; user-initiated requests may not be governed by robots.txt. |
| Google-Extended | Gemini training and Gemini/Vertex grounding | Block | Keep blocked unless the owner accepts both uses. This does not affect Google Search indexing or visibility in Google Search AI features such as AI Overviews and AI Mode, which use Google Search systems. [Google crawler guidance](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers) |
| ClaudeBot | Training | Block | Keep blocked. |
| Claude-SearchBot | Search/discovery | Wildcard allow | Keep allowed. |
| Claude-User | User-triggered fetch | Wildcard allow | Keep allowed. [Anthropic crawler controls](https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler) |
| PerplexityBot | Search/discovery; not foundation-model training | Wildcard allow | Keep allowed. |
| Perplexity-User | User-triggered fetch | Wildcard allow | Keep allowed. [Perplexity crawler documentation](https://docs.perplexity.ai/docs/resources/perplexity-crawlers) |
| Amazonbot | Amazon crawling; may support training | Block | Keep blocked. |
| Amzn-SearchBot | Amazon search | Wildcard allow | Keep allowed. |
| Amzn-User | User-triggered Alexa fetch | Wildcard allow | Keep allowed. [Amazonbot documentation](https://developer.amazon.com/en-US/amazonbot) |
| Applebot | Apple Search/discovery and current web context | Wildcard allow | Keep allowed. |
| Applebot-Extended | Does not crawl pages; controls whether Applebot-crawled content may be used to train Apple's foundation models | Block | Keep blocked. This matches the policy of allowing search/discovery while disallowing AI training. [Applebot documentation](https://developer.apple.com/applebot/) |
| meta-externalagent | AI crawler purpose not sufficiently separated in public Meta documentation | Block | Keep blocked. [Meta robots.txt](https://www.facebook.com/robots.txt) |
| meta-externalfetcher | AI assistant purpose not sufficiently documented for a separate training/grounding decision | Wildcard allow | No automatic change; user decision required. |
| Bingbot | Search/discovery | Wildcard allow | Keep allowed. [Microsoft crawler documentation](https://www.bing.com/webmasters/help/help/which-crawlers-does-bing-use-8c184ec0) |
| Google-CloudVertexBot | Owner-requested Vertex AI agent access | Wildcard allow | No normal Google Search impact; no training claim made. |
| Bytespider / CCBot | AI/archive crawler purpose not independently verified here | Blocked by Cloudflare | Keep blocked. |

## Current and recommended robots policy

The live response is HTTP 200 and includes Cloudflare-managed directives:

```text
Content-Signal: search=yes,ai-train=no,use=reference
```

Normal search access is allowed. OAI-SearchBot and ChatGPT-User are allowed.
GPTBot, Google-Extended, ClaudeBot, Amazonbot, Applebot-Extended, Bytespider,
CCBot, and meta-externalagent remain blocked.

The local robots response does not contain a Content-Signal line. Cloudflare
prepends its managed policy, so repository rules cannot override managed
Cloudflare blocks. Robots directives are access preferences rather than
technical enforcement; Cloudflare AI Crawl Control/WAF rules provide the
enforcement layer. [Cloudflare Managed robots.txt](https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/) · [AI Crawl Control](https://developers.cloudflare.com/ai-crawl-control/features/manage-ai-crawlers/)

Cloudflare currently leaves `ai-input` absent. Cloudflare documents this as a
deliberate neutral state for managed-robots customers. If the owner approves
real-time AI grounding, configure one authoritative Cloudflare Content-Signal
policy with `ai-input=yes`; do not append a conflicting duplicate line locally.
[Cloudflare Content Signals](https://blog.cloudflare.com/content-signals-policy/)

## OpenAI, Google, and other AI systems

- OAI-SearchBot is allowed, GPTBot is blocked, and ChatGPT-User is allowed.
  Allowing OAI-SearchBot improves eligibility for ChatGPT Search discovery but
  does not guarantee inclusion.
- Googlebot is allowed. Google-Extended is blocked, which preserves Google
  Search and Google Search AI visibility while withholding the separate
  Google-Extended Gemini/Vertex training and grounding uses.
- ClaudeBot is blocked while Claude-SearchBot and Claude-User remain allowed.
- Perplexity search and user access remain allowed.
- Amazonbot is blocked while Amzn-SearchBot and Amzn-User remain allowed.
- Applebot remains allowed for Apple search/discovery and current web context;
  Applebot-Extended remains blocked because it controls training use rather
  than page crawling.
- Meta's documented crawler semantics do not provide a clean training versus
  grounding split for the reviewed tokens. `meta-externalagent` remains
  blocked; `meta-externalfetcher` is not changed automatically.

## Cloudflare actions required

The following require dashboard access rather than repository changes:

1. In Cloudflare AI Crawl Control → Security, confirm that OAI-SearchBot,
   Googlebot, and selected search/user crawlers are not blocked by WAF rules.
2. In AI Crawl Control → Directives, confirm managed robots status,
   `search=yes`, `ai-train=no`, `use=reference`, and the training-block
   preference.
3. Decide whether public DoMyFile pages should express `ai-input=yes` for
   real-time grounding.

## AI-readable content audit

Passed:

- 35 static, indexable production pages.
- Every indexable page has one title, description, H1, canonical, and matching
  `og:url`.
- No accidental `noindex`, stale origin, `localhost`, or `example.invalid`
  content.
- All 29 tool pages expose factual H1/intro, input/output, processing/privacy,
  limitations, FAQs, and crawlable related links.
- Structured data includes 1 `WebSite`, 29 `WebApplication`, and 34
  `BreadcrumbList` objects; no invalid JSON-LD was found.
- Category hubs and tool pages have visible breadcrumbs.
- No hidden AI-specific content, filler, `llms.txt`, or new analytics was
  added.
- DoMyFile, its capabilities, canonical website, and privacy model are clear.

Company, legal, contact, and other trust-identity details remain unspecified
and should be addressed only in Phase 6 if required. No facts were invented.

## AI referral measurement

No analytics were added. If an approved privacy-safe analytics system is
introduced later, ChatGPT referrals can be segmented with OpenAI's documented
`utm_source=chatgpt.com` parameter. [OpenAI publisher FAQ](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq)

Crawler requests should be measured separately through Cloudflare AI Crawl
Control rather than treated as user referrals.

## User decisions required

1. Whether to allow Google-Extended, accepting its Gemini/Vertex training and
   grounding uses. This decision is separate from Google Search and Google
   Search AI visibility.
2. Whether to configure Cloudflare Content Signals with `ai-input=yes`.
3. Whether undocumented Meta crawler behavior should remain conservative.
4. Cloudflare dashboard review of AI Crawl Control and WAF rules.

## Verification record

Previously completed for this phase:

- Live `robots.txt` fetch and directive audit.
- Live probes for OpenAI, Google, Claude, Perplexity, Amazon, Apple, Meta, and
  Bing user agents.
- Live sitemap/page audit: all 35 URLs returned 200 with no redirects or stale
  metadata.
- `pnpm verify:seo`.
- `pnpm verify:phase2b`.
- `pnpm verify:phase3`.
- Static metadata, content, breadcrumb, and JSON-LD audit.

No processing suites, media E2E tests, or production build were run for this
report correction. No implementation files were changed.

## Remaining Phase 5 issues

No technical indexing blocker remains. The remaining work is limited to the
Cloudflare dashboard review and the policy decisions listed above. Phase 6 is
not started.

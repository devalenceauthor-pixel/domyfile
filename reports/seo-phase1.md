# DoMyFile Phase 1 SEO foundation

Audit date: 2026-08-18

This report records the implemented static SEO foundation. It does not define
Phase 2 keyword or on-page copy work.

## Public route inventory

The intended indexable inventory is 35 URLs:

- `/`
- `/tools/`
- `/image/`, `/pdf/`, `/audio/`, and `/video/`
- 29 production-ready tool routes from `src/tools/registry.ts`

The generated `404.html` is intentionally `noindex, nofollow`, has no
canonical, and is not in the sitemap. Removed generic route artifacts are
permanent redirects with `noindex` and a canonical pointing at their replacement;
they are not indexable inventory or sitemap entries.

## Canonical policy

- Production origin: `https://domyfile.web.id`
- Trailing slash policy: `always` for every public HTML route.
- Canonicals are generated from `Astro.url.pathname`, so query parameters and
  fragments cannot create alternate canonical URLs.
- Each indexable page emits exactly one self-referencing canonical.
- `og:url` is generated from the same canonical helper and must match it.

## Robots policy

The local `robots.txt` endpoint allows normal crawling and Google Search,
explicitly separates `Googlebot` from `Google-Extended`, blocks known training
tokens (`Google-Extended`, `GPTBot`, `ClaudeBot`, `Amazonbot`,
`Applebot-Extended`, `Bytespider`, `CCBot`, and `meta-externalagent`), and
allows `OAI-SearchBot` and `ChatGPT-User`. Unknown user-agent tokens fall back
to `User-agent: *` and are therefore allowed; robots.txt is a voluntary
preference, not a technical access control.

`Googlebot` is the Search crawler and remains allowed. `Google-Extended` is a
separate Google product token and remains blocked so the training opt-out is
not accidentally removed. `ChatGPT-User` is explicitly allowed for
user-initiated access, although OpenAI notes that robots rules may not govern
those user-triggered requests.

Cloudflare's managed robots feature prepends its own known-AI directives to an
existing origin `robots.txt`; it does not give repository code control over a
separate Cloudflare WAF/AI Crawl Control decision. Keep the Cloudflare
dashboard setting **Set your preference to block training in robots.txt** on:

1. Cloudflare dashboard → account → `domyfile.web.id` → **Security** →
   **Settings**.
2. Filter **Bot traffic**.
3. Turn on **Set your preference to block training in robots.txt**.
4. In **AI Crawl Control → Crawlers**, keep training crawlers blocked and set
   `OAI-SearchBot` to **Allow** if ChatGPT Search referrals are desired. Do not
   block `Googlebot`; keep `Google-Extended` separate and blocked.

Cloudflare Content Signals are supplementary usage signals. They are not a
replacement for robots rules or Cloudflare enforcement. Use **AI Crawl
Control** crawler actions/WAF rules when a technical block is required. See
Cloudflare's [managed robots documentation](https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/)
and [AI Crawl Control guidance](https://developers.cloudflare.com/ai-crawl-control/features/manage-ai-crawlers/).

## Redirect policy

`public/_redirects` contains direct permanent 301 rules for both slash forms
of:

- `/image/image-converter/` → `https://domyfile.web.id/image/`
- `/pdf/images-to-pdf/` → `https://domyfile.web.id/pdf/`

The target contains no query string, so query preservation remains a hosting
configuration concern. Pages-level `_redirects` cannot perform a hostname
redirect. Configure the Pages custom-domain migration in Cloudflare:

1. Workers & Pages → the DoMyFile project → **Custom domains**; confirm
   `domyfile.web.id` is attached.
2. Open **Bulk Redirects** and create a list entry from
   `domyfile.pages.dev` to `https://domyfile.web.id`.
3. Select status `301`, **Preserve query string**, **Subpath matching**,
   **Preserve path suffix**, and **Include subdomains**.
4. Create and enable the bulk redirect rule.

To keep removed URLs on `domyfile.pages.dev` to one hop, add the four exact
legacy source URLs to the same bulk list (both slash forms for each old path),
targeting the two custom-domain category roots with status `301` and
**Preserve query string** on, but **Subpath matching** and **Preserve path
suffix** off for those exact entries. Cloudflare's matching rules give the
more-specific exact path precedence over the general pages.dev subpath entry.
Without these exceptions, a removed pages.dev URL first lands on the removed
custom-domain URL and then redirects again.

This is the required path/query-preserving `pages.dev` → custom-domain
redirect and cannot be faked by adding a domain rule to the repository's
`_redirects` file. See Cloudflare's [Pages custom-domain redirect
guide](https://developers.cloudflare.com/pages/how-to/redirect-to-custom-domain/).

## Sitemap and structured data

`/sitemap.xml` is generated from the registry, filters to production-ready
tools, uses the production origin, emits only trailing-slash canonical URLs,
and is referenced by the local robots endpoint. The expected final URL count
is 35.

The shared SEO helpers emit only data supported by visible page content:

- Homepage: `WebSite`
- `/tools/` and category pages: `BreadcrumbList`
- Tool pages: `WebApplication` plus `BreadcrumbList`

No ratings, reviews, download counts, pricing, or unsupported company facts
are emitted.

## Verification

The scoped static audit is available as:

```text
pnpm build
pnpm verify:seo
```

It checks static route output, title/description/H1/canonical/OG sanity,
JSON-LD, breadcrumbs, robots output, sitemap membership/count, redirects, and
internal links. Processing regression suites are intentionally outside this
phase.

Live deployment probes on the audit date also confirmed:

- `https://domyfile.pages.dev/image/png-to-jpg/?utm_source=seo-audit` returns
  one 301 directly to the custom domain with path and query preserved.
- On the current deployment, a removed `pages.dev` URL still takes two hops
  because the general hostname redirect runs before the existing custom-domain
  path redirect. Deploy the exact legacy exceptions above to remove that
  chain. The custom-domain old image/PDF routes themselves return direct 301s
  to their category roots with the query preserved.
- A no-slash focused route returns one permanent 308 to the slash URL.
- The current live custom-domain HTML/robots/sitemap response is from the
  pre-Phase-1 deployment: its canonical and sitemap URLs are still relative.
  Redeploy the build before treating the repository changes as live.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, "..", "dist");
const origin = "https://domyfile.web.id";
const failures = [];

const fail = (message) => failures.push(message);
const read = (file) => readFileSync(path.join(root, "..", file), "utf8");
const countMatches = (value, pattern) => [...value.matchAll(pattern)].length;
const getAttribute = (tag, name) => tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] ?? "";
const decodeXml = (value) => value
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'");

if (!existsSync(dist)) {
  fail("dist/ does not exist; run the production build first.");
  console.error(failures.join("\n"));
  process.exit(1);
}

const registry = read("src/tools/registry.ts");
const disabledToolSlugs = new Set(["remove-background"]);
const allRegistryRoutes = [...registry.matchAll(/\{\s*id:\s*"([^"]+)",\s*slug:\s*"([^"]+)",\s*category:\s*"([^"]+)"/g)]
  .map(([, id, slug, category]) => ({ id, slug, category, path: `/${category}/${slug}/` }));
const registryRoutes = allRegistryRoutes.filter((tool) => !disabledToolSlugs.has(tool.slug));
const disabledRoutes = allRegistryRoutes.filter((tool) => disabledToolSlugs.has(tool.slug));

const categoryPaths = [...new Set(registryRoutes.map((tool) => `/${tool.category}/`))];
const trustPaths = ["/about/", "/privacy/", "/terms/", "/open-source/"];
const publicRoutes = ["/", "/tools/", ...trustPaths, ...categoryPaths, ...registryRoutes.map((tool) => tool.path)];
const expectedRoutes = [...new Set(publicRoutes)];
const routeToFile = (route) => route === "/"
  ? path.join(dist, "index.html")
  : path.join(dist, route.slice(1), "index.html");
const htmlByRoute = new Map();

for (const route of expectedRoutes) {
  const file = routeToFile(route);
  if (!existsSync(file)) {
    fail(`Missing static HTML for ${route}: ${path.relative(path.join(root, ".."), file)}`);
    continue;
  }
  htmlByRoute.set(route, readFileSync(file, "utf8"));
}

for (const tool of disabledRoutes) {
  const file = routeToFile(tool.path);
  if (existsSync(file)) fail(`${tool.path}: disabled tool route must not be built.`);
}

const assertTag = (html, route, label, pattern, expected = 1) => {
  const actual = countMatches(html, pattern);
  if (actual !== expected) fail(`${route}: expected ${expected} ${label}; found ${actual}.`);
};

const expectedUrl = (route) => `${origin}${route}`;
const pageSchemas = new Map();

for (const [route, html] of htmlByRoute) {
  assertTag(html, route, "title", /<title\b[^>]*>[\s\S]*?<\/title>/gi);
  assertTag(html, route, "meta description", /<meta\b[^>]*\bname=["']description["'][^>]*>/gi);
  assertTag(html, route, "H1", /<h1\b[^>]*>[\s\S]*?<\/h1>/gi);
  assertTag(html, route, "canonical", /<link\b[^>]*\brel=["']canonical["'][^>]*>/gi);
  assertTag(html, route, "og:title", /<meta\b[^>]*\bproperty=["']og:title["'][^>]*>/gi);
  assertTag(html, route, "og:description", /<meta\b[^>]*\bproperty=["']og:description["'][^>]*>/gi);
  assertTag(html, route, "og:url", /<meta\b[^>]*\bproperty=["']og:url["'][^>]*>/gi);
  assertTag(html, route, "og:image", /<meta\b[^>]*\bproperty=["']og:image["'][^>]*>/gi);
  assertTag(html, route, "twitter:card", /<meta\b[^>]*\bname=["']twitter:card["'][^>]*>/gi);
  assertTag(html, route, "twitter:title", /<meta\b[^>]*\bname=["']twitter:title["'][^>]*>/gi);
  assertTag(html, route, "twitter:description", /<meta\b[^>]*\bname=["']twitter:description["'][^>]*>/gi);
  assertTag(html, route, "twitter:image", /<meta\b[^>]*\bname=["']twitter:image["'][^>]*>/gi);

  const canonicalTag = html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*>/i)?.[0];
  const canonical = canonicalTag ? getAttribute(canonicalTag, "href") : "";
  if (canonical !== expectedUrl(route)) fail(`${route}: canonical is ${canonical || "missing"}, expected ${expectedUrl(route)}.`);

  const ogUrlTag = html.match(/<meta\b[^>]*\bproperty=["']og:url["'][^>]*>/i)?.[0];
  const ogUrl = ogUrlTag ? getAttribute(ogUrlTag, "content") : "";
  if (ogUrl !== canonical) fail(`${route}: og:url does not match canonical.`);

  const robotsTag = html.match(/<meta\b[^>]*\bname=["']robots["'][^>]*>/i)?.[0] ?? "";
  if (/noindex/i.test(robotsTag)) fail(`${route}: indexable page contains noindex.`);
  if (!/<html\b/i.test(html)) fail(`${route}: missing static HTML document.`);

  const schemaValues = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map(([, json]) => {
      try {
        return JSON.parse(json);
      } catch (error) {
        fail(`${route}: invalid JSON-LD (${error.message}).`);
        return null;
      }
    })
    .filter(Boolean);
  pageSchemas.set(route, schemaValues);

  if (route === "/" && !schemaValues.some((schema) => schema["@type"] === "WebSite")) fail("/: missing WebSite JSON-LD.");
  if (route === "/tools/" && !schemaValues.some((schema) => schema["@type"] === "BreadcrumbList")) fail("/tools/: missing BreadcrumbList JSON-LD.");
  if (trustPaths.includes(route) && !schemaValues.some((schema) => schema["@type"] === "BreadcrumbList")) fail(`${route}: missing BreadcrumbList JSON-LD.`);
  if (categoryPaths.includes(route) && !schemaValues.some((schema) => schema["@type"] === "BreadcrumbList")) fail(`${route}: missing BreadcrumbList JSON-LD.`);
  if (registryRoutes.some((tool) => tool.path === route)) {
    if (!schemaValues.some((schema) => schema["@type"] === "WebApplication")) fail(`${route}: missing WebApplication JSON-LD.`);
    if (!schemaValues.some((schema) => schema["@type"] === "BreadcrumbList")) fail(`${route}: missing BreadcrumbList JSON-LD.`);
    if (!/aria-label=["']Breadcrumb["']/i.test(html)) fail(`${route}: missing visible breadcrumb navigation.`);
  }
  if (categoryPaths.includes(route) || route === "/tools/" || trustPaths.includes(route)) {
    if (!/aria-label=["']Breadcrumb["']/i.test(html)) fail(`${route}: missing visible breadcrumb navigation.`);
  }
}

const sitemapFile = path.join(dist, "sitemap.xml");
if (!existsSync(sitemapFile)) {
  fail("dist/sitemap.xml is missing.");
} else {
  const sitemap = readFileSync(sitemapFile, "utf8");
  const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => decodeXml(url));
  if (sitemapUrls.length !== expectedRoutes.length) fail(`Sitemap URL count is ${sitemapUrls.length}; expected ${expectedRoutes.length}.`);
  if (new Set(sitemapUrls).size !== sitemapUrls.length) fail("Sitemap contains duplicate URLs.");
  for (const url of sitemapUrls) {
    if (!url.startsWith(origin)) fail(`Sitemap contains a non-production origin: ${url}`);
    const route = url.slice(origin.length);
    if (!expectedRoutes.includes(route)) fail(`Sitemap contains a non-canonical or unexpected URL: ${url}`);
    if (route !== "/" && !route.endsWith("/")) fail(`Sitemap URL is missing the trailing slash: ${url}`);
    if (/[?#]/.test(url)) fail(`Sitemap URL contains a query or fragment: ${url}`);
  }
  for (const route of expectedRoutes) if (!sitemapUrls.includes(expectedUrl(route))) fail(`Sitemap omits ${expectedUrl(route)}.`);
  for (const tool of disabledRoutes) if (sitemapUrls.includes(expectedUrl(tool.path))) fail(`Sitemap includes disabled route ${tool.path}.`);
  for (const removed of ["/image/image-converter/", "/pdf/images-to-pdf/"]) if (sitemapUrls.some((url) => url.endsWith(removed))) fail(`Sitemap contains removed route ${removed}.`);
}

const robotsFile = path.join(dist, "robots.txt");
if (!existsSync(robotsFile)) {
  fail("dist/robots.txt is missing.");
} else {
  const robots = readFileSync(robotsFile, "utf8");
  const requiredRobotsLines = [
    "User-agent: *\nAllow: /",
    "User-agent: Googlebot\nAllow: /",
    "User-agent: Google-Extended\nDisallow: /",
    "User-agent: GPTBot\nDisallow: /",
    "User-agent: OAI-SearchBot\nAllow: /",
    "User-agent: ChatGPT-User\nAllow: /",
    "User-agent: ClaudeBot\nDisallow: /",
    `Sitemap: ${origin}/sitemap.xml`,
  ];
  for (const line of requiredRobotsLines) if (!robots.includes(line)) fail(`robots.txt is missing policy: ${line.replace("\n", " ")}`);
  if (/User-agent: Googlebot\r?\nDisallow: \/\s/i.test(robots)) fail("robots.txt blocks Googlebot.");
}

const redirects = read("public/_redirects");
const redirectRules = [
  "/image/image-converter https://domyfile.web.id/image/ 301",
  "/image/image-converter/ https://domyfile.web.id/image/ 301",
  "/pdf/images-to-pdf https://domyfile.web.id/pdf/ 301",
  "/pdf/images-to-pdf/ https://domyfile.web.id/pdf/ 301",
];
for (const rule of redirectRules) if (!redirects.includes(rule)) fail(`Missing permanent redirect rule: ${rule}`);

const internalLinks = new Map();
const linkedToolPaths = new Set();
const oldRoutes = new Set(["/image/image-converter", "/image/image-converter/", "/pdf/images-to-pdf", "/pdf/images-to-pdf/"]);

const staticTargetExists = (pathname) => {
  if (pathname === "/") return existsSync(path.join(dist, "index.html"));
  if (pathname.endsWith("/")) return existsSync(path.join(dist, pathname.slice(1), "index.html"));
  return existsSync(path.join(dist, pathname.slice(1)));
};

for (const [route, html] of htmlByRoute) {
  for (const [, href] of html.matchAll(/\bhref=["']([^"']+)["']/gi)) {
    if (href.startsWith("#") || /^(?:mailto:|tel:|javascript:|data:)/i.test(href) || /^https?:\/\//i.test(href) || href.startsWith("//")) continue;
    const url = new URL(href, `${origin}${route}`);
    const pathname = url.pathname;
    if (oldRoutes.has(pathname)) fail(`${route}: internal link points to removed route ${pathname}.`);
    if (!staticTargetExists(pathname)) fail(`${route}: broken internal link ${href}.`);
    if (registryRoutes.some((tool) => tool.path === pathname)) {
      linkedToolPaths.add(pathname);
      internalLinks.set(pathname, (internalLinks.get(pathname) ?? 0) + 1);
    }
  }
}

for (const tool of registryRoutes) if (!linkedToolPaths.has(tool.path)) fail(`Orphaned tool route: ${tool.path}`);
for (const focused of [
  "/image/png-to-jpg/",
  "/image/jpg-to-png/",
  "/image/jpg-to-webp/",
  "/image/png-to-webp/",
  "/image/webp-to-jpg/",
  "/image/webp-to-png/",
  "/pdf/jpg-to-pdf/",
  "/pdf/png-to-pdf/",
  "/pdf/webp-to-pdf/",
]) {
  const category = focused.split("/")[1];
  const categoryHtml = htmlByRoute.get(`/${category}/`) ?? "";
  if (!new RegExp(`href=["']${focused.replaceAll("/", "\\/")}["']`).test(categoryHtml)) fail(`Focused route is not linked from ${category} category navigation: ${focused}`);
}

if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`SEO static audit passed: ${expectedRoutes.length} indexable routes, ${registryRoutes.length} tool routes, ${expectedRoutes.length} sitemap URLs, no broken internal links.`);

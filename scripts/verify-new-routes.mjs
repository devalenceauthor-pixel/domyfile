import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const origin = "https://domyfile.web.id";
const newImageTools = [
  "upscale-image",
];
const newWordTools = [
  "docx-to-txt",
  "txt-to-docx",
  "docx-to-html",
  "html-to-docx",
  "docx-to-pdf",
  "pdf-to-docx",
  "merge-docx",
  "compress-docx",
  "extract-images-from-docx",
  "docx-metadata-cleaner",
];
const newPdfTools = [
  "pdf-to-png",
  "pdf-to-webp",
  "extract-images-from-pdf",
  "add-page-numbers",
  "header-footer-pdf",
  "crop-pdf",
  "pdf-to-text",
  "pdf-to-html",
  "pdf-metadata-viewer",
  "clean-pdf-metadata",
  "txt-to-pdf",
  "flatten-pdf",
];
const newTools = [...newImageTools, ...newWordTools, ...newPdfTools];
const siblingTools = ["crop-image", "png-to-jpg", "jpg-to-png"];
const scopedTools = [...newTools, ...siblingTools];
const failures = [];
const fail = (message) => failures.push(message);
const readProject = (file) => readFileSync(path.join(root, file), "utf8");
const routeFile = (route) => route === "/" ? path.join(dist, "index.html") : path.join(dist, route.slice(1), "index.html");
const decodeHtml = (value) => value
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .replace(/&#x27;/g, "'");
const stripHtml = (value) => decodeHtml(value
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim());
const getAttribute = (tag, name) => tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] ?? "";
const getTag = (html, pattern) => html.match(pattern)?.[0] ?? "";
const getMeta = (html, name) => {
  const tag = getTag(html, new RegExp(`<meta\\b[^>]*\\bname=["']${name}["'][^>]*>`, "i"));
  return getAttribute(tag, "content");
};
const getCanonical = (html) => {
  const tag = getTag(html, /<link\b[^>]*\brel=["']canonical["'][^>]*>/i);
  return getAttribute(tag, "href");
};
const getSectionText = (html) => [
  html.match(/<section\b[^>]*class=["'][^"']*\btool-seo\b[^"']*["'][\s\S]*?<\/section>/i)?.[0] ?? "",
  html.match(/<section\b[^>]*class=["'][^"']*\btool-info-grid\b[^"']*["'][\s\S]*?<\/section>/i)?.[0] ?? "",
  html.match(/<section\b[^>]*class=["'][^"']*\bfaq-section\b[^"']*["'][\s\S]*?<\/section>/i)?.[0] ?? "",
].map(stripHtml).join(" ");
const getSchemas = (html, route) => [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  .map(([, json]) => {
    try {
      return JSON.parse(json);
    } catch (error) {
      fail(`${route}: invalid JSON-LD (${error.message}).`);
      return null;
    }
  })
  .filter(Boolean);
const getShingles = (text) => {
  const words = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean);
  const shingles = new Set();
  for (let index = 0; index < words.length - 2; index += 1) shingles.add(words.slice(index, index + 3).join(" "));
  return shingles;
};
const similarity = (left, right) => {
  const a = getShingles(left);
  const b = getShingles(right);
  const intersection = [...a].filter((item) => b.has(item)).length;
  return intersection / Math.max(1, a.size + b.size - intersection);
};

if (!existsSync(dist)) fail("dist/ does not exist; run the production build first.");

const matrix = JSON.parse(readProject("src/content/tool-content.json"));
const matrixBySlug = new Map(matrix.map((entry) => [entry.slug, entry]));
const registrySource = readProject("src/tools/registry.ts");
const registryRoutes = new Map([...registrySource.matchAll(/\{\s*id:\s*"([^"]+)",\s*slug:\s*"([^"]+)",\s*category:\s*"([^"]+)"/g)]
  .map(([, id, slug, category]) => [slug, { id, slug, category, route: `/${category}/${slug}/` }]));
const htmlByRoute = new Map();
const routeFor = (slug) => registryRoutes.get(slug)?.route ?? "";

for (const slug of scopedTools) {
  const route = routeFor(slug);
  if (!route) {
    fail(`Registry is missing ${slug}.`);
    continue;
  }
  const file = routeFile(route);
  if (!existsSync(file)) {
    fail(`Missing static HTML for ${route}.`);
    continue;
  }
  htmlByRoute.set(route, readFileSync(file, "utf8"));
}

const categoryRoutes = ["/image/", "/word/", "/pdf/"];
if (existsSync(routeFile("/"))) htmlByRoute.set("/", readFileSync(routeFile("/"), "utf8"));
else fail("Missing homepage HTML for lazy-runtime check.");
for (const route of categoryRoutes) {
  const file = routeFile(route);
  if (!existsSync(file)) fail(`Missing category HTML for ${route}.`);
  else htmlByRoute.set(route, readFileSync(file, "utf8"));
}

for (const slug of newTools) {
  const route = routeFor(slug);
  const html = htmlByRoute.get(route) ?? "";
  const entry = matrixBySlug.get(slug);
  if (!entry || !html) continue;
  const title = getTag(html, /<title\b[^>]*>[\s\S]*?<\/title>/i).replace(/<[^>]+>/g, "").trim();
  const h1 = getTag(html, /<h1\b[^>]*>[\s\S]*?<\/h1>/i).replace(/<[^>]+>/g, "").trim();
  const description = getMeta(html, "description");
  const canonical = getCanonical(html);
  if (title !== entry.page.title) fail(`${route}: title does not match the content matrix.`);
  if (description !== entry.page.metaDescription) fail(`${route}: meta description does not match the content matrix.`);
  if (h1 !== entry.page.h1) fail(`${route}: H1 does not match the content matrix.`);
  if (canonical !== `${origin}${route}`) fail(`${route}: canonical is ${canonical || "missing"}.`);
  if (!html.includes(`aria-label="Breadcrumb"`)) fail(`${route}: visible breadcrumb is missing.`);
  if (!html.includes(entry.acceptedInput.extensions.map((extension) => `.${extension}`).join(", "))) fail(`${route}: accepted extensions are not rendered.`);
  if (!html.includes(entry.processingMode === "browser-local" ? "locally" : "temporarily")) fail(`${route}: processing disclosure is missing.`);
  if (html.match(/<details\b/gi)?.length !== entry.faqContent.length) fail(`${route}: FAQ count does not match the scoped content matrix.`);
  const schemas = getSchemas(html, route);
  const application = schemas.find((schema) => schema["@type"] === "WebApplication");
  const breadcrumb = schemas.find((schema) => schema["@type"] === "BreadcrumbList");
  if (!application || application.name !== entry.title || application.url !== `${origin}${route}`) fail(`${route}: tool structured data is missing or inaccurate.`);
  if (!breadcrumb) fail(`${route}: breadcrumb structured data is missing.`);
  for (const relatedSlug of entry.relatedTools) {
    const relatedRoute = routeFor(relatedSlug);
    if (!relatedRoute || !html.includes(`href="${relatedRoute}"`)) fail(`${route}: related tool ${relatedSlug} is not linked.`);
  }
}

const wordCategory = htmlByRoute.get("/word/") ?? "";
for (const slug of newWordTools) {
  const route = routeFor(slug);
  if ((wordCategory.match(new RegExp(`href=["']${route.replaceAll("/", "\\/")}["']`, "g")) ?? []).length === 0) fail(`/word/: missing crawlable link to ${route}.`);
}
const imageCategory = htmlByRoute.get("/image/") ?? "";
for (const slug of newImageTools) {
  if (!imageCategory.includes(`href="${routeFor(slug)}"`)) fail(`/image/: missing crawlable link to ${slug}.`);
}
const pdfCategory = htmlByRoute.get("/pdf/") ?? "";
for (const slug of newPdfTools) {
  if (!pdfCategory.includes(`href="${routeFor(slug)}"`)) fail(`/pdf/: missing crawlable link to ${slug}.`);
}
for (const html of [htmlByRoute.get("/") ?? "", wordCategory, imageCategory, pdfCategory]) {
  if (/isnet_quint8|@imgly\/background-removal|mammoth|onnxruntime/i.test(html)) fail("Homepage/category HTML contains a heavy new runtime marker.");
}

const uniqueValues = (values, label) => {
  const seen = new Map();
  values.forEach(([slug, value]) => {
    if (!value) fail(`${slug}: missing ${label}.`);
    if (seen.has(value)) fail(`${slug}: duplicates ${label} with ${seen.get(value)}.`);
    seen.set(value, slug);
  });
};
uniqueValues(newTools.map((slug) => [slug, matrixBySlug.get(slug)?.primarySearchIntent]), "primary search intent");
uniqueValues(newTools.map((slug) => [slug, matrixBySlug.get(slug)?.page.title]), "title");
uniqueValues(newTools.map((slug) => [slug, matrixBySlug.get(slug)?.page.metaDescription]), "meta description");
uniqueValues(newTools.map((slug) => [slug, matrixBySlug.get(slug)?.page.h1]), "H1");

const scopedFaqQuestions = new Map();
for (const slug of scopedTools) {
  const entry = matrixBySlug.get(slug);
  for (const faq of entry?.faqContent ?? []) {
    if (scopedFaqQuestions.has(faq.question)) fail(`${slug}: FAQ question duplicates ${scopedFaqQuestions.get(faq.question)}.`);
    scopedFaqQuestions.set(faq.question, slug);
  }
}
const scopedCopy = newTools.map((slug) => [slug, getSectionText(htmlByRoute.get(routeFor(slug)) ?? "")]);
for (let index = 0; index < scopedCopy.length; index += 1) {
  for (let other = index + 1; other < scopedCopy.length; other += 1) {
    const score = similarity(scopedCopy[index][1], scopedCopy[other][1]);
    if (score > 0.8) fail(`${scopedCopy[index][0]} and ${scopedCopy[other][0]} are too similar (${score.toFixed(2)}).`);
  }
}

const sitemapFile = path.join(dist, "sitemap.xml");
if (!existsSync(sitemapFile)) fail("dist/sitemap.xml is missing.");
else {
  const sitemap = readFileSync(sitemapFile, "utf8");
  for (const route of ["/word/", "/image/", "/pdf/", ...newTools.map(routeFor)]) {
    if (!sitemap.includes(`${origin}${route}`)) fail(`Sitemap omits ${origin}${route}.`);
  }
  const heldRoute = "/image/remove-background/";
  if (existsSync(routeFile(heldRoute))) fail(`Held route must not be built: ${heldRoute}.`);
  if (sitemap.includes(`${origin}${heldRoute}`)) fail(`Sitemap includes held route: ${heldRoute}.`);
}

if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`Scoped SEO audit passed: ${newTools.length} active new tools (${newPdfTools.length} PDF), ${siblingTools.length} relevant image siblings, category links, and sitemap coverage verified; Remove Background remains held.`);

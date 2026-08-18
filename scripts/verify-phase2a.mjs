import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(root, "..");
const dist = path.join(projectRoot, "dist");
const failures = [];

const fail = (message) => failures.push(message);
const readProject = (file) => readFileSync(path.join(projectRoot, file), "utf8");
const getAttribute = (tag, name) => tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] ?? "";

if (!existsSync(dist)) fail("dist/ does not exist; run the production build first.");

const registry = readProject("src/tools/registry.ts");
const registryRoutes = [...registry.matchAll(/\{\s*id:\s*"([^"]+)",\s*slug:\s*"([^"]+)",\s*category:\s*"([^"]+)"/g)]
  .map(([, id, slug, category]) => ({ id, slug, category, path: `/${category}/${slug}/` }));
const registryBySlug = new Map(registryRoutes.map((tool) => [tool.slug, tool]));

if (registryRoutes.length !== 29) fail(`Expected 29 registry tools; found ${registryRoutes.length}.`);

let matrix = [];
try {
  matrix = JSON.parse(readProject("src/content/tool-content.json"));
} catch (error) {
  fail(`Content matrix is not valid JSON: ${error.message}.`);
}

const matrixBySlug = new Map(matrix.map((entry) => [entry.slug, entry]));
const requiredFields = [
  "slug",
  "title",
  "category",
  "primarySearchIntent",
  "acceptedInput",
  "output",
  "processingMode",
  "keyControls",
  "batchBehavior",
  "importantLimitations",
  "qualityCompatibility",
  "resultDownload",
  "faqTopics",
  "relatedTools",
  "primaryLongTailOpportunity",
  "canonicalDecision",
];

if (matrix.length !== registryRoutes.length) fail(`Content matrix contains ${matrix.length} entries; expected ${registryRoutes.length}.`);
for (const entry of matrix) {
  for (const field of requiredFields) {
    if (entry[field] === undefined || entry[field] === null || entry[field] === "") fail(`${entry.slug ?? "unknown"}: missing matrix field ${field}.`);
  }
  const registryTool = registryBySlug.get(entry.slug);
  if (!registryTool) fail(`Content matrix contains unknown tool ${entry.slug}.`);
  if (registryTool && registryTool.category !== entry.category) fail(`${entry.slug}: matrix category does not match the registry.`);
  if (!Array.isArray(entry.faqTopics) || entry.faqTopics.length < 3 || entry.faqTopics.length > 5) fail(`${entry.slug}: FAQ topic count must be 3–5.`);
  if (!Array.isArray(entry.relatedTools) || entry.relatedTools.length !== 3 || new Set(entry.relatedTools).size !== 3) fail(`${entry.slug}: relatedTools must contain exactly three unique slugs.`);
  if (entry.relatedTools?.includes(entry.slug)) fail(`${entry.slug}: relatedTools contains itself.`);
  for (const relatedSlug of entry.relatedTools ?? []) if (!registryBySlug.has(relatedSlug)) fail(`${entry.slug}: related tool ${relatedSlug} is not in the registry.`);
  if (!/^(browser-local|temporary-server)$/.test(entry.processingMode)) fail(`${entry.slug}: unsupported processing mode ${entry.processingMode}.`);
  if (!entry.acceptedInput?.formats?.length || !entry.acceptedInput?.extensions?.length) fail(`${entry.slug}: accepted input is incomplete.`);
  if (!entry.output?.formats?.length || !entry.output?.behavior) fail(`${entry.slug}: output is incomplete.`);
  if (!entry.batchBehavior || typeof entry.batchBehavior.supported !== "boolean" || !entry.batchBehavior.description) fail(`${entry.slug}: batch behavior is incomplete.`);
  if (!entry.importantLimitations?.length || !entry.qualityCompatibility?.length || !entry.keyControls?.length) fail(`${entry.slug}: factual detail arrays are incomplete.`);
}
for (const tool of registryRoutes) if (!matrixBySlug.has(tool.slug)) fail(`Registry tool ${tool.slug} is missing from the content matrix.`);

const categoryPaths = ["/image/", "/pdf/", "/audio/", "/video/"];
const trustPaths = ["/about/", "/privacy/", "/terms/", "/open-source/"];
const expectedCategoryCounts = { image: 10, pdf: 10, audio: 4, video: 5 };
const expectedRoutes = ["/", "/tools/", ...trustPaths, ...categoryPaths, ...registryRoutes.map((tool) => tool.path)];
const routeToFile = (route) => route === "/" ? path.join(dist, "index.html") : path.join(dist, route.slice(1), "index.html");
const htmlByRoute = new Map();
for (const route of expectedRoutes) {
  const file = routeToFile(route);
  if (!existsSync(file)) fail(`Missing static HTML for ${route}.`);
  else htmlByRoute.set(route, readFileSync(file, "utf8"));
}

const catalogItems = (html) => [...html.matchAll(/<div\b[^>]*data-catalog-item[^>]*>/gi)].map((match) => ({
  tag: match[0],
  category: getAttribute(match[0], "data-tool-category"),
  slug: getAttribute(match[0], "data-tool-slug"),
}));

for (const [category, expectedCount] of Object.entries(expectedCategoryCounts)) {
  const route = `/${category}/`;
  const html = htmlByRoute.get(route) ?? "";
  const items = catalogItems(html);
  if (items.length !== expectedCount) fail(`${route}: static catalog has ${items.length} cards; expected ${expectedCount}.`);
  if (items.some((item) => item.category !== category)) fail(`${route}: static HTML contains a card from another category.`);
  if (!html.includes("category-context")) fail(`${route}: missing concise category context content.`);
}

const allToolsItems = catalogItems(htmlByRoute.get("/tools/") ?? "");
if (allToolsItems.length !== 29) fail(`/tools/: static catalog has ${allToolsItems.length} cards; expected 29.`);
if (new Set(allToolsItems.map((item) => item.slug)).size !== 29) fail("/tools/: static catalog contains duplicate or missing tool slugs.");

const inboundRelated = new Map(registryRoutes.map((tool) => [tool.slug, []]));
for (const tool of registryRoutes) {
  const html = htmlByRoute.get(tool.path) ?? "";
  const relatedAnchors = [...html.matchAll(/<a\b[^>]*class=["']tool-card["'][^>]*data-tool-slug=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(([, slug, body]) => ({ slug, body }));
  const expectedRelated = matrixBySlug.get(tool.slug)?.relatedTools ?? [];
  const actualRelated = relatedAnchors.map((anchor) => anchor.slug);
  if (actualRelated.length !== 3) fail(`${tool.path}: expected exactly 3 contextual related-tool links; found ${actualRelated.length}.`);
  if (JSON.stringify(actualRelated) !== JSON.stringify(expectedRelated)) fail(`${tool.path}: rendered related links do not match the content matrix.`);
  for (const anchor of relatedAnchors) {
    if (!/<h3\b[^>]*>[^<]+<\/h3>/i.test(anchor.body)) fail(`${tool.path}: related link ${anchor.slug} lacks a descriptive tool heading.`);
    if (inboundRelated.has(anchor.slug)) inboundRelated.get(anchor.slug).push(tool.slug);
    else fail(`${tool.path}: related link points to unknown tool ${anchor.slug}.`);
  }
}
for (const [slug, inbound] of inboundRelated) if (!inbound.length) fail(`${slug}: no contextual inbound related-tool link.`);

const publicRouteSet = new Set(expectedRoutes);
const staticTargetExists = (pathname) => {
  if (publicRouteSet.has(pathname)) return true;
  if (pathname.endsWith("/")) return existsSync(path.join(dist, pathname.slice(1), "index.html"));
  return existsSync(path.join(dist, pathname.slice(1)));
};
const oldRoutes = new Set(["/image/image-converter", "/image/image-converter/", "/pdf/images-to-pdf", "/pdf/images-to-pdf/"]);
for (const [route, html] of htmlByRoute) {
  for (const [, href] of html.matchAll(/\bhref=["']([^"']+)["']/gi)) {
    if (href.startsWith("#") || /^(?:mailto:|tel:|javascript:|data:)/i.test(href) || /^https?:\/\//i.test(href) || href.startsWith("//")) continue;
    const pathname = new URL(href, `https://domyfile.web.id${route}`).pathname;
    if (oldRoutes.has(pathname)) fail(`${route}: internal link points to removed route ${pathname}.`);
    if (!staticTargetExists(pathname)) fail(`${route}: broken internal link ${href}.`);
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`Phase 2A static audit passed: ${Object.values(expectedCategoryCounts).reduce((sum, count) => sum + count, 0)} category cards, 29 catalog cards, complete content matrix, contextual inbound links for all 29 tools, and no broken internal links.`);

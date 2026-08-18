import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(scriptRoot, "..");
const dist = path.join(projectRoot, "dist");
const origin = "https://domyfile.web.id";
const failures = [];
const fail = (message) => failures.push(message);
const readProject = (file) => readFileSync(path.join(projectRoot, file), "utf8");
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
const anchorText = (value) => stripHtml(value);
const routeFile = (route) => route === "/" ? path.join(dist, "index.html") : path.join(dist, route.slice(1), "index.html");
const staticFileExists = (pathname) => pathname === "/"
  ? existsSync(path.join(dist, "index.html"))
  : pathname.endsWith("/")
    ? existsSync(path.join(dist, pathname.slice(1), "index.html"))
    : existsSync(path.join(dist, pathname.slice(1)));

if (!existsSync(dist)) fail("dist/ does not exist; run the production build first.");

const registrySource = readProject("src/tools/registry.ts");
const matrix = JSON.parse(readProject("src/content/tool-content.json"));
const matrixTitleBySlug = new Map(matrix.map((entry) => [entry.slug, entry.title]));
const registryTools = [...registrySource.matchAll(/\{\s*id:\s*"([^"]+)",\s*slug:\s*"([^"]+)",\s*category:\s*"([^"]+)"/g)]
  .map(([, id, slug, category]) => ({ id, slug, category, title: matrixTitleBySlug.get(slug) ?? slug, route: "/" + category + "/" + slug + "/" }));
const toolsByRoute = new Map(registryTools.map((tool) => [tool.route, tool]));
const toolRoutes = registryTools.map((tool) => tool.route);
const categoryRoutes = ["/image/", "/pdf/", "/audio/", "/video/"];
const trustRoutes = ["/about/", "/privacy/", "/terms/", "/open-source/"];
const trustLabels = {
  "/about/": "About DoMyFile",
  "/privacy/": "Privacy",
  "/terms/": "Terms of use",
  "/open-source/": "Open source and licenses",
};
const publicRoutes = ["/", "/tools/", ...trustRoutes, ...categoryRoutes, ...toolRoutes];
const publicRouteSet = new Set(publicRoutes);
const oldRoutes = new Set(["/image/image-converter", "/image/image-converter/", "/pdf/images-to-pdf", "/pdf/images-to-pdf/"]);
const expectedGroupHeadings = {
  image: ["Optimize", "Resize & crop", "Format conversion"],
  pdf: ["Combine & organize", "Edit pages", "Convert", "Compress"],
  audio: ["Edit", "Convert", "Compress"],
  video: ["Edit", "Convert", "Compress"],
};
const expectedCategoryCounts = { image: 10, pdf: 10, audio: 4, video: 5 };
const expectedCategoryCrossTargets = {
  image: ["jpg-to-pdf", "png-to-pdf", "webp-to-pdf"],
  pdf: ["compress-image"],
  audio: [],
  video: ["trim-audio", "audio-converter"],
};
const expectedToolEdges = [
  ["png-to-jpg", "jpg-to-pdf"],
  ["png-to-webp", "png-to-pdf"],
  ["webp-to-png", "webp-to-pdf"],
  ["pdf-to-jpg", "compress-image"],
  ["jpg-to-png", "png-to-pdf"],
  ["jpg-to-webp", "webp-to-pdf"],
  ["webp-to-jpg", "jpg-to-pdf"],
  ["heic-to-jpg", "jpg-to-pdf"],
  ["jpg-to-pdf", "merge-pdf"],
  ["png-to-pdf", "merge-pdf"],
  ["webp-to-pdf", "merge-pdf"],
  ["video-to-mp3", "trim-audio"],
  ["video-to-mp3", "audio-converter"],
];

if (registryTools.length !== 29) fail("Expected 29 registry tools; found " + registryTools.length + ".");
for (const route of publicRoutes) if (!existsSync(routeFile(route))) fail("Missing static HTML for " + route + ".");

const inbound = new Map(publicRoutes.map((route) => [route, []]));
const outbound = new Map(publicRoutes.map((route) => [route, []]));
const htmlByRoute = new Map();

for (const route of publicRoutes) {
  const html = readFileSync(routeFile(route), "utf8");
  htmlByRoute.set(route, html);
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1];
    if (href.startsWith("#") || /^(?:mailto:|tel:|javascript:|data:)/i.test(href) || /^https?:\/\//i.test(href) || href.startsWith("//")) continue;
    const target = new URL(href, origin + route).pathname;
    const text = anchorText(match[2]);
    if (oldRoutes.has(target)) fail(route + ": internal link points to removed route " + target + ".");
    if (!staticFileExists(target)) fail(route + ": broken internal link " + href + ".");
    if (!publicRouteSet.has(target)) continue;
    inbound.get(target).push({ from: route, text });
    outbound.get(route).push({ to: target, text });
  }
}

const toolRouteForSlug = (slug) => registryTools.find((tool) => tool.slug === slug)?.route;
const sourceTool = (route) => toolsByRoute.get(route);
const toolLinksFrom = (route) => (outbound.get(route) ?? []).filter((link) => toolsByRoute.has(link.to));

for (const route of publicRoutes) {
  const html = htmlByRoute.get(route) ?? "";
  if (route === "/") continue;
  const breadcrumb = html.match(/<nav\b[^>]*class=["']breadcrumbs["'][\s\S]*?<\/nav>/i)?.[0] ?? "";
  if (!breadcrumb.includes('href="/"') || !breadcrumb.includes('aria-label="Breadcrumb"')) fail(route + ": breadcrumb home link or label is missing.");
  const tool = sourceTool(route);
  if (tool) {
    if (!breadcrumb.includes('href="/' + tool.category + '/"')) fail(route + ": breadcrumb does not link to its category hub.");
    if (!stripHtml(breadcrumb).includes(tool.title)) fail(route + ": breadcrumb does not expose the current tool.");
  }
  if (categoryRoutes.includes(route)) {
    const category = route.slice(1, -1);
    if (!stripHtml(breadcrumb).toLowerCase().includes(category === "pdf" ? "pdf" : category)) fail(route + ": breadcrumb does not expose the current category.");
  }
  if (trustRoutes.includes(route) && !stripHtml(breadcrumb).includes(trustLabels[route])) fail(route + ": breadcrumb does not expose the trust page label.");
}

for (const category of categoryRoutes.map((route) => route.slice(1, -1))) {
  const route = "/" + category + "/";
  const html = htmlByRoute.get(route) ?? "";
  const groupCount = [...html.matchAll(/data-catalog-group/gi)].length;
  const cardMatches = [...html.matchAll(/data-catalog-item[^>]*data-tool-category=["']([^"']+)["'][^>]*data-tool-slug=["']([^"']+)["']/gi)];
  if (groupCount !== expectedGroupHeadings[category].length) fail(route + ": expected " + expectedGroupHeadings[category].length + " semantic tool groups; found " + groupCount + ".");
  for (const heading of expectedGroupHeadings[category]) if (!stripHtml(html).includes(heading)) fail(route + ": missing group heading " + heading + ".");
  if (category === "image" && !stripHtml(html).includes("Image to PDF")) fail(route + ": missing the Image to PDF contextual subgroup.");
  if (cardMatches.length !== expectedCategoryCounts[category]) fail(route + ": expected " + expectedCategoryCounts[category] + " static tool cards; found " + cardMatches.length + ".");
  if (cardMatches.some(([, cardCategory]) => cardCategory !== category)) fail(route + ": category hub contains a tool card from another category.");

  const crossTargets = [...new Set(toolLinksFrom(route)
    .map((link) => toolsByRoute.get(link.to))
    .filter((tool) => tool && tool.category !== category)
    .map((tool) => tool.slug))];
  const expectedCross = expectedCategoryCrossTargets[category];
  if (JSON.stringify(crossTargets.sort()) !== JSON.stringify([...expectedCross].sort())) {
    fail(route + ": contextual cross-category targets do not match the intended workflow links.");
  }
}

const toolsHtml = htmlByRoute.get("/tools/") ?? "";
const catalogGroupCount = [...toolsHtml.matchAll(/data-catalog-group/gi)].length;
const catalogCards = [...toolsHtml.matchAll(/data-catalog-item[^>]*data-tool-category=["']([^"']+)["'][^>]*data-tool-slug=["']([^"']+)["']/gi)];
if (catalogGroupCount !== 4) fail("/tools/: expected four semantic category groups; found " + catalogGroupCount + ".");
if (catalogCards.length !== 29 || new Set(catalogCards.map(([, , slug]) => slug)).size !== 29) fail("/tools/: expected all 29 unique tool cards.");
if ([...toolsHtml.matchAll(/data-category=["'][^"']+["']/gi)].length !== 5) fail("/tools/: expected All plus four category filters.");
for (const category of ["image", "pdf", "audio", "video"]) if (!toolsHtml.includes('href="/' + category + '/"')) fail("/tools/: missing crawlable " + category + " hub link.");

for (const link of [...outbound.values()].flat()) {
  const targetTool = toolsByRoute.get(link.to);
  if (!targetTool) continue;
  const generic = /^(click here|learn more|try this|related tool|here)$/i.test(link.text.trim());
  if (generic || link.text.trim().length < 5) fail("Generic or empty anchor text points to " + link.to + ".");
}

const orphanPages = publicRoutes.filter((route) => route !== "/" && !(inbound.get(route) ?? []).length);
const toolStats = registryTools.map((tool) => {
  const incoming = inbound.get(tool.route) ?? [];
  const contextualIncoming = incoming.filter((link) => link.from === "/" + tool.category + "/" || link.from === "/tools/" || Boolean(sourceTool(link.from)) || link.from === "/");
  const toolOutgoing = toolLinksFrom(tool.route);
  const uniqueToolOutgoing = [...new Set(toolOutgoing.map((link) => link.to))];
  const crossOutgoing = uniqueToolOutgoing.filter((target) => toolsByRoute.get(target)?.category !== tool.category);
  return {
    slug: tool.slug,
    inbound: incoming.length,
    contextualInbound: contextualIncoming.length,
    outboundContextual: uniqueToolOutgoing.length,
    outboundCrossCategory: crossOutgoing.length,
    weak: contextualIncoming.length < 3,
  };
});
const weakToolPages = toolStats.filter((tool) => tool.weak).map((tool) => tool.slug);
if (orphanPages.length) fail("Orphan public pages: " + orphanPages.join(", ") + ".");
if (weakToolPages.length) fail("Weakly connected tool pages: " + weakToolPages.join(", ") + ".");

const crossEdges = [];
for (const [from, links] of outbound) {
  const fromTool = sourceTool(from);
  for (const link of links) {
    const toTool = toolsByRoute.get(link.to);
    if (!toTool) continue;
    const fromCategory = fromTool?.category ?? (categoryRoutes.includes(from) ? from.slice(1, -1) : null);
    if (fromCategory && fromCategory !== toTool.category) crossEdges.push({ from, to: link.to, text: link.text });
  }
}
const uniqueCrossEdges = [...new Map(crossEdges.map((edge) => [edge.from + "->" + edge.to, edge])).values()];
for (const [fromSlug, toSlug] of expectedToolEdges) {
  const fromRoute = toolRouteForSlug(fromSlug);
  const toRoute = toolRouteForSlug(toSlug);
  if (!(outbound.get(fromRoute) ?? []).some((edge) => edge.to === toRoute)) fail("Missing contextual tool link: " + fromSlug + " -> " + toSlug + ".");
}
if (new Set(crossEdges.map((edge) => edge.from + "->" + edge.to)).size !== crossEdges.length) fail("Duplicate cross-category source/target edge detected.");
if (toolStats.some((tool) => tool.outboundContextual > 5)) fail("A tool page has more than five contextual tool links; review for over-linking.");

if (failures.length) {
  console.error(failures.map((failure) => "FAIL: " + failure).join("\n"));
  process.exit(1);
}

const inboundCounts = Object.fromEntries(publicRoutes.map((route) => [route, (inbound.get(route) ?? []).length]));
const outboundCounts = Object.fromEntries(registryTools.map((tool) => [tool.slug, toolStats.find((stat) => stat.slug === tool.slug).outboundContextual]));
const totalToolOutbound = toolStats.reduce((sum, tool) => sum + tool.outboundContextual, 0);
const categoryHubCrossLinks = crossEdges.filter((edge) => categoryRoutes.includes(edge.from)).length;
const toolPageCrossLinks = crossEdges.filter((edge) => Boolean(sourceTool(edge.from))).length;
console.log(JSON.stringify({
  phase: "3",
  indexablePages: publicRoutes.length,
  tools: registryTools.length,
  orphanPages,
  weakToolPages,
  inboundByPage: inboundCounts,
  toolOutboundContextualBySlug: outboundCounts,
  toolInboundMinimum: Math.min(...toolStats.map((tool) => tool.contextualInbound)),
  toolInboundMaximum: Math.max(...toolStats.map((tool) => tool.contextualInbound)),
  totalToolOutboundContextualLinks: totalToolOutbound,
  categoryHubToolLinks: registryTools.length,
  semanticGroupCounts: Object.fromEntries(Object.entries(expectedGroupHeadings).map(([category, headings]) => [category, headings.length])),
  crossCategoryEdges: uniqueCrossEdges.length,
  crossCategoryEdgesFromCategoryHubs: categoryHubCrossLinks,
  crossCategoryEdgesFromToolPages: toolPageCrossLinks,
  crossCategoryEdgeList: uniqueCrossEdges,
  toolsHub: { categoryGroups: catalogGroupCount, toolCards: catalogCards.length, filters: 5 },
}, null, 2));

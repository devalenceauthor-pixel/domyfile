import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(scriptRoot, "..");
const dist = path.join(projectRoot, "dist");
const origin = "https://domyfile.web.id";
const trustRoutes = ["/about/", "/privacy/", "/terms/", "/open-source/"];
const failures = [];
const fail = (message) => failures.push(message);
const readDist = (route) => readFileSync(route === "/" ? path.join(dist, "index.html") : path.join(dist, route.slice(1), "index.html"), "utf8");
const decodeHtml = (value) => value
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .replace(/&#x27;/g, "'");
const getAttribute = (tag, name) => decodeHtml(tag.match(new RegExp("\\b" + name + "=[\"']([^\"']*)[\"']", "i"))?.[1] ?? "");
const staticTargetExists = (pathname) => pathname === "/"
  ? existsSync(path.join(dist, "index.html"))
  : pathname.endsWith("/")
    ? existsSync(path.join(dist, pathname.slice(1), "index.html"))
    : existsSync(path.join(dist, pathname.slice(1)));

if (!existsSync(dist)) fail("dist/ does not exist; run the production build first.");

const htmlByRoute = new Map();
for (const route of trustRoutes) {
  const file = path.join(dist, route.slice(1), "index.html");
  if (!existsSync(file)) {
    fail("Missing trust page " + route + ".");
    continue;
  }
  htmlByRoute.set(route, readDist(route));
}

for (const [route, html] of htmlByRoute) {
  const expectedUrl = origin + route;
  const patterns = [
    ["title", /<title\b[^>]*>[\s\S]*?<\/title>/gi],
    ["meta description", /<meta\b[^>]*\bname=["']description["'][^>]*>/gi],
    ["H1", /<h1\b[^>]*>[\s\S]*?<\/h1>/gi],
    ["canonical", /<link\b[^>]*\brel=["']canonical["'][^>]*>/gi],
    ["og:url", /<meta\b[^>]*\bproperty=["']og:url["'][^>]*>/gi],
  ];
  for (const [label, pattern] of patterns) {
    const count = [...html.matchAll(pattern)].length;
    if (count !== 1) fail(route + ": expected one " + label + "; found " + count + ".");
  }
  if (/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html)) fail(route + ": contains noindex.");
  const canonical = getAttribute(html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*>/i)?.[0] ?? "", "href");
  const ogUrl = getAttribute(html.match(/<meta\b[^>]*\bproperty=["']og:url["'][^>]*>/i)?.[0] ?? "", "content");
  if (canonical !== expectedUrl) fail(route + ": canonical is " + canonical + "; expected " + expectedUrl + ".");
  if (ogUrl !== canonical) fail(route + ": og:url does not match canonical.");
  if (!/<nav\b[^>]*aria-label=["']Breadcrumb["']/i.test(html)) fail(route + ": visible breadcrumb is missing.");
  const schemas = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(([, json]) => {
    try {
      return JSON.parse(json);
    } catch (error) {
      fail(route + ": invalid JSON-LD (" + error.message + ").");
      return null;
    }
  }).filter(Boolean);
  if (!schemas.some((schema) => schema["@type"] === "BreadcrumbList")) fail(route + ": missing BreadcrumbList JSON-LD.");
  if (schemas.some((schema) => schema["@type"] === "Organization" || schema["@type"] === "Person")) fail(route + ": contains unsupported Organization or Person schema.");
}

const allTrustHtml = [...htmlByRoute.values()].join(" ");
for (const marker of ["Browser-local processing", "Temporary server processing", "deleted", "analytics", "training", "operational"]) {
  if (!allTrustHtml.toLowerCase().includes(marker.toLowerCase())) fail("Trust pages are missing the privacy marker: " + marker + ".");
}
for (const marker of ["lawfully", "temporary", "unsupported", "legal review"]) {
  if (!(htmlByRoute.get("/terms/") ?? "").toLowerCase().includes(marker.toLowerCase())) fail("Terms page is missing the marker: " + marker + ".");
}
for (const marker of ["FFmpeg", "HEIC", "pikepdf", "libvpx", "libopus", "SOURCE-OFFER.md"]) {
  if (!(htmlByRoute.get("/open-source/") ?? "").includes(marker)) fail("Open-source page is missing the marker: " + marker + ".");
}

const pagesToAudit = ["/", "/tools/", ...trustRoutes, "/image/", "/pdf/", "/audio/", "/video/"];
for (const route of pagesToAudit) {
  if (!staticTargetExists(route)) continue;
  const html = route === "/" ? readDist("/") : htmlByRoute.get(route) ?? readDist(route);
  for (const [, href] of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    if (href.startsWith("#") || /^(?:mailto:|tel:|javascript:|data:)/i.test(href) || /^https?:\/\//i.test(href) || href.startsWith("//")) continue;
    const target = new URL(href, origin + route).pathname;
    if (!staticTargetExists(target)) fail(route + ": broken trust-page link " + href + ".");
  }
}

const serverRoutes = ["/pdf/compress-pdf/", "/video/compress-video/"];
for (const route of serverRoutes) {
  if (!staticTargetExists(route)) {
    fail("Server-bound tool page is missing from the build: " + route + ".");
    continue;
  }
  const html = readDist(route);
  if (!/Temporary upload for processing/i.test(html)) fail(route + ": upload disclosure is missing before the workspace.");
  if (!/deleted automatically/i.test(html)) fail(route + ": automatic deletion disclosure is missing.");
}

if (failures.length) {
  console.error(failures.map((failure) => "FAIL: " + failure).join("\n"));
  process.exit(1);
}

console.log("Phase 6 static audit passed: " + trustRoutes.length + " trust pages, factual privacy/terms/license markers, breadcrumbs/schema, server disclosures, and internal links verified.");

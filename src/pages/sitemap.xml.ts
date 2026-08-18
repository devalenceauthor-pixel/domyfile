import type { APIRoute } from "astro";
import { categoryMeta, getToolPath, isProductionReady, tools } from "../tools/registry";
import type { ToolCategory } from "../tools/types";
import { SITE_ORIGIN } from "../config/site";

export const prerender = true;

const paths = [
  "/",
  "/tools/",
  "/about/",
  "/privacy/",
  "/terms/",
  "/open-source/",
  ...(Object.keys(categoryMeta) as ToolCategory[]).map((category) => `/${category}/`),
  ...tools.filter(isProductionReady).map(getToolPath),
];

export const GET: APIRoute = () => {
  const urls = [...new Set(paths)].map((path) => `${SITE_ORIGIN}${path}`);
  const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join("\n")}
</urlset>`;

  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};

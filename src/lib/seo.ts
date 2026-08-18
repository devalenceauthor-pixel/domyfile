import { categoryMeta, getToolPath } from "../tools/registry";
import { getToolContent } from "../content/tool-content";
import type { ToolCategory, ToolDefinition } from "../tools/types";
import { SITE_ORIGIN } from "../config/site";

export type JsonLd = Record<string, unknown>;

export type BreadcrumbItem = {
  label: string;
  url: string;
};

export const getCanonicalPath = (pathname: string) => {
  const path = pathname.split(/[?#]/, 1)[0] || "/";
  if (path === "/") return "/";

  return `/${path.replace(/^\/+|\/+$/g, "")}/`;
};

export const getCanonicalUrl = (pathname: string) => `${SITE_ORIGIN}${getCanonicalPath(pathname)}`;

export const serializeJsonLd = (value: JsonLd) => JSON.stringify(value)
  .replace(/</g, "\\u003c")
  .replace(/>/g, "\\u003e")
  .replace(/&/g, "\\u0026");

export const getBreadcrumbSchema = (items: BreadcrumbItem[]): JsonLd => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.label,
    item: item.url,
  })),
});

export const getHomeBreadcrumbItem = (): BreadcrumbItem => ({ label: "Home", url: getCanonicalUrl("/") });

export const getCategoryBreadcrumbItem = (category: ToolCategory): BreadcrumbItem => ({
  label: categoryMeta[category].label,
  url: getCanonicalUrl(`/${category}/`),
});

export const getToolsStructuredData = () => [
  getBreadcrumbSchema([
    getHomeBreadcrumbItem(),
    { label: "All tools", url: getCanonicalUrl("/tools/") },
  ]),
];

export const getCategoryStructuredData = (category: ToolCategory) => [
  getBreadcrumbSchema([
    getHomeBreadcrumbItem(),
    getCategoryBreadcrumbItem(category),
  ]),
];

export const getTrustPageStructuredData = (label: string, pathname: string) => [
  getBreadcrumbSchema([
    getHomeBreadcrumbItem(),
    { label, url: getCanonicalUrl(pathname) },
  ]),
];

export const getToolStructuredData = (tool: ToolDefinition) => [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: tool.title,
    url: getCanonicalUrl(getToolPath(tool)),
    description: getToolContent(tool).page.intro,
    applicationCategory: categoryMeta[tool.category].label,
  },
  getBreadcrumbSchema([
    getHomeBreadcrumbItem(),
    getCategoryBreadcrumbItem(tool.category),
    { label: tool.title, url: getCanonicalUrl(getToolPath(tool)) },
  ]),
];

export const getWebsiteStructuredData = (description: string) => [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "DoMyFile",
    url: getCanonicalUrl("/"),
    description,
  },
];

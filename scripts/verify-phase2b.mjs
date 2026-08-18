import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(root, "..");
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
const getAttribute = (tag, name) => decodeHtml(tag.match(new RegExp("\\b" + name + "=[\"']([^\"']*)[\"']", "i"))?.[1] ?? "");
const getTagText = (html, tag) => stripHtml(html.match(new RegExp("<" + tag + "\\b[^>]*>([\\s\\S]*?)<\\/" + tag + ">", "i"))?.[1] ?? "");
const getMeta = (html, property, attribute = "name") => {
  const tag = html.match(new RegExp("<meta\\b[^>]*\\b" + attribute + "=[\"']" + property + "[\"'][^>]*>", "i"))?.[0] ?? "";
  return getAttribute(tag, "content");
};
const expectedUrl = (category, slug) => origin + "/" + category + "/" + slug + "/";
const routeToFile = (category, slug) => path.join(dist, category, slug, "index.html");

if (!existsSync(dist)) fail("dist/ does not exist; run the production build first.");

let matrix = [];
try {
  matrix = JSON.parse(readProject("src/content/tool-content.json"));
} catch (error) {
  fail("Content matrix is not valid JSON: " + error.message + ".");
}

const registry = readProject("src/tools/registry.ts");
const registryRoutes = [...registry.matchAll(/\{\s*id:\s*"([^"]+)",\s*slug:\s*"([^"]+)",\s*category:\s*"([^"]+)"/g)]
  .map(([, id, slug, category]) => ({ id, slug, category }));
if (registryRoutes.length !== 29) fail("Expected 29 production-ready tools; found " + registryRoutes.length + ".");
if (matrix.length !== registryRoutes.length) fail("Expected one Phase 2B matrix entry per tool; found " + matrix.length + ".");

const matrixBySlug = new Map(matrix.map((entry) => [entry.slug, entry]));
const records = [];
const titleValues = [];
const descriptionValues = [];
const h1Values = [];
const faqQuestions = [];
const similarityTexts = [];
const forbiddenClaim = /\b(best|fastest|unlimited|download counts?|ratings?|reviews?)\b/i;

for (const tool of registryRoutes) {
  const entry = matrixBySlug.get(tool.slug);
  if (!entry) {
    fail(tool.slug + ": missing from the Phase 2B matrix.");
    continue;
  }

  const page = entry.page;
  if (!page) {
    fail(tool.slug + ": missing page copy.");
    continue;
  }
  for (const field of ["title", "metaDescription", "h1", "intro", "summary", "privacy"]) {
    if (typeof page[field] !== "string" || !page[field].trim()) fail(tool.slug + ": page." + field + " is empty.");
  }
  if (!Array.isArray(page.steps) || page.steps.length !== 3 || page.steps.some((step) => !step?.title || !step?.body)) {
    fail(tool.slug + ": page.steps must contain three complete steps.");
  }
  if (!Array.isArray(entry.faqContent) || entry.faqContent.length < 3 || entry.faqContent.length > 5) {
    fail(tool.slug + ": faqContent must contain 3-5 complete FAQs.");
  }
  for (const faq of entry.faqContent ?? []) {
    if (!faq?.question || !faq?.answer) fail(tool.slug + ": FAQ content contains an incomplete question or answer.");
    faqQuestions.push(faq.question);
  }
  if (forbiddenClaim.test(page.title + " " + page.metaDescription + " " + page.intro + " " + page.summary + " " + page.privacy)) {
    fail(tool.slug + ": page copy contains an unsupported superlative, count, rating, or review claim.");
  }
  if (entry.processingMode === "browser-local" && /temporarily uploaded/i.test(page.privacy)) {
    fail(tool.slug + ": browser-local privacy copy claims a temporary upload.");
  }
  if (entry.processingMode === "temporary-server" && !/temporarily uploaded/i.test(page.privacy)) {
    fail(tool.slug + ": temporary-server privacy copy does not disclose the upload.");
  }

  const file = routeToFile(tool.category, tool.slug);
  if (!existsSync(file)) {
    fail("Missing static tool HTML for /" + tool.category + "/" + tool.slug + "/.");
    continue;
  }
  const html = readFileSync(file, "utf8");
  const route = "/" + tool.category + "/" + tool.slug + "/";
  const title = getTagText(html, "title");
  const description = getMeta(html, "description");
  const h1 = getTagText(html, "h1");
  const canonical = getAttribute(html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*>/i)?.[0] ?? "", "href");
  const ogUrl = getMeta(html, "og:url", "property");
  const faqBlock = html.match(/<section class=["']faq-section["'][\s\S]*?<\/section>/i)?.[0] ?? "";
  const renderedFaqs = [...faqBlock.matchAll(/<details\b[\s\S]*?<summary[^>]*>([\s\S]*?)<\/summary>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>[\s\S]*?<\/details>/gi)]
    .map(([, question, answer]) => ({ question: stripHtml(question), answer: stripHtml(answer) }));
  const staticText = stripHtml(html);
  const schemaValues = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map(([, json]) => {
      try {
        return JSON.parse(json);
      } catch (error) {
        fail(route + ": invalid JSON-LD (" + error.message + ").");
        return null;
      }
    })
    .filter(Boolean);
  const webApplication = schemaValues.find((schema) => schema["@type"] === "WebApplication");

  if (title !== page.title) fail(route + ": rendered title does not match the matrix.");
  if (description !== page.metaDescription) fail(route + ": rendered meta description does not match the matrix.");
  if (h1 !== page.h1) fail(route + ": rendered H1 does not match the matrix.");
  if (canonical !== expectedUrl(tool.category, tool.slug)) fail(route + ": canonical is not the expected absolute self URL.");
  if (ogUrl !== canonical) fail(route + ": og:url does not match canonical.");
  if (webApplication?.description !== page.intro) fail(route + ": WebApplication description does not match visible intro.");
  if (!/<nav\b[^>]*aria-label=["']Breadcrumb["']/i.test(html)) fail(route + ": visible breadcrumbs are missing.");
  if (renderedFaqs.length !== entry.faqContent.length) fail(route + ": rendered FAQ count does not match the matrix.");
  for (let index = 0; index < Math.min(renderedFaqs.length, entry.faqContent.length); index++) {
    const expectedFaq = entry.faqContent[index];
    if (renderedFaqs[index].question !== expectedFaq.question || renderedFaqs[index].answer !== expectedFaq.answer) {
      fail(route + ": rendered FAQ " + (index + 1) + " does not match the matrix.");
    }
  }
  for (const fact of [
    ...entry.keyControls,
    ...entry.importantLimitations,
    ...entry.qualityCompatibility,
    entry.batchBehavior.description,
    entry.resultDownload,
    page.privacy,
  ]) {
    if (!staticText.includes(fact)) fail(route + ": factual matrix text is missing from static HTML: " + fact);
  }

  titleValues.push(title);
  descriptionValues.push(description);
  h1Values.push(h1);
  similarityTexts.push({
    slug: tool.slug,
    text: stripHtml([
      html.match(/<section class=["']tool-seo["'][\s\S]*?<\/section>/i)?.[0] ?? "",
      html.match(/<section class=["']tool-info-grid["'][\s\S]*?<\/section>/i)?.[0] ?? "",
      faqBlock,
    ].join(" ")),
  });
  records.push({ slug: tool.slug, route, title, description, h1, renderedFaqs });
}

const duplicateValues = (values) => {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1);
};
if (new Set(titleValues).size !== titleValues.length) fail("Tool titles are not unique.");
if (new Set(descriptionValues).size !== descriptionValues.length) fail("Tool meta descriptions are not unique.");
if (new Set(h1Values).size !== h1Values.length) fail("Tool H1 values are not unique.");

const genericQuestions = new Set(["Are my files uploaded?", "Which files can I choose?", "Is the processor connected yet?"]);
const genericFaqPages = records.filter((record) => record.renderedFaqs.some((faq) => genericQuestions.has(faq.question)));
if (genericFaqPages.length) fail("Generic Phase 1 FAQ questions remain on: " + genericFaqPages.map((record) => record.slug).join(", ") + ".");

const shingles = (value) => {
  const words = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(Boolean);
  const result = new Set();
  for (let index = 0; index <= words.length - 3; index++) result.add(words.slice(index, index + 3).join(" "));
  return result;
};
const jaccard = (left, right) => {
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection++;
  return intersection / Math.max(1, new Set([...left, ...right]).size);
};
const similarities = [];
for (let left = 0; left < similarityTexts.length; left++) {
  for (let right = left + 1; right < similarityTexts.length; right++) {
    similarities.push({
      left: similarityTexts[left].slug,
      right: similarityTexts[right].slug,
      score: jaccard(shingles(similarityTexts[left].text), shingles(similarityTexts[right].text)),
    });
  }
}
similarities.sort((left, right) => right.score - left.score);
if (similarities[0]?.score > 0.8) {
  fail("Suspicious SEO content similarity remains between " + similarities[0].left + " and " + similarities[0].right + " (" + similarities[0].score.toFixed(3) + ").");
}

if (failures.length) {
  console.error(failures.map((failure) => "FAIL: " + failure).join("\n"));
  process.exit(1);
}

const faqQuestionDuplicates = duplicateValues(faqQuestions);
const averageSimilarity = similarities.reduce((sum, item) => sum + item.score, 0) / Math.max(1, similarities.length);
console.log(JSON.stringify({
  phase: "2B",
  tools: records.length,
  uniqueTitles: new Set(titleValues).size,
  uniqueMetaDescriptions: new Set(descriptionValues).size,
  uniqueH1s: new Set(h1Values).size,
  faqQuestions: faqQuestions.length,
  uniqueFaqQuestions: new Set(faqQuestions).size,
  repeatedFaqQuestions: faqQuestionDuplicates.length,
  topSimilarity: similarities[0] ?? null,
  averageSimilarity: Number(averageSimilarity.toFixed(3)),
}, null, 2));

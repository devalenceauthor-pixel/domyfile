import rawToolContentMatrix from "./tool-content.json";
import type { ToolCategory, ToolDefinition } from "../tools/types";

export type ToolPageStep = {
  title: string;
  body: string;
};

export type ToolPageContent = {
  title: string;
  metaDescription: string;
  h1: string;
  intro: string;
  summary: string;
  steps: [ToolPageStep, ToolPageStep, ToolPageStep];
  privacy: string;
};

export type ToolFaqContent = {
  question: string;
  answer: string;
};

export type ToolContentMatrixEntry = {
  slug: string;
  title: string;
  category: ToolCategory;
  primarySearchIntent: string;
  acceptedInput: {
    formats: string[];
    extensions: string[];
  };
  output: {
    formats: string[];
    behavior: string;
  };
  processingMode: "browser-local" | "temporary-server";
  keyControls: string[];
  batchBehavior: {
    supported: boolean;
    minimumFiles?: number;
    description: string;
  };
  importantLimitations: string[];
  qualityCompatibility: string[];
  resultDownload: string;
  faqTopics: string[];
  relatedTools: [string, string, string];
  primaryLongTailOpportunity: string;
  canonicalDecision: string;
  page: ToolPageContent;
  faqContent: ToolFaqContent[];
};

export const toolContentMatrix = rawToolContentMatrix as ToolContentMatrixEntry[];

const toolContentBySlug = new Map(toolContentMatrix.map((entry) => [entry.slug, entry]));

export const getToolContent = (tool: Pick<ToolDefinition, "slug" | "category">) => {
  const content = toolContentBySlug.get(tool.slug);
  if (!content) throw new Error(`Missing Phase 2A content matrix entry for ${tool.slug}.`);
  if (content.category !== tool.category) {
    throw new Error(`Phase 2A content matrix category mismatch for ${tool.slug}.`);
  }
  return content;
};

export const getToolContentBySlug = (slug: string) => toolContentBySlug.get(slug);

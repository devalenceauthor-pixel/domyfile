export type ToolCategory = "image" | "pdf" | "word" | "audio" | "video";

export type ProcessorKey = "image" | "image-upscaler" | "pdf" | "document" | "background-removal" | "media" | "server";

export type ProcessingBoundary = "browser" | "server";

export type ToolAvailability = "production-ready" | "deferred" | "unsupported";

export type ToolFaq = {
  question: string;
  answer: string;
};

export type ToolDefinition = {
  id: string;
  slug: string;
  category: ToolCategory;
  title: string;
  description: string;
  processor: ProcessorKey;
  processingBoundary?: ProcessingBoundary;
  input: {
    formats: string[];
    extensions: string[];
    mimes: string[];
  };
  output: {
    formats: string[];
    suffix: string;
  };
  batch: boolean;
  minimumFiles?: number;
  action: string;
  keywords: string[];
  searchTerms?: string[];
  metaDescription?: string;
  seoCopy?: string;
  faqs?: ToolFaq[];
  featured: boolean;
  serverDisclosure?: string;
  availability?: ToolAvailability;
  statusReason?: string;
};

export type CategoryDefinition = {
  label: string;
  number: string;
  description: string;
  visualFormat: string;
  visualName: string;
  visualSize: string;
  groups: ToolGroupDefinition[];
  content: {
    heading: string;
    body: string;
    formats: string;
    intents: string;
    processing: string;
  };
};

export type ToolGroupDefinition = {
  key: string;
  label: string;
  description: string;
  toolSlugs: string[];
};

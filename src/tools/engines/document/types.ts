export const documentToolSlugs = [
  "docx-to-pdf",
  "pdf-to-docx",
  "docx-to-txt",
  "txt-to-docx",
  "docx-to-html",
  "html-to-docx",
  "merge-docx",
  "compress-docx",
  "extract-images-from-docx",
  "docx-metadata-cleaner",
] as const;

export type DocumentToolSlug = (typeof documentToolSlugs)[number];
export type DocumentOutputFormat = "txt" | "html" | "docx" | "pdf" | "image" | "zip";

export type DocumentCompressionPreset = "light" | "balanced" | "strong";

export type DocumentProcessOptions = {
  tool: DocumentToolSlug;
  compressionPreset?: DocumentCompressionPreset;
};

export type DocumentValidationIssue = {
  file: File;
  code: DocumentErrorCode;
  message: string;
};

export type DocumentValidationResult = {
  valid: boolean;
  issues: DocumentValidationIssue[];
};

export type DocumentProcessItem = {
  input: File;
  output: File;
  format: DocumentOutputFormat;
  inputBytes: number;
  outputBytes: number;
  metadata?: {
    detected: string[];
    removed: string[];
  };
};

export type DocumentProcessFailure = {
  input: File;
  error: DocumentProcessingError;
};

export type DocumentProcessResult = {
  items: DocumentProcessItem[];
  failures: DocumentProcessFailure[];
  archive?: DocumentProcessItem;
};

export type DocumentErrorCode =
  | "UNSUPPORTED_FORMAT"
  | "INVALID_INPUT"
  | "CORRUPT_FILE"
  | "NO_READABLE_CONTENT"
  | "NO_USEFUL_REDUCTION"
  | "UNSUPPORTED_FEATURE"
  | "PROCESSING_FAILED"
  | "BROWSER_UNSUPPORTED"
  | "CANCELLED";

export class DocumentProcessingError extends Error {
  readonly code: DocumentErrorCode;
  readonly userMessage: string;
  readonly cause?: unknown;

  constructor(code: DocumentErrorCode, userMessage: string, cause?: unknown) {
    super(userMessage);
    this.name = "DocumentProcessingError";
    this.code = code;
    this.userMessage = userMessage;
    this.cause = cause;
  }
}

export interface DocumentEngine {
  validate(files: File[], options: DocumentProcessOptions): Promise<DocumentValidationResult>;
  process(files: File[], options: DocumentProcessOptions, signal?: AbortSignal): Promise<DocumentProcessResult>;
  inspectMetadata?(file: File): Promise<{ detected: string[]; removable: string[] }>;
  dispose(): void;
}

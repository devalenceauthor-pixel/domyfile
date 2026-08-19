export const pdfToolSlugs = [
  "merge-pdf",
  "split-pdf",
  "organize-pdf",
  "rotate-pdf",
  "jpg-to-pdf",
  "png-to-pdf",
  "webp-to-pdf",
  "pdf-to-jpg",
  "watermark-pdf",
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
] as const;

export type PdfToolSlug = (typeof pdfToolSlugs)[number];

export const imageToPdfToolSlugs = ["jpg-to-pdf", "png-to-pdf", "webp-to-pdf"] as const;

export type ImageToPdfToolSlug = (typeof imageToPdfToolSlugs)[number];

export const isImageToPdfTool = (slug: PdfToolSlug): slug is ImageToPdfToolSlug => imageToPdfToolSlugs.includes(slug as ImageToPdfToolSlug);

export type PdfMime =
  | "application/pdf"
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "text/plain"
  | "text/html"
  | "application/json";

export type PdfPageSelection = "all" | string;

export type PdfWatermarkPlacement = "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type PdfOptions = {
  pageSelection?: PdfPageSelection;
  splitGroups?: number[][];
  organizeOrder?: number[];
  rotation?: 90 | 180 | 270;
  rotationScope?: PdfPageSelection;
  pageSize?: "fit" | "a4" | "letter";
  pageOrientation?: "auto" | "portrait" | "landscape";
  jpgScale?: number;
  jpgQuality?: number;
  rasterFormat?: "jpg" | "png" | "webp";
  extractImageFormat?: "png" | "webp";
  extractImageQuality?: number;
  pageNumberStart?: number;
  pageNumberPlacement?: PdfWatermarkPlacement;
  headerText?: string;
  footerText?: string;
  headerFooterScope?: PdfPageSelection;
  cropMargin?: number;
  textFontSize?: number;
  watermarkMode?: "text" | "image";
  watermarkText?: string;
  watermarkImage?: File;
  watermarkPlacement?: PdfWatermarkPlacement;
  watermarkScale?: number;
  watermarkOpacity?: number;
  watermarkColor?: string;
};

export type PdfValidationIssue = {
  file: File;
  code: PdfErrorCode;
  message: string;
};

export type PdfValidationResult = {
  valid: boolean;
  issues: PdfValidationIssue[];
};

export type PdfProcessItem = {
  input: File;
  output: File;
  mime: PdfMime;
  pageCount?: number;
  pageNumber?: number;
  inputBytes: number;
  outputBytes: number;
  width?: number;
  height?: number;
  detail?: string;
};

export type PdfProcessFailure = {
  input: File;
  error: PdfProcessingError;
};

export type PdfProcessResult = {
  items: PdfProcessItem[];
  failures: PdfProcessFailure[];
};

export type PdfErrorCode =
  | "UNSUPPORTED_FORMAT"
  | "INVALID_INPUT"
  | "CORRUPT_FILE"
  | "ENCRYPTED_PDF_UNSUPPORTED"
  | "ENGINE_LOAD_FAILED"
  | "PROCESSING_FAILED"
  | "OUT_OF_MEMORY_RISK"
  | "CANCELLED";

export class PdfProcessingError extends Error {
  readonly code: PdfErrorCode;
  readonly userMessage: string;
  readonly cause?: unknown;

  constructor(code: PdfErrorCode, userMessage: string, cause?: unknown) {
    super(userMessage);
    this.name = "PdfProcessingError";
    this.code = code;
    this.userMessage = userMessage;
    this.cause = cause;
  }
}

export interface PdfEngine {
  validate(files: File[], options: { tool: PdfToolSlug }): Promise<PdfValidationResult>;
  inspect(file: File, signal?: AbortSignal): Promise<{ pageCount: number }>;
  process(files: File[], options: PdfOptions & { tool: PdfToolSlug }, signal?: AbortSignal): Promise<PdfProcessResult>;
  dispose(): void;
}

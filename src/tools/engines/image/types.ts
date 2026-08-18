export const imageToolSlugs = [
  "compress-image",
  "resize-image",
  "png-to-jpg",
  "jpg-to-png",
  "jpg-to-webp",
  "png-to-webp",
  "webp-to-jpg",
  "webp-to-png",
  "crop-image",
  "heic-to-jpg",
] as const;

export type ImageToolSlug = (typeof imageToolSlugs)[number];

export type ImageMime = "image/jpeg" | "image/png" | "image/webp";

export type ImageInputMime = ImageMime | "image/heic" | "image/heif";

export type ImageFormatChoice = ImageMime | "original";

export type ImageOptions = {
  quality?: number;
  outputFormat?: ImageFormatChoice;
  scale?: number;
  keepRatio?: boolean;
  cropRatio?: "free" | number | string;
  cropPlan?: ImageRenderPlan;
  backgroundColor?: string;
  preserveDimensions?: boolean;
};

export type NormalizedImageOptions = {
  tool: ImageToolSlug;
  quality: number;
  outputFormat?: ImageFormatChoice;
  scale: number;
  cropRatio: "free" | number;
  cropPlan?: ImageRenderPlan;
  backgroundColor: string;
};

export type ImageRenderPlan = {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
};

export type ImageValidationIssue = {
  file: File;
  code: ImageErrorCode;
  message: string;
};

export type ImageValidationResult = {
  valid: boolean;
  issues: ImageValidationIssue[];
};

export type ImageProcessItem = {
  input: File;
  output: File;
  mime: ImageMime;
  width: number;
  height: number;
  inputBytes: number;
  outputBytes: number;
};

export type ImageProcessFailure = {
  input: File;
  error: ImageProcessingError;
};

export type ImageProcessResult = {
  items: ImageProcessItem[];
  failures: ImageProcessFailure[];
};

export type ImageErrorCode =
  | "UNSUPPORTED_FORMAT"
  | "INVALID_INPUT"
  | "CORRUPT_FILE"
  | "BROWSER_UNSUPPORTED"
  | "PROCESSING_FAILED"
  | "OUT_OF_MEMORY"
  | "CANCELLED";

export class ImageProcessingError extends Error {
  readonly code: ImageErrorCode;
  readonly userMessage: string;
  readonly cause?: unknown;

  constructor(code: ImageErrorCode, userMessage: string, cause?: unknown) {
    super(userMessage);
    this.name = "ImageProcessingError";
    this.code = code;
    this.userMessage = userMessage;
    this.cause = cause;
  }
}

export interface ImageEngine {
  validate(files: File[], options: { tool: ImageToolSlug }): Promise<ImageValidationResult>;
  process(files: File[], options: ImageOptions & { tool: ImageToolSlug }, signal?: AbortSignal): Promise<ImageProcessResult>;
  dispose(): void;
}

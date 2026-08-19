export const imageUpscalerToolSlug = "upscale-image" as const;
export type ImageUpscalerScale = 3;

export type ImageUpscalerOptions = {
  scale: ImageUpscalerScale;
};

export type ImageUpscalerResult = {
  input: File;
  output: File;
  inputWidth: number;
  inputHeight: number;
  outputWidth: number;
  outputHeight: number;
  scale: ImageUpscalerScale;
  inputBytes: number;
  outputBytes: number;
};

export type ImageUpscalerErrorCode =
  | "UNSUPPORTED_FORMAT"
  | "INVALID_INPUT"
  | "CORRUPT_FILE"
  | "OUT_OF_MEMORY_RISK"
  | "MODEL_LOAD_FAILED"
  | "BROWSER_UNSUPPORTED"
  | "PROCESSING_FAILED"
  | "CANCELLED";

export class ImageUpscalerError extends Error {
  readonly code: ImageUpscalerErrorCode;
  readonly userMessage: string;
  readonly cause?: unknown;

  constructor(code: ImageUpscalerErrorCode, userMessage: string, cause?: unknown) {
    super(userMessage);
    this.name = "ImageUpscalerError";
    this.code = code;
    this.userMessage = userMessage;
    if (cause) this.cause = cause;
  }
}

export type ImageUpscalerEngine = {
  process: (file: File, options: ImageUpscalerOptions, signal?: AbortSignal, onProgress?: (progress: number, message: string) => void) => Promise<ImageUpscalerResult>;
  dispose: () => void;
};

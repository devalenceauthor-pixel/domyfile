export type BackgroundRemovalErrorCode =
  | "UNSUPPORTED_FORMAT"
  | "INVALID_INPUT"
  | "CORRUPT_FILE"
  | "BROWSER_UNSUPPORTED"
  | "MODEL_LOAD_FAILED"
  | "PROCESSING_FAILED"
  | "OUT_OF_MEMORY"
  | "CANCELLED";

export class BackgroundRemovalError extends Error {
  readonly code: BackgroundRemovalErrorCode;
  readonly userMessage: string;
  readonly cause?: unknown;

  constructor(code: BackgroundRemovalErrorCode, userMessage: string, cause?: unknown) {
    super(userMessage);
    this.name = "BackgroundRemovalError";
    this.code = code;
    this.userMessage = userMessage;
    this.cause = cause;
  }
}

export type BackgroundRemovalProgress = (progress?: number, label?: string) => void;

export type BackgroundRemovalResult = {
  input: File;
  output: File;
  inputBytes: number;
  outputBytes: number;
};

export interface BackgroundRemovalEngine {
  validate(file: File): Promise<void>;
  process(file: File, signal?: AbortSignal, onProgress?: BackgroundRemovalProgress): Promise<BackgroundRemovalResult>;
  dispose(): void;
}

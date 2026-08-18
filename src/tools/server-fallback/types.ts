export type ServerToolId = "PDF-01" | "VID-01";

export type ServerPreset = "quality" | "balanced" | "smaller";

export type ServerJobStatus =
  | "created"
  | "uploading"
  | "queued"
  | "validating"
  | "processing"
  | "verifying"
  | "ready"
  | "error"
  | "cancelled"
  | "expired";

export type ServerErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_FORMAT"
  | "CORRUPT_FILE"
  | "ENCRYPTED_PDF_UNSUPPORTED"
  | "RESOURCE_LIMIT"
  | "UPLOAD_FAILED"
  | "SERVER_UNAVAILABLE"
  | "RATE_LIMITED"
  | "NO_USEFUL_REDUCTION"
  | "OUTPUT_INVALID"
  | "JOB_EXPIRED"
  | "CANCELLED"
  | "PROCESSING_FAILED";

export type ServerJobOptions = {
  preset: ServerPreset;
};

export type ServerJobResult = {
  inputBytes: number;
  outputBytes: number;
  savingsPercent: number;
  outputMime: "application/pdf" | "video/webm";
  outputFormat: "PDF" | "WebM";
  durationSeconds?: number;
  width?: number;
  height?: number;
  audioStreams?: number;
  pageCount?: number;
  textPagesPreserved?: number;
};

export type ServerJobStatusResponse = {
  jobId: string;
  status: ServerJobStatus;
  progress?: number;
  code?: ServerErrorCode;
  expiresAt: string;
  result?: ServerJobResult;
};

export type ServerJobLimits = {
  maxUploadBytes: number;
  maxOutputBytes: number;
  maxDurationSeconds?: number;
  maxPages?: number;
  maxDecodedPixels?: number;
  maxWidth?: number;
  maxHeight?: number;
  maxMemoryBytes: number;
  maxCpuSeconds: number;
  maxWallSeconds: number;
  maxConcurrentJobs: number;
  ttlSeconds: number;
  minimumSavingsPercent: number;
};

export const SERVER_FALLBACK_LIMITS: Record<ServerToolId, ServerJobLimits> = {
  "PDF-01": {
    maxUploadBytes: 50 * 1024 * 1024,
    maxOutputBytes: 60 * 1024 * 1024,
    maxPages: 200,
    maxDecodedPixels: 150_000_000,
    maxMemoryBytes: 1_536 * 1024 * 1024,
    maxCpuSeconds: 60,
    maxWallSeconds: 120,
    maxConcurrentJobs: 2,
    ttlSeconds: 900,
    minimumSavingsPercent: 5,
  },
  "VID-01": {
    maxUploadBytes: 256 * 1024 * 1024,
    maxOutputBytes: 256 * 1024 * 1024,
    maxDurationSeconds: 600,
    maxDecodedPixels: 1920 * 1080,
    maxWidth: 1920,
    maxHeight: 1080,
    maxMemoryBytes: 3 * 1024 * 1024 * 1024,
    maxCpuSeconds: 240,
    maxWallSeconds: 300,
    maxConcurrentJobs: 2,
    ttlSeconds: 900,
    minimumSavingsPercent: 5,
  },
};

export const SERVER_TOOL_OUTPUTS: Record<ServerToolId, { mime: ServerJobResult["outputMime"]; format: ServerJobResult["outputFormat"] }> = {
  "PDF-01": { mime: "application/pdf", format: "PDF" },
  "VID-01": { mime: "video/webm", format: "WebM" },
};

export const isServerToolId = (value: string): value is ServerToolId => value === "PDF-01" || value === "VID-01";

export const normalizeServerOptions = (toolId: ServerToolId, value: unknown): ServerJobOptions => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { preset: "balanced" };
  const preset = (value as { preset?: unknown }).preset;
  if (preset === "quality" || preset === "balanced" || preset === "smaller") return { preset };
  throw new Error(`Unsupported ${toolId} preset`);
};

export const getServerOutputName = (toolId: ServerToolId) => toolId === "PDF-01" ? "compressed-document.pdf" : "compressed-video.webm";

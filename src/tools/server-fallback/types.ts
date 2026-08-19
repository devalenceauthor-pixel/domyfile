export type ServerToolId = "PDF-01" | "VID-01" | "DOC-04" | "DOC-05" | "IMG-12";

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
  outputMime: "application/pdf" | "video/webm" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "image/png";
  outputFormat: "PDF" | "WebM" | "DOCX" | "PNG";
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
  requireReduction: boolean;
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
    requireReduction: true,
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
    requireReduction: true,
  },
  "DOC-04": {
    maxUploadBytes: 50 * 1024 * 1024,
    maxOutputBytes: 100 * 1024 * 1024,
    maxPages: 200,
    maxMemoryBytes: 2 * 1024 * 1024 * 1024,
    maxCpuSeconds: 120,
    maxWallSeconds: 180,
    maxConcurrentJobs: 1,
    ttlSeconds: 900,
    minimumSavingsPercent: 0,
    requireReduction: false,
  },
  "DOC-05": {
    maxUploadBytes: 50 * 1024 * 1024,
    maxOutputBytes: 100 * 1024 * 1024,
    maxPages: 200,
    maxMemoryBytes: 2 * 1024 * 1024 * 1024,
    maxCpuSeconds: 120,
    maxWallSeconds: 180,
    maxConcurrentJobs: 1,
    ttlSeconds: 900,
    minimumSavingsPercent: 0,
    requireReduction: false,
  },
  "IMG-12": {
    maxUploadBytes: 40 * 1024 * 1024,
    maxOutputBytes: 80 * 1024 * 1024,
    maxDecodedPixels: 50_000_000,
    maxWidth: 6000,
    maxHeight: 6000,
    maxMemoryBytes: 7 * 1024 * 1024 * 1024,
    maxCpuSeconds: 180,
    maxWallSeconds: 240,
    maxConcurrentJobs: 1,
    ttlSeconds: 900,
    minimumSavingsPercent: 0,
    requireReduction: false,
  },
};

export const SERVER_TOOL_INPUTS: Record<ServerToolId, { mimes: readonly string[]; magic: "pdf" | "zip" | "video" | "image" }> = {
  "PDF-01": { mimes: ["application/pdf"], magic: "pdf" },
  "VID-01": { mimes: ["video/mp4", "video/quicktime"], magic: "video" },
  "DOC-04": { mimes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"], magic: "zip" },
  "DOC-05": { mimes: ["application/pdf"], magic: "pdf" },
  "IMG-12": { mimes: ["image/jpeg", "image/png", "image/webp"], magic: "image" },
};

export const SERVER_TOOL_OUTPUTS: Record<ServerToolId, { mime: ServerJobResult["outputMime"]; format: ServerJobResult["outputFormat"]; fileName: string; magic: "pdf" | "zip" | "video" | "png" }> = {
  "PDF-01": { mime: "application/pdf", format: "PDF", fileName: "compressed-document.pdf", magic: "pdf" },
  "VID-01": { mime: "video/webm", format: "WebM", fileName: "compressed-video.webm", magic: "video" },
  "DOC-04": { mime: "application/pdf", format: "PDF", fileName: "converted-document.pdf", magic: "pdf" },
  "DOC-05": { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", format: "DOCX", fileName: "converted-document.docx", magic: "zip" },
  "IMG-12": { mime: "image/png", format: "PNG", fileName: "no-background.png", magic: "png" },
};

export const isServerToolId = (value: string): value is ServerToolId => value === "PDF-01" || value === "VID-01" || value === "DOC-04" || value === "DOC-05" || value === "IMG-12";

export const normalizeServerOptions = (toolId: ServerToolId, value: unknown): ServerJobOptions => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { preset: "balanced" };
  const preset = (value as { preset?: unknown }).preset;
  if (preset === "quality" || preset === "balanced" || preset === "smaller") return { preset };
  throw new Error(`Unsupported ${toolId} preset`);
};

export const getServerOutputName = (toolId: ServerToolId) => SERVER_TOOL_OUTPUTS[toolId].fileName;

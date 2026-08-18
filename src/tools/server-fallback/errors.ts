import type { ServerErrorCode } from "./types";

const errorMessages: Record<ServerErrorCode, string> = {
  INVALID_INPUT: "Choose one supported file and try again.",
  UNSUPPORTED_FORMAT: "This file format or stream layout is not supported by the compression profile.",
  CORRUPT_FILE: "The file could not be read safely. Try an uncorrupted copy.",
  ENCRYPTED_PDF_UNSUPPORTED: "Password-protected PDFs cannot be compressed by this tool.",
  RESOURCE_LIMIT: "This file is above the tested processing limits. Try a shorter, smaller, or lower-resolution file.",
  UPLOAD_FAILED: "The temporary upload could not finish. Check your connection and try again.",
  SERVER_UNAVAILABLE: "Temporary processing is unavailable right now. Your original file was not changed.",
  RATE_LIMITED: "Too many compression jobs were requested. Please wait a moment and try again.",
  NO_USEFUL_REDUCTION: "No useful size reduction was possible with this preset. The original file was kept.",
  OUTPUT_INVALID: "The compressed output did not pass validation. No download was created.",
  JOB_EXPIRED: "The temporary processing job expired. Start again to create a new result.",
  CANCELLED: "Processing was cancelled.",
  PROCESSING_FAILED: "The file could not be compressed safely. Try a different supported file.",
};

export class ServerFallbackError extends Error {
  readonly code: ServerErrorCode;
  readonly userMessage: string;

  constructor(code: ServerErrorCode, userMessage = errorMessages[code]) {
    super(userMessage);
    this.name = "ServerFallbackError";
    this.code = code;
    this.userMessage = userMessage;
  }
}

export const getServerErrorMessage = (error: unknown) => {
  if (error instanceof ServerFallbackError) return error.userMessage;
  if (error instanceof Error && error.name === "AbortError") return errorMessages.CANCELLED;
  return errorMessages.PROCESSING_FAILED;
};

export const getServerErrorCode = (value: unknown): ServerErrorCode => {
  if (typeof value === "string" && value in errorMessages) return value as ServerErrorCode;
  return "PROCESSING_FAILED";
};

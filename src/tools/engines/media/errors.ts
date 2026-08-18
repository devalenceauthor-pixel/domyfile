import { MediaProcessingError, type MediaErrorCode } from "./types";

export const asMediaProcessingError = (error: unknown, fallbackCode: MediaErrorCode = "PROCESSING_FAILED") => {
  if (error instanceof MediaProcessingError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new MediaProcessingError("CANCELLED", "Processing was cancelled.", error);
  }
  const name = error instanceof Error ? error.name : "";
  if (name === "QuotaExceededError" || name === "InvalidStateError") {
    return new MediaProcessingError("OUT_OF_MEMORY_RISK", "This media file is too large for the available browser memory.", error);
  }
  return new MediaProcessingError(fallbackCode, "The browser could not finish processing this media file.", error);
};

export const getMediaErrorMessage = (error: unknown) => asMediaProcessingError(error).userMessage;

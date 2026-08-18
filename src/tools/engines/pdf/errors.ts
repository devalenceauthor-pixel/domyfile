import { PdfProcessingError, type PdfErrorCode } from "./types";

export const asPdfProcessingError = (error: unknown, fallbackCode: PdfErrorCode = "PROCESSING_FAILED") => {
  if (error instanceof PdfProcessingError) return error;
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  if (name === "PasswordException" || name === "EncryptedPDFError" || /encrypted|password/i.test(message)) {
    return new PdfProcessingError("ENCRYPTED_PDF_UNSUPPORTED", "This PDF is password-protected or encrypted and cannot be processed here.", error);
  }
  if (name === "InvalidPDFException" || /invalid pdf|corrupt|failed to parse/i.test(message)) {
    return new PdfProcessingError("CORRUPT_FILE", "This PDF could not be read. Choose a valid, non-corrupt PDF and try again.", error);
  }
  if (name === "AbortException" || name === "RenderingCancelledException") {
    return new PdfProcessingError("CANCELLED", "Processing was cancelled.", error);
  }
  if (name === "QuotaExceededError" || name === "InvalidStateError" || /out of memory|memory/i.test(message)) {
    return new PdfProcessingError("OUT_OF_MEMORY_RISK", "This PDF is too large for the available browser memory.", error);
  }
  return new PdfProcessingError(fallbackCode, "The browser could not finish processing this PDF.", error);
};

export const getPdfErrorMessage = (error: unknown) => asPdfProcessingError(error).userMessage;

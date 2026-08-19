import { BackgroundRemovalError, type BackgroundRemovalEngine, type BackgroundRemovalProgress, type BackgroundRemovalResult } from "./types";

const getExtension = (name: string) => name.toLowerCase().split(".").pop() ?? "";

const getSafeBaseName = (fileName: string) => {
  const withoutExtension = fileName.replace(/\.[^/.]+$/, "");
  const safe = withoutExtension
    .replace(/[\\/]+/g, "-")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return safe || "image";
};

export const getBackgroundRemovalOutputName = (fileName: string) => `${getSafeBaseName(fileName)}-no-background.png`;

export type BackgroundRemovalInputMime = "image/jpeg" | "image/png" | "image/webp";

export const detectBackgroundRemovalMime = (bytes: Uint8Array): BackgroundRemovalInputMime | null => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index])) return "image/png";
  if (bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
};

const validateInput = async (file: File) => {
  if (!file || file.size <= 0) throw new BackgroundRemovalError("INVALID_INPUT", "Choose a non-empty JPG, PNG, or WebP image to continue.");
  if (!["jpg", "jpeg", "png", "webp"].includes(getExtension(file.name))) {
    throw new BackgroundRemovalError("UNSUPPORTED_FORMAT", "This route accepts JPG, PNG, and WebP images only.");
  }
  const mime = detectBackgroundRemovalMime(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!mime) throw new BackgroundRemovalError("CORRUPT_FILE", `“${file.name || "This file"}” is not a readable JPG, PNG, or WebP image.`);
  return mime;
};

const asBackgroundRemovalError = (error: unknown) => {
  if (error instanceof BackgroundRemovalError) return error;
  return new BackgroundRemovalError("PROCESSING_FAILED", "The background-removal job could not finish.", error);
};

/**
 * The quality-focused implementation runs through the server fallback (IMG-12).
 * This browser adapter intentionally keeps the input contract for shared workspace
 * validation, but never loads the former AGPL browser model as a hidden fallback.
 */
export class BrowserBackgroundRemovalEngine implements BackgroundRemovalEngine {
  async validate(file: File) {
    await validateInput(file);
  }

  async process(file: File, signal?: AbortSignal, onProgress?: BackgroundRemovalProgress): Promise<BackgroundRemovalResult> {
    void file;
    void signal;
    void onProgress;
    throw new BackgroundRemovalError(
      "MODEL_LOAD_FAILED",
      "This quality-focused background-removal route uses the temporary native processing path. Please retry the job.",
    );
  }

  dispose() {
    // No browser model is loaded. The production engine is owned by the isolated container.
  }
}

export const backgroundRemovalEngine = new BrowserBackgroundRemovalEngine();
export const getBackgroundRemovalErrorMessage = (error: unknown) => asBackgroundRemovalError(error).userMessage;

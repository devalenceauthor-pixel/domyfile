import {
  canvasQuality,
  getImageInputMimes,
  getOutputExtension,
  getOutputFileName,
  getOutputMime,
  getRenderPlan,
  isImageMime,
  needsBackgroundFill,
  normalizeImageOptions,
  parseHexColor,
} from "./options";
import { convertHeicToJpeg, isHeicFile } from "../../adapters/heic";
import type { ImageWorkerRequest, ImageWorkerResponse, ImageWorkerSuccess } from "./worker-protocol";
import {
  ImageProcessingError,
  type ImageEngine as ImageEngineContract,
  type ImageMime,
  type ImageOptions,
  type ImageProcessResult,
  type ImageRenderPlan,
  type ImageToolSlug,
  type ImageValidationResult,
  type NormalizedImageOptions,
} from "./types";

const asImageProcessingError = (error: unknown, fallbackCode: "PROCESSING_FAILED" | "BROWSER_UNSUPPORTED" = "PROCESSING_FAILED") => {
  if (error instanceof ImageProcessingError) return error;
  if (typeof DOMException !== "undefined" && error instanceof DOMException && ["QuotaExceededError", "InvalidStateError"].includes(error.name)) {
    return new ImageProcessingError("OUT_OF_MEMORY", "This image is too large for the available browser memory.", error);
  }
  return new ImageProcessingError(fallbackCode, "The browser could not finish processing this image.", error);
};

export const detectImageMimeFromSignature = (bytes: Uint8Array): ImageMime | null => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index])) return "image/png";
  if (bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
};

const readImageMime = async (file: Blob) => {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  return detectImageMimeFromSignature(header);
};

type ValidatedImageFile = {
  mime: ImageMime | "image/heic" | "image/heif";
};

const validateFile = async (file: File, tool: ImageToolSlug): Promise<ValidatedImageFile> => {
  if (!file || typeof file.arrayBuffer !== "function" || file.size <= 0) {
    throw new ImageProcessingError("INVALID_INPUT", "Choose a non-empty image file to continue.");
  }

  if (tool === "heic-to-jpg") {
    if (!(await isHeicFile(file))) {
      throw new ImageProcessingError("UNSUPPORTED_FORMAT", `“${file.name || "This file"}” is not a supported HEIC or HEIF image.`);
    }
    return { mime: "image/heic" };
  }

  const mime = await readImageMime(file);
  if (!mime) {
    throw new ImageProcessingError("CORRUPT_FILE", `“${file.name || "This file"}” is not a readable JPG, PNG, or WebP image.`);
  }
  if (!getImageInputMimes(tool).includes(mime)) {
    throw new ImageProcessingError("UNSUPPORTED_FORMAT", `${mime === "image/jpeg" ? "JPG" : mime === "image/png" ? "PNG" : "WebP"} files are not supported by this tool.`);
  }
  return { mime };
};

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new ImageProcessingError("CANCELLED", "Processing was cancelled.");
};

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

const decodeImage = async (file: File, signal?: AbortSignal): Promise<DecodedImage> => {
  throwIfAborted(signal);
  const decoder = globalThis.createImageBitmap;
  if (typeof decoder === "function") {
    try {
      let bitmap: ImageBitmap;
      try {
        bitmap = await decoder(file, { imageOrientation: "from-image" });
      } catch {
        bitmap = await decoder(file);
      }
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch (error) {
      throw asImageProcessingError(error);
    }
  }

  if (typeof Image === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new ImageProcessingError("BROWSER_UNSUPPORTED", "This browser does not provide a local image decoder.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    if (typeof image.decode === "function") {
      await image.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Image decode failed"));
      });
    }
    throwIfAborted(signal);
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => undefined };
  } catch (error) {
    throw asImageProcessingError(error);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

type CanvasTarget = OffscreenCanvas | HTMLCanvasElement;

const createCanvas = (width: number, height: number): CanvasTarget => {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new ImageProcessingError("BROWSER_UNSUPPORTED", "This browser does not provide a local image canvas.");
};

const canvasToBlob = async (canvas: CanvasTarget, mime: ImageMime, quality: number) => {
  if (typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: mime, quality: canvasQuality(mime, quality) });
  }
  const htmlCanvas = canvas as HTMLCanvasElement;
  return new Promise<Blob>((resolve, reject) => {
    htmlCanvas.toBlob((blob: Blob | null) => {
      if (blob) resolve(blob);
      else reject(new ImageProcessingError("PROCESSING_FAILED", "The browser could not encode the image result."));
    }, mime, canvasQuality(mime, quality));
  });
};

const renderOnMainThread = async (
  file: File,
  outputMime: ImageMime,
  options: NormalizedImageOptions,
  signal?: AbortSignal,
) => {
  const decoded = await decodeImage(file, signal);
  try {
    const plan = getRenderPlan(decoded.width, decoded.height, options);
    const canvas = createCanvas(plan.targetWidth, plan.targetHeight);
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new ImageProcessingError("BROWSER_UNSUPPORTED", "This browser could not create a 2D image canvas.");

    if (needsBackgroundFill(outputMime)) {
      const color = parseHexColor(options.backgroundColor);
      context.fillStyle = `rgba(${color.red}, ${color.green}, ${color.blue}, ${color.alpha})`;
      context.fillRect(0, 0, plan.targetWidth, plan.targetHeight);
    }
    context.drawImage(
      decoded.source,
      plan.sourceX,
      plan.sourceY,
      plan.sourceWidth,
      plan.sourceHeight,
      0,
      0,
      plan.targetWidth,
      plan.targetHeight,
    );
    throwIfAborted(signal);
    const blob = await canvasToBlob(canvas, outputMime, options.quality);
    return { blob, width: plan.targetWidth, height: plan.targetHeight };
  } catch (error) {
    throw asImageProcessingError(error);
  } finally {
    decoded.close();
  }
};

type PendingWorkerRequest = {
  resolve: (response: ImageWorkerSuccess) => void;
  reject: (error: ImageProcessingError) => void;
};

class ImageWorkerClient {
  private worker?: Worker;
  private requestId = 0;
  private pending = new Map<number, PendingWorkerRequest>();

  private ensureWorker() {
    if (this.worker) return this.worker;
    if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return undefined;
    try {
      const worker = new Worker(new URL("../../../workers/image.worker.ts", import.meta.url), { type: "module" });
      worker.addEventListener("message", (event: MessageEvent<ImageWorkerResponse>) => {
        const response = event.data;
        if (response.type === "success") {
          this.pending.get(response.id)?.resolve(response);
        } else {
          this.pending.get(response.id)?.reject(new ImageProcessingError(response.code, response.message));
        }
        this.pending.delete(response.id);
      });
      worker.addEventListener("error", () => {
        const error = new ImageProcessingError("PROCESSING_FAILED", "The image worker stopped unexpectedly.");
        this.pending.forEach(({ reject }) => reject(error));
        this.pending.clear();
        worker.terminate();
        if (this.worker === worker) this.worker = undefined;
      });
      this.worker = worker;
      return worker;
    } catch {
      return undefined;
    }
  }

  async render(file: File, inputMime: ImageMime, outputMime: ImageMime, options: NormalizedImageOptions, signal?: AbortSignal) {
    const worker = this.ensureWorker();
    if (!worker) throw new ImageProcessingError("BROWSER_UNSUPPORTED", "This browser does not provide a local image worker.");
    throwIfAborted(signal);

    const id = ++this.requestId;
    const buffer = await file.arrayBuffer();
    return new Promise<ImageWorkerSuccess>((resolve, reject) => {
      const rejectWith = (error: ImageProcessingError) => {
        signal?.removeEventListener("abort", onAbort);
        this.pending.delete(id);
        reject(error);
      };
      const onAbort = () => {
        worker.postMessage({ type: "cancel", id } satisfies ImageWorkerRequest);
        worker.terminate();
        if (this.worker === worker) this.worker = undefined;
        rejectWith(new ImageProcessingError("CANCELLED", "Processing was cancelled."));
      };
      this.pending.set(id, {
        resolve: (response) => {
          signal?.removeEventListener("abort", onAbort);
          resolve(response);
        },
        reject: rejectWith,
      });
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        worker.postMessage({
          type: "render",
          id,
          buffer,
          inputMime,
          outputMime,
          tool: options.tool,
          scale: options.scale,
          cropRatio: options.cropRatio,
          plan: options.cropPlan,
          quality: options.quality,
          backgroundColor: options.backgroundColor,
        } satisfies ImageWorkerRequest, [buffer]);
      } catch (error) {
        rejectWith(asImageProcessingError(error, "BROWSER_UNSUPPORTED"));
      }
    });
  }

  dispose() {
    this.worker?.terminate();
    this.worker = undefined;
    this.pending.forEach(({ reject }) => reject(new ImageProcessingError("CANCELLED", "Processing was cancelled.")));
    this.pending.clear();
  }
}

const validateOutputBlob = async (blob: Blob, expectedMime: ImageMime) => {
  if (!blob.size) throw new ImageProcessingError("PROCESSING_FAILED", "The browser returned an empty image result.");
  if (blob.type && blob.type.toLowerCase() !== expectedMime) {
    throw new ImageProcessingError("UNSUPPORTED_FORMAT", `This browser could not encode a valid ${getOutputExtension(expectedMime).toUpperCase()} file.`);
  }
  const actualMime = await readImageMime(blob);
  if (actualMime !== expectedMime) {
    throw new ImageProcessingError("UNSUPPORTED_FORMAT", `This browser could not encode a valid ${getOutputExtension(expectedMime).toUpperCase()} file.`);
  }
};

export const getImageErrorMessage = (error: unknown) => asImageProcessingError(error).userMessage;

export class BrowserImageEngine implements ImageEngineContract {
  private readonly workerClient = new ImageWorkerClient();

  async validate(files: File[], options: { tool: ImageToolSlug }): Promise<ImageValidationResult> {
    const issues: ImageValidationResult["issues"] = [];
    for (const file of files) {
      try {
        await validateFile(file, options.tool);
      } catch (error) {
        const typedError = asImageProcessingError(error);
        issues.push({ file, code: typedError.code, message: typedError.userMessage });
      }
    }
    return { valid: issues.length === 0, issues };
  }

  async process(files: File[], options: ImageOptions & { tool: ImageToolSlug }, signal?: AbortSignal): Promise<ImageProcessResult> {
    const result: ImageProcessResult = { items: [], failures: [] };
    const normalized = normalizeImageOptions(options.tool, options);

    for (const file of files) {
      throwIfAborted(signal);
      try {
        const validation = await validateFile(file, options.tool);
        if (options.tool === "heic-to-jpg") {
          const rendered = await convertHeicToJpeg(file, normalized.quality, signal);
          await validateOutputBlob(rendered.blob, "image/jpeg");
          const outputName = getOutputFileName(file.name, options.tool, "image/jpeg");
          const output = new File([rendered.blob], outputName, { type: "image/jpeg", lastModified: Date.now() });
          result.items.push({
            input: file,
            output,
            mime: "image/jpeg",
            width: rendered.width,
            height: rendered.height,
            inputBytes: file.size,
            outputBytes: output.size,
          });
          continue;
        }
        const outputMime = getOutputMime(options.tool, validation.mime, normalized);
        let rendered: { blob: Blob; width: number; height: number };

        try {
          const workerResult = await this.workerClient.render(file, validation.mime as ImageMime, outputMime, normalized, signal);
          const blob = new Blob([workerResult.buffer], { type: workerResult.mime });
          rendered = { blob, width: workerResult.width, height: workerResult.height };
        } catch (error) {
          const typedError = asImageProcessingError(error);
          if (typedError.code === "CANCELLED" || typedError.code === "OUT_OF_MEMORY" || typedError.code === "UNSUPPORTED_FORMAT") throw typedError;
          rendered = await renderOnMainThread(file, outputMime, normalized, signal);
        }

        await validateOutputBlob(rendered.blob, outputMime);
        const outputName = getOutputFileName(file.name, options.tool, outputMime);
        const output = new File([rendered.blob], outputName, { type: outputMime, lastModified: Date.now() });
        result.items.push({
          input: file,
          output,
          mime: outputMime,
          width: rendered.width,
          height: rendered.height,
          inputBytes: file.size,
          outputBytes: output.size,
        });
      } catch (error) {
        const typedError = asImageProcessingError(error);
        if (typedError.code === "CANCELLED") throw typedError;
        result.failures.push({ input: file, error: typedError });
      }
    }

    return result;
  }

  dispose() {
    this.workerClient.dispose();
  }
}

export const imageEngine = new BrowserImageEngine();

export const isImplementedImageTool = (slug: string): slug is ImageToolSlug => [
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
].includes(slug as ImageToolSlug);

export const isSupportedImageMime = (value: string): value is ImageMime => isImageMime(value);

export const getImageRenderPlan = (width: number, height: number, options: NormalizedImageOptions): ImageRenderPlan => getRenderPlan(width, height, options);

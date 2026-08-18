import * as pdfjsLib from "pdfjs-dist/build/pdf.min.mjs";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { runPdfOperation, type PdfOperationInput, type PdfOperationOutput } from "./pdf-operations";
import { asPdfProcessingError, getPdfErrorMessage } from "./errors";
import {
  getPdfOutputName,
  isPdfSignature,
  parsePageGroups,
} from "./options";
import type { PdfWorkerMessage, PdfWorkerResponse, PdfWorkerSuccess } from "./worker-protocol";
import {
  PdfProcessingError,
  type PdfEngine as PdfEngineContract,
  type PdfMime,
  type PdfOptions,
  type PdfProcessResult,
  type PdfProcessItem,
  type PdfToolSlug,
  isImageToPdfTool,
  type ImageToPdfToolSlug,
  type PdfValidationResult,
} from "./types";

let pdfWorkerConfigured = false;

const configurePdfWorker = () => {
  if (pdfWorkerConfigured) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  pdfWorkerConfigured = true;
};

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new PdfProcessingError("CANCELLED", "Processing was cancelled.");
};

const readBytes = async (file: Blob) => new Uint8Array(await file.arrayBuffer());

const toArrayBuffer = (bytes: Uint8Array) => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
};

const detectImageMime = (bytes: Uint8Array): Exclude<PdfMime, "application/pdf"> | "image/png" | "image/webp" | null => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index])) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
};

const ensurePdfInput = async (file: File) => {
  if (!file || file.size <= 0) throw new PdfProcessingError("INVALID_INPUT", "Choose a non-empty PDF file to continue.");
  const bytes = await readBytes(file);
  if (!isPdfSignature(bytes)) throw new PdfProcessingError("CORRUPT_FILE", `“${file.name || "This file"}” is not a readable PDF.`);
  return bytes;
};

const ensureImageInput = async (file: File) => {
  if (!file || file.size <= 0) throw new PdfProcessingError("INVALID_INPUT", "Choose a non-empty image file to continue.");
  const bytes = await readBytes(file);
  const mime = detectImageMime(bytes);
  if (!mime) throw new PdfProcessingError("CORRUPT_FILE", `“${file.name || "This file"}” is not a readable JPG, PNG, or WebP image.`);
  return { bytes, mime };
};

type LoadedPdf = {
  document: PDFDocumentProxy;
  loadingTask: PDFDocumentLoadingTask;
};

const loadPdf = async (file: File, signal?: AbortSignal): Promise<LoadedPdf> => {
  configurePdfWorker();
  const bytes = await ensurePdfInput(file);
  throwIfAborted(signal);
  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: typeof OffscreenCanvas !== "undefined",
  });
  const abort = () => void loadingTask.destroy();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const document = await loadingTask.promise;
    throwIfAborted(signal);
    return { document, loadingTask };
  } catch (error) {
    await loadingTask.destroy().catch(() => undefined);
    throw asPdfProcessingError(error);
  } finally {
    signal?.removeEventListener("abort", abort);
  }
};

const destroyPdf = async ({ document, loadingTask }: LoadedPdf) => {
  await document.cleanup().catch(() => undefined);
  await loadingTask.destroy().catch(() => undefined);
};

const createCanvas = (width: number, height: number) => {
  if (typeof document === "undefined") throw new PdfProcessingError("ENGINE_LOAD_FAILED", "This browser cannot create a local PDF preview canvas.");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new PdfProcessingError("PROCESSING_FAILED", "The browser could not encode the rendered PDF page."));
  }, type, quality);
});

export type PdfThumbnail = {
  pageNumber: number;
  width: number;
  height: number;
  blob: Blob;
};

/**
 * Render small local page images for workspace previews. This deliberately
 * reuses the same PDF.js loader, signature validation, worker, and cleanup
 * path as PDF processing; it does not create a second PDF engine.
 */
export const renderPdfThumbnails = async (file: File, pageNumbers: number[], maxWidth = 160, signal?: AbortSignal) => {
  const loaded = await loadPdf(file, signal);
  const thumbnails: PdfThumbnail[] = [];
  const uniquePageNumbers = [...new Set(pageNumbers)].filter((pageNumber) => pageNumber >= 1 && pageNumber <= loaded.document.numPages);
  try {
    for (const pageNumber of uniquePageNumbers) {
      throwIfAborted(signal);
      const page = await loaded.document.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(1, maxWidth / Math.max(baseViewport.width, 1));
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new PdfProcessingError("ENGINE_LOAD_FAILED", "This browser cannot render a PDF page preview locally.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const renderTask = page.render({ canvas: canvas as HTMLCanvasElement, canvasContext: context, viewport, background: "#ffffff" });
      const abort = () => renderTask.cancel();
      signal?.addEventListener("abort", abort, { once: true });
      try {
        await renderTask.promise;
      } catch (error) {
        throw asPdfProcessingError(error);
      } finally {
        signal?.removeEventListener("abort", abort);
        page.cleanup();
      }
      const blob = await canvasToBlob(canvas, "image/jpeg", 0.82);
      await validateJpeg(blob);
      thumbnails.push({ pageNumber, width: canvas.width, height: canvas.height, blob });
      canvas.width = 0;
      canvas.height = 0;
    }
    return { pageCount: loaded.document.numPages, thumbnails };
  } finally {
    await destroyPdf(loaded);
  }
};

const validateJpeg = async (blob: Blob) => {
  if (!blob.size || (blob.type && blob.type !== "image/jpeg")) throw new PdfProcessingError("PROCESSING_FAILED", "The browser did not produce a valid JPG page.");
  const bytes = new Uint8Array(await blob.slice(0, 3).arrayBuffer());
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new PdfProcessingError("PROCESSING_FAILED", "The browser did not produce a valid JPG page.");
};

const validatePdfOutput = async (file: File, expectedPageCount?: number, signal?: AbortSignal) => {
  const bytes = await ensurePdfInput(file);
  const loaded = await loadPdf(new File([bytes], file.name, { type: "application/pdf" }), signal);
  try {
    if (expectedPageCount !== undefined && loaded.document.numPages !== expectedPageCount) {
      throw new PdfProcessingError("PROCESSING_FAILED", "The generated PDF did not contain the expected number of pages.");
    }
  } finally {
    await destroyPdf(loaded);
  }
};

type PendingWorkerRequest = {
  resolve: (response: PdfWorkerSuccess) => void;
  reject: (error: PdfProcessingError) => void;
};

class PdfWorkerClient {
  private worker?: Worker;
  private requestId = 0;
  private pending = new Map<number, PendingWorkerRequest>();

  private ensureWorker() {
    if (this.worker) return this.worker;
    if (typeof Worker === "undefined") return undefined;
    try {
      const worker = new Worker(new URL("../../../workers/pdf.worker.ts", import.meta.url), { type: "module" });
      worker.addEventListener("message", (event: MessageEvent<PdfWorkerResponse>) => {
        const response = event.data;
        if (response.type === "success") this.pending.get(response.id)?.resolve(response);
        else this.pending.get(response.id)?.reject(new PdfProcessingError(response.code, response.message));
        this.pending.delete(response.id);
      });
      worker.addEventListener("error", () => {
        const error = new PdfProcessingError("ENGINE_LOAD_FAILED", "The PDF worker stopped unexpectedly.");
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

  async process(tool: PdfToolSlug, inputs: PdfOperationInput[], options: PdfOptions, watermarkImage: PdfOperationInput | undefined, signal?: AbortSignal) {
    const worker = this.ensureWorker();
    if (!worker) throw new PdfProcessingError("ENGINE_LOAD_FAILED", "This browser does not provide a local PDF worker.");
    throwIfAborted(signal);
    const id = ++this.requestId;
    const inputPayload = inputs.map((input) => ({ name: input.name, mime: input.mime, buffer: toArrayBuffer(input.bytes) }));
    const watermarkPayload = watermarkImage ? { name: watermarkImage.name, mime: watermarkImage.mime, buffer: toArrayBuffer(watermarkImage.bytes) } : undefined;
    const transferables = [...inputPayload.map((input) => input.buffer), ...(watermarkPayload ? [watermarkPayload.buffer] : [])];
    return new Promise<PdfWorkerSuccess>((resolve, reject) => {
      const onAbort = () => {
        worker.postMessage({ type: "cancel", id } satisfies PdfWorkerMessage);
        worker.terminate();
        if (this.worker === worker) this.worker = undefined;
        rejectWith(new PdfProcessingError("CANCELLED", "Processing was cancelled."));
      };
      const rejectWith = (error: PdfProcessingError) => {
        signal?.removeEventListener("abort", onAbort);
        this.pending.delete(id);
        reject(error);
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
        worker.postMessage({ type: "process", id, tool, inputs: inputPayload, options, watermarkImage: watermarkPayload } satisfies PdfWorkerMessage, transferables);
      } catch (error) {
        rejectWith(asPdfProcessingError(error, "ENGINE_LOAD_FAILED"));
      }
    });
  }

  dispose() {
    this.worker?.terminate();
    this.worker = undefined;
    this.pending.forEach(({ reject }) => reject(new PdfProcessingError("CANCELLED", "Processing was cancelled.")));
    this.pending.clear();
  }
}

const convertWebpToPng = async (file: File, bytes: Uint8Array, signal?: AbortSignal) => {
  throwIfAborted(signal);
  if (typeof createImageBitmap !== "function") throw new PdfProcessingError("ENGINE_LOAD_FAILED", "This browser cannot decode WebP images locally.");
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(new Blob([toArrayBuffer(bytes)], { type: "image/webp" }), { imageOrientation: "from-image" });
    const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(bitmap.width, bitmap.height) : createCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) throw new PdfProcessingError("ENGINE_LOAD_FAILED", "This browser cannot convert the selected WebP image.");
    context.drawImage(bitmap, 0, 0);
    const isOffscreenCanvas = typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas;
    const blob = isOffscreenCanvas
      ? await canvas.convertToBlob({ type: "image/png" })
      : await canvasToBlob(canvas as HTMLCanvasElement, "image/png", 1);
    return { name: file.name, mime: "image/png", bytes: new Uint8Array(await blob.arrayBuffer()) } satisfies PdfOperationInput;
  } catch (error) {
    throw asPdfProcessingError(error);
  } finally {
    bitmap?.close();
  }
};

const prepareImageInput = async (file: File, signal?: AbortSignal): Promise<PdfOperationInput> => {
  const { bytes, mime } = await ensureImageInput(file);
  if (mime === "image/webp") return convertWebpToPng(file, bytes, signal);
  return { name: file.name, mime, bytes };
};

const toWorkerInput = (file: File, bytes: Uint8Array, mime: string): PdfOperationInput => ({ name: file.name, mime, bytes });

const pdfToolInputs = async (files: File[], signal?: AbortSignal) => {
  throwIfAborted(signal);
  return Promise.all(files.map(async (file) => toWorkerInput(file, await ensurePdfInput(file), "application/pdf")));
};

const imagePdfInputMimes: Record<ImageToPdfToolSlug, Set<string>> = {
  "jpg-to-pdf": new Set(["image/jpeg"]),
  "png-to-pdf": new Set(["image/png"]),
  "webp-to-pdf": new Set(["image/webp"]),
};

const imagePdfInputLabels: Record<ImageToPdfToolSlug, string> = {
  "jpg-to-pdf": "JPG",
  "png-to-pdf": "PNG",
  "webp-to-pdf": "WebP",
};

export class BrowserPdfEngine implements PdfEngineContract {
  private readonly workerClient = new PdfWorkerClient();

  async inspect(file: File, signal?: AbortSignal) {
    const loaded = await loadPdf(file, signal);
    try {
      return { pageCount: loaded.document.numPages };
    } finally {
      await destroyPdf(loaded);
    }
  }

  async validate(files: File[], options: { tool: PdfToolSlug }): Promise<PdfValidationResult> {
    const issues: PdfValidationResult["issues"] = [];
    for (const file of files) {
      try {
        if (isImageToPdfTool(options.tool)) {
          const { mime } = await ensureImageInput(file);
          if (!imagePdfInputMimes[options.tool].has(mime)) {
            throw new PdfProcessingError("UNSUPPORTED_FORMAT", `${imagePdfInputLabels[options.tool]} to PDF accepts ${imagePdfInputLabels[options.tool]} images only.`);
          }
        } else {
          await this.inspect(file);
        }
      } catch (error) {
        const typedError = asPdfProcessingError(error);
        issues.push({ file, code: typedError.code, message: typedError.userMessage });
      }
    }
    return { valid: issues.length === 0, issues };
  }

  private async renderPdfPages(file: File, options: PdfOptions, signal?: AbortSignal): Promise<PdfProcessItem[]> {
    const loaded = await loadPdf(file, signal);
    const quality = Math.min(Math.max(Number(options.jpgQuality ?? 88), 45), 100) / 100;
    const scale = Math.min(Math.max(Number(options.jpgScale ?? 1.5), 0.5), 3);
    const pageNumbers = parsePageGroups(options.pageSelection, loaded.document.numPages).flat();
    const items: PdfProcessItem[] = [];
    try {
      for (const pageNumber of pageNumbers) {
        throwIfAborted(signal);
        const page = await loaded.document.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new PdfProcessingError("ENGINE_LOAD_FAILED", "This browser cannot render a PDF page locally.");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        const renderTask = page.render({ canvas: canvas as HTMLCanvasElement, canvasContext: context, viewport, background: "#ffffff" });
        const abort = () => renderTask.cancel();
        signal?.addEventListener("abort", abort, { once: true });
        try {
          await renderTask.promise;
        } catch (error) {
          throw asPdfProcessingError(error);
        } finally {
          signal?.removeEventListener("abort", abort);
          page.cleanup();
        }
        const blob = await canvasToBlob(canvas, "image/jpeg", quality);
        await validateJpeg(blob);
        const outputName = getPdfOutputName(file.name, "pdf-to-jpg", pageNumber - 1, pageNumber);
        const output = new File([blob], outputName, { type: "image/jpeg", lastModified: Date.now() });
        items.push({ input: file, output, mime: "image/jpeg", pageCount: loaded.document.numPages, pageNumber, inputBytes: file.size, outputBytes: output.size });
        canvas.width = 0;
        canvas.height = 0;
      }
      return items;
    } finally {
      await destroyPdf(loaded);
    }
  }

  private async processStructural(tool: PdfToolSlug, files: File[], options: PdfOptions, signal?: AbortSignal) {
    const inputs = isImageToPdfTool(tool) ? await Promise.all(files.map((file) => prepareImageInput(file, signal))) : await pdfToolInputs(files, signal);
    let watermarkImage: PdfOperationInput | undefined;
    if (tool === "watermark-pdf" && options.watermarkMode === "image" && options.watermarkImage) watermarkImage = await prepareImageInput(options.watermarkImage, signal);
    let response: { outputs: PdfOperationOutput[] };
    try {
      const workerResponse = await this.workerClient.process(tool, inputs, options, watermarkImage, signal);
      response = { outputs: workerResponse.outputs.map((output) => ({ bytes: new Uint8Array(output.buffer), pageCount: output.pageCount, pageNumber: output.pageNumber })) };
    } catch (error) {
      const typedError = asPdfProcessingError(error);
      if (["CANCELLED", "OUT_OF_MEMORY_RISK", "ENCRYPTED_PDF_UNSUPPORTED", "CORRUPT_FILE"].includes(typedError.code)) throw typedError;
      response = { outputs: await runPdfOperation(tool, inputs, options, watermarkImage) };
    }
    return { inputs, outputs: response.outputs };
  }

  async process(files: File[], options: PdfOptions & { tool: PdfToolSlug }, signal?: AbortSignal): Promise<PdfProcessResult> {
    const result: PdfProcessResult = { items: [], failures: [] };
    throwIfAborted(signal);
    if (!files.length) throw new PdfProcessingError("INVALID_INPUT", "Choose a supported file to continue.");
    if (options.tool === "merge-pdf" && files.length < 2) {
      return {
        items: [],
        failures: [{ input: files[0], error: new PdfProcessingError("INVALID_INPUT", "Choose at least two PDF files to merge.") }],
      };
    }
    const validation = await this.validate(files, options);
    const validFiles = files.filter((file) => !validation.issues.some((issue) => issue.file === file));
    const invalidIssues = validation.issues;
    if (invalidIssues.length && !isImageToPdfTool(options.tool)) {
      return { items: [], failures: invalidIssues.map((issue) => ({ input: issue.file, error: new PdfProcessingError(issue.code, issue.message) })) };
    }
    if (!validFiles.length) return { items: [], failures: invalidIssues.map((issue) => ({ input: issue.file, error: new PdfProcessingError(issue.code, issue.message) })) };

    try {
      if (options.tool === "watermark-pdf") {
        if (options.watermarkMode === "image" && !options.watermarkImage) {
          throw new PdfProcessingError("INVALID_INPUT", "Choose a JPG, PNG, or WebP image for the watermark.");
        }
        if (options.watermarkMode !== "image" && !options.watermarkText?.trim()) {
          throw new PdfProcessingError("INVALID_INPUT", "Enter watermark text before processing the PDF.");
        }
      }
      if (options.tool === "pdf-to-jpg") {
        result.items = await this.renderPdfPages(validFiles[0], options, signal);
      } else {
        const structural = await this.processStructural(options.tool, validFiles, options, signal);
        const sourceFile = validFiles[0];
        result.items = await Promise.all(structural.outputs.map(async (output, index) => {
          const outputFile = new File([toArrayBuffer(output.bytes)], getPdfOutputName(sourceFile.name, options.tool, index), { type: "application/pdf", lastModified: Date.now() });
          await validatePdfOutput(outputFile, output.pageCount, signal);
          const inputBytes = validFiles.reduce((total, file) => total + file.size, 0);
          return { input: sourceFile, output: outputFile, mime: "application/pdf", pageCount: output.pageCount, inputBytes, outputBytes: outputFile.size } satisfies PdfProcessItem;
        }));
      }
    } catch (error) {
      const typedError = asPdfProcessingError(error);
      if (typedError.code === "CANCELLED") throw typedError;
      result.failures.push({ input: validFiles[0], error: typedError });
    }
    result.failures.push(...invalidIssues.map((issue) => ({ input: issue.file, error: new PdfProcessingError(issue.code, issue.message) })));
    return result;
  }

  dispose() {
    this.workerClient.dispose();
  }
}

export const pdfEngine = new BrowserPdfEngine();

export const isImplementedPdfTool = (slug: string): slug is PdfToolSlug => [
  "merge-pdf",
  "split-pdf",
  "organize-pdf",
  "rotate-pdf",
  "jpg-to-pdf",
  "png-to-pdf",
  "webp-to-pdf",
  "pdf-to-jpg",
  "watermark-pdf",
].includes(slug as PdfToolSlug);

export { getPdfErrorMessage };

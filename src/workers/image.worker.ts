import {
  canvasQuality,
  getRenderPlan,
  normalizeImageOptions,
  parseHexColor,
  needsBackgroundFill,
} from "../tools/engines/image/options";
import type { ImageWorkerRequest, ImageWorkerResponse, ImageWorkerRenderRequest } from "../tools/engines/image/worker-protocol";

const workerScope = globalThis as unknown as {
  addEventListener: (type: string, listener: (event: MessageEvent<ImageWorkerRequest>) => void) => void;
  postMessage: (message: ImageWorkerResponse, transfer?: Transferable[]) => void;
};

const cancelled = new Set<number>();

const sendError = (request: ImageWorkerRenderRequest, code: "BROWSER_UNSUPPORTED" | "UNSUPPORTED_FORMAT" | "PROCESSING_FAILED" | "OUT_OF_MEMORY", message: string) => {
  workerScope.postMessage({ type: "error", id: request.id, code, message });
};

const renderImage = async (request: ImageWorkerRenderRequest) => {
  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap !== "function") {
    sendError(request, "BROWSER_UNSUPPORTED", "This browser does not provide the image worker APIs required for local processing.");
    return;
  }

  let bitmap: ImageBitmap | undefined;
  try {
    const source = new Blob([request.buffer], { type: request.inputMime });
    try {
      bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
    } catch {
      bitmap = await createImageBitmap(source);
    }

    if (cancelled.has(request.id)) return;

    const options = normalizeImageOptions(request.tool, {
      quality: request.quality,
      scale: request.scale,
      cropRatio: request.cropRatio,
    });
    const plan = request.plan ?? getRenderPlan(bitmap.width, bitmap.height, options);
    const canvas = new OffscreenCanvas(plan.targetWidth, plan.targetHeight);
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      sendError(request, "BROWSER_UNSUPPORTED", "This browser could not create a 2D image canvas.");
      return;
    }

    if (needsBackgroundFill(request.outputMime)) {
      const color = parseHexColor(request.backgroundColor);
      context.fillStyle = `rgba(${color.red}, ${color.green}, ${color.blue}, ${color.alpha})`;
      context.fillRect(0, 0, plan.targetWidth, plan.targetHeight);
    }

    context.drawImage(
      bitmap,
      plan.sourceX,
      plan.sourceY,
      plan.sourceWidth,
      plan.sourceHeight,
      0,
      0,
      plan.targetWidth,
      plan.targetHeight,
    );

    if (cancelled.has(request.id)) return;

    const blob = await canvas.convertToBlob({ type: request.outputMime, quality: canvasQuality(request.outputMime, options.quality) });
    if (!blob.size) {
      sendError(request, "PROCESSING_FAILED", "The browser returned an empty image result.");
      return;
    }
    if (blob.type && blob.type.toLowerCase() !== request.outputMime) {
      sendError(request, "UNSUPPORTED_FORMAT", `This browser could not encode a valid ${request.outputMime} file.`);
      return;
    }
    const buffer = await blob.arrayBuffer();
    workerScope.postMessage({
      type: "success",
      id: request.id,
      buffer,
      mime: request.outputMime,
      width: plan.targetWidth,
      height: plan.targetHeight,
    }, [buffer]);
  } catch (error) {
    const isMemoryError = error instanceof DOMException && ["QuotaExceededError", "InvalidStateError"].includes(error.name);
    sendError(
      request,
      isMemoryError ? "OUT_OF_MEMORY" : "PROCESSING_FAILED",
      isMemoryError ? "This image is too large for the available browser memory." : "The browser could not decode or render this image.",
    );
  } finally {
    bitmap?.close();
    cancelled.delete(request.id);
  }
};

workerScope.addEventListener("message", (event) => {
  const request = event.data;
  if (request.type === "cancel") {
    cancelled.add(request.id);
    return;
  }
  void renderImage(request);
});

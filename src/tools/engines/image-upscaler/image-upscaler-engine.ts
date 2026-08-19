import {
  ImageUpscalerError,
  type ImageUpscalerEngine,
  type ImageUpscalerOptions,
  type ImageUpscalerResult,
} from "./types";

const MODEL_TILE_SIZE = 224;
const MODEL_SCALE = 3;
const TILE_OVERLAP = 16;
const TILE_CORE = MODEL_TILE_SIZE - TILE_OVERLAP * 2;
const MAX_INPUT_PIXELS = 2_000_000;
const MAX_OUTPUT_PIXELS = MAX_INPUT_PIXELS * MODEL_SCALE * MODEL_SCALE;
const MODEL_PATH = "/models/super-resolution-10.onnx";

type OrtModule = typeof import("onnxruntime-web");
type OrtSession = Awaited<ReturnType<OrtModule["InferenceSession"]["create"]>>;

let runtimePromise: Promise<OrtModule> | undefined;
let sessionPromise: Promise<OrtSession> | undefined;
let activeSession: OrtSession | undefined;

const getExtension = (name: string) => name.toLowerCase().split(".").pop() ?? "";

const getSafeBaseName = (fileName: string) => {
  const base = fileName.replace(/\.[^/.]+$/, "").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/-{2,}/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  return base || "image";
};

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new ImageUpscalerError("CANCELLED", "Processing was cancelled.");
};

const detectMime = (bytes: Uint8Array, extension: string) => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index])) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (["jpg", "jpeg", "png", "webp"].includes(extension)) return undefined;
  return null;
};

const loadBitmap = async (file: File, signal?: AbortSignal) => {
  throwIfAborted(signal);
  if (typeof createImageBitmap === "function") return { bitmap: await createImageBitmap(file), objectUrl: undefined };
  if (typeof Image === "undefined" || typeof URL?.createObjectURL !== "function") throw new ImageUpscalerError("BROWSER_UNSUPPORTED", "This browser cannot decode images locally for super-resolution.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new ImageUpscalerError("CORRUPT_FILE", "The selected image could not be decoded."));
      element.src = objectUrl;
    });
    return { bitmap: image, objectUrl };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
};

const closeBitmap = (bitmap: ImageBitmap | HTMLImageElement | undefined, objectUrl?: string) => {
  if (bitmap && "close" in bitmap) bitmap.close();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
};

const createCanvas = (width: number, height: number): OffscreenCanvas | HTMLCanvasElement => {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new ImageUpscalerError("BROWSER_UNSUPPORTED", "This browser cannot create a local image canvas.");
};

const get2dContext = (canvas: OffscreenCanvas | HTMLCanvasElement) => {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || !("drawImage" in context) || !("getImageData" in context)) throw new ImageUpscalerError("BROWSER_UNSUPPORTED", "This browser cannot create a local image canvas.");
  return context as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
};

const canvasToBlob = async (canvas: OffscreenCanvas | HTMLCanvasElement) => {
  if (typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas) return canvas.convertToBlob({ type: "image/png" });
  return new Promise<Blob>((resolve, reject) => (canvas as HTMLCanvasElement).toBlob((blob) => blob ? resolve(blob) : reject(new ImageUpscalerError("PROCESSING_FAILED", "The browser could not encode the super-resolution result.")), "image/png"));
};

const getTileStarts = (length: number) => {
  const starts: number[] = [];
  let start = 0;
  while (true) {
    starts.push(start);
    if (start + MODEL_TILE_SIZE >= length) break;
    let next = start + TILE_CORE;
    if (next + MODEL_TILE_SIZE > length) next = length - MODEL_TILE_SIZE;
    if (next <= start) break;
    start = next;
  }
  return starts;
};

const loadRuntime = () => runtimePromise ??= import("onnxruntime-web").then((runtime) => {
  runtime.env.wasm.numThreads = 1;
  runtime.env.wasm.proxy = false;
  return runtime;
});

const loadSession = async () => {
  if (activeSession) return activeSession;
  sessionPromise ??= loadRuntime().then(async (runtime) => {
    const providers = typeof navigator !== "undefined" && "gpu" in navigator ? ["webgpu", "wasm"] : ["wasm"];
    const session = await runtime.InferenceSession.create(MODEL_PATH, {
      executionProviders: providers,
      graphOptimizationLevel: "all",
      executionMode: "sequential",
    });
    activeSession = session;
    return session;
  }).catch((error) => {
    sessionPromise = undefined;
    throw new ImageUpscalerError("MODEL_LOAD_FAILED", "The super-resolution model could not load. Check the connection and try again.", error);
  });
  return sessionPromise;
};

const runYTile = async (runtime: OrtModule, session: OrtSession, source: ImageData, tileX: number, tileY: number, signal?: AbortSignal) => {
  const input = new Float32Array(MODEL_TILE_SIZE * MODEL_TILE_SIZE);
  for (let y = 0; y < MODEL_TILE_SIZE; y += 1) {
    const sourceY = Math.min(source.height - 1, tileY + y);
    for (let x = 0; x < MODEL_TILE_SIZE; x += 1) {
      const sourceX = Math.min(source.width - 1, tileX + x);
      const index = (sourceY * source.width + sourceX) * 4;
      input[y * MODEL_TILE_SIZE + x] = (0.299 * source.data[index] + 0.587 * source.data[index + 1] + 0.114 * source.data[index + 2]) / 255;
    }
  }
  const tensor = new runtime.Tensor("float32", input, [1, 1, MODEL_TILE_SIZE, MODEL_TILE_SIZE]);
  try {
    throwIfAborted(signal);
    const result = await session.run({ input: tensor });
    const output = result[session.outputNames[0]];
    if (!output) throw new ImageUpscalerError("PROCESSING_FAILED", "The super-resolution model returned no image output.");
    try {
      const outputData = await output.getData(true) as Float32Array;
      const outputDims = output.dims;
      if (outputDims.length !== 4 || outputDims[0] !== 1 || outputDims[1] !== 1 || outputDims[2] !== MODEL_TILE_SIZE * MODEL_SCALE || outputDims[3] !== MODEL_TILE_SIZE * MODEL_SCALE) {
        throw new ImageUpscalerError("PROCESSING_FAILED", "The super-resolution model returned an unsupported shape.");
      }
      return outputData;
    } finally {
      output.dispose();
    }
  } finally {
    tensor.dispose();
  }
};

const writeEnhancedY = (target: Float32Array, weights: Float32Array, tile: Float32Array, sourceWidth: number, sourceHeight: number, tileX: number, tileY: number) => {
  const outputWidth = sourceWidth * MODEL_SCALE;
  const outputHeight = sourceHeight * MODEL_SCALE;
  const cropLeft = tileX === 0 ? 0 : TILE_OVERLAP * MODEL_SCALE;
  const cropTop = tileY === 0 ? 0 : TILE_OVERLAP * MODEL_SCALE;
  const cropRight = tileX + MODEL_TILE_SIZE >= sourceWidth ? MODEL_TILE_SIZE * MODEL_SCALE : (MODEL_TILE_SIZE - TILE_OVERLAP) * MODEL_SCALE;
  const cropBottom = tileY + MODEL_TILE_SIZE >= sourceHeight ? MODEL_TILE_SIZE * MODEL_SCALE : (MODEL_TILE_SIZE - TILE_OVERLAP) * MODEL_SCALE;
  for (let y = cropTop; y < cropBottom; y += 1) {
    const outputY = tileY * MODEL_SCALE + y;
    if (outputY >= outputHeight) continue;
    for (let x = cropLeft; x < cropRight; x += 1) {
      const outputX = tileX * MODEL_SCALE + x;
      if (outputX >= outputWidth) continue;
      const destination = outputY * outputWidth + outputX;
      const value = tile[y * MODEL_TILE_SIZE * MODEL_SCALE + x];
      target[destination] += Math.max(0, Math.min(1, value));
      weights[destination] += 1;
    }
  }
};

const combineChannels = (resized: ImageData, enhancedY: Float32Array, weights: Float32Array) => {
  const output = new Uint8ClampedArray(resized.data);
  for (let index = 0; index < enhancedY.length; index += 1) {
    const offset = index * 4;
    const y = (weights[index] ? enhancedY[index] / weights[index] : 0.5) * 255;
    const red = resized.data[offset];
    const green = resized.data[offset + 1];
    const blue = resized.data[offset + 2];
    const originalY = 0.299 * red + 0.587 * green + 0.114 * blue;
    const cb = -0.168736 * red - 0.331264 * green + 0.5 * blue + 128;
    const cr = 0.5 * red - 0.418688 * green - 0.081312 * blue + 128;
    output[offset] = Math.max(0, Math.min(255, y + 1.402 * (cr - 128)));
    output[offset + 1] = Math.max(0, Math.min(255, y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128)));
    output[offset + 2] = Math.max(0, Math.min(255, y + 1.772 * (cb - 128)));
    if (!weights[index]) {
      output[offset] = red;
      output[offset + 1] = green;
      output[offset + 2] = blue;
    } else if (Math.abs(y - originalY) < 0.01) {
      output[offset] = red;
      output[offset + 1] = green;
      output[offset + 2] = blue;
    }
  }
  return output;
};

const asError = (error: unknown) => {
  if (error instanceof ImageUpscalerError) return error;
  const message = error instanceof Error ? error.message : "";
  if (/memory|allocation|out of memory/i.test(message)) return new ImageUpscalerError("OUT_OF_MEMORY_RISK", "This image is too large for the available browser memory.", error);
  if (/webgpu|wasm|onnx|model|fetch|network/i.test(message)) return new ImageUpscalerError("MODEL_LOAD_FAILED", "The super-resolution runtime could not run in this browser. Try a current browser with WebAssembly support.", error);
  return new ImageUpscalerError("PROCESSING_FAILED", "The browser could not finish super-resolution for this image.", error);
};

export class BrowserImageUpscaler implements ImageUpscalerEngine {
  async process(file: File, options: ImageUpscalerOptions, signal?: AbortSignal, onProgress?: (progress: number, message: string) => void): Promise<ImageUpscalerResult> {
    try {
      if (!file || file.size <= 0) throw new ImageUpscalerError("INVALID_INPUT", "Choose a non-empty JPG, PNG, or WebP image.");
      const extension = getExtension(file.name);
      if (!["jpg", "jpeg", "png", "webp"].includes(extension)) throw new ImageUpscalerError("UNSUPPORTED_FORMAT", "Image Upscaler accepts JPG, PNG, and WebP files only.");
      const mime = detectMime(new Uint8Array(await file.slice(0, 16).arrayBuffer()), extension);
      if (!mime || !["image/jpeg", "image/png", "image/webp"].includes(mime)) throw new ImageUpscalerError("CORRUPT_FILE", "The selected file does not contain a readable JPG, PNG, or WebP image.");
      if (options.scale !== MODEL_SCALE) throw new ImageUpscalerError("UNSUPPORTED_FORMAT", "This model currently produces a fixed 3× super-resolution result.");
      onProgress?.(0.02, "Loading the super-resolution model…");
      const session = await loadSession();
      throwIfAborted(signal);
      const loaded = await loadBitmap(file, signal);
      let sourceCanvas: OffscreenCanvas | HTMLCanvasElement | undefined;
      let resizedCanvas: OffscreenCanvas | HTMLCanvasElement | undefined;
      let outputCanvas: OffscreenCanvas | HTMLCanvasElement | undefined;
      try {
        const inputWidth = loaded.bitmap.width;
        const inputHeight = loaded.bitmap.height;
        const inputPixels = inputWidth * inputHeight;
        const outputWidth = inputWidth * MODEL_SCALE;
        const outputHeight = inputHeight * MODEL_SCALE;
        if (!inputWidth || !inputHeight) throw new ImageUpscalerError("CORRUPT_FILE", "The selected image has invalid dimensions.");
        if (inputPixels > MAX_INPUT_PIXELS || outputWidth * outputHeight > MAX_OUTPUT_PIXELS) throw new ImageUpscalerError("OUT_OF_MEMORY_RISK", "This image is above the tested super-resolution size limit. Choose an image around 2 megapixels or smaller.");
        sourceCanvas = createCanvas(inputWidth, inputHeight);
        const sourceContext = get2dContext(sourceCanvas);
        sourceContext.drawImage(loaded.bitmap, 0, 0, inputWidth, inputHeight);
        const source = sourceContext.getImageData(0, 0, inputWidth, inputHeight);
        resizedCanvas = createCanvas(outputWidth, outputHeight);
        const resizedContext = get2dContext(resizedCanvas);
        resizedContext.imageSmoothingEnabled = true;
        resizedContext.imageSmoothingQuality = "high";
        resizedContext.drawImage(sourceCanvas, 0, 0, outputWidth, outputHeight);
        const resized = resizedContext.getImageData(0, 0, outputWidth, outputHeight);
        const enhancedY = new Float32Array(outputWidth * outputHeight);
        const weights = new Float32Array(outputWidth * outputHeight);
        const tileXs = getTileStarts(inputWidth);
        const tileYs = getTileStarts(inputHeight);
        const totalTiles = tileXs.length * tileYs.length;
        let completedTiles = 0;
        const runtime = await loadRuntime();
        for (const tileY of tileYs) {
          for (const tileX of tileXs) {
            throwIfAborted(signal);
            const output = await runYTile(runtime, session, source, tileX, tileY, signal);
            writeEnhancedY(enhancedY, weights, output, inputWidth, inputHeight, tileX, tileY);
            completedTiles += 1;
            onProgress?.(0.1 + completedTiles / totalTiles * 0.72, `Enhancing tile ${completedTiles} of ${totalTiles}…`);
          }
        }
        outputCanvas = createCanvas(outputWidth, outputHeight);
        const outputContext = get2dContext(outputCanvas);
        const combined = combineChannels(resized, enhancedY, weights);
        outputContext.putImageData(new ImageData(combined, outputWidth, outputHeight), 0, 0);
        throwIfAborted(signal);
        onProgress?.(0.9, "Encoding the enhanced PNG…");
        const outputBlob = await canvasToBlob(outputCanvas);
        const output = new File([outputBlob], `${getSafeBaseName(file.name)}-upscaled-3x.png`, { type: "image/png" });
        onProgress?.(1, "Super-resolution complete.");
        return { input: file, output, inputWidth, inputHeight, outputWidth, outputHeight, scale: MODEL_SCALE, inputBytes: file.size, outputBytes: output.size };
      } finally {
        closeBitmap(loaded.bitmap, loaded.objectUrl);
        for (const canvas of [sourceCanvas, resizedCanvas, outputCanvas]) {
          if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
          }
        }
      }
    } catch (error) {
      throw asError(error);
    }
  }

  dispose() {
    const session = activeSession;
    activeSession = undefined;
    sessionPromise = undefined;
    if (session) void session.release();
  }
}

export const imageUpscalerEngine = new BrowserImageUpscaler();
export const getImageUpscalerErrorMessage = (error: unknown) => asError(error).userMessage;

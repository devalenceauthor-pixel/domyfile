import type {
  ImageMime,
  ImageInputMime,
  ImageOptions,
  ImageRenderPlan,
  ImageToolSlug,
  NormalizedImageOptions,
} from "./types";

export const supportedImageMimes: ImageMime[] = ["image/jpeg", "image/png", "image/webp"];

const imageInputMimes: Record<ImageToolSlug, ImageInputMime[]> = {
  "compress-image": supportedImageMimes,
  "resize-image": supportedImageMimes,
  "png-to-jpg": ["image/png"],
  "jpg-to-png": ["image/jpeg"],
  "jpg-to-webp": ["image/jpeg"],
  "png-to-webp": ["image/png"],
  "webp-to-jpg": ["image/webp"],
  "webp-to-png": ["image/webp"],
  "crop-image": supportedImageMimes,
  "heic-to-jpg": ["image/heic", "image/heif"],
};

const defaultQuality: Record<ImageToolSlug, number> = {
  "compress-image": 78,
  "resize-image": 90,
  "png-to-jpg": 88,
  "jpg-to-png": 100,
  "jpg-to-webp": 82,
  "png-to-webp": 82,
  "webp-to-jpg": 88,
  "webp-to-png": 100,
  "crop-image": 90,
  "heic-to-jpg": 90,
};

export const getImageInputMimes = (tool: ImageToolSlug) => imageInputMimes[tool];

export const isImageMime = (value: string): value is ImageMime => supportedImageMimes.includes(value as ImageMime);

const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), maximum);

const parseNumber = (value: number | string | undefined, fallback: number) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeQuality = (value: number | undefined, fallback: number) => clamp(parseNumber(value, fallback), 1, 100);

const normalizeBackgroundColor = (value: string | undefined) => {
  if (!value) return "#ffffff";
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
};

const normalizeCropRatio = (value: ImageOptions["cropRatio"]): "free" | number => {
  if (value === undefined || value === "free") return "free";
  const parsed = parseNumber(value, 1);
  return clamp(parsed, 0.01, 100);
};

export const normalizeImageOptions = (tool: ImageToolSlug, options: ImageOptions = {}): NormalizedImageOptions => ({
  tool,
  quality: normalizeQuality(options.quality, defaultQuality[tool]),
  outputFormat: options.outputFormat,
  scale: tool === "resize-image" ? clamp(parseNumber(options.scale, 0.8), 0.1, 2) : 1,
  cropRatio: tool === "crop-image" ? normalizeCropRatio(options.cropRatio) : "free",
  cropPlan: tool === "crop-image" ? options.cropPlan : undefined,
  backgroundColor: normalizeBackgroundColor(options.backgroundColor),
});

export const getOutputMime = (tool: ImageToolSlug, inputMime: ImageInputMime, options: NormalizedImageOptions): ImageMime => {
  if (tool === "png-to-jpg") return "image/jpeg";
  if (tool === "jpg-to-png") return "image/png";
  if (tool === "jpg-to-webp" || tool === "png-to-webp") return "image/webp";
  if (tool === "webp-to-jpg") return "image/jpeg";
  if (tool === "webp-to-png") return "image/png";
  if (tool === "heic-to-jpg") return "image/jpeg";
  if ((tool === "compress-image" || tool === "crop-image") && options.outputFormat !== "original" && options.outputFormat && isImageMime(options.outputFormat)) {
    return options.outputFormat;
  }
  return isImageMime(inputMime) ? inputMime : "image/jpeg";
};

export const getOutputExtension = (mime: ImageMime) => {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  return "webp";
};

const getSafeBaseName = (fileName: string) => {
  const withoutExtension = fileName.replace(/\.[^/.]+$/, "");
  const safe = withoutExtension
    .replace(/[\\/]+/g, "-")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return safe || "file";
};

const outputSuffix: Record<ImageToolSlug, string> = {
  "compress-image": "optimized",
  "resize-image": "resized",
  "png-to-jpg": "jpg",
  "jpg-to-png": "png",
  "jpg-to-webp": "webp",
  "png-to-webp": "webp",
  "webp-to-jpg": "jpg",
  "webp-to-png": "png",
  "crop-image": "cropped",
  "heic-to-jpg": "jpg",
};

export const getOutputFileName = (fileName: string, tool: ImageToolSlug, outputMime: ImageMime) => `${getSafeBaseName(fileName)}-${outputSuffix[tool]}.${getOutputExtension(outputMime)}`;

export const getRenderPlan = (width: number, height: number, options: NormalizedImageOptions): ImageRenderPlan => {
  const sourceWidth = Math.max(1, Math.round(width));
  const sourceHeight = Math.max(1, Math.round(height));
  let sourceX = 0;
  let sourceY = 0;
  let croppedWidth = sourceWidth;
  let croppedHeight = sourceHeight;

  if (options.tool === "crop-image" && options.cropPlan) {
    const requestedX = Number.isFinite(options.cropPlan.sourceX) ? Math.round(options.cropPlan.sourceX) : 0;
    const requestedY = Number.isFinite(options.cropPlan.sourceY) ? Math.round(options.cropPlan.sourceY) : 0;
    const safeX = clamp(requestedX, 0, Math.max(0, sourceWidth - 1));
    const safeY = clamp(requestedY, 0, Math.max(0, sourceHeight - 1));
    sourceX = safeX;
    sourceY = safeY;
    croppedWidth = clamp(
      Number.isFinite(options.cropPlan.sourceWidth) ? Math.round(options.cropPlan.sourceWidth) : sourceWidth,
      1,
      sourceWidth - sourceX,
    );
    croppedHeight = clamp(
      Number.isFinite(options.cropPlan.sourceHeight) ? Math.round(options.cropPlan.sourceHeight) : sourceHeight,
      1,
      sourceHeight - sourceY,
    );
  }

  if (options.tool === "crop-image" && !options.cropPlan && options.cropRatio !== "free") {
    const targetRatio = options.cropRatio;
    const currentRatio = sourceWidth / sourceHeight;
    if (currentRatio > targetRatio) {
      croppedWidth = Math.max(1, Math.round(sourceHeight * targetRatio));
      sourceX = Math.floor((sourceWidth - croppedWidth) / 2);
    } else if (currentRatio < targetRatio) {
      croppedHeight = Math.max(1, Math.round(sourceWidth / targetRatio));
      sourceY = Math.floor((sourceHeight - croppedHeight) / 2);
    }
  }

  const scale = options.tool === "resize-image" ? options.scale : 1;
  return {
    sourceX,
    sourceY,
    sourceWidth: croppedWidth,
    sourceHeight: croppedHeight,
    targetWidth: Math.max(1, Math.round(croppedWidth * scale)),
    targetHeight: Math.max(1, Math.round(croppedHeight * scale)),
  };
};

export const parseHexColor = (value: string) => {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return { red: 255, green: 255, blue: 255, alpha: 1 };
  return {
    red: Number.parseInt(match[1].slice(0, 2), 16),
    green: Number.parseInt(match[1].slice(2, 4), 16),
    blue: Number.parseInt(match[1].slice(4, 6), 16),
    alpha: 1,
  };
};

export const canvasQuality = (mime: ImageMime, quality: number) => mime === "image/png" ? undefined : clamp(quality, 1, 100) / 100;

export const needsBackgroundFill = (mime: ImageMime) => mime === "image/jpeg";

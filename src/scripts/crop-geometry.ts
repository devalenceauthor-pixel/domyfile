import type { ImageRenderPlan } from "../tools/engines/image/types";

export type CropRatio = "free" | number;

export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CropHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), maximum);

const safeNumber = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;

const normalizeRatio = (ratio: CropRatio) => ratio === "free" ? "free" : clamp(safeNumber(ratio, 1), 0.01, 100);

const normalizeRect = (rect: CropRect): CropRect => {
  const width = clamp(safeNumber(rect.width, 1), 0.01, 1);
  const height = clamp(safeNumber(rect.height, 1), 0.01, 1);
  return {
    x: clamp(safeNumber(rect.x, 0), 0, 1 - width),
    y: clamp(safeNumber(rect.y, 0), 0, 1 - height),
    width,
    height,
  };
};

const minimumSize = (imageWidth: number, imageHeight: number) => ({
  width: clamp(16 / Math.max(1, imageWidth), 0.01, 0.25),
  height: clamp(16 / Math.max(1, imageHeight), 0.01, 0.25),
});

export const createInitialCropRect = (imageWidth: number, imageHeight: number, ratio: CropRatio): CropRect => {
  const safeWidth = Math.max(1, imageWidth);
  const safeHeight = Math.max(1, imageHeight);
  const normalizedRatio = normalizeRatio(ratio);
  let width = 0.84;
  let height = 0.84;

  if (normalizedRatio !== "free") {
    const imageRatio = safeWidth / safeHeight;
    if (imageRatio > normalizedRatio) {
      width = height * normalizedRatio / imageRatio;
    } else {
      height = width * imageRatio / normalizedRatio;
    }
  }

  return normalizeRect({ x: (1 - width) / 2, y: (1 - height) / 2, width, height });
};

export const moveCropRect = (rect: CropRect, deltaX: number, deltaY: number): CropRect => {
  const normalized = normalizeRect(rect);
  return {
    ...normalized,
    x: clamp(normalized.x + safeNumber(deltaX, 0), 0, 1 - normalized.width),
    y: clamp(normalized.y + safeNumber(deltaY, 0), 0, 1 - normalized.height),
  };
};

export const resizeCropRect = (
  rect: CropRect,
  handle: CropHandle,
  deltaX: number,
  deltaY: number,
  imageWidth: number,
  imageHeight: number,
  ratio: CropRatio,
): CropRect => {
  const normalized = normalizeRect(rect);
  const minimum = minimumSize(imageWidth, imageHeight);
  const horizontalDirection = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
  const verticalDirection = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
  const hasHorizontal = horizontalDirection !== 0;
  const hasVertical = verticalDirection !== 0;

  let width = hasHorizontal
    ? Math.max(minimum.width, normalized.width + safeNumber(deltaX, 0) * horizontalDirection)
    : normalized.width;
  let height = hasVertical
    ? Math.max(minimum.height, normalized.height + safeNumber(deltaY, 0) * verticalDirection)
    : normalized.height;

  const normalizedRatio = normalizeRatio(ratio);
  if (normalizedRatio !== "free") {
    const widthToHeight = normalizedRatio * imageHeight / imageWidth;
    if (hasHorizontal && hasVertical) {
      if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        height = Math.max(minimum.height, width / widthToHeight);
      } else {
        width = Math.max(minimum.width, height * widthToHeight);
      }
    } else if (hasHorizontal) {
      height = Math.max(minimum.height, width / widthToHeight);
    } else if (hasVertical) {
      width = Math.max(minimum.width, height * widthToHeight);
    }
  }

  const anchorX = horizontalDirection < 0 ? normalized.x + normalized.width : normalized.x;
  const anchorY = verticalDirection < 0 ? normalized.y + normalized.height : normalized.y;
  const maxWidth = horizontalDirection < 0 ? anchorX : horizontalDirection > 0 ? 1 - anchorX : 1;
  const maxHeight = verticalDirection < 0 ? anchorY : verticalDirection > 0 ? 1 - anchorY : 1;
  const fitScale = Math.min(1, maxWidth / Math.max(width, 0.0001), maxHeight / Math.max(height, 0.0001));
  width *= fitScale;
  height *= fitScale;

  let x = horizontalDirection < 0
    ? anchorX - width
    : horizontalDirection > 0
      ? anchorX
      : normalized.x + (normalized.width - width) / 2;
  let y = verticalDirection < 0
    ? anchorY - height
    : verticalDirection > 0
      ? anchorY
      : normalized.y + (normalized.height - height) / 2;

  if (width < minimum.width || height < minimum.height) {
    const minimumScale = Math.max(minimum.width / Math.max(width, 0.0001), minimum.height / Math.max(height, 0.0001));
    width *= minimumScale;
    height *= minimumScale;
    x = horizontalDirection < 0 ? anchorX - width : horizontalDirection > 0 ? anchorX : normalized.x + (normalized.width - width) / 2;
    y = verticalDirection < 0 ? anchorY - height : verticalDirection > 0 ? anchorY : normalized.y + (normalized.height - height) / 2;
  }

  return normalizeRect({ x, y, width, height });
};

export const cropRectToRenderPlan = (rect: CropRect, imageWidth: number, imageHeight: number): ImageRenderPlan => {
  const normalized = normalizeRect(rect);
  const width = Math.max(1, Math.round(imageWidth));
  const height = Math.max(1, Math.round(imageHeight));
  const sourceX = clamp(Math.round(normalized.x * width), 0, Math.max(0, width - 1));
  const sourceY = clamp(Math.round(normalized.y * height), 0, Math.max(0, height - 1));
  const sourceWidth = clamp(Math.round(normalized.width * width), 1, width - sourceX);
  const sourceHeight = clamp(Math.round(normalized.height * height), 1, height - sourceY);
  return {
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    targetWidth: sourceWidth,
    targetHeight: sourceHeight,
  };
};

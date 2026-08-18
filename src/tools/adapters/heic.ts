import { ImageProcessingError } from "../engines/image/types";

const heifBrands = new Set([
  "mif1",
  "msf1",
  "heic",
  "heix",
  "heis",
  "hevs",
  "hevc",
  "hevx",
  "heim",
  "hevm",
]);

const readFourCc = (bytes: Uint8Array, offset: number) => {
  if (offset < 0 || offset + 4 > bytes.length) return "";
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
};

const readUint32 = (bytes: Uint8Array, offset: number) => (
  offset + 4 <= bytes.length
    ? bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]
    : 0
);

/** Validate the ISO-BMFF ftyp box and a HEIF-compatible brand. */
export const isHeicSignatureBytes = (bytes: Uint8Array) => {
  if (bytes.length < 16 || readFourCc(bytes, 4) !== "ftyp") return false;

  const declaredSize = readUint32(bytes, 0);
  const boxSize = declaredSize === 0 ? bytes.length : declaredSize === 1 ? 24 : declaredSize;
  const brandStart = declaredSize === 1 ? 16 : 8;
  if (boxSize < brandStart + 4 || boxSize > bytes.length) return false;

  if (heifBrands.has(readFourCc(bytes, brandStart))) return true;
  for (let offset = brandStart + 8; offset + 4 <= boxSize; offset += 4) {
    if (heifBrands.has(readFourCc(bytes, offset))) return true;
  }
  return false;
};

export const isHeicFile = async (file: Blob) => isHeicSignatureBytes(new Uint8Array(await file.slice(0, 256).arrayBuffer()));

const jpegSofMarkers = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

const readJpegDimensions = (bytes: Uint8Array) => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    const segmentLength = (bytes[offset] << 8) + bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return undefined;
    if (jpegSofMarkers.has(marker) && segmentLength >= 7) {
      return {
        height: (bytes[offset + 3] << 8) + bytes[offset + 4],
        width: (bytes[offset + 5] << 8) + bytes[offset + 6],
      };
    }
    offset += segmentLength;
  }
  return undefined;
};

export const convertHeicToJpeg = async (file: File, quality: number, signal?: AbortSignal) => {
  if (signal?.aborted) throw new ImageProcessingError("CANCELLED", "Processing was cancelled.");
  if (!(await isHeicFile(file))) {
    throw new ImageProcessingError("UNSUPPORTED_FORMAT", "This file does not contain a supported HEIC or HEIF image.");
  }

  try {
    const { heicTo } = await import("heic-to");
    const blob = await heicTo({ blob: file, type: "image/jpeg", quality: Math.min(1, Math.max(0.01, quality / 100)) });
    if (signal?.aborted) throw new ImageProcessingError("CANCELLED", "Processing was cancelled.");
    if (!blob.size || blob.type.toLowerCase() !== "image/jpeg") {
      throw new ImageProcessingError("PROCESSING_FAILED", "The HEIC decoder did not return a valid JPG file.");
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const dimensions = readJpegDimensions(bytes);
    if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
      throw new ImageProcessingError("PROCESSING_FAILED", "The HEIC decoder did not return a readable JPG file.");
    }
    return { blob, width: dimensions.width, height: dimensions.height };
  } catch (error) {
    if (error instanceof ImageProcessingError) throw error;
    throw new ImageProcessingError("PROCESSING_FAILED", "This HEIC or HEIF image could not be converted in the browser.", error);
  }
};

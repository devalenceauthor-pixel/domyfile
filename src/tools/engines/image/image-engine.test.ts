import { describe, expect, it } from "vitest";
import {
  BrowserImageEngine,
  detectImageMimeFromSignature,
} from "./image-engine";
import {
  getOutputFileName,
  getOutputMime,
  getRenderPlan,
  normalizeImageOptions,
} from "./options";
import { isHeicSignatureBytes } from "../../adapters/heic";

const makeFile = (bytes: number[], name: string, type: string) => Object.assign(
  new Blob([new Uint8Array(bytes)], { type }),
  { name, lastModified: 0 },
) as File;

const makeFtyp = (majorBrand: string, compatibleBrands: string[] = []) => {
  const bytes = new Uint8Array(16 + compatibleBrands.length * 4);
  new DataView(bytes.buffer).setUint32(0, bytes.length);
  bytes.set([...`ftyp${majorBrand}`].map((character) => character.charCodeAt(0)), 4);
  compatibleBrands.forEach((brand, index) => bytes.set([...brand].map((character) => character.charCodeAt(0)), 16 + index * 4));
  return bytes;
};

describe("image engine validation and render planning", () => {
  it("detects the supported raster signatures", () => {
    expect(detectImageMimeFromSignature(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectImageMimeFromSignature(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectImageMimeFromSignature(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
    expect(detectImageMimeFromSignature(new Uint8Array([0x00, 0x01, 0x02]))).toBeNull();
  });

  it("validates real HEIC/HEIF container signatures instead of file names", () => {
    expect(isHeicSignatureBytes(makeFtyp("heic", ["mif1"]))).toBe(true);
    expect(isHeicSignatureBytes(makeFtyp("mif1"))).toBe(true);
    expect(isHeicSignatureBytes(makeFtyp("avif"))).toBe(false);
    expect(isHeicSignatureBytes(new Uint8Array([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]))).toBe(false);
  });

  it("maps tool options to output formats without changing dimensions by default", () => {
    expect(getOutputMime("png-to-jpg", "image/png", normalizeImageOptions("png-to-jpg"))).toBe("image/jpeg");
    expect(getOutputMime("jpg-to-png", "image/jpeg", normalizeImageOptions("jpg-to-png"))).toBe("image/png");
    expect(getOutputMime("jpg-to-webp", "image/jpeg", normalizeImageOptions("jpg-to-webp", { outputFormat: "image/jpeg" }))).toBe("image/webp");
    expect(getOutputMime("png-to-webp", "image/png", normalizeImageOptions("png-to-webp", { outputFormat: "image/jpeg" }))).toBe("image/webp");
    expect(getOutputMime("webp-to-jpg", "image/webp", normalizeImageOptions("webp-to-jpg", { outputFormat: "image/png" }))).toBe("image/jpeg");
    expect(getOutputMime("webp-to-png", "image/webp", normalizeImageOptions("webp-to-png", { outputFormat: "image/jpeg" }))).toBe("image/png");
    expect(getOutputMime("crop-image", "image/jpeg", normalizeImageOptions("crop-image", { outputFormat: "image/webp" }))).toBe("image/webp");
    expect(getRenderPlan(1200, 800, normalizeImageOptions("jpg-to-webp"))).toMatchObject({
      sourceWidth: 1200,
      sourceHeight: 800,
      targetWidth: 1200,
      targetHeight: 800,
    });
  });

  it("calculates centered crop and proportional resize plans", () => {
    const crop = normalizeImageOptions("crop-image", { cropRatio: "1" });
    expect(getRenderPlan(1600, 900, crop)).toEqual({
      sourceX: 350,
      sourceY: 0,
      sourceWidth: 900,
      sourceHeight: 900,
      targetWidth: 900,
      targetHeight: 900,
    });

    const resize = normalizeImageOptions("resize-image", { scale: 0.8 });
    expect(getRenderPlan(1000, 500, resize)).toMatchObject({ targetWidth: 800, targetHeight: 400 });
  });

  it("honors an explicit visual crop plan and clamps it to decoded dimensions", () => {
    const crop = normalizeImageOptions("crop-image", {
      cropRatio: "free",
      cropPlan: {
        sourceX: 120,
        sourceY: 80,
        sourceWidth: 640,
        sourceHeight: 480,
        targetWidth: 1,
        targetHeight: 1,
      },
    });
    expect(getRenderPlan(1600, 1200, crop)).toEqual({
      sourceX: 120,
      sourceY: 80,
      sourceWidth: 640,
      sourceHeight: 480,
      targetWidth: 640,
      targetHeight: 480,
    });

    const clamped = normalizeImageOptions("crop-image", {
      cropPlan: {
        sourceX: 1599,
        sourceY: 1199,
        sourceWidth: 400,
        sourceHeight: 400,
        targetWidth: 400,
        targetHeight: 400,
      },
    });
    expect(getRenderPlan(1600, 1200, clamped)).toMatchObject({ sourceX: 1599, sourceY: 1199, sourceWidth: 1, sourceHeight: 1, targetWidth: 1, targetHeight: 1 });
  });

  it("creates safe output names with the selected format", () => {
    expect(getOutputFileName("holiday/party?.png", "png-to-jpg", "image/jpeg")).toBe("holiday-party-jpg.jpg");
    expect(getOutputFileName("photo.jpeg", "jpg-to-png", "image/png")).toBe("photo-png.png");
    expect(getOutputFileName("photo.heic", "heic-to-jpg", "image/jpeg")).toBe("photo-jpg.jpg");
    expect(getOutputFileName("photo.jpg", "jpg-to-webp", "image/webp")).toBe("photo-webp.webp");
    expect(getOutputFileName("photo.webp", "webp-to-png", "image/png")).toBe("photo-png.png");
  });

  it("rejects invalid signatures before any decode work", async () => {
    const engine = new BrowserImageEngine();
    const validPng = makeFile([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "pixel.png", "image/png");
    const invalid = makeFile([0x00, 0x01, 0x02], "broken.png", "image/png");

    const valid = await engine.validate([validPng], { tool: "png-to-jpg" });
    const rejected = await engine.validate([invalid], { tool: "png-to-jpg" });
    expect(valid.valid).toBe(true);
    expect(rejected.valid).toBe(false);
    expect(rejected.issues[0]?.code).toBe("CORRUPT_FILE");
    engine.dispose();
  });
});

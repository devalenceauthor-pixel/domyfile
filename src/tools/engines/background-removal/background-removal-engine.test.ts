import { describe, expect, it } from "vitest";
import { backgroundRemovalEngine, detectBackgroundRemovalMime, getBackgroundRemovalOutputName } from "./background-removal-engine";

const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("background removal input contract", () => {
  it("recognizes supported raster signatures and deterministic names", async () => {
    const input = new File([pngHeader], "product.png", { type: "image/png" });

    expect(detectBackgroundRemovalMime(pngHeader)).toBe("image/png");
    await expect(backgroundRemovalEngine.validate(input)).resolves.toBeUndefined();
    expect(getBackgroundRemovalOutputName("product.png")).toBe("product-no-background.png");
  });

  it("rejects unsupported extensions and corrupt raster content", async () => {
    const unsupported = new File([pngHeader], "product.gif", { type: "image/gif" });
    const corrupt = new File(["not an image"], "product.webp", { type: "image/webp" });

    await expect(backgroundRemovalEngine.validate(unsupported)).rejects.toMatchObject({ code: "UNSUPPORTED_FORMAT" });
    await expect(backgroundRemovalEngine.validate(corrupt)).rejects.toMatchObject({ code: "CORRUPT_FILE" });
  });

  it("rejects empty input before loading the model", async () => {
    await expect(backgroundRemovalEngine.validate(new File([], "empty.jpg", { type: "image/jpeg" }))).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

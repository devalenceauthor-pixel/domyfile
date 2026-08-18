import { describe, expect, it } from "vitest";
import {
  createInitialCropRect,
  cropRectToRenderPlan,
  moveCropRect,
  resizeCropRect,
} from "./crop-geometry";

describe("crop geometry", () => {
  it("creates a centered initial selection for freeform and fixed ratios", () => {
    const freeform = createInitialCropRect(1600, 1200, "free");
    expect(freeform.x).toBeCloseTo(0.08);
    expect(freeform.y).toBeCloseTo(0.08);
    expect(freeform.width).toBeCloseTo(0.84);
    expect(freeform.height).toBeCloseTo(0.84);
    const square = createInitialCropRect(1600, 1200, 1);
    expect(square.x).toBeCloseTo(0.185);
    expect(square.y).toBeCloseTo(0.08);
    expect(square.width * 1600).toBeCloseTo(square.height * 1200);
  });

  it("keeps moved selections inside the image", () => {
    expect(moveCropRect({ x: 0.2, y: 0.2, width: 0.5, height: 0.5 }, 0.9, -0.9)).toEqual({
      x: 0.5,
      y: 0,
      width: 0.5,
      height: 0.5,
    });
  });

  it("resizes fixed-ratio selections without breaking the requested ratio", () => {
    const initial = createInitialCropRect(1600, 1200, 1);
    const resized = resizeCropRect(initial, "se", 0.1, 0.05, 1600, 1200, 1);
    const plan = cropRectToRenderPlan(resized, 1600, 1200);
    expect(plan.targetWidth).toBe(plan.targetHeight);
    expect(plan.sourceX + plan.sourceWidth).toBeLessThanOrEqual(1600);
    expect(plan.sourceY + plan.sourceHeight).toBeLessThanOrEqual(1200);
  });

  it("converts normalized selections into bounded pixel render plans", () => {
    expect(cropRectToRenderPlan({ x: 0.125, y: 0.25, width: 0.5, height: 0.5 }, 1600, 1200)).toEqual({
      sourceX: 200,
      sourceY: 300,
      sourceWidth: 800,
      sourceHeight: 600,
      targetWidth: 800,
      targetHeight: 600,
    });
  });
});

import { describe, expect, it } from "vitest";
import { findMatchingTools, getToolAvailability, getToolPath, tools } from "./registry";

describe("tool registry", () => {
  it("contains the complete V1 catalog with unique routes", () => {
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.every((tool) => getToolAvailability(tool) === "production-ready")).toBe(true);
    expect(new Set(tools.map((tool) => tool.slug)).size).toBe(tools.length);
    expect(new Set(tools.map((tool) => getToolPath(tool))).size).toBe(tools.length);
    expect(tools.some((tool) => tool.slug === "image-converter")).toBe(false);
    expect(tools.some((tool) => tool.slug === "images-to-pdf")).toBe(false);
    expect(["jpg-to-webp", "png-to-webp", "webp-to-jpg", "webp-to-png", "jpg-to-pdf", "png-to-pdf", "webp-to-pdf"].every((slug) => tools.some((tool) => tool.slug === slug))).toBe(true);
  });

  it("matches common task and format searches", () => {
    expect(findMatchingTools("png to jpg")[0]?.slug).toBe("png-to-jpg");
    expect(findMatchingTools("png to pdf")[0]?.slug).toBe("png-to-pdf");
    expect(findMatchingTools("webp to jpg")[0]?.slug).toBe("webp-to-jpg");
    expect(findMatchingTools("compress").map((tool) => tool.category)).toContain("video");
  });

  it("keeps the production/server inventory explicit", () => {
    expect(tools.filter((tool) => getToolAvailability(tool) === "production-ready")).toHaveLength(tools.length);
    expect(tools.filter((tool) => getToolAvailability(tool) === "deferred")).toHaveLength(0);
    expect(tools.find((tool) => tool.slug === "video-to-mp3") && getToolAvailability(tools.find((tool) => tool.slug === "video-to-mp3")!)).toBe("production-ready");
    expect(tools.find((tool) => tool.slug === "mov-to-mp4") && getToolAvailability(tools.find((tool) => tool.slug === "mov-to-mp4")!)).toBe("production-ready");
    expect(tools.find((tool) => tool.slug === "trim-video") && getToolAvailability(tools.find((tool) => tool.slug === "trim-video")!)).toBe("production-ready");
    expect(getToolAvailability(tools.find((tool) => tool.slug === "compress-video")!)).toBe("production-ready");
    expect(getToolAvailability(tools.find((tool) => tool.slug === "compress-pdf")!)).toBe("production-ready");
    expect(tools.filter((tool) => tool.processingBoundary === "server").map((tool) => tool.slug)).toEqual(["compress-pdf", "compress-video"]);
    expect(getToolAvailability(tools.find((tool) => tool.slug === "video-converter")!)).toBe("production-ready");
  });
});

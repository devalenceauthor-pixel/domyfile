import type { ImageMime, ImageRenderPlan, ImageToolSlug } from "./types";

export type ImageWorkerRenderRequest = {
  type: "render";
  id: number;
  buffer: ArrayBuffer;
  inputMime: ImageMime;
  outputMime: ImageMime;
  tool: ImageToolSlug;
  scale: number;
  cropRatio: "free" | number;
  quality?: number;
  backgroundColor: string;
  plan?: ImageRenderPlan;
};

export type ImageWorkerCancelRequest = {
  type: "cancel";
  id: number;
};

export type ImageWorkerRequest = ImageWorkerRenderRequest | ImageWorkerCancelRequest;

export type ImageWorkerSuccess = {
  type: "success";
  id: number;
  buffer: ArrayBuffer;
  mime: ImageMime;
  width: number;
  height: number;
};

export type ImageWorkerFailure = {
  type: "error";
  id: number;
  code: "BROWSER_UNSUPPORTED" | "UNSUPPORTED_FORMAT" | "PROCESSING_FAILED" | "OUT_OF_MEMORY";
  message: string;
};

export type ImageWorkerResponse = ImageWorkerSuccess | ImageWorkerFailure;

import type { PdfOptions, PdfToolSlug } from "./types";

export type PdfWorkerInput = {
  name: string;
  mime: string;
  buffer: ArrayBuffer;
};

export type PdfWorkerRequest = {
  type: "process";
  id: number;
  tool: PdfToolSlug;
  inputs: PdfWorkerInput[];
  options: PdfOptions;
  watermarkImage?: PdfWorkerInput;
};

export type PdfWorkerCancelRequest = {
  type: "cancel";
  id: number;
};

export type PdfWorkerMessage = PdfWorkerRequest | PdfWorkerCancelRequest;

export type PdfWorkerSuccess = {
  type: "success";
  id: number;
  outputs: Array<{ buffer: ArrayBuffer; pageCount?: number; pageNumber?: number }>;
};

export type PdfWorkerFailure = {
  type: "error";
  id: number;
  code: "ENCRYPTED_PDF_UNSUPPORTED" | "CORRUPT_FILE" | "PROCESSING_FAILED" | "OUT_OF_MEMORY_RISK";
  message: string;
};

export type PdfWorkerResponse = PdfWorkerSuccess | PdfWorkerFailure;

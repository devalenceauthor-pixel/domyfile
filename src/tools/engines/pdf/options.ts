import type { PdfErrorCode, PdfOptions, PdfPageSelection, PdfToolSlug } from "./types";
import { PdfProcessingError } from "./types";

export type NormalizedPdfOptions = PdfOptions & {
  tool: PdfToolSlug;
  rotation: 90 | 180 | 270;
  pageSize: "fit" | "a4" | "letter";
  pageOrientation: "auto" | "portrait" | "landscape";
  watermarkPlacement: NonNullable<PdfOptions["watermarkPlacement"]>;
  watermarkScale: number;
  watermarkOpacity: number;
  watermarkColor: string;
  rasterFormat: "jpg" | "png" | "webp";
  extractImageFormat: "png" | "webp";
  extractImageQuality: number;
  pageNumberStart: number;
  pageNumberPlacement: NonNullable<PdfOptions["pageNumberPlacement"]>;
  headerFooterScope: PdfPageSelection;
  cropMargin: number;
  textFontSize: number;
};

export const isPdfSignature = (bytes: Uint8Array) => bytes.length >= 5
  && bytes[0] === 0x25
  && bytes[1] === 0x50
  && bytes[2] === 0x44
  && bytes[3] === 0x46
  && bytes[4] === 0x2d;

export const getFileExtension = (fileName: string) => {
  const extension = fileName.toLowerCase().split(".").pop();
  return extension && extension !== fileName.toLowerCase() ? extension : "";
};

const safeBaseName = (fileName: string) => fileName
  .replace(/\.[^/.]+$/, "")
  .replace(/[\\/]+/g, "-")
  .replace(/[^\p{L}\p{N}._-]+/gu, "-")
  .replace(/-{2,}/g, "-")
  .replace(/^[-.]+|[-.]+$/g, "") || "file";

const suffixes: Record<PdfToolSlug, string> = {
  "merge-pdf": "merged",
  "split-pdf": "split",
  "organize-pdf": "organized",
  "rotate-pdf": "rotated",
  "jpg-to-pdf": "pdf",
  "png-to-pdf": "pdf",
  "webp-to-pdf": "pdf",
  "pdf-to-jpg": "jpg",
  "watermark-pdf": "watermarked",
  "pdf-to-png": "png",
  "pdf-to-webp": "webp",
  "extract-images-from-pdf": "images",
  "add-page-numbers": "numbered",
  "header-footer-pdf": "header-footer",
  "crop-pdf": "cropped",
  "pdf-to-text": "text",
  "pdf-to-html": "html",
  "pdf-metadata-viewer": "metadata",
  "clean-pdf-metadata": "metadata-cleaned",
  "txt-to-pdf": "pdf",
  "flatten-pdf": "flattened",
};

export const getPdfOutputName = (fileName: string, tool: PdfToolSlug, index?: number, pageNumber?: number) => {
  const base = safeBaseName(fileName);
  if (["pdf-to-jpg", "pdf-to-png", "pdf-to-webp"].includes(tool)) {
    const extension = tool === "pdf-to-jpg" ? "jpg" : tool === "pdf-to-png" ? "png" : "webp";
    return `${base}-page-${pageNumber ?? (index ?? 0) + 1}.${extension}`;
  }
  if (tool === "extract-images-from-pdf") return `${base}-image-${String((index ?? 0) + 1).padStart(2, "0")}.png`;
  if (tool === "pdf-to-text") return `${base}-text.txt`;
  if (tool === "pdf-to-html") return `${base}-text.html`;
  if (tool === "pdf-metadata-viewer") return `${base}-metadata.json`;
  if (tool === "txt-to-pdf") return `${base}-pdf.pdf`;
  if (tool === "split-pdf") return `${base}-${suffixes[tool]}-${(index ?? 0) + 1}.pdf`;
  return `${base}-${suffixes[tool]}.pdf`;
};

const parsePageNumber = (value: string, pageCount: number): number => {
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1 || page > pageCount) {
    throw new PdfProcessingError("INVALID_INPUT", `Page ${value} is outside this PDF's 1–${pageCount} page range.`);
  }
  return page;
};

export const parsePageGroups = (selection: PdfPageSelection | undefined, pageCount: number) => {
  if (!selection || selection.trim().toLowerCase() === "all") return [Array.from({ length: pageCount }, (_, index) => index + 1)];
  const tokens = selection.split(",").map((token) => token.trim()).filter(Boolean);
  if (!tokens.length) throw new PdfProcessingError("INVALID_INPUT", "Enter at least one page or range, such as 1-3, 5.");
  return tokens.map((token) => {
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(token);
    if (!range) return [parsePageNumber(token, pageCount)];
    const start = parsePageNumber(range[1], pageCount);
    const end = parsePageNumber(range[2], pageCount);
    if (start > end) throw new PdfProcessingError("INVALID_INPUT", `Page range “${token}” must start before it ends.`);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });
};

export const flattenPageGroups = (groups: number[][]) => groups.flat();

export const validateOrganizeOrder = (order: number[] | undefined, pageCount: number) => {
  const resolved = order?.length ? order : Array.from({ length: pageCount }, (_, index) => index + 1);
  if (resolved.some((page) => !Number.isInteger(page) || page < 1 || page > pageCount)) {
    throw new PdfProcessingError("INVALID_INPUT", `Organize pages using numbers from 1 to ${pageCount}.`);
  }
  return resolved;
};

export const normalizePdfOptions = (tool: PdfToolSlug, options: PdfOptions = {}): NormalizedPdfOptions => ({
  ...options,
  tool,
  rotation: options.rotation === 180 ? 180 : options.rotation === 270 ? 270 : 90,
  pageSize: options.pageSize === "a4" || options.pageSize === "letter" ? options.pageSize : "fit",
  pageOrientation: options.pageOrientation === "portrait" || options.pageOrientation === "landscape" ? options.pageOrientation : "auto",
  watermarkPlacement: options.watermarkPlacement ?? "center",
  watermarkScale: Math.min(Math.max(Number(options.watermarkScale ?? 0.35), 0.05), 1),
  watermarkOpacity: Math.min(Math.max(Number(options.watermarkOpacity ?? 35), 5), 100),
  watermarkColor: /^#[0-9a-f]{6}$/i.test(options.watermarkColor ?? "") ? options.watermarkColor ?? "#64748b" : "#64748b",
  rasterFormat: options.rasterFormat === "png" || options.rasterFormat === "webp" ? options.rasterFormat : "jpg",
  extractImageFormat: options.extractImageFormat === "webp" ? "webp" : "png",
  extractImageQuality: Math.min(Math.max(Number(options.extractImageQuality ?? 92), 60), 100),
  pageNumberStart: Math.min(Math.max(Math.round(Number(options.pageNumberStart ?? 1)), 1), 1_000_000),
  pageNumberPlacement: options.pageNumberPlacement ?? "bottom-right",
  headerFooterScope: options.headerFooterScope ?? "all",
  cropMargin: Math.min(Math.max(Number(options.cropMargin ?? 24), 0), 720),
  textFontSize: Math.min(Math.max(Number(options.textFontSize ?? 11), 7), 24),
});

export const parseHexColor = (value: string) => {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return { red: 0.39, green: 0.45, blue: 0.55 };
  return {
    red: Number.parseInt(match[1].slice(0, 2), 16) / 255,
    green: Number.parseInt(match[1].slice(2, 4), 16) / 255,
    blue: Number.parseInt(match[1].slice(4, 6), 16) / 255,
  };
};

export const toPdfError = (code: PdfErrorCode, message: string) => new PdfProcessingError(code, message);

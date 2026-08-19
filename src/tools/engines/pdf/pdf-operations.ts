import {
  degrees,
  PDFDocument,
  PDFName,
  PageSizes,
  rgb,
  StandardFonts,
} from "pdf-lib";
import {
  flattenPageGroups,
  normalizePdfOptions,
  parseHexColor,
  parsePageGroups,
  validateOrganizeOrder,
} from "./options";
import { PdfProcessingError, type PdfOptions, type PdfToolSlug } from "./types";

export type PdfOperationInput = {
  name: string;
  mime: string;
  bytes: Uint8Array;
};

export type PdfOperationOutput = {
  bytes: Uint8Array;
  pageCount?: number;
  pageNumber?: number;
  mime?: "application/pdf";
};

const loadPdf = (bytes: Uint8Array) => PDFDocument.load(bytes, { updateMetadata: false });

const savePdf = (document: PDFDocument) => document.save({ useObjectStreams: true, addDefaultPage: false });

const getPageSize = (pageSize: "fit" | "a4" | "letter") => {
  if (pageSize === "a4") return PageSizes.A4;
  if (pageSize === "letter") return PageSizes.Letter;
  return undefined;
};

const getOrientedPageSize = (size: [number, number], orientation: "auto" | "portrait" | "landscape", imageWidth: number, imageHeight: number) => {
  const shouldLandscape = orientation === "landscape" || (orientation === "auto" && imageWidth > imageHeight);
  const [short, long] = size[0] < size[1] ? [size[0], size[1]] : [size[1], size[0]];
  return shouldLandscape ? [long, short] as [number, number] : [short, long] as [number, number];
};

const getPlacement = (placement: NonNullable<PdfOptions["watermarkPlacement"]>, pageWidth: number, pageHeight: number, contentWidth: number, contentHeight: number) => {
  const margin = Math.max(18, Math.min(pageWidth, pageHeight) * 0.05);
  switch (placement) {
    case "top-left": return { x: margin, y: pageHeight - margin - contentHeight };
    case "top-right": return { x: pageWidth - margin - contentWidth, y: pageHeight - margin - contentHeight };
    case "bottom-left": return { x: margin, y: margin };
    case "bottom-right": return { x: pageWidth - margin - contentWidth, y: margin };
    default: return { x: (pageWidth - contentWidth) / 2, y: (pageHeight - contentHeight) / 2 };
  }
};

const mergePdfs = async (inputs: PdfOperationInput[]) => {
  const output = await PDFDocument.create();
  let pageCount = 0;
  for (const input of inputs) {
    const source = await loadPdf(input.bytes);
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
    pageCount += pages.length;
  }
  return [{ bytes: await savePdf(output), pageCount }];
};

const splitPdf = async (input: PdfOperationInput, options: ReturnType<typeof normalizePdfOptions>) => {
  const source = await loadPdf(input.bytes);
  const groups = options.splitGroups?.length ? options.splitGroups : parsePageGroups(options.pageSelection, source.getPageCount());
  return Promise.all(groups.map(async (group) => {
    const output = await PDFDocument.create();
    const pages = await output.copyPages(source, group.map((page) => page - 1));
    pages.forEach((page) => output.addPage(page));
    return { bytes: await savePdf(output), pageCount: pages.length };
  }));
};

const organizePdf = async (input: PdfOperationInput, options: ReturnType<typeof normalizePdfOptions>) => {
  const source = await loadPdf(input.bytes);
  const order = validateOrganizeOrder(options.organizeOrder, source.getPageCount());
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, order.map((page) => page - 1));
  pages.forEach((page) => output.addPage(page));
  return [{ bytes: await savePdf(output), pageCount: pages.length }];
};

const rotatePdf = async (input: PdfOperationInput, options: ReturnType<typeof normalizePdfOptions>) => {
  const document = await loadPdf(input.bytes);
  const pages = options.rotationScope && options.rotationScope !== "all"
    ? flattenPageGroups(parsePageGroups(options.rotationScope, document.getPageCount()))
    : Array.from({ length: document.getPageCount() }, (_, index) => index + 1);
  const selected = new Set(pages);
  document.getPages().forEach((page, index) => {
    if (!selected.has(index + 1)) return;
    const current = page.getRotation().angle;
    page.setRotation(degrees((current + (options.rotation ?? 90)) % 360));
  });
  return [{ bytes: await savePdf(document), pageCount: document.getPageCount() }];
};

const imagesToPdf = async (inputs: PdfOperationInput[], options: ReturnType<typeof normalizePdfOptions>) => {
  const output = await PDFDocument.create();
  for (const input of inputs) {
    const image = input.mime === "image/jpeg" ? await output.embedJpg(input.bytes) : await output.embedPng(input.bytes);
    const imageSize = image.size();
    const configuredSize = getPageSize(options.pageSize);
    const pageSize = configuredSize
      ? getOrientedPageSize(configuredSize, options.pageOrientation, imageSize.width, imageSize.height)
      : [imageSize.width, imageSize.height] as [number, number];
    const padding = configuredSize ? 24 : 0;
    const availableWidth = Math.max(1, pageSize[0] - padding * 2);
    const availableHeight = Math.max(1, pageSize[1] - padding * 2);
    const scale = Math.min(availableWidth / imageSize.width, availableHeight / imageSize.height);
    const width = imageSize.width * scale;
    const height = imageSize.height * scale;
    const page = output.addPage(pageSize);
    page.drawImage(image, {
      x: (pageSize[0] - width) / 2,
      y: (pageSize[1] - height) / 2,
      width,
      height,
    });
  }
  return [{ bytes: await savePdf(output), pageCount: inputs.length }];
};

const watermarkPdf = async (input: PdfOperationInput, options: ReturnType<typeof normalizePdfOptions>, watermarkImage?: PdfOperationInput) => {
  const document = await loadPdf(input.bytes);
  const placement = options.watermarkPlacement ?? "center";
  const opacity = (options.watermarkOpacity ?? 35) / 100;
  const color = parseHexColor(options.watermarkColor ?? "#64748b");
  const font = options.watermarkMode === "text" ? await document.embedFont(StandardFonts.Helvetica) : undefined;
  const image = options.watermarkMode === "image" && watermarkImage
    ? watermarkImage.mime === "image/jpeg" ? await document.embedJpg(watermarkImage.bytes) : await document.embedPng(watermarkImage.bytes)
    : undefined;

  document.getPages().forEach((page) => {
    const { width: pageWidth, height: pageHeight } = page.getSize();
    if (image) {
      const imageSize = image.size();
      const scale = Math.min((pageWidth * (options.watermarkScale ?? 0.35)) / imageSize.width, (pageHeight * (options.watermarkScale ?? 0.35)) / imageSize.height);
      const width = imageSize.width * scale;
      const height = imageSize.height * scale;
      const position = getPlacement(placement, pageWidth, pageHeight, width, height);
      page.drawImage(image, { ...position, width, height, opacity });
      return;
    }
    if (!font || !options.watermarkText?.trim()) return;
    const size = Math.max(12, Math.min(pageWidth, pageHeight) * 0.08 * (options.watermarkScale ?? 0.35));
    const text = options.watermarkText.trim();
    const textWidth = font.widthOfTextAtSize(text, size);
    const textHeight = size;
    const position = getPlacement(placement, pageWidth, pageHeight, textWidth, textHeight);
    page.drawText(text, {
      ...position,
      size,
      font,
      color: rgb(color.red, color.green, color.blue),
      opacity,
    });
  });
  return [{ bytes: await savePdf(document), pageCount: document.getPageCount() }];
};

const selectedPageNumbers = (selection: string | undefined, pageCount: number) => flattenPageGroups(parsePageGroups(selection, pageCount));

const addPageNumbersPdf = async (input: PdfOperationInput, options: ReturnType<typeof normalizePdfOptions>) => {
  const document = await loadPdf(input.bytes);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const selected = new Set(selectedPageNumbers(options.pageSelection, document.getPageCount()));
  let sequence = 0;
  document.getPages().forEach((page, index) => {
    if (!selected.has(index + 1)) return;
    const { width, height } = page.getSize();
    const size = Math.max(9, Math.min(18, Math.min(width, height) * 0.025));
    const text = String(options.pageNumberStart + sequence);
    const textWidth = font.widthOfTextAtSize(text, size);
    const placement = getPlacement(options.pageNumberPlacement, width, height, textWidth, size);
    page.drawText(text, { ...placement, size, font, color: rgb(0.16, 0.2, 0.28) });
    sequence += 1;
  });
  return [{ bytes: await savePdf(document), pageCount: document.getPageCount() }];
};

const replacePageTokens = (value: string, pageNumber: number, pageCount: number) => value.replaceAll("{{page}}", String(pageNumber)).replaceAll("{{pages}}", String(pageCount));

const headerFooterPdf = async (input: PdfOperationInput, options: ReturnType<typeof normalizePdfOptions>) => {
  const header = options.headerText?.trim() ?? "";
  const footer = options.footerText?.trim() ?? "";
  if (!header && !footer) throw new PdfProcessingError("INVALID_INPUT", "Enter header text, footer text, or both before processing the PDF.");
  const document = await loadPdf(input.bytes);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const selected = new Set(selectedPageNumbers(options.headerFooterScope, document.getPageCount()));
  document.getPages().forEach((page, index) => {
    if (!selected.has(index + 1)) return;
    const { width, height } = page.getSize();
    const size = Math.max(8, Math.min(16, Math.min(width, height) * 0.022));
    const draw = (value: string, y: number) => {
      if (!value) return;
      page.drawText(replacePageTokens(value, index + 1, document.getPageCount()), { x: 24, y, size, font, color: rgb(0.16, 0.2, 0.28), maxWidth: width - 48 });
    };
    draw(header, height - 24 - size);
    draw(footer, 18);
  });
  return [{ bytes: await savePdf(document), pageCount: document.getPageCount() }];
};

const cropPdf = async (input: PdfOperationInput, options: ReturnType<typeof normalizePdfOptions>) => {
  const document = await loadPdf(input.bytes);
  document.getPages().forEach((page) => {
    const { width, height } = page.getSize();
    const margin = Math.min(options.cropMargin, Math.max(0, width / 2 - 1), Math.max(0, height / 2 - 1));
    page.setCropBox(margin, margin, Math.max(1, width - margin * 2), Math.max(1, height - margin * 2));
  });
  return [{ bytes: await savePdf(document), pageCount: document.getPageCount() }];
};

const cleanPdfMetadata = async (input: PdfOperationInput) => {
  const document = await loadPdf(input.bytes);
  const infoRef = document.context.trailerInfo.Info;
  const info = infoRef ? document.context.lookup(infoRef) : undefined;
  if (info && typeof (info as { delete?: unknown }).delete === "function") {
    const infoDict = info as unknown as { delete: (key: PDFName) => boolean };
    ["Title", "Author", "Subject", "Keywords", "Creator", "Producer", "CreationDate", "ModDate", "Trapped"].forEach((key) => infoDict.delete(PDFName.of(key)));
  }
  document.context.trailerInfo.Info = undefined;
  document.catalog.delete(PDFName.of("Metadata"));
  return [{ bytes: await savePdf(document), pageCount: document.getPageCount() }];
};

const flattenPdf = async (input: PdfOperationInput) => {
  const document = await loadPdf(input.bytes);
  document.getForm().flatten();
  return [{ bytes: await savePdf(document), pageCount: document.getPageCount() }];
};

const safePdfText = (value: string) => value.replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, "?");

const txtToPdf = async (input: PdfOperationInput, options: ReturnType<typeof normalizePdfOptions>) => {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(input.bytes);
  } catch (error) {
    throw new PdfProcessingError("INVALID_INPUT", "The TXT file is not valid UTF-8 text.", error);
  }
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const pageSize = options.pageSize === "letter" ? PageSizes.Letter : PageSizes.A4;
  const [width, height] = options.pageOrientation === "landscape" ? [pageSize[1], pageSize[0]] : pageSize;
  const margin = 48;
  const fontSize = options.textFontSize;
  const lineHeight = fontSize * 1.45;
  const maxWidth = width - margin * 2;
  const wrap = (line: string) => {
    const words = safePdfText(line).split(/\s+/).filter(Boolean);
    if (!words.length) return [""];
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && font.widthOfTextAtSize(candidate, fontSize) > maxWidth) {
        lines.push(current);
        current = word;
      } else current = candidate;
    }
    if (current) lines.push(current);
    return lines;
  };
  let page = document.addPage([width, height]);
  let y = height - margin - fontSize;
  for (const sourceLine of text.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n")) {
    for (const line of wrap(sourceLine)) {
      if (y < margin) {
        page = document.addPage([width, height]);
        y = height - margin - fontSize;
      }
      page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0.08, 0.1, 0.14) });
      y -= lineHeight;
    }
  }
  return [{ bytes: await savePdf(document), pageCount: document.getPageCount() }];
};

export const runPdfOperation = async (tool: PdfToolSlug, inputs: PdfOperationInput[], rawOptions: PdfOptions, watermarkImage?: PdfOperationInput): Promise<PdfOperationOutput[]> => {
  const options = normalizePdfOptions(tool, rawOptions);
  switch (tool) {
    case "merge-pdf": return mergePdfs(inputs);
    case "split-pdf": return splitPdf(inputs[0], options);
    case "organize-pdf": return organizePdf(inputs[0], options);
    case "rotate-pdf": return rotatePdf(inputs[0], options);
    case "jpg-to-pdf":
    case "png-to-pdf":
    case "webp-to-pdf": return imagesToPdf(inputs, options);
    case "watermark-pdf": return watermarkPdf(inputs[0], options, watermarkImage);
    case "add-page-numbers": return addPageNumbersPdf(inputs[0], options);
    case "header-footer-pdf": return headerFooterPdf(inputs[0], options);
    case "crop-pdf": return cropPdf(inputs[0], options);
    case "clean-pdf-metadata": return cleanPdfMetadata(inputs[0]);
    case "flatten-pdf": return flattenPdf(inputs[0]);
    case "txt-to-pdf": return txtToPdf(inputs[0], options);
    case "pdf-to-png":
    case "pdf-to-webp":
    case "extract-images-from-pdf":
    case "pdf-to-text":
    case "pdf-to-html":
    case "pdf-metadata-viewer": throw new Error(`The ${tool} operation is handled by the PDF.js extraction path.`);
    default: throw new Error(`Unsupported PDF operation: ${tool}`);
  }
};

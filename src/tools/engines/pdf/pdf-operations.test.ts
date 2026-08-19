import { readFileSync } from "node:fs";
import { join } from "node:path";
import { degrees, PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { asPdfProcessingError } from "./errors";
import { getPdfOutputName, isPdfSignature, parsePageGroups } from "./options";
import { runPdfOperation, type PdfOperationInput } from "./pdf-operations";

const onePixelPng = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="), (character) => character.charCodeAt(0));

const createPdf = async (pageSizes: Array<[number, number]>, rotations: number[] = []) => {
  const document = await PDFDocument.create();
  pageSizes.forEach((size, index) => {
    const page = document.addPage(size);
    if (rotations[index]) page.setRotation(degrees(rotations[index]));
  });
  return new Uint8Array(await document.save());
};

const pdfInput = (bytes: Uint8Array, name = "source.pdf"): PdfOperationInput => ({
  name,
  mime: "application/pdf",
  bytes,
});

const pageSizes = (bytes: Uint8Array) => PDFDocument.load(bytes).then((document) => document.getPages().map((page) => {
  const { width, height } = page.getSize();
  return [width, height] as [number, number];
}));

describe("shared PDF operations", () => {
  it("merges PDFs in input and source-page order", async () => {
    const first = await createPdf([[100, 200], [200, 100]]);
    const second = await createPdf([[300, 400]]);
    const [output] = await runPdfOperation("merge-pdf", [pdfInput(first, "first.pdf"), pdfInput(second, "second.pdf")], {});

    expect(isPdfSignature(output.bytes)).toBe(true);
    expect(output.pageCount).toBe(3);
    await expect(pageSizes(output.bytes)).resolves.toEqual([[100, 200], [200, 100], [300, 400]]);
  });

  it("splits selected ranges into separate PDFs", async () => {
    const source = await createPdf([[100, 100], [200, 200], [300, 300], [400, 400]]);
    const outputs = await runPdfOperation("split-pdf", [pdfInput(source)], { pageSelection: "1-2, 4" });

    expect(outputs).toHaveLength(2);
    expect(outputs.map((output) => output.pageCount)).toEqual([2, 1]);
    await expect(pageSizes(outputs[0].bytes)).resolves.toEqual([[100, 100], [200, 200]]);
    await expect(pageSizes(outputs[1].bytes)).resolves.toEqual([[400, 400]]);
  });

  it("organizes pages with reorder, delete, and duplicate semantics", async () => {
    const source = await createPdf([[100, 100], [200, 200], [300, 300]]);
    const [output] = await runPdfOperation("organize-pdf", [pdfInput(source)], { organizeOrder: [3, 1, 1] });

    expect(output.pageCount).toBe(3);
    await expect(pageSizes(output.bytes)).resolves.toEqual([[300, 300], [100, 100], [100, 100]]);
  });

  it("rotates only the selected pages and preserves existing rotation values", async () => {
    const source = await createPdf([[100, 100], [200, 200]], [90, 0]);
    const [output] = await runPdfOperation("rotate-pdf", [pdfInput(source)], { rotation: 270, rotationScope: "2" });
    const document = await PDFDocument.load(output.bytes);

    expect(document.getPage(0).getRotation().angle).toBe(90);
    expect(document.getPage(1).getRotation().angle).toBe(270);
  });

  it("creates one PDF page per input image with the requested page format", async () => {
    const image = { name: "pixel.png", mime: "image/png", bytes: onePixelPng };
    const [output] = await runPdfOperation("png-to-pdf", [image, { ...image, name: "pixel-2.png" }], { pageSize: "a4", pageOrientation: "portrait" });
    const document = await PDFDocument.load(output.bytes);

    expect(isPdfSignature(output.bytes)).toBe(true);
    expect(output.pageCount).toBe(2);
    expect(document.getPageCount()).toBe(2);
    expect(document.getPage(0).getSize().width).toBeCloseTo(595.28, 1);
  });

  it("keeps watermark output as a valid, same-page-count PDF", async () => {
    const source = await createPdf([[300, 400], [500, 600]]);
    const [textOutput] = await runPdfOperation("watermark-pdf", [pdfInput(source)], {
      watermarkMode: "text",
      watermarkText: "Local copy",
      watermarkPlacement: "bottom-right",
      watermarkOpacity: 50,
    });
    const [imageOutput] = await runPdfOperation("watermark-pdf", [pdfInput(source)], {
      watermarkMode: "image",
      watermarkPlacement: "center",
      watermarkScale: 0.3,
    }, { name: "watermark.png", mime: "image/png", bytes: onePixelPng });

    expect(isPdfSignature(textOutput.bytes)).toBe(true);
    expect(isPdfSignature(imageOutput.bytes)).toBe(true);
    expect((await PDFDocument.load(textOutput.bytes)).getPageCount()).toBe(2);
    expect((await PDFDocument.load(imageOutput.bytes)).getPageCount()).toBe(2);
  });

  it("keeps each focused image-to-PDF operation on the shared PDF path", async () => {
    const jpg = { name: "photo.jpg", mime: "image/jpeg", bytes: new Uint8Array(readFileSync(join(process.cwd(), "tests", "fixtures", "compression-photo.jpg"))) };
    const png = { name: "pixel.png", mime: "image/png", bytes: onePixelPng };
    for (const [tool, input] of [["jpg-to-pdf", jpg], ["png-to-pdf", png]] as const) {
      const [output] = await runPdfOperation(tool, [input], {});
      expect(isPdfSignature(output.bytes)).toBe(true);
      expect(output.pageCount).toBe(1);
    }
  });

  it("adds page numbers and header/footer overlays without changing page count", async () => {
    const source = await createPdf([[300, 400], [500, 600]]);
    const [numbered] = await runPdfOperation("add-page-numbers", [pdfInput(source)], { pageNumberStart: 7, pageNumberPlacement: "bottom-right" });
    const [furnished] = await runPdfOperation("header-footer-pdf", [pdfInput(source)], { headerText: "Report {{page}}/{{pages}}", footerText: "Internal", headerFooterScope: "1" });

    expect(isPdfSignature(numbered.bytes)).toBe(true);
    expect(isPdfSignature(furnished.bytes)).toBe(true);
    expect(numbered.pageCount).toBe(2);
    expect(furnished.pageCount).toBe(2);
    expect(numbered.bytes.byteLength).toBeGreaterThan(source.byteLength);
    expect(furnished.bytes.byteLength).toBeGreaterThan(source.byteLength);
  });

  it("applies a conservative crop box and removes supported PDF metadata", async () => {
    const document = await PDFDocument.create();
    document.setTitle("Private title");
    document.setAuthor("Fixture author");
    document.addPage([300, 400]);
    const source = new Uint8Array(await document.save());
    const [cropped] = await runPdfOperation("crop-pdf", [pdfInput(source)], { cropMargin: 24 });
    const croppedDocument = await PDFDocument.load(cropped.bytes);
    const croppedPage = croppedDocument.getPage(0);
    expect(croppedPage.getCropBox()).toMatchObject({ width: 252, height: 352 });

    const [cleaned] = await runPdfOperation("clean-pdf-metadata", [pdfInput(source)], {});
    const cleanedDocument = await PDFDocument.load(cleaned.bytes);
    expect(cleanedDocument.getTitle()).toBeUndefined();
    expect(cleanedDocument.getAuthor()).toBeUndefined();
    expect(cleaned.pageCount).toBe(1);
  });

  it("flattens a supported form and creates selectable PDF text from UTF-8 TXT", async () => {
    const formDocument = await PDFDocument.create();
    const page = formDocument.addPage([300, 200]);
    const field = formDocument.getForm().createTextField("fixture-name");
    field.setText("Ada");
    field.addToPage(page, { x: 24, y: 120, width: 180, height: 24 });
    const formSource = new Uint8Array(await formDocument.save());
    const [flattened] = await runPdfOperation("flatten-pdf", [pdfInput(formSource)], {});
    const flattenedDocument = await PDFDocument.load(flattened.bytes);
    expect(flattenedDocument.getForm().getFields()).toHaveLength(0);
    expect(flattened.pageCount).toBe(1);

    const [textPdf] = await runPdfOperation("txt-to-pdf", [{ name: "notes.txt", mime: "text/plain", bytes: new TextEncoder().encode("Heading\nSecond line") }], { pageSize: "letter", textFontSize: 12 });
    const textDocument = await PDFDocument.load(textPdf.bytes);
    expect(isPdfSignature(textPdf.bytes)).toBe(true);
    expect(textPdf.pageCount).toBe(1);
    expect(textDocument.getPage(0).getWidth()).toBeCloseTo(612, 0);
  });
});

describe("PDF validation helpers", () => {
  it("rejects invalid signatures and malformed page selections", () => {
    expect(isPdfSignature(new Uint8Array([0x00, 0x01]))).toBe(false);
    expect(() => parsePageGroups("1-4", 3)).toThrow(/1–3/);
    expect(() => parsePageGroups("3-1", 3)).toThrow(/must start before/);
    expect(getPdfOutputName("folder/report.pdf", "split-pdf", 1)).toBe("folder-report-split-2.pdf");
  });

  it("maps encrypted and invalid PDF failures to stable user-facing errors", () => {
    expect(asPdfProcessingError(new Error("This PDF is encrypted")).code).toBe("ENCRYPTED_PDF_UNSUPPORTED");
    expect(asPdfProcessingError(Object.assign(new Error("parse failed"), { name: "InvalidPDFException" })).code).toBe("CORRUPT_FILE");
  });
});

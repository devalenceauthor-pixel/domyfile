import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const fixtureDirectory = join(projectRoot, "tests", "fixtures");
const temporaryDirectory = join(fixtureDirectory, ".pdf-compression-spike");
const reportPath = join(projectRoot, "reports", "pdf-compression-spike.json");

const readFixture = (name) => readFile(join(fixtureDirectory, name));

const savePdf = async (document, outputPath) => {
  const bytes = await document.save({ useObjectStreams: true, addDefaultPage: false });
  await writeFile(outputPath, bytes);
  return new Uint8Array(bytes);
};

const createTextHeavyFixture = async () => {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const paragraph = "DoMyFile keeps document processing local in the browser. This repeated sentence represents selectable office text, headings, labels, and structured paragraphs that should survive a lossless PDF rewrite.";
  for (let pageIndex = 0; pageIndex < 12; pageIndex += 1) {
    const page = document.addPage([612, 792]);
    page.drawText(`Text-heavy fixture · page ${pageIndex + 1}`, { x: 48, y: 742, size: 18, font, color: rgb(0.1, 0.2, 0.4) });
    for (let line = 0; line < 62; line += 1) {
      page.drawText(`${line + 1}. ${paragraph}`, { x: 48, y: 712 - line * 10.4, size: 8.2, font, color: rgb(0.12, 0.12, 0.16), maxWidth: 516 });
    }
  }
  return document;
};

const createImageHeavyFixture = async (photoBytes, gradientBytes) => {
  const document = await PDFDocument.create();
  for (let pageIndex = 0; pageIndex < 6; pageIndex += 1) {
    const page = document.addPage([612, 792]);
    const image = await document.embedJpg(pageIndex % 2 === 0 ? photoBytes : gradientBytes);
    const scale = Math.min(540 / image.width, 700 / image.height);
    page.drawImage(image, { x: (612 - image.width * scale) / 2, y: 46, width: image.width * scale, height: image.height * scale });
  }
  return document;
};

const createMixedFixture = async (photoBytes, gradientBytes) => {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let pageIndex = 0; pageIndex < 8; pageIndex += 1) {
    const page = document.addPage([612, 792]);
    page.drawText(`Mixed-content fixture · page ${pageIndex + 1}`, { x: 48, y: 744, size: 18, font, color: rgb(0.1, 0.2, 0.4) });
    page.drawText("Selectable text remains part of this mixed page while the lower panel contains a compressed photograph.", { x: 48, y: 714, size: 10, font, color: rgb(0.12, 0.12, 0.16), maxWidth: 516 });
    const image = await document.embedJpg(pageIndex % 2 === 0 ? photoBytes : gradientBytes);
    const scale = Math.min(516 / image.width, 560 / image.height);
    page.drawImage(image, { x: (612 - image.width * scale) / 2, y: 72, width: image.width * scale, height: image.height * scale });
  }
  return document;
};

const createAlreadyOptimizedFixture = async (photoBytes) => {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage([612, 792]);
  page.drawText("Already-optimized fixture", { x: 48, y: 744, size: 18, font, color: rgb(0.1, 0.2, 0.4) });
  page.drawText("This small PDF is already written with object streams and a pre-compressed JPEG.", { x: 48, y: 714, size: 10, font, color: rgb(0.12, 0.12, 0.16), maxWidth: 516 });
  const image = await document.embedJpg(photoBytes);
  const scale = Math.min(516 / image.width, 560 / image.height);
  page.drawImage(image, { x: (612 - image.width * scale) / 2, y: 72, width: image.width * scale, height: image.height * scale });
  return document;
};

const runCommand = (command, args) => new Promise((resolveCommand, rejectCommand) => {
  const child = spawn(command, args, { windowsHide: true });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  child.on("error", rejectCommand);
  child.on("close", (code) => code === 0 ? resolveCommand() : rejectCommand(new Error(`${command} failed (${code}): ${stderr}`)));
});

const readPdfMetrics = async (bytes) => {
  const document = await PDFDocument.load(bytes);
  let textItems = 0;
  const standardFontDataUrl = `${join(projectRoot, "node_modules", "pdfjs-dist", "standard_fonts").replaceAll("\\\\", "/")}/`;
  const task = pdfjsLib.getDocument({ data: bytes, disableWorker: true, standardFontDataUrl });
  const parsed = await task.promise;
  for (let pageNumber = 1; pageNumber <= parsed.numPages; pageNumber += 1) {
    const page = await parsed.getPage(pageNumber);
    textItems += (await page.getTextContent()).items.length;
    page.cleanup();
  }
  await parsed.cleanup();
  await task.destroy();
  return { valid: document.getPageCount() > 0, pageCount: document.getPageCount(), textItems };
};

const rewritePdf = async (inputBytes, useObjectStreams) => {
  const document = await PDFDocument.load(inputBytes);
  return new Uint8Array(await document.save({ useObjectStreams, addDefaultPage: false }));
};

const rasterizeProxy = async (inputPath, inputBytes, quality = 75) => {
  await rm(temporaryDirectory, { recursive: true, force: true });
  await mkdir(temporaryDirectory, { recursive: true });
  const prefix = join(temporaryDirectory, "page");
  await runCommand("pdftocairo", ["-jpeg", "-r", "120", "-jpegopt", `quality=${quality}`, inputPath, prefix]);
  const source = await PDFDocument.load(inputBytes);
  const output = await PDFDocument.create();
  const files = [];
  for (let index = 0; index < source.getPageCount(); index += 1) {
    const pageNumber = String(index + 1).padStart(String(source.getPageCount()).length, "0");
    const imagePathForPage = `${prefix}-${pageNumber}.jpg`;
    const imageBytes = await readFile(imagePathForPage);
    files.push(imagePathForPage);
    const image = await output.embedJpg(imageBytes);
    const sourceSize = source.getPage(index).getSize();
    const page = output.addPage([sourceSize.width, sourceSize.height]);
    page.drawImage(image, { x: 0, y: 0, width: sourceSize.width, height: sourceSize.height });
  }
  const bytes = new Uint8Array(await output.save({ useObjectStreams: true, addDefaultPage: false }));
  await rm(temporaryDirectory, { recursive: true, force: true });
  return bytes;
};

const benchmark = async (name, inputPath, inputBytes, strategy, operation) => {
  const before = process.memoryUsage().rss;
  const started = performance.now();
  const outputBytes = await operation();
  const elapsedMs = performance.now() - started;
  const after = process.memoryUsage().rss;
  const outputSize = outputBytes.length;
  const metrics = await readPdfMetrics(outputBytes.slice());
  return {
    fixture: name,
    strategy,
    inputBytes: inputBytes.length,
    outputBytes: outputSize,
    reductionPercent: Number((((inputBytes.length - outputSize) / inputBytes.length) * 100).toFixed(2)),
    elapsedMs: Number(elapsedMs.toFixed(1)),
    rssDeltaMb: Number(((after - before) / 1024 / 1024).toFixed(1)),
    ...metrics,
  };
};

await mkdir(join(projectRoot, "reports"), { recursive: true });
await mkdir(fixtureDirectory, { recursive: true });
const photoBytes = await readFixture("compression-photo.jpg");
const gradientBytes = await readFixture("compression-gradient.jpg");
const fixtures = [
  ["text-heavy", "compress-text-heavy.pdf", await createTextHeavyFixture()],
  ["image-heavy", "compress-image-heavy.pdf", await createImageHeavyFixture(photoBytes, gradientBytes)],
  ["mixed-content", "compress-mixed-content.pdf", await createMixedFixture(photoBytes, gradientBytes)],
  ["already-optimized", "compress-already-optimized.pdf", await createAlreadyOptimizedFixture(photoBytes)],
];

const fixtureData = [];
for (const [name, fileName, document] of fixtures) {
  const path = join(fixtureDirectory, fileName);
  const bytes = await savePdf(document, path);
  fixtureData.push({ name, fileName, path, bytes });
}

const results = [];
for (const fixture of fixtureData) {
  results.push(await benchmark(fixture.name, fixture.path, fixture.bytes, "pdf-lib rewrite / object streams", () => rewritePdf(fixture.bytes, true)));
  results.push(await benchmark(fixture.name, fixture.path, fixture.bytes, "pdf-lib rewrite / no object streams", () => rewritePdf(fixture.bytes, false)));
  results.push(await benchmark(fixture.name, fixture.path, fixture.bytes, "raster proxy / JPEG quality 75", () => rasterizeProxy(fixture.path, fixture.bytes, 75)));
}

await writeFile(reportPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  note: "Raster proxy uses Poppler for benchmark-only page rasterization; the product's browser equivalent would use PDF.js canvas rendering. It is not a production dependency or shipped path.",
  fixtures: fixtureData.map(({ name, fileName, bytes }) => ({ name, fileName, bytes: bytes.length })),
  results,
}, null, 2));
console.table(results);
console.log(`Report: ${reportPath}`);

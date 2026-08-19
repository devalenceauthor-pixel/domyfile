import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow } from "docx";
import { expect, test, type Page } from "@playwright/test";

const fixture = (relativePath: string) => join(process.cwd(), "tests", "fixtures", relativePath);
const downloadResult = async (page: Page, prefix: string) => {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    page.locator("[data-download-all]").click(),
  ]);
  const outputPath = join(process.cwd(), "test-results", `${prefix}-${Date.now()}-${download.suggestedFilename()}`);
  await download.saveAs(outputPath);
  return { name: download.suggestedFilename(), bytes: await readFile(outputPath) };
};

const downloadNamedResult = async (page: Page, name: string, prefix: string) => {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    page.locator(`[data-result-download][download="${name}"]`).click(),
  ]);
  const outputPath = join(process.cwd(), "test-results", `${prefix}-${Date.now()}-${download.suggestedFilename()}`);
  await download.saveAs(outputPath);
  return { name: download.suggestedFilename(), bytes: await readFile(outputPath) };
};

const isZip = (bytes: Buffer) => bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
const isPng = (bytes: Buffer) => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

const crc32 = (bytes: Buffer) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const pngChunk = (type: string, data: Buffer) => {
  const typeBytes = Buffer.from(type, "ascii");
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  return Buffer.concat([length, typeBytes, data, checksum]);
};

const transparentPng = () => {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
  const scanline = Buffer.from([0, 255, 255, 255, 0]);
  return Buffer.concat([header, pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(scanline)), pngChunk("IEND", Buffer.alloc(0))]);
};

const makeSyntheticPng = async (page: Page, variant: "clean-object" | "soft-edge-subject") => {
  const values = await page.evaluate(async (kind) => {
    const canvas = document.createElement("canvas");
    canvas.width = kind === "clean-object" ? 256 : 512;
    canvas.height = kind === "clean-object" ? 256 : 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable in the test browser.");

    if (kind === "clean-object") {
      context.fillStyle = "#dbeafe";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#f97316";
      context.beginPath();
      context.roundRect(64, 46, 128, 164, 18);
      context.fill();
      context.fillStyle = "#7c3aed";
      context.beginPath();
      context.arc(128, 128, 34, 0, Math.PI * 2);
      context.fill();
    } else {
      const background = context.createLinearGradient(0, 0, 512, 512);
      background.addColorStop(0, "#e0f2fe");
      background.addColorStop(1, "#cbd5e1");
      context.fillStyle = background;
      context.fillRect(0, 0, 512, 512);
      context.fillStyle = "#1e293b";
      context.beginPath();
      context.arc(256, 166, 66, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#f0b48b";
      context.beginPath();
      context.arc(256, 180, 48, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#334155";
      context.beginPath();
      context.roundRect(164, 242, 184, 214, 34);
      context.fill();
      context.strokeStyle = "#111827";
      context.lineWidth = 5;
      context.lineCap = "round";
      for (let index = 0; index < 18; index += 1) {
        const x = 204 + index * 6;
        context.beginPath();
        context.moveTo(x, 128 + (index % 3) * 4);
        context.quadraticCurveTo(x - 16, 82 - (index % 4) * 3, x - 8, 52 + (index % 5) * 6);
        context.stroke();
      }
    }

    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG encoding failed.")), "image/png"));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, variant);
  return Buffer.from(values);
};

const createDocxFixture = async () => {
  const image = await readFile(fixture("compression-photo.jpg"));
  const document = new Document({
    creator: "DoMyFile fixture author",
    title: "Quarterly notes fixture",
    sections: [{ children: [
      new Paragraph({ text: "Quarterly notes", heading: HeadingLevel.HEADING_1 }),
      new Paragraph("A readable paragraph."),
      new Paragraph({ text: "A representative list item.", bullet: { level: 0 } }),
      new Table({ rows: [new TableRow({ children: [
        new TableCell({ children: [new Paragraph("Metric")] }),
        new TableCell({ children: [new Paragraph("Value")] }),
      ] }), new TableRow({ children: [
        new TableCell({ children: [new Paragraph("Processed")] }),
        new TableCell({ children: [new Paragraph("Local")] }),
      ] })] }),
      new Paragraph({ children: [new ImageRun({ type: "jpg", data: image, transformation: { width: 180, height: 120 } })] }),
    ] }],
  });
  return Buffer.from(await Packer.toBuffer(document));
};

test.describe("new Word and image tools", () => {
  test("Word routes create the claimed outputs and reset cleanly", async ({ page }) => {
    const docxBuffer = await createDocxFixture();

    await page.goto("/word/docx-to-txt/");
    await expect(page.locator("[data-file-input]")).toHaveAttribute("accept", ".docx");
    await page.locator("[data-file-input]").setInputFiles({ name: "quarterly-notes.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: docxBuffer });
    await expect(page.locator("[data-file-list]")).toContainText("quarterly-notes.docx");
    await page.locator("[data-process-button]").click();
    await expect(page.locator("[data-result-card]")).toBeVisible();
    const txt = await downloadResult(page, "word-txt");
    expect(txt.name).toBe("quarterly-notes-text.txt");
    expect(txt.bytes.toString("utf8")).toContain("Quarterly notes");

    await page.locator("[data-process-another]").click();
    await expect(page.locator("[data-result-card]")).toBeHidden();
    await expect(page.locator("[data-file-list-wrap]")).toBeHidden();

    await page.goto("/word/docx-to-html/");
    await page.locator("[data-file-input]").setInputFiles({ name: "quarterly-notes.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: docxBuffer });
    await page.locator("[data-process-button]").click();
    await expect(page.locator("[data-result-card]")).toBeVisible();
    const html = await downloadResult(page, "word-html");
    expect(html.name).toBe("quarterly-notes-html.html");
    expect(html.bytes.toString("utf8")).toContain("<body>");
    expect(html.bytes.toString("utf8")).toContain("Quarterly notes");

    await page.goto("/word/txt-to-docx/");
    await expect(page.locator("[data-file-input]")).toHaveAttribute("accept", ".txt");
    await page.locator("[data-file-input]").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Heading\nSecond line\n\nFinal line") });
    await page.locator("[data-process-button]").click();
    await expect(page.locator("[data-result-card]")).toBeVisible();
    const docx = await downloadResult(page, "word-docx");
    expect(docx.name).toBe("notes.docx");
    expect(isZip(docx.bytes)).toBe(true);

    await page.locator("[data-process-another]").click();
    await page.locator("[data-file-input]").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("repeat") });
    await page.locator("[data-remove-index='0']").click();
    await expect(page.locator("[data-file-list-wrap]")).toBeHidden();
    await expect(page.locator("[data-process-button]")).toBeDisabled();
  });

  test("Word routes reject corrupt and unsupported input clearly", async ({ page }) => {
    await page.goto("/word/docx-to-txt/");
    await page.locator("[data-file-input]").setInputFiles({ name: "legacy.doc", mimeType: "application/msword", buffer: Buffer.from("legacy") });
    await expect(page.locator("[data-file-error]")).toContainText("not supported");
    await page.locator("[data-file-input]").setInputFiles({ name: "broken.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from("not a zip") });
    await page.locator("[data-process-button]").click();
    await expect(page.locator("[data-workspace-status].status--error")).toContainText("readable DOCX");
  });

  test("remaining Word routes preserve their focused output contracts", async ({ page }) => {
    test.setTimeout(240_000);
    const docxBuffer = await createDocxFixture();

    await page.goto("/word/html-to-docx/");
    await page.locator("[data-file-input]").setInputFiles({ name: "article.html", mimeType: "text/html", buffer: Buffer.from("<h1>Heading</h1><p>Readable <strong>HTML</strong>.</p><ul><li>One</li></ul><table><tr><td>Cell</td></tr></table><script>throw new Error()</script>") });
    await page.locator("[data-process-button]").click();
    await expect(page.locator("[data-result-card]")).toBeVisible();
    const htmlDocx = await downloadResult(page, "word-html-docx");
    expect(htmlDocx.name).toBe("article.docx");
    expect(isZip(htmlDocx.bytes)).toBe(true);

    await page.goto("/word/merge-docx/");
    await page.locator("[data-file-input]").setInputFiles([
      { name: "first.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: docxBuffer },
      { name: "second.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: docxBuffer },
    ]);
    await expect(page.locator("[data-file-list] li")).toHaveCount(2);
    await page.locator("[data-process-button]").click();
    await expect(page.locator("[data-result-card]")).toBeVisible();
    const merged = await downloadResult(page, "word-merge");
    expect(merged.name).toBe("first-merged.docx");
    expect(isZip(merged.bytes)).toBe(true);

    await page.goto("/word/extract-images-from-docx/");
    await page.locator("[data-file-input]").setInputFiles({ name: "quarterly-notes.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: docxBuffer });
    await page.locator("[data-process-button]").click();
    await expect(page.locator("[data-result-card]")).toBeVisible();
    await expect(page.locator("[data-result-download]")).toHaveCount(2);
    const extracted = await downloadNamedResult(page, "quarterly-notes-image-01.jpg", "word-extract-image");
    expect(extracted.name).toBe("quarterly-notes-image-01.jpg");
    expect(extracted.bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true);
    const extractedZip = await downloadNamedResult(page, "quarterly-notes-images.zip", "word-extract-zip");
    expect(extractedZip.name).toBe("quarterly-notes-images.zip");
    expect(isZip(extractedZip.bytes)).toBe(true);

    await page.goto("/word/compress-docx/");
    await page.locator("[data-file-input]").setInputFiles({ name: "quarterly-notes.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: docxBuffer });
    await page.locator("[data-process-button]").click();
    await expect(page.locator("[data-result-card]")).toBeVisible();
    const compressed = await downloadResult(page, "word-compress");
    expect(compressed.name).toBe("quarterly-notes-compressed.docx");
    expect(isZip(compressed.bytes)).toBe(true);
    expect(compressed.bytes.length).toBeLessThan(docxBuffer.length);

    await page.goto("/word/docx-metadata-cleaner/");
    await page.locator("[data-file-input]").setInputFiles({ name: "quarterly-notes.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: docxBuffer });
    await page.locator("[data-process-button]").click();
    await expect(page.locator("[data-result-card]")).toBeVisible();
    const cleaned = await downloadResult(page, "word-metadata");
    expect(cleaned.name).toBe("quarterly-notes-cleaned.docx");
    expect(isZip(cleaned.bytes)).toBe(true);

    await page.locator("[data-process-another]").click();
    await expect(page.locator("[data-result-card]")).toBeHidden();
    await expect(page.locator("[data-file-list-wrap]")).toBeHidden();
  });

  test("Image Upscaler uses the model-backed fixed 3x route", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/image/upscale-image/");
    await expect(page.locator("[data-file-input]")).toHaveAttribute("accept", ".jpg,.jpeg,.png,.webp");
    await page.locator("[data-file-input]").setInputFiles(fixture("one-pixel.png"));
    await page.locator("[data-process-button]").click();
    await expect(page.locator("[data-result-card]")).toBeVisible({ timeout: 180_000 });
    const output = await downloadResult(page, "upscale-image");
    expect(output.name).toBe("one-pixel-upscaled-3x.png");
    expect(isPng(output.bytes)).toBe(true);
    const dimensions = await page.evaluate(async (values) => {
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(values)], { type: "image/png" }));
      const result = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return result;
    }, Array.from(output.bytes));
    expect(dimensions).toEqual({ width: 3, height: 3 });

    await page.locator("[data-process-another]").click();
    await expect(page.locator("[data-result-card]")).toBeHidden();
    await page.locator("[data-file-input]").setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
    await page.locator("[data-process-button]").click();
    await expect(page.locator("[data-workspace-status].status--error")).toContainText("readable JPG, PNG, or WebP");
  });

  test("Remove Background uses the temporary native flow and returns a transparent PNG", async ({ page }) => {
    test.setTimeout(120_000);
    const serverRequests: string[] = [];
    const outputBytes = transparentPng();
    let expectedInputMime = "";
    let invalidJob = false;
    await page.route("**/__server-fallback/**", async (route) => {
      const request = route.request();
      const url = request.url();
      serverRequests.push(`${request.method()} ${new URL(url).pathname}`);
      if (url.endsWith("/v1/jobs") && request.method() === "POST") {
        const body = request.postDataJSON() as Record<string, unknown>;
        expect(body.toolId).toBe("IMG-12");
        expect(["image/jpeg", "image/png", "image/webp"]).toContain(body.inputMime);
        expectedInputMime = String(body.inputMime);
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ jobId: "background-job", accessToken: "temporary-token", uploadUrl: "/__server-fallback/upload/background-job", expiresAt: "2026-08-19T00:15:00.000Z" }) });
      }
      if (url.endsWith("/upload/background-job") && request.method() === "PUT") {
        expect(request.headers()["content-type"]).toBe(expectedInputMime);
        const payload = request.postDataBuffer() ?? Buffer.alloc(0);
        const isJpeg = payload.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
        const isPng = payload.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        const isWebp = payload.subarray(0, 4).toString("ascii") === "RIFF" && payload.subarray(8, 12).toString("ascii") === "WEBP";
        invalidJob = !isJpeg && !isPng && !isWebp;
        return route.fulfill({ status: 202, body: "" });
      }
      if (url.endsWith("/v1/jobs/background-job") && request.method() === "GET") {
        if (invalidJob) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jobId: "background-job", status: "error", code: "CORRUPT_FILE", expiresAt: "2026-08-19T00:15:00.000Z" }) });
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jobId: "background-job", status: "ready", expiresAt: "2026-08-19T00:15:00.000Z", result: { inputBytes: 129598, outputBytes: outputBytes.length, savingsPercent: 0, outputMime: "image/png", outputFormat: "PNG" } }) });
      }
      if (url.endsWith("/v1/jobs/background-job/download") && request.method() === "GET") {
        return route.fulfill({ status: 200, contentType: "image/png", body: outputBytes });
      }
      if (url.endsWith("/v1/jobs/background-job") && request.method() === "DELETE") return route.fulfill({ status: 204, body: "" });
      return route.continue();
    });
    await page.goto("/image/remove-background/");
    await expect(page.locator("[data-file-input]")).toHaveAttribute("accept", ".jpg,.jpeg,.png,.webp");
    await page.locator("[data-file-input]").setInputFiles(fixture("compression-photo.jpg"));
    await expect(page.locator("[data-background-removal-preview]")).toBeVisible();
    await expect(page.locator("[data-background-original]")).toBeVisible();
    await expect(page.locator("[data-background-processed-placeholder]")).toBeVisible();
    await page.locator("[data-process-button]").click();
    await expect(page.locator("[data-result-card]")).toBeVisible({ timeout: 240_000 });
    await expect(page.locator("[data-background-processed]")).toBeVisible();
    await expect(page.locator(".background-removal-checkerboard")).toBeVisible();
    const output = await downloadResult(page, "remove-background");
    expect(output.name).toBe("compression-photo-no-background.png");
    expect(isPng(output.bytes)).toBe(true);
    const alpha = await page.evaluate(async (values) => {
      const blob = new Blob([Uint8Array.from(values)], { type: "image/png" });
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (!context) return { width: bitmap.width, height: bitmap.height, hasTransparency: false };
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      return { width: canvas.width, height: canvas.height, hasTransparency: Array.from(pixels).some((value, index) => index % 4 === 3 && value < 255) };
    }, Array.from(output.bytes));
    expect(alpha.width).toBeGreaterThan(0);
    expect(alpha.height).toBeGreaterThan(0);
    expect(alpha.hasTransparency).toBe(true);
    expect(serverRequests.some((request) => request.startsWith("POST /__server-fallback/v1/jobs"))).toBe(true);
    expect(serverRequests.some((request) => request.startsWith("PUT /__server-fallback/upload/background-job"))).toBe(true);

    await page.locator("[data-process-another]").click();
    await expect(page.locator("[data-background-removal-preview]")).toBeHidden();
    await expect(page.locator("[data-result-card]")).toBeHidden();

    const cleanObject = await makeSyntheticPng(page, "clean-object");
    await page.locator("[data-file-input]").setInputFiles({ name: "clean-object.png", mimeType: "image/png", buffer: cleanObject });
    await page.locator("[data-process-button]").click();
    await expect(page.locator("[data-background-processed]")).toBeVisible({ timeout: 120_000 });
    await expect(page.locator("[data-result-card]")).toBeVisible();

    await page.locator("[data-process-another]").click();
    await page.locator("[data-file-input]").setInputFiles(fixture("one-pixel.png"));
    await expect(page.locator("[data-background-original]")).toBeVisible();
    await page.locator("[data-remove-index='0']").click();
    await expect(page.locator("[data-file-list-wrap]")).toBeHidden();

    const softEdgeSubject = await makeSyntheticPng(page, "soft-edge-subject");
    await page.locator("[data-file-input]").setInputFiles({ name: "soft-edge-subject.png", mimeType: "image/png", buffer: softEdgeSubject });
    await page.locator("[data-process-button]").click();
    await expect(page.locator("[data-background-processed]")).toBeVisible({ timeout: 120_000 });
    await expect(page.locator("[data-result-card]")).toBeVisible();

    await page.locator("[data-process-another]").click();
    await page.locator("[data-file-input]").setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
    await page.locator("[data-process-button]").click();
    await expect(page.locator("[data-workspace-status].status--error")).toContainText("uncorrupted copy");
  });

  test("Remove Background rejects unsupported files before model loading", async ({ page }) => {
    await page.goto("/image/remove-background/");
    await page.locator("[data-file-input]").setInputFiles({ name: "animated.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") });
    await expect(page.locator("[data-file-error]")).toContainText("not supported");
    await expect(page.locator("[data-process-button]")).toBeDisabled();
  });
});

test.describe("new PDF suite tools", () => {
  test("renders PDF pages to PNG/WebP and packages selected pages as ZIP", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/pdf/pdf-to-png/");
    await page.locator("[data-file-input]").setInputFiles(fixture("multi-page.pdf"));
    await page.locator("#pageSelection").fill("1-2");
    await page.locator("[data-process-button]").click();
    await expect(page.locator("[data-result-card]")).toBeVisible({ timeout: 120_000 });
    await expect(page.locator("[data-result-download]")).toHaveCount(2);
    const pngZip = await downloadResult(page, "pdf-png");
    expect(pngZip.name).toBe("pdf-to-png.zip");
    expect(isZip(pngZip.bytes)).toBe(true);

    await page.goto("/pdf/pdf-to-webp/");
    await page.locator("[data-file-input]").setInputFiles(fixture("single-page.pdf"));
    await page.locator("#pageSelection").fill("all");
    await page.locator("[data-process-button]").click();
    await expect(page.locator("[data-result-card]")).toBeVisible({ timeout: 120_000 });
    const webpZip = await downloadResult(page, "pdf-webp");
    expect(webpZip.name).toBe("pdf-to-webp.zip");
    expect(isZip(webpZip.bytes)).toBe(true);
  });

  test("extracts selectable text, creates TXT PDFs, and preserves valid PDF output", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/pdf/pdf-to-text/");
    await page.locator("[data-file-input]").setInputFiles(fixture("single-page.pdf"));
    await page.locator("[data-process-button]").click();
    await expect(page.locator("[data-result-card]")).toBeVisible({ timeout: 120_000 });
    const text = await downloadResult(page, "pdf-text");
    expect(text.name).toBe("single-page-text.txt");
    expect(text.bytes.toString("utf8")).toContain("Single page");

    await page.goto("/pdf/txt-to-pdf/");
    await page.locator("[data-file-input]").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Heading\nSecond line\nFinal line") });
    await page.locator("[data-process-button]").click();
    await expect(page.locator("[data-result-card]")).toBeVisible({ timeout: 120_000 });
    const pdf = await downloadResult(page, "txt-pdf");
    expect(pdf.name).toBe("notes-pdf.pdf");
    expect(pdf.bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");

    await page.goto("/pdf/add-page-numbers/");
    await page.locator("[data-file-input]").setInputFiles(fixture("multi-page.pdf"));
    await page.locator("#pageNumberStart").fill("9");
    await page.locator("[data-process-button]").click();
    await expect(page.locator("[data-result-card]")).toBeVisible({ timeout: 120_000 });
    const numbered = await downloadResult(page, "pdf-numbered");
    expect(numbered.name).toBe("multi-page-numbered.pdf");
    expect(numbered.bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  test("extracts embedded images and rejects corrupt PDF input", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/pdf/extract-images-from-pdf/");
    await page.locator("[data-file-input]").setInputFiles(fixture("compress-image-heavy.pdf"));
    await page.locator("[data-process-button]").click();
    await expect(page.locator("[data-result-card]")).toBeVisible({ timeout: 120_000 });
    await expect(page.locator("[data-result-download]")).toHaveCount(6);
    const imageZip = await downloadResult(page, "pdf-images");
    expect(imageZip.name).toBe("extract-images-from-pdf.zip");
    expect(isZip(imageZip.bytes)).toBe(true);

    await page.goto("/pdf/pdf-to-text/");
    await page.locator("[data-file-input]").setInputFiles(fixture("invalid.pdf"));
    await page.locator("[data-process-button]").click();
    await expect(page.locator("[data-workspace-status].status--error")).toContainText("readable PDF");
  });

  test("runs focused PDF overlay, crop, HTML, metadata, and flatten flows", async ({ page }) => {
    test.setTimeout(240_000);
    const processPdfOutput = async (path: string, prefix: string) => {
      await page.goto(path);
      await page.locator("[data-file-input]").setInputFiles(fixture("multi-page.pdf"));
      await page.locator("[data-process-button]").click();
      await expect(page.locator("[data-result-card]")).toBeVisible({ timeout: 120_000 });
      return await downloadResult(page, prefix);
    };

    await page.goto("/pdf/header-footer-pdf/");
    await page.locator("#headerText").fill("Report {{page}}/{{pages}}");
    await page.locator("#footerText").fill("Internal copy");
    await page.locator("[data-file-input]").setInputFiles(fixture("multi-page.pdf"));
    await page.locator("[data-process-button]").click();
    await expect(page.locator("[data-result-card]")).toBeVisible({ timeout: 120_000 });
    const headerFooter = await downloadResult(page, "pdf-header-footer");
    expect(headerFooter.bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");

    for (const [path, prefix] of [["/pdf/crop-pdf/", "pdf-crop"], ["/pdf/clean-pdf-metadata/", "pdf-metadata-clean"], ["/pdf/flatten-pdf/", "pdf-flatten"]] as const) {
      const output = await processPdfOutput(path, prefix);
      expect(output.bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    }

    const html = await processPdfOutput("/pdf/pdf-to-html/", "pdf-html");
    expect(html.bytes.toString("utf8")).toContain("<!doctype html>");

    const metadata = await processPdfOutput("/pdf/pdf-metadata-viewer/", "pdf-metadata");
    expect(JSON.parse(metadata.bytes.toString("utf8"))).toMatchObject({ pageCount: 4 });
  });
});

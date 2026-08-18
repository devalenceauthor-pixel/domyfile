import { readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { test, expect, type Page } from "@playwright/test";

const execFileAsync = promisify(execFile);

const fixture = (relativePath: string) => join(process.cwd(), "tests", "fixtures", relativePath);

const readJpegDimensions = (bytes: Buffer) => {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("Output is not a JPEG");
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    const length = bytes.readUInt16BE(offset);
    if (sofMarkers.has(marker)) return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    offset += length;
  }
  throw new Error("JPEG dimensions not found");
};

const readPngDimensions = (bytes: Buffer) => {
  if (bytes.subarray(0, 8).compare(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) !== 0) throw new Error("Output is not a PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

const probeImage = async (filePath: string) => {
  const result = await execFileAsync("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,codec_name",
    "-of", "json",
    filePath,
  ], { windowsHide: true });
  const parsed = JSON.parse(result.stdout) as { streams?: Array<{ width?: number; height?: number; codec_name?: string }> };
  return parsed.streams?.[0] ?? {};
};

const installPrivacyProbe = async (page: Page) => {
  await page.addInitScript(() => {
    const originalCreate = URL.createObjectURL.bind(URL);
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    const created = new Set<string>();
    const revoked = new Set<string>();
    URL.createObjectURL = (value: Blob | MediaSource) => {
      const url = originalCreate(value);
      created.add(url);
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      revoked.add(url);
      originalRevoke(url);
    };
    Object.assign(window, { __domyfileObjectUrls: { created, revoked } });
  });
};

const waitForImageResult = async (page: Page) => {
  await expect(page.locator("[data-result-card]")).toBeVisible({ timeout: 120_000 });
  await expect(page.locator("[data-result-summary]")).toContainText("processed");
};

const downloadSingleResult = async (page: Page, name: string) => {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    page.locator("[data-download-all]").click(),
  ]);
  const outputPath = join(process.cwd(), "test-results", `${name}-${Date.now()}-${download.suggestedFilename()}`);
  await download.saveAs(outputPath);
  return outputPath;
};

test("HEIC, raster image, and PDF browser smoke paths are real and private", async ({ page }) => {
  test.setTimeout(300_000);
  const requestBodies: Array<Buffer | undefined> = [];
  const requestUrls: string[] = [];
  const consoleErrors: string[] = [];
  page.on("request", (request) => {
    requestBodies.push(request.postDataBuffer() ?? undefined);
    requestUrls.push(request.url());
  });
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await installPrivacyProbe(page);

  await page.goto("/image/heic-to-jpg/");
  await expect(page.locator("[data-tool-availability='production-ready']")).toHaveCount(1);
  await page.locator("[data-file-input]").setInputFiles(fixture("heic/sample-1.heic"));
  await page.locator("[data-process-button]").click();
  await waitForImageResult(page);
  const heicPath = await downloadSingleResult(page, "heic");
  const heicBytes = await readFile(heicPath);
  expect(readJpegDimensions(heicBytes)).toEqual({ width: 1440, height: 960 });
  expect((await stat(heicPath)).size).toBeGreaterThan(100);

  await page.locator("[data-process-another]").click();
  await page.locator("[data-file-input]").setInputFiles(fixture("heic/sample-1.heic"));
  await page.locator("[data-process-button]").click();
  await waitForImageResult(page);
  await page.locator("[data-process-another]").click();
  await page.locator("[data-file-input]").setInputFiles(fixture("heic/sample-1.heic"));
  await page.locator("[data-process-button]").click();
  await waitForImageResult(page);
  const urlState = await page.evaluate(() => {
    const state = (window as Window & { __domyfileObjectUrls?: { created: Set<string>; revoked: Set<string> } }).__domyfileObjectUrls;
    return state ? { created: state.created.size, revoked: state.revoked.size } : { created: 0, revoked: 0 };
  });
  expect(urlState.revoked).toBeGreaterThanOrEqual(2);
  await page.locator("[data-process-another]").click();
  const cleanedUrlState = await page.evaluate(() => {
    const state = (window as Window & { __domyfileObjectUrls?: { created: Set<string>; revoked: Set<string> } }).__domyfileObjectUrls;
    return state ? { created: state.created.size, revoked: state.revoked.size } : { created: 0, revoked: 0 };
  });
  // heic-to keeps one shared worker object URL for the lifetime of the page;
  // every per-job output URL must still be revoked after Process another.
  expect(cleanedUrlState.revoked).toBeGreaterThanOrEqual(cleanedUrlState.created - 1);

  await page.goto("/image/png-to-jpg/");
  await page.locator("[data-file-input]").setInputFiles(fixture("one-pixel-2.png"));
  await page.locator("[data-process-button]").click();
  await waitForImageResult(page);
  const pngPath = await downloadSingleResult(page, "png");
  expect(readJpegDimensions(await readFile(pngPath))).toEqual({ width: 1, height: 1 });

  await page.goto("/pdf/pdf-to-jpg/");
  await page.locator("[data-file-input]").setInputFiles(fixture("single-page.pdf"));
  await page.locator("[data-process-button]").click();
  await expect(page.locator("[data-result-card]")).toBeVisible({ timeout: 120_000 });
  const pdfJpgPath = await downloadSingleResult(page, "pdf-jpg");
  const pdfJpgBytes = await readFile(pdfJpgPath);
  expect(pdfJpgBytes[0]).toBe(0xff);
  expect(pdfJpgBytes[1]).toBe(0xd8);

  expect(requestBodies.filter(Boolean)).toHaveLength(0);
  expect(requestUrls.some((url) => /sample-1\.heic|single-page\.pdf|one-pixel-2\.png/i.test(url))).toBe(false);
  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});

test("server video routes disclose temporary processing and allow selection", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto("/video/compress-video/");
  await expect(page.locator("[data-tool-availability='production-ready']")).toHaveCount(1);
  await expect(page.locator("[data-server-fallback='true']")).toHaveCount(1);
  await expect(page.locator("[data-file-input]")).toBeEnabled();
  await expect(page.locator("[data-choose-files]")).toBeEnabled();
  await expect(page.locator("[data-process-button]")).toBeDisabled();
  await expect(page.locator("[data-processing-note]")).toContainText("uploaded temporarily");
  await expect(page.locator("[data-result-card]")).toBeHidden();
  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});

test("Crop Image provides a local visual crop, keyboard controls, and verified output formats", async ({ page }) => {
  test.setTimeout(300_000);
  const requestBodies: Array<Buffer | undefined> = [];
  const consoleErrors: string[] = [];
  page.on("request", (request) => requestBodies.push(request.postDataBuffer() ?? undefined));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/image/crop-image/");
  await expect(page.locator("[data-tool-availability='production-ready']")).toHaveCount(1);
  await page.locator("[data-file-input]").setInputFiles(fixture("compression-photo.jpg"));
  await expect(page.locator("[data-crop-editor]")).toBeVisible({ timeout: 120_000 });
  const selection = page.locator("[data-crop-selection]");
  await expect(selection).toBeVisible();
  expect(await selection.evaluate((node) => getComputedStyle(node).touchAction)).toBe("none");
  const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth + 1);

  await selection.focus();
  await expect(selection).toBeFocused();
  const beforeKeyboardMove = await selection.evaluate((node) => node.style.left);
  await page.keyboard.press("ArrowRight");
  expect(await selection.evaluate((node) => node.style.left)).not.toBe(beforeKeyboardMove);
  const beforeKeyboardResize = await page.locator("[data-crop-size]").first().textContent();
  await page.keyboard.press("Shift+ArrowDown");
  expect(await page.locator("[data-crop-size]").first().textContent()).not.toBe(beforeKeyboardResize);

  const selectionBox = await selection.boundingBox();
  expect(selectionBox).not.toBeNull();
  if (selectionBox) {
    await page.mouse.move(selectionBox.x + selectionBox.width / 2, selectionBox.y + selectionBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(selectionBox.x + selectionBox.width / 2 + 12, selectionBox.y + selectionBox.height / 2 + 8);
    await page.mouse.up();
  }
  await page.locator("#cropRatio").selectOption("1");
  const squareSize = await page.locator("[data-crop-size]").first().textContent();
  expect(squareSize).toMatch(/^\d+ × \d+ px$/);
  const [squareWidth, squareHeight] = (squareSize ?? "").split(" × ").map((value) => Number.parseInt(value, 10));
  expect(squareWidth).toBe(squareHeight);

  const expected = {
    "image/jpeg": { extension: ".jpg", signature: "jpeg" },
    "image/png": { extension: ".png", signature: "png" },
    "image/webp": { extension: ".webp", signature: "webp" },
  } as const;
  for (const [index, [format, expectation]] of Object.entries(expected).entries()) {
    await page.locator("#cropOutputFormat").selectOption(format);
    await page.locator("[data-process-button]").click();
    await waitForImageResult(page);
    const outputPath = await downloadSingleResult(page, `crop-${index}`);
    const bytes = await readFile(outputPath);
    expect(outputPath.toLowerCase()).toContain(expectation.extension);
    if (expectation.signature === "jpeg") {
      expect(readJpegDimensions(bytes)).toEqual({ width: squareWidth, height: squareHeight });
    } else if (expectation.signature === "png") {
      expect(readPngDimensions(bytes)).toEqual({ width: squareWidth, height: squareHeight });
    } else {
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
      const dimensions = await probeImage(outputPath);
      expect(dimensions.width).toBe(squareWidth);
      expect(dimensions.height).toBe(squareHeight);
    }
    if (index < Object.keys(expected).length - 1) {
      await page.locator("[data-process-another]").click();
      await page.locator("[data-file-input]").setInputFiles(fixture("compression-photo.jpg"));
      await expect(page.locator("[data-crop-editor]")).toBeVisible({ timeout: 120_000 });
      await page.locator("#cropRatio").selectOption("1");
    }
  }
  expect(requestBodies.filter(Boolean)).toHaveLength(0);
  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});

test("workspace remains usable at mobile width with keyboard focus and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/image/png-to-jpg/");
  await page.locator("[data-choose-files]").focus();
  await expect(page.locator("[data-choose-files]")).toBeFocused();
  const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth + 1);
  await page.locator("[data-upload-zone]").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-file-input]")).toBeAttached();
});

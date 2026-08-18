import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const fixtureRoot = join(process.cwd(), "tests", "fixtures");
const fixture = (path: string) => join(fixtureRoot, path);

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
    Object.assign(window, { __domyfilePreviewUrls: { created, revoked } });
  });
};

const getUrlState = async (page: Page) => page.evaluate(() => {
  const state = (window as Window & { __domyfilePreviewUrls?: { created: Set<string>; revoked: Set<string> } }).__domyfilePreviewUrls;
  return state ? { created: state.created.size, revoked: state.revoked.size } : { created: 0, revoked: 0 };
});

test("selected files keep actions fixed and image/media previews remain usable on mobile", async ({ page }) => {
  const requestBodies: Array<Buffer | undefined> = [];
  page.on("request", (request) => requestBodies.push(request.postDataBuffer() ?? undefined));
  await installPrivacyProbe(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/image/resize-image/");
  await page.locator("[data-file-input]").setInputFiles({
    name: "this-is-a-deliberately-long-image-filename-that-must-not-overlap-actions.jpg",
    mimeType: "image/jpeg",
    buffer: await readFile(fixture("compression-photo.jpg")),
  });
  const name = page.locator(".file-item-name");
  await expect(name).toHaveAttribute("title", "this-is-a-deliberately-long-image-filename-that-must-not-overlap-actions.jpg");
  await expect(name).toHaveAttribute("aria-label", "this-is-a-deliberately-long-image-filename-that-must-not-overlap-actions.jpg");
  await expect(page.locator("[data-workspace-preview]")).toBeVisible();
  await expect(page.locator(".workspace-preview-tile-detail")).toContainText("×");
  const layout = await page.evaluate(() => {
    const copy = document.querySelector<HTMLElement>(".file-item-copy")?.getBoundingClientRect();
    const actions = document.querySelector<HTMLElement>(".file-item-actions")?.getBoundingClientRect();
    return { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, copyRight: copy?.right ?? 0, actionsLeft: actions?.left ?? 0 };
  });
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth + 1);
  expect(layout.actionsLeft).toBeGreaterThanOrEqual(layout.copyRight - 1);

  await page.goto("/audio/trim-audio/");
  await page.locator("[data-file-input]").setInputFiles(fixture("audio/tone-2s.wav"));
  await expect(page.locator("[data-preview-kind='audio']")).toBeVisible({ timeout: 120_000 });
  await expect(page.locator(".media-preview-timeline")).toBeVisible();
  await expect(page.locator(".media-preview-waveform")).toBeVisible();

  await page.goto("/video/trim-video/");
  await page.locator("[data-file-input]").setInputFiles(fixture("video/mp4-h264-aac.mp4"));
  await expect(page.locator("[data-preview-kind='video']")).toBeVisible({ timeout: 120_000 });
  await expect(page.locator(".media-preview-video")).toBeVisible();
  await expect(page.locator(".media-preview-timeline")).toBeVisible();

  for (const [route, videoFixture] of [["video-to-mp3", "video/mp4-h264-aac.mp4"], ["mov-to-mp4", "video/mov-h264-aac.mov"]] as const) {
    await page.goto(`/video/${route}/`);
    await page.locator("[data-file-input]").setInputFiles(fixture(videoFixture));
    await expect(page.locator("[data-preview-kind='video']")).toBeVisible();
    await expect(page.locator(".media-preview-thumbnail")).toBeVisible();
    await expect(page.locator(".media-preview-message")).toContainText("00:");
  }

  await page.goto("/audio/merge-audio/");
  await page.locator("[data-file-input]").setInputFiles([fixture("audio/tone-1s.wav"), fixture("audio/tone-2s.wav")]);
  await expect(page.locator("[data-file-list] .file-item")).toHaveCount(2);
  await page.locator("[data-move-index='1'][data-move-direction='up']").click();
  await expect(page.locator("[data-file-list] .file-item-name").first()).toHaveText("tone-2s.wav");
  expect(requestBodies.filter(Boolean)).toHaveLength(0);
});

test("PDF page previews support selection, organization, watermark feedback, and image order", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") pageErrors.push(message.text()); });
  await page.goto("/pdf/split-pdf/");
  await page.locator("[data-file-input]").setInputFiles(fixture("multi-page.pdf"));
  await expect(page.locator("[data-file-list] .file-item-name"), pageErrors.join("\n")).toHaveText("multi-page.pdf", { timeout: 120_000 });
  await expect(page.locator("#splitStartPage")).toHaveValue("1");
  await expect(page.locator("#splitEndPage")).toHaveValue("2");
  await expect(page.locator(".pdf-page-preview-tile")).toHaveCount(2, { timeout: 120_000 });
  await expect(page.locator("[data-pdf-preview-edge='start']")).toContainText("Page 1");
  await expect(page.locator("[data-pdf-preview-edge='end']")).toContainText("Page 2");
  await page.locator("#splitEndPage").fill("4");
  await expect(page.locator(".pdf-page-preview-tile")).toHaveCount(2, { timeout: 120_000 });
  await expect(page.locator("[data-pdf-preview-edge='end']")).toContainText("Page 4");

  await page.goto("/pdf/pdf-to-jpg/");
  await page.locator("[data-file-input]").setInputFiles(fixture("multi-page.pdf"));
  await expect(page.locator(".pdf-page-preview-tile--selectable")).toHaveCount(4, { timeout: 120_000 });

  await page.goto("/pdf/rotate-pdf/");
  await page.locator("[data-file-input]").setInputFiles(fixture("multi-page.pdf"));
  await expect(page.locator(".pdf-page-preview-tile")).toHaveCount(4, { timeout: 120_000 });
  await expect(page.locator("[data-pdf-rotation-state]")).toContainText("All pages · 90° clockwise");

  await page.goto("/pdf/merge-pdf/");
  await page.locator("[data-file-input]").setInputFiles([fixture("single-page.pdf"), fixture("multi-page.pdf")]);
  await expect(page.locator(".workspace-preview-document")).toHaveCount(2, { timeout: 120_000 });

  await page.goto("/pdf/organize-pdf/");
  await page.locator("[data-file-input]").setInputFiles(fixture("multi-page.pdf"));
  await expect(page.locator("[data-pdf-organize-grid] .pdf-page-preview-tile")).toHaveCount(4, { timeout: 120_000 });
  await page.locator("[data-pdf-organize-grid] .pdf-page-preview-tile").first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("[data-pdf-organize-grid] .pdf-page-preview-tile").first()).toContainText("Page 2");
  await expect(page.locator("[data-pdf-page-controls] .pdf-page-control").first()).toContainText("Page 2");

  await page.goto("/pdf/watermark-pdf/");
  await page.locator("[data-file-input]").setInputFiles(fixture("single-page.pdf"));
  await expect(page.locator(".pdf-watermark-page")).toBeVisible({ timeout: 120_000 });
  await expect(page.locator(".pdf-watermark-overlay")).toHaveText("DoMyFile");
  await page.locator("#watermarkText").fill("Local preview");
  await expect(page.locator(".pdf-watermark-overlay")).toHaveText("Local preview");

  await page.goto("/pdf/png-to-pdf/");
  await page.locator("[data-file-input]").setInputFiles([
    fixture("one-pixel.png"),
    fixture("one-pixel-2.png"),
  ]);
  await expect(page.locator("[data-workspace-preview] .workspace-preview-tile")).toHaveCount(2);
  await page.locator("[data-move-index='1'][data-move-direction='up']").click();
  await expect(page.locator("[data-file-list] .file-item-name").first()).toHaveText("one-pixel-2.png");
});

test("preview object URLs are released and no selected file is uploaded", async ({ page }) => {
  const requestBodies: Array<Buffer | undefined> = [];
  const requestUrls: string[] = [];
  page.on("request", (request) => {
    requestBodies.push(request.postDataBuffer() ?? undefined);
    requestUrls.push(request.url());
  });
  await installPrivacyProbe(page);
  await page.goto("/image/compress-image/");
  await page.locator("[data-file-input]").setInputFiles(fixture("compression-photo.jpg"));
  await expect(page.locator("[data-workspace-preview]")).toBeVisible();
  await page.locator("[data-file-input]").setInputFiles(fixture("one-pixel.png"));
  await page.locator("[data-remove-index='0']").click();
  await page.locator("[data-remove-index='0']").click();
  await expect(page.locator("[data-file-list-wrap]")).toBeHidden();
  const urlState = await getUrlState(page);
  expect(urlState.created).toBeGreaterThan(0);
  expect(urlState.revoked).toBeGreaterThanOrEqual(urlState.created);
  expect(requestBodies.filter(Boolean)).toHaveLength(0);
  expect(requestUrls.some((url) => /compression-photo\.jpg/i.test(url))).toBe(false);
});

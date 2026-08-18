import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, test, type Page } from "@playwright/test";

const execFileAsync = promisify(execFile);
const fixtureDirectory = join(process.cwd(), "tests", "fixtures", "video");
const fixture = (name: string) => join(fixtureDirectory, name);

type ProbeStream = {
  codec_name?: string;
  codec_type?: string;
  duration?: string;
  width?: number;
  height?: number;
};

type ProbeResult = {
  streams?: ProbeStream[];
  format?: { format_name?: string; duration?: string };
};

const probe = async (filePath: string) => {
  const result = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=format_name,duration:stream=codec_name,codec_type,duration,width,height",
    "-of", "json",
    filePath,
  ], { windowsHide: true });
  return JSON.parse(result.stdout) as ProbeResult;
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

const getUrlState = async (page: Page) => page.evaluate(() => {
  const state = (window as Window & { __domyfileObjectUrls?: { created: Set<string>; revoked: Set<string> } }).__domyfileObjectUrls;
  return state ? { created: state.created.size, revoked: state.revoked.size } : { created: 0, revoked: 0 };
});

const waitForResult = async (page: Page) => {
  await expect(page.locator("[data-result-card]")).toBeVisible({ timeout: 120_000 });
  await expect(page.locator("[data-result-summary]")).toContainText("processed");
};

const downloadResult = async (page: Page, name: string) => {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    page.locator("[data-download-all]").click(),
  ]);
  const outputPath = join(process.cwd(), "test-results", name + "-" + Date.now() + "-" + download.suggestedFilename());
  await download.saveAs(outputPath);
  return outputPath;
};

const streamTypes = (result: ProbeResult, type: string) => (result.streams ?? []).filter((stream) => stream.codec_type === type);

test("Video to MP3 extracts the verified local matrix and cleans repeated jobs", async ({ page }) => {
  test.setTimeout(420_000);
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

  await page.goto("/video/video-to-mp3/");
  await expect(page.locator("[data-tool-availability='production-ready']")).toHaveCount(1);

  await page.locator("[data-file-input]").setInputFiles(fixture("mp4-h264-aac.mp4"));
  await page.locator("[data-process-button]").click();
  await waitForResult(page);
  await expect(page.locator("[data-result-list]")).toContainText("0 video · 1 audio");
  const firstOutput = await downloadResult(page, "video-to-mp3-mp4");
  const firstBytes = await readFile(firstOutput);
  expect(firstBytes.subarray(0, 3).toString("ascii")).toBe("ID3");
  const firstProbe = await probe(firstOutput);
  expect(firstProbe.format?.format_name).toContain("mp3");
  expect(streamTypes(firstProbe, "video")).toHaveLength(0);
  expect(streamTypes(firstProbe, "audio")).toHaveLength(1);
  expect(streamTypes(firstProbe, "audio")[0]?.codec_name).toBe("mp3");
  expect(Number(firstProbe.format?.duration)).toBeCloseTo(1, 1);

  const afterFirstJob = await getUrlState(page);
  expect(afterFirstJob.created).toBeGreaterThanOrEqual(1);
  await page.locator("[data-process-another]").click();
  const afterClear = await getUrlState(page);
  expect(afterClear.revoked).toBeGreaterThanOrEqual(1);

  await page.locator("[data-file-input]").setInputFiles(fixture("mov-h264-aac.mov"));
  await page.locator("[data-process-button]").click();
  await waitForResult(page);
  const secondOutput = await downloadResult(page, "video-to-mp3-mov");
  const secondProbe = await probe(secondOutput);
  expect(secondProbe.format?.format_name).toContain("mp3");
  expect(streamTypes(secondProbe, "video")).toHaveLength(0);
  expect(streamTypes(secondProbe, "audio")[0]?.codec_name).toBe("mp3");
  expect(Number(secondProbe.format?.duration)).toBeCloseTo(1, 1);

  await page.locator("[data-process-another]").click();
  await page.locator("[data-file-input]").setInputFiles(fixture("mp4-h264-no-audio.mp4"));
  await page.locator("[data-process-button]").click();
  await expect(page.locator("[data-workspace-status]")).toContainText("audio stream", { timeout: 120_000 });
  await expect(page.locator("[data-result-card]")).toBeHidden();

  await page.locator("[data-file-input]").setInputFiles({
    name: "webm-disguised.mov",
    mimeType: "video/quicktime",
    buffer: await readFile(fixture("webm-vp8-opus.webm")),
  });
  await page.locator("[data-process-button]").click();
  await expect(page.locator("[data-workspace-status]")).toContainText("verified MP4 or MOV", { timeout: 120_000 });

  const finalUrlState = await getUrlState(page);
  expect(finalUrlState.revoked).toBeGreaterThanOrEqual(finalUrlState.created - 1);
  expect(requestBodies.filter(Boolean)).toHaveLength(0);
  expect(requestUrls.some((url) => /mp4-h264-aac|mov-h264-aac|webm-disguised/i.test(url))).toBe(false);
  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});

test("MOV to MP4 remuxes compatible streams and rejects incompatible ones", async ({ page }) => {
  test.setTimeout(420_000);
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

  await page.goto("/video/mov-to-mp4/");
  await expect(page.locator("[data-tool-availability='production-ready']")).toHaveCount(1);
  await page.locator("[data-file-input]").setInputFiles(fixture("mov-h264-aac.mov"));
  await page.locator("[data-process-button]").click();
  await waitForResult(page);
  await expect(page.locator("[data-result-list]")).toContainText("1 video · 1 audio");
  const withAudioOutput = await downloadResult(page, "mov-to-mp4-audio");
  const withAudioBytes = await readFile(withAudioOutput);
  expect(withAudioBytes.subarray(4, 8).toString("ascii")).toBe("ftyp");
  expect(withAudioBytes.subarray(8, 12).toString("ascii")).toBe("mp42");
  const withAudioProbe = await probe(withAudioOutput);
  expect(withAudioProbe.format?.format_name).toContain("mov");
  expect(streamTypes(withAudioProbe, "video")).toHaveLength(1);
  expect(streamTypes(withAudioProbe, "video")[0]?.codec_name).toBe("h264");
  expect(streamTypes(withAudioProbe, "video")[0]?.width).toBe(160);
  expect(streamTypes(withAudioProbe, "video")[0]?.height).toBe(90);
  expect(streamTypes(withAudioProbe, "audio")).toHaveLength(1);
  expect(streamTypes(withAudioProbe, "audio")[0]?.codec_name).toBe("aac");
  expect(Number(withAudioProbe.format?.duration)).toBeCloseTo(1, 1);

  await page.locator("[data-process-another]").click();
  await page.locator("[data-file-input]").setInputFiles(fixture("mov-h264-no-audio.mov"));
  await page.locator("[data-process-button]").click();
  await waitForResult(page);
  await expect(page.locator("[data-result-list]")).toContainText("1 video · 0 audio");
  const videoOnlyOutput = await downloadResult(page, "mov-to-mp4-video-only");
  const videoOnlyProbe = await probe(videoOnlyOutput);
  expect(streamTypes(videoOnlyProbe, "video")).toHaveLength(1);
  expect(streamTypes(videoOnlyProbe, "video")[0]?.codec_name).toBe("h264");
  expect(streamTypes(videoOnlyProbe, "audio")).toHaveLength(0);
  expect(Number(videoOnlyProbe.format?.duration)).toBeCloseTo(1, 1);

  await page.locator("[data-process-another]").click();
  await page.locator("[data-file-input]").setInputFiles(fixture("mov-mpeg4-aac.mov"));
  await expect(page.locator("[data-file-list] .file-item-name")).toHaveText("mov-mpeg4-aac.mov");
  await page.locator("[data-process-button]").click();
  await expect(page.locator("[data-workspace-status]")).toContainText("H.264 video", { timeout: 120_000 });

  await page.locator("[data-file-input]").setInputFiles(fixture("mov-h264-pcm.mov"));
  await expect(page.locator("[data-file-list] .file-item-name")).toHaveText("mov-h264-pcm.mov");
  await page.locator("[data-process-button]").click();
  await expect(page.locator("[data-workspace-status]")).toContainText("AAC audio", { timeout: 120_000 });

  await page.locator("[data-file-input]").setInputFiles({
    name: "mp4-content-with-mov-name.mov",
    mimeType: "video/quicktime",
    buffer: await readFile(fixture("mp4-h264-aac.mp4")),
  });
  await page.locator("[data-process-button]").click();
  await expect(page.locator("[data-workspace-status]")).toContainText("QuickTime MOV", { timeout: 120_000 });

  const urlState = await getUrlState(page);
  expect(urlState.revoked).toBeGreaterThanOrEqual(urlState.created - 1);
  expect(requestBodies.filter(Boolean)).toHaveLength(0);
  expect(requestUrls.some((url) => /mov-h264-aac|mov-h264-no-audio|mp4-content/i.test(url))).toBe(false);
  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});

test("Video Converter remuxes the verified MP4/MOV matrix and keeps unsupported inputs local", async ({ page }) => {
  test.setTimeout(420_000);
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

  await page.goto("/video/video-converter/");
  await expect(page.locator("[data-tool-availability='production-ready']")).toHaveCount(1);
  await expect(page.locator("#mediaOutputFormat")).toHaveValue("mp4");
  await page.locator("[data-file-input]").setInputFiles(fixture("mp4-h264-aac.mp4"));
  await expect(page.locator("[data-preview-kind='video']")).toBeVisible({ timeout: 120_000 });
  await page.locator("#mediaOutputFormat").selectOption("mov");
  await page.locator("[data-process-button]").click();
  await waitForResult(page);
  const movOutput = await downloadResult(page, "video-converter-mp4-to-mov");
  const movBytes = await readFile(movOutput);
  expect(movBytes.subarray(4, 8).toString("ascii")).toBe("ftyp");
  expect(movBytes.subarray(8, 12).toString("ascii")).toBe("qt  ");
  const movProbe = await probe(movOutput);
  expect(streamTypes(movProbe, "video")).toHaveLength(1);
  expect(streamTypes(movProbe, "video")[0]?.codec_name).toBe("h264");
  expect(streamTypes(movProbe, "video")[0]?.width).toBe(160);
  expect(streamTypes(movProbe, "video")[0]?.height).toBe(90);
  expect(streamTypes(movProbe, "audio")).toHaveLength(1);
  expect(streamTypes(movProbe, "audio")[0]?.codec_name).toBe("aac");
  expect(Number(movProbe.format?.duration)).toBeCloseTo(1, 1);

  await page.locator("[data-process-another]").click();
  await page.locator("[data-file-input]").setInputFiles(fixture("mov-h264-aac.mov"));
  await page.locator("#mediaOutputFormat").selectOption("mp4");
  await page.locator("[data-process-button]").click();
  await waitForResult(page);
  const mp4Output = await downloadResult(page, "video-converter-mov-to-mp4");
  const mp4Bytes = await readFile(mp4Output);
  expect(mp4Bytes.subarray(4, 8).toString("ascii")).toBe("ftyp");
  expect(mp4Bytes.subarray(8, 12).toString("ascii")).toBe("mp42");
  const mp4Probe = await probe(mp4Output);
  expect(streamTypes(mp4Probe, "video")).toHaveLength(1);
  expect(streamTypes(mp4Probe, "video")[0]?.codec_name).toBe("h264");
  expect(streamTypes(mp4Probe, "audio")[0]?.codec_name).toBe("aac");
  expect(Number(mp4Probe.format?.duration)).toBeCloseTo(1, 1);

  await page.locator("[data-process-another]").click();
  await page.locator("[data-file-input]").setInputFiles(fixture("mp4-h264-no-audio.mp4"));
  await page.locator("#mediaOutputFormat").selectOption("mov");
  await page.locator("[data-process-button]").click();
  await waitForResult(page);
  const videoOnlyOutput = await downloadResult(page, "video-converter-mp4-to-mov-video-only");
  const videoOnlyBytes = await readFile(videoOnlyOutput);
  expect(videoOnlyBytes.subarray(8, 12).toString("ascii")).toBe("qt  ");
  const videoOnlyProbe = await probe(videoOnlyOutput);
  expect(streamTypes(videoOnlyProbe, "video")).toHaveLength(1);
  expect(streamTypes(videoOnlyProbe, "video")[0]?.codec_name).toBe("h264");
  expect(streamTypes(videoOnlyProbe, "audio")).toHaveLength(0);
  expect(Number(videoOnlyProbe.format?.duration)).toBeCloseTo(1, 1);

  await page.locator("[data-process-another]").click();
  await page.locator("[data-file-input]").setInputFiles({
    name: "webm-disguised.mp4",
    mimeType: "video/mp4",
    buffer: await readFile(fixture("webm-vp8-opus.webm")),
  });
  await page.locator("[data-process-button]").click();
  await expect(page.locator("[data-workspace-status]")).toContainText("verified MP4 or MOV", { timeout: 120_000 });

  await page.locator("[data-file-input]").setInputFiles(fixture("mov-mpeg4-aac.mov"));
  await page.locator("[data-process-button]").click();
  await expect(page.locator("[data-workspace-status]")).toContainText("H.264 video", { timeout: 120_000 });
  expect(requestBodies.filter(Boolean)).toHaveLength(0);
  expect(requestUrls.some((url) => /mp4-h264-aac|mov-h264-aac|mp4-h264-no-audio|webm-disguised|mov-mpeg4-aac/i.test(url))).toBe(false);
  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});

test("Compress Video exposes the approved temporary server path", async ({ page }) => {
  const requestBodies: Array<Buffer | undefined> = [];
  page.on("request", (request) => requestBodies.push(request.postDataBuffer() ?? undefined));
  await page.goto("/video/compress-video/");
  await expect(page.locator("[data-tool-availability='production-ready']")).toHaveCount(1);
  await expect(page.locator("[data-server-fallback='true']")).toHaveCount(1);
  await expect(page.locator("[data-file-input]")).toBeEnabled();
  await expect(page.locator("[data-process-button]")).toBeDisabled();
  await expect(page.locator("[data-processing-note]")).toContainText("uploaded temporarily");
  await expect(page.locator("[data-result-card]")).toBeHidden();
  expect(requestBodies.filter(Boolean)).toHaveLength(0);
});

test("video workspace stays usable at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/video/video-to-mp3/");
  await expect(page.locator("[data-tool-availability='production-ready']")).toHaveCount(1);
  const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth + 1);
  await page.locator("[data-choose-files]").focus();
  await expect(page.locator("[data-choose-files]")).toBeFocused();
});

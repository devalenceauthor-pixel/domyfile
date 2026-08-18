import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
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

const setRange = async (page: Page, start: number, end: number) => {
  await page.locator("#trimStartSeconds").fill(String(start));
  await page.locator("#trimEndSeconds").fill(String(end));
};

test("Trim Video copies verified keyframe-aligned H.264 streams locally", async ({ page }) => {
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

  await page.goto("/video/trim-video/");
  await expect(page.locator("[data-tool-availability='production-ready']")).toHaveCount(1);

  await page.locator("[data-file-input]").setInputFiles(fixture("trim-mp4-h264-aac.mp4"));
  await expect(page.locator("[data-trim-duration]")).toContainText("4.00 seconds", { timeout: 120_000 });
  await setRange(page, 2, 3);
  await page.locator("[data-process-button]").click();
  await waitForResult(page);
  await expect(page.locator("[data-result-list]")).toContainText("1 video · 1 audio");
  const mp4Output = await downloadResult(page, "trim-video-mp4");
  const mp4Bytes = await readFile(mp4Output);
  expect(mp4Bytes.subarray(8, 12).toString("ascii")).toBe("mp42");
  const mp4Probe = await probe(mp4Output);
  expect(mp4Probe.format?.format_name).toContain("mov");
  expect(streamTypes(mp4Probe, "video")).toHaveLength(1);
  expect(streamTypes(mp4Probe, "video")[0]?.codec_name).toBe("h264");
  expect(streamTypes(mp4Probe, "video")[0]?.width).toBe(160);
  expect(streamTypes(mp4Probe, "video")[0]?.height).toBe(90);
  expect(streamTypes(mp4Probe, "audio")).toHaveLength(1);
  expect(streamTypes(mp4Probe, "audio")[0]?.codec_name).toBe("aac");
  expect(Number(mp4Probe.format?.duration)).toBeCloseTo(1, 1);

  const afterFirstJob = await getUrlState(page);
  expect(afterFirstJob.created).toBeGreaterThanOrEqual(1);
  await page.locator("[data-process-another]").click();
  const afterClear = await getUrlState(page);
  expect(afterClear.revoked).toBeGreaterThanOrEqual(1);

  await page.locator("[data-file-input]").setInputFiles(fixture("trim-mov-h264-aac.mov"));
  await expect(page.locator("[data-trim-duration]")).toContainText("4.00 seconds", { timeout: 120_000 });
  await setRange(page, 2, 3);
  await page.locator("[data-process-button]").click();
  await waitForResult(page);
  await expect(page.locator("[data-result-list]")).toContainText("1 video · 1 audio");
  const movOutput = await downloadResult(page, "trim-video-mov");
  const movProbe = await probe(movOutput);
  expect(streamTypes(movProbe, "video")).toHaveLength(1);
  expect(streamTypes(movProbe, "video")[0]?.codec_name).toBe("h264");
  expect(streamTypes(movProbe, "audio")).toHaveLength(1);
  expect(streamTypes(movProbe, "audio")[0]?.codec_name).toBe("aac");
  expect(Number(movProbe.format?.duration)).toBeCloseTo(1, 1);

  await page.locator("[data-process-another]").click();
  await page.locator("[data-file-input]").setInputFiles(fixture("trim-mp4-h264-no-audio.mp4"));
  await expect(page.locator("[data-trim-duration]")).toContainText("4.00 seconds", { timeout: 120_000 });
  await setRange(page, 2, 3);
  await page.locator("[data-process-button]").click();
  await waitForResult(page);
  await expect(page.locator("[data-result-list]")).toContainText("1 video · 0 audio");
  const noAudioOutput = await downloadResult(page, "trim-video-no-audio");
  const noAudioProbe = await probe(noAudioOutput);
  expect(streamTypes(noAudioProbe, "video")).toHaveLength(1);
  expect(streamTypes(noAudioProbe, "video")[0]?.codec_name).toBe("h264");
  expect(streamTypes(noAudioProbe, "audio")).toHaveLength(0);
  expect(Number(noAudioProbe.format?.duration)).toBeCloseTo(1, 1);

  await page.locator("[data-process-another]").click();
  await page.locator("[data-file-input]").setInputFiles(fixture("trim-mp4-h264-aac.mp4"));
  await expect(page.locator("[data-trim-duration]")).toContainText("4.00 seconds", { timeout: 120_000 });
  await setRange(page, 1.25, 2.75);
  await page.locator("[data-process-button]").click();
  await expect(page.locator("[data-workspace-status]")).toContainText("verified video keyframe", { timeout: 120_000 });
  await expect(page.locator("[data-result-card]")).toBeHidden();

  await page.locator("[data-file-input]").setInputFiles(fixture("mov-mpeg4-aac.mov"));
  await page.locator("[data-process-button]").click();
  await expect(page.locator("[data-workspace-status]")).toContainText("H.264 video", { timeout: 120_000 });

  await page.locator("[data-file-input]").setInputFiles({
    name: "corrupt.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("not a media file"),
  });
  await page.locator("[data-process-button]").click();
  await expect(page.locator("[data-workspace-status]")).toContainText("verified MP4 or MOV", { timeout: 120_000 });

  await page.locator("[data-file-input]").setInputFiles({
    name: "webm-disguised.mp4",
    mimeType: "video/mp4",
    buffer: await readFile(fixture("webm-vp8-opus.webm")),
  });
  await page.locator("[data-process-button]").click();
  await expect(page.locator("[data-workspace-status]")).toContainText("verified MP4 or MOV", { timeout: 120_000 });

  const finalUrlState = await getUrlState(page);
  expect(finalUrlState.revoked).toBeGreaterThanOrEqual(finalUrlState.created - 1);
  expect(requestBodies.filter(Boolean)).toHaveLength(0);
  expect(requestUrls.some((url) => /trim-mp4|trim-mov|corrupt|webm-disguised/i.test(url))).toBe(false);
  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});

test("Trim Video remains usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/video/trim-video/");
  await expect(page.locator("[data-tool-availability='production-ready']")).toHaveCount(1);
  const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth + 1);
  await page.locator("[data-choose-files]").focus();
  await expect(page.locator("[data-choose-files]")).toBeFocused();
});

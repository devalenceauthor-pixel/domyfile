import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";

const execFileAsync = promisify(execFile);
const fixtureDirectory = join(process.cwd(), "tests", "fixtures", "audio");

const fixture = (name: string) => join(fixtureDirectory, name);

const probe = async (filePath: string) => {
  const result = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=format_name,duration:stream=codec_name,codec_type,duration",
    "-of", "json",
    filePath,
  ], { windowsHide: true });
  return JSON.parse(result.stdout) as {
    streams: Array<{ codec_name?: string; codec_type?: string; duration?: string }>;
    format?: { format_name?: string; duration?: string };
  };
};

const waitForResult = async (page: Page) => {
  await expect(page.locator("[data-result-card]")).toBeVisible({ timeout: 120_000 });
  await expect(page.locator("[data-result-summary]")).toContainText("processed");
};

const downloadResult = async (page: Page, testName: string) => {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    page.locator("[data-download-all]").click(),
  ]);
  const path = join(process.cwd(), "test-results", `${testName}-${Date.now()}-${download.suggestedFilename()}`);
  await download.saveAs(path);
  return path;
};

test("trim, convert, merge, and compress real audio locally", async ({ page }, testInfo) => {
  const requestBodies: Array<Buffer | undefined> = [];
  page.on("request", (request) => requestBodies.push(request.postDataBuffer() ?? undefined));

  await page.goto("/audio/trim-audio/");
  await page.locator("[data-file-input]").setInputFiles(fixture("tone-2s.wav"));
  await expect(page.locator("[data-trim-duration]")).toContainText("Detected duration", { timeout: 120_000 });
  await page.locator("#trimStartSeconds").fill("0.25");
  await page.locator("#trimEndSeconds").fill("0.75");
  await page.locator("[data-process-button]").click();
  await waitForResult(page);
  const trimPath = await downloadResult(page, "trim");
  const trimProbe = await probe(trimPath);
  expect(trimProbe.streams[0]?.codec_name).toBe("pcm_s16le");
  expect(Number(trimProbe.format?.duration)).toBeCloseTo(0.5, 1);

  await page.goto("/audio/audio-converter/");
  await page.locator("[data-file-input]").setInputFiles(fixture("tone.flac"));
  await page.locator("#mediaOutputFormat").selectOption("m4a");
  await page.locator("[data-process-button]").click();
  await waitForResult(page);
  const convertedPath = await downloadResult(page, "converter");
  const convertedProbe = await probe(convertedPath);
  expect(convertedProbe.streams[0]?.codec_name).toBe("aac");
  expect(convertedProbe.format?.format_name).toContain("mov");

  await page.goto("/audio/merge-audio/");
  await page.locator("[data-file-input]").setInputFiles([fixture("tone-1s.wav"), fixture("tone-2s.wav")]);
  await expect(page.locator("[data-file-count]")).toHaveText("2 files");
  await page.locator("[data-move-index='1'][data-move-direction='up']").click();
  await expect(page.locator("[data-file-list] .file-item-name").first()).toHaveText("tone-2s.wav");
  await page.locator("[data-process-button]").click();
  await waitForResult(page);
  const mergePath = await downloadResult(page, "merge");
  const mergeProbe = await probe(mergePath);
  expect(mergeProbe.streams[0]?.codec_name).toBe("mp3");
  expect(Number(mergeProbe.format?.duration)).toBeCloseTo(3, 1);

  await page.goto("/audio/compress-audio/");
  await page.locator("[data-file-input]").setInputFiles(fixture("tone-2s.wav"));
  await page.locator("#mediaQuality").selectOption("smaller");
  await page.locator("#mediaOutputFormat").selectOption("mp3");
  await page.locator("[data-process-button]").click();
  await waitForResult(page);
  await expect(page.locator("[data-result-summary]")).toContainText("smaller");
  const compressPath = await downloadResult(page, "compress");
  const compressProbe = await probe(compressPath);
  expect(compressProbe.streams[0]?.codec_name).toBe("mp3");
  expect(Number(compressProbe.format?.duration)).toBeCloseTo(2, 1);
  expect((await stat(compressPath)).size).toBeLessThan((await stat(fixture("tone-2s.wav"))).size * 0.95);

  expect(requestBodies.filter(Boolean)).toHaveLength(0);
  await testInfo.attach("trim-output", { path: trimPath, contentType: "audio/wav" });
});

test("rejects a corrupt input and discloses temporary PDF processing", async ({ page }) => {
  await page.goto("/audio/audio-converter/");
  await page.locator("[data-file-input]").setInputFiles({ name: "broken.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("not an audio file") });
  await page.locator("[data-process-button]").click();
  await expect(page.locator("[data-workspace-status]")).toContainText("readable audio", { timeout: 120_000 });
  await page.goto("/pdf/compress-pdf/");
  await expect(page.locator("[data-tool-availability='production-ready']")).toHaveCount(1);
  await expect(page.locator("[data-server-fallback='true']")).toHaveCount(1);
  await expect(page.locator("[data-file-input]")).toBeEnabled();
  await expect(page.locator("[data-process-button]")).toBeDisabled();
  await expect(page.locator("[data-processing-note]")).toContainText("uploaded temporarily");
  await expect(page.locator("[data-result-card]")).toBeHidden();
});

test("verifies every advertised audio converter combination with the shipped WASM core", async ({ page }) => {
  test.setTimeout(600_000);
  const inputs = ["tone.mp3", "tone-1s.wav", "tone.m4a", "tone.aac", "tone.flac", "tone.ogg"];
  const outputs = ["mp3", "wav", "m4a", "flac", "ogg"] as const;
  const expected = {
    mp3: { codec: "mp3", container: "mp3" },
    wav: { codec: "pcm_s16le", container: "wav" },
    m4a: { codec: "aac", container: "mov" },
    flac: { codec: "flac", container: "flac" },
    ogg: { codec: "vorbis", container: "ogg" },
  } as const;

  await page.goto("/audio/audio-converter/");
  for (const input of inputs) {
    for (const output of outputs) {
      await page.locator("[data-file-input]").setInputFiles(fixture(input));
      await page.locator("#mediaOutputFormat").selectOption(output);
      await page.locator("[data-process-button]").click();
      await waitForResult(page);
      const path = await downloadResult(page, `${input}-${output}`);
      const result = await probe(path);
      expect(result.streams[0]?.codec_name, `${input} → ${output} codec`).toBe(expected[output].codec);
      expect(result.format?.format_name, `${input} → ${output} container`).toContain(expected[output].container);
      await page.locator("[data-process-another]").click();
    }
  }
});

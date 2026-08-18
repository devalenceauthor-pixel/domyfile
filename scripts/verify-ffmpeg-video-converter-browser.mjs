import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const runtimeDirectory = path.join(projectRoot, "public", "runtime", "ffmpeg-core-lgpl-5.1.4");
const fixtureDirectory = path.join(projectRoot, "tests", "fixtures", "video");
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "domyfile-video-converter-"));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const parseProbe = (text, label) => {
  const payload = JSON.parse(text);
  const streams = (payload.streams ?? []).map((stream) => ({
    type: stream.codec_type,
    codec: stream.codec_name,
    width: stream.width,
    height: stream.height,
    duration: Number(stream.duration),
  }));
  const duration = Number(payload.format?.duration ?? streams.find((stream) => Number.isFinite(stream.duration))?.duration);
  assert(Number.isFinite(duration) && duration > 0, `${label}: duration missing`);
  return { streams, container: payload.format?.format_name ?? "", duration };
};

const hostProbe = (filePath, label) => parseProbe(execFileSync("ffprobe", [
  "-v", "error",
  "-show_entries", "format=format_name,duration:stream=codec_type,codec_name,width,height,duration",
  "-of", "json",
  filePath,
], { encoding: "utf8", windowsHide: true }), label);

const module = await import(`${pathToFileURL(path.join(runtimeDirectory, "ffmpeg-core.js")).href}?video-converter-verification=1`);
const core = await module.default({ wasmBinary: await readFile(path.join(runtimeDirectory, "ffmpeg-core.wasm")) });
const logs = [];
core.setLogger((entry) => logs.push(entry));

const run = (method, args) => {
  logs.length = 0;
  const before = process.memoryUsage().rss;
  const started = performance.now();
  const result = core[method](...args);
  const elapsedMs = performance.now() - started;
  const rssDeltaBytes = process.memoryUsage().rss - before;
  const captured = logs.slice();
  core.reset();
  return { result, logs: captured, elapsedMs, rssDeltaBytes };
};

const inputBytes = async (name) => new Uint8Array(await readFile(path.join(fixtureDirectory, name)));
const probeInCore = (pathName, label) => {
  const probePath = `/converter-${label}.json`;
  const result = run("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=codec_type,codec_name,width,height,duration:format=format_name,duration",
    "-of", "json",
    pathName,
    "-o", probePath,
  ]);
  const text = new TextDecoder().decode(core.FS.readFile(probePath));
  core.FS.unlink(probePath);
  assert(result.result === 0, `${label}: embedded probe failed`);
  return parseProbe(text, label);
};

const runRemux = async (inputName, label, outputName, args) => {
  const inputPath = `/converter-${label}-input.${path.extname(inputName).slice(1)}`;
  const outputPath = `/converter-${label}-output.${path.extname(outputName).slice(1)}`;
  core.FS.writeFile(inputPath, await inputBytes(inputName));
  const inputProbe = probeInCore(inputPath, `${label} input`);
  const result = run("exec", ["-i", inputPath, ...args(outputPath)]);
  assert(result.result === 0, `${label}: FFmpeg returned ${result.result}`);
  const output = new Uint8Array(core.FS.readFile(outputPath));
  const outputProbe = probeInCore(outputPath, `${label} output`);
  await writeFile(path.join(temporaryDirectory, outputName), output);
  const independentProbe = hostProbe(path.join(temporaryDirectory, outputName), `${label} independent output`);
  core.FS.unlink(inputPath);
  core.FS.unlink(outputPath);
  return { inputProbe, output, outputProbe, independentProbe, elapsedMs: result.elapsedMs, rssDeltaBytes: result.rssDeltaBytes };
};

const mp4ToMov = await runRemux("mp4-h264-aac.mp4", "mp4-to-mov", "mp4-to-mov.mov", (outputPath) => [
  "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-movflags", "+faststart", "-f", "mov", "-brand", "qt  ", outputPath,
]);
assert(String.fromCharCode(...mp4ToMov.output.slice(8, 12)) === "qt  ", "mp4-to-mov: output is not QuickTime-branded");
assert(mp4ToMov.outputProbe.streams.filter((stream) => stream.type === "video").length === 1, "mp4-to-mov: video stream was not preserved");
assert(mp4ToMov.outputProbe.streams.find((stream) => stream.type === "video")?.codec === "h264", "mp4-to-mov: video stream changed");
assert(mp4ToMov.outputProbe.streams.find((stream) => stream.type === "audio")?.codec === "aac", "mp4-to-mov: audio stream changed");
assert(Math.abs(mp4ToMov.outputProbe.duration - mp4ToMov.inputProbe.duration) <= 0.12, "mp4-to-mov: duration mismatch");

const movToMp4 = await runRemux("mov-h264-aac.mov", "mov-to-mp4", "mov-to-mp4.mp4", (outputPath) => [
  "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-movflags", "+faststart", "-f", "mov", "-brand", "mp42", outputPath,
]);
assert(String.fromCharCode(...movToMp4.output.slice(8, 12)) === "mp42", "mov-to-mp4: output is not MP4-branded");
assert(movToMp4.outputProbe.streams.find((stream) => stream.type === "video")?.codec === "h264", "mov-to-mp4: video stream changed");
assert(movToMp4.outputProbe.streams.find((stream) => stream.type === "audio")?.codec === "aac", "mov-to-mp4: audio stream changed");
assert(Math.abs(movToMp4.outputProbe.duration - movToMp4.inputProbe.duration) <= 0.12, "mov-to-mp4: duration mismatch");

const compressionInput = "/compress-video-input.mp4";
const compressionOutput = "/compress-video-output.mp4";
core.FS.writeFile(compressionInput, await inputBytes("mp4-h264-aac.mp4"));
const compressionAttempt = run("exec", [
  "-i", compressionInput,
  "-map", "0:v:0",
  "-map", "0:a:0?",
  "-c:v", "h264",
  "-c:a", "aac",
  "-f", "mov",
  compressionOutput,
]);
assert(compressionAttempt.result !== 0, "compress-video: runtime unexpectedly exposed a video encode path");
try { core.FS.unlink(compressionInput); } catch { /* already removed */ }
try { core.FS.unlink(compressionOutput); } catch { /* encoder failed before creating output */ }

const leftovers = core.FS.readdir("/").filter((name) => name.startsWith("converter-") || name.startsWith("compress-video-"));
assert(leftovers.length === 0, `video converter verification: virtual filesystem not clean (${leftovers.join(", ")})`);
await rm(temporaryDirectory, { recursive: true, force: true });

console.log(JSON.stringify({
  videoConverter: {
    mp4ToMov: { inputBytes: mp4ToMov.inputProbe, outputBytes: mp4ToMov.output.length, duration: mp4ToMov.independentProbe.duration, elapsedMs: Number(mp4ToMov.elapsedMs.toFixed(1)), rssDeltaBytes: mp4ToMov.rssDeltaBytes },
    movToMp4: { inputBytes: movToMp4.inputProbe, outputBytes: movToMp4.output.length, duration: movToMp4.independentProbe.duration, elapsedMs: Number(movToMp4.elapsedMs.toFixed(1)), rssDeltaBytes: movToMp4.rssDeltaBytes },
  },
  compressVideo: { videoEncodeExitCode: compressionAttempt.result, elapsedMs: Number(compressionAttempt.elapsedMs.toFixed(1)), rssDeltaBytes: compressionAttempt.rssDeltaBytes },
}, null, 2));

console.log("verified browser Video Converter MP4/MOV remux matrix");
console.log("verified browser Compress Video has no video encoder path");

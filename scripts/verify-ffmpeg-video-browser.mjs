import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const runtimeDirectory = path.join(projectRoot, "public", "runtime", "ffmpeg-core-lgpl-5.1.4");
const fixtureDirectory = path.join(projectRoot, "tests", "fixtures", "video");
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "domyfile-video-"));

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

const module = await import(`${pathToFileURL(path.join(runtimeDirectory, "ffmpeg-core.js")).href}?video-verification=1`);
const core = await module.default({ wasmBinary: await readFile(path.join(runtimeDirectory, "ffmpeg-core.wasm")) });
const logs = [];
core.setLogger((entry) => logs.push(entry));

const run = (method, args) => {
  logs.length = 0;
  const result = core[method](...args);
  const captured = logs.slice();
  core.reset();
  return { result, logs: captured };
};

const version = run("exec", ["-hide_banner", "-version"]);
const versionText = version.logs.filter(({ type }) => type === "stdout" || type === "stderr").map(({ message }) => message).join("\n");
assert(version.result === 0, "video verification: version command failed");
assert(versionText.includes("ffmpeg version n5.1.4"), "video verification: wrong FFmpeg version");
assert(versionText.includes("--disable-gpl"), "video verification: GPL was not disabled");
assert(versionText.includes("--disable-nonfree"), "video verification: nonfree components were not disabled");
assert(versionText.includes("--enable-demuxer='aac,concat,flac,mov,mp3,ogg,wav'"), "video verification: MOV demuxer allowlist changed unexpectedly");
assert(versionText.includes("--enable-muxer='flac,ipod,mov,mp3,ogg,wav'"), "video verification: MOV muxer allowlist changed unexpectedly");

const encoders = run("exec", ["-hide_banner", "-encoders"]);
const encoderText = encoders.logs.map(({ message }) => message).join("\n");
assert(!encoderText.includes("libx264") && !encoderText.includes("libx265"), "video verification: forbidden video encoder exposed");

const inputBytes = async (name) => new Uint8Array(await readFile(path.join(fixtureDirectory, name)));
const probeInCore = (pathName, label) => {
  const probePath = `/verify-${label}.json`;
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

const runOutput = async (inputName, label, args, outputName) => {
  const inputPath = `/verify-${label}-input.${path.extname(inputName).slice(1)}`;
  const outputPath = `/verify-${label}-output.${path.extname(outputName).slice(1)}`;
  core.FS.writeFile(inputPath, await inputBytes(inputName));
  const inputProbe = probeInCore(inputPath, `${label} input`);
  const result = run("exec", ["-i", inputPath, ...args(inputPath, outputPath)]);
  assert(result.result === 0, `${label}: FFmpeg returned ${result.result}`);
  const output = new Uint8Array(core.FS.readFile(outputPath));
  const outputProbe = probeInCore(outputPath, `${label} output`);
  await writeFile(path.join(temporaryDirectory, outputName), output);
  const independentProbe = hostProbe(path.join(temporaryDirectory, outputName), `${label} independent output`);
  core.FS.unlink(inputPath);
  core.FS.unlink(outputPath);
  return { inputProbe, output, outputProbe, independentProbe };
};

const mp3 = await runOutput("mp4-h264-aac.mp4", "video-to-mp3", () => [
  "-map", "0:a:0", "-vn", "-sn", "-dn", "-c:a", "libmp3lame", "-b:a", "128k", "/verify-video-to-mp3-output.mp3",
], "video-to-mp3.mp3");
assert(mp3.output[0] === 0x49 && mp3.output[1] === 0x44 && mp3.output[2] === 0x33, "video-to-mp3: missing ID3 MP3 signature");
assert(mp3.outputProbe.streams.length === 1 && mp3.outputProbe.streams[0]?.type === "audio" && mp3.outputProbe.streams[0]?.codec === "mp3", "video-to-mp3: output stream mismatch");
assert(mp3.independentProbe.streams[0]?.codec === "mp3", "video-to-mp3: independent codec probe mismatch");
assert(Math.abs(mp3.outputProbe.duration - mp3.inputProbe.duration) <= 0.12, "video-to-mp3: duration mismatch");

const remux = await runOutput("mov-h264-aac.mov", "mov-to-mp4", () => [
  "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-movflags", "+faststart", "-f", "mov", "-brand", "mp42", "/verify-mov-to-mp4-output.mp4",
], "mov-to-mp4.mp4");
assert(String.fromCharCode(...remux.output.slice(8, 12)) === "mp42", "mov-to-mp4: output is not MP4-branded");
assert(remux.outputProbe.streams.filter((stream) => stream.type === "video").length === 1, "mov-to-mp4: video stream was not preserved");
assert(remux.outputProbe.streams.find((stream) => stream.type === "video")?.codec === "h264", "mov-to-mp4: video was re-encoded or changed");
assert(remux.outputProbe.streams.filter((stream) => stream.type === "audio").length === 1, "mov-to-mp4: audio stream was not preserved");
assert(remux.outputProbe.streams.find((stream) => stream.type === "audio")?.codec === "aac", "mov-to-mp4: audio codec was changed");
assert(remux.independentProbe.streams.find((stream) => stream.type === "video")?.codec === "h264", "mov-to-mp4: independent video probe mismatch");
assert(Math.abs(remux.outputProbe.duration - remux.inputProbe.duration) <= 0.12, "mov-to-mp4: duration mismatch");

const noAudioPath = "/verify-no-audio.mp4";
core.FS.writeFile(noAudioPath, await inputBytes("mp4-h264-no-audio.mp4"));
const noAudioProbe = probeInCore(noAudioPath, "no-audio input");
assert(noAudioProbe.streams.every((stream) => stream.type !== "audio"), "no-audio fixture unexpectedly contains audio");
core.FS.unlink(noAudioPath);

const leftovers = core.FS.readdir("/").filter((name) => name.startsWith("verify-"));
assert(leftovers.length === 0, `video verification: virtual filesystem not clean (${leftovers.join(", ")})`);
await rm(temporaryDirectory, { recursive: true, force: true });

console.log("verified browser video runtime: Video to MP3 and MOV to MP4");
console.log("MP4/MOV H.264 + AAC matrix: passed");
console.log("no-audio probe and output signatures: passed");
console.log("virtual filesystem cleanup: verified");

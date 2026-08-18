import { readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const runtimeDirectory = path.join(projectRoot, "public", "runtime", "ffmpeg-core-lgpl-5.1.4");
const fixtureDirectory = path.join(projectRoot, "tests", "fixtures", "video");
const temporaryDirectory = path.join(os.tmpdir(), `domyfile-trim-${Date.now()}`);

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

const hostFirstVideoFrame = (filePath, label) => {
  const output = execFileSync("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "frame=key_frame,pts_time,pict_type",
    "-of", "csv=p=0",
    filePath,
  ], { encoding: "utf8", windowsHide: true });
  const first = output.trim().split(/\r?\n/)[0]?.split(",");
  assert(first?.length && Number.isFinite(Number(first[1])), `${label}: first video frame missing`);
  return { keyFrame: first[0] === "1", timestamp: Number(first[1]), pictureType: first[2] };
};

const module = await import(`${pathToFileURL(path.join(runtimeDirectory, "ffmpeg-core.js")).href}?trim-verification=1`);
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

const inputBytes = async (name) => new Uint8Array(await readFile(path.join(fixtureDirectory, name)));
const probeInCore = (pathName, label) => {
  const probePath = `/trim-${label}.json`;
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

const keyframesInCore = (pathName, label) => {
  const probePath = `/trim-${label}-frames.json`;
  const result = run("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_packets",
    "-show_entries", "packet=pts_time,dts_time,flags",
    "-of", "json",
    pathName,
    "-o", probePath,
  ]);
  const text = new TextDecoder().decode(core.FS.readFile(probePath));
  core.FS.unlink(probePath);
  assert(result.result === 0, `${label}: embedded keyframe probe failed`);
  const payload = JSON.parse(text);
  const timestamps = (payload.packets ?? [])
    .filter((packet) => String(packet.flags ?? "").includes("K"))
    .map((packet) => Number(packet.pts_time ?? packet.dts_time))
    .filter((timestamp) => Number.isFinite(timestamp));
  assert(timestamps.length > 0, `${label}: no keyframes reported (${text.slice(0, 500)})`);
  return timestamps;
};

const runTrim = async (inputName, label, start, duration, outputName) => {
  const inputPath = `/trim-${label}-input.${path.extname(inputName).slice(1)}`;
  const outputPath = `/trim-${label}-output.mp4`;
  core.FS.writeFile(inputPath, await inputBytes(inputName));
  const inputProbe = probeInCore(inputPath, `${label} input`);
  const keyframes = keyframesInCore(inputPath, `${label} input`);
  const result = run("exec", [
    "-ss", String(start),
    "-i", inputPath,
    "-t", String(duration),
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-c", "copy",
    "-avoid_negative_ts", "make_zero",
    "-movflags", "+faststart",
    "-f", "mov",
    "-brand", "mp42",
    outputPath,
  ]);
  assert(result.result === 0, `${label}: FFmpeg returned ${result.result}`);
  const output = new Uint8Array(core.FS.readFile(outputPath));
  const outputProbe = probeInCore(outputPath, `${label} output`);
  await writeFile(path.join(temporaryDirectory, outputName), output);
  const independentProbe = hostProbe(path.join(temporaryDirectory, outputName), `${label} independent output`);
  const firstVideoFrame = hostFirstVideoFrame(path.join(temporaryDirectory, outputName), `${label} independent output`);
  core.FS.unlink(inputPath);
  core.FS.unlink(outputPath);
  return { inputProbe, keyframes, output, outputProbe, independentProbe, firstVideoFrame };
};

await rm(temporaryDirectory, { recursive: true, force: true });
await import("node:fs/promises").then(({ mkdir }) => mkdir(temporaryDirectory, { recursive: true }));

const aligned = await runTrim("trim-mp4-h264-aac.mp4", "aligned", 2, 1, "aligned.mp4");
const nonAligned = await runTrim("trim-mp4-h264-aac.mp4", "non-aligned", 1.25, 1.5, "non-aligned.mp4");
const mov = await runTrim("trim-mov-h264-aac.mov", "mov", 2, 1, "mov.mp4");
const noAudio = await runTrim("trim-mp4-h264-no-audio.mp4", "no-audio", 2, 1, "no-audio.mp4");

for (const [label, result] of [["aligned", aligned], ["non-aligned", nonAligned], ["mov", mov], ["no-audio", noAudio]]) {
  const videoStreams = result.independentProbe.streams.filter((stream) => stream.type === "video");
  assert(videoStreams.length === 1 && videoStreams[0]?.codec === "h264", `${label}: video stream was not preserved`);
  assert(videoStreams[0]?.width === 160 && videoStreams[0]?.height === 90, `${label}: dimensions changed`);
}

assert(aligned.firstVideoFrame.keyFrame, "aligned: output did not begin with a keyframe");
assert(aligned.keyframes.some((timestamp) => Math.abs(timestamp - 2) <= 0.001), "aligned: expected two-second keyframe was not reported");
assert(Math.abs(aligned.independentProbe.duration - 1) <= 0.12, "aligned: keyframe-aligned duration mismatch");
assert(nonAligned.firstVideoFrame.keyFrame, "non-aligned: output did not begin with a keyframe");
assert(nonAligned.firstVideoFrame.timestamp === 0, "non-aligned: output timestamps were not rebased");
assert(Math.abs(nonAligned.independentProbe.duration - 1.5) > 0.12, "non-aligned: stream copy unexpectedly met arbitrary duration accuracy");
assert(mov.independentProbe.streams.filter((stream) => stream.type === "audio").length === 1, "mov: AAC audio stream was not preserved");
assert(noAudio.independentProbe.streams.filter((stream) => stream.type === "audio").length === 0, "no-audio: unexpected audio stream");

console.log(JSON.stringify({
  aligned: { duration: aligned.independentProbe.duration, firstVideoFrame: aligned.firstVideoFrame },
  nonAligned: { duration: nonAligned.independentProbe.duration, firstVideoFrame: nonAligned.firstVideoFrame },
  mov: { duration: mov.independentProbe.duration },
  noAudio: { duration: noAudio.independentProbe.duration },
}, null, 2));

const leftovers = core.FS.readdir("/").filter((name) => name.startsWith("trim-"));
assert(leftovers.length === 0, `trim verification: virtual filesystem not clean (${leftovers.join(", ")})`);
await rm(temporaryDirectory, { recursive: true, force: true });

console.log("verified browser Trim Video feasibility on the custom LGPL runtime");
console.log("H.264/AAC MP4 and MOV: stream copy works only at keyframe boundaries");
console.log("non-keyframe request: arbitrary accuracy failed the duration tolerance");
console.log("video-only input and VFS cleanup: verified");

import { mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputDirectory = path.join(projectRoot, "tests", "fixtures", "video");
const ffmpeg = process.env.FFMPEG_BINARY ?? "ffmpeg";

const run = async (args) => {
  await execFileAsync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", ...args], {
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
};

await mkdir(outputDirectory, { recursive: true });

const videoInput = ["-f", "lavfi", "-i", "color=c=blue:s=160x90:r=10:d=1"];
const audioInput = ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=1"];
const h264 = ["-c:v", "h264_mf", "-pix_fmt", "yuv420p"];
const aac = ["-c:a", "aac", "-b:a", "96k"];

await run([
  ...videoInput,
  ...audioInput,
  ...h264,
  ...aac,
  "-movflags", "+faststart",
  path.join(outputDirectory, "mp4-h264-aac.mp4"),
]);

await run([
  ...videoInput,
  ...audioInput,
  ...h264,
  ...aac,
  "-f", "mov",
  path.join(outputDirectory, "mov-h264-aac.mov"),
]);

await run([
  ...videoInput,
  ...h264,
  "-an",
  "-f", "mov",
  path.join(outputDirectory, "mov-h264-no-audio.mov"),
]);

await run([
  ...videoInput,
  ...h264,
  "-an",
  path.join(outputDirectory, "mp4-h264-no-audio.mp4"),
]);

await run([
  ...videoInput,
  ...audioInput,
  "-c:v", "mpeg4",
  "-q:v", "3",
  ...aac,
  "-f", "mov",
  path.join(outputDirectory, "mov-mpeg4-aac.mov"),
]);

await run([
  ...videoInput,
  ...audioInput,
  ...h264,
  "-c:a", "pcm_s16le",
  "-f", "mov",
  path.join(outputDirectory, "mov-h264-pcm.mov"),
]);

await run([
  ...videoInput,
  ...audioInput,
  "-c:v", "libvpx",
  "-deadline", "realtime",
  "-cpu-used", "8",
  "-crf", "36",
  "-b:v", "0",
  "-c:a", "libopus",
  "-b:a", "64k",
  "-f", "webm",
  path.join(outputDirectory, "webm-vp8-opus.webm"),
]);

console.log(`Generated video fixtures in ${outputDirectory}`);

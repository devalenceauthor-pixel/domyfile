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

const videoInput = ["-f", "lavfi", "-i", "testsrc2=size=160x90:rate=10:duration=4"];
const audioInput = ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=4"];
const h264 = ["-c:v", "h264_mf", "-pix_fmt", "yuv420p", "-g", "20", "-keyint_min", "20", "-sc_threshold", "0"];
const aac = ["-c:a", "aac", "-b:a", "96k"];

await run([
  ...videoInput,
  ...audioInput,
  ...h264,
  ...aac,
  "-movflags", "+faststart",
  path.join(outputDirectory, "trim-mp4-h264-aac.mp4"),
]);

await run([
  ...videoInput,
  ...audioInput,
  ...h264,
  ...aac,
  "-f", "mov",
  path.join(outputDirectory, "trim-mov-h264-aac.mov"),
]);

await run([
  ...videoInput,
  ...h264,
  "-an",
  path.join(outputDirectory, "trim-mp4-h264-no-audio.mp4"),
]);

await run([
  ...videoInput,
  ...h264,
  "-an",
  "-f", "mov",
  path.join(outputDirectory, "trim-mov-h264-no-audio.mov"),
]);

console.log(`Generated Trim Video fixtures in ${outputDirectory}`);

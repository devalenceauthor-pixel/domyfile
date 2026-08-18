import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const coreDirectory = path.join(projectRoot, ".build", "ffmpeg-source", "dist", "esm");
const fixtureDirectory = path.join(projectRoot, "tests", "fixtures", "audio");
const resultDirectory = path.join(projectRoot, ".build", "ffmpeg-lgpl-matrix");

const fixtures = [
  { name: "tone.mp3", format: "mp3" },
  { name: "tone-1s.wav", format: "wav" },
  { name: "tone.m4a", format: "m4a" },
  { name: "tone.aac", format: "aac" },
  { name: "tone.flac", format: "flac" },
  { name: "tone.ogg", format: "ogg" },
];

const outputs = {
  mp3: { extension: "mp3", codec: "mp3", container: "mp3", codecArgument: "libmp3lame", bitrate: "128k" },
  wav: { extension: "wav", codec: "pcm_s16le", container: "wav", codecArgument: "pcm_s16le" },
  m4a: { extension: "m4a", codec: "aac", container: "mov", codecArgument: "aac", bitrate: "128k" },
  flac: { extension: "flac", codec: "flac", container: "flac", codecArgument: "flac" },
  ogg: { extension: "ogg", codec: "vorbis", container: "ogg", codecArgument: "vorbis", bitrate: "128k" },
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const parseProbe = (text, label) => {
  try {
    const payload = JSON.parse(text);
    const stream = payload.streams?.find((candidate) => candidate.codec_type === "audio");
    const duration = Number(stream?.duration ?? payload.format?.duration);
    assert(stream?.codec_name, `${label}: no audio stream`);
    assert(Number.isFinite(duration) && duration > 0, `${label}: no duration`);
    return {
      codec: stream.codec_name,
      container: payload.format?.format_name ?? "",
      duration,
    };
  } catch (error) {
    throw new Error(`${label}: invalid probe output (${error instanceof Error ? error.message : String(error)})`);
  }
};

const externalProbe = (filePath) => {
  const output = execFileSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=format_name,duration:stream=codec_name,codec_type,duration",
    "-of", "json",
    filePath,
  ], { encoding: "utf8", windowsHide: true });
  return parseProbe(output, `external probe ${path.basename(filePath)}`);
};

const coreUrl = pathToFileURL(path.join(coreDirectory, "ffmpeg-core.js")).href;
const createFFmpegCore = (await import(`${coreUrl}?verification=1`)).default;
const wasmBinary = await readFile(path.join(coreDirectory, "ffmpeg-core.wasm"));
const logs = [];
const core = await createFFmpegCore({ wasmBinary });
core.setLogger(({ type, message }) => logs.push({ type, message }));

const run = (method, args) => {
  logs.length = 0;
  const result = core[method](...args);
  const captured = logs.slice();
  core.reset();
  return { result, logs: captured };
};

const textOutput = (entries) => entries.filter(({ type }) => type === "stdout").map(({ message }) => message).join("\n");

const versionResult = run("exec", ["-hide_banner", "-version"]);
const versionText = textOutput(versionResult.logs);
assert(versionResult.result === 0, "custom core version command failed");
assert(versionText.includes("ffmpeg version n5.1.4"), "custom core is not FFmpeg n5.1.4");
assert(versionText.includes("Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.40"), "custom core is not built with Emscripten 3.1.40");
assert(!versionText.includes("--enable-gpl"), "custom core unexpectedly enables GPL code");
assert(!versionText.includes("--enable-nonfree"), "custom core unexpectedly enables nonfree code");
assert(versionText.includes("--enable-filter='anull,atrim,aformat,aresample,concat'"), "custom core is missing the verified trim filter allowlist");

const encoderList = textOutput(run("exec", ["-hide_banner", "-encoders"]).logs);
for (const forbiddenEncoder of ["libx264", "libx265", "libvpx", "libvorbis", "libopus", "libfdk_aac"]) {
  assert(!new RegExp(`\\b${forbiddenEncoder}\\b`).test(encoderList), `custom core exposes forbidden encoder ${forbiddenEncoder}`);
}

const inputProbe = (inputPath, label) => {
  const result = run("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=codec_type,codec_name,duration,sample_rate,channels,bit_rate:format=format_name,duration,bit_rate",
    "-of", "json",
    inputPath,
    "-o", `/verify-probe-${label}.json`,
  ]);
  const text = new TextDecoder().decode(core.FS.readFile(`/verify-probe-${label}.json`));
  core.FS.unlink(`/verify-probe-${label}.json`);
  assert(result.result === 0, `${label}: custom ffprobe failed`);
  return parseProbe(text, `custom probe ${label}`);
};

const commandFor = (inputPath, outputPath, output) => {
  const args = ["-i", inputPath, "-map", "0:a:0", "-vn", "-sn", "-dn", "-c:a", output.codecArgument];
  if (output.bitrate) args.push("-b:a", output.bitrate);
  if (output.extension === "ogg") args.push("-ac", "2", "-strict", "-2");
  if (output.extension === "m4a") args.push("-movflags", "+faststart");
  args.push(outputPath);
  return args;
};

const expectedDurationTolerance = (duration) => Math.max(0.12, Math.min(0.75, duration * 0.05));
const rows = [];
await mkdir(resultDirectory, { recursive: true });

for (const fixture of fixtures) {
  const inputBytes = new Uint8Array(await readFile(path.join(fixtureDirectory, fixture.name)));
  const inputPath = `/verify-input-${fixture.format}`;
  core.FS.writeFile(inputPath, inputBytes);
  const input = inputProbe(inputPath, fixture.format);

  for (const [outputFormat, output] of Object.entries(outputs)) {
    const outputPath = `/verify-output-${fixture.format}-${outputFormat}.${output.extension}`;
    const outputProbePath = `/verify-output-probe-${fixture.format}-${outputFormat}.json`;
    const hostOutputPath = path.join(resultDirectory, `${fixture.format}-${outputFormat}.${output.extension}`);
    try {
      const result = run("exec", commandFor(inputPath, outputPath, output));
      assert(result.result === 0, `${fixture.name} -> ${outputFormat}: custom core returned ${result.result}`);
      const bytes = new Uint8Array(core.FS.readFile(outputPath));
      const probeResult = run("ffprobe", [
        "-v", "error",
        "-show_entries", "stream=codec_type,codec_name,duration:format=format_name,duration",
        "-of", "json",
        outputPath,
        "-o", outputProbePath,
      ]);
      const customProbeText = new TextDecoder().decode(core.FS.readFile(outputProbePath));
      const generated = parseProbe(customProbeText, `${fixture.name} -> ${outputFormat} custom probe`);
      assert(probeResult.result === 0, `${fixture.name} -> ${outputFormat}: custom output probe failed`);
      assert(generated.codec === output.codec, `${fixture.name} -> ${outputFormat}: expected codec ${output.codec}, got ${generated.codec}`);
      assert(generated.container.includes(output.container), `${fixture.name} -> ${outputFormat}: expected container ${output.container}, got ${generated.container}`);
      assert(Math.abs(generated.duration - input.duration) <= expectedDurationTolerance(input.duration), `${fixture.name} -> ${outputFormat}: duration changed from ${input.duration} to ${generated.duration}`);
      await writeFile(hostOutputPath, bytes);
      const independent = externalProbe(hostOutputPath);
      assert(independent.codec === output.codec, `${fixture.name} -> ${outputFormat}: independent codec probe mismatch`);
      assert(independent.container.includes(output.container), `${fixture.name} -> ${outputFormat}: independent container probe mismatch`);
      rows.push({ input: fixture.format, output: outputFormat, codec: independent.codec, container: independent.container, duration: independent.duration, bytes: bytes.byteLength });
    } finally {
      for (const virtualPath of [outputPath, outputProbePath]) {
        try { core.FS.unlink(virtualPath); } catch { /* already cleaned */ }
      }
    }
  }

  core.FS.unlink(inputPath);
}

const leftovers = core.FS.readdir("/").filter((name) => name.startsWith("verify-"));
assert(leftovers.length === 0, `custom core virtual filesystem was not cleaned: ${leftovers.join(", ")}`);

console.log(versionText.split("\n").slice(0, 3).join("\n"));
console.log(`verified matrix: ${rows.length}/30 cells`);
for (const row of rows) console.log(`${row.input} -> ${row.output}: ${row.codec}/${row.container}, ${row.duration.toFixed(3)}s, ${row.bytes} bytes`);
console.log("virtual filesystem cleanup: verified");

import {
  MediaProcessingError,
  type AudioMediaProbe,
  type AudioOutputFormat,
  type AudioQualityPreset,
  type MediaOptions,
  type MediaOutputFormat,
  type MediaProbe,
  type MediaToolSlug,
  type NormalizedMediaOptions,
  type VideoMediaProbe,
} from "./types";
import {
  audioFormats,
  getExpectedOutputCodec,
  getOutputExtension,
  isCompatibleStream,
  isMediaOutputFormat,
  isOutputFormat,
  isSameStreamShape,
  outputFormatForInput,
} from "./formats";

const safeBaseName = (fileName: string) => fileName
  .replace(/\.[^/.]+$/, "")
  .replace(/[\\/]+/g, "-")
  .replace(/[^\p{L}\p{N}._-]+/gu, "-")
  .replace(/-{2,}/g, "-")
  .replace(/^[-.]+|[-.]+$/g, "") || "file";

const outputSuffixes: Record<MediaToolSlug, string> = {
  "trim-audio": "trimmed",
  "trim-video": "trimmed",
  "audio-converter": "converted",
  "merge-audio": "merged",
  "compress-audio": "compressed",
  "video-to-mp3": "audio",
  "mov-to-mp4": "mp4",
  "video-converter": "converted",
};

export const getMediaOutputName = (fileName: string, tool: MediaToolSlug, outputFormat: MediaOutputFormat) => `${safeBaseName(fileName)}-${outputSuffixes[tool]}.${getOutputExtension(outputFormat)}`;

const parseInputNumber = (value: number | string | undefined, fallback: number) => {
  if (value === undefined || value === "") return fallback;
  return typeof value === "number" ? value : Number(value);
};

const normalizeQuality = (value: string | undefined): AudioQualityPreset => value === "smaller" || value === "higher" ? value : "balanced";

export const normalizeMediaOptions = (tool: MediaToolSlug, options: MediaOptions = { tool }): NormalizedMediaOptions => {
  if (options.outputFormat !== undefined && options.outputFormat !== "" && !isMediaOutputFormat(options.outputFormat)) {
    throw new MediaProcessingError("INVALID_INPUT", "Choose one of the verified output formats.");
  }
  const outputFormat = isMediaOutputFormat(options.outputFormat) ? options.outputFormat : undefined;
  const endValue = options.endSeconds === undefined || options.endSeconds === "" ? undefined : parseInputNumber(options.endSeconds, 0);
  return {
    tool,
    startSeconds: parseInputNumber(options.startSeconds, 0),
    endSeconds: endValue === undefined || endValue === 0 ? undefined : endValue,
    outputFormat,
    quality: normalizeQuality(typeof options.quality === "string" ? options.quality : undefined),
  };
};

export const resolveOutputFormat = (tool: MediaToolSlug, probe: MediaProbe, options: NormalizedMediaOptions): MediaOutputFormat => {
  if (tool === "trim-video") return "mp4";
  if (tool === "video-to-mp3") return "mp3";
  if (tool === "mov-to-mp4") return "mp4";
  if (tool === "video-converter") return options.outputFormat === "mov" ? "mov" : "mp4";
  if (options.outputFormat && isOutputFormat(options.outputFormat)) return options.outputFormat;
  if (probe.kind !== "audio") throw new MediaProcessingError("UNSUPPORTED_FORMAT", "This audio tool requires an audio-only input.");
  if (tool === "compress-audio") return probe.detectedFormat === "mp3" ? "mp3" : "m4a";
  if (tool === "audio-converter" || tool === "merge-audio") return "mp3";
  return outputFormatForInput(probe.detectedFormat);
};

export const getQualityBitrate = (quality: AudioQualityPreset, format: AudioOutputFormat) => {
  if (format === "wav" || format === "flac") return undefined;
  if (quality === "smaller") return "96k";
  if (quality === "higher") return "192k";
  return "128k";
};

const numberForCommand = (value: number) => Math.max(0, value).toFixed(3).replace(/\.?(0+)$/, "");

type OutputArguments = {
  format: AudioOutputFormat;
  quality: AudioQualityPreset;
  streamCopy: boolean;
  sampleRate?: number;
  channels?: number;
};

const getOutputArguments = ({ format, quality, streamCopy, sampleRate, channels }: OutputArguments) => {
  if (streamCopy) return ["-c:a", "copy", "-avoid_negative_ts", "make_zero"];
  const definition = audioFormats[format];
  const args = ["-c:a", definition.outputCodec];
  const bitrate = getQualityBitrate(quality, format);
  if (bitrate) args.push("-b:a", bitrate);
  if (sampleRate) args.push("-ar", String(sampleRate));
  if (format === "ogg") {
    args.push("-ac", "2");
    args.push("-strict", "-2");
  } else if (channels) args.push("-ac", String(channels));
  if (format === "m4a") args.push("-movflags", "+faststart");
  return args;
};

const mapAudio = ["-map", "0:a:0", "-vn", "-sn", "-dn"];

export type MediaCommand = {
  args: string[];
  outputPath: string;
  supportFiles?: Array<{ path: string; contents: string }>;
  strategy: "stream-copy" | "encode";
};

export const validateTrimRange = (options: NormalizedMediaOptions, durationSeconds: number) => {
  const start = options.startSeconds;
  const end = options.endSeconds ?? durationSeconds;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    throw new MediaProcessingError("INVALID_INPUT", "Choose a start before the end of the audio.");
  }
  if (end > durationSeconds + 0.02) {
    throw new MediaProcessingError("INVALID_INPUT", `The end position must be within the audio duration of ${durationSeconds.toFixed(2)} seconds.`);
  }
  return { start, end, duration: end - start };
};

const KEYFRAME_TOLERANCE_SECONDS = 0.001;

export const validateVideoTrimRange = (options: NormalizedMediaOptions, probe: VideoMediaProbe) => {
  const start = options.startSeconds;
  const end = options.endSeconds ?? probe.durationSeconds;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    throw new MediaProcessingError("INVALID_INPUT", "Choose a start before the end of the video.");
  }
  if (end > probe.durationSeconds + 0.02) {
    throw new MediaProcessingError("INVALID_INPUT", `The end position must be within the video duration of ${probe.durationSeconds.toFixed(2)} seconds.`);
  }
  const keyframes = probe.videoStreams[0]?.keyframeTimestamps ?? [];
  const keyframe = keyframes.find((timestamp) => Math.abs(timestamp - start) <= KEYFRAME_TOLERANCE_SECONDS);
  if (keyframe === undefined) {
    throw new MediaProcessingError("KEYFRAME_BOUNDARY_REQUIRED", "Choose a start time at a verified video keyframe. This local version copies H.264 streams and does not re-encode between keyframes.");
  }
  return { start: keyframe, end, duration: end - keyframe };
};

export const buildTrimCommand = (inputPath: string, outputPath: string, options: NormalizedMediaOptions, probe: AudioMediaProbe, outputFormat: AudioOutputFormat): MediaCommand => {
  const range = validateTrimRange(options, probe.durationSeconds);
  const isWholeFile = range.start <= 0.001 && range.end >= probe.durationSeconds - 0.02;
  const streamCopy = isWholeFile && isCompatibleStream(probe, outputFormat);
  const args = isWholeFile
    ? ["-i", inputPath, ...mapAudio, ...getOutputArguments({ format: outputFormat, quality: options.quality, streamCopy }), outputPath]
    : ["-ss", numberForCommand(range.start), "-i", inputPath, "-t", numberForCommand(range.duration), ...mapAudio, ...getOutputArguments({ format: outputFormat, quality: options.quality, streamCopy: false }), outputPath];
  return { args, outputPath, strategy: streamCopy ? "stream-copy" : "encode" };
};

export const buildConverterCommand = (inputPath: string, outputPath: string, options: NormalizedMediaOptions, probe: AudioMediaProbe, outputFormat: AudioOutputFormat): MediaCommand => {
  const streamCopy = isCompatibleStream(probe, outputFormat);
  const args = ["-i", inputPath, ...mapAudio, ...getOutputArguments({ format: outputFormat, quality: options.quality, streamCopy }), outputPath];
  return { args, outputPath, strategy: streamCopy ? "stream-copy" : "encode" };
};

export const buildMergeCommand = (inputPaths: string[], outputPath: string, listPath: string, options: NormalizedMediaOptions, probes: AudioMediaProbe[], outputFormat: AudioOutputFormat): MediaCommand => {
  const canCopy = probes.length > 0
    && probes.every((probe) => isCompatibleStream(probe, outputFormat))
    && probes.slice(1).every((probe) => probe.detectedFormat === probes[0].detectedFormat && isSameStreamShape(probes[0], probe));
  if (canCopy) {
    const contents = inputPaths.map((path) => `file '${path}'`).join("\n");
    return {
      args: ["-f", "concat", "-safe", "0", "-i", listPath, ...mapAudio, ...getOutputArguments({ format: outputFormat, quality: options.quality, streamCopy: true }), outputPath],
      outputPath,
      supportFiles: [{ path: listPath, contents }],
      strategy: "stream-copy",
    };
  }

  const filterInputs = inputPaths.map((_, index) => `[${index}:a]aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo[a${index}]`).join(";");
  const concatInputs = inputPaths.map((_, index) => `[a${index}]`).join("");
  const filter = `${filterInputs};${concatInputs}concat=n=${inputPaths.length}:v=0:a=1[outa]`;
  const args = inputPaths.flatMap((path) => ["-i", path]);
  args.push("-filter_complex", filter, "-map", "[outa]", ...getOutputArguments({ format: outputFormat, quality: options.quality, streamCopy: false, sampleRate: 48000, channels: 2 }), outputPath);
  return { args, outputPath, strategy: "encode" };
};

export const buildCompressCommand = (inputPath: string, outputPath: string, options: NormalizedMediaOptions, outputFormat: AudioOutputFormat): MediaCommand => {
  const args = ["-i", inputPath, ...mapAudio, ...getOutputArguments({ format: outputFormat, quality: options.quality, streamCopy: false }), outputPath];
  return { args, outputPath, strategy: "encode" };
};

export const buildVideoToMp3Command = (inputPath: string, outputPath: string, options: NormalizedMediaOptions): MediaCommand => {
  const args = [
    "-i", inputPath,
    ...mapAudio,
    "-c:a", "libmp3lame",
    "-b:a", getQualityBitrate(options.quality, "mp3") ?? "128k",
    outputPath,
  ];
  return { args, outputPath, strategy: "encode" };
};

export const buildMovToMp4Command = (inputPath: string, outputPath: string): MediaCommand => {
  const args = [
    "-i", inputPath,
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-c", "copy",
    "-movflags", "+faststart",
    "-f", "mov",
    "-brand", "mp42",
    outputPath,
  ];
  return { args, outputPath, strategy: "stream-copy" };
};

export const buildVideoConverterCommand = (inputPath: string, outputPath: string, outputFormat: "mp4" | "mov"): MediaCommand => {
  const args = [
    "-i", inputPath,
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-c", "copy",
    "-movflags", "+faststart",
    "-f", "mov",
    "-brand", outputFormat === "mov" ? "qt  " : "mp42",
    outputPath,
  ];
  return { args, outputPath, strategy: "stream-copy" };
};

export const buildTrimVideoCommand = (inputPath: string, outputPath: string, options: NormalizedMediaOptions, probe: VideoMediaProbe): MediaCommand => {
  const range = validateVideoTrimRange(options, probe);
  const args = [
    "-ss", numberForCommand(range.start),
    "-i", inputPath,
    "-t", numberForCommand(range.duration),
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-c", "copy",
    "-avoid_negative_ts", "make_zero",
    "-movflags", "+faststart",
    "-f", "mov",
    "-brand", "mp42",
    outputPath,
  ];
  return { args, outputPath, strategy: "stream-copy" };
};

export const expectedCodecForOutput = (format: AudioOutputFormat) => getExpectedOutputCodec(format);

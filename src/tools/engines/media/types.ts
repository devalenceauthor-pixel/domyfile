export const mediaToolSlugs = [
  "trim-audio",
  "trim-video",
  "audio-converter",
  "merge-audio",
  "compress-audio",
  "video-to-mp3",
  "mov-to-mp4",
  "video-converter",
] as const;

export type MediaToolSlug = (typeof mediaToolSlugs)[number];

export type AudioInputFormat = "mp3" | "wav" | "m4a" | "aac" | "flac" | "ogg";
export type AudioOutputFormat = "mp3" | "wav" | "m4a" | "flac" | "ogg";
export type VideoInputFormat = "mp4" | "mov";
export type VideoOutputFormat = "mp4" | "mov";
export type MediaOutputFormat = AudioOutputFormat | VideoOutputFormat;
export type AudioQualityPreset = "smaller" | "balanced" | "higher";

export type MediaSignature = {
  container: AudioInputFormat | VideoInputFormat | "unknown";
  majorBrand?: string;
  compatibleBrands?: string[];
};

export type MediaStreamProbe = {
  type: "audio" | "video";
  codec: string;
  durationSeconds?: number;
  sampleRate?: number;
  channels?: number;
  bitRate?: number;
  width?: number;
  height?: number;
  codecTag?: string;
  keyframeTimestamps?: number[];
};

export type MediaOptions = {
  tool: MediaToolSlug;
  startSeconds?: number | string;
  endSeconds?: number | string;
  outputFormat?: MediaOutputFormat | string;
  quality?: AudioQualityPreset | string;
};

export type NormalizedMediaOptions = {
  tool: MediaToolSlug;
  startSeconds: number;
  endSeconds?: number;
  outputFormat?: MediaOutputFormat;
  quality: AudioQualityPreset;
};

type MediaProbeBase = {
  container: string;
  formatName: string;
  codec: string;
  durationSeconds: number;
  sampleRate?: number;
  channels?: number;
  bitRate?: number;
  hasOnlyAudio: boolean;
  hasAudio: boolean;
  hasVideo: boolean;
  audioStreams: MediaStreamProbe[];
  videoStreams: MediaStreamProbe[];
  otherStreamCount: number;
  signature: MediaSignature;
};

export type AudioMediaProbe = MediaProbeBase & {
  kind: "audio";
  detectedFormat: AudioInputFormat;
};

export type VideoMediaProbe = MediaProbeBase & {
  kind: "video";
  detectedFormat: VideoInputFormat | null;
  detectedAudioFormat?: AudioInputFormat;
};

export type MediaProbe = AudioMediaProbe | VideoMediaProbe;

export type MediaProcessStrategy = "stream-copy" | "encode";

export type MediaProcessItem = {
  input: File;
  output: File;
  format: MediaOutputFormat;
  mime: string;
  codec: string;
  strategy: MediaProcessStrategy;
  inputBytes: number;
  outputBytes: number;
  inputDurationSeconds: number;
  outputDurationSeconds: number;
  inputAudioStreams: number;
  outputAudioStreams: number;
  inputVideoStreams: number;
  outputVideoStreams: number;
  videoWidth?: number;
  videoHeight?: number;
  sizeReductionPercent?: number;
};

export type MediaValidationIssue = {
  file: File;
  code: MediaErrorCode;
  message: string;
};

export type MediaValidationResult = {
  valid: boolean;
  issues: MediaValidationIssue[];
};

export type MediaProcessFailure = {
  input: File;
  error: MediaProcessingError;
};

export type MediaProcessResult = {
  items: MediaProcessItem[];
  failures: MediaProcessFailure[];
};

export type MediaProgressCallback = (progress: number) => void;

export type MediaErrorCode =
  | "UNSUPPORTED_FORMAT"
  | "INVALID_INPUT"
  | "CORRUPT_FILE"
  | "ENGINE_LOAD_FAILED"
  | "PROCESSING_FAILED"
  | "OUT_OF_MEMORY_RISK"
  | "CANCELLED"
  | "NOT_SMALLER"
  | "NO_AUDIO_STREAM"
  | "UNSUPPORTED_CONTAINER"
  | "UNSUPPORTED_STREAM_LAYOUT"
  | "INCOMPATIBLE_VIDEO_CODEC"
  | "INCOMPATIBLE_AUDIO_CODEC"
  | "KEYFRAME_BOUNDARY_REQUIRED";

export class MediaProcessingError extends Error {
  readonly code: MediaErrorCode;
  readonly userMessage: string;
  readonly cause?: unknown;

  constructor(code: MediaErrorCode, userMessage: string, cause?: unknown) {
    super(userMessage);
    this.name = "MediaProcessingError";
    this.code = code;
    this.userMessage = userMessage;
    this.cause = cause;
  }
}

export interface MediaEngine {
  inspect(file: File, signal?: AbortSignal, tool?: MediaToolSlug): Promise<MediaProbe>;
  validate(files: File[], options: MediaOptions): Promise<MediaValidationResult>;
  process(files: File[], options: MediaOptions, signal?: AbortSignal, onProgress?: MediaProgressCallback): Promise<MediaProcessResult>;
  dispose(): void;
}

import type {
  AudioInputFormat,
  AudioMediaProbe,
  AudioOutputFormat,
  MediaOutputFormat,
  MediaProbe,
  MediaSignature,
  VideoInputFormat,
  VideoMediaProbe,
  VideoOutputFormat,
} from "./types";

export type AudioFormatDefinition = {
  label: string;
  extension: string;
  mime: string;
  containers: string[];
  inputCodecs: string[];
  outputCodec: string;
  outputCodecLabel: string;
};

export type VideoFormatDefinition = {
  label: string;
  extension: string;
  mime: string;
  containers: VideoInputFormat[];
  inputCodecs: string[];
  outputCodec: string;
  outputCodecLabel: string;
};

export const audioFormats: Record<AudioInputFormat, AudioFormatDefinition> = {
  mp3: {
    label: "MP3",
    extension: "mp3",
    mime: "audio/mpeg",
    containers: ["mp3"],
    inputCodecs: ["mp3"],
    outputCodec: "libmp3lame",
    outputCodecLabel: "MP3",
  },
  wav: {
    label: "WAV",
    extension: "wav",
    mime: "audio/wav",
    containers: ["wav"],
    inputCodecs: ["pcm_s16le", "pcm_s16be", "pcm_s24le", "pcm_s24be", "pcm_s32le", "pcm_f32le", "pcm_f64le"],
    outputCodec: "pcm_s16le",
    outputCodecLabel: "PCM 16-bit",
  },
  m4a: {
    label: "M4A (AAC)",
    extension: "m4a",
    mime: "audio/mp4",
    containers: ["mov", "mp4", "m4a"],
    inputCodecs: ["aac"],
    outputCodec: "aac",
    outputCodecLabel: "AAC",
  },
  aac: {
    label: "AAC",
    extension: "aac",
    mime: "audio/aac",
    containers: ["aac"],
    inputCodecs: ["aac"],
    outputCodec: "aac",
    outputCodecLabel: "AAC",
  },
  flac: {
    label: "FLAC",
    extension: "flac",
    mime: "audio/flac",
    containers: ["flac"],
    inputCodecs: ["flac"],
    outputCodec: "flac",
    outputCodecLabel: "FLAC",
  },
  ogg: {
    label: "OGG (Vorbis)",
    extension: "ogg",
    mime: "audio/ogg",
    containers: ["ogg"],
    inputCodecs: ["vorbis"],
    outputCodec: "vorbis",
    outputCodecLabel: "Vorbis",
  },
};

export const videoFormats: Record<VideoOutputFormat, VideoFormatDefinition> = {
  mp4: {
    label: "MP4",
    extension: "mp4",
    mime: "video/mp4",
    containers: ["mp4", "mov"],
    inputCodecs: ["h264"],
    outputCodec: "copy",
    outputCodecLabel: "H.264 stream copy",
  },
  mov: {
    label: "MOV",
    extension: "mov",
    mime: "video/quicktime",
    containers: ["mp4", "mov"],
    inputCodecs: ["h264"],
    outputCodec: "copy",
    outputCodecLabel: "H.264 stream copy",
  },
};

export const advertisedAudioInputFormats: AudioInputFormat[] = ["mp3", "wav", "m4a", "aac", "flac", "ogg"];
export const advertisedAudioOutputFormats: AudioOutputFormat[] = ["mp3", "wav", "m4a", "flac", "ogg"];
export const advertisedVideoInputFormats: VideoInputFormat[] = ["mp4", "mov"];
export const advertisedVideoOutputFormats: VideoOutputFormat[] = ["mp4", "mov"];

export const audioInputExtensions = advertisedAudioInputFormats.map((format) => audioFormats[format].extension);
export const audioInputMimes = advertisedAudioInputFormats.map((format) => audioFormats[format].mime);
export const videoInputExtensions = ["mp4", "mov"];
export const videoInputMimes = ["video/mp4", "video/quicktime"];

const normalizedFormatName = (value: string) => value.toLowerCase().split(",").map((part) => part.trim());

const includesContainer = (formatName: string, containers: string[]) => {
  const names = normalizedFormatName(formatName);
  return containers.some((container) => names.includes(container));
};

const ascii = (bytes: Uint8Array, offset: number, length: number) => {
  if (offset + length > bytes.length) return "";
  return String.fromCharCode(...bytes.slice(offset, offset + length));
};

const readUint32 = (bytes: Uint8Array, offset: number) => (
  bytes[offset] * 0x1000000
  + bytes[offset + 1] * 0x10000
  + bytes[offset + 2] * 0x100
  + bytes[offset + 3]
);

const knownMp4Brands = new Set([
  "isom",
  "iso2",
  "iso3",
  "iso4",
  "iso5",
  "iso6",
  "mp41",
  "mp42",
  "avc1",
  "mp71",
  "M4V ",
  "M4A ",
  "dash",
  "cmfc",
  "cmff",
  "msnv",
  "F4V ",
]);

const readIsoBmffSignature = (bytes: Uint8Array): MediaSignature | null => {
  if (bytes.length < 16 || ascii(bytes, 4, 4) !== "ftyp") return null;
  const declaredSize = readUint32(bytes, 0);
  const boxEnd = declaredSize >= 16 && declaredSize <= bytes.length ? declaredSize : bytes.length;
  const majorBrand = ascii(bytes, 8, 4);
  const compatibleBrands: string[] = [];
  for (let offset = 16; offset + 4 <= boxEnd; offset += 4) {
    const brand = ascii(bytes, offset, 4);
    if (brand) compatibleBrands.push(brand);
  }
  const brands = [majorBrand, ...compatibleBrands];
  const isMov = majorBrand === "qt  " || compatibleBrands.includes("qt  ");
  const isMp4 = brands.some((brand) => knownMp4Brands.has(brand));
  return {
    container: isMov ? "mov" : isMp4 ? "mp4" : "unknown",
    majorBrand,
    compatibleBrands,
  };
};

export const detectMediaSignature = (bytes: Uint8Array, fileName = "", mime = ""): MediaSignature => {
  const isoBmff = readIsoBmffSignature(bytes);
  if (isoBmff) return isoBmff;

  const audioFormat = detectAudioMimeFromSignature(bytes, fileName, mime);
  if (audioFormat === "mpeg") return { container: "mp3" };
  if (audioFormat) return { container: audioFormat };
  return { container: "unknown" };
};

export const detectVideoContainerFromSignature = (bytes: Uint8Array, fileName = "", mime = ""): VideoInputFormat | null => {
  const signature = detectMediaSignature(bytes, fileName, mime);
  return signature.container === "mp4" || signature.container === "mov" ? signature.container : null;
};

export const detectAudioMimeFromSignature = (bytes: Uint8Array, fileName = "", mime = "") => {
  if (bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) return "wav" as const;
  if (bytes.length >= 4 && bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43) return "flac" as const;
  if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return "m4a" as const;
  if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return "ogg" as const;
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return "mp3" as const;

  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  const lowerMime = mime.toLowerCase();
  if (extension === "aac" || lowerMime === "audio/aac") return "aac" as const;
  if (extension === "mp3" || lowerMime === "audio/mpeg") return "mp3" as const;

  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "mpeg" as const;
  return null;
};

export const formatFromProbe = (probe: Pick<MediaProbe, "container" | "formatName" | "codec">): AudioInputFormat | null => {
  const codec = probe.codec.toLowerCase();
  const formatName = probe.formatName || probe.container;
  if (codec === "mp3" && includesContainer(formatName, audioFormats.mp3.containers)) return "mp3";
  if (codec.startsWith("pcm_") && includesContainer(formatName, audioFormats.wav.containers)) return "wav";
  if (codec === "aac" && includesContainer(formatName, audioFormats.m4a.containers)) return "m4a";
  if (codec === "aac" && includesContainer(formatName, audioFormats.aac.containers)) return "aac";
  if (codec === "flac" && includesContainer(formatName, audioFormats.flac.containers)) return "flac";
  if (codec === "vorbis" && includesContainer(formatName, audioFormats.ogg.containers)) return "ogg";
  return null;
};

export const isSupportedInputProbe = (probe: MediaProbe): probe is AudioMediaProbe => probe.kind === "audio"
  && advertisedAudioInputFormats.includes(probe.detectedFormat)
  && probe.hasOnlyAudio;

export const isSupportedVideoProbe = (probe: MediaProbe): probe is VideoMediaProbe => probe.kind === "video"
  && probe.detectedFormat !== null
  && advertisedVideoInputFormats.includes(probe.detectedFormat);

export const isOutputFormat = (value: string | undefined): value is AudioOutputFormat => Boolean(value && advertisedAudioOutputFormats.includes(value as AudioOutputFormat));

export const isMediaOutputFormat = (value: string | undefined): value is MediaOutputFormat => isOutputFormat(value)
  || Boolean(value && advertisedVideoOutputFormats.includes(value as VideoOutputFormat));

export const outputFormatForInput = (input: AudioInputFormat): AudioOutputFormat => input === "aac" ? "m4a" : input;

export const outputFormatLabel = (format: MediaOutputFormat) => format === "mp4" || format === "mov"
  ? videoFormats[format].label
  : audioFormats[format].label;

export const getExpectedOutputCodec = (format: AudioOutputFormat) => audioFormats[format].outputCodec === "libmp3lame"
  ? "mp3"
  : audioFormats[format].outputCodec;

export const getOutputMime = (format: MediaOutputFormat) => format === "mp4" || format === "mov" ? videoFormats[format].mime : audioFormats[format].mime;

export const getOutputExtension = (format: MediaOutputFormat) => format === "mp4" || format === "mov" ? videoFormats[format].extension : audioFormats[format].extension;

export const isCompatibleStream = (probe: AudioMediaProbe, output: AudioOutputFormat) => {
  if (output === "mp3") return probe.detectedFormat === "mp3" && probe.codec === "mp3";
  if (output === "wav") return probe.detectedFormat === "wav" && probe.codec.startsWith("pcm_");
  if (output === "m4a") return ["m4a", "aac"].includes(probe.detectedFormat) && probe.codec === "aac";
  if (output === "flac") return probe.detectedFormat === "flac" && probe.codec === "flac";
  if (output === "ogg") return probe.detectedFormat === "ogg" && probe.codec === "vorbis";
  return false;
};

export const isSameStreamShape = (left: AudioMediaProbe, right: AudioMediaProbe) => left.codec === right.codec
  && left.sampleRate !== undefined
  && right.sampleRate !== undefined
  && left.channels !== undefined
  && right.channels !== undefined
  && left.sampleRate === right.sampleRate
  && left.channels === right.channels;

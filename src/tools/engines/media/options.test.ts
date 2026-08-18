import { describe, expect, it } from "vitest";
import { buildConverterCommand, buildMergeCommand, buildMovToMp4Command, buildTrimCommand, buildTrimVideoCommand, buildVideoConverterCommand, buildVideoToMp3Command, normalizeMediaOptions, resolveOutputFormat, validateTrimRange, validateVideoTrimRange } from "./options";
import type { MediaProbe } from "./types";

const mp3Probe: MediaProbe = {
  kind: "audio",
  container: "mp3",
  formatName: "mp3",
  codec: "mp3",
  durationSeconds: 2,
  sampleRate: 44100,
  channels: 1,
  hasOnlyAudio: true,
  hasAudio: true,
  hasVideo: false,
  audioStreams: [{ type: "audio", codec: "mp3", sampleRate: 44100, channels: 1, durationSeconds: 2 }],
  videoStreams: [],
  otherStreamCount: 0,
  signature: { container: "mp3" },
  detectedFormat: "mp3",
};

const wavProbe: MediaProbe = {
  kind: "audio",
  container: "wav",
  formatName: "wav",
  codec: "pcm_s16le",
  durationSeconds: 1,
  sampleRate: 44100,
  channels: 1,
  hasOnlyAudio: true,
  hasAudio: true,
  hasVideo: false,
  audioStreams: [{ type: "audio", codec: "pcm_s16le", sampleRate: 44100, channels: 1, durationSeconds: 1 }],
  videoStreams: [],
  otherStreamCount: 0,
  signature: { container: "wav" },
  detectedFormat: "wav",
};

const videoProbe: MediaProbe = {
  kind: "video",
  container: "mov,mp4,m4a,3gp,3g2,mj2",
  formatName: "mov,mp4,m4a,3gp,3g2,mj2",
  codec: "h264",
  durationSeconds: 4,
  hasOnlyAudio: false,
  hasAudio: true,
  hasVideo: true,
  audioStreams: [{ type: "audio", codec: "aac", durationSeconds: 4 }],
  videoStreams: [{ type: "video", codec: "h264", durationSeconds: 4, width: 160, height: 90, keyframeTimestamps: [0, 2] }],
  otherStreamCount: 0,
  signature: { container: "mp4" },
  detectedFormat: "mp4",
  detectedAudioFormat: "m4a",
};

describe("application-defined audio command templates", () => {
  it("rejects invalid trim ranges before creating a command", () => {
    const options = normalizeMediaOptions("trim-audio", { tool: "trim-audio", startSeconds: 1.5, endSeconds: 1 });
    expect(() => validateTrimRange(options, 2)).toThrow("start before the end");
  });

  it("keeps negative and nonnumeric trim endpoints invalid", () => {
    expect(() => validateTrimRange(normalizeMediaOptions("trim-audio", { tool: "trim-audio", endSeconds: -1 }), 2)).toThrow("start before the end");
    expect(() => validateTrimRange(normalizeMediaOptions("trim-audio", { tool: "trim-audio", endSeconds: "not-a-number" }), 2)).toThrow("start before the end");
  });

  it("uses an encode path for an exact partial trim and never accepts raw args", () => {
    const options = normalizeMediaOptions("trim-audio", { tool: "trim-audio", startSeconds: 0.25, endSeconds: 0.75, outputFormat: "wav" });
    const command = buildTrimCommand("/job-input.mp3", "/job-output.wav", options, mp3Probe, "wav");
    expect(command.strategy).toBe("encode");
    expect(command.args).toContain("-ss");
    expect(command.args).toContain("pcm_s16le");
    expect(command.args).not.toContain("-filter_complex");
  });

  it("uses the verified native Vorbis template for OGG output", () => {
    const options = normalizeMediaOptions("audio-converter", { tool: "audio-converter", outputFormat: "ogg" });
    const command = buildConverterCommand("/job-input.wav", "/job-output.ogg", options, wavProbe, "ogg");
    expect(command.strategy).toBe("encode");
    expect(command.args).toEqual(expect.arrayContaining(["-c:a", "vorbis", "-ac", "2", "-strict", "-2"]));
    expect(command.args).not.toContain("libvorbis");
  });

  it("uses stream copy for a safe same-format full-file conversion", () => {
    const options = normalizeMediaOptions("audio-converter", { tool: "audio-converter", outputFormat: "mp3" });
    const command = buildConverterCommand("/job-input.mp3", "/job-output.mp3", options, mp3Probe, "mp3");
    expect(command.strategy).toBe("stream-copy");
    expect(command.args).toEqual(expect.arrayContaining(["-c:a", "copy"]));
  });

  it("falls back to a normalized concat encode for incompatible merge inputs", () => {
    const options = normalizeMediaOptions("merge-audio", { tool: "merge-audio", outputFormat: "mp3", quality: "balanced" });
    const command = buildMergeCommand(["/job-a.wav", "/job-b.mp3"], "/job-output.mp3", "/job-list.txt", options, [wavProbe, mp3Probe], "mp3");
    expect(command.strategy).toBe("encode");
    expect(command.args).toContain("-filter_complex");
    expect(command.supportFiles).toBeUndefined();
  });

  it("keeps a compatible merge on the stream-copy path", () => {
    const options = normalizeMediaOptions("merge-audio", { tool: "merge-audio", outputFormat: "mp3" });
    const command = buildMergeCommand(["/job-a.mp3", "/job-b.mp3"], "/job-output.mp3", "/job-list.txt", options, [mp3Probe, { ...mp3Probe, durationSeconds: 1 }], "mp3");
    expect(command.strategy).toBe("stream-copy");
    expect(command.supportFiles?.[0]?.contents).toContain("file '/job-a.mp3'");
  });

  it("encodes mixed AAC containers instead of using concat stream copy", () => {
    const options = normalizeMediaOptions("merge-audio", { tool: "merge-audio", outputFormat: "m4a" });
    const aacProbe: MediaProbe = { ...mp3Probe, container: "aac", formatName: "aac", codec: "aac", detectedFormat: "aac" };
    const m4aProbe: MediaProbe = { ...aacProbe, container: "mov,mp4,m4a", formatName: "mov,mp4,m4a", detectedFormat: "m4a" };
    const command = buildMergeCommand(["/job-a.aac", "/job-b.m4a"], "/job-output.m4a", "/job-list.txt", options, [aacProbe, m4aProbe], "m4a");
    expect(command.strategy).toBe("encode");
    expect(command.args).toContain("-filter_complex");
  });

  it("extracts MP3 audio without adding a video decode or encode path", () => {
    const options = normalizeMediaOptions("video-to-mp3", { tool: "video-to-mp3", quality: "higher" });
    const command = buildVideoToMp3Command("/job-input.mov", "/job-output.mp3", options);
    expect(command.strategy).toBe("encode");
    expect(command.args).toEqual(expect.arrayContaining(["-map", "0:a:0", "-vn", "-c:a", "libmp3lame", "-b:a", "192k"]));
    expect(command.args).not.toContain("-c:v");
  });

  it("builds MOV to MP4 as a branded stream-copy remux", () => {
    const command = buildMovToMp4Command("/job-input.mov", "/job-output.mp4");
    expect(command.strategy).toBe("stream-copy");
    expect(command.args).toEqual(expect.arrayContaining(["-c", "copy", "-f", "mov", "-brand", "mp42"]));
    expect(command.args).not.toContain("-c:v");
  });

  it("builds Video Converter as an explicit MP4/MOV stream-copy remux", () => {
    const options = normalizeMediaOptions("video-converter", { tool: "video-converter", outputFormat: "mov" });
    expect(resolveOutputFormat("video-converter", videoProbe, options)).toBe("mov");
    const command = buildVideoConverterCommand("/job-input.mp4", "/job-output.mov", "mov");
    expect(command.strategy).toBe("stream-copy");
    expect(command.args).toEqual(expect.arrayContaining(["-c", "copy", "-f", "mov", "-brand", "qt  "]));
    expect(command.args).not.toContain("-c:v");
  });

  it("builds Trim Video as a keyframe-aligned stream-copy command", () => {
    const options = normalizeMediaOptions("trim-video", { tool: "trim-video", startSeconds: 2, endSeconds: 3 });
    const command = buildTrimVideoCommand("/job-input.mp4", "/job-output.mp4", options, videoProbe);
    expect(command.strategy).toBe("stream-copy");
    expect(command.args).toEqual(expect.arrayContaining(["-ss", "2", "-t", "1", "-c", "copy", "-map", "0:v:0", "-map", "0:a:0?", "-brand", "mp42"]));
    expect(command.args).not.toContain("-c:v");
  });

  it("rejects Trim Video starts that are not verified keyframes", () => {
    const options = normalizeMediaOptions("trim-video", { tool: "trim-video", startSeconds: 1.25, endSeconds: 2.75 });
    expect(() => validateVideoTrimRange(options, videoProbe as Extract<MediaProbe, { kind: "video" }>)).toThrow("verified video keyframe");
  });
});

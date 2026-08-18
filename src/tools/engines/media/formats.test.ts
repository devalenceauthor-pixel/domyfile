import { describe, expect, it } from "vitest";
import { detectAudioMimeFromSignature, detectMediaSignature, formatFromProbe, getOutputExtension, getOutputMime } from "./formats";

describe("verified audio format detection", () => {
  it("recognizes the shipped fixture signatures", () => {
    expect(detectAudioMimeFromSignature(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]), "tone.wav")).toBe("wav");
    expect(detectAudioMimeFromSignature(new Uint8Array([0x66, 0x4c, 0x61, 0x43]), "tone.flac")).toBe("flac");
    expect(detectAudioMimeFromSignature(new Uint8Array([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70]), "tone.m4a")).toBe("m4a");
    expect(detectAudioMimeFromSignature(new Uint8Array([0x49, 0x44, 0x33]), "tone.mp3")).toBe("mp3");
    expect(detectAudioMimeFromSignature(new Uint8Array([0xff, 0xf1, 0x50, 0x80]), "tone.aac")).toBe("aac");
    expect(detectAudioMimeFromSignature(new Uint8Array([0x4f, 0x67, 0x67, 0x53]), "tone.ogg")).toBe("ogg");
  });

  it("maps FFmpeg probe results to the public input matrix", () => {
    expect(formatFromProbe({ container: "mp3", formatName: "mp3", codec: "mp3" })).toBe("mp3");
    expect(formatFromProbe({ container: "wav", formatName: "wav", codec: "pcm_s16le" })).toBe("wav");
    expect(formatFromProbe({ container: "mov,mp4,m4a,3gp,3g2,mj2", formatName: "mov,mp4,m4a,3gp,3g2,mj2", codec: "aac" })).toBe("m4a");
    expect(formatFromProbe({ container: "aac", formatName: "aac", codec: "aac" })).toBe("aac");
    expect(formatFromProbe({ container: "flac", formatName: "flac", codec: "flac" })).toBe("flac");
    expect(formatFromProbe({ container: "ogg", formatName: "ogg", codec: "vorbis" })).toBe("ogg");
  });

  it("distinguishes MP4 and QuickTime MOV signatures without trusting extensions", () => {
    const mov = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20, 0, 0, 0, 0, 0x71, 0x74, 0x20, 0x20]);
    const mp4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0, 0x6d, 0x70, 0x34, 0x32]);
    expect(detectMediaSignature(mov, "renamed.mp4").container).toBe("mov");
    expect(detectMediaSignature(mp4, "renamed.mov").container).toBe("mp4");
  });

  it("does not classify a WebM signature as an accepted video container", () => {
    expect(detectMediaSignature(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), "clip.webm").container).toBe("unknown");
  });

  it("keeps video output containers explicit", () => {
    expect(getOutputMime("mp4")).toBe("video/mp4");
    expect(getOutputMime("mov")).toBe("video/quicktime");
    expect(getOutputExtension("mov")).toBe("mov");
  });
});

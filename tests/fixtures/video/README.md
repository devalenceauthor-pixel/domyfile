# Browser video fixtures

These small files are real media fixtures used by the browser release tests.

The production browser matrix is intentionally narrow:

- Video to MP3 accepts an ISO-BMFF MP4 or QuickTime MOV signature containing
  exactly one H.264 video stream and one AAC audio stream.
- MOV to MP4 accepts a QuickTime MOV signature containing exactly one H.264
  video stream and zero or one AAC audio stream. The output is a stream-copy
  remux with an MP4-compatible `mp42` brand; it is never silently re-encoded.
- Trim Video accepts the same MP4/MOV H.264 matrix with optional AAC audio,
  but only when the requested start is a verified video keyframe. Its output
  is an MP4 stream-copy trim; between-keyframe starts are rejected.

The remaining files exercise no-audio, incompatible video/audio codecs, and an
unsupported WebM container. The fixture generator uses the host FFmpeg
encoders only to create test data; no host codec or encoder is linked into the
browser runtime or shipped to users.

Trim Video feasibility fixtures are four-second H.264 files with a deliberate
two-second keyframe interval:

- `trim-mp4-h264-aac.mp4` and `trim-mov-h264-aac.mov` contain one H.264 video
  stream and one AAC audio stream.
- `trim-mp4-h264-no-audio.mp4` and `trim-mov-h264-no-audio.mov` contain one
  H.264 video stream and no audio stream.

They are used to verify that stream-copy trimming cannot claim exact arbitrary
cuts: a request such as `1.25–2.75` starts at a keyframe boundary instead of
the requested frame when no video decoder/encoder is available.

Regenerate them with:

```text
node scripts/generate-video-fixtures.mjs
```

Trim fixtures can be regenerated with:

```text
node scripts/generate-trim-fixtures.mjs
```

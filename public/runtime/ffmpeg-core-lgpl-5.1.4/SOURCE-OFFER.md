# Corresponding source and redistribution

The files in this directory are built from the exact source revisions and
build-time patches recorded in:

- `reports/ffmpeg-lgpl-core.md`
- `scripts/ffmpeg-lgpl-core/BUILD.md`

The build inputs are FFmpeg `n5.1.4` (commit
`4729204c17f756e186d622060088371d10b34f7e`), ffmpeg.wasm `v0.12.10` (commit
`c3a763857c5e615ae8674715ad5e4f63ff469e9d`), LAME `3.100` (commit
`2badea1974ae36cb8312afe99cff1e6b3b5decee`), and Emscripten `3.1.40`
(commit `5c27e79dd0a9c4e27ef2326841698cdd4f6b5784`).

For a public release, DoMyFile must publish machine-readable corresponding
source for the exact runtime, including the FFmpeg source, LAME encoder source,
ffmpeg.wasm glue changes, the FFmpeg configure line, build scripts, and the
changes needed to produce these hashes. The source must be offered from a
stable release URL alongside this versioned runtime. The local build checkout
is not itself a public source offer until the release process publishes it.

The LGPL obligations, source-offer location, and any obligations for a hosted
release must be reviewed by counsel before commercial distribution. Codec
patent and royalty questions are separate from LGPL compliance.

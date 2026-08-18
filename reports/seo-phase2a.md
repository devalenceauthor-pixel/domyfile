# DoMyFile Phase 2A SEO preparation

This phase fixes category-page static relevance and records factual inputs for
the later tool-page copy pass. It does not rewrite the 29 tool pages.

## Category rendering

Category catalogs now render only the tools in their registry category before
client JavaScript runs:

- `/image/`: 10 image tools
- `/pdf/`: 10 PDF tools
- `/audio/`: 4 audio tools
- `/video/`: 5 video tools
- `/tools/`: all 29 production-ready tools

Each category includes a short static explanation of its task scope, formats,
common intents, and browser versus temporary-server processing boundary. The
category pages no longer expose a cross-category filter; `/tools/` retains the
complete catalog and category filters.

## Factual content matrix

The structured source of truth is
`src/content/tool-content.json`, with typed accessors in
`src/content/tool-content.ts`. It contains one entry for every production-ready
tool and records accepted input, output, processing mode, controls, batch
behavior, limitations, compatibility considerations, result behavior, FAQ
topics, related tools, long-tail opportunity, and canonical decision.

The matrix is preparation for Phase 2B. Its per-tool facts are not rendered as
a 29-page copy rewrite in this phase.

## Intent decisions

- `mov-to-mp4` remains the directional MOV → MP4 stream-copy route.
- `video-converter` remains the broader verified MP4/MOV container-remux route
  with a user-selected MP4 or MOV output.
- `compress-image` and `resize-image` remain separate: encoding/file-size
  reduction versus pixel-dimension changes.
- `merge-pdf`, `split-pdf`, `organize-pdf`, `rotate-pdf`, and `watermark-pdf`
  remain separate multi-document, range, page-arrangement, orientation, and
  overlay workflows.
- `trim-audio`, `merge-audio`, `compress-audio`, and `audio-converter` remain
  separate time-range, multi-track, bitrate, and format workflows.
- JPG/PNG/WebP-to-PDF routes remain focused input-format routes with distinct
  accepted inputs. No additional pair was found to have effectively identical
  functionality and intent.

## Related-tool graph

Every tool now renders exactly three matrix-defined related-tool links using
descriptive tool names. The graph includes contextual conversion handoffs for
HEIC to JPG, PDF page workflows for Organize/Rotate/Watermark PDF, and inbound
links to Video Converter. Static verification confirms every tool has at least
one contextual inbound related-tool link.

## Phase 2B gate

Before the full copy rewrite, review the matrix against any newly changed
processor behavior and resolve the existing Phase 1 Cloudflare `pages.dev`
legacy-route redirect chain documented in `reports/seo-phase1.md`.

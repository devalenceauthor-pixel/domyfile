# SEO Phase 2B report

Date: 2026-08-18

## Scope

Phase 2B rewrites the static on-page SEO layer for the 29 production-ready tool routes. Processing engines, options, validation, route paths, redirect rules, and file-handling behavior were not changed.

The factual source remains src/content/tool-content.json, with its typed access layer in src/content/tool-content.ts. Each entry now also contains:

- a unique page title, meta description, and H1;
- a task-specific intro and summary;
- three operation-specific workflow steps;
- exact FAQ questions and factual answers;
- precise browser-local or temporary-server privacy wording.

The shared ToolPage renderer displays the matrix's input/output, controls, batch behavior, quality and compatibility notes, limitations, result behavior, privacy statement, FAQs, and Phase 2A related-tool links.

## Intent differentiation

- Compress Image owns file-size and encoding tradeoffs while preserving dimensions by default. Resize Image owns pixel dimensions and percentage scaling. Crop Image owns visual framing.
- MOV to MP4 owns the one-way compatible MOV-to-MP4 remux intent. Video Converter owns the broader verified MP4/MOV container workflow with a selectable MP4 or MOV output.
- Merge PDF combines documents; Split PDF extracts one contiguous page range; Organize PDF changes page order, membership, or duplication; Rotate PDF changes page orientation; Watermark PDF applies a visible text or image overlay.
- Trim Audio owns time ranges; Merge Audio joins tracks; Compress Audio targets bitrate and file size; Audio Converter owns the broader verified format workflow.
- JPG to PDF, PNG to PDF, and WebP to PDF remain separate source-format routes with matching input-specific content.
- Image format routes remain directional and source-specific; no keyword-variant routes were added.

The Phase 2A related-tool graph remains the source of truth: three contextual links per tool, descriptive tool-card anchors, and at least one contextual inbound link to every tool.

## Duplication audit

The pre-rewrite static baseline had 87 FAQ questions across 29 pages, only 23 unique questions, and 20 pages using the same three generic Phase 1 questions. The same three-word-shingle Jaccard audit across the static SEO, facts, and FAQ sections reported a highest similarity of 0.935 and an average of 0.402.

The Phase 2B build has 116 FAQ questions, all 116 unique. The highest pair similarity is 0.249 (png-to-jpg and webp-to-jpg) and the average is 0.057. No generic Phase 1 FAQ questions remain.

## Metadata and structured data

All 29 tool pages render unique titles, meta descriptions, and H1s from the matrix. Canonical URLs and og:url behavior remain unchanged. Tool WebApplication descriptions now use the visible matrix-driven intro; BreadcrumbList markup and visible breadcrumbs remain in place.

## Verification

- pnpm check
- pnpm lint
- pnpm build
- pnpm verify:phase2b
- pnpm verify:phase2a
- pnpm verify:seo

No processing regression suite, media E2E check, or browser processing test was run.

## Remaining Phase 2 issues

No Phase 2B content, metadata, FAQ, related-link, or static-rendering blocker remains from the scoped audit. The previously documented Cloudflare legacy-host redirect-chain exception remains an infrastructure item outside this content pass.

# Design - DoMyFile

**Status:** Ready for implementation  
**Version:** 1.1  
**Last updated:** 2026-08-17  
**Source of truth for:** visual language, layout, interaction patterns, responsive behavior, UI states, motion, and interface copy.

> Product behavior belongs in `prd.md`. Technical implementation belongs in `architecture.md`.

## 1. Brand Identity

**Product name:** DoMyFile  
**Preferred wordmark:** `domyfile` in lowercase when used as the visual logo  
**Product tagline:** `Simple file tools that just work.`

Naming rules:

- Use **DoMyFile** in page titles, metadata, prose, legal text, and accessibility labels.
- The lowercase **domyfile** form is reserved for the visual wordmark/logo treatment.
- Do not shorten the brand to `DMF`, `DoFile`, or `MyFile`.
- The brand should feel practical and memorable rather than corporate or playful.

## 2. Direction

Use a **Minimal Utility / Technical Editorial** visual language.

The product should feel:

- useful before decorative;
- modern, calm, and premium;
- technical without becoming developer-only;
- spacious without wasting space;
- consistent across Image, PDF, Audio, and Video.

Reference `yogathedev.com` for its typography hierarchy, selective gradient text, whitespace, restrained technical graphics, and product-oriented presentation. Adapt the principles, not the exact layout or branding.

## 3. Design Principles

1. **Utility first.** Every tool prioritizes `select → configure → process → download`.
2. **One system.** Shared shell, upload zone, controls, states, spacing, buttons, and result patterns across all tools.
3. **Short hierarchy.** One strong heading, one short explanation, one obvious primary action.
4. **Product-related graphics.** Decorative resources should reference files, formats, compression, pages, dimensions, timelines, conversion, or results.
5. **Gradients are accents.** Never let gradient treatment dominate functional UI.
6. **Progressive disclosure.** Show only options needed for the current task.
7. **Mobile is first-class.** No desktop-only flow or hover dependency.

Avoid:

```text
generic AI startup visuals
rainbow gradients
heavy glassmorphism
cartoon SaaS illustrations
large decorative blobs
dense dashboard styling
excessive shadows
oversized pill UI
```

## 4. Color System

V1 is light-first.

### Neutrals

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F8FAFC` | page background |
| `--surface` | `#FFFFFF` | cards/workspaces |
| `--surface-subtle` | `#F1F5F9` | secondary surface |
| `--text` | `#0F172A` | primary text |
| `--text-secondary` | `#475569` | supporting copy |
| `--text-muted` | `#64748B` | metadata |
| `--border` | `#E2E8F0` | standard border |
| `--border-strong` | `#CBD5E1` | selected/hover border |

### Accent

| Token | Value |
|---|---|
| `--accent` | `#6557F5` |
| `--accent-hover` | `#5648E8` |
| `--accent-soft` | `#EEECFF` |
| `--focus` | `#4F46E5` |

### Semantic

| State | Base | Soft |
|---|---|---|
| Success | `#15803D` | `#ECFDF3` |
| Warning | `#B45309` | `#FFF7ED` |
| Danger | `#B42318` | `#FEF3F2` |

State must never depend on color alone.

## 5. Signature Gradient

Primary gradient:

```css
linear-gradient(100deg, #7C5CFC 0%, #4F7DF3 52%, #22C7D9 100%)
```

Visual family:

```text
violet → blue → cyan
```

Use gradient text only for:

- one short phrase in the homepage hero;
- selected category/feature headings;
- rare high-value result emphasis.

Do not use gradient text for body copy, navigation, filenames, labels, forms, errors, or full multi-line sections.

Preferred pattern:

```text
Simple file tools
[that just work.]
```

Only the bracketed phrase receives the gradient. Keep gradient coverage to roughly one-third or less of a heading.

Primary tool buttons remain **solid accent**, not gradient.

## 6. Typography

Primary sans: **Geist** or a metrically similar modern grotesk.  
Monospace: **Geist Mono** or equivalent.

Use sans for normal UI. Use monospace only for file metadata such as:

```text
4.8 MB
1920 × 1080
PDF
77%
00:42
```

### Scale

| Role | Desktop | Mobile | Weight |
|---|---:|---:|---:|
| Hero | 64-72 px | 42-48 px | 600-700 |
| Tool H1 | 40-48 px | 32-36 px | 600-700 |
| Section H2 | 32-40 px | 28-32 px | 600 |
| Card H3 | 18-22 px | 18-20 px | 600 |
| Body large | 18-20 px | 17-18 px | 400 |
| Body | 16 px | 16 px | 400 |
| Small | 14 px | 14 px | 400-500 |
| Metadata | 12-13 px | 12-13 px | 500 |

## 7. Layout and Spacing

Container:

```text
max-width: 1200-1280px
mobile padding: 20px
tablet padding: 32px
desktop padding: 40-48px
```

Spacing scale:

```text
4  8  12  16  20  24  32  40  48  64  80  96  128
```

Major homepage section gap:

```text
desktop: 96-128px
mobile: 64-80px
```

Desktop uses a conceptual 12-column grid. Mobile defaults to one column.

## 8. Shape and Elevation

| Element | Radius |
|---|---:|
| Button | 10-12 px |
| Input/Search | 12 px |
| Tool card | 16 px |
| Upload/workspace | 18-20 px |
| Large visual preview | 20-24 px |

Default border:

```text
1px solid var(--border)
```

Use shadows only when something genuinely floats. Functional cards should rely mainly on border and surface contrast.

## 9. Graphic Resources

Graphic resources are part of the brand, but remain secondary to the utility.

Preferred resources:

### File cards

```text
photo.webp
3.8 MB
```

### Format badges

```text
PNG  JPG  WEBP  PDF  MP3  MP4  HEIC
```

### Product-state fragments

```text
77% smaller
1920 × 1080
24 pages
00:14 → 01:28
```

### Input/output connectors

Thin lines or arrows may communicate:

```text
input → processing → output
```

### Gradient glow

Soft violet/blue/cyan radial glow may sit behind hero graphics or a major preview.

### Technical grid

A very faint dot/line grid may appear in selected hero backgrounds.

Rules:

- Prefer CSS, SVG, and live UI fragments over raster illustration.
- Decorative resources must look related to actual file operations.
- Keep only a few dominant objects per viewport.
- Do not make decorative objects look clickable.
- Avoid random blobs or generic 3D objects.

## 10. Homepage

Canonical order:

```text
Header
Hero + Search + Graphic Resources
Popular Tools
01 Image
02 PDF & Document
03 Audio
04 Video
Privacy
Footer
```

### Header

Desktop:

```text
Logo   Image   PDF   Audio   Video   All Tools        Search
```

Keep the header compact. Mobile collapses navigation cleanly while keeping search easy to reach.

### Hero

Must explain the product within one viewport.

Structure:

```text
small utility/privacy eyebrow
large headline with one gradient phrase
short supporting copy
primary search
compact privacy statement
technical graphic composition
```

Recommended hierarchy:

```text
domyfile

Simple file tools
that just work.

Convert, compress and edit images, PDFs,
audio and video directly in your browser.

[ Search for a tool... ]
```

Search is the primary hero action. Avoid competing CTA buttons.

### Hero graphics

Use a restrained composition such as:

```text
[PNG]
photo.webp
3.8 MB
   ↓ 77% smaller
photo.webp
0.9 MB

[PDF]
12 pages

[MP4]
84 MB → 21 MB
```

Use subtle glow and thin connectors. Do not animate every object.

### Popular Tools

Show approximately 6-8 tools only. Cards contain tool name, short description, and optional format metadata.

### Category Sections

Use numbered editorial markers:

```text
01 Image
02 PDF & Document
03 Audio
04 Video
```

Each section contains a concise description, selected tools, one product-oriented visual, and `View all`.

Do not show the full V1 tool registry on the homepage.

### Privacy

Present privacy as a product benefit:

```text
Files stay yours.

Processed on your device whenever supported.
No account. No permanent file storage.
```

Keep claims factual and aligned with implementation.

## 11. All Tools and Category Pages

### `/tools`

Required:

```text
heading
search
category filters
organized tool grid/list
```

Filters:

```text
All  Image  PDF  Audio  Video
```

### Category page

Required:

```text
number/eyebrow
H1
short description
tool grid
related categories
```

Do not repeat the full homepage hero.

## 12. Tool Page

Tool pages prioritize action over marketing.

Canonical order:

```text
Header
Breadcrumb
H1 + one-line description
Tool Workspace
Result
How it works / Supported formats / FAQ
Related tools
Footer
```

The workspace must appear before long SEO content.

### Initial state

```text
Compress Image

Reduce image size directly in your browser.

┌─────────────────────────────────┐
│                                 │
│         Drop images here        │
│                                 │
│       [ Choose images ]         │
│                                 │
│        JPG · PNG · WebP         │
│                                 │
└─────────────────────────────────┘

Files stay on your device
```

### Selected-file state

Desktop may use:

```text
┌──────────────────────┬──────────────────────┐
│ preview / file list  │ options              │
│                      │                      │
│                      │ primary action       │
└──────────────────────┴──────────────────────┘
```

Mobile stacks preview/list, options, then primary action.

### Result state

Prioritize:

```text
result summary
before/after metadata when useful
preview when practical
primary download
process another
```

Example:

```text
Compression complete

4.8 MB → 1.1 MB
77% smaller

[ Download image ]
Process another
```

## 13. Shared Components

### Upload Zone

Default:

- obvious drop target;
- one primary choose-file button;
- supported formats visible;
- minimal decoration.

Drag active:

- accent border;
- accent-soft surface;
- concise `Drop to add` copy.

Invalid input displays the reason near the upload zone. Never expose raw library errors.

### File Item

May show:

```text
thumbnail/icon
filename
format
size
status
remove
```

Long names truncate visually while remaining accessible.

### Options Panel

Only expose settings that materially affect the result.

- safe understandable defaults;
- advanced controls remain secondary;
- avoid codec/library jargon;
- include units beside numeric fields;
- show estimates only when technically reliable.

Prefer:

```text
Quality
Low ─────●──── High
```

over raw encoder parameters.

### Tool Card

Anatomy:

```text
icon/category
tool title
1-2 line description
optional format metadata
```

Hover uses subtle border/surface change. Do not use aggressive scaling.

### Buttons

Primary: solid accent.  
Secondary: neutral surface + border.  
Destructive: danger style only when appropriate.

Reserve primary emphasis for:

```text
Choose files
Process / Convert / Compress
Download
```

Only one primary action should dominate a local region.

## 14. Search

Search is a first-class navigation element.

Match:

- tool names;
- format names;
- common task synonyms.

Example:

```text
png
→ PNG to JPG
→ JPG to PNG
→ PNG to WebP
→ PNG to PDF when relevant
```

Homepage uses the large search variant. Header and `/tools` may use compact variants.

Search must be genuinely functional and visibly keyboard-focusable.

## 15. Processing States

All tools share:

```text
Idle
Ready
Processing
Success
Error
```

### Processing

Show:

- clear stage/status;
- real percentage only when measurable;
- indeterminate state otherwise;
- cancel only when safely supported.

Never fake progress.

### Success

Show the result first and make Download obvious.

### Error

Always explain:

```text
what failed
what the user can do next
```

Never use only `Something went wrong`.

## 16. Icons and Metadata

Use one simple outlined icon family with consistent stroke weight. No emoji, glossy icons, or mixed icon styles.

Icons support labels rather than replacing critical labels.

Use monospace selectively for technical metadata to create the technical/editorial feel without making the interface look like a terminal.

## 17. Motion

Functional transitions:

```text
150-250ms
```

Use for hover, drop feedback, result appearance, collapse/expand, and dialogs.

Decorative hero resources may float slowly:

```text
travel: 6-10px
duration: 8-12s
```

Animate only a few objects.

Honor `prefers-reduced-motion`. Disable decorative floating when reduced motion is requested.

## 18. Responsive Rules

### Mobile

- one-column tool workspace by default;
- primary actions may become full width;
- no hover-only information;
- controls remain touch-friendly;
- upload zone works as normal file picker;
- graphic resources simplify or disappear before they interfere with utility;
- decorative hero graphics must not push the primary action unnecessarily below the fold.

### Tablet

Use one or two columns according to available width.

### Desktop

Use split preview/options workspaces where appropriate.

## 19. Accessibility

Minimum requirements:

- visible keyboard focus;
- semantic interactive elements;
- correctly associated labels;
- important touch targets approximately 44×44 px;
- sufficient contrast;
- states not represented by color alone;
- keyboard-operable upload zone;
- accessible progress text;
- reduced-motion support.

Gradient text must retain a readable solid fallback.

## 20. UI Copy

Tone:

```text
direct
calm
specific
short
human
```

Prefer:

```text
Choose images
Compress image
Download PDF
This file format isn't supported.
```

Avoid:

```text
Start your transformation journey
Optimize now!
Magic compression
Oopsie!
```

Errors should translate technical failure into a useful next step.

Privacy statements must describe actual behavior, not marketing absolutes.

## 21. SEO Content Placement

Tool pages may contain explanatory content, but functional UI comes first.

Recommended order:

```text
H1 + short intro
workspace
result
how it works
supported formats
FAQ
related tools
```

Do not place multiple paragraphs between the H1 and upload area.

## 22. AI-Agent Guardrails

When implementing new UI:

1. Reuse existing tokens and components before creating new ones.
2. Do not invent category-specific accent colors.
3. Do not add gradients to ordinary buttons or form controls.
4. Keep the signature gradient mainly in headline accents and graphic resources.
5. Prefer live UI/file fragments over generic illustrations.
6. Do not create a unique tool-page layout when the shared pattern fits.
7. Do not make ordinary body text monospace for style.
8. Avoid excessive blur, glass, shadows, and floating blobs.
9. Never hide critical actions behind hover.
10. Do not add decorative animation without reduced-motion handling.
11. Preserve whitespace instead of filling every empty area.
12. Keep marketing secondary to the tool.
13. Do not visually imply capabilities the tool does not provide.

## 23. Definition of Design Done

A page is design-complete only when:

- shared tokens and components are used;
- the primary task is obvious within seconds;
- gradient use follows the signature rules;
- graphic resources support the product rather than distract from it;
- mobile behavior is intentional;
- relevant idle, ready, processing, success, and error states exist;
- keyboard focus is visible;
- the layout does not depend on hover;
- copy is concise and task-oriented;
- no decorative element implies false functionality;
- the page clearly belongs to the same visual system as every other tool.

import type { ToolCategory } from "../tools/types";

export type ContextualToolLink = {
  slug: string;
  anchor: string;
  description: string;
};

export const categoryCrossLinks: Partial<Record<ToolCategory, ContextualToolLink[]>> = {
  image: [
    { slug: "jpg-to-pdf", anchor: "Convert JPG images to PDF", description: "Turn JPG or JPEG images into ordered PDF pages when the next step is a document." },
    { slug: "png-to-pdf", anchor: "Convert PNG images to PDF", description: "Place PNG images into a single PDF with page-order and layout controls." },
    { slug: "webp-to-pdf", anchor: "Convert WebP images to PDF", description: "Create an ordered PDF from WebP images after the image-format step." },
  ],
  pdf: [
    { slug: "compress-image", anchor: "Compress Image", description: "After rendering PDF pages to JPG, reduce image size or change the raster format." },
  ],
  video: [
    { slug: "trim-audio", anchor: "Trim Audio", description: "After extracting MP3 audio from a video, keep only the segment you need." },
    { slug: "audio-converter", anchor: "Audio Converter", description: "Convert extracted audio to another supported format when the next step is compatibility." },
  ],
};

export const toolCrossLinks: Record<string, ContextualToolLink[]> = {
  "jpg-to-png": [
    { slug: "png-to-pdf", anchor: "Convert PNG images to PDF", description: "Turn the PNG result into an ordered PDF when you need a document." },
  ],
  "jpg-to-webp": [
    { slug: "webp-to-pdf", anchor: "Convert WebP images to PDF", description: "Place the WebP result into a PDF with page-size and orientation controls." },
  ],
  "webp-to-jpg": [
    { slug: "jpg-to-pdf", anchor: "Convert JPG images to PDF", description: "Create an ordered PDF from the compatible JPG result." },
  ],
  "heic-to-jpg": [
    { slug: "jpg-to-pdf", anchor: "Convert JPG images to PDF", description: "Continue from compatible JPG photos to an ordered PDF document." },
  ],
  "jpg-to-pdf": [
    { slug: "merge-pdf", anchor: "Merge PDF files", description: "Combine the generated PDF with other documents in a chosen file order." },
  ],
  "png-to-pdf": [
    { slug: "merge-pdf", anchor: "Merge PDF files", description: "Combine the generated PDF with other documents in a chosen file order." },
  ],
  "webp-to-pdf": [
    { slug: "merge-pdf", anchor: "Merge PDF files", description: "Combine the generated PDF with other documents in a chosen file order." },
  ],
  "video-to-mp3": [
    { slug: "trim-audio", anchor: "Trim Audio", description: "Keep a start-to-end segment of the MP3 extracted from the video." },
    { slug: "audio-converter", anchor: "Audio Converter", description: "Change the extracted MP3 to another verified audio format." },
  ],
};

export const getCategoryCrossLinks = (category: ToolCategory) => categoryCrossLinks[category] ?? [];

export const getToolCrossLinks = (slug: string, excludedSlugs: string[] = []) => {
  const excluded = new Set(excludedSlugs);
  return (toolCrossLinks[slug] ?? []).filter((link) => !excluded.has(link.slug));
};

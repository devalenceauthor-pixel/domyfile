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
    { slug: "pdf-to-jpg", anchor: "Convert PDF to JPG", description: "Render selected PDF pages as broadly compatible JPG images." },
    { slug: "pdf-to-png", anchor: "Convert PDF to PNG", description: "Render selected PDF pages as lossless PNG images." },
    { slug: "pdf-to-text", anchor: "Convert PDF to Text", description: "Extract selectable PDF text into a plain UTF-8 TXT file." },
    { slug: "extract-images-from-pdf", anchor: "Extract Images from PDF", description: "Recover decodable embedded raster images as individual downloads." },
    { slug: "organize-pdf", anchor: "Organize PDF Pages", description: "Reorder, duplicate, or remove pages before a later PDF workflow." },
    { slug: "watermark-pdf", anchor: "Add a PDF Watermark", description: "Place focused text or image overlays without opening a full PDF editor." },
    { slug: "compress-image", anchor: "Compress Image", description: "After rendering PDF pages to an image, reduce the raster size or change the format." },
  ],
  word: [
    { slug: "docx-to-txt", anchor: "Extract DOCX text", description: "Pull readable paragraph text from a Word document when you need a plain-text copy." },
    { slug: "docx-to-html", anchor: "Convert DOCX to HTML", description: "Create a semantic HTML copy when the document is headed for a web workflow." },
    { slug: "docx-to-pdf", anchor: "Convert DOCX to PDF", description: "Create a PDF through the temporary native document workflow when pagination and layout matter." },
    { slug: "pdf-to-docx", anchor: "Convert PDF to DOCX", description: "Create an editable DOCX from a text-based PDF when you need to continue editing the content." },
    { slug: "html-to-docx", anchor: "Convert HTML to DOCX", description: "Turn supported headings, lists, tables, and links into an editable Word document." },
    { slug: "merge-docx", anchor: "Merge DOCX files", description: "Combine compatible Word documents in a chosen order with a page break between sources." },
    { slug: "extract-images-from-docx", anchor: "Extract images from DOCX", description: "Pull embedded media out of a Word package without transcoding the source bytes." },
    { slug: "compress-docx", anchor: "Compress DOCX", description: "Reduce supported embedded JPEG media while keeping the document editable." },
    { slug: "docx-metadata-cleaner", anchor: "Clean DOCX metadata", description: "Remove supported document properties while keeping the DOCX package editable." },
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
  "pdf-to-jpg": [
    { slug: "pdf-to-png", anchor: "Convert PDF to PNG", description: "Use lossless PNG pages when JPG compression is not appropriate." },
    { slug: "compress-image", anchor: "Compress Image", description: "Reduce the size of a rendered JPG page for sharing or web use." },
    { slug: "jpg-to-pdf", anchor: "Convert JPG back to PDF", description: "Package reviewed JPG pages into a new PDF when a document output is needed." },
  ],
  "pdf-to-png": [
    { slug: "pdf-to-jpg", anchor: "Convert PDF to JPG", description: "Choose broadly compatible JPG output when a smaller raster is more useful." },
    { slug: "png-to-pdf", anchor: "Convert PNG to PDF", description: "Package reviewed PNG pages into a new PDF document." },
  ],
  "pdf-to-webp": [
    { slug: "pdf-to-png", anchor: "Convert PDF to PNG", description: "Use lossless PNG output when WebP compatibility is not enough." },
    { slug: "webp-to-pdf", anchor: "Convert WebP to PDF", description: "Package reviewed WebP pages into a new PDF document." },
  ],
  "extract-images-from-pdf": [
    { slug: "pdf-to-png", anchor: "Convert PDF to PNG", description: "Render complete pages when the content you need is a page composition rather than an embedded image." },
    { slug: "extract-images-from-docx", anchor: "Extract Images from DOCX", description: "Continue with the matching embedded-media workflow for Word documents." },
  ],
  "pdf-to-text": [
    { slug: "pdf-to-html", anchor: "Convert PDF to HTML", description: "Export the same selectable text as simple page-organized HTML." },
    { slug: "pdf-to-docx", anchor: "Convert PDF to DOCX", description: "Continue to an editable Word document for text-based PDFs." },
  ],
  "pdf-to-html": [
    { slug: "pdf-to-text", anchor: "Convert PDF to Text", description: "Create a formatting-free TXT copy when markup is not needed." },
    { slug: "html-to-docx", anchor: "Convert HTML to DOCX", description: "Package supported HTML content as an editable Word document." },
  ],
  "pdf-metadata-viewer": [
    { slug: "clean-pdf-metadata", anchor: "Clean PDF Metadata", description: "Remove the supported standard Info fields and catalog XMP stream after inspection." },
    { slug: "docx-metadata-cleaner", anchor: "Clean DOCX Metadata", description: "Use the corresponding supported-property cleanup for Word files." },
  ],
  "clean-pdf-metadata": [
    { slug: "pdf-metadata-viewer", anchor: "View PDF Metadata", description: "Inspect the metadata reported by the parser before or after cleanup." },
    { slug: "flatten-pdf", anchor: "Flatten PDF Forms", description: "Flatten supported interactive fields when the document is ready for a fixed form appearance." },
  ],
  "add-page-numbers": [
    { slug: "header-footer-pdf", anchor: "Add Header and Footer", description: "Add simple page-aware text at the top or bottom of selected pages." },
    { slug: "watermark-pdf", anchor: "Add a PDF Watermark", description: "Use a focused overlay when the document needs a visible label rather than pagination." },
  ],
  "header-footer-pdf": [
    { slug: "add-page-numbers", anchor: "Add Page Numbers", description: "Add selectable page numbers with a starting value and placement." },
    { slug: "crop-pdf", anchor: "Crop PDF Pages", description: "Apply a consistent visible crop box after adding page furniture." },
  ],
  "crop-pdf": [
    { slug: "rotate-pdf", anchor: "Rotate PDF", description: "Correct page orientation before applying a consistent crop box." },
    { slug: "pdf-to-png", anchor: "Convert PDF to PNG", description: "Render the cropped page area to an image for a visual check or delivery." },
  ],
  "txt-to-pdf": [
    { slug: "txt-to-docx", anchor: "Convert TXT to DOCX", description: "Create an editable Word document when plain text needs continued editing." },
    { slug: "merge-pdf", anchor: "Merge PDF files", description: "Combine the generated text PDF with other source documents." },
  ],
  "flatten-pdf": [
    { slug: "clean-pdf-metadata", anchor: "Clean PDF Metadata", description: "Remove the supported metadata fields as a separate privacy-property step." },
    { slug: "pdf-to-png", anchor: "Convert PDF to PNG", description: "Render a flattened page when a fixed raster copy is needed." },
  ],
  "video-to-mp3": [
    { slug: "trim-audio", anchor: "Trim Audio", description: "Keep a start-to-end segment of the MP3 extracted from the video." },
    { slug: "audio-converter", anchor: "Audio Converter", description: "Change the extracted MP3 to another verified audio format." },
  ],
  "upscale-image": [
    { slug: "resize-image", anchor: "Resize Image", description: "Use ordinary dimension changes when model-based enhancement is not needed." },
    { slug: "compress-image", anchor: "Compress Image", description: "Reduce the size of the enhanced PNG after reviewing the result." },
  ],
  "docx-to-pdf": [
    { slug: "pdf-to-docx", anchor: "PDF to DOCX", description: "Move a text-based PDF back into an editable Word document when the workflow requires revisions." },
  ],
  "pdf-to-docx": [
    { slug: "docx-to-pdf", anchor: "DOCX to PDF", description: "Export an editable Word document back to a shareable PDF through the native document path." },
  ],
  "docx-to-txt": [
    { slug: "txt-to-docx", anchor: "TXT to DOCX", description: "Package plain text into a simple editable Word document when you need a DOCX result." },
  ],
  "txt-to-docx": [
    { slug: "docx-to-txt", anchor: "DOCX to TXT", description: "Extract readable paragraphs again when a plain-text copy is the next useful format." },
  ],
  "docx-to-html": [
    { slug: "html-to-docx", anchor: "HTML to DOCX", description: "Bring supported semantic HTML content back into an editable Word document." },
  ],
  "html-to-docx": [
    { slug: "docx-to-html", anchor: "DOCX to HTML", description: "Publish a readable semantic HTML copy when the document is headed for a web workflow." },
  ],
  "merge-docx": [
    { slug: "docx-to-pdf", anchor: "DOCX to PDF", description: "Export the combined document as a shareable PDF after the merge is complete." },
  ],
  "extract-images-from-docx": [
    { slug: "compress-image", anchor: "Compress Image", description: "Reduce the size of an extracted raster image when the next workflow needs a smaller asset." },
  ],
  "compress-docx": [
    { slug: "docx-metadata-cleaner", anchor: "Clean DOCX metadata", description: "Remove supported document properties after reducing the package size." },
  ],
  "docx-metadata-cleaner": [
    { slug: "compress-docx", anchor: "Compress DOCX", description: "Reduce supported embedded JPEG media after cleaning the document properties." },
  ],
};

export const getCategoryCrossLinks = (category: ToolCategory) => categoryCrossLinks[category] ?? [];

export const getToolCrossLinks = (slug: string, excludedSlugs: string[] = []) => {
  const excluded = new Set(excludedSlugs);
  return (toolCrossLinks[slug] ?? []).filter((link) => !excluded.has(link.slug));
};

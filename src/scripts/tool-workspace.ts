import {
  getImageErrorMessage,
  imageEngine,
  isImplementedImageTool,
} from "../tools/engines/image/image-engine";
import { CropEditor } from "./crop-editor";
import { WorkspacePreviewManager } from "./workspace-previews";
import type {
  ImageFormatChoice,
  ImageMime,
  ImageOptions,
  ImageProcessFailure,
  ImageProcessItem,
  ImageRenderPlan,
  ImageToolSlug,
} from "../tools/engines/image/types";
import type { PdfOptions, PdfProcessFailure, PdfProcessItem, PdfToolSlug } from "../tools/engines/pdf/types";
import type { MediaOptions, MediaProcessFailure, MediaProcessItem, MediaToolSlug } from "../tools/engines/media/types";
import { backgroundRemovalEngine, getBackgroundRemovalErrorMessage, getBackgroundRemovalOutputName } from "../tools/engines/background-removal/background-removal-engine";
import type { BackgroundRemovalResult } from "../tools/engines/background-removal/types";
import { documentEngine, getDocumentErrorMessage } from "../tools/engines/document/document-engine";
import type { DocumentProcessFailure, DocumentProcessItem, DocumentToolSlug } from "../tools/engines/document/types";
import type { ImageUpscalerResult } from "../tools/engines/image-upscaler/types";
import { getProcessingBoundary, getTool } from "../tools/registry";
import { ServerFallbackClient } from "../tools/server-fallback/client";
import { getServerErrorMessage } from "../tools/server-fallback/errors";
import { getServerOutputName } from "../tools/server-fallback/types";
import type { ServerJobOptions, ServerJobResult, ServerToolId } from "../tools/server-fallback/types";
import type { ToolDefinition } from "../tools/types";

type PdfEngineModule = typeof import("../tools/engines/pdf/pdf-engine");
let pdfEngineModulePromise: Promise<PdfEngineModule> | undefined;

const loadPdfEngine = () => pdfEngineModulePromise ??= import("../tools/engines/pdf/pdf-engine");

type MediaEngineModule = typeof import("../tools/engines/media/media-engine");
let mediaEngineModulePromise: Promise<MediaEngineModule> | undefined;

const loadMediaEngine = () => mediaEngineModulePromise ??= import("../tools/engines/media/media-engine");

type ImageUpscalerModule = typeof import("../tools/engines/image-upscaler/image-upscaler-engine");
let imageUpscalerModulePromise: Promise<ImageUpscalerModule> | undefined;

const loadImageUpscaler = () => imageUpscalerModulePromise ??= import("../tools/engines/image-upscaler/image-upscaler-engine");

type ImageResult = {
  kind: "image";
  item: ImageProcessItem;
  url: string;
};

type PdfResult = {
  kind: "pdf";
  item: PdfProcessItem;
  url: string;
};

type MediaResult = {
  kind: "media";
  item: MediaProcessItem;
  url: string;
};

type ServerResult = {
  kind: "server";
  item: ServerJobResult & { jobId: string; output: File };
  url: string;
};

type DocumentResult = {
  kind: "document";
  item: DocumentProcessItem;
  url: string;
};

type BackgroundRemovalResultItem = {
  kind: "background-removal";
  item: BackgroundRemovalResult;
  url: string;
};

type ImageUpscalerResultItem = {
  kind: "image-upscaler";
  item: ImageUpscalerResult;
  url: string;
};

type WorkspaceResult = ImageResult | PdfResult | MediaResult | ServerResult | DocumentResult | BackgroundRemovalResultItem | ImageUpscalerResultItem;
type WorkspaceFailure = ImageProcessFailure | PdfProcessFailure | MediaProcessFailure | DocumentProcessFailure;

const getFileExtension = (fileName: string) => {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() ?? "" : "";
};

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** index);
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
};

const isPreviewableImage = (file: File) => {
  const extension = getFileExtension(file.name);
  return ["jpg", "jpeg", "png", "webp"].includes(extension) || ["image/jpeg", "image/png", "image/webp"].includes(file.type.toLowerCase());
};

const isFileSupported = (file: File, tool: ToolDefinition) => {
  const extension = getFileExtension(file.name);
  const mime = file.type.toLowerCase();
  if (tool.category === "word") return tool.input.extensions.includes(extension);
  return tool.input.extensions.includes(extension) || tool.input.mimes.includes(mime);
};

const createTextElement = (tagName: keyof HTMLElementTagNameMap, className: string, text: string) => {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
};

const setStatus = (status: HTMLElement, kind: "ready" | "processing" | "success" | "error", title: string, detail: string) => {
  status.hidden = false;
  status.className = `status-message status--${kind}`;
  status.replaceChildren();
  const heading = document.createElement("strong");
  if (kind === "processing") {
    const spinner = document.createElement("span");
    spinner.className = "status-spinner";
    spinner.setAttribute("aria-hidden", "true");
    heading.append(spinner);
  }
  heading.append(document.createTextNode(title));
  status.append(heading, createTextElement("span", "", detail));
};

const clearStatus = (status: HTMLElement) => {
  status.hidden = true;
  status.className = "status-message";
  status.replaceChildren();
};

const updateRangeLabels = (workspace: HTMLElement) => {
  workspace.querySelectorAll<HTMLInputElement>("input[type=range]").forEach((range) => {
    const output = workspace.querySelector<HTMLElement>(`[data-range-output="${range.id}"]`);
    if (output) output.textContent = `${range.value}%`;
  });
};

const asImageFormat = (value: string | undefined): ImageFormatChoice | undefined => {
  if (value === "original" || value === "image/jpeg" || value === "image/png" || value === "image/webp") return value;
  return undefined;
};

const getImageOptions = (workspace: HTMLElement, tool: ImageToolSlug, cropPlan?: ImageRenderPlan): ImageOptions & { tool: ImageToolSlug } => {
  const rangeValue = (id: string, fallback: number) => Number(workspace.querySelector<HTMLInputElement>(`#${id}`)?.value ?? fallback);
  const selectValue = (id: string) => workspace.querySelector<HTMLSelectElement>(`#${id}`)?.value;
  const checkboxValue = (id: string, fallback: boolean) => workspace.querySelector<HTMLInputElement>(`#${id}`)?.checked ?? fallback;
  const outputFormat = asImageFormat(selectValue("outputFormat"));
  const cropOutputFormat = asImageFormat(selectValue("cropOutputFormat"));

  return {
    tool,
    quality: tool === "compress-image" ? rangeValue("qualityRange", 78)
      : tool === "png-to-jpg" ? rangeValue("pngQualityRange", 88)
        : tool === "webp-to-jpg" ? rangeValue("webpToJpgQualityRange", 88)
          : tool === "jpg-to-webp" || tool === "png-to-webp" ? rangeValue("webpQualityRange", 82) : 90,
    outputFormat: tool === "crop-image" ? cropOutputFormat : outputFormat,
    scale: tool === "resize-image" ? rangeValue("scaleRange", 80) / 100 : undefined,
    keepRatio: checkboxValue("keepRatio", true),
    cropRatio: tool === "crop-image" ? (selectValue("cropRatio") === "free" ? "free" : Number(selectValue("cropRatio") ?? 1)) : undefined,
    cropPlan: tool === "crop-image" ? cropPlan : undefined,
    backgroundColor: tool === "png-to-jpg" || tool === "webp-to-jpg" ? workspace.querySelector<HTMLInputElement>("#backgroundColor")?.value : undefined,
    preserveDimensions: checkboxValue("preserveDimensions", true),
  };
};

const getReadyDetail = (category: ToolDefinition["category"], server = false) => server ? "This file will use a temporary native job and be deleted automatically after processing."
  : category === "pdf"
    ? "PDFs are parsed, edited, and generated on this device; originals never leave this device."
    : category === "word"
      ? "Documents are parsed or written on this device; originals never leave this device."
    : category === "audio"
      ? "Audio is probed, processed, and validated on this device; originals never leave this device."
      : category === "video"
        ? "Supported video streams are probed and processed on this device; originals never leave this device."
        : "Images are decoded, rendered, and encoded on this device; originals never leave this device.";

const imageToPdfTools = new Set(["jpg-to-pdf", "png-to-pdf", "webp-to-pdf"]);

const isImageToPdfTool = (slug: string) => imageToPdfTools.has(slug);

const implementedPdfTools = new Set([
  "merge-pdf",
  "split-pdf",
  "organize-pdf",
  "rotate-pdf",
  "jpg-to-pdf",
  "png-to-pdf",
  "webp-to-pdf",
  "pdf-to-jpg",
  "watermark-pdf",
  "pdf-to-png",
  "pdf-to-webp",
  "extract-images-from-pdf",
  "add-page-numbers",
  "header-footer-pdf",
  "crop-pdf",
  "pdf-to-text",
  "pdf-to-html",
  "pdf-metadata-viewer",
  "clean-pdf-metadata",
  "txt-to-pdf",
  "flatten-pdf",
]);

const isImplementedPdfTool = (slug: string) => implementedPdfTools.has(slug);

const implementedMediaTools = new Set(["trim-audio", "trim-video", "audio-converter", "merge-audio", "compress-audio", "video-to-mp3", "mov-to-mp4", "video-converter"]);

const isImplementedMediaTool = (slug: string): slug is MediaToolSlug => implementedMediaTools.has(slug);

const getMediaOptions = (workspace: HTMLElement, tool: MediaToolSlug): MediaOptions => {
  const value = (id: string) => workspace.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)?.value;
  return {
    tool,
    startSeconds: tool === "trim-audio" || tool === "trim-video" ? value("trimStartSeconds") : undefined,
    endSeconds: tool === "trim-audio" || tool === "trim-video" ? value("trimEndSeconds") : undefined,
    outputFormat: value("mediaOutputFormat"),
    quality: value("mediaQuality"),
  };
};

const getServerOptions = (workspace: HTMLElement): ServerJobOptions => {
  const preset = workspace.querySelector<HTMLSelectElement>("#serverPreset")?.value;
  return { preset: preset === "quality" || preset === "smaller" ? preset : "balanced" };
};

const getServerInputMime = (file: File, tool: ToolDefinition) => {
  if (tool.slug === "compress-pdf") return "application/pdf";
  if (tool.slug === "remove-background") {
    if (file.type === "image/png" || getFileExtension(file.name) === "png") return "image/png";
    if (file.type === "image/webp" || getFileExtension(file.name) === "webp") return "image/webp";
    return "image/jpeg";
  }
  if (tool.slug === "docx-to-pdf") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (tool.slug === "pdf-to-docx") return "application/pdf";
  if (file.type === "video/quicktime" || getFileExtension(file.name) === "mov") return "video/quicktime";
  return "video/mp4";
};

const getPdfOptions = (workspace: HTMLElement, tool: PdfToolSlug): PdfOptions & { tool: PdfToolSlug } => {
  const value = (id: string) => workspace.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)?.value;
  const numberValue = (id: string, fallback: number) => Number(value(id) ?? fallback);
  const splitStart = value("splitStartPage")?.trim();
  const splitEnd = value("splitEndPage")?.trim();
  const pageSelection = tool === "split-pdf"
    ? (splitStart && splitEnd ? `${splitStart}-${splitEnd}` : " ")
    : value("pageSelection")?.trim() || "all";
  const organizeOrder = tool === "organize-pdf"
    ? Array.from(workspace.querySelectorAll<HTMLElement>("[data-pdf-page-number]")).map((node) => Number(node.dataset.pdfPageNumber)).filter((page) => Number.isInteger(page))
    : undefined;
  const watermarkImage = workspace.querySelector<HTMLInputElement>("#watermarkImage")?.files?.[0];
  return {
    tool,
    pageSelection,
    rotationScope: pageSelection,
    rotation: numberValue("rotationAngle", 90) as 90 | 180 | 270,
    organizeOrder,
    pageSize: (value("pageSize") as PdfOptions["pageSize"]) ?? "fit",
    pageOrientation: (value("pageOrientation") as PdfOptions["pageOrientation"]) ?? "auto",
    jpgScale: numberValue("pdfJpgScale", 1.5),
    jpgQuality: numberValue("pdfJpgQualityRange", 88),
    rasterFormat: tool === "pdf-to-png" ? "png" : tool === "pdf-to-webp" ? "webp" : "jpg",
    extractImageFormat: value("extractImageFormat") === "webp" ? "webp" : "png",
    extractImageQuality: numberValue("extractImageQualityRange", 92),
    pageNumberStart: numberValue("pageNumberStart", 1),
    pageNumberPlacement: (value("pageNumberPlacement") as PdfOptions["pageNumberPlacement"]) ?? "bottom-right",
    headerText: value("headerText") ?? "",
    footerText: value("footerText") ?? "",
    headerFooterScope: value("headerFooterScope")?.trim() || "all",
    cropMargin: numberValue("cropMargin", 24),
    textFontSize: numberValue("textFontSize", 11),
    watermarkMode: (value("watermarkMode") as PdfOptions["watermarkMode"]) ?? "text",
    watermarkText: value("watermarkText") ?? "",
    watermarkImage,
    watermarkPlacement: (value("watermarkPlacement") as PdfOptions["watermarkPlacement"]) ?? "center",
    watermarkScale: numberValue("watermarkScaleRange", 35) / 100,
    watermarkOpacity: numberValue("watermarkOpacityRange", 35),
    watermarkColor: value("watermarkColor") ?? "#64748b",
  };
};

const initWorkspace = (workspace: HTMLElement) => {
  const tool = getTool(workspace.dataset.toolSlug ?? "");
  if (!tool) return;

  const deferredTool = workspace.dataset.deferred === "true";
  const serverTool = workspace.dataset.serverFallback === "true" && getProcessingBoundary(tool) === "server";
  const realImageTool = !deferredTool && tool.category === "image" && isImplementedImageTool(tool.slug);
  const backgroundRemovalTool = !deferredTool && tool.slug === "remove-background";
  const realBackgroundRemovalTool = !deferredTool && tool.slug === "remove-background" && !serverTool;
  const realImageUpscalerTool = !deferredTool && tool.slug === "upscale-image" && tool.processor === "image-upscaler";
  const realDocumentTool = !deferredTool && tool.category === "word" && tool.processor === "document";
  const realPdfTool = !deferredTool && !serverTool && tool.category === "pdf" && isImplementedPdfTool(tool.slug);
  const realMediaTool = !deferredTool && !serverTool && (tool.category === "audio" || tool.category === "video") && isImplementedMediaTool(tool.slug);
  const realServerTool = !deferredTool && serverTool && ["compress-pdf", "compress-video", "docx-to-pdf", "pdf-to-docx"].includes(tool.slug);
  const fileInput = workspace.querySelector<HTMLInputElement>("[data-file-input]");
  const uploadZone = workspace.querySelector<HTMLElement>("[data-upload-zone]");
  const chooseFiles = workspace.querySelector<HTMLButtonElement>("[data-choose-files]");
  const addMore = workspace.querySelector<HTMLButtonElement>("[data-add-more]");
  const fileListWrap = workspace.querySelector<HTMLElement>("[data-file-list-wrap]");
  const fileList = workspace.querySelector<HTMLUListElement>("[data-file-list]");
  const previewRoot = workspace.querySelector<HTMLElement>("[data-workspace-preview]");
  const fileCount = workspace.querySelector<HTMLElement>("[data-file-count]");
  const fileError = workspace.querySelector<HTMLElement>("[data-file-error]");
  const uploadStepStatus = workspace.querySelector<HTMLElement>("[data-upload-step-status]");
  const processButton = workspace.querySelector<HTMLButtonElement>("[data-process-button]");
  const processAnother = workspace.querySelector<HTMLButtonElement>("[data-process-another]");
  const downloadAll = workspace.querySelector<HTMLButtonElement>("[data-download-all]");
  const status = workspace.querySelector<HTMLElement>("[data-workspace-status]");
  const resultCard = workspace.querySelector<HTMLElement>("[data-result-card]");
  const resultSummary = workspace.querySelector<HTMLElement>("[data-result-summary]");
  const resultList = workspace.querySelector<HTMLElement>("[data-result-list]");
  const resultTitle = workspace.querySelector<HTMLElement>("#resultTitle");
  const processingNote = workspace.querySelector<HTMLElement>("[data-processing-note]");
  const processingProgress = workspace.querySelector<HTMLElement>("[data-processing-progress]");
  const processingProgressBar = workspace.querySelector<HTMLProgressElement>("[data-processing-progress-bar]");
  const processingProgressLabel = workspace.querySelector<HTMLElement>("[data-processing-progress-label]");
  const backgroundPreview = workspace.querySelector<HTMLElement>("[data-background-removal-preview]");
  const backgroundOriginal = workspace.querySelector<HTMLImageElement>("[data-background-original]");
  const backgroundProcessed = workspace.querySelector<HTMLImageElement>("[data-background-processed]");
  const backgroundProcessedPlaceholder = workspace.querySelector<HTMLElement>("[data-background-processed-placeholder]");
  if (!fileInput || !uploadZone || !chooseFiles || !addMore || !fileListWrap || !fileList || !fileCount || !fileError || !uploadStepStatus || !processButton || !processAnother || !downloadAll || !status || !resultCard || !resultSummary || !resultList || !resultTitle) return;

  let files: File[] = [];
  let resultItems: WorkspaceResult[] = [];
  let resultFailures: WorkspaceFailure[] = [];
  let processing = false;
  let activeController: AbortController | undefined;
  const previewUrls = new Map<File, string>();
  const resultUrls = new Set<string>();
  let cropEditor: CropEditor | undefined;
  let cropReady = tool.slug !== "crop-image";
  let cropPreparationId = 0;
  let previewManager: WorkspacePreviewManager | undefined;

  if (processingNote) processingNote.textContent = realBackgroundRemovalTool
    ? "The image and model run on this device. The model loads only when processing starts; the image is not uploaded."
    : realDocumentTool
      ? "The document is parsed or written on this device. Word parsers load only when this tool starts processing."
    : realImageUpscalerTool
      ? "The super-resolution model loads only when processing starts. The image is processed in this browser and is not uploaded."
    : realImageTool
    ? "Images are processed on this device. Originals are not uploaded, stored, or changed."
    : realPdfTool
      ? "PDFs are parsed and processed on this device. Originals are not uploaded, stored, or changed."
      : realServerTool
        ? "This file is uploaded temporarily to an isolated native job and deleted automatically after processing."
      : realMediaTool
        ? tool.category === "video"
          ? "Supported video files are processed on this device. Originals are not uploaded, stored, or changed."
          : "Audio is processed on this device. Originals are not uploaded, stored, or changed."
      : "Processing is deferred for this route. No selected files are uploaded or stored.";

  const cleanupPreviewUrls = () => {
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.clear();
  };

  const cleanupResultUrls = () => {
    resultUrls.forEach((url) => URL.revokeObjectURL(url));
    resultUrls.clear();
  };

  const clearBackgroundProcessedPreview = () => {
    if (backgroundProcessed) {
      backgroundProcessed.removeAttribute("src");
      backgroundProcessed.hidden = true;
    }
    if (backgroundProcessedPlaceholder) backgroundProcessedPlaceholder.hidden = false;
  };

  const renderBackgroundPreview = () => {
    if (!backgroundRemovalTool || !backgroundPreview || !backgroundOriginal) return;
    const source = files[0];
    if (!source) {
      backgroundPreview.hidden = true;
      backgroundOriginal.removeAttribute("src");
      clearBackgroundProcessedPreview();
      return;
    }
    let previewUrl = previewUrls.get(source);
    if (!previewUrl) {
      previewUrl = URL.createObjectURL(source);
      previewUrls.set(source, previewUrl);
    }
    backgroundOriginal.src = previewUrl;
    backgroundOriginal.alt = `Original ${source.name}`;
    backgroundPreview.hidden = false;
  };

  const showFileError = (message: string) => {
    fileError.textContent = message;
    fileError.hidden = !message;
  };

  const hasEnoughFiles = () => files.length >= (tool.minimumFiles ?? 1);

  const updateProgress = (value?: number) => {
    if (!processingProgress || !processingProgressBar || !processingProgressLabel) return;
    if (value === undefined || !Number.isFinite(value)) {
      processingProgress.hidden = true;
      processingProgressBar.value = 0;
      processingProgressLabel.textContent = "Working…";
      return;
    }
    processingProgress.hidden = false;
    processingProgressBar.value = Math.round(Math.min(1, Math.max(0, value)) * 100);
    processingProgressLabel.textContent = `${processingProgressBar.value}%`;
  };

  const updateReadyState = () => {
    const minimumFiles = tool.minimumFiles ?? 1;
    const waitingForCrop = realImageTool && tool.slug === "crop-image" && !cropReady;
    processButton.disabled = deferredTool || !hasEnoughFiles() || waitingForCrop || processing;
    if (!files.length) {
      uploadStepStatus.textContent = "Waiting for a file";
    } else if (!hasEnoughFiles()) {
      const remaining = minimumFiles - files.length;
      uploadStepStatus.textContent = `Add ${remaining} more ${remaining === 1 ? "file" : "files"}`;
    } else if (waitingForCrop) {
      uploadStepStatus.textContent = "Preparing crop preview";
    } else {
      uploadStepStatus.textContent = `${files.length} ${files.length === 1 ? "file" : "files"} ready`;
    }
  };

  const renderOrganizeControls = (pageNumbers: number[]) => {
    const controls = workspace.querySelector<HTMLElement>("[data-pdf-page-controls]");
    if (!controls) return;
    controls.replaceChildren();
    pageNumbers.forEach((pageNumber, index) => {
      const row = document.createElement("div");
      row.className = "pdf-page-control";
      row.dataset.pdfPageControl = "true";
      row.dataset.pdfPageIndex = String(index);
      row.dataset.pdfPageNumber = String(pageNumber);
      const label = createTextElement("span", "pdf-page-control-label", `Page ${pageNumber}`);
      const actions = document.createElement("span");
      actions.className = "pdf-page-control-actions";
      const addAction = (action: string, text: string, labelText: string, disabled = false) => {
        const button = createTextElement("button", "", text) as HTMLButtonElement;
        button.type = "button";
        button.dataset.pageAction = action;
        button.disabled = disabled;
        button.setAttribute("aria-label", labelText);
        actions.append(button);
      };
      addAction("up", "↑", `Move page ${pageNumber} up`, index === 0);
      addAction("down", "↓", `Move page ${pageNumber} down`, index === pageNumbers.length - 1);
      addAction("duplicate", "+", `Duplicate page ${pageNumber}`);
      addAction("delete", "×", `Delete page ${pageNumber}`, pageNumbers.length <= 1);
      row.append(label, actions);
      controls.append(row);
    });
  };

  let organizePreparationId = 0;
  let mediaPreparationId = 0;

  const prepareOrganizePages = async () => {
    if (!realPdfTool || tool.slug !== "organize-pdf" || !files[0]) return;
    const sourceFile = files[0];
    const preparationId = ++organizePreparationId;
    const controls = workspace.querySelector<HTMLElement>("[data-pdf-page-controls]");
    if (controls) controls.replaceChildren(createTextElement("p", "option-help", "Reading PDF pages…"));
    try {
      const module = await loadPdfEngine();
      const { pageCount } = await module.pdfEngine.inspect(sourceFile);
      if (preparationId !== organizePreparationId || files[0] !== sourceFile) return;
      renderOrganizeControls(Array.from({ length: pageCount }, (_, index) => index + 1));
      setStatus(status, "ready", "Files ready.", getReadyDetail(tool.category, serverTool));
    } catch (error) {
      if (preparationId !== organizePreparationId || files[0] !== sourceFile) return;
      const module = await loadPdfEngine().catch(() => undefined);
      const message = module?.getPdfErrorMessage(error) ?? "The PDF could not be read in this browser.";
      setStatus(status, "error", "PDF could not be read.", message);
    }
  };

  const prepareTrimAudio = async () => {
    if (!realMediaTool || tool.slug !== "trim-audio" || !files[0]) return;
    const sourceFile = files[0];
    const preparationId = ++mediaPreparationId;
    const durationLabel = workspace.querySelector<HTMLElement>("[data-trim-duration]");
    if (durationLabel) durationLabel.textContent = "Reading the audio duration locally…";
    try {
      const module = await loadMediaEngine();
      const probe = await module.mediaEngine.inspect(sourceFile);
      if (preparationId !== mediaPreparationId || files[0] !== sourceFile) return;
      const duration = Number(probe.durationSeconds.toFixed(2));
      const start = workspace.querySelector<HTMLInputElement>("#trimStartSeconds");
      const end = workspace.querySelector<HTMLInputElement>("#trimEndSeconds");
      if (start) start.max = String(duration);
      if (end) {
        end.max = String(duration);
        if (!end.value || Number(end.value) <= 0) end.value = String(duration);
      }
      if (durationLabel) durationLabel.textContent = `Detected duration: ${duration.toFixed(2)} seconds. Choose a range within it.`;
      setStatus(status, "ready", "Files ready.", getReadyDetail(tool.category, serverTool));
    } catch (error) {
      if (preparationId !== mediaPreparationId || files[0] !== sourceFile) return;
      const module = await loadMediaEngine().catch(() => undefined);
      const message = module?.getMediaErrorMessage(error) ?? "The audio duration could not be read in this browser.";
      setStatus(status, "error", "Audio could not be read.", message);
    }
  };

  const prepareTrimVideo = async () => {
    if (!realMediaTool || tool.slug !== "trim-video" || !files[0]) return;
    const sourceFile = files[0];
    const preparationId = ++mediaPreparationId;
    const durationLabel = workspace.querySelector<HTMLElement>("[data-trim-duration]");
    if (durationLabel) durationLabel.textContent = "Reading the video duration and keyframes locally…";
    try {
      const module = await loadMediaEngine();
      const probe = await module.mediaEngine.inspect(sourceFile, undefined, "trim-video");
      if (preparationId !== mediaPreparationId || files[0] !== sourceFile) return;
      const duration = Number(probe.durationSeconds.toFixed(2));
      const start = workspace.querySelector<HTMLInputElement>("#trimStartSeconds");
      const end = workspace.querySelector<HTMLInputElement>("#trimEndSeconds");
      if (start) start.max = String(duration);
      if (end) {
        end.max = String(duration);
        if (!end.value || Number(end.value) <= 0) end.value = String(duration);
      }
      if (durationLabel) durationLabel.textContent = `Detected duration: ${duration.toFixed(2)} seconds. Start must match a verified video keyframe; the streams are copied locally.`;
      setStatus(status, "ready", "Files ready.", getReadyDetail(tool.category, serverTool));
    } catch (error) {
      if (preparationId !== mediaPreparationId || files[0] !== sourceFile) return;
      const module = await loadMediaEngine().catch(() => undefined);
      const message = module?.getMediaErrorMessage(error) ?? "The video duration could not be read in this browser.";
      setStatus(status, "error", "Video could not be read.", message);
    }
  };

  const prepareCropEditor = async () => {
    if (!realImageTool || tool.slug !== "crop-image" || !files[0] || !cropEditor) return;
    const sourceFile = files[0];
    const preparationId = ++cropPreparationId;
    cropReady = false;
    updateReadyState();
    try {
      await cropEditor.load(sourceFile);
      if (preparationId !== cropPreparationId || files[0] !== sourceFile) return;
      cropReady = true;
      setStatus(status, "ready", "Crop area ready.", "Drag or resize the frame, then choose Crop image when the preview looks right.");
    } catch (error) {
      if (preparationId !== cropPreparationId || files[0] !== sourceFile) return;
      cropReady = false;
      setStatus(status, "error", "Image preview could not load.", error instanceof Error ? error.message : "This image could not be previewed locally.");
    } finally {
      if (preparationId === cropPreparationId) updateReadyState();
    }
  };

  const renderFiles = () => {
    const hasFiles = files.length > 0;
    uploadZone.hidden = hasFiles;
    fileListWrap.hidden = !hasFiles;
    fileCount.textContent = `${files.length} ${files.length === 1 ? "file" : "files"}`;
    fileList.replaceChildren();
    const canReorderFiles = tool.slug === "merge-pdf" || isImageToPdfTool(tool.slug) || tool.slug === "merge-audio";

    files.forEach((file, index) => {
      const item = document.createElement("li");
      item.className = "file-item";
      item.dataset.fileIndex = String(index);
      if (canReorderFiles) {
        item.draggable = true;
        item.classList.add("file-item--reorderable");
        item.setAttribute("aria-roledescription", "Reorderable file");
      }
      const extension = getFileExtension(file.name).toUpperCase() || "FILE";

      if (isPreviewableImage(file)) {
        let previewUrl = previewUrls.get(file);
        if (!previewUrl) {
          previewUrl = URL.createObjectURL(file);
          previewUrls.set(file, previewUrl);
        }
        const preview = document.createElement("span");
        preview.className = "file-preview";
        const image = document.createElement("img");
        image.src = previewUrl;
        image.alt = "";
        preview.append(image);
        item.append(preview);
      } else if (tool.category === "video") {
        let previewUrl = previewUrls.get(file);
        if (!previewUrl) {
          previewUrl = URL.createObjectURL(file);
          previewUrls.set(file, previewUrl);
        }
        const preview = document.createElement("span");
        preview.className = "file-preview";
        const video = document.createElement("video");
        video.src = previewUrl;
        video.muted = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.tabIndex = -1;
        video.setAttribute("aria-hidden", "true");
        preview.append(video);
        item.append(preview);
      } else {
        const icon = createTextElement("span", "file-item-icon", extension.slice(0, 4));
        icon.setAttribute("aria-hidden", "true");
        item.append(icon);
      }

      const copy = document.createElement("span");
      copy.className = "file-item-copy";
      const name = createTextElement("span", "file-item-name", file.name);
      name.title = file.name;
      name.setAttribute("aria-label", file.name);
      const meta = createTextElement("span", "file-item-meta", `${extension} · ${formatBytes(file.size)}`);
      copy.append(name, meta);

      const actions = document.createElement("span");
      actions.className = "file-item-actions";
      if (tool.slug === "merge-pdf" || isImageToPdfTool(tool.slug) || tool.slug === "merge-audio") {
        const addMoveButton = (direction: "up" | "down", text: string, labelText: string, disabled: boolean) => {
          const button = createTextElement("button", "file-reorder", text) as HTMLButtonElement;
          button.type = "button";
          button.dataset.moveIndex = String(index);
          button.dataset.moveDirection = direction;
          button.disabled = disabled;
          button.setAttribute("aria-label", labelText);
          actions.append(button);
        };
        addMoveButton("up", "↑", `Move ${file.name} up`, index === 0);
        addMoveButton("down", "↓", `Move ${file.name} down`, index === files.length - 1);
      }

      const remove = createTextElement("button", "file-remove", "Remove") as HTMLButtonElement;
      remove.type = "button";
      remove.dataset.removeIndex = String(index);
      remove.setAttribute("aria-label", `Remove ${file.name}`);
      actions.append(remove);
      item.append(copy, actions);
      fileList.append(item);
    });
    updateReadyState();
    renderBackgroundPreview();
  };

  const moveFileTo = (fromIndex: number, targetIndex: number) => {
    if (fromIndex === targetIndex || !files[fromIndex] || targetIndex < 0 || targetIndex >= files.length) return;
    const [moved] = files.splice(fromIndex, 1);
    if (!moved) return;
    files.splice(targetIndex, 0, moved);
    clearResult();
    clearStatus(status);
    renderFiles();
    if (hasEnoughFiles()) setStatus(status, "ready", "Files ready.", getReadyDetail(tool.category, serverTool));
    previewManager?.update(files);
  };

  const moveFile = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    moveFileTo(index, targetIndex);
  };

  const clearResult = () => {
    cleanupResultUrls();
    resultItems = [];
    resultFailures = [];
    resultCard.hidden = true;
    resultList.replaceChildren();
    resultSummary.textContent = "";
    clearBackgroundProcessedPreview();
  };

  if (realImageTool && tool.slug === "crop-image") {
    const cropRoot = workspace.querySelector<HTMLElement>("[data-crop-editor]");
    if (cropRoot) {
      cropEditor = new CropEditor(cropRoot, { onChange: () => clearResult() });
    } else {
      cropReady = false;
    }
  }

  if (previewRoot) {
    previewManager = new WorkspacePreviewManager({
      root: previewRoot,
      tool: tool.slug,
      getOption: (id) => workspace.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)?.value,
      getFileOption: (id) => workspace.querySelector<HTMLInputElement>(`#${id}`)?.files?.[0],
      onFileReorder: (from, to) => moveFileTo(from, to),
      onPageSelectionChange: (value) => {
        const input = workspace.querySelector<HTMLInputElement>("#pageSelection");
        if (input) input.value = value || "all";
        clearResult();
      },
      onOrganizeOrderChange: (order) => {
        clearResult();
        renderOrganizeControls(order);
        setStatus(status, "ready", "Page order updated.", "The selected order will be used when you process this PDF.");
      },
    });
  }

  const splitStartPage = workspace.querySelector<HTMLInputElement>("#splitStartPage");
  const splitEndPage = workspace.querySelector<HTMLInputElement>("#splitEndPage");
  const splitPageSelection = workspace.querySelector<HTMLInputElement>("#pageSelection");
  const syncSplitPageSelection = () => {
    if (!splitPageSelection) return;
    const start = splitStartPage?.value.trim();
    const end = splitEndPage?.value.trim();
    splitPageSelection.value = start && end ? `${start}-${end}` : "";
  };
  splitStartPage?.addEventListener("input", syncSplitPageSelection);
  splitEndPage?.addEventListener("input", syncSplitPageSelection);
  syncSplitPageSelection();

  const handleFiles = (fileListValue: FileList | null) => {
    if (deferredTool || processing || !fileListValue) return;
    const incoming = Array.from(fileListValue);
    if (!incoming.length) return;
    const available = tool.batch ? incoming : incoming.slice(0, 1);
    const rejected = available.filter((file) => !isFileSupported(file, tool));
    const accepted = available.filter((file) => isFileSupported(file, tool));
    const duplicates = accepted.filter((file) => files.some((existing) => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified));
    const uniqueAccepted = accepted.filter((file) => !duplicates.includes(file));

    if (rejected.length) {
      showFileError(`${rejected.length === 1 ? "This file" : "These files"} ${rejected.length === 1 ? "is" : "are"} not supported here. Try ${tool.input.formats.join(" · ")}.`);
    } else if (duplicates.length) {
      showFileError("That file is already in the list. Choose a different file to continue.");
    } else {
      showFileError("");
    }

    if (uniqueAccepted.length) {
      if (!tool.batch) cleanupPreviewUrls();
      if (tool.slug === "crop-image") {
        cropPreparationId += 1;
        cropReady = false;
        cropEditor?.clear();
      }
      files = tool.batch ? [...files, ...uniqueAccepted] : uniqueAccepted;
      if (tool.slug === "trim-audio" || tool.slug === "trim-video") {
        const start = workspace.querySelector<HTMLInputElement>("#trimStartSeconds");
        const end = workspace.querySelector<HTMLInputElement>("#trimEndSeconds");
        if (start) start.value = "0";
        if (end) end.value = "0";
      }
      clearResult();
      clearStatus(status);
      previewManager?.update(files);
      if (files.length >= (tool.minimumFiles ?? 1)) setStatus(status, "ready", "Files ready.", getReadyDetail(tool.category, serverTool));
      if (tool.slug === "organize-pdf") void prepareOrganizePages();
      if (tool.slug === "trim-audio") void prepareTrimAudio();
      if (tool.slug === "trim-video") void prepareTrimVideo();
      if (tool.slug === "crop-image") void prepareCropEditor();
    }
    fileInput.value = "";
    renderFiles();
  };

  const removeFile = (index: number) => {
    const file = files[index];
    if (!file) return;
    const previewUrl = previewUrls.get(file);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrls.delete(file);
    }
    files.splice(index, 1);
    clearResult();
    clearStatus(status);
    showFileError("");
    organizePreparationId += 1;
    mediaPreparationId += 1;
    if (tool.slug === "crop-image") {
      cropPreparationId += 1;
      cropReady = false;
      cropEditor?.clear();
    }
    renderFiles();
    previewManager?.update(files);
    if (tool.slug === "organize-pdf") {
      const controls = workspace.querySelector<HTMLElement>("[data-pdf-page-controls]");
      controls?.replaceChildren(createTextElement("p", "option-help", "Choose a PDF to load its page controls."));
    }
    if (hasEnoughFiles()) setStatus(status, "ready", "Files ready.", getReadyDetail(tool.category, serverTool));
  };

  const formatMime = (mime: ImageMime) => mime === "image/jpeg" ? "JPG" : mime === "image/png" ? "PNG" : "WebP";

  const renderImageResult = () => {
    const imageResults = resultItems.filter((item): item is ImageResult => item.kind === "image");
    const inputBytes = imageResults.reduce((total, item) => total + item.item.inputBytes, 0);
    const outputBytes = imageResults.reduce((total, item) => total + item.item.outputBytes, 0);
    resultTitle.textContent = imageResults.length === 1 ? "Image ready to download" : "Images ready to download";
    const failureSummary = resultFailures.length ? ` · ${resultFailures.length} skipped` : "";
    resultSummary.textContent = `${imageResults.length} ${imageResults.length === 1 ? "file" : "files"} processed · ${formatBytes(inputBytes)} input → ${formatBytes(outputBytes)} output${failureSummary}.`;
    resultList.replaceChildren();

    imageResults.forEach(({ item, url }) => {
      const row = document.createElement("div");
      row.className = "result-item";
      const extension = createTextElement("span", "file-item-icon", formatMime(item.mime));
      extension.setAttribute("aria-hidden", "true");
      const copy = document.createElement("span");
      copy.className = "result-item-copy";
      const name = createTextElement("strong", "", item.output.name);
      name.title = item.output.name;
      const sizeChange = item.outputBytes <= item.inputBytes ? `${formatBytes(item.inputBytes)} → ${formatBytes(item.outputBytes)}` : `${formatBytes(item.outputBytes)} output`;
      const detail = createTextElement("span", "", `${sizeChange} · ${item.width} × ${item.height} px`);
      copy.append(name, detail);
      const download = document.createElement("a");
      download.className = "result-download-link";
      download.href = url;
      download.download = item.output.name;
      download.dataset.resultDownload = "true";
      download.textContent = "Download";
      row.append(extension, copy, download);
      resultList.append(row);
    });

    if (resultFailures.length) {
      resultFailures.forEach(({ input, error }) => {
        const row = document.createElement("div");
        row.className = "result-item";
        const extension = createTextElement("span", "file-item-icon", "SKIP");
        extension.setAttribute("aria-hidden", "true");
        const copy = document.createElement("span");
        copy.className = "result-item-copy";
        const name = createTextElement("strong", "", input.name);
        name.title = input.name;
        copy.append(name, createTextElement("span", "", error.userMessage));
        row.append(extension, copy);
        resultList.append(row);
      });
    }
    resultCard.hidden = false;
    resultCard.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };

  const formatPdfMime = (mime: PdfProcessItem["mime"]) => {
    if (mime === "application/pdf") return "PDF";
    if (mime === "image/jpeg") return "JPG";
    if (mime === "image/png") return "PNG";
    if (mime === "image/webp") return "WEBP";
    if (mime === "application/json") return "JSON";
    if (mime === "text/html") return "HTML";
    return "TXT";
  };

  const renderPdfResult = () => {
    const pdfResults = resultItems.filter((item): item is PdfResult => item.kind === "pdf");
    const isRasterPages = ["pdf-to-jpg", "pdf-to-png", "pdf-to-webp"].includes(tool.slug);
    const outputPages = isRasterPages || tool.slug === "extract-images-from-pdf"
      ? pdfResults.length
      : pdfResults.reduce((total, item) => total + (item.item.pageCount ?? 0), 0);
    const outputLabel = tool.slug === "pdf-to-png" ? "PNG" : tool.slug === "pdf-to-webp" ? "WebP" : tool.slug === "pdf-to-jpg" ? "JPG" : tool.slug === "extract-images-from-pdf" ? "image" : tool.slug === "pdf-to-text" ? "text" : tool.slug === "pdf-to-html" ? "HTML" : tool.slug === "pdf-metadata-viewer" ? "metadata" : "PDF";
    resultTitle.textContent = isRasterPages
      ? (pdfResults.length === 1 ? `${outputLabel} page ready to download` : `${outputLabel} pages ready to download`)
      : tool.slug === "extract-images-from-pdf"
        ? `${pdfResults.length} extracted image${pdfResults.length === 1 ? "" : "s"} ready to download`
        : (pdfResults.length === 1 ? `${outputLabel} output ready to download` : `${outputLabel} outputs ready to download`);
    const failureSummary = resultFailures.length ? ` · ${resultFailures.length} skipped` : "";
    const outputUnit = tool.slug === "extract-images-from-pdf" ? "image" : "page";
    resultSummary.textContent = `${pdfResults.length} ${pdfResults.length === 1 ? "output" : "outputs"} ready · ${outputPages} ${outputUnit}${outputPages === 1 ? "" : "s"}${failureSummary}.`;
    resultList.replaceChildren();

    pdfResults.forEach(({ item, url }) => {
      const row = document.createElement("div");
      row.className = "result-item";
      const extension = createTextElement("span", "file-item-icon", formatPdfMime(item.mime));
      extension.setAttribute("aria-hidden", "true");
      const copy = document.createElement("span");
      copy.className = "result-item-copy";
      const name = createTextElement("strong", "", item.output.name);
      name.title = item.output.name;
      const pageDetail = isRasterPages && item.pageNumber
        ? `page ${item.pageNumber} of ${item.pageCount ?? item.pageNumber}`
        : item.width && item.height
          ? `${item.width} × ${item.height} px`
          : item.detail ?? `${item.pageCount ?? 0} ${item.pageCount === 1 ? "page" : "pages"}`;
      const detail = createTextElement("span", "", `${formatBytes(item.outputBytes)} · ${pageDetail}`);
      copy.append(name, detail);
      const download = document.createElement("a");
      download.className = "result-download-link";
      download.href = url;
      download.download = item.output.name;
      download.dataset.resultDownload = "true";
      download.textContent = "Download";
      row.append(extension, copy, download);
      resultList.append(row);
    });

    if (resultFailures.length) {
      resultFailures.forEach(({ input, error }) => {
        const row = document.createElement("div");
        row.className = "result-item";
        const extension = createTextElement("span", "file-item-icon", "SKIP");
        extension.setAttribute("aria-hidden", "true");
        const copy = document.createElement("span");
        copy.className = "result-item-copy";
        const name = createTextElement("strong", "", input.name);
        name.title = input.name;
        copy.append(name, createTextElement("span", "", error.userMessage));
        row.append(extension, copy);
        resultList.append(row);
      });
    }
    resultCard.hidden = false;
    resultCard.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };

  const formatMedia = (format: MediaResult["item"]["format"]) => format === "m4a" ? "M4A" : format.toUpperCase();

  const renderMediaResult = () => {
    const mediaResults = resultItems.filter((item): item is MediaResult => item.kind === "media");
    const inputBytes = mediaResults.reduce((total, item) => total + item.item.inputBytes, 0);
    const outputBytes = mediaResults.reduce((total, item) => total + item.item.outputBytes, 0);
    const isCompression = tool.slug === "compress-audio";
    const isVideo = tool.category === "video";
    resultTitle.textContent = isVideo
      ? (mediaResults.length === 1 ? "Video output ready to download" : "Video outputs ready to download")
      : (mediaResults.length === 1 ? "Audio ready to download" : "Audio files ready to download");
    const reduction = isCompression && mediaResults.length === 1 && mediaResults[0].item.sizeReductionPercent !== undefined
      ? ` · ${mediaResults[0].item.sizeReductionPercent.toFixed(0)}% smaller`
      : "";
    const failureSummary = resultFailures.length ? ` · ${resultFailures.length} skipped` : "";
    resultSummary.textContent = `${mediaResults.length} ${mediaResults.length === 1 ? "file" : "files"} processed · ${formatBytes(inputBytes)} input → ${formatBytes(outputBytes)} output${reduction}${failureSummary}.`;
    resultList.replaceChildren();

    mediaResults.forEach(({ item, url }) => {
      const row = document.createElement("div");
      row.className = "result-item";
      const extension = createTextElement("span", "file-item-icon", formatMedia(item.format));
      extension.setAttribute("aria-hidden", "true");
      const copy = document.createElement("span");
      copy.className = "result-item-copy";
      const name = createTextElement("strong", "", item.output.name);
      name.title = item.output.name;
      const duration = `${item.outputDurationSeconds.toFixed(2)} s`;
      const sizeDetail = isCompression && item.sizeReductionPercent !== undefined
        ? `${formatBytes(item.inputBytes)} → ${formatBytes(item.outputBytes)} · ${item.sizeReductionPercent.toFixed(0)}% smaller`
        : `${formatBytes(item.inputBytes)} → ${formatBytes(item.outputBytes)}`;
      const streamDetail = isVideo
        ? `${item.outputVideoStreams} video · ${item.outputAudioStreams} audio`
        : item.strategy === "stream-copy" ? "stream copy" : item.codec;
      const detail = createTextElement("span", "", `${sizeDetail} · ${duration} · ${streamDetail}`);
      copy.append(name, detail);
      const download = document.createElement("a");
      download.className = "result-download-link";
      download.href = url;
      download.download = item.output.name;
      download.dataset.resultDownload = "true";
      download.textContent = "Download";
      row.append(extension, copy, download);
      resultList.append(row);
    });

    if (resultFailures.length) {
      resultFailures.forEach(({ input, error }) => {
        const row = document.createElement("div");
        row.className = "result-item";
        const extension = createTextElement("span", "file-item-icon", "SKIP");
        extension.setAttribute("aria-hidden", "true");
        const copy = document.createElement("span");
        copy.className = "result-item-copy";
        const name = createTextElement("strong", "", input.name);
        name.title = input.name;
        copy.append(name, createTextElement("span", "", error.userMessage));
        row.append(extension, copy);
        resultList.append(row);
      });
    }
    resultCard.hidden = false;
    resultCard.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };

  const renderDocumentResult = () => {
    const documentResults = resultItems.filter((item): item is DocumentResult => item.kind === "document");
    const extraction = tool.slug === "extract-images-from-docx";
    resultTitle.textContent = extraction
      ? "Extracted images ready to download"
      : documentResults.length === 1 ? "Document ready to download" : "Documents ready to download";
    const outputBytes = documentResults.reduce((total, item) => total + item.item.outputBytes, 0);
    const imageCount = documentResults.filter(({ item }) => item.format === "image").length;
    resultSummary.textContent = extraction
      ? `${imageCount} image${imageCount === 1 ? "" : "s"} plus a ZIP archive ready · ${formatBytes(outputBytes)} output.`
      : `${documentResults.length} ${documentResults.length === 1 ? "document" : "documents"} ready · ${formatBytes(outputBytes)} output.`;
    resultList.replaceChildren();

    documentResults.forEach(({ item, url }) => {
      const row = document.createElement("div");
      row.className = "result-item";
      const extension = createTextElement("span", "file-item-icon", item.format.toUpperCase());
      extension.setAttribute("aria-hidden", "true");
      const copy = document.createElement("span");
      copy.className = "result-item-copy";
      const name = createTextElement("strong", "", item.output.name);
      name.title = item.output.name;
      const detail = item.format === "html"
        ? "Semantic HTML document"
        : item.format === "txt"
          ? "Plain text extracted locally"
          : item.format === "image"
            ? "Embedded image copied from the DOCX package"
            : item.format === "zip"
              ? "ZIP archive of extracted images"
              : "DOCX package created locally";
      copy.append(name, createTextElement("span", "", `${formatBytes(item.inputBytes)} input → ${formatBytes(item.outputBytes)} output · ${detail}`));
      const download = document.createElement("a");
      download.className = "result-download-link";
      download.href = url;
      download.download = item.output.name;
      download.dataset.resultDownload = "true";
      download.textContent = "Download";
      row.append(extension, copy, download);
      resultList.append(row);
    });

    if (resultFailures.length) {
      resultFailures.forEach(({ input, error }) => {
        const row = document.createElement("div");
        row.className = "result-item";
        const extension = createTextElement("span", "file-item-icon", "SKIP");
        extension.setAttribute("aria-hidden", "true");
        const copy = document.createElement("span");
        copy.className = "result-item-copy";
        const name = createTextElement("strong", "", input.name);
        name.title = input.name;
        copy.append(name, createTextElement("span", "", error.userMessage));
        row.append(extension, copy);
        resultList.append(row);
      });
    }
    resultCard.hidden = false;
    resultCard.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };

  const renderBackgroundRemovalResult = () => {
    const backgroundResults = resultItems.filter((item): item is BackgroundRemovalResultItem => item.kind === "background-removal");
    const item = backgroundResults[0]?.item;
    const url = backgroundResults[0]?.url;
    if (!item || !url) return;
    resultTitle.textContent = "Transparent PNG ready to download";
    resultSummary.textContent = `${formatBytes(item.inputBytes)} input → ${formatBytes(item.outputBytes)} transparent PNG output.`;
    resultList.replaceChildren();
    const row = document.createElement("div");
    row.className = "result-item";
    const extension = createTextElement("span", "file-item-icon", "PNG");
    extension.setAttribute("aria-hidden", "true");
    const copy = document.createElement("span");
    copy.className = "result-item-copy";
    const name = createTextElement("strong", "", item.output.name);
    name.title = item.output.name;
    copy.append(name, createTextElement("span", "", `${formatBytes(item.outputBytes)} · transparent background`));
    const download = document.createElement("a");
    download.className = "result-download-link";
    download.href = url;
    download.download = item.output.name;
    download.dataset.resultDownload = "true";
    download.textContent = "Download PNG";
    row.append(extension, copy, download);
    resultList.append(row);
    resultCard.hidden = false;
    resultCard.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };

  const renderImageUpscalerResult = () => {
    const upscalerResults = resultItems.filter((item): item is ImageUpscalerResultItem => item.kind === "image-upscaler");
    const item = upscalerResults[0]?.item;
    const url = upscalerResults[0]?.url;
    if (!item || !url) return;
    resultTitle.textContent = "Super-resolution PNG ready to download";
    resultSummary.textContent = `${item.inputWidth} × ${item.inputHeight} px input → ${item.outputWidth} × ${item.outputHeight} px PNG output.`;
    resultList.replaceChildren();
    const row = document.createElement("div");
    row.className = "result-item";
    const extension = createTextElement("span", "file-item-icon", "PNG");
    extension.setAttribute("aria-hidden", "true");
    const copy = document.createElement("span");
    copy.className = "result-item-copy";
    const name = createTextElement("strong", "", item.output.name);
    name.title = item.output.name;
    copy.append(name, createTextElement("span", "", `${formatBytes(item.inputBytes)} input → ${formatBytes(item.outputBytes)} · ONNX model · fixed 3×`));
    const download = document.createElement("a");
    download.className = "result-download-link";
    download.href = url;
    download.download = item.output.name;
    download.dataset.resultDownload = "true";
    download.textContent = "Download PNG";
    row.append(extension, copy, download);
    resultList.append(row);
    resultCard.hidden = false;
    resultCard.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };

  const renderServerResult = () => {
    const serverResults = resultItems.filter((item): item is ServerResult => item.kind === "server");
    const item = serverResults[0]?.item;
    if (!item) return;
    const documentConversion = tool.slug === "docx-to-pdf" || tool.slug === "pdf-to-docx";
    const backgroundRemoval = tool.slug === "remove-background";
    if (backgroundRemoval && backgroundProcessed) {
      backgroundProcessed.src = serverResults[0].url;
      backgroundProcessed.hidden = false;
      if (backgroundProcessedPlaceholder) backgroundProcessedPlaceholder.hidden = true;
    }
    resultTitle.textContent = documentConversion
      ? `${item.outputFormat} conversion ready to download`
      : backgroundRemoval ? "Transparent PNG ready to download" : tool.slug === "compress-pdf" ? "Compressed PDF ready to download" : "Compressed video ready to download";
    const reduction = `${item.savingsPercent.toFixed(0)}% size change`;
    const detail = documentConversion
      ? `${formatBytes(item.inputBytes)} → ${formatBytes(item.outputBytes)} · native document engine${item.pageCount ? ` · ${item.pageCount} pages` : ""}`
      : backgroundRemoval
        ? `${formatBytes(item.inputBytes)} input → ${formatBytes(item.outputBytes)} · BiRefNet-lite · native ONNX Runtime`
      : tool.slug === "compress-pdf"
        ? `${formatBytes(item.inputBytes)} → ${formatBytes(item.outputBytes)} · ${reduction}${item.pageCount ? ` · ${item.pageCount} pages` : ""}`
        : `${formatBytes(item.inputBytes)} → ${formatBytes(item.outputBytes)} · ${reduction} · ${item.width} × ${item.height} px · ${item.durationSeconds?.toFixed(2)} s`;
    resultSummary.textContent = backgroundRemoval
      ? `${formatBytes(item.inputBytes)} input → ${formatBytes(item.outputBytes)} transparent PNG output.`
      : `${formatBytes(item.inputBytes)} input → ${formatBytes(item.outputBytes)} ${documentConversion ? "output" : `output · ${reduction}`}.`;
    resultList.replaceChildren();
    const row = document.createElement("div");
    row.className = "result-item";
    const extension = createTextElement("span", "file-item-icon", backgroundRemoval ? "PNG" : item.outputFormat);
    extension.setAttribute("aria-hidden", "true");
    const copy = document.createElement("span");
    copy.className = "result-item-copy";
    const name = createTextElement("strong", "", item.output.name);
    name.title = item.output.name;
    copy.append(name, createTextElement("span", "", detail));
    const download = document.createElement("a");
    download.className = "result-download-link";
    download.href = serverResults[0].url;
    download.download = item.output.name;
    download.dataset.resultDownload = "true";
    download.textContent = backgroundRemoval ? "Download PNG" : "Download";
    row.append(extension, copy, download);
    resultList.append(row);
    resultCard.hidden = false;
    resultCard.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };

  const processImageUpscalerTool = async () => {
    const sourceFile = files[0];
    if (!sourceFile) return;
    const module = await loadImageUpscaler();
    activeController = new AbortController();
    setStatus(status, "processing", "Enhancing image…", "The super-resolution model runs locally; the selected image is not uploaded.");
    const item = await module.imageUpscalerEngine.process(sourceFile, { scale: 3 }, activeController.signal, (progress, label) => {
      updateProgress(progress);
      if (label) setStatus(status, "processing", label, "The model and image are running locally in this browser.");
    });
    const url = URL.createObjectURL(item.output);
    resultUrls.add(url);
    resultItems = [{ kind: "image-upscaler", item, url }];
    resultFailures = [];
    previewManager?.setResults([{ input: item.input, inputBytes: item.inputBytes, outputBytes: item.outputBytes, width: item.outputWidth, height: item.outputHeight }]);
    setStatus(status, "success", "Super-resolution complete.", "The enhanced PNG is ready to download. The original image was not changed.");
    updateProgress(1);
    renderImageUpscalerResult();
  };

  const processImageTool = async () => {
    const imageTool = tool.slug as ImageToolSlug;
    activeController = new AbortController();
    setStatus(status, "processing", `Processing ${files.length === 1 ? "image" : "images"}…`, "The files stay on this device while the browser decodes and encodes them.");
    const cropPlan = imageTool === "crop-image" ? cropEditor?.getPlan() : undefined;
    const result = await imageEngine.process(files, getImageOptions(workspace, imageTool, cropPlan), activeController.signal);
    resultFailures = result.failures;
    previewManager?.setResults(result.items);
    resultItems = result.items.map((item) => {
      const url = URL.createObjectURL(item.output);
      resultUrls.add(url);
      return { kind: "image", item, url };
    });

    if (!result.items.length) {
      const firstFailure = result.failures[0];
      setStatus(status, "error", "No image was processed.", firstFailure?.error.userMessage ?? "Try a different supported image.");
      return;
    }
    setStatus(
      status,
      "success",
      result.failures.length ? "Processing finished with skipped files." : "Processing complete.",
      result.failures.length ? `${result.items.length} file${result.items.length === 1 ? "" : "s"} ready; ${result.failures.length} file${result.failures.length === 1 ? " was" : "s were"} skipped.` : "Your output files are ready to download.",
    );
    renderImageResult();
  };

  const processPdfTool = async () => {
    const module = await loadPdfEngine();
    const pdfTool = tool.slug as PdfToolSlug;
    activeController = new AbortController();
    const itemLabel = isImageToPdfTool(tool.slug) ? "images" : "PDF";
    setStatus(status, "processing", `Processing ${files.length === 1 ? itemLabel : `${itemLabel}s`}…`, "The files stay on this device while the browser reads and generates the output.");
    const result = await module.pdfEngine.process(files, getPdfOptions(workspace, pdfTool), activeController.signal);
    resultFailures = result.failures;
    resultItems = result.items.map((item) => {
      const url = URL.createObjectURL(item.output);
      resultUrls.add(url);
      return { kind: "pdf", item, url };
    });

    if (!result.items.length) {
      const firstFailure = result.failures[0];
      setStatus(status, "error", "No PDF output was generated.", firstFailure?.error.userMessage ?? "Try a different supported PDF.");
      return;
    }
    setStatus(
      status,
      "success",
      result.failures.length ? "Processing finished with skipped files." : "Processing complete.",
      result.failures.length ? `${result.items.length} output${result.items.length === 1 ? "" : "s"} ready; ${result.failures.length} file${result.failures.length === 1 ? " was" : "s were"} skipped.` : "Your output files are ready to download.",
    );
    renderPdfResult();
  };

  const processMediaTool = async () => {
    const module = await loadMediaEngine();
    const mediaTool = tool.slug as MediaToolSlug;
    activeController = new AbortController();
    updateProgress(undefined);
    const itemLabel = tool.slug === "merge-audio" ? "audio tracks" : tool.category === "video" ? "video" : "audio";
    setStatus(status, "processing", `Processing ${files.length === 1 ? itemLabel : `${itemLabel}s`}…`, "The files stay on this device while the browser probes, encodes, and validates the result.");
    const result = await module.mediaEngine.process(files, getMediaOptions(workspace, mediaTool), activeController.signal, (progress) => updateProgress(progress));
    resultFailures = result.failures;
    resultItems = result.items.map((item) => {
      const url = URL.createObjectURL(item.output);
      resultUrls.add(url);
      return { kind: "media", item, url };
    });

    if (!result.items.length) {
      const firstFailure = result.failures[0];
      setStatus(status, "error", tool.category === "video" ? "No video output was generated." : "No audio was processed.", firstFailure?.error.userMessage ?? (tool.category === "video" ? "Try a different verified video file." : "Try a different verified audio file."));
      return;
    }
    setStatus(
      status,
      "success",
      result.failures.length ? "Processing finished with skipped files." : "Processing complete.",
      result.failures.length ? `${result.items.length} output${result.items.length === 1 ? "" : "s"} ready; ${result.failures.length} file${result.failures.length === 1 ? " was" : "s were"} skipped.` : tool.category === "video" ? "Your validated video output is ready to download." : "Your validated audio output is ready to download.",
    );
    updateProgress(1);
    renderMediaResult();
  };

  const processDocumentTool = async () => {
    const documentTool = tool.slug as DocumentToolSlug;
    activeController = new AbortController();
    const compressionPreset = workspace.querySelector<HTMLSelectElement>("#documentCompressionPreset")?.value;
    setStatus(status, "processing", "Processing document…", "The document stays on this device while the parser or writer is loaded and run locally.");
    const result = await documentEngine.process(files, { tool: documentTool, compressionPreset: compressionPreset === "light" || compressionPreset === "strong" ? compressionPreset : "balanced" }, activeController.signal);
    resultFailures = result.failures;
    const documentOutputs = result.archive ? [...result.items, result.archive] : result.items;
    resultItems = documentOutputs.map((item) => {
      const url = URL.createObjectURL(item.output);
      resultUrls.add(url);
      return { kind: "document", item, url };
    });

    if (!result.items.length) {
      const firstFailure = result.failures[0];
      setStatus(status, "error", "No document was generated.", firstFailure?.error.userMessage ?? "Try a different supported document.");
      return;
    }
    setStatus(
      status,
      "success",
      result.failures.length ? "Processing finished with skipped files." : "Processing complete.",
      result.failures.length ? `${result.items.length} output ready; ${result.failures.length} file was skipped.` : "Your document output is ready to download.",
    );
    renderDocumentResult();
  };

  const processBackgroundRemovalTool = async () => {
    const sourceFile = files[0];
    if (!sourceFile) return;
    activeController = new AbortController();
    setStatus(status, "processing", "Removing background…", "The local model may download the first time. Your image stays on this device.");
    const result = await backgroundRemovalEngine.process(sourceFile, activeController.signal, (progress, label) => {
      updateProgress(progress);
      if (label) setStatus(status, "processing", label, "The image and background-removal model are running locally.");
    });
    const url = URL.createObjectURL(result.output);
    resultUrls.add(url);
    resultItems = [{ kind: "background-removal", item: result, url }];
    resultFailures = [];
    if (backgroundProcessed) {
      backgroundProcessed.src = url;
      backgroundProcessed.hidden = false;
    }
    if (backgroundProcessedPlaceholder) backgroundProcessedPlaceholder.hidden = true;
    setStatus(status, "success", "Background removed.", "A transparent PNG is ready to download. The original image was not changed.");
    updateProgress(1);
    renderBackgroundRemovalResult();
  };

  const processServerTool = async () => {
    const sourceFile = files[0];
    if (!sourceFile || !realServerTool) return;
    activeController = new AbortController();
    updateProgress(undefined);
    const client = new ServerFallbackClient(workspace.dataset.serverFallbackUrl ?? "/__server-fallback");
    const serverToolId = tool.id as ServerToolId;
    const updateServerStatus = (jobStatus: { status: string; progress?: number }) => {
      if (typeof jobStatus.progress === "number") updateProgress(jobStatus.progress);
      else if (jobStatus.status === "uploading" || jobStatus.status === "queued") updateProgress(undefined);
      const labels: Record<string, [string, string]> = {
        created: ["Preparing temporary job…", "The file will be deleted automatically after processing."],
        uploading: ["Uploading temporarily…", "Your file is sent only to the approved native processing path."],
        queued: ["Waiting to process…", "The job is queued with a strict resource limit and short expiry."],
        validating: ["Validating file…", "The server is checking the file signature and safe resource envelope."],
        processing: [tool.slug === "docx-to-pdf" || tool.slug === "pdf-to-docx" ? "Converting with the native document engine…" : tool.slug === "remove-background" ? "Segmenting the foreground…" : "Compressing…", tool.slug === "remove-background" ? "The allowlisted BiRefNet model is running in an isolated temporary container." : "The allowlisted engine is working in an isolated temporary container."],
        verifying: ["Checking output…", tool.slug === "docx-to-pdf" || tool.slug === "pdf-to-docx" ? "The converted file must pass output validation before download." : "The result must be valid and smaller before it can be offered."],
      };
      const label = labels[jobStatus.status];
      if (label) setStatus(status, "processing", label[0], label[1]);
    };
    try {
      updateServerStatus({ status: "created" });
      const result = await client.process({
        toolId: serverToolId,
        file: sourceFile,
        inputMime: getServerInputMime(sourceFile, tool),
        options: getServerOptions(workspace),
        outputName: tool.slug === "remove-background" ? getBackgroundRemovalOutputName(sourceFile.name) : getServerOutputName(serverToolId),
        signal: activeController.signal,
        onStatus: updateServerStatus,
      });
      const url = URL.createObjectURL(result.output);
      resultUrls.add(url);
      resultItems = [{ kind: "server", item: result, url }];
      const documentConversion = tool.slug === "docx-to-pdf" || tool.slug === "pdf-to-docx";
      const backgroundRemoval = tool.slug === "remove-background";
      setStatus(status, "success", backgroundRemoval ? "Background removed." : documentConversion ? "Document conversion complete." : "Compression complete.", backgroundRemoval ? "A validated transparent PNG is ready to download." : documentConversion ? "The validated native conversion is ready to download." : `${result.savingsPercent.toFixed(0)}% smaller · the validated output is ready to download.`);
      updateProgress(1);
      renderServerResult();
    } catch (error) {
      if (activeController.signal.aborted) return;
      setStatus(status, "error", tool.slug === "remove-background" ? "Background removal could not finish." : tool.slug === "docx-to-pdf" || tool.slug === "pdf-to-docx" ? "Document conversion could not finish." : "Compression could not finish.", getServerErrorMessage(error));
    }
  };

  const processCurrentTool = async () => {
    if (deferredTool || !hasEnoughFiles() || processing) return;
    processing = true;
    clearResult();
    updateReadyState();
    try {
      if (realBackgroundRemovalTool) await processBackgroundRemovalTool();
      else if (realImageUpscalerTool) await processImageUpscalerTool();
      else if (realDocumentTool) await processDocumentTool();
      else if (realImageTool) await processImageTool();
      else if (realPdfTool) await processPdfTool();
      else if (realMediaTool) await processMediaTool();
      else if (realServerTool) await processServerTool();
      else setStatus(status, "error", "Processing is unavailable.", tool.statusReason ?? "This route is not enabled for V1 processing.");
    } catch (error) {
      let message = getImageErrorMessage(error);
      if (realPdfTool) {
        const module = await loadPdfEngine().catch(() => undefined);
        message = module?.getPdfErrorMessage(error) ?? "The PDF could not be processed in this browser.";
      }
      if (realMediaTool) {
        const module = await loadMediaEngine().catch(() => undefined);
        message = module?.getMediaErrorMessage(error) ?? (tool.category === "video" ? "The video could not be processed in this browser." : "The audio could not be processed in this browser.");
      }
      if (realDocumentTool) message = getDocumentErrorMessage(error);
      if (realImageUpscalerTool) {
        const module = await loadImageUpscaler().catch(() => undefined);
        message = module?.getImageUpscalerErrorMessage(error) ?? "The image could not be enhanced in this browser.";
      }
      if (realBackgroundRemovalTool) message = getBackgroundRemovalErrorMessage(error);
      if (realServerTool) message = getServerErrorMessage(error);
      if (message !== "Processing was cancelled.") setStatus(status, "error", "Processing could not finish.", message);
    } finally {
      activeController = undefined;
      processing = false;
      updateProgress(undefined);
      updateReadyState();
    }
  };

  const clearWorkspace = () => {
    activeController?.abort();
    activeController = undefined;
    organizePreparationId += 1;
    mediaPreparationId += 1;
    if (tool.slug === "crop-image") {
      cropPreparationId += 1;
      cropReady = false;
      cropEditor?.clear();
    }
    if (realImageUpscalerTool) void loadImageUpscaler().then((module) => module.imageUpscalerEngine.dispose()).catch(() => undefined);
    previewManager?.dispose();
    cleanupPreviewUrls();
    files = [];
    processing = false;
    fileInput.value = "";
    clearResult();
    showFileError("");
    clearStatus(status);
    updateProgress(undefined);
    const watermarkImageInput = workspace.querySelector<HTMLInputElement>("#watermarkImage");
    if (watermarkImageInput) watermarkImageInput.value = "";
    workspace.querySelector<HTMLElement>("[data-watermark-image-name]")?.replaceChildren(document.createTextNode("No watermark image selected."));
    renderFiles();
    if (tool.slug === "organize-pdf") {
      workspace.querySelector<HTMLElement>("[data-pdf-page-controls]")?.replaceChildren(createTextElement("p", "option-help", "Choose a PDF to load its page controls."));
    }
  };

  fileInput.addEventListener("change", () => handleFiles(fileInput.files));
  chooseFiles.addEventListener("click", (event) => {
    if (deferredTool) return;
    event.stopPropagation();
    fileInput.click();
  });
  addMore.addEventListener("click", () => {
    if (!deferredTool) fileInput.click();
  });
  uploadZone.addEventListener("click", (event) => {
    if (deferredTool) return;
    if (!(event.target as HTMLElement).closest("button")) fileInput.click();
  });
  uploadZone.addEventListener("keydown", (event) => {
    if (deferredTool) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.click();
    }
  });
  ["dragenter", "dragover"].forEach((eventName) => uploadZone.addEventListener(eventName, (event) => {
    if (deferredTool) return;
    event.preventDefault();
    uploadZone.classList.add("is-dragging");
  }));
  ["dragleave", "drop"].forEach((eventName) => uploadZone.addEventListener(eventName, (event) => {
    if (deferredTool) return;
    event.preventDefault();
    uploadZone.classList.remove("is-dragging");
  }));
  uploadZone.addEventListener("drop", (event) => {
    if (!deferredTool) handleFiles(event.dataTransfer?.files ?? null);
  });
  fileList.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const moveButton = target.closest<HTMLButtonElement>("[data-move-index]");
    if (moveButton) {
      moveFile(Number(moveButton.dataset.moveIndex), moveButton.dataset.moveDirection === "up" ? "up" : "down");
      return;
    }
    const removeButton = target.closest<HTMLButtonElement>("[data-remove-index]");
    if (removeButton) removeFile(Number(removeButton.dataset.removeIndex));
  });
  fileList.addEventListener("dragstart", (event) => {
    const item = (event.target as HTMLElement).closest<HTMLElement>("[data-file-index]");
    if (!item?.draggable) return;
    event.dataTransfer?.setData("text/plain", item.dataset.fileIndex ?? "");
    item.classList.add("is-dragging");
  });
  fileList.addEventListener("dragend", (event) => {
    (event.target as HTMLElement).closest<HTMLElement>("[data-file-index]")?.classList.remove("is-dragging");
    fileList.querySelectorAll(".is-drop-target").forEach((element) => element.classList.remove("is-drop-target"));
  });
  fileList.addEventListener("dragover", (event) => {
    const item = (event.target as HTMLElement).closest<HTMLElement>("[data-file-index]");
    if (!item?.draggable) return;
    event.preventDefault();
    item.classList.add("is-drop-target");
  });
  fileList.addEventListener("dragleave", (event) => {
    (event.target as HTMLElement).closest<HTMLElement>("[data-file-index]")?.classList.remove("is-drop-target");
  });
  fileList.addEventListener("drop", (event) => {
    const item = (event.target as HTMLElement).closest<HTMLElement>("[data-file-index]");
    if (!item?.draggable) return;
    event.preventDefault();
    item.classList.remove("is-drop-target");
    const from = Number(event.dataTransfer?.getData("text/plain"));
    const to = Number(item.dataset.fileIndex);
    if (Number.isInteger(from) && Number.isInteger(to)) moveFileTo(from, to);
  });
  workspace.querySelector<HTMLElement>("[data-pdf-page-controls]")?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const actionButton = target.closest<HTMLButtonElement>("[data-page-action]");
    const row = target.closest<HTMLElement>("[data-pdf-page-control]");
    if (!actionButton || !row) return;
    const index = Number(row.dataset.pdfPageIndex);
    const pageNumbers = Array.from(workspace.querySelectorAll<HTMLElement>("[data-pdf-page-number]"))
      .map((page) => Number(page.dataset.pdfPageNumber));
    if (!Number.isInteger(index) || !pageNumbers[index]) return;
    switch (actionButton.dataset.pageAction) {
      case "up":
        if (index > 0) [pageNumbers[index - 1], pageNumbers[index]] = [pageNumbers[index], pageNumbers[index - 1]];
        break;
      case "down":
        if (index < pageNumbers.length - 1) [pageNumbers[index], pageNumbers[index + 1]] = [pageNumbers[index + 1], pageNumbers[index]];
        break;
      case "duplicate":
        pageNumbers.splice(index + 1, 0, pageNumbers[index]);
        break;
      case "delete":
        if (pageNumbers.length > 1) pageNumbers.splice(index, 1);
        break;
      default:
        return;
    }
    clearResult();
    renderOrganizeControls(pageNumbers);
    previewManager?.setPageOrder(pageNumbers);
    setStatus(status, "ready", "Page order updated.", "The selected order will be used when you process this PDF.");
  });
  workspace.querySelector<HTMLButtonElement>("[data-pdf-reverse]")?.addEventListener("click", () => {
    const pageNumbers = Array.from(workspace.querySelectorAll<HTMLElement>("[data-pdf-page-number]"))
      .map((page) => Number(page.dataset.pdfPageNumber))
      .reverse();
    if (!pageNumbers.length) return;
    clearResult();
    renderOrganizeControls(pageNumbers);
    previewManager?.setPageOrder(pageNumbers);
    setStatus(status, "ready", "Page order reversed.", "The reversed order will be used when you process this PDF.");
  });
  processButton.addEventListener("click", () => void processCurrentTool());
  processAnother.addEventListener("click", clearWorkspace);
  downloadAll.addEventListener("click", async () => {
    const downloads = Array.from(resultList.querySelectorAll<HTMLAnchorElement>("[data-result-download]"));
    const zipTools = new Set(["pdf-to-jpg", "pdf-to-png", "pdf-to-webp", "extract-images-from-pdf"]);
    if (tool.category === "pdf" && zipTools.has(tool.slug) && resultItems.some((item) => item.kind === "pdf")) {
      downloadAll.disabled = true;
      try {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        const pdfOutputs = resultItems.filter((item): item is PdfResult => item.kind === "pdf");
        for (const { item } of pdfOutputs) zip.file(item.output.name, await item.output.arrayBuffer());
        const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${tool.slug}.zip`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 5000);
        setStatus(status, "success", "ZIP download started.", `${pdfOutputs.length} output${pdfOutputs.length === 1 ? "" : "s"} packed into one local archive.`);
      } finally {
        downloadAll.disabled = false;
      }
      return;
    }
    downloads.forEach((download, index) => window.setTimeout(() => download.click(), index * 120));
    setStatus(status, "success", "Downloads started.", `${downloads.length} local file${downloads.length === 1 ? "" : "s"} queued by your browser.`);
  });
  workspace.querySelectorAll<HTMLInputElement>("input[type=range]").forEach((range) => range.addEventListener("input", () => updateRangeLabels(workspace)));
  workspace.addEventListener("input", () => previewManager?.refreshOptions());
  workspace.addEventListener("change", () => previewManager?.refreshOptions());
  const cropRatio = workspace.querySelector<HTMLSelectElement>("#cropRatio");
  cropRatio?.addEventListener("change", () => {
    if (tool.slug !== "crop-image") return;
    const value = cropRatio.value === "free" ? "free" : Number(cropRatio.value);
    cropEditor?.setRatio(value);
    if (files.length && cropReady) setStatus(status, "ready", "Crop area updated.", "Review the new frame before processing the image.");
  });
  const watermarkMode = workspace.querySelector<HTMLSelectElement>("#watermarkMode");
  const watermarkTextGroup = workspace.querySelector<HTMLElement>("[data-watermark-text-group]");
  const watermarkImageGroup = workspace.querySelector<HTMLElement>("[data-watermark-image-group]");
  const watermarkImage = workspace.querySelector<HTMLInputElement>("#watermarkImage");
  const watermarkImageName = workspace.querySelector<HTMLElement>("[data-watermark-image-name]");
  const updateWatermarkMode = () => {
    const imageMode = watermarkMode?.value === "image";
    if (watermarkTextGroup) watermarkTextGroup.hidden = Boolean(imageMode);
    if (watermarkImageGroup) watermarkImageGroup.hidden = !imageMode;
  };
  watermarkMode?.addEventListener("change", updateWatermarkMode);
  watermarkImage?.addEventListener("change", () => {
    if (watermarkImageName) watermarkImageName.textContent = watermarkImage.files?.[0]?.name ?? "No watermark image selected.";
    previewManager?.refreshOptions();
  });
  updateWatermarkMode();
  updateRangeLabels(workspace);
  if (deferredTool) {
    chooseFiles.disabled = true;
    addMore.disabled = true;
    fileInput.disabled = true;
    uploadZone.tabIndex = -1;
    uploadZone.setAttribute("aria-disabled", "true");
    setStatus(status, "error", `${tool.title} is deferred.`, tool.statusReason ?? "This route does not create a V1 result.");
  }
  window.addEventListener("beforeunload", () => {
    activeController?.abort();
    previewManager?.dispose();
    cleanupPreviewUrls();
    cleanupResultUrls();
    if (realImageTool) imageEngine.dispose();
    if (realImageUpscalerTool) void imageUpscalerModulePromise?.then((module) => module.imageUpscalerEngine.dispose());
    if (realBackgroundRemovalTool) backgroundRemovalEngine.dispose();
    if (realDocumentTool) documentEngine.dispose();
    cropEditor?.dispose();
    if (realPdfTool) void pdfEngineModulePromise?.then((module) => module.pdfEngine.dispose());
    if (realMediaTool) void mediaEngineModulePromise?.then((module) => module.mediaEngine.dispose());
  }, { once: true });
  renderFiles();
};

export const initToolWorkspace = () => {
  document.querySelectorAll<HTMLElement>("[data-workspace]").forEach((workspace) => {
    if (workspace.dataset.initialized === "true") return;
    workspace.dataset.initialized = "true";
    initWorkspace(workspace);
  });
};

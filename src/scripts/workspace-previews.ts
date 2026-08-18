type PreviewTool = string;

type PreviewResult = {
  input: File;
  inputBytes?: number;
  outputBytes?: number;
  width?: number;
  height?: number;
};

type PreviewOptions = {
  root: HTMLElement;
  tool: PreviewTool;
  getOption: (id: string) => string | undefined;
  getFileOption: (id: string) => File | undefined;
  onFileReorder: (from: number, to: number) => void;
  onPageSelectionChange: (value: string) => void;
  onOrganizeOrderChange: (order: number[]) => void;
};

type PdfThumbnail = {
  pageNumber: number;
  width: number;
  height: number;
  blob: Blob;
};

type PdfPreviewModule = typeof import("../tools/engines/pdf/pdf-engine");
type MediaPreviewModule = typeof import("./media-previews");

let pdfPreviewModulePromise: Promise<PdfPreviewModule> | undefined;
let mediaPreviewModulePromise: Promise<MediaPreviewModule> | undefined;

const loadPdfPreviewModule = () => pdfPreviewModulePromise ??= import("../tools/engines/pdf/pdf-engine");
const loadMediaPreviewModule = () => mediaPreviewModulePromise ??= import("./media-previews");

const PDF_PAGE_LIMIT = 48;
const MERGE_PAGE_LIMIT = 8;

const imageToPdfTools = new Set(["jpg-to-pdf", "png-to-pdf", "webp-to-pdf"]);

const isImageToPdfTool = (tool: string) => imageToPdfTools.has(tool);

const createText = (className: string, value: string) => {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = value;
  return element;
};

const fileKey = (file: File) => `${file.name}\u0000${file.size}\u0000${file.lastModified}`;

const createHeading = (title: string, detail: string) => {
  const heading = document.createElement("div");
  heading.className = "workspace-preview-heading";
  const copy = document.createElement("div");
  copy.append(createText("workspace-preview-title", title), createText("workspace-preview-detail", detail));
  heading.append(copy);
  return heading;
};

const createLoading = (message: string) => {
  const loading = document.createElement("p");
  loading.className = "workspace-preview-message";
  loading.textContent = message;
  loading.setAttribute("role", "status");
  return loading;
};

const createError = (message: string) => {
  const error = document.createElement("p");
  error.className = "workspace-preview-message workspace-preview-message--error";
  error.textContent = message;
  error.setAttribute("role", "status");
  return error;
};

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** index);
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
};

const parsePageSelection = (value: string | undefined, pageCount: number) => {
  const source = value?.trim().toLowerCase() || "all";
  if (source === "all") return new Set(Array.from({ length: pageCount }, (_, index) => index + 1));
  const pages = new Set<number>();
  source.split(",").forEach((part) => {
    const range = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!range) return;
    const start = Number(range[1]);
    const end = Number(range[2] ?? range[1]);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) return;
    for (let page = start; page <= Math.min(end, pageCount); page += 1) pages.add(page);
  });
  return pages;
};

const parseSinglePageRange = (value: string | undefined, pageCount: number) => {
  const match = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(value ?? "");
  if (!match) return undefined;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > pageCount) return undefined;
  return { start, end };
};

const formatPageSelection = (pages: Iterable<number>) => {
  const sorted = [...new Set(pages)].filter((page) => Number.isInteger(page) && page > 0).sort((a, b) => a - b);
  if (!sorted.length) return "";
  const groups: string[] = [];
  let start = sorted[0];
  let end = start;
  for (const page of sorted.slice(1)) {
    if (page === end + 1) {
      end = page;
      continue;
    }
    groups.push(start === end ? String(start) : `${start}-${end}`);
    start = page;
    end = page;
  }
  groups.push(start === end ? String(start) : `${start}-${end}`);
  return groups.join(", ");
};

const createPreviewImage = (url: string, alt: string) => {
  const image = document.createElement("img");
  image.className = "workspace-preview-image";
  image.src = url;
  image.alt = alt;
  return image;
};

const createImageGalleryCard = (file: File, url: string, detail: string, draggable: boolean, onDrop?: (event: DragEvent) => void) => {
  const card = document.createElement("article");
  card.className = "workspace-preview-tile";
  card.dataset.previewFileKey = fileKey(file);
  if (draggable) {
    card.draggable = true;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Reorder ${file.name}`);
    card.addEventListener("dragover", (event) => {
      event.preventDefault();
      card.classList.add("is-drop-target");
    });
    card.addEventListener("dragleave", () => card.classList.remove("is-drop-target"));
    card.addEventListener("drop", (event) => {
      event.preventDefault();
      card.classList.remove("is-drop-target");
      onDrop?.(event);
    });
  }
  const imageFrame = document.createElement("div");
  imageFrame.className = "workspace-preview-image-frame";
  imageFrame.append(createPreviewImage(url, `Preview of ${file.name}`));
  const copy = document.createElement("div");
  copy.className = "workspace-preview-tile-copy";
  const name = createText("workspace-preview-tile-name", file.name);
  name.title = file.name;
  name.setAttribute("aria-label", file.name);
  copy.append(name, createText("workspace-preview-tile-detail", detail));
  card.append(imageFrame, copy);
  return card;
};

export class WorkspacePreviewManager {
  private readonly options: PreviewOptions;
  private readonly objectUrls = new Set<string>();
  private mediaResource?: { dispose: () => void };
  private generation = 0;
  private currentFiles: File[] = [];
  private organizeOrder: number[] = [];
  private organizeThumbnailUrls = new Map<number, string>();
  private rotationImages: HTMLImageElement[] = [];
  private watermarkCanvas?: HTMLElement;
  private watermarkImageUrl?: string;
  private resultByFile = new Map<string, PreviewResult>();

  constructor(options: PreviewOptions) {
    this.options = options;
    this.options.root.hidden = true;
    this.options.root.setAttribute("aria-live", "polite");
  }

  private registerUrl(blob: Blob) {
    const url = URL.createObjectURL(blob);
    this.objectUrls.add(url);
    return url;
  }

  private releaseUrl(url: string | undefined) {
    if (!url) return;
    URL.revokeObjectURL(url);
    this.objectUrls.delete(url);
  }

  private disposeContent() {
    this.mediaResource?.dispose();
    this.mediaResource = undefined;
    this.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.objectUrls.clear();
    this.organizeThumbnailUrls.clear();
    this.rotationImages = [];
    this.watermarkCanvas = undefined;
    this.watermarkImageUrl = undefined;
    this.options.root.replaceChildren();
  }

  private shouldShowImagePreview() {
    return ["compress-image", "resize-image", "jpg-to-png", "png-to-jpg", "jpg-to-webp", "png-to-webp", "webp-to-jpg", "webp-to-png"].includes(this.options.tool)
      || isImageToPdfTool(this.options.tool);
  }

  private shouldShowPdfPreview() {
    return ["merge-pdf", "split-pdf", "organize-pdf", "rotate-pdf", "watermark-pdf", "pdf-to-jpg"].includes(this.options.tool);
  }

  private async renderImagePreview(files: File[], token: number) {
    if (!this.shouldShowImagePreview()) return;
    const root = this.options.root;
    root.append(createHeading(
      isImageToPdfTool(this.options.tool) ? "PDF page order" : "Image preview",
      isImageToPdfTool(this.options.tool) ? "Images stay local. Drag a preview or use the file controls to set the page order." : "A local preview helps confirm the source before processing.",
    ));
    const gallery = document.createElement("div");
    gallery.className = "workspace-preview-gallery";
    root.append(gallery);
    files.forEach((file, index) => {
      const url = this.registerUrl(file);
      const result = this.resultByFile.get(fileKey(file));
      const detail = this.options.tool === "resize-image" && result?.width && result.height
        ? `${result.width} × ${result.height} px · ${formatBytes(file.size)}`
        : result?.outputBytes !== undefined
          ? `${formatBytes(file.size)} → ${formatBytes(result.outputBytes)}`
          : `${formatBytes(file.size)} · dimensions load locally`;
      const tile = createImageGalleryCard(file, url, detail, isImageToPdfTool(this.options.tool), (event) => {
        const sourceKey = event.dataTransfer?.getData("text/plain");
        const from = files.findIndex((candidate) => fileKey(candidate) === sourceKey);
        if (from >= 0 && from !== index) this.options.onFileReorder(from, index);
      });
      tile.addEventListener("dragstart", (event) => {
        event.dataTransfer?.setData("text/plain", fileKey(file));
        tile.classList.add("is-dragging");
      });
      tile.addEventListener("dragend", () => tile.classList.remove("is-dragging"));
      if (isImageToPdfTool(this.options.tool)) {
        tile.addEventListener("keydown", (event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const target = event.key === "ArrowLeft" ? index - 1 : index + 1;
          if (target >= 0 && target < files.length) this.options.onFileReorder(index, target);
        });
      }
      gallery.append(tile);
    });
    if (this.options.tool === "resize-image" || this.options.tool === "compress-image") {
      gallery.querySelectorAll<HTMLImageElement>(".workspace-preview-image").forEach((image, index) => {
        image.addEventListener("load", () => {
          if (token !== this.generation) return;
          const tile = image.closest<HTMLElement>(".workspace-preview-tile");
          const detail = tile?.querySelector<HTMLElement>(".workspace-preview-tile-detail");
          if (!detail) return;
          const file = files[index];
          const result = file ? this.resultByFile.get(fileKey(file)) : undefined;
          if (this.options.tool === "resize-image") detail.textContent = `${image.naturalWidth} × ${image.naturalHeight} px · ${formatBytes(file?.size ?? 0)}`;
          else detail.textContent = result?.outputBytes !== undefined ? `${formatBytes(file?.size ?? 0)} → ${formatBytes(result.outputBytes)}` : `${image.naturalWidth} × ${image.naturalHeight} px · ${formatBytes(file?.size ?? 0)} before`;
        }, { once: true });
      });
    }
  }

  private async getPdfThumbnails(module: PdfPreviewModule, file: File, pageNumbers: number[], token: number) {
    const response = await module.renderPdfThumbnails(file, pageNumbers, 156);
    if (token !== this.generation) return undefined;
    return response;
  }

  private createPdfTile(thumbnail: PdfThumbnail, url: string, fileName: string, label = `Page ${thumbnail.pageNumber}`) {
    const tile = document.createElement("article");
    tile.className = "pdf-page-preview-tile";
    tile.dataset.pdfPreviewPage = String(thumbnail.pageNumber);
    const imageFrame = document.createElement("div");
    imageFrame.className = "pdf-page-preview-image";
    imageFrame.append(createPreviewImage(url, `Page ${thumbnail.pageNumber} preview of ${fileName}`));
    tile.append(imageFrame, createText("pdf-page-preview-label", label));
    return tile;
  }

  private createSelectionTile(thumbnail: PdfThumbnail, url: string, fileName: string, selected: boolean, onToggle: () => void) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pdf-page-preview-tile pdf-page-preview-tile--selectable";
    button.dataset.pdfPreviewPage = String(thumbnail.pageNumber);
    button.setAttribute("aria-pressed", String(selected));
    button.setAttribute("aria-label", `${selected ? "Deselect" : "Select"} page ${thumbnail.pageNumber}`);
    const imageFrame = document.createElement("span");
    imageFrame.className = "pdf-page-preview-image";
    imageFrame.append(createPreviewImage(url, `Page ${thumbnail.pageNumber} preview of ${fileName}`));
    button.append(imageFrame, createText("pdf-page-preview-label", `Page ${thumbnail.pageNumber}`));
    button.addEventListener("click", onToggle);
    return button;
  }

  private renderOrganizeCards(pageNumbers: number[]) {
    const grid = this.options.root.querySelector<HTMLElement>("[data-pdf-organize-grid]");
    if (!grid) return;
    grid.replaceChildren();
    pageNumbers.forEach((pageNumber, index) => {
      const url = this.organizeThumbnailUrls.get(pageNumber);
      if (!url) return;
      const tile = this.createPdfTile({ pageNumber, width: 1, height: 1, blob: new Blob() }, url, this.currentFiles[0]?.name ?? "PDF");
      tile.draggable = true;
      tile.tabIndex = 0;
      tile.setAttribute("role", "button");
      tile.setAttribute("aria-label", `Page ${pageNumber}. Drag to reorder, or use the keyboard to move it.`);
      tile.dataset.pdfOrganizeIndex = String(index);
      tile.addEventListener("dragstart", (event) => {
        event.dataTransfer?.setData("text/plain", String(index));
        tile.classList.add("is-dragging");
      });
      tile.addEventListener("dragend", () => tile.classList.remove("is-dragging"));
      tile.addEventListener("dragover", (event) => {
        event.preventDefault();
        tile.classList.add("is-drop-target");
      });
      tile.addEventListener("dragleave", () => tile.classList.remove("is-drop-target"));
      tile.addEventListener("drop", (event) => {
        event.preventDefault();
        tile.classList.remove("is-drop-target");
        const from = Number(event.dataTransfer?.getData("text/plain"));
        if (!Number.isInteger(from) || from === index || from < 0 || from >= pageNumbers.length) return;
        const order = [...pageNumbers];
        const [moved] = order.splice(from, 1);
        order.splice(index, 0, moved);
        this.organizeOrder = order;
        this.renderOrganizeCards(order);
        this.options.onOrganizeOrderChange(order);
      });
      tile.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
        const target = index + direction;
        if (target < 0 || target >= pageNumbers.length) return;
        const order = [...pageNumbers];
        [order[index], order[target]] = [order[target], order[index]];
        this.organizeOrder = order;
        this.renderOrganizeCards(order);
        this.options.onOrganizeOrderChange(order);
        grid.querySelector<HTMLElement>(`[data-pdf-organize-index="${target}"]`)?.focus();
      });
      grid.append(tile);
    });
  }

  private updateRotationPreview() {
    const rotation = Number(this.options.getOption("rotationAngle") ?? 90);
    const selected = parsePageSelection(this.options.getOption("pageSelection"), this.rotationImages.length);
    this.rotationImages.forEach((image, index) => {
      image.style.transform = selected.has(index + 1) ? `rotate(${rotation}deg)` : "none";
      image.closest<HTMLElement>(".pdf-page-preview-tile")?.setAttribute("data-rotation", selected.has(index + 1) ? `${rotation}` : "0");
    });
    const state = this.options.root.querySelector<HTMLElement>("[data-pdf-rotation-state]");
    if (state) state.textContent = selected.size === this.rotationImages.length ? `All pages · ${rotation}° clockwise` : `${selected.size} selected · ${rotation}° clockwise`;
  }

  private async renderPdfPreview(files: File[], token: number) {
    if (!this.shouldShowPdfPreview()) return;
    const module = await loadPdfPreviewModule();
    if (token !== this.generation) return;
    const root = this.options.root;
    root.replaceChildren(createHeading("PDF page preview", "Pages are rendered locally from the selected document; nothing is uploaded."), createLoading("Loading page previews locally…"));

    if (this.options.tool === "merge-pdf") {
      const gallery = document.createElement("div");
      gallery.className = "workspace-preview-document-list";
      root.replaceChildren(createHeading("Documents and pages", "Drag a document preview to reorder it. The file controls remain available for keyboard and touch users."), gallery);
      for (const [index, file] of files.entries()) {
        if (token !== this.generation) return;
        try {
          const first = await module.renderPdfThumbnails(file, [1], 156);
          const pageNumbers = Array.from({ length: Math.min(first.pageCount, MERGE_PAGE_LIMIT) }, (_, pageIndex) => pageIndex + 1);
          const response = pageNumbers.length === 1 ? first : await this.getPdfThumbnails(module, file, pageNumbers, token);
          if (!response || token !== this.generation) return;
          const documentCard = document.createElement("article");
          documentCard.className = "workspace-preview-document";
          documentCard.draggable = true;
          documentCard.tabIndex = 0;
          documentCard.setAttribute("role", "button");
          documentCard.setAttribute("aria-label", `Reorder ${file.name}`);
          const title = createText("workspace-preview-document-name", file.name);
          title.title = file.name;
          title.setAttribute("aria-label", file.name);
          const meta = createText("workspace-preview-document-meta", `${response.pageCount} ${response.pageCount === 1 ? "page" : "pages"}`);
          const pages = document.createElement("div");
          pages.className = "pdf-page-preview-strip";
          response.thumbnails.forEach((thumbnail) => {
            const url = this.registerUrl(thumbnail.blob);
            pages.append(this.createPdfTile(thumbnail, url, file.name));
          });
          if (response.pageCount > MERGE_PAGE_LIMIT) pages.append(createText("workspace-preview-more", `+ ${response.pageCount - MERGE_PAGE_LIMIT} more pages`));
          documentCard.append(title, meta, pages);
          documentCard.addEventListener("dragstart", (event) => {
            event.dataTransfer?.setData("text/plain", String(index));
            documentCard.classList.add("is-dragging");
          });
          documentCard.addEventListener("dragend", () => documentCard.classList.remove("is-dragging"));
          documentCard.addEventListener("dragover", (event) => {
            event.preventDefault();
            documentCard.classList.add("is-drop-target");
          });
          documentCard.addEventListener("dragleave", () => documentCard.classList.remove("is-drop-target"));
          documentCard.addEventListener("drop", (event) => {
            event.preventDefault();
            documentCard.classList.remove("is-drop-target");
            const from = Number(event.dataTransfer?.getData("text/plain"));
            if (!Number.isInteger(from) || from === index || from < 0 || from >= files.length) return;
            this.options.onFileReorder(from, index);
          });
          documentCard.addEventListener("keydown", (event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
            const target = index + direction;
            if (target >= 0 && target < files.length) this.options.onFileReorder(index, target);
          });
          gallery.append(documentCard);
        } catch {
          gallery.append(createError(`“${file.name}” could not be previewed locally.`));
        }
      }
      return;
    }

    const file = files[0];
    if (!file) return;
    const inspected = await module.renderPdfThumbnails(file, [1], 156);
    if (token !== this.generation) return;
    const splitRange = this.options.tool === "split-pdf" ? parseSinglePageRange(this.options.getOption("pageSelection"), inspected.pageCount) : undefined;
    if (this.options.tool === "split-pdf" && !splitRange) {
      root.replaceChildren(
        createHeading("Range preview", `Enter a valid range from page 1 to ${inspected.pageCount}.`),
        createError("Use a range such as 1–3 to preview the first and last page."),
      );
      return;
    }
    const pageNumbers = splitRange
      ? (splitRange.start === splitRange.end ? [splitRange.start] : [splitRange.start, splitRange.end])
      : Array.from({ length: Math.min(inspected.pageCount, PDF_PAGE_LIMIT) }, (_, index) => index + 1);
    const response = pageNumbers.length === 1 && pageNumbers[0] === 1 ? inspected : await this.getPdfThumbnails(module, file, pageNumbers, token);
    if (!response || token !== this.generation) return;

    if (this.options.tool === "watermark-pdf") {
      const thumbnail = response.thumbnails[0];
      if (!thumbnail) return;
      const imageUrl = this.registerUrl(thumbnail.blob);
      const card = document.createElement("div");
      card.className = "pdf-watermark-preview";
      const page = document.createElement("div");
      page.className = "pdf-watermark-page";
      page.append(createPreviewImage(imageUrl, `Watermark preview of page 1 from ${file.name}`));
      const overlay = document.createElement("div");
      overlay.className = "pdf-watermark-overlay";
      page.append(overlay);
      card.append(createHeading("Watermark preview", "The first page shows the current watermark settings locally."), page);
      root.replaceChildren(card);
      this.watermarkCanvas = page;
      this.refreshWatermarkPreview();
      return;
    }

    if (this.options.tool === "split-pdf" && splitRange) {
      const grid = document.createElement("div");
      grid.className = "pdf-page-preview-grid pdf-page-preview-grid--range";
      root.replaceChildren(createHeading("Range preview", `Only the first and last page of ${splitRange.start}–${splitRange.end} are shown.`), grid);
      response.thumbnails.forEach((thumbnail) => {
        const edge = splitRange.start === splitRange.end
          ? "Selected page"
          : thumbnail.pageNumber === splitRange.start ? "Start page" : "End page";
        const tile = this.createPdfTile(thumbnail, this.registerUrl(thumbnail.blob), file.name, `${edge} · Page ${thumbnail.pageNumber}`);
        tile.dataset.pdfPreviewEdge = edge === "Start page" ? "start" : edge === "End page" ? "end" : "selected";
        grid.append(tile);
      });
      if (splitRange.end - splitRange.start > 1) grid.append(createText("workspace-preview-more", `Pages ${splitRange.start + 1}–${splitRange.end - 1} stay inside the selected range.`));
      return;
    }

    const grid = document.createElement("div");
    grid.className = "pdf-page-preview-grid";
    root.replaceChildren(createHeading(
      this.options.tool === "organize-pdf" ? "Page order preview" : this.options.tool === "rotate-pdf" ? "Rotation preview" : "Page previews",
      this.options.tool === "organize-pdf" ? "Drag pages or use the keyboard controls in Configure to set the final order." : this.options.tool === "rotate-pdf" ? "The preview reflects the selected rotation angle." : "Select pages using the previews or the page field in Configure.",
    ), grid);

    if (this.options.tool === "organize-pdf") {
      this.organizeOrder = response.thumbnails.map((thumbnail) => thumbnail.pageNumber);
      response.thumbnails.forEach((thumbnail) => {
        this.organizeThumbnailUrls.set(thumbnail.pageNumber, this.registerUrl(thumbnail.blob));
      });
      grid.dataset.pdfOrganizeGrid = "true";
      this.renderOrganizeCards(this.organizeOrder);
      return;
    }

    if (this.options.tool === "rotate-pdf") {
      const state = createText("pdf-rotation-state", "Rotation preview loading…");
      state.dataset.pdfRotationState = "true";
      root.insertBefore(state, grid);
      this.rotationImages = response.thumbnails.map((thumbnail) => {
        const url = this.registerUrl(thumbnail.blob);
        const tile = this.createPdfTile(thumbnail, url, file.name);
        const image = tile.querySelector<HTMLImageElement>("img");
        grid.append(tile);
        return image;
      }).filter((image): image is HTMLImageElement => Boolean(image));
      this.updateRotationPreview();
      return;
    }

    const selectionMode = this.options.tool === "pdf-to-jpg";
    const selectedPages = parsePageSelection(this.options.getOption("pageSelection"), response.pageCount);
    response.thumbnails.forEach((thumbnail) => {
      const url = this.registerUrl(thumbnail.blob);
      if (!selectionMode) {
        grid.append(this.createPdfTile(thumbnail, url, file.name));
        return;
      }
      const tile = this.createSelectionTile(thumbnail, url, file.name, selectedPages.has(thumbnail.pageNumber), () => {
        if (selectedPages.has(thumbnail.pageNumber)) selectedPages.delete(thumbnail.pageNumber);
        else selectedPages.add(thumbnail.pageNumber);
        const value = selectedPages.size === response.pageCount ? "all" : formatPageSelection(selectedPages);
        tile.setAttribute("aria-pressed", String(selectedPages.has(thumbnail.pageNumber)));
        tile.setAttribute("aria-label", `${selectedPages.has(thumbnail.pageNumber) ? "Deselect" : "Select"} page ${thumbnail.pageNumber}`);
        this.options.onPageSelectionChange(value);
      });
      grid.append(tile);
    });
    if (response.pageCount > PDF_PAGE_LIMIT) grid.append(createText("workspace-preview-more", `Showing the first ${PDF_PAGE_LIMIT} of ${response.pageCount} pages.`));
  }

  private refreshWatermarkPreview() {
    const page = this.watermarkCanvas;
    if (!page) return;
    const overlay = page.querySelector<HTMLElement>(".pdf-watermark-overlay");
    if (!overlay) return;
    const mode = this.options.getOption("watermarkMode") ?? "text";
    const placement = this.options.getOption("watermarkPlacement") ?? "center";
    const scale = Number(this.options.getOption("watermarkScaleRange") ?? 35);
    const opacity = Number(this.options.getOption("watermarkOpacityRange") ?? 35);
    overlay.replaceChildren();
    overlay.dataset.placement = placement;
    overlay.style.opacity = String(Math.min(100, Math.max(5, opacity)) / 100);
    overlay.style.fontSize = `${Math.max(11, Math.min(42, scale * 0.72))}px`;
    overlay.style.color = this.options.getOption("watermarkColor") ?? "#64748b";
    if (mode === "image") {
      const imageFile = this.options.getFileOption("watermarkImage");
      if (imageFile) {
        if (this.watermarkImageUrl) this.releaseUrl(this.watermarkImageUrl);
        this.watermarkImageUrl = this.registerUrl(imageFile);
        const image = document.createElement("img");
        image.src = this.watermarkImageUrl;
        image.alt = "Watermark image preview";
        overlay.append(image);
      } else {
        overlay.textContent = "Choose a watermark image";
      }
      return;
    }
    overlay.textContent = this.options.getOption("watermarkText")?.trim() || "DoMyFile";
  }

  private async renderMediaPreview(files: File[], token: number) {
    if (!(this.options.tool === "trim-audio" || this.options.tool === "trim-video" || this.options.tool === "video-to-mp3" || this.options.tool === "mov-to-mp4" || this.options.tool === "video-converter")) return;
    const file = files[0];
    if (!file) return;
    const module = await loadMediaPreviewModule();
    if (token !== this.generation) return;
    this.options.root.replaceChildren();
    this.mediaResource = module.createMediaPreview(this.options.root, this.options.tool as "trim-audio" | "trim-video" | "video-to-mp3" | "mov-to-mp4" | "video-converter", file);
  }

  private async render(files: File[], token: number) {
    if (this.options.tool === "merge-audio") return;
    if (this.shouldShowImagePreview()) return this.renderImagePreview(files, token);
    if (this.shouldShowPdfPreview()) return this.renderPdfPreview(files, token);
    if (this.options.tool === "trim-audio" || this.options.tool === "trim-video" || this.options.tool === "video-to-mp3" || this.options.tool === "mov-to-mp4" || this.options.tool === "video-converter") return this.renderMediaPreview(files, token);
  }

  update(files: File[]) {
    this.currentFiles = [...files];
    this.generation += 1;
    const token = this.generation;
    this.disposeContent();
    this.options.root.hidden = !files.length || (this.options.tool !== "merge-audio" && !this.shouldShowImagePreview() && !this.shouldShowPdfPreview() && !["trim-audio", "trim-video", "video-to-mp3", "mov-to-mp4", "video-converter"].includes(this.options.tool));
    if (this.options.root.hidden) return;
    this.options.root.append(createLoading("Preparing a local preview…"));
    void this.render(files, token).catch(() => {
      if (token !== this.generation) return;
      this.options.root.replaceChildren(createError("This preview is unavailable in the current browser. The file can still be processed locally if it is supported."));
    });
  }

  setPageOrder(order: number[]) {
    if (this.options.tool !== "organize-pdf") return;
    this.organizeOrder = [...order];
    this.renderOrganizeCards(this.organizeOrder);
  }

  refreshOptions() {
    if (this.options.tool === "watermark-pdf") this.refreshWatermarkPreview();
    if (this.options.tool === "rotate-pdf") this.updateRotationPreview();
    if (this.options.tool === "split-pdf" && this.currentFiles.length) this.update(this.currentFiles);
  }

  setResults(results: PreviewResult[]) {
    this.resultByFile = new Map(results.map((result) => [fileKey(result.input), result]));
    if (this.currentFiles.length && (this.options.tool === "compress-image" || this.options.tool === "resize-image")) this.update(this.currentFiles);
  }

  dispose() {
    this.generation += 1;
    this.disposeContent();
    this.options.root.hidden = true;
    this.currentFiles = [];
    this.resultByFile.clear();
  }
}

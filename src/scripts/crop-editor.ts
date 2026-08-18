import type { ImageRenderPlan } from "../tools/engines/image/types";
import {
  createInitialCropRect,
  cropRectToRenderPlan,
  moveCropRect,
  resizeCropRect,
  type CropHandle,
  type CropRatio,
  type CropRect,
} from "./crop-geometry";

type DecodedCropSource = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

type CropEditorOptions = {
  onChange?: (plan: ImageRenderPlan | undefined) => void;
  onError?: (message: string) => void;
};

type PointerInteraction = {
  pointerId: number;
  mode: "move" | "resize";
  handle?: CropHandle;
  startX: number;
  startY: number;
  rect: CropRect;
};

const maximumPreviewDimension = 520;
const maximumCanvasDimension = 2400;

const asRatio = (value: CropRatio) => value === "free" ? "free" : Number.isFinite(value) ? value : 1;

const getCropHandle = (target: EventTarget | null): CropHandle | undefined => {
  const element = target instanceof Element ? target.closest<HTMLElement>("[data-crop-handle]") : undefined;
  const handle = element?.dataset.cropHandle;
  return handle && ["n", "ne", "e", "se", "s", "sw", "w", "nw"].includes(handle) ? handle as CropHandle : undefined;
};

const decodeSource = async (file: File): Promise<DecodedCropSource> => {
  const decoder = globalThis.createImageBitmap;
  if (typeof decoder === "function") {
    let bitmap: ImageBitmap;
    try {
      bitmap = await decoder(file, { imageOrientation: "from-image" });
    } catch {
      bitmap = await decoder(file);
    }
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }

  if (typeof Image === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("This browser does not provide a local image preview.");
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    if (typeof image.decode === "function") {
      await image.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Image preview decode failed."));
      });
    }
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => undefined };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

export class CropEditor {
  private readonly root: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly selection: HTMLElement;
  private readonly previewCanvas: HTMLCanvasElement;
  private readonly sizeLabel: HTMLElement;
  private readonly previewSizeLabel: HTMLElement | null;
  private readonly errorLabel: HTMLElement | null;
  private readonly options: CropEditorOptions;
  private source?: DecodedCropSource;
  private rect?: CropRect;
  private ratio: CropRatio = "free";
  private interaction?: PointerInteraction;
  private loadId = 0;

  constructor(root: HTMLElement, options: CropEditorOptions = {}) {
    const stage = root.querySelector<HTMLElement>("[data-crop-stage]");
    const canvas = root.querySelector<HTMLCanvasElement>("[data-crop-image]");
    const selection = root.querySelector<HTMLElement>("[data-crop-selection]");
    const previewCanvas = root.querySelector<HTMLCanvasElement>("[data-crop-preview]");
    const sizeLabel = root.querySelector<HTMLElement>("[data-crop-size]");
    if (!stage || !canvas || !selection || !previewCanvas || !sizeLabel) {
      throw new Error("The crop editor markup is incomplete.");
    }

    this.root = root;
    this.stage = stage;
    this.canvas = canvas;
    this.selection = selection;
    this.previewCanvas = previewCanvas;
    this.sizeLabel = sizeLabel;
    this.previewSizeLabel = root.querySelector<HTMLElement>("[data-crop-preview-size]");
    this.errorLabel = root.querySelector<HTMLElement>("[data-crop-error]");
    this.options = options;
    this.root.hidden = true;

    this.selection.addEventListener("pointerdown", this.handlePointerDown);
    this.selection.addEventListener("pointermove", this.handlePointerMove);
    this.selection.addEventListener("pointerup", this.handlePointerUp);
    this.selection.addEventListener("pointercancel", this.handlePointerUp);
    this.selection.addEventListener("keydown", this.handleKeyDown);
  }

  async load(file: File) {
    const loadId = ++this.loadId;
    this.releaseSource();
    this.rect = undefined;
    this.root.hidden = true;
    this.setError("");
    try {
      const decoded = await decodeSource(file);
      if (loadId !== this.loadId) {
        decoded.close();
        return;
      }
      this.source = decoded;
      this.canvas.width = Math.min(decoded.width, maximumCanvasDimension);
      this.canvas.height = Math.max(1, Math.round(decoded.height * (this.canvas.width / decoded.width)));
      this.stage.style.aspectRatio = `${decoded.width} / ${decoded.height}`;
      this.stage.style.width = `${this.canvas.width}px`;
      const context = this.canvas.getContext("2d");
      if (!context) throw new Error("This browser could not create a local crop preview.");
      context.clearRect(0, 0, this.canvas.width, this.canvas.height);
      context.drawImage(decoded.source, 0, 0, this.canvas.width, this.canvas.height);
      this.rect = createInitialCropRect(decoded.width, decoded.height, this.ratio);
      this.root.hidden = false;
      this.render();
    } catch (error) {
      if (loadId !== this.loadId) return;
      this.setError(error instanceof Error ? error.message : "This image could not be previewed locally.");
      this.options.onError?.(this.errorLabel?.textContent ?? "This image could not be previewed locally.");
      throw error;
    }
  }

  setRatio(ratio: CropRatio) {
    this.ratio = asRatio(ratio);
    if (!this.source) return;
    this.rect = createInitialCropRect(this.source.width, this.source.height, this.ratio);
    this.render();
  }

  getPlan() {
    if (!this.source || !this.rect) return undefined;
    return cropRectToRenderPlan(this.rect, this.source.width, this.source.height);
  }

  clear() {
    this.loadId += 1;
    this.interaction = undefined;
    this.releaseSource();
    this.rect = undefined;
    this.root.hidden = true;
    this.setError("");
    this.clearCanvas(this.canvas);
    this.clearCanvas(this.previewCanvas);
    this.sizeLabel.textContent = "Choose an image to start";
    if (this.previewSizeLabel) this.previewSizeLabel.textContent = "Choose an image to start";
    this.options.onChange?.(undefined);
  }

  dispose() {
    this.loadId += 1;
    this.interaction = undefined;
    this.releaseSource();
    this.selection.removeEventListener("pointerdown", this.handlePointerDown);
    this.selection.removeEventListener("pointermove", this.handlePointerMove);
    this.selection.removeEventListener("pointerup", this.handlePointerUp);
    this.selection.removeEventListener("pointercancel", this.handlePointerUp);
    this.selection.removeEventListener("keydown", this.handleKeyDown);
    this.clearCanvas(this.canvas);
    this.clearCanvas(this.previewCanvas);
  }

  private readonly handlePointerDown = (event: PointerEvent) => {
    if (!this.rect || !this.source) return;
    const handle = getCropHandle(event.target);
    this.interaction = {
      pointerId: event.pointerId,
      mode: handle ? "resize" : "move",
      handle,
      startX: event.clientX,
      startY: event.clientY,
      rect: this.rect,
    };
    this.selection.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  private readonly handlePointerMove = (event: PointerEvent) => {
    const interaction = this.interaction;
    if (!interaction || interaction.pointerId !== event.pointerId || !this.rect || !this.source) return;
    const bounds = this.canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const deltaX = (event.clientX - interaction.startX) / bounds.width;
    const deltaY = (event.clientY - interaction.startY) / bounds.height;
    this.rect = interaction.mode === "move"
      ? moveCropRect(interaction.rect, deltaX, deltaY)
      : resizeCropRect(interaction.rect, interaction.handle ?? "se", deltaX, deltaY, this.source.width, this.source.height, this.ratio);
    this.render();
    event.preventDefault();
  };

  private readonly handlePointerUp = (event: PointerEvent) => {
    if (this.interaction?.pointerId !== event.pointerId) return;
    if (this.selection.hasPointerCapture(event.pointerId)) this.selection.releasePointerCapture(event.pointerId);
    this.interaction = undefined;
  };

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (!this.rect || !this.source) return;
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-0.01, 0],
      ArrowRight: [0.01, 0],
      ArrowUp: [0, -0.01],
      ArrowDown: [0, 0.01],
    };
    const delta = deltas[event.key];
    if (!delta) return;
    this.rect = event.shiftKey
      ? resizeCropRect(this.rect, "se", delta[0], delta[1], this.source.width, this.source.height, this.ratio)
      : moveCropRect(this.rect, delta[0], delta[1]);
    this.render();
    event.preventDefault();
  };

  private render() {
    if (!this.source || !this.rect) return;
    const plan = cropRectToRenderPlan(this.rect, this.source.width, this.source.height);
    this.selection.style.left = `${this.rect.x * 100}%`;
    this.selection.style.top = `${this.rect.y * 100}%`;
    this.selection.style.width = `${this.rect.width * 100}%`;
    this.selection.style.height = `${this.rect.height * 100}%`;
    this.selection.setAttribute("aria-label", `Crop area, ${plan.targetWidth} by ${plan.targetHeight} pixels. Use arrow keys to move; hold Shift to resize.`);
    this.sizeLabel.textContent = `${plan.targetWidth} × ${plan.targetHeight} px`;
    if (this.previewSizeLabel) this.previewSizeLabel.textContent = `${plan.targetWidth} × ${plan.targetHeight} px`;

    const previewScale = Math.min(1, maximumPreviewDimension / Math.max(plan.sourceWidth, plan.sourceHeight));
    this.previewCanvas.width = Math.max(1, Math.round(plan.sourceWidth * previewScale));
    this.previewCanvas.height = Math.max(1, Math.round(plan.sourceHeight * previewScale));
    const previewContext = this.previewCanvas.getContext("2d");
    if (previewContext) {
      previewContext.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
      previewContext.drawImage(
        this.source.source,
        plan.sourceX,
        plan.sourceY,
        plan.sourceWidth,
        plan.sourceHeight,
        0,
        0,
        this.previewCanvas.width,
        this.previewCanvas.height,
      );
    }
    this.options.onChange?.(plan);
  }

  private setError(message: string) {
    if (!this.errorLabel) return;
    this.errorLabel.textContent = message;
    this.errorLabel.hidden = !message;
  }

  private clearCanvas(canvas: HTMLCanvasElement) {
    canvas.width = 1;
    canvas.height = 1;
    canvas.getContext("2d")?.clearRect(0, 0, 1, 1);
  }

  private releaseSource() {
    this.source?.close();
    this.source = undefined;
  }
}

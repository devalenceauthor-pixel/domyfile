type MediaPreviewTool = "trim-audio" | "trim-video" | "video-to-mp3" | "mov-to-mp4" | "video-converter";

export type MediaPreviewResource = {
  dispose: () => void;
};

const createText = (className: string, value: string) => {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = value;
  return element;
};

const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "Duration unavailable";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - (minutes * 60);
  return `${String(minutes).padStart(2, "0")}:${remainder.toFixed(2).padStart(5, "0")}`;
};

const createCard = (root: HTMLElement, title: string, detail: string) => {
  const heading = document.createElement("div");
  heading.className = "workspace-preview-heading";
  const copy = document.createElement("div");
  copy.append(createText("workspace-preview-title", title), createText("workspace-preview-detail", detail));
  heading.append(copy);
  const card = document.createElement("div");
  card.className = "workspace-preview-card";
  card.append(heading);
  root.append(card);
  return card;
};

const drawWaveform = (canvas: HTMLCanvasElement, audioBuffer: AudioBuffer) => {
  const width = 640;
  const height = 86;
  const bars = Math.min(128, Math.max(64, Math.floor(width / 5)));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#eeecff";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#6557f5";
  context.lineWidth = 2;
  const channel = audioBuffer.getChannelData(0);
  const samplesPerBar = Math.max(1, Math.floor(channel.length / bars));
  const center = height / 2;
  for (let bar = 0; bar < bars; bar += 1) {
    const start = bar * samplesPerBar;
    const end = Math.min(channel.length, start + samplesPerBar);
    let peak = 0;
    for (let index = start; index < end; index += 1) peak = Math.max(peak, Math.abs(channel[index] ?? 0));
    const barHeight = Math.max(3, peak * (height * 0.42));
    const x = (bar / bars) * width;
    context.beginPath();
    context.moveTo(x, center - barHeight);
    context.lineTo(x, center + barHeight);
    context.stroke();
  }
};

const createAudioPreview = (root: HTMLElement, file: File): MediaPreviewResource => {
  const objectUrl = URL.createObjectURL(file);
  let disposed = false;
  let audioContext: AudioContext | undefined;

  const card = createCard(root, "Audio preview", "Play locally and move through the timeline before choosing a range.");
  const audio = document.createElement("audio");
  audio.className = "media-preview-player";
  audio.controls = true;
  audio.preload = "metadata";
  audio.src = objectUrl;
  audio.setAttribute("aria-label", `Audio preview for ${file.name}`);

  const timeline = document.createElement("input");
  timeline.className = "media-preview-timeline";
  timeline.type = "range";
  timeline.min = "0";
  timeline.max = "0";
  timeline.step = "0.01";
  timeline.value = "0";
  timeline.setAttribute("aria-label", "Audio preview timeline");

  const timelineMeta = document.createElement("div");
  timelineMeta.className = "media-preview-timeline-meta";
  timelineMeta.append(createText("media-preview-time", "00:00.00"), createText("media-preview-duration", "Duration unavailable"));

  const waveform = document.createElement("canvas");
  waveform.className = "media-preview-waveform";
  waveform.width = 640;
  waveform.height = 86;
  waveform.setAttribute("role", "img");
  waveform.setAttribute("aria-label", `Waveform preview for ${file.name}`);

  const message = createText("media-preview-message", "Preparing a local waveform…");
  card.append(audio, waveform, message, timeline, timelineMeta);

  const updateTime = () => {
    timeline.value = String(audio.currentTime || 0);
    const current = timelineMeta.firstElementChild;
    if (current) current.textContent = formatDuration(audio.currentTime || 0);
  };
  const updateDuration = () => {
    if (!Number.isFinite(audio.duration)) return;
    timeline.max = String(audio.duration);
    const duration = timelineMeta.lastElementChild;
    if (duration) duration.textContent = formatDuration(audio.duration);
  };
  audio.addEventListener("loadedmetadata", updateDuration);
  audio.addEventListener("timeupdate", updateTime);
  timeline.addEventListener("input", () => {
    audio.currentTime = Number(timeline.value);
    updateTime();
  });

  const createWaveform = async () => {
    const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextConstructor) {
      message.textContent = "Waveform preview is unavailable; the local timeline is still ready.";
      return;
    }
    try {
      audioContext = new AudioContextConstructor();
      const buffer = await file.arrayBuffer();
      if (disposed) return;
      const decoded = await audioContext.decodeAudioData(buffer.slice(0));
      if (disposed) return;
      drawWaveform(waveform, decoded);
      message.textContent = "Waveform ready. The file remains on this device.";
    } catch {
      if (!disposed) message.textContent = "Waveform preview is unavailable; the local timeline is still ready.";
    }
  };
  void createWaveform();

  return {
    dispose: () => {
      disposed = true;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(objectUrl);
      void audioContext?.close().catch(() => undefined);
      audioContext = undefined;
      waveform.width = 0;
      waveform.height = 0;
    },
  };
};

const createVideoPreview = (root: HTMLElement, file: File, tool: MediaPreviewTool): MediaPreviewResource => {
  const objectUrl = URL.createObjectURL(file);
  let disposed = false;
  const isTrim = tool === "trim-video";
  const card = createCard(
    root,
    isTrim ? "Video preview" : "Video thumbnail",
    isTrim ? "Use the player and timeline to review the local clip." : "A local thumbnail and basic metadata are shown before processing.",
  );
  const video = document.createElement("video");
  video.className = isTrim ? "media-preview-player media-preview-video" : "media-preview-thumbnail";
  video.controls = isTrim;
  video.muted = !isTrim;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = objectUrl;
  video.setAttribute("aria-label", `Video preview for ${file.name}`);

  const metadata = createText("media-preview-message", "Reading video metadata locally…");
  card.append(video, metadata);

  let timeline: HTMLInputElement | undefined;
  let timelineMeta: HTMLElement | undefined;
  if (isTrim) {
    timeline = document.createElement("input");
    timeline.className = "media-preview-timeline";
    timeline.type = "range";
    timeline.min = "0";
    timeline.max = "0";
    timeline.step = "0.01";
    timeline.value = "0";
    timeline.setAttribute("aria-label", "Video preview timeline");
    timelineMeta = document.createElement("div");
    timelineMeta.className = "media-preview-timeline-meta";
    timelineMeta.append(createText("media-preview-time", "00:00.00"), createText("media-preview-duration", "Duration unavailable"));
    card.append(timeline, timelineMeta);
    timeline.addEventListener("input", () => {
      video.currentTime = Number(timeline?.value ?? 0);
      const current = timelineMeta?.firstElementChild;
      if (current) current.textContent = formatDuration(video.currentTime || 0);
    });
    video.addEventListener("timeupdate", () => {
      if (!timeline || !timelineMeta) return;
      timeline.value = String(video.currentTime || 0);
      const current = timelineMeta.firstElementChild;
      if (current) current.textContent = formatDuration(video.currentTime || 0);
    });
  }
  video.addEventListener("loadedmetadata", () => {
    if (disposed) return;
    const duration = Number.isFinite(video.duration) ? formatDuration(video.duration) : "Duration unavailable";
    const dimensions = video.videoWidth && video.videoHeight ? ` · ${video.videoWidth} × ${video.videoHeight}` : "";
    metadata.textContent = `${duration}${dimensions}`;
    if (timeline) timeline.max = String(video.duration);
    const durationLabel = timelineMeta?.lastElementChild;
    if (durationLabel) durationLabel.textContent = duration;
  });
  video.addEventListener("error", () => {
    if (!disposed) metadata.textContent = "This browser could not preview the video locally.";
  }, { once: true });

  return {
    dispose: () => {
      disposed = true;
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
    },
  };
};

export const createMediaPreview = (root: HTMLElement, tool: MediaPreviewTool, file: File): MediaPreviewResource => {
  root.dataset.previewKind = tool === "trim-audio" ? "audio" : "video";
  return tool === "trim-audio" ? createAudioPreview(root, file) : createVideoPreview(root, file, tool);
};

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

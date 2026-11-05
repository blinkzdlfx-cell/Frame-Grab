export function formatTime(seconds: number, milliseconds = false): string {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const base = hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}`;
  return milliseconds ? `${base}.${String(Math.floor((safe % 1) * 1000)).padStart(3, "0")}` : base;
}

export function getFrameTimestamps(duration: number, mode: "interval" | "target", interval: number, targetCount: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  if (mode === "target") {
    const count = Math.max(1, Math.min(100, targetCount));
    return Array.from({ length: count }, (_, index) => duration * ((index + 1) / (count + 1)));
  }
  const times: number[] = [];
  const step = Math.max(0.25, interval);
  for (let time = 0; time < duration && times.length < 500; time += step) times.push(time);
  if (times.length === 0) times.push(0);
  return times;
}

export async function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  const target = Math.min(Math.max(0, time), Math.max(0, video.duration - 0.02));
  if (Math.abs(video.currentTime - target) < 0.015 && video.readyState >= 2) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      window.clearTimeout(timeout);
    };
    const onSeeked = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error("The browser could not decode this video frame.")); };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("The video took too long to seek. Try a shorter video or another format."));
    }, 12000);
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = target;
  });
  if (video.readyState < 2) {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Video frame is not ready.")), 8000);
      video.addEventListener("loadeddata", () => { window.clearTimeout(timeout); resolve(); }, { once: true });
    });
  }
}

export function calculateSharpness(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): number {
  const width = Math.min(canvas.width, 160);
  const height = Math.max(1, Math.round(canvas.height * (width / canvas.width)));
  const sample = document.createElement("canvas");
  sample.width = width;
  sample.height = height;
  const sampleContext = sample.getContext("2d", { willReadFrequently: true });
  if (!sampleContext) return 100;
  sampleContext.drawImage(canvas, 0, 0, width, height);
  const { data } = sampleContext.getImageData(0, 0, width, height);
  let total = 0;
  let totalSquared = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = (y * width + x) * 4;
      const left = (y * width + x - 1) * 4;
      const right = (y * width + x + 1) * 4;
      const up = ((y - 1) * width + x) * 4;
      const down = ((y + 1) * width + x) * 4;
      const gray = (p: number) => data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
      const laplacian = gray(left) + gray(right) + gray(up) + gray(down) - 4 * gray(i);
      total += laplacian;
      totalSquared += laplacian * laplacian;
      count += 1;
    }
  }
  if (!count) return 100;
  const mean = total / count;
  return Math.max(0, totalSquared / count - mean * mean);
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create an image from this frame.")), type, quality);
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
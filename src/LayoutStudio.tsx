import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine, Check, Columns3, Crop, FileImage, FileVideo2,
  Image as ImageIcon, LoaderCircle, Maximize2, Play, RotateCcw, UploadCloud,
  Video, X, Zap
} from "lucide-react";
import "./LayoutStudio.css";

type MediaKind = "image" | "video";
type LayoutMode = "original" | "blur" | "crop" | "sidebar";
type DrawableMedia = CanvasImageSource & { width?: number; height?: number; videoWidth?: number; videoHeight?: number };
type EnhancementSettings = { strength: number; sharpness: number; clarity: number; noiseReduction: number; contrast: number };

function enhanceCanvas(canvas: HTMLCanvasElement, settings: EnhancementSettings) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || settings.strength <= 0 || settings.sharpness <= 0) return;
  const { width, height } = canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const source = image.data;
  const output = new Uint8ClampedArray(source);
  const amount = (settings.sharpness / 100) * (settings.strength / 100) * 1.15;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const neighbors = source[i - 4 + channel] + source[i + 4 + channel] + source[i - width * 4 + channel] + source[i + width * 4 + channel];
        const sharpened = source[i + channel] + (source[i + channel] * 4 - neighbors) * amount;
        output[i + channel] = Math.max(0, Math.min(255, sharpened));
      }
    }
  }
  image.data.set(output);
  ctx.putImageData(image, 0, 0);
}

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".jpe", ".jfif", ".png", ".apng", ".webp", ".avif", ".gif", ".bmp", ".ico", ".svg", ".tif", ".tiff", ".heic", ".heif"];
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v", ".ogv", ".ogg", ".avi", ".mkv", ".3gp"];
const ACCEPTED_FILES = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS].join(",");
const modes: { id: LayoutMode; label: string; description: string }[] = [
  { id: "original", label: "Original image", description: "Show the source image without layout effects or enhancement." },
  { id: "blur", label: "Blurred background", description: "Fill the widescreen canvas with a softened copy behind your original media." },
  { id: "crop", label: "Crop & zoom", description: "Fill the entire frame and control which part of the original media stays visible." },
  { id: "sidebar", label: "Multi-panel", description: "Keep the original composition centred and use side panels for extra context." }
];

function extensionOf(name: string) {
  return name.slice(name.lastIndexOf(".")).toLowerCase();
}

function detectKind(file: File): MediaKind | null {
  if (file.type.startsWith("image/") || IMAGE_EXTENSIONS.includes(extensionOf(file.name))) return "image";
  if (file.type.startsWith("video/") || VIDEO_EXTENSIONS.includes(extensionOf(file.name))) return "video";
  return null;
}

function dimensionsOf(source: DrawableMedia) {
  return {
    width: source instanceof HTMLVideoElement ? source.videoWidth : source.width || 0,
    height: source instanceof HTMLVideoElement ? source.videoHeight : source.height || 0
  };
}

function drawCover(ctx: CanvasRenderingContext2D, source: DrawableMedia, width: number, height: number, zoom = 1, panY = 50) {
  const size = dimensionsOf(source);
  if (!size.width || !size.height) return;
  const scale = Math.max(width / size.width, height / size.height) * zoom;
  const drawWidth = size.width * scale;
  const drawHeight = size.height * scale;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) * (panY / 100);
  ctx.drawImage(source, x, y, drawWidth, drawHeight);
}

function drawContain(ctx: CanvasRenderingContext2D, source: DrawableMedia, width: number, height: number, scale = 1) {
  const size = dimensionsOf(source);
  if (!size.width || !size.height) return;
  const ratio = Math.min(width / size.width, height / size.height) * scale;
  const drawWidth = size.width * ratio;
  const drawHeight = size.height * ratio;
  ctx.drawImage(source, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawComposition(canvas: HTMLCanvasElement, source: DrawableMedia, mode: LayoutMode, settings: {
  blur: number; darken: number; backgroundScale: number; foregroundScale: number;
  zoom: number; panY: number; headline: string; caption: string; sidebarTheme: string;
}, enhancement: EnhancementSettings) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  const mediaSize = dimensionsOf(source);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#050914";
  ctx.fillRect(0, 0, width, height);
  if (mode === "original") {
    drawContain(ctx, source, width, height);
    return;
  }

  const strength = enhancement.strength / 100;
  const filter = `contrast(${100 + enhancement.contrast * strength + enhancement.clarity * strength * 0.35}%) saturate(${100 + enhancement.clarity * strength * 0.2}%) blur(${(enhancement.noiseReduction * strength) / 500}px)`;

  if (mode === "blur") {
    ctx.save();
    ctx.filter = `blur(${settings.blur}px)`;
    drawCover(ctx, source, width, height, settings.backgroundScale / 100);
    ctx.restore();
    ctx.fillStyle = `rgba(0, 0, 0, ${settings.darken / 100})`;
    ctx.fillRect(0, 0, width, height);
    ctx.save(); ctx.filter = filter;
    drawContain(ctx, source, width, height, settings.foregroundScale / 100);
    ctx.restore();
    if (!(source instanceof HTMLVideoElement)) enhanceCanvas(canvas, enhancement);
    return;
  }

  if (mode === "crop") {
    ctx.save(); ctx.filter = filter;
    drawCover(ctx, source, width, height, settings.zoom / 100, settings.panY);
    ctx.restore();
    if (!(source instanceof HTMLVideoElement)) enhanceCanvas(canvas, enhancement);
    return;
  }

  const sideWidth = Math.round(width * 0.25);
  const mediaWidth = width - sideWidth * 2;
  const palette = settings.sidebarTheme === "cyan"
    ? { panel: "#08232d", accent: "#67e8f9", line: "#164e63" }
    : settings.sidebarTheme === "violet"
      ? { panel: "#211b3c", accent: "#c4b5fd", line: "#4c1d95" }
      : { panel: "#111827", accent: "#a5b4fc", line: "#334155" };

  ctx.fillStyle = palette.panel;
  ctx.fillRect(0, 0, sideWidth, height);
  ctx.fillRect(width - sideWidth, 0, sideWidth, height);
  ctx.fillStyle = "#020617";
  ctx.fillRect(sideWidth, 0, mediaWidth, height);
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sideWidth, 0); ctx.lineTo(sideWidth, height);
  ctx.moveTo(width - sideWidth, 0); ctx.lineTo(width - sideWidth, height);
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.rect(sideWidth, 0, mediaWidth, height);
  ctx.clip();
  ctx.filter = filter;
  drawContain(ctx, source, mediaWidth, height);
  ctx.restore();
  if (!(source instanceof HTMLVideoElement)) enhanceCanvas(canvas, enhancement);

  ctx.textAlign = "left";
  ctx.fillStyle = palette.accent;
  ctx.font = "600 20px sans-serif";
  ctx.fillText("FRAMEGRAB STUDIO", 38, 58, sideWidth - 64);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "700 34px sans-serif";
  wrapCanvasText(ctx, settings.headline || "YOUR HEADLINE", 38, 130, sideWidth - 70, 42, 3);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "22px sans-serif";
  wrapCanvasText(ctx, settings.caption || "Your supporting caption goes here.", 38, 300, sideWidth - 70, 32, 5);

  ctx.fillStyle = palette.accent;
  ctx.font = "600 20px sans-serif";
  ctx.fillText("MEDIA DETAILS", width - sideWidth + 36, 58);
  const labels = ["SOURCE", "MEDIA SIZE", "OUTPUT"];
  const values = ["LOCAL FILE", `${mediaSize.width} × ${mediaSize.height}`, "1920 × 1080"];
  labels.forEach((label, index) => {
    const y = 150 + index * 105;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "18px sans-serif";
    ctx.fillText(label, width - sideWidth + 36, y);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "600 24px sans-serif";
    ctx.fillText(values[index], width - sideWidth + 36, y + 34);
    ctx.fillStyle = palette.line;
    ctx.fillRect(width - sideWidth + 36, y + 54, sideWidth - 72, 2);
  });
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const words = text.split(/\s+/);
  let line = "";
  let lineCount = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, x, y + lineCount * lineHeight, maxWidth);
      line = word;
      lineCount += 1;
      if (lineCount >= maxLines) return;
    } else line = candidate;
  }
  if (line && lineCount < maxLines) ctx.fillText(line, x, y + lineCount * lineHeight, maxWidth);
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export default function LayoutStudio({ active = true }: { active?: boolean }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const comparisonRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const sourceRef = useRef<DrawableMedia | null>(null);
  const objectUrlRef = useRef("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<MediaKind | null>(null);
  const [mode, setMode] = useState<LayoutMode>("blur");
  const [compare, setCompare] = useState(false);
  const [previewOriginal, setPreviewOriginal] = useState(false);
  const [enhancement, setEnhancement] = useState<EnhancementSettings>({ strength: 40, sharpness: 45, clarity: 35, noiseReduction: 10, contrast: 12 });
  const [settings, setSettings] = useState({
    blur: 28, darken: 22, backgroundScale: 185, foregroundScale: 100,
    zoom: 115, panY: 50, headline: "LIVE HIGHLIGHTS",
    caption: "Vertical content, composed for widescreen.", sidebarTheme: "slate"
  });
  const [outputFormat, setOutputFormat] = useState("image/png");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [videoReady, setVideoReady] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [dragging, setDragging] = useState(false);

  function updateSetting<K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) {
    setSettings(current => ({ ...current, [key]: value }));
  }

  function clearSource() {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.onloadedmetadata = null;
      videoRef.current.onerror = null;
      videoRef.current.onended = null;
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
    const previousSource = sourceRef.current;
    if (previousSource instanceof ImageBitmap) previousSource.close();
    sourceRef.current = null;
    setVideoPlaying(false);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = "";
    setFile(null);
    setKind(null);
    setVideoReady(false);
  }

  async function loadMedia(nextFile?: File) {
    if (!nextFile) return;
    if (exporting) {
      setNotice("Stop the current video export before changing media.");
      return;
    }
    const nextKind = detectKind(nextFile);
    if (!nextKind) {
      setNotice("This file type is not in the supported image or video list.");
      return;
    }
    clearSource();
    setLoading(true);
    const url = URL.createObjectURL(nextFile);
    objectUrlRef.current = url;
    setFile(nextFile);
    setKind(nextKind);
    try {
      if (nextKind === "image") {
        let drawable: DrawableMedia;
        if ("createImageBitmap" in window) {
          try {
            drawable = await createImageBitmap(nextFile) as ImageBitmap;
          } catch {
            drawable = await new Promise<HTMLImageElement>((resolve, reject) => {
              const image = new Image();
              image.onload = () => resolve(image);
              image.onerror = () => reject(new Error("Your browser could not decode this image format. Try PNG, JPEG, WebP or AVIF."));
              image.src = url;
            });
          }
        } else {
          drawable = await new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error("Your browser could not decode this image format. Try PNG, JPEG, WebP or AVIF."));
            image.src = url;
          });
        }
        sourceRef.current = drawable;
        setVideoReady(true);
      } else {
        const video = videoRef.current;
        if (!video) throw new Error("The video preview is not ready. Try selecting the file again.");
        video.src = url;
        video.load();
        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => reject(new Error("The browser could not read this video. MP4 (H.264) or WebM are the safest formats to try.")), 15000);
          video.onloadedmetadata = () => { window.clearTimeout(timeout); resolve(); };
          video.onerror = () => { window.clearTimeout(timeout); reject(new Error("This video codec is not supported by your browser. Try MP4 (H.264) or WebM.")); };
        });
        sourceRef.current = video as DrawableMedia;
        setVideoReady(true);
      }
    } catch (error) {
      clearSource();
      setNotice(error instanceof Error ? error.message : "Could not open this media file.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let frame = 0;
    if (!file || (!active && !exporting)) return;
    const render = () => {
      const source = sourceRef.current;
      if (source) {
        if (!(source instanceof HTMLVideoElement) || source.readyState >= 2) {
          const activeEnhancement = previewOriginal ? { strength: 0, sharpness: 0, clarity: 0, noiseReduction: 0, contrast: 0 } : enhancement;
          if (previewRef.current) drawComposition(previewRef.current, source, mode, settings, activeEnhancement);
          if (compare) {
            const comparisonModes: LayoutMode[] = ["blur", "crop", "sidebar"];
            comparisonModes.forEach((item, index) => {
              const canvas = comparisonRefs.current[index];
              if (canvas) drawComposition(canvas, source, item, settings, activeEnhancement);
            });
          }
        }
      }
      if (source instanceof HTMLVideoElement) frame = window.requestAnimationFrame(render);
    };
    frame = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(frame);
  }, [mode, settings, enhancement, previewOriginal, compare, file, videoReady, active, exporting]);

  useEffect(() => {
    if (!active && !exporting) videoRef.current?.pause();
  }, [active, exporting]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const source = sourceRef.current;
    if (source instanceof ImageBitmap) source.close();
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  }, []);

  async function exportImage() {
    const canvas = previewRef.current;
    const source = sourceRef.current;
    if (!canvas || !file || kind !== "image" || !source) return;
    drawComposition(canvas, source, mode, settings, enhancement);
    const mime = outputFormat;
    const extension = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("The browser could not export this image.")), mime, 0.92));
    if (blob.type !== mime) { setNotice("This browser does not support the selected image export format."); return; }
    downloadBlob(blob, `${file.name.replace(/\.[^.]+$/, "")}-16x9.${extension}`);
  }

  async function exportVideo() {
    const canvas = previewRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !file || kind !== "video" || !("captureStream" in canvas) || typeof MediaRecorder === "undefined") {
      setNotice("Video export is not supported by this browser. Try a recent desktop version of Chrome or Edge.");
      return;
    }
    const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) {
      setNotice("This browser does not expose a supported WebM encoder.");
      return;
    }
    setExporting(true);
    chunksRef.current = [];
    const canvasStream = canvas.captureStream(30);
    const videoWithCapture = video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
    const sourceStream = videoWithCapture.captureStream?.() || videoWithCapture.mozCaptureStream?.();
    if (sourceStream) sourceStream.getAudioTracks().forEach(track => canvasStream.addTrack(track));
    const recorder = new MediaRecorder(canvasStream, { mimeType });
    recorderRef.current = recorder;
    recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
    recorder.onerror = () => {
      setExporting(false);
      video.pause();
      setNotice("Video recording failed. Try a shorter clip or another browser.");
      canvasStream.getTracks().forEach(track => track.stop());
      sourceStream?.getTracks().forEach(track => track.stop());
      recorderRef.current = null;
    };
    recorder.onstop = () => {
      if (!chunksRef.current.length) {
        canvasStream.getTracks().forEach(track => track.stop());
        sourceStream?.getTracks().forEach(track => track.stop());
        setExporting(false);
        recorderRef.current = null;
        return;
      }
      const blob = new Blob(chunksRef.current, { type: mimeType });
      downloadBlob(blob, `${file.name.replace(/\.[^.]+$/, "")}-16x9.webm`);
      canvasStream.getTracks().forEach(track => track.stop());
      sourceStream?.getTracks().forEach(track => track.stop());
      setExporting(false);
      recorderRef.current = null;
    };
    video.currentTime = 0;
    video.onended = () => {
      if (recorder.state !== "inactive") recorder.stop();
    };
    recorder.start(250);
    try { await video.play(); } catch { recorder.stop(); setNotice("Could not start video playback for export. Check the video and try again."); }
  }

  function stopExport() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    videoRef.current?.pause();
  }

  function resetSettings() {
    setSettings({
      blur: 28, darken: 22, backgroundScale: 185, foregroundScale: 100,
      zoom: 115, panY: 50, headline: "LIVE HIGHLIGHTS",
      caption: "Vertical content, composed for widescreen.", sidebarTheme: "slate"
    });
    setMode("blur");
    setEnhancement({ strength: 40, sharpness: 45, clarity: 35, noiseReduction: 10, contrast: 12 });
  }

  return <main className="layout-studio-shell">
    <section className="layout-studio-heading">
      <div>
        <div className="layout-eyebrow"><Zap size={14}/> FRAMEGRAB CREATIVE TOOLS</div>
        <h1>Video Layout <span>Studio</span></h1>
        <p>Compose images and videos into polished 16:9 widescreen layouts. Your files stay on this device.</p>
      </div>
      <div className="layout-heading-actions">
        <span className="layout-private"><Check size={13}/> On-device processing</span>
        <button className="layout-reset-button" onClick={resetSettings}><RotateCcw size={14}/> Reset layout</button>
      </div>
    </section>

    <section className="layout-workspace">
      <aside className="layout-controls panel">
        <div className="layout-section-title"><span>01</span><div><strong>Media source</strong><small>Images and videos from your device</small></div></div>
        <input ref={fileInputRef} className="layout-file-input" type="file" accept={`image/*,video/*,${ACCEPTED_FILES}`} onChange={event => { const selected = event.target.files?.[0]; event.currentTarget.value = ""; void loadMedia(selected); }}/>
        {!file ? <button className={`layout-dropzone ${dragging ? "is-dragging" : ""}`} onClick={() => fileInputRef.current?.click()} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); void loadMedia(event.dataTransfer.files[0]); }}>
          <span className="layout-upload-icon"><UploadCloud size={25}/></span>
          <strong>{loading ? "Opening media…" : "Drop an image or video here"}</strong>
          <small>or browse files on your device</small>
          <span className="layout-supported-formats">JPG · PNG · WebP · AVIF · GIF · BMP · ICO · SVG · TIFF · HEIC · MP4 · WebM · MOV</span>
          <span className="layout-browse-button">Browse media</span>
        </button> : <div className="layout-source-card">
          <div className="layout-source-preview">{kind === "video" ? <FileVideo2 size={25}/> : <FileImage size={25}/>}</div>
          <div className="layout-source-meta"><strong title={file.name}>{file.name}</strong><small>{kind === "image" ? "Image" : "Video"} · {(file.size / 1024 / 1024).toFixed(2)} MB</small></div>
          <button className="layout-icon-button" disabled={exporting} onClick={clearSource} aria-label="Remove media"><X size={17}/></button>
          <button className="layout-change-source" disabled={exporting} onClick={() => fileInputRef.current?.click()}>Change media</button>
        </div>}
        {loading && <p className="layout-loading"><LoaderCircle size={14}/> Decoding media locally…</p>}
        <video ref={videoRef} className="layout-hidden-video" playsInline preload="metadata" onPlay={() => setVideoPlaying(true)} onPause={() => setVideoPlaying(false)} onLoadedData={() => setVideoReady(true)}/>

        <div className="layout-divider"/>
        <div className="layout-section-title"><span>02</span><div><strong>Composition</strong><small>Choose how the media fills 16:9</small></div></div>
        <div className="layout-mode-list">
          {modes.map(item => <button key={item.id} className={`layout-mode-option ${mode === item.id ? "active" : ""}`} onClick={() => { setMode(item.id); setCompare(false); }}>
            <span className="layout-mode-icon">{item.id === "blur" ? <Maximize2 size={17}/> : item.id === "crop" ? <Crop size={17}/> : <Columns3 size={17}/>}</span>
            <span><strong>{item.label}</strong><small>{item.description}</small></span>
            <span className="layout-mode-radio"/>
          </button>)}
        </div>

        <div className="layout-divider"/>
        <div className="layout-section-title"><span>03</span><div><strong>Adjustments</strong><small>Fine-tune your composition</small></div></div>
        {mode === "original" && <p className="layout-export-note">Original view: no crop, blur, filters, sharpening, or enhancement is applied.</p>}
        {mode === "blur" && <div className="layout-adjustments">
          <label className="layout-range"><span>Background blur <b>{settings.blur}px</b></span><input type="range" min="0" max="60" value={settings.blur} onChange={event => updateSetting("blur", Number(event.target.value))}/></label>
          <label className="layout-range"><span>Background darkness <b>{settings.darken}%</b></span><input type="range" min="0" max="80" value={settings.darken} onChange={event => updateSetting("darken", Number(event.target.value))}/></label>
          <label className="layout-range"><span>Background scale <b>{settings.backgroundScale}%</b></span><input type="range" min="100" max="300" value={settings.backgroundScale} onChange={event => updateSetting("backgroundScale", Number(event.target.value))}/></label>
          <label className="layout-range"><span>Foreground scale <b>{settings.foregroundScale}%</b></span><input type="range" min="50" max="120" value={settings.foregroundScale} onChange={event => updateSetting("foregroundScale", Number(event.target.value))}/></label>
        </div>}
        {mode === "crop" && <div className="layout-adjustments">
          <label className="layout-range"><span>Zoom level <b>{settings.zoom}%</b></span><input type="range" min="100" max="250" value={settings.zoom} onChange={event => updateSetting("zoom", Number(event.target.value))}/></label>
          <label className="layout-range"><span>Vertical position <b>{settings.panY}%</b></span><input type="range" min="0" max="100" value={settings.panY} onChange={event => updateSetting("panY", Number(event.target.value))}/><small className="layout-range-hints"><span>Top</span><span>Bottom</span></small></label>
        </div>}
        {mode === "sidebar" && <div className="layout-adjustments">
          <label className="layout-text-setting"><span>Headline</span><input value={settings.headline} maxLength={42} onChange={event => updateSetting("headline", event.target.value)}/></label>
          <label className="layout-text-setting"><span>Caption</span><textarea value={settings.caption} maxLength={110} rows={3} onChange={event => updateSetting("caption", event.target.value)}/></label>
          <label className="layout-text-setting"><span>Sidebar accent</span><select value={settings.sidebarTheme} onChange={event => updateSetting("sidebarTheme", event.target.value)}><option value="slate">Indigo / slate</option><option value="cyan">Cyan</option><option value="violet">Violet</option></select></label>
        </div>}
        <div className="layout-divider"/>
        <div className="layout-section-title"><span>04</span><div><strong>Quality enhancement</strong><small>Improve detail before exporting</small></div></div>
        <div className="layout-enhancement-panel">
          <label className="layout-range"><span>Enhancement strength <b>{enhancement.strength}%</b></span><input type="range" min="0" max="100" value={enhancement.strength} onChange={event => setEnhancement(value => ({ ...value, strength: Number(event.target.value) }))}/><small className="layout-enhancement-hint">0% keeps the original appearance. Higher values apply stronger adjustments.</small></label>
          <label className="layout-range"><span>Sharpness <b>{enhancement.sharpness}%</b></span><input type="range" min="0" max="100" value={enhancement.sharpness} onChange={event => setEnhancement(value => ({ ...value, sharpness: Number(event.target.value) }))}/></label>
          <label className="layout-range"><span>Clarity <b>{enhancement.clarity}%</b></span><input type="range" min="0" max="100" value={enhancement.clarity} onChange={event => setEnhancement(value => ({ ...value, clarity: Number(event.target.value) }))}/></label>
          <label className="layout-range"><span>Noise reduction <b>{enhancement.noiseReduction}%</b></span><input type="range" min="0" max="100" value={enhancement.noiseReduction} onChange={event => setEnhancement(value => ({ ...value, noiseReduction: Number(event.target.value) }))}/></label>
          <label className="layout-range"><span>Contrast <b>{enhancement.contrast}%</b></span><input type="range" min="0" max="100" value={enhancement.contrast} onChange={event => setEnhancement(value => ({ ...value, contrast: Number(event.target.value) }))}/></label>
          <button className="layout-enhancement-reset" onClick={() => setEnhancement({ strength: 0, sharpness: 0, clarity: 0, noiseReduction: 0, contrast: 0 })}><RotateCcw size={12}/> Clear enhancement</button>
          {kind === "video" && <small className="layout-enhancement-hint">Sharpness processing is applied to still-image compositions. Video preview uses real-time clarity and contrast adjustments to keep playback responsive.</small>}
        </div>
        <div className="layout-divider"/>
        <div className="layout-export-block">
          <div className="layout-section-title"><span>05</span><div><strong>Export</strong><small>{kind === "video" ? "Render a new widescreen video" : "Save your finished composition"}</small></div></div>
          {kind === "image" && <label className="layout-text-setting"><span>Image format</span><select value={outputFormat} onChange={event => setOutputFormat(event.target.value)}><option value="image/png">PNG · High quality</option><option value="image/jpeg">JPEG · Smaller file</option><option value="image/webp">WebP · Modern format</option></select></label>}
          {!file ? <p className="layout-export-note">Choose media to enable export.</p> : kind === "image" ? <button className="layout-export-button" disabled={loading || !videoReady} onClick={() => void exportImage()}><ArrowDownToLine size={16}/> Export image</button> : exporting ? <button className="layout-export-button is-recording" onClick={stopExport}>Stop recording</button> : <button className="layout-export-button" disabled={loading || !videoReady} onClick={() => void exportVideo()}><Video size={16}/> Export video</button>}
          {kind === "video" && <p className="layout-export-note">Video exports as WebM. Audio is included when the browser exposes the source audio track. Keep this tab open until recording finishes.</p>}
        </div>
      </aside>

      <section className="layout-preview-panel panel">
        <div className="layout-preview-toolbar">
          <div><span className="layout-live-dot"/><strong>Live composition</strong><small>16:9 · 1920 × 1080 master</small></div>
          <div className="layout-preview-actions">
            {file && <button disabled={exporting || loading} onClick={() => { setMode("original"); setSettings({ blur: 0, darken: 0, backgroundScale: 100, foregroundScale: 100, zoom: 100, panY: 50, headline: "", caption: "", sidebarTheme: "slate" }); setEnhancement({ strength: 0, sharpness: 0, clarity: 0, noiseReduction: 0, contrast: 0 }); setPreviewOriginal(false); setCompare(false); }}><RotateCcw size={14}/> Reset image</button>}
            {kind === "image" && <button className={previewOriginal ? "active" : ""} onClick={() => setPreviewOriginal(value => !value)} disabled={!file || loading || !videoReady}>{previewOriginal ? "Show enhanced" : "Show original"}</button>}
            <button className={compare ? "active" : ""} onClick={() => setCompare(value => !value)} disabled={!file || loading || !videoReady}><Columns3 size={14}/> Compare layouts</button>
            {file && <button disabled={exporting} onClick={() => fileInputRef.current?.click()}><UploadCloud size={14}/> Replace</button>}
          </div>
        </div>
        {compare ? <><canvas ref={previewRef} className="layout-export-canvas" width="1920" height="1080" aria-hidden="true"/><div className="layout-comparison-grid">{modes.map((item, index) => <article key={item.id} className="layout-comparison-card"><div><strong>{item.label}</strong><small>{item.id === mode ? "Current selection" : "Alternative layout"}</small></div><canvas ref={element => { comparisonRefs.current[index] = element; }} width="1920" height="1080" aria-label={item.label}/></article>)}</div></> : <div className="layout-canvas-stage"><canvas ref={previewRef} width="1920" height="1080" aria-label="16 by 9 media composition preview"/>{!file && <div className="layout-canvas-empty"><span><ImageIcon size={30}/></span><strong>Your composition appears here</strong><small>Upload an image or video to start creating.</small></div>}{file && kind === "video" && <><button className="layout-video-toggle" onClick={() => { const video = videoRef.current; if (!video) return; if (video.paused) void video.play(); else video.pause(); }} aria-label={videoPlaying ? "Pause video preview" : "Play video preview"}>{videoPlaying ? "Pause preview" : <><Play size={14}/> Play preview</>}</button><span className="layout-preview-hint">Preview playback · Export renders the full clip</span></>}</div>}
        <div className="layout-preview-footer"><span>{file ? file.name : "No media selected"}</span><span>{kind === "video" ? "Video composition" : kind === "image" ? "Image composition" : "Waiting for media"}</span></div>
      </section>
    </section>
    {notice && <div className="layout-notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss message"><X size={15}/></button></div>}
  </main>;
}

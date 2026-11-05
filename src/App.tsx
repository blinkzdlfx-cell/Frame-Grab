import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import {
  Archive, ArrowDownToLine, Check, CheckCheck, Clock3,
  FileVideo2, Film, Image as ImageIcon, LoaderCircle, LockKeyhole, Plus, RotateCcw,
  Scissors, ShieldCheck, Sparkles, UploadCloud, X, Zap
} from "lucide-react";
import { calculateSharpness, canvasToBlob, formatBytes, formatTime, getFrameTimestamps, seekVideo } from "./lib/video";
import { clearStoredFrames, loadStoredFrames, saveStoredFrame, updateStoredFrameSelection } from "./lib/storage";

type Frame = {
  id: string;
  timestamp: number;
  blob: Blob;
  url: string;
  width: number;
  height: number;
  sharpness: number;
  selected: boolean;
  format: string;
};

type Mode = "interval" | "target";

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);
  const framesRef = useRef<Frame[]>([]);
  const videoUrlRef = useRef("");
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [mode, setMode] = useState<Mode>("interval");
  const [interval, setInterval] = useState(2);
  const [targetCount, setTargetCount] = useState(15);
  const [format, setFormat] = useState("image/jpeg");
  const [quality, setQuality] = useState(0.88);
  const [customTime, setCustomTime] = useState("");
  const [customTimes, setCustomTimes] = useState<number[]>([]);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, skipped: 0, time: 0, status: "" });
  const [notice, setNotice] = useState("");
  const [previewFrame, setPreviewFrame] = useState<Frame | null>(null);
  const [zipping, setZipping] = useState(false);

  const timestamps = useMemo(() => {
    const base = getFrameTimestamps(duration, mode, interval, targetCount);
    return [...new Set([...base, ...customTimes])].filter((time) => time >= 0 && time < duration).sort((a, b) => a - b);
  }, [duration, mode, interval, targetCount, customTimes]);

  const selectedCount = frames.filter((frame) => frame.selected).length;
  const estimatedCount = file ? timestamps.length : 0;

  useEffect(() => { framesRef.current = frames; }, [frames]);

  useEffect(() => {
    let active = true;
    loadStoredFrames().then((stored) => {
      if (!active || !stored.length) return;
      const restored: Frame[] = stored.map((frame) => ({
        ...frame,
        url: URL.createObjectURL(frame.blob)
      }));
      setFrames(restored);
      setNotice(`Restored ${restored.length} saved screenshot(s) from this device.`);
    }).catch(() => {
      if (active) setNotice("Local gallery storage is unavailable in this browser.");
    });
    return () => { active = false; };
  }, []);
  useEffect(() => { videoUrlRef.current = videoUrl; }, [videoUrl]);
  useEffect(() => {
    return () => {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      framesRef.current.forEach((frame) => URL.revokeObjectURL(frame.url));
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewFrame(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function clearFrames() {
    framesRef.current.forEach((frame) => URL.revokeObjectURL(frame.url));
    setFrames([]);
    void clearStoredFrames().catch(() => setNotice("Could not clear the locally saved gallery."));
  }

  function loadFile(nextFile?: File) {
    if (!nextFile) return;
    if (!nextFile.type.startsWith("video/")) {
      setNotice("Please choose a supported video file.");
      return;
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    clearFrames();
    const url = URL.createObjectURL(nextFile);
    setFile(nextFile);
    setVideoUrl(url);
    setDuration(0);
    setDimensions({ width: 0, height: 0 });
    setCustomTimes([]);
    setCustomTime("");
    setNotice("");
  }

  function resetVideo() {
    if (processing) cancelRef.current = true;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    clearFrames();
    setFile(null);
    setVideoUrl("");
    setDuration(0);
    setDimensions({ width: 0, height: 0 });
    setCustomTimes([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function addCustomTime() {
    const value = Number(customTime);
    if (!customTime.trim() || !Number.isFinite(value) || value < 0 || value >= duration) {
      setNotice("Enter a timestamp within the video duration, in seconds.");
      return;
    }
    setCustomTimes((current) => [...new Set([...current, value])].sort((a, b) => a - b));
    setCustomTime("");
  }

  async function extractFrames() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!video || !canvas || !context || !file || !timestamps.length) return;
    clearFrames();
    cancelRef.current = false;
    setProcessing(true);
    setProgress({ done: 0, total: timestamps.length, skipped: 0, time: 0, status: "Preparing video…" });
    const results: Frame[] = [];
    const previousMuted = video.muted;
    video.pause();
    video.muted = true;
    let skipped = 0;
    try {
      for (let index = 0; index < timestamps.length; index += 1) {
        if (cancelRef.current) break;
        const timestamp = timestamps[index];
        setProgress((current) => ({ ...current, status: `Reading frame ${index + 1} of ${timestamps.length}…`, time: timestamp }));
        await seekVideo(video, timestamp);
        if (cancelRef.current) break;
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) throw new Error("The video has no readable frame dimensions.");
        canvas.width = width;
        canvas.height = height;
        context.drawImage(video, 0, 0, width, height);
        const sharpness = calculateSharpness(canvas);
        if (sharpness < 13) {
          skipped += 1;
          setProgress((current) => ({ ...current, done: index + 1, skipped }));
          continue;
        }
        const blob = await canvasToBlob(canvas, format, format === "image/jpeg" ? quality : 1);
        const frame: Frame = {
          id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp,
          blob,
          url: URL.createObjectURL(blob),
          width,
          height,
          sharpness,
          selected: true,
          format
        };
        results.push(frame);
        try {
          await saveStoredFrame({ id: frame.id, timestamp: frame.timestamp, blob: frame.blob, width, height, sharpness, selected: true, format });
        } catch {
          setNotice("Screenshots were created, but this browser could not save them for recovery after refresh.");
        }
        setProgress((current) => ({ ...current, done: index + 1, skipped }));
        setFrames([...results]);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
      if (cancelRef.current) setNotice(`Extraction stopped. ${results.length} frame(s) were kept.`);
      else if (results.length === 0) setNotice("No sufficiently sharp frames were found. Try a different video or a wider capture interval.");
      else setNotice(`Finished. ${results.length} frame(s) extracted.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Something went wrong while extracting frames.");
    } finally {
      setProcessing(false);
      cancelRef.current = false;
      if (video) { video.pause(); video.muted = previousMuted; }
    }
  }

  function toggleFrame(id: string) {
    const frame = framesRef.current.find((item) => item.id === id);
    if (!frame) return;
    const selected = !frame.selected;
    setFrames((current) => current.map((item) => item.id === id ? { ...item, selected } : item));
    void updateStoredFrameSelection(id, selected);
  }

  function setAllFramesSelected(selected: boolean) {
    setFrames((current) => current.map((frame) => ({ ...frame, selected })));
    void Promise.all(framesRef.current.map((frame) => updateStoredFrameSelection(frame.id, selected)));
  }

  function downloadFrame(frame: Frame) {
    const link = document.createElement("a");
    link.href = frame.url;
    link.download = `framegrab-${formatTime(frame.timestamp).replaceAll(":", "-")}-${Math.round(frame.timestamp * 1000)}ms.${frame.format === "image/png" ? "png" : "jpg"}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function downloadZip() {
    const selected = frames.filter((frame) => frame.selected);
    if (!selected.length || zipping) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      selected.forEach((frame, index) => {
        const extension = format === "image/png" ? "png" : "jpg";
        const timestamp = formatTime(frame.timestamp, true).replaceAll(":", "-").replace(".", "-");
        zip.file(`frame-${String(index + 1).padStart(3, "0")}-${timestamp}.${extension}`, frame.blob);
      });
      const blob = await zip.generateAsync({ type: "blob", compression: "STORE", streamFiles: true });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `framegrab-${selected.length}-frames.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setNotice(`ZIP prepared with ${selected.length} images. If the download does not start, allow downloads for this site and try again.`);
    } catch {
      setNotice("Could not create the ZIP file. Try downloading fewer images.");
    } finally {
      setZipping(false);
    }
  }

  const progressPercent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="min-h-screen text-slate-100">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="/" aria-label="FrameGrab home">
            <span className="brand-mark"><Film size={21} /></span>
            <span><strong>FrameGrab</strong><small>BY BRILINA DEV</small></span>
          </a>
          <div className="privacy-pill"><span className="live-dot" /> <span>100% on-device processing</span></div>
        </div>
      </header>

      <main className="app-shell">
        <section className="hero">
          <div className="eyebrow"><Sparkles size={14} /> SIMPLE. PRIVATE. PRECISE.</div>
          <h1>Every moment,<br /><span>captured perfectly.</span></h1>
          <p>Turn any video into a collection of high-quality screenshots. No uploads, no accounts, no waiting for a server.</p>
        </section>

        <section className="workspace">
          <div className="panel upload-panel">
            <div className="section-heading">
              <div><span className="step-number">01</span><div><h2>Your video</h2><p>Choose a video from this device</p></div></div>
              {file && <button className="text-button" onClick={resetVideo}><RotateCcw size={14} /> Change</button>}
            </div>
            {!file ? (
              <button className="dropzone" onClick={() => fileInputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); loadFile(event.dataTransfer.files[0]); }}>
                <span className="upload-icon"><UploadCloud size={27} /></span>
                <strong>Choose a video or drop it here</strong>
                <span>MP4, WebM, MOV and other browser-supported formats</span>
                <span className="browse-button">Browse videos</span>
                <small>Your video stays on your device</small>
              </button>
            ) : (
              <div className="video-loaded">
                <video ref={videoRef} src={videoUrl} controls playsInline preload="metadata" onLoadedMetadata={(event) => {
                  const video = event.currentTarget;
                  setDuration(video.duration);
                  setDimensions({ width: video.videoWidth, height: video.videoHeight });
                }} onError={() => setNotice("This video format is not supported by your browser. Try an MP4 (H.264) video.")} />
                <div className="file-details">
                  <span className="file-icon"><FileVideo2 size={19} /></span>
                  <div className="file-copy"><strong>{file.name}</strong><span>{formatBytes(file.size)} · {formatTime(duration)} · {dimensions.width} × {dimensions.height}</span></div>
                  <span className="ready-tag"><Check size={13} /> Ready</span>
                </div>
                {file.size > 350 * 1024 * 1024 && <p className="device-warning">Large video detected. Extraction may take longer and use significant memory on this device.</p>}
              </div>
            )}
            <input ref={fileInputRef} className="hidden" type="file" accept="video/*,.mov,.mp4,.webm" onChange={(event) => loadFile(event.target.files?.[0])} />
          </div>

          <div className="panel settings-panel">
            <div className="section-heading">
              <div><span className="step-number">02</span><div><h2>Extraction settings</h2><p>Choose which moments to capture</p></div></div>
              <span className="estimate-tag">≈ {estimatedCount} frames</span>
            </div>

            <div className="setting-label">Extraction method</div>
            <div className="segmented">
              <button className={mode === "interval" ? "active" : ""} onClick={() => setMode("interval")}><Clock3 size={15} /> Time interval</button>
              <button className={mode === "target" ? "active" : ""} onClick={() => setMode("target")}><ImageIcon size={15} /> Frame count</button>
            </div>

            {mode === "interval" ? (
              <div className="range-block">
                <div className="range-heading"><label>Capture every</label><strong>{interval.toFixed(1)} seconds</strong></div>
                <input type="range" min="0.5" max="30" step="0.5" value={interval} onChange={(event) => setInterval(Number(event.target.value))} />
                <div className="range-hints"><span>0.5s · More frames</span><span>30s · Fewer frames</span></div>
              </div>
            ) : (
              <div className="range-block">
                <div className="range-heading"><label>Number of screenshots</label><strong>{targetCount} frames</strong></div>
                <input type="range" min="5" max="100" step="5" value={targetCount} onChange={(event) => setTargetCount(Number(event.target.value))} />
                <div className="range-hints"><span>5 frames</span><span>100 frames</span></div>
              </div>
            )}

            <div className="custom-time">
              <div><label>Specific timestamp <span>Optional</span></label><p>Add an exact moment in seconds</p></div>
              <div className="custom-time-control"><input type="number" min="0" max={duration || undefined} step="0.1" placeholder="e.g. 12.5" value={customTime} onChange={(event) => setCustomTime(event.target.value)} disabled={!file || !duration} /><button onClick={addCustomTime} disabled={!file || !duration}><Plus size={15} /> Add</button></div>
              {customTimes.length > 0 && <div className="timestamp-chips">{customTimes.map((time) => <button key={time} onClick={() => setCustomTimes((current) => current.filter((item) => item !== time))}>{formatTime(time, true)} <X size={11} /></button>)}</div>}
            </div>

            <div className="options-row">
              <div className="toggle-line"><span><Sparkles size={16} /><span><b>Automatic clarity filter</b><small>Always enabled · blurry frames are discarded automatically</small></span></span><span className="ready-tag"><Check size={13} /> ON</span></div>
            </div>

            <div className="format-grid">
              <div><label className="setting-label" htmlFor="format">Image format</label><select id="format" value={format} onChange={(event) => setFormat(event.target.value)}><option value="image/jpeg">JPEG · Smaller files</option><option value="image/png">PNG · Lossless</option></select></div>
              <div><label className="setting-label" htmlFor="quality">JPEG quality <strong>{Math.round(quality * 100)}%</strong></label><input id="quality" type="range" min="0.5" max="1" step="0.05" value={quality} disabled={format !== "image/jpeg"} onChange={(event) => setQuality(Number(event.target.value))} /></div>
            </div>

            <button className="primary-button" disabled={!file || !duration || processing || !timestamps.length} onClick={extractFrames}>
              {processing ? <><LoaderCircle className="spin" size={17} /> Extracting frames…</> : <><Scissors size={17} /> Extract {estimatedCount} screenshots <ArrowDownToLine size={16} /></>}
            </button>
            <p className="settings-footnote"><LockKeyhole size={13} /> Files are processed locally. Nothing is uploaded.</p>
          </div>
        </section>

        {processing && (
          <section className="panel progress-panel">
            <div className="progress-title"><div><LoaderCircle className="spin accent-icon" size={20} /><span><strong>Extracting your frames</strong><small>{progress.status}</small></span></div><button className="cancel-button" onClick={() => { cancelRef.current = true; }}>Cancel</button></div>
            <div className="progress-track"><div style={{ width: `${progressPercent}%` }} /></div>
            <div className="progress-stats"><span>{progress.done} / {progress.total} processed</span><span>{progress.skipped} blurry skipped</span><span>{formatTime(progress.time)}</span></div>
          </section>
        )}

        {frames.length > 0 && (
          <section className="gallery-section">
            <div className="gallery-header">
              <div><span className="step-number">03</span><div><h2>Your screenshots</h2><p>{frames.length} captured · {selectedCount} selected</p></div></div>
              <div className="gallery-actions"><button className="secondary-button" onClick={() => setAllFramesSelected(true)}><CheckCheck size={14} /> Select all</button><button className="secondary-button" onClick={() => setAllFramesSelected(false)}>Clear selection</button><button className="secondary-button" onClick={clearFrames}>Delete gallery</button><button className="download-button" disabled={!selectedCount || zipping} onClick={downloadZip}>{zipping ? <LoaderCircle className="spin" size={15} /> : <Archive size={15} />} Download ZIP ({selectedCount})</button></div>
            </div>
            <div className="frames-grid">
              {frames.map((frame, index) => (
                <article className={`frame-card ${frame.selected ? "is-selected" : ""}`} key={frame.id}>
                  <button className="frame-image" onClick={() => setPreviewFrame(frame)} aria-label={`Preview frame at ${formatTime(frame.timestamp)}`}><img src={frame.url} alt={`Video frame at ${formatTime(frame.timestamp)}`} loading="lazy" /><span className="frame-time">{formatTime(frame.timestamp, true)}</span></button>
                  <div className="frame-meta"><label><input type="checkbox" checked={frame.selected} onChange={() => toggleFrame(frame.id)} /><span>Frame {String(index + 1).padStart(2, "0")}</span></label><button title="Download image" onClick={() => downloadFrame(frame)}><ArrowDownToLine size={15} /></button></div>
                </article>
              ))}
            </div>
          </section>
        )}

        {!file && <section className="trust-row"><div><ShieldCheck size={17} /><span><b>Private by design</b><small>Your files never leave your device</small></span></div><div><Zap size={17} /><span><b>Fast local processing</b><small>No upload or server queue</small></span></div><div><Archive size={17} /><span><b>Easy export</b><small>Save images individually or as ZIP</small></span></div></section>}
        <footer><span>FRAMEGRAB · BRILINA DEV</span><span>Private video frame extraction · Built for your browser</span></footer>
      </main>

      {previewFrame && <div className="preview-overlay" onClick={() => setPreviewFrame(null)}><div className="preview-dialog" onClick={(event) => event.stopPropagation()}><div className="preview-toolbar"><span>{formatTime(previewFrame.timestamp, true)} <small>· {previewFrame.width} × {previewFrame.height}</small></span><div><button onClick={() => downloadFrame(previewFrame)}><ArrowDownToLine size={15} /> Save image</button><button className="close-preview" onClick={() => setPreviewFrame(null)} aria-label="Close preview"><X size={20} /></button></div></div><img src={previewFrame.url} alt="Full-size extracted video frame" /></div></div>}

      {notice && <div className="toast" role="status"><span><Check size={15} /></span>{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div>}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
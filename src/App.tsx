import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import {
  Archive, ArrowDownToLine, Check, CheckCheck, Clock3, FileVideo2, Film,
  Image as ImageIcon, LoaderCircle, LockKeyhole, Plus, Scissors, ShieldCheck,
  Sparkles, Trash2, UploadCloud, X, Zap, HardDrive, FolderOpen, RotateCcw
} from "lucide-react";
import { calculateSharpness, canvasToBlob, formatBytes, formatTime, getFrameTimestamps, seekVideo } from "./lib/video";
import {
  deleteProjectData, deleteStoredFrame, getProject, getStorageEstimate, listProjects,
  loadProjectFrames, removeSourceVideo, saveFrameAndCheckpoint, saveProject,
  saveSourceVideo, updateFrameSelection, type ProjectSettings, type StoredFrame, type StoredProject
} from "./lib/storage";

type Frame = StoredFrame & { url: string };
type Mode = "interval" | "target";
const defaultSettings: ProjectSettings = { mode: "interval", interval: 2, targetCount: 15, format: "image/jpeg", quality: .88, customTimes: [] };
const makeId = () => `project-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const safeTitle = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[_-]+/g," ").trim() || "Untitled project";
const storageMessage = (error: unknown) => error instanceof Error ? error.message : "Browser storage is unavailable. Your current session can continue, but recovery may not be possible.";

export default function App() {
  const videoRef=useRef<HTMLVideoElement>(null), canvasRef=useRef<HTMLCanvasElement>(null), fileInputRef=useRef<HTMLInputElement>(null);
  const cancelRef=useRef(false), previewTouch=useRef<{x:number;y:number}|null>(null), resumeRef=useRef(false), activeRef=useRef(false);
  const [projects,setProjects]=useState<StoredProject[]>([]);
  const [project,setProject]=useState<StoredProject|null>(null);
  const [file,setFile]=useState<File|null>(null), [videoUrl,setVideoUrl]=useState("");
  const [duration,setDuration]=useState(0), [dimensions,setDimensions]=useState({width:0,height:0});
  const [settings,setSettings]=useState<ProjectSettings>(defaultSettings);
  const [customTime,setCustomTime]=useState("");
  const [frames,setFrames]=useState<Frame[]>([]);
  const [processing,setProcessing]=useState(false);
  const [progress,setProgress]=useState({done:0,total:0,skipped:0,time:0,status:""});
  const [notice,setNotice]=useState(""), [storage,setStorage]=useState<{usage?:number;quota?:number;persistent?:boolean}>({});
  const [previewIndex,setPreviewIndex]=useState<number|null>(null), [zipping,setZipping]=useState(false);
  const [restoring,setRestoring]=useState(true);
  const framesRef=useRef<Frame[]>([]);
  const timestamps=useMemo(()=>[...new Set([...getFrameTimestamps(duration,settings.mode,settings.interval,settings.targetCount),...settings.customTimes])].filter(t=>t>=0&&t<duration).sort((a,b)=>a-b),[duration,settings]);
  const selectedCount=frames.filter(f=>f.selected).length;
  const currentFrame=previewIndex===null?null:frames[previewIndex];

  useEffect(()=>{framesRef.current=frames;},[frames]);
  useEffect(()=>{
    let alive=true;
    void (async()=>{
      try {
        if(navigator.storage?.persist) await navigator.storage.persist();
        const [savedProjects,estimate]=await Promise.all([listProjects(),getStorageEstimate()]);
        if(!alive)return;
        setProjects(savedProjects); setStorage(estimate);
        const active=savedProjects.find(p=>p.status==="draft"||p.status==="processing"||p.status==="paused"||p.status==="needs-source")??savedProjects[0];
        if(active){
          const [storedFrames,fullProject]=await Promise.all([loadProjectFrames(active.id),getProject(active.id)]);
          if(!alive||!fullProject)return;
          const restored=storedFrames.map(f=>({...f,url:URL.createObjectURL(f.blob)}));
          setProject(fullProject); setSettings(fullProject.settings); setDuration(fullProject.duration);
          setDimensions({width:fullProject.width,height:fullProject.height}); setFrames(restored);
          if(fullProject.sourceBlob){
            const restoredFile=new File([fullProject.sourceBlob],fullProject.sourceName||"restored-video", {type:fullProject.sourceType||fullProject.sourceBlob.type,lastModified:fullProject.sourceLastModified||Date.now()});
            setFile(restoredFile);setVideoUrl(URL.createObjectURL(restoredFile));
            if(fullProject.status==="processing") resumeRef.current=true;
          } else if(fullProject.status==="processing"||fullProject.status==="paused") {
            setProject({...fullProject,status:"needs-source"});
            setNotice("Your project was recovered, but its source video is unavailable. Select the original video to resume.");
          }
          if(restored.length)setNotice(`Restored ${restored.length} screenshot(s) in “${fullProject.title}”.`);
        }
      }catch(error){if(alive)setNotice(storageMessage(error));}
      finally{if(alive)setRestoring(false);}
    })();
    return()=>{alive=false;};
  },[]);
  useEffect(()=>{void refreshStorage();},[frames.length,projects.length]);
  useEffect(()=>{
    if(!project)return;
    const timer=window.setTimeout(()=>{
      const updated={...project,settings,duration,width:dimensions.width,height:dimensions.height};
      void saveProject(updated).then(()=>{setProject(updated);setProjects(list=>list.map(p=>p.id===updated.id?updated:p));}).catch(error=>setNotice(storageMessage(error)));
    },350);
    return()=>window.clearTimeout(timer);
  },[settings,duration,dimensions.width,dimensions.height]);
  useEffect(()=>()=>{if(videoUrl)URL.revokeObjectURL(videoUrl);framesRef.current.forEach(f=>URL.revokeObjectURL(f.url));},[]);
  useEffect(()=>{if(!notice)return;const timer=window.setTimeout(()=>setNotice(""),6500);return()=>window.clearTimeout(timer);},[notice]);
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      if(e.key==="Escape")setPreviewIndex(null);
      if(previewIndex!==null&&e.key==="ArrowRight")setPreviewIndex(i=>i===null?null:Math.min(frames.length-1,i+1));
      if(previewIndex!==null&&e.key==="ArrowLeft")setPreviewIndex(i=>i===null?null:Math.max(0,i-1));
    };
    window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);
  },[previewIndex,frames.length]);

  async function refreshStorage(){try{setStorage(await getStorageEstimate());}catch{/* estimate is optional */}}
  function replaceFrames(next:Frame[]){framesRef.current=next;setFrames(next);}
  async function reloadProjects(){try{setProjects(await listProjects());await refreshStorage();}catch(error){setNotice(storageMessage(error));}}
  async function loadProjectView(p:StoredProject){
    if(processing)return;
    if(videoUrl)URL.revokeObjectURL(videoUrl);
    framesRef.current.forEach(f=>URL.revokeObjectURL(f.url));
    setVideoUrl("");setFile(null);setProject(p);setSettings(p.settings);setDuration(p.duration);setDimensions({width:p.width,height:p.height});setPreviewIndex(null);
    const [stored,full]=await Promise.all([loadProjectFrames(p.id),getProject(p.id)]);
    if(!full)return;
    replaceFrames(stored.map(f=>({...f,url:URL.createObjectURL(f.blob)})));
    setProject(full);
    if(full.sourceBlob){
      const restored=new File([full.sourceBlob],full.sourceName||"restored-video",{type:full.sourceType||full.sourceBlob.type,lastModified:full.sourceLastModified||Date.now()});
      setFile(restored);setVideoUrl(URL.createObjectURL(restored));
    }
    setNotice(`Opened project: ${full.title}`);
  }
  async function loadFile(nextFile?:File){
    if(!nextFile)return;
    if(!nextFile.type.startsWith("video/")){setNotice("Please choose a supported video file.");return;}
    if(processing){setNotice("Wait for the current extraction to finish or cancel it before opening another project.");return;}
    const estimate=await getStorageEstimate().catch(()=>({}));
    const available=estimate.quota!==undefined&&estimate.usage!==undefined?Math.max(0,estimate.quota-estimate.usage):undefined;
    if(available!==undefined&&nextFile.size>available){
      const proceed=window.confirm(`This video is ${formatBytes(nextFile.size)}, but the browser estimates only ${formatBytes(available)} available. Saving it may fail. Continue with this video for this session?`);
      if(!proceed)return;
    }else if(nextFile.size>150*1024*1024){
      const proceed=window.confirm(`This is a large video (${formatBytes(nextFile.size)}). Saving a temporary recovery copy uses browser storage until extraction finishes. Continue?`);
      if(!proceed)return;
    }
    if(videoUrl)URL.revokeObjectURL(videoUrl);
    framesRef.current.forEach(f=>URL.revokeObjectURL(f.url));
    replaceFrames([]);setDuration(0);setDimensions({width:0,height:0});setPreviewIndex(null);
    const id=makeId(), now=Date.now(), url=URL.createObjectURL(nextFile);
    const next:StoredProject={
      id,title:safeTitle(nextFile.name),sourceName:nextFile.name,sourceSize:nextFile.size,sourceType:nextFile.type,sourceLastModified:nextFile.lastModified,
      settings:{...settings,customTimes:[]},duration:0,width:0,height:0,status:"draft",plannedTimestamps:[],nextIndex:0,skipped:0,createdAt:now,updatedAt:now
    };
    setProject(next);setFile(nextFile);setVideoUrl(url);setSettings({...settings,customTimes:[]});
    try{
      await saveProject(next);
      await saveSourceVideo(id,nextFile);
      next.sourceBlob=nextFile;
      setProject(next);
      setNotice("New project created. Settings and source video are saved locally for recovery.");
    }catch(error){
      next.status="needs-source";
      await saveProject(next).catch(()=>undefined);
      setProject(next);
      setNotice(`${storageMessage(error)} The video remains available in this session, but select it again after a refresh.`);
    }
    await reloadProjects();
  }
  async function saveCurrentProject(patch:Partial<StoredProject>){
    if(!project)return;
    const updated={...project,...patch,updatedAt:Date.now()};
    setProject(updated);
    setProjects(list=>list.map(p=>p.id===updated.id?updated:p));
    try{await saveProject(updated);}catch(error){setNotice(storageMessage(error));}
  }
  async function renameProject(title:string){
    if(!project)return;
    const updated={...project,title:title.trim()||"Untitled project",updatedAt:Date.now()};
    setProject(updated);setProjects(list=>list.map(p=>p.id===updated.id?updated:p));
    try{await saveProject(updated);}catch(error){setNotice(storageMessage(error));}
  }
  async function removeVideo(){
    if(!project)return;
    if(!window.confirm("Remove the original video from this project? Existing screenshots and settings will remain."))return;
    try{await removeSourceVideo(project.id);const updated={...project,sourceBlob:undefined,status:project.status==="completed"?"completed":"needs-source" as const};setProject(updated);setProjects(list=>list.map(p=>p.id===updated.id?updated:p));if(videoUrl)URL.revokeObjectURL(videoUrl);setVideoUrl("");setFile(null);setNotice("Original video removed. Screenshots and project settings are preserved.");}
    catch(error){setNotice(storageMessage(error));}
    await refreshStorage();
  }
  async function deleteProject(){
    if(!project||!window.confirm(`Permanently delete “${project.title}”, its source video and all screenshots?`))return;
    try{
      await deleteProjectData(project.id);
      if(videoUrl)URL.revokeObjectURL(videoUrl);
      framesRef.current.forEach(f=>URL.revokeObjectURL(f.url));
      setVideoUrl("");setFile(null);replaceFrames([]);setProject(null);setDuration(0);setPreviewIndex(null);
      await reloadProjects();setNotice("Project and its stored data deleted.");
    }catch(error){setNotice(storageMessage(error));}
  }
  async function deleteImage(frame:Frame){
    if(!window.confirm("Delete this screenshot permanently?"))return;
    try{await deleteStoredFrame(frame.id);URL.revokeObjectURL(frame.url);const next=framesRef.current.filter(f=>f.id!==frame.id);replaceFrames(next);setPreviewIndex(null);await refreshStorage();}
    catch(error){setNotice(storageMessage(error));}
  }
  async function toggleFrame(id:string){
    const target=framesRef.current.find(f=>f.id===id);if(!target)return;
    const selected=!target.selected;
    replaceFrames(framesRef.current.map(f=>f.id===id?{...f,selected}:f));
    try{await updateFrameSelection(id,selected);}catch(error){setNotice(storageMessage(error));}
  }
  async function setAllSelected(selected:boolean){
    const next=framesRef.current.map(f=>({...f,selected}));replaceFrames(next);
    try{await Promise.all(next.map(f=>updateFrameSelection(f.id,selected)));}catch(error){setNotice(storageMessage(error));}
  }
  function addCustomTime(){
    const value=Number(customTime);
    if(!customTime.trim()||!Number.isFinite(value)||value<0||value>=duration){setNotice("Enter a timestamp within the video duration, in seconds.");return;}
    setSettings(s=>({...s,customTimes:[...new Set([...s.customTimes,value])].sort((a,b)=>a-b)}));setCustomTime("");
  }
  async function extractFrames(resume=false){
    const video=videoRef.current,canvas=canvasRef.current,ctx=canvas?.getContext("2d",{willReadFrequently:true});
    if(!video||!canvas||!ctx||!file||!project||!duration)return;
    const plan=resume&&project.plannedTimestamps.length?project.plannedTimestamps:timestamps;
    const start=resume?project.nextIndex:0;
    if(!plan.length)return;
    cancelRef.current=false;activeRef.current=true;setProcessing(true);
    const previousMuted=video.muted;video.pause();video.muted=true;
    let skipped=project.skipped||0;
    const initial={...project,status:"processing" as const,plannedTimestamps:plan,nextIndex:start,skipped};
    setProject(initial);
    try{await saveProject(initial);}catch(error){setNotice(storageMessage(error));}
    setProgress({done:start,total:plan.length,skipped,time:plan[Math.max(0,start-1)]||0,status:resume?"Resuming extraction…":"Preparing video…"});
    try{
      for(let index=start;index<plan.length;index++){
        if(cancelRef.current)break;
        const timestamp=plan[index];
        setProgress({done:index,total:plan.length,skipped,time:timestamp,status:`Reading frame ${index+1} of ${plan.length}…`});
        await seekVideo(video,timestamp);if(cancelRef.current)break;
        const width=video.videoWidth,height=video.videoHeight;if(!width||!height)throw new Error("The video has no readable frame dimensions.");
        canvas.width=width;canvas.height=height;ctx.drawImage(video,0,0,width,height);
        const sharpness=calculateSharpness(canvas);
        if(sharpness<13){
          skipped+=1;
          const checkpoint={...initial,nextIndex:index+1,skipped,status:"processing" as const};
          await saveProject(checkpoint);setProject(checkpoint);
        }else{
          const blob=await canvasToBlob(canvas,settings.format,settings.format==="image/jpeg"?settings.quality:1);
          const stored:StoredFrame={id:`${project.id}:${index}`,projectId:project.id,index,timestamp,blob,width,height,sharpness,selected:true,format:settings.format};
          const checkpoint={...initial,nextIndex:index+1,skipped,status:"processing" as const};
          try{await saveFrameAndCheckpoint(stored,checkpoint);}
          catch(error){setNotice(`${storageMessage(error)} Extraction stopped safely. Already saved screenshots are preserved.`);throw error;}
          const frame={...stored,url:URL.createObjectURL(blob)};
          const existing=framesRef.current.filter(f=>f.id!==frame.id);
          replaceFrames([...existing,frame].sort((a,b)=>a.index-b.index));setProject(checkpoint);
        }
        setProgress({done:index+1,total:plan.length,skipped,time:timestamp,status:`Processed ${index+1} of ${plan.length}`});
        await new Promise<void>(resolve=>window.setTimeout(resolve,0));
      }
      if(cancelRef.current){
        const paused={...initial,nextIndex:progress.done,skipped,status:"paused" as const};
        await saveProject(paused);setProject(paused);setNotice("Extraction paused. Your saved screenshots and recovery point are محفوظ.");
      }else{
        const completed={...initial,nextIndex:plan.length,skipped,status:"completed" as const};
        await saveProject(completed);await removeSourceVideo(project.id).catch(()=>undefined);
        setProject({...completed,sourceBlob:undefined});setFile(null);if(videoUrl){URL.revokeObjectURL(videoUrl);setVideoUrl("");}
        setNotice(`Extraction complete. ${framesRef.current.length} screenshot(s) saved. The original video was removed to free device storage.`);
      }
    }catch(error){
      const latest={...initial,status:"paused" as const,nextIndex:Math.max(start,progress.done),skipped};
      await saveProject(latest).catch(()=>undefined);setProject(latest);
      if(!(error instanceof Error&&error.message.includes("storage is full")))setNotice(error instanceof Error?error.message:"Extraction stopped. Your saved progress is available.");
    }finally{
      activeRef.current=false;setProcessing(false);cancelRef.current=false;video.pause();video.muted=previousMuted;
      await reloadProjects();
    }
  }
  function downloadFrame(frame:Frame){
    const a=document.createElement("a");a.href=frame.url;a.download=`framegrab-${formatTime(frame.timestamp).replaceAll(":","-")}-${Math.round(frame.timestamp*1000)}ms.${frame.format==="image/png"?"png":"jpg"}`;
    document.body.appendChild(a);a.click();a.remove();
  }
  async function downloadZip(){
    const chosen=frames.filter(f=>f.selected);if(!chosen.length||zipping)return;
    setZipping(true);
    try{
      const zip=new JSZip(),folder=zip.folder((project?.title||"FrameGrab project").replace(/[\\/:*?"<>|]/g,"-"))!;
      chosen.forEach((f,i)=>folder.file(`frame-${String(i+1).padStart(3,"0")}-${formatTime(f.timestamp,true).replaceAll(":","-").replace(".","-")}.${f.format==="image/png"?"png":"jpg"}`,f.blob));
      const blob=await zip.generateAsync({type:"blob",compression:"STORE",streamFiles:true});
      const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`${(project?.title||"framegrab").replace(/[\\/:*?"<>|]/g,"-")}-screenshots.zip`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(error){setNotice(error instanceof Error?error.message:"Could not create the ZIP. Try fewer images.");}
    finally{setZipping(false);}
  }
  const available=storage.usage!==undefined&&storage.quota!==undefined?Math.max(0,storage.quota-storage.usage):undefined;
  const progressPercent=progress.total?Math.round(progress.done/progress.total*100):0;

  return <div className="min-h-screen text-slate-100">
    <header className="topbar"><div className="topbar-inner"><a className="brand" href="/" aria-label="FrameGrab home"><span className="brand-mark"><Film size={21}/></span><span><strong>FrameGrab</strong><small>BY BRILINA DEV</small></span></a><div className="privacy-pill"><span className="live-dot"/><span>100% on-device processing</span></div></div></header>
    <main className="app-shell">
      <section className="hero"><div className="eyebrow"><Sparkles size={14}/> SIMPLE. PRIVATE. PRECISE.</div><h1>Every moment,<br/><span>captured perfectly.</span></h1><p>Turn any video into a collection of high-quality screenshots. No uploads, no accounts, no waiting for a server.</p></section>
      <section className="panel p-4 sm:p-5 mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3"><div className="flex items-center gap-2"><FolderOpen size={17} className="text-indigo-300"/><strong className="text-sm">Your projects</strong><span className="text-xs text-slate-500">{projects.length} saved</span></div><button className="secondary-button" onClick={()=>fileInputRef.current?.click()}><Plus size={14}/> New project</button></div>
        {projects.length===0?<p className="text-xs text-slate-400">Your projects will appear here after you choose a video.</p>:<div className="flex gap-2 overflow-x-auto pb-1">{projects.map(p=><button key={p.id} onClick={()=>void loadProjectView(p)} className={`shrink-0 rounded-xl border px-3 py-2 text-left min-w-36 ${project?.id===p.id?"border-indigo-400 bg-indigo-500/15":"border-white/10 bg-white/[.03]"}`}><strong className="block text-xs truncate max-w-48">{p.title}</strong><span className="text-[10px] text-slate-400">{p.status==="completed"?"Completed":p.status==="needs-source"?"Source needed":p.status==="processing"?"In progress":p.status==="paused"?"Paused":"Draft"}</span></button>)}</div>}
        <div className="mt-4 border-t border-white/10 pt-3">
          <div className="flex items-center gap-2 text-xs text-slate-300"><HardDrive size={14}/> Browser storage {storage.usage!==undefined?formatBytes(storage.usage):"usage unavailable"}{storage.quota!==undefined? ` / ${formatBytes(storage.quota)}`:""}</div>
          {storage.usage!==undefined&&storage.quota!==undefined&&<div className="h-1.5 rounded-full bg-slate-700 overflow-hidden mt-2"><div className="h-full bg-indigo-400" style={{width:`${Math.min(100,storage.usage/storage.quota*100)}%`}}/></div>}
          <p className="text-[10px] text-slate-500 mt-2">{available!==undefined?`${formatBytes(available)} estimated available on this device. Browser storage limits can change.`:"Your browser does not provide a storage quota estimate."} Local storage can be cleared by the browser or device.</p>
        </div>
      </section>
      {project&&<div className="panel p-4 mb-5 flex flex-wrap items-center gap-3"><div className="flex-1 min-w-48"><label className="setting-label" htmlFor="project-title">Project title</label><input id="project-title" className="w-full rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-slate-100" value={project.title} onChange={e=>{const title=e.target.value;setProject(p=>p?{...p,title}:p);}} onBlur={e=>void renameProject(e.target.value)}/></div><button className="secondary-button" onClick={()=>void removeVideo()} disabled={!project.sourceBlob&&!file}><Trash2 size={14}/> Remove original video</button><button className="secondary-button text-rose-300" onClick={()=>void deleteProject()}><Trash2 size={14}/> Delete project</button></div>}
      <section className="workspace">
        <div className="panel upload-panel"><div className="section-heading"><div><span className="step-number">01</span><div><h2>Your video</h2><p>Choose a video from this device</p></div></div>{file&&<button className="text-button" onClick={()=>fileInputRef.current?.click()}><RotateCcw size={14}/> Change</button>}</div>
          {!file?<button className="dropzone" onClick={()=>fileInputRef.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void loadFile(e.dataTransfer.files[0]);}}><span className="upload-icon"><UploadCloud size={27}/></span><strong>{project?.status==="needs-source"?"Select the original video to resume":"Choose a video or drop it here"}</strong><span>MP4, WebM, MOV and other browser-supported formats</span><span className="browse-button">Browse videos</span><small>Your video stays on your device</small></button>:<div className="video-loaded"><video ref={videoRef} src={videoUrl} controls playsInline preload="metadata" onLoadedMetadata={e=>{const v=e.currentTarget;setDuration(v.duration);setDimensions({width:v.videoWidth,height:v.videoHeight});if(resumeRef.current){resumeRef.current=false;setTimeout(()=>void extractFrames(true),100);}}} onError={()=>setNotice("This video format is not supported. Try an MP4 (H.264) video.")}/><div className="file-details"><span className="file-icon"><FileVideo2 size={19}/></span><div className="file-copy"><strong>{file.name}</strong><span>{formatBytes(file.size)} · {formatTime(duration)} · {dimensions.width} × {dimensions.height}</span></div><span className="ready-tag"><Check size={13}/> Ready</span></div>{file.size>150*1024*1024&&<p className="device-warning">Large video: temporary browser storage is used for recovery until extraction finishes.</p>}</div>}
          <input ref={fileInputRef} className="hidden" type="file" accept="video/*,.mov,.mp4,.webm" onChange={e=>void loadFile(e.target.files?.[0])}/>
        </div>
        <div className="panel settings-panel"><div className="section-heading"><div><span className="step-number">02</span><div><h2>Extraction settings</h2><p>Choose which moments to capture</p></div></div><span className="estimate-tag">≈ {file?timestamps.length:0} frames</span></div>
          <div className="setting-label">Extraction method</div><div className="segmented"><button className={settings.mode==="interval"?"active":""} onClick={()=>setSettings(s=>({...s,mode:"interval"}))}><Clock3 size={15}/> Time interval</button><button className={settings.mode==="target"?"active":""} onClick={()=>setSettings(s=>({...s,mode:"target"}))}><ImageIcon size={15}/> Frame count</button></div>
          {settings.mode==="interval"?<div className="range-block"><div className="range-heading"><label>Capture every</label><strong>{settings.interval.toFixed(1)} seconds</strong></div><input type="range" min="0.5" max="30" step="0.5" value={settings.interval} onChange={e=>setSettings(s=>({...s,interval:Number(e.target.value)}))}/><div className="range-hints"><span>0.5s · More frames</span><span>30s · Fewer frames</span></div></div>:<div className="range-block"><div className="range-heading"><label>Number of screenshots</label><strong>{settings.targetCount} frames</strong></div><input type="range" min="5" max="100" step="5" value={settings.targetCount} onChange={e=>setSettings(s=>({...s,targetCount:Number(e.target.value)}))}/><div className="range-hints"><span>5 frames</span><span>100 frames</span></div></div>}
          <div className="custom-time"><div><label>Specific timestamp <span>Optional</span></label><p>Add an exact moment in seconds</p></div><div className="custom-time-control"><input type="number" min="0" max={duration||undefined} step=".1" placeholder="e.g. 12.5" value={customTime} onChange={e=>setCustomTime(e.target.value)} disabled={!file||!duration}/><button onClick={addCustomTime} disabled={!file||!duration}><Plus size={15}/> Add</button></div>{settings.customTimes.length>0&&<div className="timestamp-chips">{settings.customTimes.map(t=><button key={t} onClick={()=>setSettings(s=>({...s,customTimes:s.customTimes.filter(x=>x!==t)}))}>{formatTime(t,true)} <X size={11}/></button>)}</div>}</div>
          <div className="options-row"><div className="toggle-line"><span><Sparkles size={16}/><span><b>Automatic clarity filter</b><small>Blurry frames are discarded automatically</small></span></span><span className="ready-tag"><Check size={13}/> ON</span></div></div>
          <div className="format-grid"><div><label className="setting-label" htmlFor="format">Image format</label><select id="format" value={settings.format} onChange={e=>setSettings(s=>({...s,format:e.target.value}))}><option value="image/jpeg">JPEG · Smaller files</option><option value="image/png">PNG · Lossless</option></select></div><div><label className="setting-label" htmlFor="quality">JPEG quality <strong>{Math.round(settings.quality*100)}%</strong></label><input id="quality" type="range" min=".5" max="1" step=".05" value={settings.quality} disabled={settings.format!=="image/jpeg"} onChange={e=>setSettings(s=>({...s,quality:Number(e.target.value)}))}/></div></div>
          <button className="primary-button" disabled={!file||!duration||processing||!timestamps.length} onClick={()=>void extractFrames(false)}>{processing?<><LoaderCircle className="spin" size={17}/> Extracting…</>:<><Scissors size={17}/> {project?.status==="paused"?"Resume extraction":project?.status==="completed"?"Extract again":`Extract ${timestamps.length} screenshots`} <ArrowDownToLine size={16}/></>}</button>
          <p className="settings-footnote"><LockKeyhole size={13}/> Files are processed locally. Nothing is uploaded.</p>
        </div>
      </section>
      {processing&&<section className="panel progress-panel"><div className="progress-title"><div><LoaderCircle className="spin accent-icon" size={20}/><span><strong>Extracting your frames</strong><small>{progress.status}</small></span></div><button className="cancel-button" onClick={()=>{cancelRef.current=true;}}>Pause</button></div><div className="progress-track"><div style={{width:`${progressPercent}%`}}/></div><div className="progress-stats"><span>{progress.done} / {progress.total} processed</span><span>{progress.skipped} blurry skipped</span><span>{formatTime(progress.time)}</span></div></section>}
      {frames.length>0&&<section className="gallery-section"><div className="gallery-header"><div><span className="step-number">03</span><div><h2>{project?.title||"Your screenshots"}</h2><p>{frames.length} captured · {selectedCount} selected</p></div></div><div className="gallery-actions"><button className="secondary-button" onClick={()=>void setAllSelected(true)}><CheckCheck size={14}/> Select all</button><button className="secondary-button" onClick={()=>void setAllSelected(false)}>Clear selection</button><button className="download-button" disabled={!selectedCount||zipping} onClick={()=>void downloadZip()}>{zipping?<LoaderCircle className="spin" size={15}/>:<Archive size={15}/>} Download ZIP ({selectedCount})</button></div></div>
        <div className="frames-grid">{frames.map((frame,index)=><article className={`frame-card ${frame.selected?"is-selected":""}`} key={frame.id}><button className="frame-image" onClick={()=>setPreviewIndex(index)} aria-label={`Preview frame at ${formatTime(frame.timestamp)}`}><img src={frame.url} alt={`Video frame at ${formatTime(frame.timestamp)}`} loading="lazy"/><span className="frame-time">{formatTime(frame.timestamp,true)}</span></button><div className="frame-meta"><label><input type="checkbox" checked={frame.selected} onChange={()=>void toggleFrame(frame.id)}/><span>Frame {String(index+1).padStart(2,"0")}</span></label><div className="flex gap-2"><button title="Download image" onClick={()=>downloadFrame(frame)}><ArrowDownToLine size={15}/></button><button title="Delete image" onClick={()=>void deleteImage(frame)}><Trash2 size={15}/></button></div></div></article>)}</div>
      </section>}
      {!file&&<section className="trust-row"><div><ShieldCheck size={17}/><span><b>Private by design</b><small>Your files never leave your device</small></span></div><div><Zap size={17}/><span><b>Fast local processing</b><small>No upload or server queue</small></span></div><div><Archive size={17}/><span><b>Easy export</b><small>Save images individually or as ZIP</small></span></div></section>}
      <footer><span>FRAMEGRAB · BRILINA DEV</span><span>Private video frame extraction · Built for your browser</span></footer>
    </main>
    {currentFrame&&<div className="preview-overlay" onClick={()=>setPreviewIndex(null)}><div className="preview-dialog" onClick={e=>e.stopPropagation()} onTouchStart={e=>{previewTouch.current={x:e.touches[0].clientX,y:e.touches[0].clientY};}} onTouchEnd={e=>{if(!previewTouch.current)return;const dx=e.changedTouches[0].clientX-previewTouch.current.x,dy=e.changedTouches[0].clientY-previewTouch.current.y;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy))setPreviewIndex(i=>i===null?null:Math.max(0,Math.min(frames.length-1,i+(dx<0?1:-1))));previewTouch.current=null;}}><div className="preview-toolbar"><span>{formatTime(currentFrame.timestamp,true)} <small>· {currentFrame.width} × {currentFrame.height} · {(previewIndex??0)+1}/{frames.length}</small></span><div><button onClick={()=>downloadFrame(currentFrame)}><ArrowDownToLine size={15}/> Save image</button><button className="close-preview" onClick={()=>setPreviewIndex(null)} aria-label="Close preview"><X size={20}/></button></div></div><div className="flex items-center justify-between gap-3 min-h-0 flex-1"><button className="secondary-button" disabled={previewIndex===0} onClick={()=>setPreviewIndex(i=>i===null?null:Math.max(0,i-1))}>← Previous</button><img src={currentFrame.url} alt="Full-size extracted video frame"/><button className="secondary-button" disabled={previewIndex===frames.length-1} onClick={()=>setPreviewIndex(i=>i===null?null:Math.min(frames.length-1,i+1))}>Next →</button></div></div></div>}
    {notice&&<div className="toast" role="status"><span><Check size={15}/></span>{notice}<button onClick={()=>setNotice("")} aria-label="Dismiss"><X size={14}/></button></div>}
    {restoring&&<div className="fixed bottom-3 right-3 text-xs text-slate-500">Restoring local workspace…</div>}
    <canvas ref={canvasRef} className="hidden"/>
  </div>;
}

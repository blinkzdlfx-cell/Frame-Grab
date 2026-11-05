export type ProjectStatus = "draft" | "processing" | "paused" | "completed" | "needs-source";
export type ProjectSettings = {
  mode: "interval" | "target";
  interval: number;
  targetCount: number;
  format: string;
  quality: number;
  customTimes: number[];
};
export type StoredProject = {
  id: string;
  title: string;
  sourceName: string;
  sourceSize: number;
  sourceType: string;
  sourceLastModified: number;
  sourceBlob?: Blob;
  settings: ProjectSettings;
  duration: number;
  width: number;
  height: number;
  status: ProjectStatus;
  plannedTimestamps: number[];
  nextIndex: number;
  skipped: number;
  createdAt: number;
  updatedAt: number;
};
export type StoredFrame = {
  id: string;
  projectId: string;
  index: number;
  timestamp: number;
  blob: Blob;
  width: number;
  height: number;
  sharpness: number;
  selected: boolean;
  format: string;
};

const DB_NAME = "framegrab-local";
const DB_VERSION = 2;
const PROJECTS = "projects";
const FRAMES = "frames";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("This browser does not support local storage."));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction;
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: "id" });
      let frameStore: IDBObjectStore;
      if (!db.objectStoreNames.contains(FRAMES)) frameStore = db.createObjectStore(FRAMES, { keyPath: "id" });
      else frameStore = tx!.objectStore(FRAMES);
      if (!frameStore.indexNames.contains("projectId")) frameStore.createIndex("projectId", "projectId", { unique: false });
      // Preserve screenshots saved by version 1 by placing them in a recovered project.
      const cursorRequest = frameStore.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        const row = cursor.value as StoredFrame & { projectId?: string; index?: number };
        if (!row.projectId) {
          row.projectId = "legacy-recovered";
          row.index = row.index ?? Math.round(row.timestamp * 1000);
          cursor.update(row);
        }
        cursor.continue();
      };
      const projectRequest = tx!.objectStore(PROJECTS).get("legacy-recovered");
      projectRequest.onsuccess = () => {
        if (!projectRequest.result) {
          tx!.objectStore(PROJECTS).put({
            id: "legacy-recovered", title: "Recovered screenshots", sourceName: "",
            sourceSize: 0, sourceType: "", sourceLastModified: 0,
            settings: { mode: "interval", interval: 2, targetCount: 15, format: "image/jpeg", quality: .88, customTimes: [] },
            duration: 0, width: 0, height: 0, status: "completed",
            plannedTimestamps: [], nextIndex: 0, skipped: 0, createdAt: Date.now(), updatedAt: Date.now()
          } satisfies StoredProject);
        }
      };
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open local storage."));
    request.onblocked = () => reject(new Error("Local storage is busy in another tab. Close other FrameGrab tabs and retry."));
  });
}

function storageError(error: unknown): Error {
  if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
    return new Error("This device's browser storage is full. Delete projects or images, or remove the source video, then try again.");
  }
  return error instanceof Error ? error : new Error("Browser storage is currently unavailable.");
}
async function withDb<T>(work: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDatabase();
  try { return await work(db); } catch (error) { throw storageError(error); } finally { db.close(); }
}
function transactionDone(tx: IDBTransaction, message: string): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(message));
    tx.onabort = () => reject(tx.error ?? new Error(message));
  });
}
export async function listProjects(): Promise<StoredProject[]> {
  return withDb(async db => {
    const tx = db.transaction(PROJECTS, "readonly");
    const result = await new Promise<StoredProject[]>((resolve, reject) => {
      const req = tx.objectStore(PROJECTS).getAll();
      req.onsuccess = () => resolve(req.result as StoredProject[]);
      req.onerror = () => reject(req.error);
    });
    return result.map(project => { const { sourceBlob: _sourceBlob, ...metadata } = project; return metadata; }).sort((a,b) => b.updatedAt-a.updatedAt);
  });
}
export async function getProject(id: string): Promise<StoredProject | undefined> {
  return withDb(async db => new Promise((resolve,reject) => {
    const req = db.transaction(PROJECTS,"readonly").objectStore(PROJECTS).get(id);
    req.onsuccess=()=>resolve(req.result as StoredProject | undefined);
    req.onerror=()=>reject(req.error);
  }));
}
export async function saveProject(project: StoredProject): Promise<void> {
  return withDb(async db => {
    const tx=db.transaction(PROJECTS,"readwrite");
    tx.objectStore(PROJECTS).put({ ...project, updatedAt: Date.now() });
    await transactionDone(tx,"Could not save project settings.");
  });
}
export async function saveSourceVideo(id: string, blob: Blob): Promise<void> {
  return withDb(async db => {
    const tx=db.transaction(PROJECTS,"readwrite");
    const store=tx.objectStore(PROJECTS);
    const req=store.get(id);
    req.onsuccess=()=>{ if(req.result) store.put({ ...req.result, sourceBlob: blob, updatedAt: Date.now() }); };
    await transactionDone(tx,"Could not save the source video.");
  });
}
export async function removeSourceVideo(id: string): Promise<void> {
  return withDb(async db => {
    const tx=db.transaction(PROJECTS,"readwrite");
    const store=tx.objectStore(PROJECTS);
    const req=store.get(id);
    req.onsuccess=()=>{ if(req.result) { const p=req.result as StoredProject; delete p.sourceBlob; store.put({ ...p, status: p.status === "completed" ? "completed" : "needs-source", updatedAt: Date.now() }); } };
    await transactionDone(tx,"Could not remove the source video.");
  });
}
export async function loadProjectFrames(projectId: string): Promise<StoredFrame[]> {
  return withDb(async db => new Promise((resolve,reject) => {
    const tx=db.transaction(FRAMES,"readonly");
    const req=tx.objectStore(FRAMES).index("projectId").getAll(projectId);
    req.onsuccess=()=>resolve((req.result as StoredFrame[]).sort((a,b)=>a.index-b.index));
    req.onerror=()=>reject(req.error);
  }));
}
export async function saveFrameAndCheckpoint(frame: StoredFrame, project: StoredProject): Promise<void> {
  return withDb(async db => {
    const tx=db.transaction([FRAMES,PROJECTS],"readwrite");
    tx.objectStore(FRAMES).put(frame);
    tx.objectStore(PROJECTS).put({ ...project, updatedAt: Date.now() });
    await transactionDone(tx,"Could not save this screenshot or its recovery checkpoint.");
  });
}
export async function updateFrameSelection(id: string, selected: boolean): Promise<void> {
  return withDb(async db => {
    const tx=db.transaction(FRAMES,"readwrite"); const store=tx.objectStore(FRAMES);
    const req=store.get(id); req.onsuccess=()=>{ if(req.result) store.put({ ...req.result, selected }); };
    await transactionDone(tx,"Could not update screenshot selection.");
  });
}
export async function deleteStoredFrame(id: string): Promise<void> {
  return withDb(async db => { const tx=db.transaction(FRAMES,"readwrite"); tx.objectStore(FRAMES).delete(id); await transactionDone(tx,"Could not delete screenshot."); });
}
export async function deleteProjectData(id: string): Promise<void> {
  return withDb(async db => {
    const tx=db.transaction([PROJECTS,FRAMES],"readwrite");
    tx.objectStore(PROJECTS).delete(id);
    const index=tx.objectStore(FRAMES).index("projectId");
    const req=index.openCursor(IDBKeyRange.only(id));
    req.onsuccess=()=>{ const cursor=req.result; if(cursor){cursor.delete();cursor.continue();} };
    await transactionDone(tx,"Could not delete this project.");
  });
}
export async function getStorageEstimate(): Promise<{usage?:number; quota?:number; persistent?:boolean}> {
  const estimate = await navigator.storage?.estimate?.();
  let persistent: boolean | undefined;
  try { persistent = await navigator.storage?.persisted?.(); } catch { persistent = undefined; }
  return { usage: estimate?.usage, quota: estimate?.quota, persistent };
}

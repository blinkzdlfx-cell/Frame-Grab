export type StoredFrame = {
  id: string;
  timestamp: number;
  blob: Blob;
  width: number;
  height: number;
  sharpness: number;
  selected: boolean;
  format: string;
};

const DB_NAME = "framegrab-local";
const STORE_NAME = "frames";
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("This browser does not support local gallery storage."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local gallery storage."));
  });
}

export async function saveStoredFrame(frame: StoredFrame): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(frame);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not save screenshot locally."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Local screenshot save was interrupted."));
  });
  db.close();
}

export async function loadStoredFrames(): Promise<StoredFrame[]> {
  const db = await openDatabase();
  const records = await new Promise<StoredFrame[]>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as StoredFrame[]);
    request.onerror = () => reject(request.error ?? new Error("Could not read the saved gallery."));
  });
  db.close();
  return records.sort((a, b) => a.timestamp - b.timestamp);
}

export async function updateStoredFrameSelection(id: string, selected: boolean): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => {
      if (request.result) store.put({ ...request.result, selected });
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not update the saved gallery."));
  });
  db.close();
}

export async function clearStoredFrames(): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not clear the saved gallery."));
  });
  db.close();
}

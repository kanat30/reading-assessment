/**
 * IndexedDB audio buffering for resilient recording.
 * Stores audio chunks incrementally to survive browser crashes and network issues.
 */

const DB_NAME = "fluencyscope-audio";
const DB_VERSION = 1;
const STORE_NAME = "chunks";

interface ChunkRecord {
  sessionId: string;
  index: number;
  blob: Blob;
  timestamp: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: ["sessionId", "index"] });
        store.createIndex("sessionId", "sessionId", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
}

/**
 * Append a single audio chunk to IndexedDB.
 */
export async function appendChunk(sessionId: string, index: number, chunk: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const record: ChunkRecord = {
      sessionId,
      index,
      blob: chunk,
      timestamp: Date.now(),
    };

    const request = store.put(record);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}

/**
 * Assemble all chunks for a session into a single Blob.
 */
export async function assembleBlob(sessionId: string): Promise<Blob> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("sessionId");
    const request = index.getAll(IDBKeyRange.only(sessionId));

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const records = request.result as ChunkRecord[];
      // Sort by index to ensure correct order
      records.sort((a, b) => a.index - b.index);
      const blobs = records.map((r) => r.blob);
      const assembled = new Blob(blobs, { type: "audio/webm" });
      resolve(assembled);
    };
    tx.oncomplete = () => db.close();
  });
}

/**
 * Clear all chunks for a completed session.
 */
export async function clearSession(sessionId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("sessionId");
    const request = index.openCursor(IDBKeyRange.only(sessionId));

    request.onerror = () => reject(request.error);
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
  });
}

/**
 * List all session IDs that have orphaned (incomplete) recordings.
 * Orphaned = chunks older than 5 minutes that weren't cleared.
 */
export async function listOrphanedSessions(): Promise<string[]> {
  const db = await openDB();
  const orphanThreshold = Date.now() - 5 * 60 * 1000; // 5 minutes ago

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const records = request.result as ChunkRecord[];
      // Group by sessionId and find orphans
      const sessionMap = new Map<string, number>();
      for (const record of records) {
        const existing = sessionMap.get(record.sessionId);
        if (!existing || record.timestamp < existing) {
          sessionMap.set(record.sessionId, record.timestamp);
        }
      }

      const orphaned: string[] = [];
      sessionMap.forEach((timestamp, sessionId) => {
        if (timestamp < orphanThreshold) {
          orphaned.push(sessionId);
        }
      });

      resolve(orphaned);
    };
    tx.oncomplete = () => db.close();
  });
}

/**
 * Get chunk count for a session (useful for resumption).
 */
export async function getChunkCount(sessionId: string): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("sessionId");
    const request = index.count(IDBKeyRange.only(sessionId));

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Check if IndexedDB is available.
 */
export function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

'use client';

// Persists fetched .ttf font bytes in IndexedDB so the export engine only
// ever downloads a given font ONCE per browser. Without this, every single
// export re-fetched the font from the google-webfonts-helper API, which
// meant every render depended on internet + that third-party API being up,
// and failed the same way over and over (see the red warning banner in
// Export card: "Font khusus gagal diunduh ... butuh koneksi internet").
//
// With caching:
// - First successful fetch of a font is stored permanently (until the user
//   clears site data), keyed by gwfhId + weight.
// - Every subsequent export (even offline, even if the gwfh API is down or
//   blocked) reuses the cached bytes instead of re-downloading.
// - If a fetch fails and nothing is cached yet, we still fall back to the
//   default font with a warning — but only until the fetch succeeds once.

const DB_NAME = 'cutclip_fonts';
const STORE_NAME = 'ttf';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getCachedFont(key: string): Promise<Uint8Array | null> {
  try {
    const db = await openDb();
    const result = await new Promise<Uint8Array | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result as Uint8Array | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result ?? null;
  } catch {
    // IndexedDB unavailable (e.g. private browsing) — just skip caching.
    return null;
  }
}

export async function setCachedFont(key: string, bytes: Uint8Array): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(bytes, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Non-fatal — the render can proceed even if we fail to persist the cache.
  }
}

/**
 * Durable, metadata-only catalog storage. Album artwork is deliberately not
 * stored here: the WebView's HTTP cache owns image bytes.
 */
const DATABASE_NAME = "prism-player-library-catalog";
const STORE_NAME = "catalogs";
const DATABASE_VERSION = 1;

export type LibraryCatalogSnapshot<TLibrary, TSong> = {
  key: string;
  version: 1;
  savedAt: string;
  library: TLibrary;
  songs: TSong[];
  /** True once the complete song catalog has been fetched. */
  songsComplete: boolean;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable in this browser."));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the local library catalog."));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(database.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not access the local library catalog."));
    });
  } finally {
    database.close();
  }
}

export async function readLibraryCatalog<TLibrary, TSong>(key: string) {
  return withStore<LibraryCatalogSnapshot<TLibrary, TSong> | undefined>("readonly", (store) => store.get(key));
}

export async function writeLibraryCatalog<TLibrary, TSong>(snapshot: LibraryCatalogSnapshot<TLibrary, TSong>) {
  await withStore<IDBValidKey>("readwrite", (store) => store.put(snapshot));
}

export async function deleteLibraryCatalog(key: string) {
  await withStore<undefined>("readwrite", (store) => store.delete(key));
}

export interface StoredDownload {
  key: string;
  kind: "file" | "hls";
  url: string;
  filename: string;
  chunks: Blob[];
  received: number;
  total: number;
  contentType: string;
  updatedAt: number;
}

const DATABASE_NAME = "fishystream-downloads";
const STORE_NAME = "downloads";
const DATABASE_VERSION = 1;

function isStoredDownload(value: unknown): value is StoredDownload {
  return (
    typeof value === "object" &&
    value !== null &&
    "key" in value &&
    typeof value.key === "string" &&
    "kind" in value &&
    (value.kind === "file" || value.kind === "hls") &&
    "url" in value &&
    typeof value.url === "string" &&
    "filename" in value &&
    typeof value.filename === "string" &&
    "chunks" in value &&
    Array.isArray(value.chunks) &&
    value.chunks.every((chunk) => chunk instanceof Blob) &&
    "received" in value &&
    typeof value.received === "number" &&
    "total" in value &&
    typeof value.total === "number" &&
    "contentType" in value &&
    typeof value.contentType === "string" &&
    "updatedAt" in value &&
    typeof value.updatedAt === "number"
  );
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error("Unable to open download database."));
  });
}

function runStoreRequest<T>(
  mode: IDBTransactionMode,
  createRequest: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDatabase().then(
    (database) =>
      new Promise((resolve, reject) => {
        let transaction: IDBTransaction;
        let request: IDBRequest<T>;
        try {
          transaction = database.transaction(STORE_NAME, mode);
          request = createRequest(transaction.objectStore(STORE_NAME));
        } catch (error) {
          database.close();
          reject(error);
          return;
        }

        let failed = false;
        const fail = () => {
          if (failed) return;
          failed = true;
          database.close();
          reject(
            transaction.error ?? request.error ?? new Error("Download database request failed.")
          );
        };

        request.onerror = fail;
        transaction.onerror = fail;
        transaction.onabort = fail;
        transaction.oncomplete = () => {
          database.close();
          if (!failed) resolve(request.result);
        };
      })
  );
}

export async function getStoredDownload(key: string): Promise<StoredDownload | null> {
  const result = await runStoreRequest<unknown>("readonly", (store) => store.get(key));
  return isStoredDownload(result) ? result : null;
}

export async function setStoredDownload(download: StoredDownload): Promise<void> {
  await runStoreRequest("readwrite", (store) => store.put(download));
}

export async function removeStoredDownload(key: string): Promise<void> {
  await runStoreRequest("readwrite", (store) => store.delete(key));
}

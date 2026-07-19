"use client";

import type { Entry } from "@/types/entry";

const DATABASE_NAME = "yerrr-studio-offline";
const DATABASE_VERSION = 1;

const PENDING_STORE = "pending_entry_updates";
const SNAPSHOT_STORE = "entry_snapshot";

const PENDING_FALLBACK_KEY =
  "yerrr-studio-pending-entry-updates";

const SNAPSHOT_FALLBACK_KEY =
  "yerrr-studio-entry-snapshot";

export const OFFLINE_QUEUE_CHANGED_EVENT =
  "yerrr:offline-queue-changed";

export type PendingEntryUpdate = {
  entryId: string;
  entry: Entry;
  queuedAt: string;
  updatedAt: string;
  attempts: number;
  lastError: string;
};

type EntrySnapshotRecord = {
  key: "all_entries";
  entries: Entry[];
  savedAt: string;
};

function canUseWindow() {
  return typeof window !== "undefined";
}

function canUseIndexedDb() {
  return (
    canUseWindow() &&
    typeof window.indexedDB !== "undefined"
  );
}

function emitQueueChanged() {
  if (!canUseWindow()) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(
      OFFLINE_QUEUE_CHANGED_EVENT,
    ),
  );
}

function requestToPromise<T>(
  request: IDBRequest<T>,
): Promise<T> {
  return new Promise(
    (resolve, reject) => {
      request.onsuccess = () =>
        resolve(request.result);

      request.onerror = () =>
        reject(
          request.error ??
            new Error(
              "The offline database request failed.",
            ),
        );
    },
  );
}

function transactionToPromise(
  transaction: IDBTransaction,
): Promise<void> {
  return new Promise(
    (resolve, reject) => {
      transaction.oncomplete = () =>
        resolve();

      transaction.onerror = () =>
        reject(
          transaction.error ??
            new Error(
              "The offline database transaction failed.",
            ),
        );

      transaction.onabort = () =>
        reject(
          transaction.error ??
            new Error(
              "The offline database transaction was aborted.",
            ),
        );
    },
  );
}

function openOfflineDatabase():
  Promise<IDBDatabase> {
  if (!canUseIndexedDb()) {
    return Promise.reject(
      new Error(
        "IndexedDB is not available in this browser.",
      ),
    );
  }

  return new Promise(
    (resolve, reject) => {
      const request =
        window.indexedDB.open(
          DATABASE_NAME,
          DATABASE_VERSION,
        );

      request.onupgradeneeded =
        () => {
          const database =
            request.result;

          if (
            !database.objectStoreNames.contains(
              PENDING_STORE,
            )
          ) {
            database.createObjectStore(
              PENDING_STORE,
              {
                keyPath: "entryId",
              },
            );
          }

          if (
            !database.objectStoreNames.contains(
              SNAPSHOT_STORE,
            )
          ) {
            database.createObjectStore(
              SNAPSHOT_STORE,
              {
                keyPath: "key",
              },
            );
          }
        };

      request.onsuccess = () =>
        resolve(request.result);

      request.onerror = () =>
        reject(
          request.error ??
            new Error(
              "Unable to open offline storage.",
            ),
        );

      request.onblocked = () =>
        reject(
          new Error(
            "Offline storage is blocked by another open YERRR Studio tab.",
          ),
        );
    },
  );
}

function readFallbackPendingUpdates():
  PendingEntryUpdate[] {
  if (!canUseWindow()) {
    return [];
  }

  try {
    const stored =
      window.localStorage.getItem(
        PENDING_FALLBACK_KEY,
      );

    if (!stored) {
      return [];
    }

    const parsed: unknown =
      JSON.parse(stored);

    return Array.isArray(parsed)
      ? (parsed as PendingEntryUpdate[])
      : [];
  } catch {
    return [];
  }
}

function writeFallbackPendingUpdates(
  records: PendingEntryUpdate[],
) {
  if (!canUseWindow()) {
    return;
  }

  window.localStorage.setItem(
    PENDING_FALLBACK_KEY,
    JSON.stringify(records),
  );
}

function readFallbackSnapshot(): Entry[] {
  if (!canUseWindow()) {
    return [];
  }

  try {
    const stored =
      window.localStorage.getItem(
        SNAPSHOT_FALLBACK_KEY,
      );

    if (!stored) {
      return [];
    }

    const parsed: unknown =
      JSON.parse(stored);

    return Array.isArray(parsed)
      ? (parsed as Entry[])
      : [];
  } catch {
    return [];
  }
}

async function readIndexedPendingUpdates():
  Promise<PendingEntryUpdate[]> {
  const database =
    await openOfflineDatabase();

  const transaction =
    database.transaction(
      PENDING_STORE,
      "readonly",
    );

  const completion =
    transactionToPromise(transaction);

  const request =
    transaction
      .objectStore(PENDING_STORE)
      .getAll() as IDBRequest<
      PendingEntryUpdate[]
    >;

  const records =
    await requestToPromise(request);

  await completion;
  database.close();

  return records;
}

async function putIndexedPendingUpdate(
  record: PendingEntryUpdate,
) {
  const database =
    await openOfflineDatabase();

  const transaction =
    database.transaction(
      PENDING_STORE,
      "readwrite",
    );

  const completion =
    transactionToPromise(transaction);

  transaction
    .objectStore(PENDING_STORE)
    .put(record);

  await completion;
  database.close();
}

async function deleteIndexedPendingUpdate(
  entryId: string,
) {
  const database =
    await openOfflineDatabase();

  const transaction =
    database.transaction(
      PENDING_STORE,
      "readwrite",
    );

  const completion =
    transactionToPromise(transaction);

  transaction
    .objectStore(PENDING_STORE)
    .delete(entryId);

  await completion;
  database.close();
}

async function putPendingRecord(
  record: PendingEntryUpdate,
) {
  try {
    await putIndexedPendingUpdate(
      record,
    );

    writeFallbackPendingUpdates(
      readFallbackPendingUpdates().filter(
        (currentRecord) =>
          currentRecord.entryId !==
          record.entryId,
      ),
    );
  } catch {
    const fallback =
      readFallbackPendingUpdates().filter(
        (currentRecord) =>
          currentRecord.entryId !==
          record.entryId,
      );

    fallback.push(record);
    writeFallbackPendingUpdates(
      fallback,
    );
  }

  emitQueueChanged();
}

export async function getPendingEntryUpdates():
  Promise<PendingEntryUpdate[]> {
  const fallback =
    readFallbackPendingUpdates();

  let indexed:
    PendingEntryUpdate[] = [];

  try {
    indexed =
      await readIndexedPendingUpdates();
  } catch {
    indexed = [];
  }

  const merged = new Map<
    string,
    PendingEntryUpdate
  >();

  [...fallback, ...indexed].forEach(
    (record) => {
      const existing =
        merged.get(record.entryId);

      if (
        !existing ||
        new Date(
          record.updatedAt,
        ).getTime() >=
          new Date(
            existing.updatedAt,
          ).getTime()
      ) {
        merged.set(
          record.entryId,
          record,
        );
      }
    },
  );

  return Array.from(
    merged.values(),
  ).sort(
    (a, b) =>
      new Date(
        a.queuedAt,
      ).getTime() -
      new Date(
        b.queuedAt,
      ).getTime(),
  );
}

export async function queueEntryUpdate(
  entry: Entry,
): Promise<PendingEntryUpdate> {
  const records =
    await getPendingEntryUpdates();

  const existing =
    records.find(
      (record) =>
        record.entryId ===
        String(entry.id),
    );

  const now =
    new Date().toISOString();

  const record:
    PendingEntryUpdate = {
    entryId: String(entry.id),
    entry,
    queuedAt:
      existing?.queuedAt ?? now,
    updatedAt: now,
    attempts:
      existing?.attempts ?? 0,
    lastError:
      existing?.lastError ?? "",
  };

  await putPendingRecord(record);

  return record;
}

export async function removePendingEntryUpdate(
  entryId: string,
): Promise<void> {
  try {
    await deleteIndexedPendingUpdate(
      String(entryId),
    );
  } catch {
    // The fallback is cleared below.
  }

  writeFallbackPendingUpdates(
    readFallbackPendingUpdates().filter(
      (record) =>
        record.entryId !==
        String(entryId),
    ),
  );

  emitQueueChanged();
}

export async function recordEntrySyncFailure(
  entryId: string,
  errorMessage: string,
): Promise<void> {
  const records =
    await getPendingEntryUpdates();

  const record =
    records.find(
      (currentRecord) =>
        currentRecord.entryId ===
        String(entryId),
    );

  if (!record) {
    return;
  }

  await putPendingRecord({
    ...record,
    attempts:
      record.attempts + 1,
    lastError: errorMessage,
    updatedAt:
      new Date().toISOString(),
  });
}

export async function saveEntrySnapshot(
  entries: Entry[],
): Promise<void> {
  const record:
    EntrySnapshotRecord = {
    key: "all_entries",
    entries,
    savedAt:
      new Date().toISOString(),
  };

  try {
    const database =
      await openOfflineDatabase();

    const transaction =
      database.transaction(
        SNAPSHOT_STORE,
        "readwrite",
      );

    const completion =
      transactionToPromise(
        transaction,
      );

    transaction
      .objectStore(SNAPSHOT_STORE)
      .put(record);

    await completion;
    database.close();
  } catch {
    if (canUseWindow()) {
      window.localStorage.setItem(
        SNAPSHOT_FALLBACK_KEY,
        JSON.stringify(entries),
      );
    }
  }
}

export async function loadEntrySnapshot():
  Promise<Entry[]> {
  try {
    const database =
      await openOfflineDatabase();

    const transaction =
      database.transaction(
        SNAPSHOT_STORE,
        "readonly",
      );

    const completion =
      transactionToPromise(
        transaction,
      );

    const request =
      transaction
        .objectStore(SNAPSHOT_STORE)
        .get(
          "all_entries",
        ) as IDBRequest<
        EntrySnapshotRecord | undefined
      >;

    const record =
      await requestToPromise(request);

    await completion;
    database.close();

    if (record?.entries) {
      return record.entries;
    }
  } catch {
    // Local storage fallback is returned below.
  }

  return readFallbackSnapshot();
}

export function mergePendingEntryUpdates(
  entries: Entry[],
  pendingUpdates:
    PendingEntryUpdate[],
): Entry[] {
  if (
    pendingUpdates.length === 0
  ) {
    return entries;
  }

  const pendingById =
    new Map(
      pendingUpdates.map(
        (record) => [
          String(
            record.entryId,
          ),
          record.entry,
        ],
      ),
    );

  const merged =
    entries.map((entry) => {
      return (
        pendingById.get(
          String(entry.id),
        ) ?? entry
      );
    });

  const existingIds =
    new Set(
      merged.map((entry) =>
        String(entry.id),
      ),
    );

  pendingUpdates.forEach(
    (record) => {
      if (
        !existingIds.has(
          record.entryId,
        )
      ) {
        merged.unshift(
          record.entry,
        );
      }
    },
  );

  return merged;
}

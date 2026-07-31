"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import type { Entry } from "@/types/entry";
import type {
  EntryMediaAsset,
  EntryMediaBulkMetadataInput,
  EntryMediaBulkMetadataResult,
  EntryMediaKind,
  EntryMediaStorageAudit,
  EntryMediaStorageCleanupInput,
  EntryMediaStorageCleanupResult,
} from "@/types/entryMedia";

const MAX_SELECTION = 50;

type WorkflowTab = "bulk" | "audit";
type KindFilter = "all" | EntryMediaKind;
type MetadataFilter =
  | "all"
  | "missing-attribution"
  | "missing-source"
  | "missing-any";

type MediaBulkWorkflowPanelProps = {
  isOpen: boolean;
  entries: Entry[];
  assets: EntryMediaAsset[];
  isOnline: boolean;
  isLoading: boolean;
  activeOperation: string | null;
  onClose: () => void;
  onRefresh: () => Promise<void> | void;
  onBulkUpdateMetadata: (
    input: EntryMediaBulkMetadataInput,
  ) => Promise<EntryMediaBulkMetadataResult>;
  onAuditStorage: () => Promise<EntryMediaStorageAudit>;
  onCleanupStorage: (
    audit: EntryMediaStorageAudit,
    input: EntryMediaStorageCleanupInput,
  ) => Promise<EntryMediaStorageCleanupResult>;
  onMediaChanged?: () => Promise<void> | void;
};

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Unknown"
    : parsed.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

function assetLabel(asset: EntryMediaAsset) {
  return asset.kind === "image" ? "Image" : "Audio";
}

function entryNameById(entries: Entry[]) {
  return new Map(entries.map((entry) => [String(entry.id), entry.word]));
}

function resultMessage(result: EntryMediaStorageCleanupResult) {
  const base = `Removed ${result.removedObjects} orphaned file${
    result.removedObjects === 1 ? "" : "s"
  } and ${result.removedRows} broken record${result.removedRows === 1 ? "" : "s"}.`;

  return result.warnings.length > 0
    ? `${base} ${result.warnings.length} cleanup warning${
        result.warnings.length === 1 ? "" : "s"
      } remain.`
    : base;
}

export function MediaBulkWorkflowPanel({
  isOpen,
  entries,
  assets,
  isOnline,
  isLoading,
  activeOperation,
  onClose,
  onRefresh,
  onBulkUpdateMetadata,
  onAuditStorage,
  onCleanupStorage,
  onMediaChanged,
}: MediaBulkWorkflowPanelProps) {
  const [tab, setTab] = useState<WorkflowTab>("bulk");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [metadataFilter, setMetadataFilter] = useState<MetadataFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [attribution, setAttribution] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [fillBlankOnly, setFillBlankOnly] = useState(true);
  const [audit, setAudit] = useState<EntryMediaStorageAudit | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const namesById = useMemo(() => entryNameById(entries), [entries]);

  const sortedAssets = useMemo(
    () =>
      [...assets].sort((left, right) => {
        const leftWord = namesById.get(left.entryId) ?? left.entryId;
        const rightWord = namesById.get(right.entryId) ?? right.entryId;
        return (
          leftWord.localeCompare(rightWord) || left.kind.localeCompare(right.kind)
        );
      }),
    [assets, namesById],
  );

  const filteredAssets = useMemo(() => {
    const query = search.trim().toLowerCase();

    return sortedAssets.filter((asset) => {
      if (kindFilter !== "all" && asset.kind !== kindFilter) return false;
      if (metadataFilter === "missing-attribution" && asset.attribution) return false;
      if (metadataFilter === "missing-source" && asset.sourceUrl) return false;
      if (
        metadataFilter === "missing-any" &&
        asset.attribution &&
        asset.sourceUrl
      ) {
        return false;
      }

      if (!query) return true;
      const entryWord = namesById.get(asset.entryId) ?? "";
      return [entryWord, asset.filename, asset.attribution, asset.sourceUrl]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [kindFilter, metadataFilter, namesById, search, sortedAssets]);

  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedAssetIds.has(asset.id)),
    [assets, selectedAssetIds],
  );

  const allVisibleSelected =
    filteredAssets.length > 0 &&
    filteredAssets.every((asset) => selectedAssetIds.has(asset.id));

  const isBusy = Boolean(activeOperation);
  const isBulkBusy = activeOperation === "bulk-metadata";
  const isAuditBusy = activeOperation === "storage-audit";
  const isCleanupBusy = activeOperation === "storage-cleanup";

  if (!isOpen) return null;

  function toggleAsset(assetId: string) {
    setSelectedAssetIds((current) => {
      const next = new Set(current);
      if (next.has(assetId)) {
        next.delete(assetId);
        return next;
      }
      if (next.size >= MAX_SELECTION) {
        setNotice(`Select up to ${MAX_SELECTION} assets at a time.`);
        return current;
      }
      next.add(assetId);
      return next;
    });
  }

  function toggleVisibleSelection() {
    setSelectedAssetIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const asset of filteredAssets) next.delete(asset.id);
        return next;
      }

      for (const asset of filteredAssets) {
        if (next.size >= MAX_SELECTION) break;
        next.add(asset.id);
      }
      return next;
    });
  }

  async function applyBulkMetadata() {
    if (!isOnline) {
      setNotice("Bulk media updates require an online connection.");
      return;
    }
    if (selectedAssets.length === 0) {
      setNotice("Select at least one image or audio asset.");
      return;
    }
    if (!attribution.trim() && !sourceUrl.trim()) {
      setNotice("Enter an attribution or source URL to apply.");
      return;
    }

    const confirmed = window.confirm(
      `Apply these media details to ${selectedAssets.length} selected asset${
        selectedAssets.length === 1 ? "" : "s"
      }? ${fillBlankOnly ? "Existing values will be preserved." : "Existing values may be replaced."}`,
    );
    if (!confirmed) return;

    try {
      setNotice(null);
      const result = await onBulkUpdateMetadata({
        assets: selectedAssets,
        attribution,
        sourceUrl,
        fillBlankOnly,
      });
      await onMediaChanged?.();
      setSelectedAssetIds(new Set());
      setNotice(
        `Updated ${result.updated} asset${result.updated === 1 ? "" : "s"}. ${
          result.skipped
        } already had the protected values.`,
      );
    } catch (bulkError) {
      setNotice(
        bulkError instanceof Error
          ? bulkError.message
          : "Bulk metadata could not be saved.",
      );
    }
  }

  async function runAudit() {
    if (!isOnline) {
      setNotice("Storage Audit requires an online connection.");
      return;
    }

    try {
      setNotice(null);
      const nextAudit = await onAuditStorage();
      setAudit(nextAudit);
      setNotice(
        nextAudit.orphanedObjects.length === 0 &&
          nextAudit.missingAssets.length === 0
          ? "Storage and media records are aligned."
          : `Found ${nextAudit.orphanedObjects.length} orphaned file${
              nextAudit.orphanedObjects.length === 1 ? "" : "s"
            } and ${nextAudit.missingAssets.length} broken record${
              nextAudit.missingAssets.length === 1 ? "" : "s"
            }.`,
      );
    } catch (auditError) {
      setNotice(
        auditError instanceof Error
          ? auditError.message
          : "Storage Audit could not be completed.",
      );
    }
  }

  async function cleanup(input: EntryMediaStorageCleanupInput) {
    if (!audit) return;

    const targetCount =
      (input.removeOrphanedObjects ? audit.orphanedObjects.length : 0) +
      (input.removeMissingAssetRows ? audit.missingAssets.length : 0);
    if (targetCount === 0) {
      setNotice("There are no matching cleanup items.");
      return;
    }

    const confirmed = window.confirm(
      `Clean ${targetCount} media issue${targetCount === 1 ? "" : "s"}? This cannot be undone. Entry content will not be deleted.`,
    );
    if (!confirmed) return;

    try {
      setNotice(null);
      const result = await onCleanupStorage(audit, input);
      await onMediaChanged?.();
      const nextAudit = await onAuditStorage();
      setAudit(nextAudit);
      setNotice(resultMessage(result));
    } catch (cleanupError) {
      setNotice(
        cleanupError instanceof Error
          ? cleanupError.message
          : "Storage cleanup could not be completed.",
      );
    }
  }

  return (
    <div className="fixed inset-0 z-[135] overflow-y-auto bg-black/90 p-3 backdrop-blur-md sm:p-6">
      <div className="mx-auto min-h-full max-w-6xl rounded-[28px] border border-neutral-800 bg-[#080808] shadow-2xl">
        <header className="border-b border-neutral-800 p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
<h2 className="mt-2 text-3xl font-black text-white sm:text-4xl">
                Media Bulk Workflow
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-400">
                Fill shared attribution and source details across selected assets, then compare Supabase Storage with the media table and explicitly clean orphaned files or broken records.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void onRefresh()}
                disabled={!isOnline || isLoading || isBusy}
                className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-black text-white transition hover:border-fuchsia-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Refresh media
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-neutral-700 bg-black px-4 py-3 text-sm font-black text-white transition hover:border-white"
              >
                Close
              </button>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTab("bulk")}
              className={`rounded-xl px-4 py-3 text-sm font-black transition ${
                tab === "bulk"
                  ? "bg-fuchsia-200 text-black"
                  : "border border-neutral-700 bg-black text-neutral-300 hover:border-fuchsia-300"
              }`}
            >
              Bulk metadata · {assets.length}
            </button>
            <button
              type="button"
              onClick={() => setTab("audit")}
              className={`rounded-xl px-4 py-3 text-sm font-black transition ${
                tab === "audit"
                  ? "bg-fuchsia-200 text-black"
                  : "border border-neutral-700 bg-black text-neutral-300 hover:border-fuchsia-300"
              }`}
            >
              Storage audit
              {audit
                ? ` · ${audit.orphanedObjects.length + audit.missingAssets.length}`
                : ""}
            </button>
          </div>
        </header>

        <main className="p-5 sm:p-7">
          {!isOnline && (
            <div className="mb-5 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm font-bold text-amber-100">
              Bulk updates, Storage Audit, and cleanup require an online connection.
            </div>
          )}

          {notice && (
            <div className="mb-5 rounded-2xl border border-fuchsia-300/25 bg-fuchsia-300/10 p-4 text-sm font-bold text-fuchsia-100">
              {notice}
            </div>
          )}

          {tab === "bulk" ? (
            <section className="space-y-5">
              <div className="grid gap-4 rounded-3xl border border-neutral-800 bg-neutral-950 p-5 lg:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                    Attribution / creator
                  </span>
                  <input
                    value={attribution}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setAttribution(event.target.value)
                    }
                    placeholder="YERRR Studio, photographer, artist, or speaker"
                    className="mt-2 w-full rounded-xl border border-neutral-700 bg-black px-4 py-3 text-sm text-white outline-none transition focus:border-fuchsia-300"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                    Source URL
                  </span>
                  <input
                    value={sourceUrl}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setSourceUrl(event.target.value)
                    }
                    placeholder="https://…"
                    className="mt-2 w-full rounded-xl border border-neutral-700 bg-black px-4 py-3 text-sm text-white outline-none transition focus:border-fuchsia-300"
                  />
                </label>

                <label className="flex items-start gap-3 rounded-2xl border border-neutral-800 bg-black p-4 lg:col-span-2">
                  <input
                    type="checkbox"
                    checked={fillBlankOnly}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setFillBlankOnly(event.target.checked)
                    }
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    <span className="block font-black text-white">
                      Fill blank values only
                    </span>
                    <span className="mt-1 block text-sm text-neutral-500">
                      Recommended. Existing attribution and source values stay untouched.
                    </span>
                  </span>
                </label>

                <div className="flex flex-wrap gap-2 lg:col-span-2">
                  <button
                    type="button"
                    onClick={() => void applyBulkMetadata()}
                    disabled={
                      !isOnline ||
                      isBusy ||
                      selectedAssets.length === 0 ||
                      (!attribution.trim() && !sourceUrl.trim())
                    }
                    className="rounded-xl bg-fuchsia-200 px-4 py-3 text-sm font-black text-black transition hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isBulkBusy
                      ? "Applying…"
                      : `Apply to selected · ${selectedAssets.length}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedAssetIds(new Set())}
                    disabled={selectedAssets.length === 0 || isBusy}
                    className="rounded-xl border border-neutral-700 px-4 py-3 text-sm font-black text-white transition hover:border-white disabled:opacity-40"
                  >
                    Clear selection
                  </button>
                </div>
              </div>

              <div className="rounded-3xl border border-neutral-800 bg-neutral-950 p-5">
                <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                  <input
                    value={search}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setSearch(event.target.value)
                    }
                    placeholder="Search entries or filenames…"
                    className="rounded-xl border border-neutral-700 bg-black px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-fuchsia-300"
                  />
                  <select
                    value={kindFilter}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      setKindFilter(event.target.value as KindFilter)
                    }
                    className="rounded-xl border border-neutral-700 bg-black px-4 py-3 text-sm font-bold text-white outline-none focus:border-fuchsia-300"
                  >
                    <option value="all">Images and audio</option>
                    <option value="image">Images only</option>
                    <option value="audio">Audio only</option>
                  </select>
                  <select
                    value={metadataFilter}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      setMetadataFilter(event.target.value as MetadataFilter)
                    }
                    className="rounded-xl border border-neutral-700 bg-black px-4 py-3 text-sm font-bold text-white outline-none focus:border-fuchsia-300"
                  >
                    <option value="all">All metadata</option>
                    <option value="missing-any">Missing any details</option>
                    <option value="missing-attribution">Missing attribution</option>
                    <option value="missing-source">Missing source URL</option>
                  </select>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-y border-neutral-800 py-3">
                  <button
                    type="button"
                    onClick={toggleVisibleSelection}
                    disabled={filteredAssets.length === 0 || isBusy}
                    className="rounded-xl border border-neutral-700 px-3 py-2 text-xs font-black text-white transition hover:border-fuchsia-300 disabled:opacity-40"
                  >
                    {allVisibleSelected ? "Deselect visible" : "Select visible"}
                  </button>
                  <p className="text-xs font-bold text-neutral-500">
                    {filteredAssets.length} shown · {selectedAssets.length}/{MAX_SELECTION} selected
                  </p>
                </div>

                {isLoading ? (
                  <div className="py-16 text-center font-bold text-neutral-500">
                    Loading media assets…
                  </div>
                ) : filteredAssets.length === 0 ? (
                  <div className="py-16 text-center font-bold text-neutral-500">
                    No media assets match these filters.
                  </div>
                ) : (
                  <div className="mt-3 max-h-[48vh] space-y-2 overflow-y-auto pr-1">
                    {filteredAssets.map((asset) => {
                      const selected = selectedAssetIds.has(asset.id);
                      return (
                        <label
                          key={asset.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                            selected
                              ? "border-fuchsia-300/50 bg-fuchsia-300/10"
                              : "border-neutral-800 bg-black hover:border-neutral-600"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleAsset(asset.id)}
                            disabled={isBusy}
                            className="mt-1 h-4 w-4"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="font-black text-white">
                                {namesById.get(asset.entryId) ?? `Entry ${asset.entryId}`}
                              </span>
                              <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-neutral-400">
                                {assetLabel(asset)}
                              </span>
                            </span>
                            <span className="mt-1 block truncate text-sm text-neutral-500">
                              {asset.filename}
                            </span>
                            <span className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold">
                              <span
                                className={
                                  asset.attribution
                                    ? "text-emerald-300"
                                    : "text-amber-300"
                                }
                              >
                                {asset.attribution
                                  ? "Attribution ready"
                                  : "Attribution missing"}
                              </span>
                              <span
                                className={
                                  asset.sourceUrl
                                    ? "text-emerald-300"
                                    : "text-neutral-500"
                                }
                              >
                                {asset.sourceUrl ? "Source ready" : "Source missing"}
                              </span>
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          ) : (
            <section className="space-y-5">
              <div className="rounded-3xl border border-neutral-800 bg-neutral-950 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-xl font-black text-white">Storage integrity</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
                      Compare authenticated files in both media buckets with the rows referenced by Studio. The audit never deletes anything.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void runAudit()}
                    disabled={!isOnline || isBusy}
                    className="rounded-xl bg-fuchsia-200 px-4 py-3 text-sm font-black text-black transition hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isAuditBusy ? "Auditing…" : "Run Storage Audit"}
                  </button>
                </div>
              </div>

              {!audit ? (
                <div className="rounded-3xl border border-dashed border-neutral-700 bg-neutral-950 py-20 text-center">
                  <p className="text-4xl">🧹</p>
                  <p className="mt-4 font-black text-white">No audit run yet</p>
                  <p className="mt-2 text-sm text-neutral-500">
                    Run the audit after replacing or removing media, and before the final Studio release.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {[
                      ["Referenced rows", audit.referencedAssets],
                      ["Stored files", audit.storedObjects],
                      ["Orphaned files", audit.orphanedObjects.length],
                      ["Broken records", audit.missingAssets.length],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
                      >
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                          {label}
                        </p>
                        <p className="mt-2 text-3xl font-black text-white">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-3xl border border-neutral-800 bg-neutral-950 p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
                          Last checked
                        </p>
                        <p className="mt-1 font-black text-white">
                          {formatDate(audit.checkedAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void cleanup({
                              removeOrphanedObjects: true,
                              removeMissingAssetRows: false,
                            })
                          }
                          disabled={
                            !isOnline ||
                            isBusy ||
                            audit.orphanedObjects.length === 0
                          }
                          className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm font-black text-amber-100 transition hover:border-amber-200 disabled:opacity-40"
                        >
                          Remove orphaned files · {audit.orphanedObjects.length}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void cleanup({
                              removeOrphanedObjects: false,
                              removeMissingAssetRows: true,
                            })
                          }
                          disabled={
                            !isOnline ||
                            isBusy ||
                            audit.missingAssets.length === 0
                          }
                          className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-black text-red-100 transition hover:border-red-300 disabled:opacity-40"
                        >
                          Remove broken records · {audit.missingAssets.length}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void cleanup({
                              removeOrphanedObjects: true,
                              removeMissingAssetRows: true,
                            })
                          }
                          disabled={
                            !isOnline ||
                            isBusy ||
                            audit.orphanedObjects.length +
                              audit.missingAssets.length ===
                              0
                          }
                          className="rounded-xl bg-white px-4 py-3 text-sm font-black text-black transition hover:bg-neutral-200 disabled:opacity-40"
                        >
                          {isCleanupBusy ? "Cleaning…" : "Clean all safe issues"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {audit.orphanedObjects.length === 0 &&
                  audit.missingAssets.length === 0 ? (
                    <div className="rounded-3xl border border-emerald-300/25 bg-emerald-300/10 p-8 text-center">
                      <p className="text-3xl">✓</p>
                      <p className="mt-3 text-xl font-black text-emerald-100">
                        Media storage is clean
                      </p>
                      <p className="mt-2 text-sm text-emerald-100/70">
                        Every media row points to a stored file and every stored file is referenced.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-5 lg:grid-cols-2">
                      <IssueList
                        title="Orphaned Storage files"
                        description="Files exist in Storage but no media record references them. Removing them does not delete entry content."
                        emptyLabel="No orphaned files"
                        items={audit.orphanedObjects.map((object) => ({
                          id: `${object.bucket}:${object.objectPath}`,
                          title: object.filename,
                          detail: `${object.bucket} · ${object.objectPath}`,
                        }))}
                      />
                      <IssueList
                        title="Broken media records"
                        description="Studio has a media row, but the referenced Storage object is missing. Removing the row clears the broken preview."
                        emptyLabel="No broken records"
                        items={audit.missingAssets.map((asset) => ({
                          id: asset.id,
                          title: `${namesById.get(asset.entryId) ?? `Entry ${asset.entryId}`} · ${assetLabel(asset)}`,
                          detail: `${asset.bucket} · ${asset.objectPath}`,
                        }))}
                      />
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

type IssueListProps = {
  title: string;
  description: string;
  emptyLabel: string;
  items: Array<{ id: string; title: string; detail: string }>;
};

function IssueList({ title, description, emptyLabel, items }: IssueListProps) {
  return (
    <section className="rounded-3xl border border-neutral-800 bg-neutral-950 p-5">
      <h3 className="text-lg font-black text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-neutral-500">{description}</p>

      {items.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/5 p-4 text-sm font-bold text-emerald-200">
          {emptyLabel}
        </div>
      ) : (
        <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
          {items.slice(0, 100).map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-neutral-800 bg-black p-4"
            >
              <p className="font-black text-white">{item.title}</p>
              <p className="mt-1 break-all text-xs leading-5 text-neutral-500">
                {item.detail}
              </p>
            </div>
          ))}
          {items.length > 100 && (
            <p className="py-3 text-center text-xs font-bold text-neutral-500">
              Showing the first 100 of {items.length} issues.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

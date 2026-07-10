"use client";

import { useCallback, useMemo, useState } from "react";
import type { Entry, EntryStatus } from "@/types/entry";
import { entryStatusOptions } from "@/types/entry";
import { useEntries } from "@/hooks/useEntries";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { StatCard } from "@/components/dashboard/StatCard";
import { EntryCard } from "@/components/entries/EntryCard";
import { CaptureModal } from "@/components/entries/CaptureModal";
import { EntryEditorModal } from "@/components/entries/EntryEditorModal";

type WorkspaceMode =
  | "all"
  | "review"
  | "draft"
  | "publish"
  | "duplicates"
  | "trash";

function normalizeDuplicateKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getDuplicateKeys(entry: Entry) {
  const keys = new Set<string>();

  const wordKey = normalizeDuplicateKey(entry.word);
  const slugKey = normalizeDuplicateKey(entry.slug.replace(/-/g, " "));
  const alternateKeys = entry.alternateSpellings
    .split(/[,;/\n]/g)
    .map((spelling) => normalizeDuplicateKey(spelling))
    .filter(Boolean);

  if (wordKey) keys.add(wordKey);
  if (slugKey) keys.add(slugKey);

  alternateKeys.forEach((key) => keys.add(key));

  return Array.from(keys);
}

function buildDuplicateMatches(entries: Entry[]) {
  const keyMap = new Map<string, Entry[]>();

  entries.forEach((entry) => {
    getDuplicateKeys(entry).forEach((key) => {
      const existing = keyMap.get(key) ?? [];
      keyMap.set(key, [...existing, entry]);
    });
  });

  const duplicateMatches = new Map<string, string[]>();

  keyMap.forEach((matchedEntries) => {
    if (matchedEntries.length <= 1) return;

    matchedEntries.forEach((entry) => {
      const otherWords = matchedEntries
        .filter((matchedEntry) => matchedEntry.id !== entry.id)
        .map((matchedEntry) => matchedEntry.word);

      const currentMatches = duplicateMatches.get(entry.id) ?? [];

      duplicateMatches.set(
        entry.id,
        Array.from(new Set([...currentMatches, ...otherWords]))
      );
    });
  });

  return duplicateMatches;
}

function isDraftQueueEntry(entry: Entry) {
  if (entry.status === "Draft") return true;

  return entry.meanings.some(
    (meaning) => meaning.editorialStatus === "Draft"
  );
}

function isPublishQueueEntry(entry: Entry) {
  return entry.status === "Verified";
}

export default function Home() {
  const {
    entries,
    trashEntries,
    filteredEntries,
    filteredTrashEntries,
    filteredReviewQueueEntries,
    search,
    setSearch,
    addEntry,
    updateEntry,
    updateStatus,
    updateEntriesStatus,
    deleteEntry,
    deleteEntries,
    restoreEntry,
    restoreEntries,
    draftCount,
    reviewQueueCount,
    verifiedCount,
    publishedCount,
    trashCount,
    isLoading,
  } = useEntries();

  const [isCaptureOpen, setIsCaptureOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("all");
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);

  const duplicateMatchesByEntryId = useMemo(() => {
    return buildDuplicateMatches(entries);
  }, [entries]);

  const filteredDraftQueueEntries = useMemo(() => {
    return filteredEntries.filter(isDraftQueueEntry);
  }, [filteredEntries]);

  const filteredPublishQueueEntries = useMemo(() => {
    return filteredEntries.filter(isPublishQueueEntry);
  }, [filteredEntries]);

  const filteredDuplicateEntries = useMemo(() => {
    return filteredEntries.filter((entry) =>
      duplicateMatchesByEntryId.has(entry.id)
    );
  }, [filteredEntries, duplicateMatchesByEntryId]);

  const visibleEntries =
    workspaceMode === "review"
      ? filteredReviewQueueEntries
      : workspaceMode === "draft"
      ? filteredDraftQueueEntries
      : workspaceMode === "publish"
      ? filteredPublishQueueEntries
      : workspaceMode === "duplicates"
      ? filteredDuplicateEntries
      : workspaceMode === "trash"
      ? filteredTrashEntries
      : filteredEntries;

  const visibleTotal =
    workspaceMode === "trash" ? trashEntries.length : entries.length;

  const visibleEntryIds = useMemo(() => {
    return visibleEntries.map((entry) => entry.id);
  }, [visibleEntries]);

  const selectedVisibleEntryIds = useMemo(() => {
    return selectedEntryIds.filter((id) => visibleEntryIds.includes(id));
  }, [selectedEntryIds, visibleEntryIds]);

  const allVisibleSelected =
    visibleEntryIds.length > 0 &&
    visibleEntryIds.every((id) => selectedEntryIds.includes(id));

  const handleSaveEntry = useCallback(
    async function handleSaveEntry(updatedEntry: Entry) {
      await updateEntry(updatedEntry);
      setSelectedEntry(null);
    },
    [updateEntry]
  );

  const handleAutoSaveEntry = useCallback(
    async function handleAutoSaveEntry(updatedEntry: Entry) {
      await updateEntry(updatedEntry);
    },
    [updateEntry]
  );

  const handleDeleteEntry = useCallback(
    async function handleDeleteEntry(id: string) {
      await deleteEntry(id);
      setSelectedEntry(null);
      setSelectedEntryIds((currentIds) =>
        currentIds.filter((entryId) => entryId !== id)
      );
    },
    [deleteEntry]
  );

  const handleRestoreEntry = useCallback(
    async function handleRestoreEntry(id: string) {
      await restoreEntry(id);
      setSelectedEntryIds((currentIds) =>
        currentIds.filter((entryId) => entryId !== id)
      );
    },
    [restoreEntry]
  );

  function toggleEntrySelection(id: string) {
    setSelectedEntryIds((currentIds) =>
      currentIds.includes(id)
        ? currentIds.filter((entryId) => entryId !== id)
        : [...currentIds, id]
    );
  }

  function selectAllVisibleEntries() {
    setSelectedEntryIds((currentIds) => {
      const mergedIds = new Set([...currentIds, ...visibleEntryIds]);
      return Array.from(mergedIds);
    });
  }

  function deselectVisibleEntries() {
    setSelectedEntryIds((currentIds) =>
      currentIds.filter((id) => !visibleEntryIds.includes(id))
    );
  }

  function clearSelectedEntries() {
    setSelectedEntryIds([]);
  }

  async function handleBulkStatusChange(status: EntryStatus) {
    if (selectedVisibleEntryIds.length === 0) return;

    const confirmed = window.confirm(
      `Move ${selectedVisibleEntryIds.length} selected entr${
        selectedVisibleEntryIds.length === 1 ? "y" : "ies"
      } to ${status}?`
    );

    if (!confirmed) return;

    await updateEntriesStatus(selectedVisibleEntryIds, status);
    setSelectedEntryIds([]);
  }

  async function handleBulkDelete() {
    if (selectedVisibleEntryIds.length === 0) return;

    const confirmed = window.confirm(
      `Move ${selectedVisibleEntryIds.length} selected entr${
        selectedVisibleEntryIds.length === 1 ? "y" : "ies"
      } to Trash? You can restore them later.`
    );

    if (!confirmed) return;

    await deleteEntries(selectedVisibleEntryIds);
    setSelectedEntryIds([]);
  }

  async function handleBulkRestore() {
    if (selectedVisibleEntryIds.length === 0) return;

    const confirmed = window.confirm(
      `Restore ${selectedVisibleEntryIds.length} selected entr${
        selectedVisibleEntryIds.length === 1 ? "y" : "ies"
      } from Trash?`
    );

    if (!confirmed) return;

    await restoreEntries(selectedVisibleEntryIds);
    setSelectedEntryIds([]);
  }

  const workspaceTitle =
    workspaceMode === "review"
      ? "Review Queue"
      : workspaceMode === "draft"
      ? "Draft Queue"
      : workspaceMode === "publish"
      ? "Publish Queue"
      : workspaceMode === "duplicates"
      ? "Duplicate Detection"
      : workspaceMode === "trash"
      ? "Trash / Undo Delete"
      : "Entry Workspace";

  const workspaceDescription =
    workspaceMode === "review"
      ? "Focus only on entries that need editorial work."
      : workspaceMode === "draft"
      ? "Focus only on unfinished draft entries before they move into review."
      : workspaceMode === "publish"
      ? "Focus only on verified entries that are ready to publish."
      : workspaceMode === "duplicates"
      ? "Find possible duplicate entries based on word, slug, and alternate spellings."
      : workspaceMode === "trash"
      ? "Restore entries that were deleted by mistake."
      : "Search, open, edit, autosave, verify, publish, and delete captured slang.";

  return (
    <main className="min-h-screen bg-neutral-950 text-white lg:flex">
      <Sidebar />

      <section className="flex-1">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <header className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-2 text-sm font-bold uppercase tracking-[0.3em] text-yellow-400">
                Dashboard
              </p>
              <h1 className="text-4xl font-black tracking-tight md:text-6xl">
                The NYC Slang Lexicon
              </h1>
              <p className="mt-4 max-w-2xl text-neutral-400">
                Capture, review, verify, and publish the living language of New
                York City.
              </p>
            </div>

            <button
              onClick={() => setIsCaptureOpen(true)}
              className="rounded-xl bg-yellow-400 px-5 py-4 font-black text-black transition hover:scale-[1.01] hover:bg-yellow-300"
            >
              ➕ Capture Slang
            </button>
          </header>

          <section className="grid gap-4 md:grid-cols-4">
            <StatCard emoji="✅" label="Verified / Ready" value={verifiedCount} />
            <StatCard
              emoji="🧬"
              label="Possible Duplicates"
              value={duplicateMatchesByEntryId.size}
            />
            <StatCard emoji="🗑️" label="Trash" value={trashCount} />
            <StatCard emoji="🚀" label="Published" value={publishedCount} />
          </section>

          <section className="mt-10 rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
            <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-bold">{workspaceTitle}</h2>
                <p className="text-sm text-neutral-500">
                  {workspaceDescription}
                </p>
              </div>

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search deadass, brick, ocky..."
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400 md:max-w-sm"
              />
            </div>

            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap rounded-xl border border-neutral-800 bg-neutral-950 p-1">
                {[
                  ["all", "All Entries"],
                  ["review", "Review Queue"],
                  ["draft", "Draft Queue"],
                  ["publish", "Publish Queue"],
                  ["duplicates", "Duplicates"],
                  ["trash", "Trash"],
                ].map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => setWorkspaceMode(mode as WorkspaceMode)}
                    className={`rounded-lg px-4 py-2 text-sm font-black ${
                      workspaceMode === mode
                        ? "bg-yellow-400 text-black"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-400">
                Showing{" "}
                <span className="font-black text-white">
                  {visibleEntries.length}
                </span>{" "}
                of{" "}
                <span className="font-black text-white">{visibleTotal}</span>{" "}
                entries
              </div>
            </div>

            <div className="mb-5 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="font-black text-white">Bulk Actions</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Selected in this view:{" "}
                    <span className="font-black text-yellow-400">
                      {selectedVisibleEntryIds.length}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={
                      allVisibleSelected
                        ? deselectVisibleEntries
                        : selectAllVisibleEntries
                    }
                    disabled={visibleEntries.length === 0}
                    className="rounded-xl bg-neutral-800 px-4 py-3 text-sm font-black text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {allVisibleSelected ? "Deselect Visible" : "Select Visible"}
                  </button>

                  <button
                    onClick={clearSelectedEntries}
                    disabled={selectedEntryIds.length === 0}
                    className="rounded-xl bg-neutral-800 px-4 py-3 text-sm font-black text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {workspaceMode === "trash" ? (
                  <button
                    onClick={handleBulkRestore}
                    disabled={selectedVisibleEntryIds.length === 0}
                    className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Restore Selected
                  </button>
                ) : (
                  <>
                    {entryStatusOptions.map((status) => (
                      <button
                        key={status}
                        onClick={() => handleBulkStatusChange(status)}
                        disabled={selectedVisibleEntryIds.length === 0}
                        className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Move to {status}
                      </button>
                    ))}

                    <button
                      onClick={handleBulkDelete}
                      disabled={selectedVisibleEntryIds.length === 0}
                      className="rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Move to Trash
                    </button>
                  </>
                )}
              </div>
            </div>

            {workspaceMode === "trash" && (
              <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 p-4">
                <p className="font-black text-red-300">Trash Rules</p>
                <p className="mt-2 text-sm text-red-100/80">
                  Deleted entries appear here instead of being permanently
                  removed. Restore them to bring them back into the CMS.
                </p>
              </div>
            )}

            {isLoading ? (
              <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-neutral-500">
                Loading entries...
              </div>
            ) : visibleEntries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-neutral-500">
                {workspaceMode === "trash"
                  ? "Trash is empty."
                  : workspaceMode === "review"
                  ? "No review items. Everything in this view looks clean."
                  : workspaceMode === "draft"
                  ? "No draft items. Everything has moved beyond draft."
                  : workspaceMode === "publish"
                  ? "No verified entries ready to publish yet."
                  : workspaceMode === "duplicates"
                  ? "No potential duplicates found."
                  : entries.length === 0
                  ? "No entries yet. Capture your first word."
                  : "No matching entries found."}
              </div>
            ) : (
              <div className="space-y-3">
                {visibleEntries.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    onOpen={() => setSelectedEntry(entry)}
                    onStatusChange={(status) => updateStatus(entry.id, status)}
                    isSelected={selectedEntryIds.includes(entry.id)}
                    onToggleSelected={() => toggleEntrySelection(entry.id)}
                    duplicateMatches={
                      duplicateMatchesByEntryId.get(entry.id) ?? []
                    }
                    isDeleted={workspaceMode === "trash"}
                    onRestore={() => handleRestoreEntry(entry.id)}
                  />
                ))}
              </div>
            )}
          </section>

          <footer className="mt-10 border-t border-neutral-800 pt-6 text-sm text-neutral-500">
            YERRR Studio Alpha · 2.10 Undo Delete / Trash
          </footer>
        </div>
      </section>

      {isCaptureOpen && (
        <CaptureModal
          onClose={() => setIsCaptureOpen(false)}
          onSave={addEntry}
        />
      )}

      {selectedEntry && (
        <EntryEditorModal
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
          onSave={handleSaveEntry}
          onAutoSave={handleAutoSaveEntry}
          onDelete={handleDeleteEntry}
        />
      )}
    </main>
  );
}
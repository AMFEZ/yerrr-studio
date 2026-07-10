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

type WorkspaceMode = "all" | "review" | "draft" | "publish" | "duplicates";

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
    filteredEntries,
    filteredReviewQueueEntries,
    search,
    setSearch,
    addEntry,
    updateEntry,
    updateStatus,
    updateEntriesStatus,
    deleteEntry,
    deleteEntries,
    draftCount,
    reviewQueueCount,
    verifiedCount,
    publishedCount,
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
      : filteredEntries;

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
      `Delete ${selectedVisibleEntryIds.length} selected entr${
        selectedVisibleEntryIds.length === 1 ? "y" : "ies"
      }? This will also delete their meanings. This cannot be undone yet.`
    );

    if (!confirmed) return;

    await deleteEntries(selectedVisibleEntryIds);
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
            <StatCard emoji="🧐" label="Review Queue" value={reviewQueueCount} />
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
                <button
                  onClick={() => setWorkspaceMode("all")}
                  className={`rounded-lg px-4 py-2 text-sm font-black ${
                    workspaceMode === "all"
                      ? "bg-yellow-400 text-black"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  All Entries
                </button>

                <button
                  onClick={() => setWorkspaceMode("review")}
                  className={`rounded-lg px-4 py-2 text-sm font-black ${
                    workspaceMode === "review"
                      ? "bg-yellow-400 text-black"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  Review Queue
                </button>

                <button
                  onClick={() => setWorkspaceMode("draft")}
                  className={`rounded-lg px-4 py-2 text-sm font-black ${
                    workspaceMode === "draft"
                      ? "bg-yellow-400 text-black"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  Draft Queue
                </button>

                <button
                  onClick={() => setWorkspaceMode("publish")}
                  className={`rounded-lg px-4 py-2 text-sm font-black ${
                    workspaceMode === "publish"
                      ? "bg-yellow-400 text-black"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  Publish Queue
                </button>

                <button
                  onClick={() => setWorkspaceMode("duplicates")}
                  className={`rounded-lg px-4 py-2 text-sm font-black ${
                    workspaceMode === "duplicates"
                      ? "bg-yellow-400 text-black"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  Duplicates
                </button>
              </div>

              <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-400">
                Showing{" "}
                <span className="font-black text-white">
                  {visibleEntries.length}
                </span>{" "}
                of{" "}
                <span className="font-black text-white">{entries.length}</span>{" "}
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
                  Delete Selected
                </button>
              </div>
            </div>

            {workspaceMode === "review" && (
              <div className="mb-5 rounded-xl border border-orange-500/20 bg-orange-500/10 p-4">
                <p className="font-black text-orange-300">
                  Review Queue Rules
                </p>
                <p className="mt-2 text-sm text-orange-100/80">
                  Entries appear here if they are marked Needs Review, if a
                  meaning is marked Needs Review, or if important fields like
                  definition, example, plain English, tone, category, or usage
                  frequency are missing.
                </p>
              </div>
            )}

            {workspaceMode === "draft" && (
              <div className="mb-5 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4">
                <p className="font-black text-yellow-300">Draft Queue Rules</p>
                <p className="mt-2 text-sm text-yellow-100/80">
                  Entries appear here if the entry status is Draft or one of its
                  meanings is still marked Draft. Use this queue for early
                  cleanup before moving entries into review.
                </p>
              </div>
            )}

            {workspaceMode === "publish" && (
              <div className="mb-5 rounded-xl border border-green-500/20 bg-green-500/10 p-4">
                <p className="font-black text-green-300">
                  Publish Queue Rules
                </p>
                <p className="mt-2 text-sm text-green-100/80">
                  Entries appear here when their status is Verified. Use this
                  queue to do a final check before moving them to Published.
                </p>
              </div>
            )}

            {workspaceMode === "duplicates" && (
              <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 p-4">
                <p className="font-black text-red-300">
                  Duplicate Detection Rules
                </p>
                <p className="mt-2 text-sm text-red-100/80">
                  Entries appear here when another entry has the same normalized
                  word, slug, or alternate spelling. This does not delete
                  anything automatically — it only helps you review possible
                  duplicates.
                </p>
              </div>
            )}

            {isLoading ? (
              <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-neutral-500">
                Loading entries...
              </div>
            ) : visibleEntries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-neutral-500">
                {workspaceMode === "review"
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
                  />
                ))}
              </div>
            )}
          </section>

          <footer className="mt-10 border-t border-neutral-800 pt-6 text-sm text-neutral-500">
            YERRR Studio Alpha · 2.9.1 Bulk Delete
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
"use client";

import { useCallback, useMemo, useState } from "react";
import type { Entry } from "@/types/entry";
import { useEntries } from "@/hooks/useEntries";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { StatCard } from "@/components/dashboard/StatCard";
import { EntryCard } from "@/components/entries/EntryCard";
import { CaptureModal } from "@/components/entries/CaptureModal";
import { EntryEditorModal } from "@/components/entries/EntryEditorModal";

type WorkspaceMode = "all" | "review" | "draft";

function isDraftQueueEntry(entry: Entry) {
  if (entry.status === "Draft") return true;

  return entry.meanings.some(
    (meaning) => meaning.editorialStatus === "Draft"
  );
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
    deleteEntry,
    draftCount,
    reviewQueueCount,
    verifiedCount,
    archivedCount,
    isLoading,
  } = useEntries();

  const [isCaptureOpen, setIsCaptureOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("all");

  const filteredDraftQueueEntries = useMemo(() => {
    return filteredEntries.filter(isDraftQueueEntry);
  }, [filteredEntries]);

  const visibleEntries =
    workspaceMode === "review"
      ? filteredReviewQueueEntries
      : workspaceMode === "draft"
      ? filteredDraftQueueEntries
      : filteredEntries;

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
    },
    [deleteEntry]
  );

  const workspaceTitle =
    workspaceMode === "review"
      ? "Review Queue"
      : workspaceMode === "draft"
      ? "Draft Queue"
      : "Entry Workspace";

  const workspaceDescription =
    workspaceMode === "review"
      ? "Focus only on entries that need editorial work."
      : workspaceMode === "draft"
      ? "Focus only on unfinished draft entries before they move into review."
      : "Search, open, edit, autosave, verify, and delete captured slang.";

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
            <StatCard emoji="✅" label="Verified Entries" value={verifiedCount} />
            <StatCard emoji="✍️" label="Draft Queue" value={draftCount} />
            <StatCard emoji="🧐" label="Review Queue" value={reviewQueueCount} />
            <StatCard emoji="📦" label="Archived" value={archivedCount} />
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
                  meanings is still marked Draft. Use this queue for early cleanup
                  before moving entries into review.
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
                  />
                ))}
              </div>
            )}
          </section>

          <footer className="mt-10 border-t border-neutral-800 pt-6 text-sm text-neutral-500">
            YERRR Studio Alpha · 2.6 Draft Queue
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
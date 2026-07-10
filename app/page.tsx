"use client";

import { useState } from "react";
import type { Entry } from "@/types/entry";
import { useEntries } from "@/hooks/useEntries";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { StatCard } from "@/components/dashboard/StatCard";
import { EntryCard } from "@/components/entries/EntryCard";
import { CaptureModal } from "@/components/entries/CaptureModal";
import { EntryEditorModal } from "@/components/entries/EntryEditorModal";

export default function Home() {
  const {
    entries,
    filteredEntries,
    search,
    setSearch,
    addEntry,
    updateEntry,
    updateStatus,
    deleteEntry,
    draftCount,
    publishedCount,
    reviewCount,
    isLoading,
  } = useEntries();

  const [isCaptureOpen, setIsCaptureOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);

  async function handleSaveEntry(updatedEntry: Entry) {
    await updateEntry(updatedEntry);
    setSelectedEntry(null);
  }

  async function handleDeleteEntry(id: string) {
    await deleteEntry(id);
    setSelectedEntry(null);
  }

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
                Capture, review, and publish the living language of New York City.
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
            <StatCard emoji="📖" label="Published Lexicon" value={publishedCount} />
            <StatCard emoji="✍️" label="Captured Drafts" value={draftCount} />
            <StatCard emoji="🧐" label="Editorial Queue" value={reviewCount} />
            <StatCard emoji="📚" label="Total Entries" value={entries.length} />
          </section>

          <section className="mt-10 rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
            <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-bold">Entry Workspace</h2>
                <p className="text-sm text-neutral-500">
                  Search, open, edit, and delete captured slang.
                </p>
              </div>

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search deadass, brick, ocky..."
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400 md:max-w-sm"
              />
            </div>

            {isLoading ? (
              <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-neutral-500">
                Loading entries...
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-neutral-500">
                {entries.length === 0
                  ? "No entries yet. Capture your first word."
                  : "No matching entries found."}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredEntries.map((entry) => (
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
            YERRR Studio Alpha · 2.2 Delete Entry
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
          onDelete={handleDeleteEntry}
        />
      )}
    </main>
  );
}
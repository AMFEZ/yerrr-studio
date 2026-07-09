"use client";

import { useMemo, useState } from "react";

type EntryStatus = "Draft" | "Published" | "Needs Review";

type Entry = {
  id: number;
  word: string;
  type: string;
  status: EntryStatus;
};

const entryTypes = [
  "Word",
  "Phrase",
  "Expression",
  "Greeting",
  "Reaction",
  "Cultural Term",
];

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [word, setWord] = useState("");
  const [type, setType] = useState("Word");
  const [search, setSearch] = useState("");

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) =>
      entry.word.toLowerCase().includes(search.toLowerCase())
    );
  }, [entries, search]);

  const draftCount = entries.filter((entry) => entry.status === "Draft").length;
  const publishedCount = entries.filter(
    (entry) => entry.status === "Published"
  ).length;
  const reviewCount = entries.filter(
    (entry) => entry.status === "Needs Review"
  ).length;

  function addEntry() {
    if (!word.trim()) return;

    setEntries([
      {
        id: Date.now(),
        word: word.trim(),
        type,
        status: "Draft",
      },
      ...entries,
    ]);

    setWord("");
    setType("Word");
    setIsOpen(false);
  }

  function updateStatus(id: number, status: EntryStatus) {
    setEntries((currentEntries) =>
      currentEntries.map((entry) =>
        entry.id === id ? { ...entry, status } : entry
      )
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-10">
          <p className="mb-2 text-sm font-bold uppercase tracking-[0.3em] text-yellow-400">
            YERRR Studio
          </p>
          <h1 className="text-4xl font-black tracking-tight md:text-6xl">
            The NYC Slang Lexicon
          </h1>
          <p className="mt-4 max-w-2xl text-neutral-400">
            Capture, review, and publish the living language of New York City.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <Stat emoji="📖" label="Published Lexicon" value={publishedCount} />
          <Stat emoji="✍️" label="Captured Drafts" value={draftCount} />
          <Stat emoji="🧐" label="Editorial Queue" value={reviewCount} />
          <Stat emoji="📚" label="Total Entries" value={entries.length} />
        </section>

        <section className="mt-10 grid gap-6 md:grid-cols-[1.5fr_1fr]">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
            <h2 className="mb-4 text-xl font-bold">Lexicon Search</h2>

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search deadass, brick, ocky..."
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400"
            />

            <div className="mt-8">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-neutral-500">
                Entries
              </h3>

              {filteredEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-neutral-500">
                  {entries.length === 0
                    ? "No entries yet. Capture your first word."
                    : "No matching entries found."}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-xl border border-neutral-800 bg-neutral-950 p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-lg font-black">{entry.word}</p>
                          <p className="text-sm text-neutral-500">
                            {entry.type}
                          </p>
                        </div>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            entry.status === "Draft"
                              ? "bg-yellow-400 text-black"
                              : entry.status === "Needs Review"
                              ? "bg-orange-500 text-black"
                              : "bg-emerald-500 text-black"
                          }`}
                        >
                          {entry.status}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          onClick={() => updateStatus(entry.id, "Draft")}
                          className="rounded-lg bg-neutral-800 px-3 py-2 text-xs font-bold hover:bg-neutral-700"
                        >
                          Draft
                        </button>
                        <button
                          onClick={() =>
                            updateStatus(entry.id, "Needs Review")
                          }
                          className="rounded-lg bg-neutral-800 px-3 py-2 text-xs font-bold hover:bg-neutral-700"
                        >
                          Needs Review
                        </button>
                        <button
                          onClick={() => updateStatus(entry.id, "Published")}
                          className="rounded-lg bg-neutral-800 px-3 py-2 text-xs font-bold hover:bg-neutral-700"
                        >
                          Publish
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
            <h2 className="mb-4 text-xl font-bold">Quick Actions</h2>

            <div className="space-y-3">
              <button
                onClick={() => setIsOpen(true)}
                className="w-full rounded-xl bg-yellow-400 px-4 py-3 text-left font-black text-black transition hover:scale-[1.01] hover:bg-yellow-300"
              >
                ➕ Capture Slang
              </button>

              {["Browse Lexicon", "Concept Explorer", "Review Queue", "Settings"].map(
                (action) => (
                  <button
                    key={action}
                    className="w-full rounded-xl bg-neutral-800 px-4 py-3 text-left font-bold text-white transition hover:scale-[1.01] hover:bg-neutral-700"
                  >
                    {action}
                  </button>
                )
              )}
            </div>
          </div>
        </section>

        <footer className="mt-10 border-t border-neutral-800 pt-6 text-sm text-neutral-500">
          YERRR Studio Alpha · 0.0.3
        </footer>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
            <h2 className="text-2xl font-black">Capture Slang</h2>
            <p className="mt-2 text-sm text-neutral-400">
              Save the word now. Define it later.
            </p>

            <label className="mt-6 block text-sm font-bold text-neutral-300">
              Word or Phrase
            </label>
            <input
              value={word}
              onChange={(event) => setWord(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") addEntry();
              }}
              placeholder="Mixy"
              className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400"
            />

            <label className="mt-4 block text-sm font-bold text-neutral-300">
              Type
            </label>
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-yellow-400"
            >
              {entryTypes.map((entryType) => (
                <option key={entryType}>{entryType}</option>
              ))}
            </select>

            <div className="mt-6 flex gap-3">
              <button
                onClick={addEntry}
                className="flex-1 rounded-xl bg-yellow-400 px-4 py-3 font-black text-black hover:bg-yellow-300"
              >
                Save Draft
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="flex-1 rounded-xl bg-neutral-800 px-4 py-3 font-bold text-white hover:bg-neutral-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Stat({
  emoji,
  label,
  value,
}: {
  emoji: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
      <div className="text-3xl">{emoji}</div>
      <p className="mt-4 text-3xl font-black">{value}</p>
      <p className="text-sm text-neutral-400">{label}</p>
    </div>
  );
}
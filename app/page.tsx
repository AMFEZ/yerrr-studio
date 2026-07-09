"use client";

import { useState } from "react";

type Entry = {
  id: number;
  word: string;
  type: string;
};

const stats = [
  { label: "Entries", emoji: "📚" },
  { label: "Concepts", emoji: "🧠" },
  { label: "Drafts", emoji: "📝" },
  { label: "Needs Review", emoji: "⚠️" },
];

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [word, setWord] = useState("");
  const [type, setType] = useState("Word");

  function addEntry() {
    if (!word.trim()) return;

    setEntries([
      { id: Date.now(), word: word.trim(), type },
      ...entries,
    ]);

    setWord("");
    setType("Word");
    setIsOpen(false);
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
            Your private workspace for building, editing, and preserving the
            living language of New York City.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5"
            >
              <div className="text-3xl">{stat.emoji}</div>
              <p className="mt-4 text-3xl font-black">
                {stat.label === "Entries" ? entries.length : 0}
              </p>
              <p className="text-sm text-neutral-400">{stat.label}</p>
            </div>
          ))}
        </section>

        <section className="mt-10 grid gap-6 md:grid-cols-[1.5fr_1fr]">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
            <h2 className="mb-4 text-xl font-bold">Search Lexicon</h2>
            <input
              placeholder="Search deadass, brick, ocky..."
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400"
            />

            <div className="mt-8">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-neutral-500">
                Entries
              </h3>

              {entries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-neutral-500">
                  No entries yet. Add your first word.
                </div>
              ) : (
                <div className="space-y-3">
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-xl border border-neutral-800 bg-neutral-950 p-4"
                    >
                      <p className="text-lg font-black">{entry.word}</p>
                      <p className="text-sm text-neutral-500">{entry.type}</p>
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
                className="w-full rounded-xl bg-yellow-400 px-4 py-3 text-left font-bold text-black transition hover:scale-[1.01] hover:bg-yellow-300"
              >
                ➕ New Entry
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
          YERRR Studio Alpha · 0.0.2
        </footer>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
            <h2 className="text-2xl font-black">Add New Entry</h2>
            <p className="mt-2 text-sm text-neutral-400">
              Capture a word or phrase before you forget it.
            </p>

            <label className="mt-6 block text-sm font-bold text-neutral-300">
              Word or Phrase
            </label>
            <input
              value={word}
              onChange={(e) => setWord(e.target.value)}
              placeholder="Geeked"
              className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400"
            />

            <label className="mt-4 block text-sm font-bold text-neutral-300">
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-yellow-400"
            >
              <option>Word</option>
              <option>Phrase</option>
              <option>Expression</option>
              <option>Greeting</option>
              <option>Reaction</option>
              <option>Cultural Term</option>
            </select>

            <div className="mt-6 flex gap-3">
              <button
                onClick={addEntry}
                className="flex-1 rounded-xl bg-yellow-400 px-4 py-3 font-black text-black hover:bg-yellow-300"
              >
                Save Entry
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
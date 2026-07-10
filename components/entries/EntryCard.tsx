"use client";

import type { Entry, EntryStatus } from "@/types/entry";
import { entryStatusOptions } from "@/types/entry";
import { StatusBadge } from "@/components/ui/StatusBadge";

export function EntryCard({
  entry,
  onOpen,
  onStatusChange,
}: {
  entry: Entry;
  onOpen: () => void;
  onStatusChange: (status: EntryStatus) => void;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 transition hover:border-yellow-400/60">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <button onClick={onOpen} className="flex-1 text-left">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-2xl font-black">{entry.word}</h3>
            <StatusBadge status={entry.status} />
            {entry.featured && (
              <span className="rounded-full bg-yellow-400 px-3 py-1 text-xs font-black uppercase tracking-wide text-black">
                Featured
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-neutral-500">
  {entry.type}
  {entry.partOfSpeech ? ` · ${entry.partOfSpeech}` : ""}
</p>

          {entry.pronunciation && (
            <p className="mt-2 text-sm text-yellow-300">
              Pronunciation: {entry.pronunciation}
            </p>
          )}

          {entry.meanings.length > 0 && (
            <div className="mt-4 space-y-3">
              {entry.meanings.slice(0, 2).map((meaning, index) => (
                <div key={meaning.id} className="rounded-xl bg-neutral-900 p-4">
                  <p className="text-sm font-black text-yellow-400">
                    Meaning #{index + 1}
                    {meaning.title ? ` · ${meaning.title}` : ""}
                  </p>

                  <p className="mt-2 text-sm text-neutral-300">
                    {meaning.definition || "No definition yet."}
                  </p>

                  {meaning.example && (
                    <p className="mt-2 text-sm italic text-neutral-500">
                      “{meaning.example}”
                    </p>
                  )}
                </div>
              ))}

              {entry.meanings.length > 2 && (
                <p className="text-xs font-bold text-neutral-500">
                  + {entry.meanings.length - 2} more meaning
                  {entry.meanings.length - 2 === 1 ? "" : "s"}
                </p>
              )}
            </div>
          )}
        </button>

        <div className="flex flex-col gap-3 md:w-48">
          <select
            value={entry.status}
            onChange={(event) =>
              onStatusChange(event.target.value as EntryStatus)
            }
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-bold text-white outline-none focus:border-yellow-400"
          >
            {entryStatusOptions.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>

          <button
            onClick={onOpen}
            className="rounded-xl bg-neutral-800 px-4 py-3 text-sm font-black text-white hover:bg-neutral-700"
          >
            Open Editor
          </button>
        </div>
      </div>
    </div>
  );
}
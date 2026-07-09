import type { Entry, EntryStatus } from "@/types/entry";
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
    <div
      onClick={onOpen}
      className="cursor-pointer rounded-xl border border-neutral-800 bg-neutral-950 p-4 transition hover:border-yellow-400/60 hover:bg-neutral-900"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-black">{entry.word}</p>
          <p className="text-sm text-neutral-500">
            {entry.type} · {entry.meanings.length} meaning
            {entry.meanings.length === 1 ? "" : "s"}
          </p>

          {entry.meanings.some((meaning) => meaning.definition) && (
            <div className="mt-3 space-y-2">
              {entry.meanings.map((meaning, index) =>
                meaning.definition ? (
                  <div key={meaning.id} className="text-sm text-neutral-300">
                    <span className="font-bold text-yellow-400">
                      {index + 1}. {meaning.title || "Untitled"}
                    </span>
                    <p>{meaning.definition}</p>
                  </div>
                ) : null
              )}
            </div>
          )}
        </div>

        <StatusBadge status={entry.status} />
      </div>

      <div
        onClick={(event) => event.stopPropagation()}
        className="mt-4 flex flex-wrap gap-2"
      >
        <button
          onClick={() => onStatusChange("Draft")}
          className="rounded-lg bg-neutral-800 px-3 py-2 text-xs font-bold hover:bg-neutral-700"
        >
          Draft
        </button>
        <button
          onClick={() => onStatusChange("Needs Review")}
          className="rounded-lg bg-neutral-800 px-3 py-2 text-xs font-bold hover:bg-neutral-700"
        >
          Needs Review
        </button>
        <button
          onClick={() => onStatusChange("Published")}
          className="rounded-lg bg-neutral-800 px-3 py-2 text-xs font-bold hover:bg-neutral-700"
        >
          Publish
        </button>
      </div>
    </div>
  );
}
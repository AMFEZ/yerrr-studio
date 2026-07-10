"use client";

import type { Entry, EntryStatus, Meaning } from "@/types/entry";
import { entryStatusOptions } from "@/types/entry";
import { StatusBadge } from "@/components/ui/StatusBadge";

function getMissingMeaningFields(meaning: Meaning) {
  const missingFields: string[] = [];

  if (!meaning.title.trim()) missingFields.push("title");
  if (!meaning.definition.trim()) missingFields.push("definition");
  if (!meaning.example.trim()) missingFields.push("example");
  if (!meaning.plainEnglish.trim()) missingFields.push("plain English");
  if (!meaning.category.trim()) missingFields.push("category");
  if (!meaning.tone.trim()) missingFields.push("tone");
  if (!meaning.usageFrequency.trim()) missingFields.push("usage frequency");

  return missingFields;
}

function getReviewReasons(entry: Entry) {
  const reasons: string[] = [];

  if (entry.status === "Needs Review") {
    reasons.push("Entry status is marked Needs Review.");
  }

  if (entry.meanings.length === 0) {
    reasons.push("Entry has no meanings.");
  }

  entry.meanings.forEach((meaning, index) => {
    if (meaning.editorialStatus === "Needs Review") {
      reasons.push(`Meaning #${index + 1} is marked Needs Review.`);
    }

    const missingFields = getMissingMeaningFields(meaning);

    if (missingFields.length > 0) {
      reasons.push(
        `Meaning #${index + 1} is missing: ${missingFields.join(", ")}.`
      );
    }
  });

  return reasons;
}

function getEntryReviewScore(entry: Entry) {
  let totalFields = 2;
  let completedFields = 0;

  if (entry.word.trim()) completedFields++;
  if (entry.type.trim()) completedFields++;

  entry.meanings.forEach((meaning) => {
    totalFields += 7;

    if (meaning.title.trim()) completedFields++;
    if (meaning.definition.trim()) completedFields++;
    if (meaning.example.trim()) completedFields++;
    if (meaning.plainEnglish.trim()) completedFields++;
    if (meaning.category.trim()) completedFields++;
    if (meaning.tone.trim()) completedFields++;
    if (meaning.usageFrequency.trim()) completedFields++;
  });

  return Math.round((completedFields / totalFields) * 100);
}

function getWorkflowAction(status: EntryStatus): {
  label: string;
  nextStatus: EntryStatus;
  helper: string;
} {
  if (status === "Draft") {
    return {
      label: "Send to Review",
      nextStatus: "Needs Review",
      helper: "Move this draft into the editorial review queue.",
    };
  }

  if (status === "Needs Review") {
    return {
      label: "Verify Entry",
      nextStatus: "Verified",
      helper: "Mark this entry as checked and ready for publishing.",
    };
  }

  if (status === "Verified") {
    return {
      label: "Publish Entry",
      nextStatus: "Published",
      helper: "Make this entry part of the published lexicon.",
    };
  }

  if (status === "Published") {
    return {
      label: "Archive Entry",
      nextStatus: "Archived",
      helper: "Remove this from active publishing without deleting it.",
    };
  }

  return {
    label: "Restore Draft",
    nextStatus: "Draft",
    helper: "Bring this archived entry back into editing.",
  };
}

export function EntryCard({
  entry,
  onOpen,
  onStatusChange,
}: {
  entry: Entry;
  onOpen: () => void;
  onStatusChange: (status: EntryStatus) => void;
}) {
  const reviewReasons = getReviewReasons(entry);
  const reviewScore = getEntryReviewScore(entry);
  const workflowAction = getWorkflowAction(entry.status);

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

            {reviewReasons.length > 0 && (
              <span className="rounded-full bg-orange-500/20 px-3 py-1 text-xs font-black uppercase tracking-wide text-orange-300">
                Review Needed
              </span>
            )}

            {entry.status === "Verified" && (
              <span className="rounded-full bg-green-500/20 px-3 py-1 text-xs font-black uppercase tracking-wide text-green-300">
                Ready to Publish
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-neutral-500">
            {entry.type}
            {entry.partOfSpeech ? ` · ${entry.partOfSpeech}` : ""}
            {entry.lifecycle ? ` · ${entry.lifecycle}` : ""}
          </p>

          {entry.pronunciation && (
            <p className="mt-2 text-sm text-yellow-300">
              Pronunciation: {entry.pronunciation}
            </p>
          )}

          <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-black text-neutral-300">
                Review Completion
              </p>
              <p className="text-sm font-black text-yellow-400">
                {reviewScore}%
              </p>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full rounded-full bg-yellow-400"
                style={{ width: `${reviewScore}%` }}
              />
            </div>
          </div>

          {reviewReasons.length > 0 && (
            <div className="mt-4 rounded-xl border border-orange-500/20 bg-orange-500/10 p-4">
              <p className="text-sm font-black text-orange-300">
                Review Needs
              </p>

              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-orange-100/80">
                {reviewReasons.slice(0, 4).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>

              {reviewReasons.length > 4 && (
                <p className="mt-2 text-xs font-bold text-orange-200/70">
                  + {reviewReasons.length - 4} more review item
                  {reviewReasons.length - 4 === 1 ? "" : "s"}
                </p>
              )}
            </div>
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

        <div className="flex flex-col gap-3 md:w-56">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-neutral-500">
              Workflow
            </p>

            <button
              onClick={() => onStatusChange(workflowAction.nextStatus)}
              className="mt-3 w-full rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-black hover:bg-yellow-300"
            >
              {workflowAction.label}
            </button>

            <p className="mt-2 text-xs text-neutral-500">
              {workflowAction.helper}
            </p>
          </div>

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
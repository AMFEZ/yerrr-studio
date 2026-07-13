"use client";

import { useMemo } from "react";

import type { Entry } from "@/types/entry";

type AIWorkflowCenterPanelProps = {
  entries: Entry[];

  reviewQueueCount: number;
  draftCount: number;
  verifiedCount: number;
  publishedCount: number;
  duplicateCount: number;

  onClose: () => void;
  onOpenAssistant: () => void;
  onOpenBatchTriage: () => void;
  onOpenDuplicateReview: () => void;
  onOpenRelationshipSuggestions: () => void;
  onOpenEntryForMissingFields: (
    entry: Entry,
  ) => void;
};

type EntryGapItem = {
  entry: Entry;
  score: number;
  missingLabels: string[];
};

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function readField(
  source: unknown,
  aliases: string[],
) {
  if (
    !source ||
    typeof source !== "object" ||
    Array.isArray(source)
  ) {
    return "";
  }

  const aliasSet = new Set(
    aliases.map(normalizeKey),
  );

  for (const [key, value] of Object.entries(
    source as Record<string, unknown>,
  )) {
    if (!aliasSet.has(normalizeKey(key))) {
      continue;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return String(value).trim();
    }
  }

  return "";
}

function inspectEntryGaps(
  entry: Entry,
): EntryGapItem {
  let score = 0;
  const missingLabels = new Set<string>();

  if (
    !String(
      entry.pronunciation ?? "",
    ).trim()
  ) {
    score += 4;
    missingLabels.add("Pronunciation");
  }

  if (
    !String(
      entry.alternateSpellings ?? "",
    ).trim()
  ) {
    score += 2;
    missingLabels.add(
      "Alternate spellings",
    );
  }

  const meanings = Array.isArray(
    entry.meanings,
  )
    ? entry.meanings
    : [];

  if (meanings.length === 0) {
    return {
      entry,
      score: 100,
      missingLabels: [
        "Meanings",
        "Definition",
        "Plain English",
        "Example",
        "Cultural context",
      ],
    };
  }

  meanings.forEach((meaning) => {
    const definition = readField(
      meaning,
      [
        "definition",
        "meaning",
        "gloss",
      ],
    );

    const plainEnglish = readField(
      meaning,
      [
        "plainEnglish",
        "plain_english",
        "plainMeaning",
      ],
    );

    const example = readField(
      meaning,
      [
        "example",
        "exampleSentence",
        "example_sentence",
        "usageExample",
        "usage_example",
      ],
    );

    const culturalContext = readField(
      meaning,
      [
        "culturalContext",
        "cultural_context",
        "culture",
        "context",
      ],
    );

    const partOfSpeech = readField(
      meaning,
      [
        "partOfSpeech",
        "part_of_speech",
        "pos",
        "grammar",
        "type",
      ],
    );

    const tone = readField(
      meaning,
      [
        "tone",
        "tones",
      ],
    );

    const sources = readField(
      meaning,
      [
        "sources",
        "source",
        "citations",
        "references",
      ],
    );

    const verificationStatus =
      readField(
        meaning,
        [
          "verificationStatus",
          "verification_status",
          "verified",
        ],
      );

    if (!definition) {
      score += 30;
      missingLabels.add("Definition");
    }

    if (!plainEnglish) {
      score += 10;
      missingLabels.add("Plain English");
    }

    if (!example) {
      score += 8;
      missingLabels.add("Example");
    }

    if (!culturalContext) {
      score += 8;
      missingLabels.add(
        "Cultural context",
      );
    }

    if (!partOfSpeech) {
      score += 6;
      missingLabels.add(
        "Part of speech",
      );
    }

    if (!tone) {
      score += 5;
      missingLabels.add("Tone");
    }

    if (!sources) {
      score += 12;
      missingLabels.add("Sources");
    }

    if (!verificationStatus) {
      score += 8;
      missingLabels.add(
        "Verification status",
      );
    }
  });

  return {
    entry,
    score,
    missingLabels: Array.from(
      missingLabels,
    ),
  };
}

function StatBox({
  value,
  label,
  valueClassName = "text-white",
}: {
  value: number;
  label: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-center">
      <p
        className={`text-2xl font-black ${valueClassName}`}
      >
        {value}
      </p>

      <p className="mt-1 text-[9px] font-black uppercase tracking-[0.15em] text-neutral-600">
        {label}
      </p>
    </div>
  );
}

export function AIWorkflowCenterPanel({
  entries,
  reviewQueueCount,
  draftCount,
  verifiedCount,
  publishedCount,
  duplicateCount,
  onClose,
  onOpenAssistant,
  onOpenBatchTriage,
  onOpenDuplicateReview,
  onOpenRelationshipSuggestions,
  onOpenEntryForMissingFields,
}: AIWorkflowCenterPanelProps) {
  const incompleteEntries = useMemo(() => {
    return entries
      .map(inspectEntryGaps)
      .filter(
        (item) => item.score > 0,
      )
      .sort(
        (first, second) =>
          second.score - first.score ||
          first.entry.word.localeCompare(
            second.entry.word,
          ),
      )
      .slice(0, 5);
  }, [entries]);

  const topIncompleteEntry =
    incompleteEntries[0] ?? null;

  const completionPercent =
    entries.length === 0
      ? 0
      : Math.round(
          (verifiedCount /
            entries.length) *
            100,
        );

  return (
    <div
      className="fixed inset-0 z-[85] bg-black/80 backdrop-blur-sm"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close AI Workflow Center"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-workflow-center-title"
        className="absolute bottom-0 right-0 flex h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-neutral-800 bg-neutral-950 shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-w-5xl md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0"
      >
        <header className="border-b border-neutral-800 bg-neutral-950/95 p-5 backdrop-blur sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-400">
                Alpha 5.11
              </p>

              <h2
                id="ai-workflow-center-title"
                className="mt-2 text-2xl font-black text-white sm:text-3xl"
              >
                AI Workflow Center
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
                Launch every YERRR Studio AI
                editorial workflow from one
                place. All database changes
                remain human-controlled.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-black text-neutral-300 hover:border-red-400 hover:text-red-200"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="space-y-6">
            <section className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-5">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-yellow-200">
                    Lexicon intelligence
                  </p>

                  <p className="mt-2 text-3xl font-black text-white">
                    {entries.length} active entries
                  </p>

                  <p className="mt-2 text-sm leading-6 text-yellow-100/70">
                    {completionPercent}% of active
                    entries currently have
                    Verified status.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[500px]">
                  <StatBox
                    value={reviewQueueCount}
                    label="Review"
                    valueClassName="text-fuchsia-200"
                  />

                  <StatBox
                    value={draftCount}
                    label="Drafts"
                    valueClassName="text-yellow-200"
                  />

                  <StatBox
                    value={duplicateCount}
                    label="Duplicates"
                    valueClassName="text-cyan-200"
                  />

                  <StatBox
                    value={publishedCount}
                    label="Published"
                    valueClassName="text-green-200"
                  />
                </div>
              </div>
            </section>

            <section>
              <div className="mb-3">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500">
                  Editorial AI tools
                </p>

                <p className="mt-2 text-sm text-neutral-600">
                  Choose the workflow that matches
                  the editorial task.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <article className="rounded-3xl border border-yellow-400/20 bg-yellow-400/5 p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-yellow-400/15 text-2xl">
                      🤖
                    </div>

                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.15em] text-yellow-300">
                        Assistant
                      </p>

                      <h3 className="mt-1 text-xl font-black text-white">
                        Chat & Entry Review
                      </h3>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-neutral-400">
                    Ask questions about the
                    lexicon, run structured entry
                    reviews, inspect review
                    history, approve suggestions,
                    and send plans to the Entry
                    Editor.
                  </p>

                  <button
                    type="button"
                    onClick={onOpenAssistant}
                    className="mt-5 w-full rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-black hover:bg-yellow-300"
                  >
                    Open AI Assistant
                  </button>
                </article>

                <article className="rounded-3xl border border-violet-400/20 bg-violet-400/5 p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-400/15 text-2xl">
                      ✨
                    </div>

                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.15em] text-violet-300">
                        Entry completion
                      </p>

                      <h3 className="mt-1 text-xl font-black text-white">
                        Fill Missing Fields
                      </h3>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-neutral-400">
                    Open an incomplete entry and
                    generate conservative drafts
                    only for fields that are
                    currently empty.
                  </p>

                  {topIncompleteEntry ? (
                    <div className="mt-4 rounded-2xl border border-violet-400/15 bg-neutral-950 p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-neutral-600">
                        Suggested entry
                      </p>

                      <p className="mt-2 font-black text-white">
                        {
                          topIncompleteEntry
                            .entry.word
                        }
                      </p>

                      <p className="mt-2 text-xs leading-5 text-neutral-500">
                        Missing:{" "}
                        {topIncompleteEntry.missingLabels
                          .slice(0, 4)
                          .join(", ")}
                        {topIncompleteEntry
                          .missingLabels.length >
                        4
                          ? "…"
                          : ""}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-green-400/15 bg-green-400/5 p-4">
                      <p className="text-sm font-black text-green-100">
                        No obvious missing fields
                        detected.
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={!topIncompleteEntry}
                    onClick={() => {
                      if (!topIncompleteEntry) {
                        return;
                      }

                      onOpenEntryForMissingFields(
                        topIncompleteEntry.entry,
                      );
                    }}
                    className="mt-5 w-full rounded-xl bg-violet-300 px-4 py-3 text-sm font-black text-black hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Open suggested entry
                  </button>
                </article>

                <article className="rounded-3xl border border-fuchsia-400/20 bg-fuchsia-400/5 p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-400/15 text-2xl">
                      📋
                    </div>

                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.15em] text-fuchsia-300">
                        Queue management
                      </p>

                      <h3 className="mt-1 text-xl font-black text-white">
                        Batch Editorial Triage
                      </h3>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-neutral-400">
                    Select up to 20 entries and
                    produce a prioritized editorial
                    worklist with readiness scores,
                    issues, and recommended next
                    actions.
                  </p>

                  <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                    <p className="text-2xl font-black text-fuchsia-200">
                      {reviewQueueCount}
                    </p>

                    <p className="mt-1 text-[10px] font-black uppercase tracking-[0.15em] text-neutral-600">
                      Entries in review queue
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={onOpenBatchTriage}
                    className="mt-5 w-full rounded-xl bg-fuchsia-300 px-4 py-3 text-sm font-black text-black hover:bg-fuchsia-200"
                  >
                    Open Batch Triage
                  </button>
                </article>

                <article className="rounded-3xl border border-cyan-400/20 bg-cyan-400/5 p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-400/15 text-2xl">
                      🧬
                    </div>

                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.15em] text-cyan-300">
                        Data quality
                      </p>

                      <h3 className="mt-1 text-xl font-black text-white">
                        Semantic Duplicate Review
                      </h3>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-neutral-400">
                    Compare definitions and usage
                    to distinguish real duplicates
                    from slang that is merely
                    related or conceptually
                    similar.
                  </p>

                  <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                    <p className="text-2xl font-black text-cyan-200">
                      {duplicateCount}
                    </p>

                    <p className="mt-1 text-[10px] font-black uppercase tracking-[0.15em] text-neutral-600">
                      Exact duplicate flags
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={onOpenDuplicateReview}
                    className="mt-5 w-full rounded-xl bg-cyan-300 px-4 py-3 text-sm font-black text-black hover:bg-cyan-200"
                  >
                    Open Duplicate Review
                  </button>
                </article>

                <article className="rounded-3xl border border-emerald-400/20 bg-emerald-400/5 p-5 md:col-span-2">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/15 text-2xl">
                        🕸️
                      </div>

                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.15em] text-emerald-300">
                          Knowledge Graph
                        </p>

                        <h3 className="mt-1 text-xl font-black text-white">
                          Relationship Suggestions
                        </h3>
                      </div>
                    </div>

                    <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-200">
                      Manual save only
                    </span>
                  </div>

                  <p className="mt-4 max-w-3xl text-sm leading-6 text-neutral-400">
                    Analyze likely semantic
                    connections, approve or reject
                    suggested relationships, and
                    send an approved reference plan
                    into the Cloud Relationship
                    Editor.
                  </p>

                  <button
                    type="button"
                    onClick={
                      onOpenRelationshipSuggestions
                    }
                    className="mt-5 w-full rounded-xl bg-emerald-300 px-4 py-3 text-sm font-black text-black hover:bg-emerald-200"
                  >
                    Open Relationship Suggestions
                  </button>
                </article>
              </div>
            </section>

            <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500">
                Suggested incomplete entries
              </p>

              {incompleteEntries.length === 0 ? (
                <p className="mt-4 text-sm text-neutral-500">
                  Local completeness checks did
                  not find an obvious incomplete
                  entry.
                </p>
              ) : (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {incompleteEntries.map(
                    (item) => (
                      <button
                        type="button"
                        key={item.entry.id}
                        onClick={() =>
                          onOpenEntryForMissingFields(
                            item.entry,
                          )
                        }
                        className="flex items-center justify-between gap-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-left transition hover:border-violet-400"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-black text-white">
                            {item.entry.word}
                          </p>

                          <p className="mt-1 truncate text-xs text-neutral-500">
                            {item.missingLabels
                              .slice(0, 3)
                              .join(", ")}
                          </p>
                        </div>

                        <span className="shrink-0 rounded-full bg-violet-400/15 px-3 py-1 text-xs font-black text-violet-200">
                          {item.score}
                        </span>
                      </button>
                    ),
                  )}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
              <p className="font-black text-yellow-100">
                Human editorial control
              </p>

              <p className="mt-2 text-sm leading-6 text-yellow-100/70">
                The Workflow Center only launches
                existing tools. It does not edit
                entries, publish records, merge
                duplicates, or create Knowledge
                Graph relationships.
              </p>
            </section>
          </div>
        </div>

        <footer className="border-t border-neutral-800 bg-neutral-950 p-4 sm:p-5">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-black text-neutral-300 hover:border-neutral-500 hover:text-white"
          >
            Close Workflow Center
          </button>
        </footer>
      </aside>
    </div>
  );
}

export default AIWorkflowCenterPanel;
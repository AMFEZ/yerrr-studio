"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import type { Entry, Meaning } from "@/types/entry";

type ContentCompletionDashboardProps = {
  isOpen: boolean;
  onClose: () => void;
  entries: Entry[];
  onOpenEntry: (entry: Entry) => void;
};

type CompletionView = "all" | "complete" | "needs-work";

type RequiredFieldKey =
  | "word"
  | "type"
  | "slug"
  | "pronunciation"
  | "partOfSpeech"
  | "meaningTitle"
  | "definition"
  | "example"
  | "category"
  | "tone"
  | "concepts"
  | "usageFrequency";

type RequiredFieldDefinition = {
  key: RequiredFieldKey;
  label: string;
  scope: "entry" | "meaning";
};

type EntryCompletion = {
  entry: Entry;
  score: number;
  completedChecks: number;
  totalChecks: number;
  missingFields: RequiredFieldKey[];
  missingLabels: string[];
  isComplete: boolean;
};

const REQUIRED_FIELDS: RequiredFieldDefinition[] = [
  { key: "word", label: "Word / Phrase", scope: "entry" },
  { key: "type", label: "Type", scope: "entry" },
  { key: "slug", label: "Slug", scope: "entry" },
  { key: "pronunciation", label: "Pronunciation", scope: "entry" },
  { key: "partOfSpeech", label: "Part of Speech", scope: "entry" },
  { key: "meaningTitle", label: "Meaning Title", scope: "meaning" },
  { key: "definition", label: "Definition", scope: "meaning" },
  { key: "example", label: "Example Sentence", scope: "meaning" },
  { key: "category", label: "Category", scope: "meaning" },
  { key: "tone", label: "Tone", scope: "meaning" },
  { key: "concepts", label: "Concepts", scope: "meaning" },
  {
    key: "usageFrequency",
    label: "Usage Frequency",
    scope: "meaning",
  },
];

const FIELD_LABELS = new Map(
  REQUIRED_FIELDS.map((field) => [field.key, field.label]),
);

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readAliasedText(
  source: unknown,
  aliases: string[],
): string {
  if (!source || typeof source !== "object") {
    return "";
  }

  const record = source as Record<string, unknown>;

  for (const alias of aliases) {
    const value = normalizeText(record[alias]);

    if (value) {
      return value;
    }
  }

  return "";
}

/**
 * Part of Speech is an ENTRY-LEVEL field in the current YERRR Studio schema.
 * Older data and temporary AI payloads may still expose aliases elsewhere, so
 * this check accepts those aliases as a compatibility fallback.
 */
function getEntryPartOfSpeech(entry: Entry) {
  const entryValue = readAliasedText(entry, [
    "partOfSpeech",
    "part_of_speech",
    "partsOfSpeech",
    "parts_of_speech",
    "pos",
    "grammar",
  ]);

  if (entryValue) {
    return entryValue;
  }

  for (const meaning of entry.meanings ?? []) {
    const legacyMeaningValue = readAliasedText(meaning, [
      "partOfSpeech",
      "part_of_speech",
      "pos",
      "grammar",
    ]);

    if (legacyMeaningValue) {
      return legacyMeaningValue;
    }
  }

  return "";
}

function entryFieldIsComplete(entry: Entry, key: RequiredFieldKey) {
  if (key === "word") return Boolean(normalizeText(entry.word));
  if (key === "type") return Boolean(normalizeText(entry.type));
  if (key === "slug") return Boolean(normalizeText(entry.slug));
  if (key === "pronunciation") {
    return Boolean(normalizeText(entry.pronunciation));
  }
  if (key === "partOfSpeech") {
    return Boolean(getEntryPartOfSpeech(entry));
  }

  return true;
}

function meaningFieldIsComplete(
  meaning: Meaning,
  key: RequiredFieldKey,
) {
  if (key === "meaningTitle") {
    return Boolean(normalizeText(meaning.title));
  }
  if (key === "definition") {
    return Boolean(normalizeText(meaning.definition));
  }
  if (key === "example") {
    return Boolean(normalizeText(meaning.example));
  }
  if (key === "category") {
    return Boolean(normalizeText(meaning.category));
  }
  if (key === "tone") {
    return Boolean(normalizeText(meaning.tone));
  }
  if (key === "concepts") {
    return Boolean(normalizeText(meaning.conceptsText));
  }
  if (key === "usageFrequency") {
    return Boolean(normalizeText(meaning.usageFrequency));
  }

  return true;
}

function calculateEntryCompletion(entry: Entry): EntryCompletion {
  const missingFields = new Set<RequiredFieldKey>();
  let completedChecks = 0;
  let totalChecks = 0;

  for (const field of REQUIRED_FIELDS) {
    if (field.scope !== "entry") continue;

    totalChecks += 1;

    if (entryFieldIsComplete(entry, field.key)) {
      completedChecks += 1;
    } else {
      missingFields.add(field.key);
    }
  }

  const meanings = Array.isArray(entry.meanings) ? entry.meanings : [];
  const meaningFields = REQUIRED_FIELDS.filter(
    (field) => field.scope === "meaning",
  );

  if (meanings.length === 0) {
    totalChecks += meaningFields.length;

    for (const field of meaningFields) {
      missingFields.add(field.key);
    }
  } else {
    for (const meaning of meanings) {
      for (const field of meaningFields) {
        totalChecks += 1;

        if (meaningFieldIsComplete(meaning, field.key)) {
          completedChecks += 1;
        } else {
          missingFields.add(field.key);
        }
      }
    }
  }

  const score =
    totalChecks === 0
      ? 100
      : Math.round((completedChecks / totalChecks) * 100);

  const missingFieldList = Array.from(missingFields);

  return {
    entry,
    score,
    completedChecks,
    totalChecks,
    missingFields: missingFieldList,
    missingLabels: missingFieldList.map(
      (key) => FIELD_LABELS.get(key) ?? key,
    ),
    isComplete: missingFieldList.length === 0,
  };
}

function getScoreClasses(score: number) {
  if (score === 100) {
    return "border-green-400/30 bg-green-400/10 text-green-200";
  }

  if (score >= 75) {
    return "border-yellow-400/30 bg-yellow-400/10 text-yellow-200";
  }

  return "border-red-400/30 bg-red-400/10 text-red-200";
}

export function ContentCompletionDashboard({
  isOpen,
  onClose,
  entries,
  onOpenEntry,
}: ContentCompletionDashboardProps) {
  const [view, setView] = useState<CompletionView>("needs-work");
  const [missingFieldFilter, setMissingFieldFilter] =
    useState<RequiredFieldKey | "all">("all");
  const [query, setQuery] = useState("");

  const completionRows = useMemo(
    () => entries.map(calculateEntryCompletion),
    [entries],
  );

  const summary = useMemo(() => {
    const complete = completionRows.filter((row) => row.isComplete).length;
    const needsWork = completionRows.length - complete;
    const averageScore = completionRows.length
      ? Math.round(
          completionRows.reduce((sum, row) => sum + row.score, 0) /
            completionRows.length,
        )
      : 0;

    return {
      total: completionRows.length,
      complete,
      needsWork,
      averageScore,
    };
  }, [completionRows]);

  const gapCounts = useMemo(() => {
    const counts = new Map<RequiredFieldKey, number>();

    for (const field of REQUIRED_FIELDS) {
      counts.set(field.key, 0);
    }

    for (const row of completionRows) {
      for (const key of row.missingFields) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    return REQUIRED_FIELDS.map((field) => ({
      ...field,
      count: counts.get(field.key) ?? 0,
    })).sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      return a.label.localeCompare(b.label);
    });
  }, [completionRows]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return completionRows
      .filter((row) => {
        if (view === "complete" && !row.isComplete) return false;
        if (view === "needs-work" && row.isComplete) return false;

        if (
          missingFieldFilter !== "all" &&
          !row.missingFields.includes(missingFieldFilter)
        ) {
          return false;
        }

        if (!normalizedQuery) return true;

        return [
          row.entry.word,
          row.entry.slug,
          row.entry.type,
          row.entry.partOfSpeech,
          row.entry.status,
          ...row.missingLabels,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        return a.entry.word.localeCompare(b.entry.word);
      });
  }, [completionRows, missingFieldFilter, query, view]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close Content Completion Dashboard"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="content-completion-title"
        className="absolute bottom-0 right-0 flex h-[95vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-neutral-800 bg-neutral-950 shadow-2xl lg:bottom-auto lg:top-0 lg:h-full lg:max-w-5xl lg:rounded-none lg:rounded-l-3xl lg:border-l lg:border-t-0"
      >
        <header className="border-b border-neutral-800 bg-neutral-950/95 p-5 backdrop-blur sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-400">
                Content Completion
              </p>

              <h2
                id="content-completion-title"
                className="mt-2 text-2xl font-black text-white sm:text-3xl"
              >
                Required Editorial Fields
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500">
                Completion now reads Part of Speech from the entry-level field.
                Plain English is retired, and Cultural Context is optional and
                does not affect scores or content gaps.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-black text-neutral-300 hover:border-neutral-700 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard label="Entries" value={summary.total} />
            <SummaryCard label="Complete" value={summary.complete} />
            <SummaryCard label="Needs Work" value={summary.needsWork} />
            <SummaryCard
              label="Average"
              value={`${summary.averageScore}%`}
            />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid flex-1 gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
                    View
                  </span>

                  <select
                    value={view}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      setView(event.target.value as CompletionView)
                    }
                    className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm font-bold text-white outline-none focus:border-yellow-400"
                  >
                    <option value="all">All Entries</option>
                    <option value="needs-work">Needs Work</option>
                    <option value="complete">Complete</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
                    Missing Field
                  </span>

                  <select
                    value={missingFieldFilter}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      setMissingFieldFilter(
                        event.target.value as RequiredFieldKey | "all",
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm font-bold text-white outline-none focus:border-yellow-400"
                  >
                    <option value="all">Any Required Field</option>
                    {REQUIRED_FIELDS.map((field) => (
                      <option key={field.key} value={field.key}>
                        {field.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
                    Search
                  </span>

                  <input
                    value={query}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setQuery(event.target.value)
                    }
                    placeholder="Search entries..."
                    className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm font-bold text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={() => {
                  setView("needs-work");
                  setMissingFieldFilter("all");
                  setQuery("");
                }}
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-black text-neutral-300 hover:border-yellow-400 hover:text-yellow-300"
              >
                Reset Filters
              </button>
            </div>
          </section>

          <section className="mt-5 rounded-3xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-black text-white">Content Gaps</h3>
                <p className="mt-1 text-sm leading-6 text-neutral-500">
                  Only required fields appear here. Plain English and Cultural
                  Context are intentionally excluded.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {gapCounts.map((gap) => (
                <button
                  key={gap.key}
                  type="button"
                  onClick={() => {
                    setView("needs-work");
                    setMissingFieldFilter(gap.key);
                  }}
                  className={`flex items-center justify-between gap-3 rounded-2xl border p-3 text-left transition ${
                    missingFieldFilter === gap.key
                      ? "border-yellow-400 bg-yellow-400/10"
                      : "border-neutral-800 bg-neutral-950 hover:border-neutral-700"
                  }`}
                >
                  <span className="text-sm font-bold text-neutral-300">
                    {gap.label}
                  </span>
                  <span className="rounded-full bg-neutral-800 px-2.5 py-1 text-xs font-black text-white">
                    {gap.count}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-black text-white">Entries</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Showing {filteredRows.length} result
                  {filteredRows.length === 1 ? "" : "s"}.
                </p>
              </div>
            </div>

            {filteredRows.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-neutral-700 p-8 text-center text-sm text-neutral-500">
                No entries match these completion filters.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredRows.map((row) => (
                  <article
                    key={row.entry.id}
                    className="rounded-3xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="truncate text-lg font-black text-white">
                            {row.entry.word}
                          </h4>

                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-black ${getScoreClasses(
                              row.score,
                            )}`}
                          >
                            {row.score}%
                          </span>
                        </div>

                        <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-neutral-600">
                          {row.entry.type} · {row.entry.status}
                        </p>

                        {row.missingLabels.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {row.missingLabels.map((label) => (
                              <span
                                key={label}
                                className="rounded-full border border-red-400/20 bg-red-400/10 px-2.5 py-1 text-xs font-bold text-red-200"
                              >
                                Missing {label}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 text-sm font-bold text-green-300">
                            All required editorial fields are complete.
                          </p>
                        )}

                        <p className="mt-3 text-xs text-neutral-600">
                          {row.completedChecks} of {row.totalChecks} required
                          checks complete
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => onOpenEntry(row.entry)}
                        className="shrink-0 rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-black hover:bg-yellow-300"
                      >
                        Open Entry
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

export default ContentCompletionDashboard;

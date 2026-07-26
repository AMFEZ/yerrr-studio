"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import type { Entry } from "@/types/entry";
import {
  EDITORIAL_RULESET_VERSION,
  OPTIONAL_EDITORIAL_FIELDS,
  REQUIRED_EDITORIAL_FIELDS,
  RETIRED_EDITORIAL_FIELDS,
  getEditorialCompletionReport,
  type RequiredEditorialFieldKey,
} from "@/lib/editorialCompletionRules";

type ContentCompletionDashboardProps = {
  isOpen: boolean;
  onClose: () => void;
  entries: Entry[];
  onOpenEntry: (entry: Entry) => void;
};

type CompletionView = "all" | "complete" | "needs-work";

type EntryCompletion = ReturnType<typeof getEditorialCompletionReport> & {
  entry: Entry;
};

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
    useState<RequiredEditorialFieldKey | "all">("all");
  const [query, setQuery] = useState("");

  const completionRows = useMemo<EntryCompletion[]>(
    () =>
      entries.map((entry) => ({
        entry,
        ...getEditorialCompletionReport(entry),
      })),
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
    const counts = new Map<RequiredEditorialFieldKey, number>();

    REQUIRED_EDITORIAL_FIELDS.forEach((field) => counts.set(field.key, 0));

    completionRows.forEach((row) => {
      row.missingFieldKeys.forEach((key) => {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
    });

    return REQUIRED_EDITORIAL_FIELDS.map((field) => ({
      ...field,
      count: counts.get(field.key) ?? 0,
    })).sort((first, second) => {
      if (first.count !== second.count) return second.count - first.count;
      return first.label.localeCompare(second.label);
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
          !row.missingFieldKeys.includes(missingFieldFilter)
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
      .sort((first, second) => {
        if (first.score !== second.score) return first.score - second.score;
        return first.entry.word.localeCompare(second.entry.word);
      });
  }, [completionRows, missingFieldFilter, query, view]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

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
                Unified Editorial Rules · {EDITORIAL_RULESET_VERSION}
              </p>
              <h2 id="content-completion-title" className="mt-2 text-2xl font-black text-white sm:text-3xl">
                Required Editorial Fields
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500">
                This exact rules contract now drives Completion, Sprint, Bulk AI,
                Batch Triage, the AI Center, and the Review Queue. Part of Speech
                is entry-level. Plain English is retired. Cultural Context is optional.
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
            <SummaryCard label="Average" value={`${summary.averageScore}%`} />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <section className="grid gap-3 lg:grid-cols-3">
            <RuleCard
              title="Required"
              values={REQUIRED_EDITORIAL_FIELDS.map((field) => field.label)}
              detail="Blocks completion when blank. Meaning requirements apply to every meaning."
              classes="border-red-400/20 bg-red-400/5"
            />
            <RuleCard
              title="Optional"
              values={[...OPTIONAL_EDITORIAL_FIELDS]}
              detail="Helpful editorial context, but never counted as a required gap."
              classes="border-sky-400/20 bg-sky-400/5"
            />
            <RuleCard
              title="Retired"
              values={[...RETIRED_EDITORIAL_FIELDS]}
              detail="Excluded from filters, scores, AI triage, and publish blockers."
              classes="border-neutral-700 bg-neutral-900"
            />
          </section>

          <section className="mt-5 rounded-3xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid flex-1 gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">View</span>
                  <select
                    value={view}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => setView(event.target.value as CompletionView)}
                    className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm font-bold text-white outline-none focus:border-yellow-400"
                  >
                    <option value="all">All Entries</option>
                    <option value="needs-work">Needs Work</option>
                    <option value="complete">Complete</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">Missing Field</span>
                  <select
                    value={missingFieldFilter}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => setMissingFieldFilter(event.target.value as RequiredEditorialFieldKey | "all")}
                    className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm font-bold text-white outline-none focus:border-yellow-400"
                  >
                    <option value="all">Any Required Field</option>
                    {REQUIRED_EDITORIAL_FIELDS.map((field) => (
                      <option key={field.key} value={field.key}>{field.label}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">Search</span>
                  <input
                    value={query}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
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
            <h3 className="font-black text-white">Content Gaps</h3>
            <p className="mt-1 text-sm leading-6 text-neutral-500">
              Counts are generated from the same shared report used by every other workflow.
            </p>
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
                  <span className="text-sm font-bold text-neutral-300">{gap.label}</span>
                  <span className="rounded-full bg-neutral-800 px-2.5 py-1 text-xs font-black text-white">{gap.count}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-5">
            <div className="mb-3">
              <h3 className="font-black text-white">Entries</h3>
              <p className="mt-1 text-sm text-neutral-500">
                Showing {filteredRows.length} result{filteredRows.length === 1 ? "" : "s"}.
              </p>
            </div>

            {filteredRows.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-neutral-700 p-8 text-center text-sm text-neutral-500">
                No entries match these completion filters.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredRows.map((row) => (
                  <article key={row.entry.id} className="rounded-3xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="truncate text-lg font-black text-white">{row.entry.word}</h4>
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${getScoreClasses(row.score)}`}>
                            {row.score}%
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-neutral-600">
                          {row.entry.type} · {row.entry.status}
                        </p>

                        {row.gaps.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {row.gaps.map((gap) => (
                              <span key={gap.key} className="rounded-full border border-red-400/20 bg-red-400/10 px-2.5 py-1 text-xs font-bold text-red-200">
                                Missing {gap.label}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 text-sm font-bold text-green-300">All required editorial fields are complete.</p>
                        )}

                        <p className="mt-3 text-xs text-neutral-600">
                          {row.completedChecks} of {row.totalChecks} required checks complete
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

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function RuleCard({
  title,
  values,
  detail,
  classes,
}: {
  title: string;
  values: readonly string[];
  detail: string;
  classes: string;
}) {
  return (
    <article className={`rounded-3xl border p-4 ${classes}`}>
      <h3 className="font-black text-white">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-neutral-500">{detail}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {values.map((value) => (
          <span key={value} className="rounded-full border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-xs font-bold text-neutral-300">
            {value}
          </span>
        ))}
      </div>
    </article>
  );
}

export default ContentCompletionDashboard;

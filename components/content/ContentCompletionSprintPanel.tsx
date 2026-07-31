"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";

import type { Entry } from "@/types/entry";
import {
  getRequiredEditorialGapCount,
  getRequiredEditorialGaps,
} from "@/lib/editorialCompletionRules";

type QueueOrder = "closest" | "most-gaps" | "alphabetical";
type QueueView = "next" | "reviewed" | "skipped";
type GapFilter =
  | "all"
  | "entry-fields"
  | "meaning-fields"
  | "pronunciation"
  | "partOfSpeech"
  | "title"
  | "definition"
  | "example"
  | "category"
  | "tone"
  | "conceptsText"
  | "usageFrequency";

type ContentCompletionSprintPanelProps = {
  isOpen: boolean;
  entries: Entry[];
  isSessionActive: boolean;
  startedAt: string | null;
  initialIncompleteCount: number;
  initialGapCounts: Record<string, number>;
  reviewedEntryIds: string[];
  skippedEntryIds: string[];
  onClose: () => void;
  onStartSession: (initialIncompleteCount: number) => void;
  onEndSession: () => void;
  onResetSession: () => void;
  onOpenEntry: (entry: Entry, openMissingFields: boolean) => void;
  onSkipEntry: (entryId: string) => void;
  onReturnEntry: (entryId: string) => void;
  onRequeueReviewedEntry: (entryId: string) => void;
  onOpenBulkAICompletion: () => void;
};

const GAP_FILTER_OPTIONS: Array<{ value: GapFilter; label: string }> = [
  { value: "all", label: "Any missing field" },
  { value: "entry-fields", label: "Any entry-level field" },
  { value: "meaning-fields", label: "Any meaning field" },
  { value: "pronunciation", label: "Pronunciation" },
  { value: "partOfSpeech", label: "Part of Speech" },
  { value: "title", label: "Meaning Title" },
  { value: "definition", label: "Definition" },
  { value: "example", label: "Example" },
  { value: "category", label: "Category" },
  { value: "tone", label: "Tone" },
  { value: "conceptsText", label: "Concepts" },
  { value: "usageFrequency", label: "Usage Frequency" },
];

function formatStartedAt(value: string | null) {
  if (!value) return "Not started";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Session active";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function entryMatchesGapFilter(entry: Entry, gapFilter: GapFilter) {
  if (gapFilter === "all") return true;

  const gaps = getRequiredEditorialGaps(entry);

  if (gapFilter === "entry-fields") {
    return gaps.some((gap) => !gap.key.startsWith("meanings."));
  }

  if (gapFilter === "meaning-fields") {
    return gaps.some((gap) => gap.key.startsWith("meanings."));
  }

  if (gapFilter === "pronunciation" || gapFilter === "partOfSpeech") {
    return gaps.some((gap) => gap.key === gapFilter);
  }

  return gaps.some((gap) => gap.key.endsWith(`.${gapFilter}`));
}

function sortEntries(entries: Entry[], queueOrder: QueueOrder) {
  return [...entries].sort((first, second) => {
    if (queueOrder === "alphabetical") {
      return first.word.localeCompare(second.word, undefined, {
        sensitivity: "base",
      });
    }

    const firstGapCount = getRequiredEditorialGapCount(first);
    const secondGapCount = getRequiredEditorialGapCount(second);
    const gapDifference =
      queueOrder === "closest"
        ? firstGapCount - secondGapCount
        : secondGapCount - firstGapCount;

    if (gapDifference !== 0) return gapDifference;

    return first.word.localeCompare(second.word, undefined, {
      sensitivity: "base",
    });
  });
}

export function ContentCompletionSprintPanel({
  isOpen,
  entries,
  isSessionActive,
  startedAt,
  initialIncompleteCount,
  initialGapCounts,
  reviewedEntryIds,
  skippedEntryIds,
  onClose,
  onStartSession,
  onEndSession,
  onResetSession,
  onOpenEntry,
  onSkipEntry,
  onReturnEntry,
  onRequeueReviewedEntry,
  onOpenBulkAICompletion,
}: ContentCompletionSprintPanelProps) {
  const [queueOrder, setQueueOrder] = useState<QueueOrder>("closest");
  const [queueView, setQueueView] = useState<QueueView>("next");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [gapFilter, setGapFilter] = useState<GapFilter>("all");
  const [activeQueueEntryId, setActiveQueueEntryId] = useState<string | null>(
    null,
  );

  const entryById = useMemo(
    () => new Map(entries.map((entry) => [String(entry.id), entry])),
    [entries],
  );
  const incompleteEntries = useMemo(
    () => entries.filter((entry) => getRequiredEditorialGapCount(entry) > 0),
    [entries],
  );
  const reviewedIdSet = useMemo(
    () => new Set(reviewedEntryIds.map(String)),
    [reviewedEntryIds],
  );
  const skippedIdSet = useMemo(
    () => new Set(skippedEntryIds.map(String)),
    [skippedEntryIds],
  );

  const queueStatusOptions = useMemo(
    () =>
      Array.from(
        new Set(incompleteEntries.map((entry) => String(entry.status))),
      ).sort((first, second) => first.localeCompare(second)),
    [incompleteEntries],
  );

  const availableEntries = useMemo(() => {
    const normalizedSearchQuery = searchQuery.trim().toLowerCase();
    const candidates = incompleteEntries.filter((entry) => {
      const entryId = String(entry.id);

      if (reviewedIdSet.has(entryId) || skippedIdSet.has(entryId)) return false;
      if (statusFilter !== "all" && String(entry.status) !== statusFilter) {
        return false;
      }
      if (
        normalizedSearchQuery &&
        !entry.word.toLowerCase().includes(normalizedSearchQuery)
      ) {
        return false;
      }

      return entryMatchesGapFilter(entry, gapFilter);
    });

    return sortEntries(candidates, queueOrder);
  }, [
    incompleteEntries,
    queueOrder,
    reviewedIdSet,
    skippedIdSet,
    searchQuery,
    statusFilter,
    gapFilter,
  ]);

  useEffect(() => {
    if (availableEntries.length === 0) {
      setActiveQueueEntryId(null);
      return;
    }

    const activeEntryStillVisible = availableEntries.some(
      (entry) => String(entry.id) === activeQueueEntryId,
    );

    if (!activeEntryStillVisible) {
      setActiveQueueEntryId(String(availableEntries[0].id));
    }
  }, [availableEntries, activeQueueEntryId]);

  const skippedEntries = useMemo(() => {
    return entries
      .filter(
        (entry) =>
          skippedIdSet.has(String(entry.id)) &&
          getRequiredEditorialGapCount(entry) > 0,
      )
      .sort((first, second) =>
        first.word.localeCompare(second.word, undefined, {
          sensitivity: "base",
        }),
      );
  }, [entries, skippedIdSet]);

  const reviewedEntries = useMemo(() => {
    return [...reviewedEntryIds]
      .reverse()
      .map((entryId) => entryById.get(String(entryId)))
      .filter((entry): entry is Entry => Boolean(entry));
  }, [reviewedEntryIds, entryById]);

  const completedThisSession = reviewedEntries.filter(
    (entry) => getRequiredEditorialGapCount(entry) === 0,
  ).length;
  const reviewedStillIncomplete = Math.max(
    reviewedEntries.length - completedThisSession,
    0,
  );
  const fieldsFilledThisSession = reviewedEntries.reduce((total, entry) => {
    const entryId = String(entry.id);
    const startingGapCount =
      initialGapCounts[entryId] ?? getRequiredEditorialGapCount(entry);
    const currentGapCount = getRequiredEditorialGapCount(entry);

    return total + Math.max(startingGapCount - currentGapCount, 0);
  }, 0);
  const processedEntryIds = new Set([
    ...reviewedEntryIds.map(String),
    ...skippedEntryIds.map(String),
  ]);
  const progressDenominator = Math.max(initialIncompleteCount, 1);
  const progressPercent = Math.min(
    100,
    Math.round((processedEntryIds.size / progressDenominator) * 100),
  );
  const currentQueueIndex = Math.max(
    availableEntries.findIndex(
      (entry) => String(entry.id) === activeQueueEntryId,
    ),
    0,
  );
  const activeQueueEntry = availableEntries[currentQueueIndex] ?? null;
  const activeQueueEntryGaps = activeQueueEntry
    ? getRequiredEditorialGaps(activeQueueEntry)
    : [];
  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    statusFilter !== "all" ||
    gapFilter !== "all";

  function clearFilters() {
    setSearchQuery("");
    setStatusFilter("all");
    setGapFilter("all");
  }

  function selectPreviousQueueEntry() {
    if (currentQueueIndex <= 0) return;
    setActiveQueueEntryId(String(availableEntries[currentQueueIndex - 1].id));
  }

  function selectNextQueueEntry() {
    if (currentQueueIndex >= availableEntries.length - 1) return;
    setActiveQueueEntryId(String(availableEntries[currentQueueIndex + 1].id));
  }

  function returnSkippedEntry(entryId: string) {
    onReturnEntry(entryId);
    setActiveQueueEntryId(entryId);
    setQueueView("next");
  }

  function requeueReviewedEntry(entryId: string) {
    onRequeueReviewedEntry(entryId);
    setActiveQueueEntryId(entryId);
    setQueueView("next");
  }

  function endSession() {
    const confirmed = window.confirm(
      `End this Completion Sprint? You completed ${completedThisSession} entries and filled ${fieldsFilledThisSession} required fields.`,
    );

    if (confirmed) onEndSession();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close Completion Sprint"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside className="absolute bottom-0 right-0 max-h-[94vh] w-full overflow-y-auto rounded-t-3xl border-t border-neutral-800 bg-neutral-950 shadow-2xl lg:bottom-auto lg:top-0 lg:h-full lg:max-h-none lg:max-w-4xl lg:rounded-none lg:rounded-l-3xl lg:border-l lg:border-t-0">
        <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/95 p-5 backdrop-blur lg:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
<h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">
                Completion Sprint
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
                Filter the queue, move backward or forward, reopen reviewed entries,
                or generate a safe batch of AI drafts for several entries.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-black text-neutral-300 hover:border-neutral-500 hover:text-white"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="space-y-5 p-5 lg:p-6">
          {!isSessionActive ? (
            <section className="rounded-3xl border border-orange-300/25 bg-orange-300/10 p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-200/70">
                Ready to work
              </p>
              <h3 className="mt-2 text-xl font-black text-white">
                {incompleteEntries.length} incomplete entries remain
              </h3>
              <p className="mt-3 text-sm leading-6 text-neutral-300">
                Starting a sprint stores your reviewed queue, skipped queue,
                and starting field-gap counts on this device.
              </p>

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => onStartSession(incompleteEntries.length)}
                  disabled={incompleteEntries.length === 0}
                  className="rounded-xl bg-orange-300 px-4 py-3 text-sm font-black text-black transition hover:bg-orange-200 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                >
                  {incompleteEntries.length === 0
                    ? "All required fields are complete"
                    : "Start completion sprint"}
                </button>
                <button
                  type="button"
                  onClick={onOpenBulkAICompletion}
                  disabled={incompleteEntries.length === 0}
                  className="rounded-xl border border-violet-300/30 bg-violet-300/10 px-4 py-3 text-sm font-black text-violet-100 transition hover:border-violet-300 hover:bg-violet-300/20 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-600"
                >
                  ✨ Generate bulk AI drafts
                </button>
              </div>
            </section>
          ) : (
            <>
              <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
                      Session progress
                    </p>
                    <p className="mt-2 text-sm text-neutral-300">
                      Started {formatStartedAt(startedAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={onOpenBulkAICompletion}
                      disabled={availableEntries.length === 0}
                      className="rounded-full border border-violet-300/30 bg-violet-300/10 px-3 py-1.5 text-xs font-black text-violet-100 transition hover:border-violet-300 hover:bg-violet-300/20 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-950 disabled:text-neutral-600"
                    >
                      ✨ Bulk AI drafts
                    </button>
                    <span className="rounded-full border border-orange-300/25 bg-orange-300/10 px-3 py-1 text-xs font-black text-orange-200">
                      {progressPercent}% processed
                    </span>
                  </div>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className="h-full rounded-full bg-orange-300 transition-all"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                  <div className="rounded-2xl border border-green-400/20 bg-green-400/10 p-3">
                    <p className="text-xl font-black text-green-100">
                      {completedThisSession}
                    </p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-green-100/60">
                      Completed
                    </p>
                  </div>
                  <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 p-3">
                    <p className="text-xl font-black text-sky-100">
                      {reviewedStillIncomplete}
                    </p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-sky-100/60">
                      Still incomplete
                    </p>
                  </div>
                  <div className="rounded-2xl border border-violet-400/20 bg-violet-400/10 p-3">
                    <p className="text-xl font-black text-violet-100">
                      {fieldsFilledThisSession}
                    </p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-violet-100/60">
                      Fields filled
                    </p>
                  </div>
                  <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-3">
                    <p className="text-xl font-black text-yellow-100">
                      {skippedEntries.length}
                    </p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-yellow-100/60">
                      Skipped
                    </p>
                  </div>
                  <div className="rounded-2xl border border-orange-400/20 bg-orange-400/10 p-3">
                    <p className="text-xl font-black text-orange-100">
                      {availableEntries.length}
                    </p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-orange-100/60">
                      Active queue
                    </p>
                  </div>
                </div>
              </section>

              <div className="grid grid-cols-3 gap-1 rounded-2xl border border-neutral-800 bg-neutral-900 p-1">
                <button
                  type="button"
                  onClick={() => setQueueView("next")}
                  className={`rounded-xl px-2 py-3 text-xs font-black transition sm:px-4 sm:text-sm ${
                    queueView === "next"
                      ? "bg-orange-300 text-black"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  Next · {availableEntries.length}
                </button>
                <button
                  type="button"
                  onClick={() => setQueueView("reviewed")}
                  className={`rounded-xl px-2 py-3 text-xs font-black transition sm:px-4 sm:text-sm ${
                    queueView === "reviewed"
                      ? "bg-sky-300 text-black"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  Reviewed · {reviewedEntries.length}
                </button>
                <button
                  type="button"
                  onClick={() => setQueueView("skipped")}
                  className={`rounded-xl px-2 py-3 text-xs font-black transition sm:px-4 sm:text-sm ${
                    queueView === "skipped"
                      ? "bg-yellow-300 text-black"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  Skipped · {skippedEntries.length}
                </button>
              </div>

              {queueView === "next" ? (
                <>
                  <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
                        Queue controls
                      </p>
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="text-xs font-black text-orange-200 hover:text-orange-100"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
                          Find entry
                        </span>
                        <input
                          value={searchQuery}
                          onChange={(event) => setSearchQuery(event.target.value)}
                          placeholder="Search word..."
                          className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm font-bold text-white outline-none placeholder:text-neutral-600 focus:border-orange-300"
                        />
                      </label>

                      <label className="block">
                        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
                          Workflow status
                        </span>
                        <select
                          value={statusFilter}
                          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                            setStatusFilter(event.target.value)
                          }
                          className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm font-black text-white outline-none focus:border-orange-300"
                        >
                          <option value="all">All statuses</option>
                          {queueStatusOptions.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
                          Missing field
                        </span>
                        <select
                          value={gapFilter}
                          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                            setGapFilter(event.target.value as GapFilter)
                          }
                          className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm font-black text-white outline-none focus:border-orange-300"
                        >
                          {GAP_FILTER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
                          Queue order
                        </span>
                        <select
                          value={queueOrder}
                          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                            setQueueOrder(event.target.value as QueueOrder)
                          }
                          className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm font-black text-white outline-none focus:border-orange-300"
                        >
                          <option value="closest">Closest to complete first</option>
                          <option value="most-gaps">Most missing fields first</option>
                          <option value="alphabetical">Alphabetical</option>
                        </select>
                      </label>
                    </div>
                  </section>

                  {activeQueueEntry ? (
                    <section className="rounded-3xl border border-orange-300/25 bg-orange-300/10 p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-orange-200/10 pb-4">
                        <button
                          type="button"
                          onClick={selectPreviousQueueEntry}
                          disabled={currentQueueIndex === 0}
                          className="rounded-xl border border-orange-200/20 bg-black/20 px-3 py-2 text-xs font-black text-orange-50 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          ← Previous
                        </button>
                        <p className="text-xs font-black text-orange-100/70">
                          {currentQueueIndex + 1} of {availableEntries.length}
                        </p>
                        <button
                          type="button"
                          onClick={selectNextQueueEntry}
                          disabled={currentQueueIndex >= availableEntries.length - 1}
                          className="rounded-xl border border-orange-200/20 bg-black/20 px-3 py-2 text-xs font-black text-orange-50 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          Next →
                        </button>
                      </div>

                      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-200/70">
                            Selected incomplete entry
                          </p>
                          <h3 className="mt-2 text-2xl font-black text-white">
                            {activeQueueEntry.word || "Untitled entry"}
                          </h3>
                          <p className="mt-1 text-sm text-orange-100/70">
                            {activeQueueEntryGaps.length} required gap
                            {activeQueueEntryGaps.length === 1 ? "" : "s"}
                          </p>
                        </div>

                        <span className="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1 text-xs font-black text-neutral-300">
                          {activeQueueEntry.status}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {activeQueueEntryGaps.slice(0, 8).map((gap) => (
                          <span
                            key={gap.key}
                            className="rounded-full border border-orange-200/20 bg-black/20 px-3 py-1 text-xs font-bold text-orange-50/80"
                          >
                            {gap.label}
                          </span>
                        ))}
                        {activeQueueEntryGaps.length > 8 && (
                          <span className="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1 text-xs font-bold text-neutral-400">
                            +{activeQueueEntryGaps.length - 8} more
                          </span>
                        )}
                      </div>

                      <div className="mt-5 grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => onOpenEntry(activeQueueEntry, false)}
                          className="rounded-xl bg-orange-300 px-4 py-3 text-sm font-black text-black transition hover:bg-orange-200"
                        >
                          Open in editor
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenEntry(activeQueueEntry, true)}
                          className="rounded-xl border border-violet-300/30 bg-violet-300/10 px-4 py-3 text-sm font-black text-violet-100 transition hover:border-violet-300 hover:bg-violet-300/20"
                        >
                          ✨ Open with AI Fill
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => onSkipEntry(String(activeQueueEntry.id))}
                        className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-black text-neutral-300 transition hover:border-yellow-300 hover:text-yellow-200"
                      >
                        Skip for later
                      </button>
                    </section>
                  ) : (
                    <section className="rounded-3xl border border-green-400/20 bg-green-400/10 p-5 text-center">
                      <p className="text-3xl">🏁</p>
                      <h3 className="mt-3 text-xl font-black text-green-100">
                        {hasActiveFilters
                          ? "No entries match these filters"
                          : "Next-up queue cleared"}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-green-100/70">
                        {hasActiveFilters
                          ? "Clear or change the queue filters to continue."
                          : skippedEntries.length > 0
                            ? "Return to the skipped queue when you are ready."
                            : "You reviewed every active entry in this sprint."}
                      </p>
                    </section>
                  )}

                  {availableEntries.length > 1 && (
                    <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
                        Queue preview
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {availableEntries.slice(0, 8).map((entry) => {
                          const isActive =
                            String(entry.id) === String(activeQueueEntry?.id);

                          return (
                            <button
                              key={entry.id}
                              type="button"
                              onClick={() =>
                                setActiveQueueEntryId(String(entry.id))
                              }
                              className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition ${
                                isActive
                                  ? "border-orange-300 bg-orange-300/10"
                                  : "border-neutral-800 bg-neutral-950 hover:border-orange-300/60"
                              }`}
                            >
                              <span className="truncate text-sm font-black text-white">
                                {entry.word || "Untitled entry"}
                              </span>
                              <span className="shrink-0 text-xs font-bold text-neutral-500">
                                {getRequiredEditorialGapCount(entry)} gaps
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </>
              ) : queueView === "reviewed" ? (
                reviewedEntries.length > 0 ? (
                  <section className="space-y-3">
                    {reviewedEntries.map((entry) => {
                      const currentGapCount = getRequiredEditorialGapCount(entry);
                      const startingGapCount =
                        initialGapCounts[String(entry.id)] ?? currentGapCount;
                      const filledGapCount = Math.max(
                        startingGapCount - currentGapCount,
                        0,
                      );

                      return (
                        <article
                          key={entry.id}
                          className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h3 className="font-black text-white">
                                {entry.word || "Untitled entry"}
                              </h3>
                              <p className="mt-1 text-xs text-neutral-500">
                                {filledGapCount} field
                                {filledGapCount === 1 ? "" : "s"} filled ·{" "}
                                {currentGapCount === 0
                                  ? "Complete"
                                  : `${currentGapCount} gaps remain`}
                              </p>
                            </div>

                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-black ${
                                currentGapCount === 0
                                  ? "border-green-400/25 bg-green-400/10 text-green-100"
                                  : "border-sky-400/25 bg-sky-400/10 text-sky-100"
                              }`}
                            >
                              {currentGapCount === 0 ? "Completed" : "Reviewed"}
                            </span>
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-3">
                            <button
                              type="button"
                              onClick={() => onOpenEntry(entry, false)}
                              className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm font-black text-white hover:border-sky-300"
                            >
                              Reopen entry
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenEntry(entry, true)}
                              disabled={currentGapCount === 0}
                              className="rounded-xl border border-violet-300/30 bg-violet-300/10 px-3 py-2 text-sm font-black text-violet-100 hover:border-violet-300 disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              ✨ Continue with AI
                            </button>
                            <button
                              type="button"
                              onClick={() => requeueReviewedEntry(String(entry.id))}
                              disabled={currentGapCount === 0}
                              className="rounded-xl border border-orange-300/30 bg-orange-300/10 px-3 py-2 text-sm font-black text-orange-100 hover:border-orange-300 disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              Return to active queue
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </section>
                ) : (
                  <section className="rounded-2xl border border-dashed border-neutral-700 p-6 text-center text-sm text-neutral-500">
                    Saved entries will appear here during this sprint.
                  </section>
                )
              ) : skippedEntries.length > 0 ? (
                <section className="space-y-3">
                  {skippedEntries.map((entry) => (
                    <article
                      key={entry.id}
                      className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="font-black text-white">
                            {entry.word || "Untitled entry"}
                          </h3>
                          <p className="mt-1 text-xs text-neutral-500">
                            {getRequiredEditorialGapCount(entry)} required gaps
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => returnSkippedEntry(String(entry.id))}
                          className="rounded-xl border border-yellow-300/30 bg-yellow-300/10 px-3 py-2 text-xs font-black text-yellow-100 transition hover:border-yellow-300"
                        >
                          Return to queue
                        </button>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => onOpenEntry(entry, false)}
                          className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm font-black text-white hover:border-orange-300"
                        >
                          Open entry
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenEntry(entry, true)}
                          className="rounded-xl border border-violet-300/30 bg-violet-300/10 px-3 py-2 text-sm font-black text-violet-100 hover:border-violet-300"
                        >
                          ✨ Open with AI
                        </button>
                      </div>
                    </article>
                  ))}
                </section>
              ) : (
                <section className="rounded-2xl border border-dashed border-neutral-700 p-6 text-center text-sm text-neutral-500">
                  Nothing is waiting in the skipped queue.
                </section>
              )}

              <section className="rounded-3xl border border-violet-300/20 bg-violet-300/10 p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-100/60">
                  Sprint impact
                </p>
                <h3 className="mt-2 text-xl font-black text-white">
                  {fieldsFilledThisSession} required fields filled across{" "}
                  {reviewedEntries.length} reviewed entries
                </h3>
                <p className="mt-2 text-sm leading-6 text-violet-50/70">
                  {completedThisSession} entries reached full required-field
                  completion. {reviewedStillIncomplete} can be reopened from the
                  Reviewed tab without losing their session history.
                </p>
              </section>

              <section className="grid gap-2 border-t border-neutral-800 pt-5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={endSession}
                  className="rounded-xl border border-green-400/30 bg-green-400/10 px-4 py-3 text-sm font-black text-green-100 transition hover:border-green-400"
                >
                  End session
                </button>
                <button
                  type="button"
                  onClick={onResetSession}
                  className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm font-black text-red-100 transition hover:border-red-400"
                >
                  Reset session progress
                </button>
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

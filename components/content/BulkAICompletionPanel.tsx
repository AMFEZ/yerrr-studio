"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";

import type { Entry, Meaning } from "@/types/entry";
import type {
  AIMissingFieldSuggestion,
  AIMissingFieldsResponse,
  AIMissingFieldsResult,
} from "@/types/aiMissingFields";
import {
  getRequiredEditorialGapCount,
  getRequiredEditorialGaps,
} from "@/lib/editorialCompletionRules";

type BulkAICompletionPanelProps = {
  isOpen: boolean;
  entries: Entry[];
  isOnline: boolean;
  onClose: () => void;
  onApplyEntry: (entry: Entry) => Promise<void>;
  onEntryReviewed: (entryId: string) => void;
};

type EntryEditableField = "pronunciation" | "partOfSpeech";
type MeaningEditableField =
  | "title"
  | "definition"
  | "example"
  | "category"
  | "tone"
  | "conceptsText"
  | "usageFrequency";

type JobStatus = "queued" | "generating" | "ready" | "complete" | "error";

type CompletionJob = {
  entry: Entry;
  result: AIMissingFieldsResult | null;
  model: string;
  status: JobStatus;
  error: string;
  appliedCount: number;
  dismissedCount: number;
};

const MAX_BATCH_SIZE = 8;

const ENTRY_EDITABLE_FIELDS = new Set<EntryEditableField>([
  "pronunciation",
  "partOfSpeech",
]);

const MEANING_EDITABLE_FIELDS = new Set<MeaningEditableField>([
  "title",
  "definition",
  "example",
  "category",
  "tone",
  "conceptsText",
  "usageFrequency",
]);

function isEntryEditableField(value: string): value is EntryEditableField {
  return ENTRY_EDITABLE_FIELDS.has(value as EntryEditableField);
}

function isMeaningEditableField(value: string): value is MeaningEditableField {
  return MEANING_EDITABLE_FIELDS.has(value as MeaningEditableField);
}

function applySuggestionToEntry(
  entry: Entry,
  suggestion: AIMissingFieldSuggestion,
): Entry | null {
  const suggestedValue = suggestion.suggestedValue.trim();

  if (!suggestedValue) return null;

  if (isEntryEditableField(suggestion.fieldPath)) {
    return {
      ...entry,
      [suggestion.fieldPath]: suggestedValue,
    };
  }

  const meaningMatch = suggestion.fieldPath.match(
    /^meanings\[(\d+)\]\.([A-Za-z]+)$/,
  );

  if (!meaningMatch) return null;

  const meaningIndex = Number(meaningMatch[1]);
  const meaningField = meaningMatch[2];

  if (
    !Number.isInteger(meaningIndex) ||
    meaningIndex < 0 ||
    meaningIndex >= entry.meanings.length ||
    !isMeaningEditableField(meaningField)
  ) {
    return null;
  }

  const meanings = entry.meanings.map((meaning, index): Meaning => {
    if (index !== meaningIndex) return meaning;

    return {
      ...meaning,
      [meaningField]: suggestedValue,
    };
  });

  return {
    ...entry,
    meanings,
  };
}

function removeSuggestions(
  result: AIMissingFieldsResult,
  suggestionIds: Set<string>,
): AIMissingFieldsResult {
  const suggestions = result.suggestions.filter(
    (suggestion) => !suggestionIds.has(suggestion.id),
  );

  return {
    ...result,
    suggestions,
    missingFieldCount: suggestions.length,
    summary:
      suggestions.length === 0
        ? "Every generated suggestion was applied or dismissed."
        : `${suggestions.length} suggestion${suggestions.length === 1 ? "" : "s"} remaining.`,
  };
}

function statusLabel(status: JobStatus) {
  switch (status) {
    case "queued":
      return "Queued";
    case "generating":
      return "Generating";
    case "ready":
      return "Ready";
    case "complete":
      return "Reviewed";
    case "error":
      return "Error";
  }
}

export function BulkAICompletionPanel({
  isOpen,
  entries,
  isOnline,
  onClose,
  onApplyEntry,
  onEntryReviewed,
}: BulkAICompletionPanelProps) {
  const incompleteEntries = useMemo(
    () =>
      entries
        .filter((entry) => getRequiredEditorialGapCount(entry) > 0)
        .sort((first, second) => {
          const gapDifference =
            getRequiredEditorialGapCount(first) -
            getRequiredEditorialGapCount(second);

          if (gapDifference !== 0) return gapDifference;

          return first.word.localeCompare(second.word, undefined, {
            sensitivity: "base",
          });
        }),
    [entries],
  );

  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [jobs, setJobs] = useState<CompletionJob[]>([]);
  const [activeJobIndex, setActiveJobIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [applyingSuggestionId, setApplyingSuggestionId] = useState("");
  const [isApplyingSafeDrafts, setIsApplyingSafeDrafts] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen || selectedEntryIds.length > 0 || jobs.length > 0) return;

    setSelectedEntryIds(
      incompleteEntries.slice(0, Math.min(5, MAX_BATCH_SIZE)).map((entry) =>
        String(entry.id),
      ),
    );
  }, [incompleteEntries, isOpen, jobs.length, selectedEntryIds.length]);

  const visibleEntries = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    if (!normalizedSearch) return incompleteEntries;

    return incompleteEntries.filter((entry) =>
      entry.word.toLowerCase().includes(normalizedSearch),
    );
  }, [incompleteEntries, searchQuery]);

  const activeJob = jobs[activeJobIndex] ?? null;
  const activeSuggestions = activeJob?.result?.suggestions ?? [];
  const isApplying = Boolean(applyingSuggestionId) || isApplyingSafeDrafts;

  const activeSafeDrafts = useMemo(() => {
    if (!activeJob?.result) return [];

    return activeJob.result.suggestions.filter(
      (suggestion) =>
        suggestion.suggestedValue.trim() &&
        !suggestion.requiresVerification &&
        suggestion.confidence !== "low" &&
        applySuggestionToEntry(activeJob.entry, suggestion) !== null,
    );
  }, [activeJob]);

  const completedCount = jobs.filter((job) => job.status === "complete").length;
  const readyCount = jobs.filter((job) => job.status === "ready").length;
  const errorCount = jobs.filter((job) => job.status === "error").length;
  const generatedCount = jobs.filter(
    (job) => job.status === "ready" || job.status === "complete" || job.status === "error",
  ).length;

  function toggleEntry(entryId: string) {
    if (jobs.length > 0 || isGenerating) return;

    setSelectedEntryIds((currentIds) => {
      if (currentIds.includes(entryId)) {
        return currentIds.filter((currentId) => currentId !== entryId);
      }

      if (currentIds.length >= MAX_BATCH_SIZE) {
        setNotice(`A batch can contain up to ${MAX_BATCH_SIZE} entries.`);
        return currentIds;
      }

      setNotice("");
      return [...currentIds, entryId];
    });
  }

  function updateJob(index: number, updater: (job: CompletionJob) => CompletionJob) {
    setJobs((currentJobs) =>
      currentJobs.map((job, jobIndex) => (jobIndex === index ? updater(job) : job)),
    );
  }

  async function generateBatch() {
    if (isGenerating || selectedEntryIds.length === 0 || !isOnline) return;

    const selectedIdSet = new Set(selectedEntryIds);
    const selectedEntries = incompleteEntries.filter((entry) =>
      selectedIdSet.has(String(entry.id)),
    );

    const initialJobs: CompletionJob[] = selectedEntries.map((entry) => ({
      entry,
      result: null,
      model: "",
      status: "queued",
      error: "",
      appliedCount: 0,
      dismissedCount: 0,
    }));

    setJobs(initialJobs);
    setActiveJobIndex(0);
    setIsGenerating(true);
    setError("");
    setNotice("");

    for (let index = 0; index < initialJobs.length; index += 1) {
      updateJob(index, (job) => ({ ...job, status: "generating", error: "" }));

      try {
        const response = await fetch("/api/ai-fill-missing-fields", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ entry: initialJobs[index].entry }),
        });

        let payload: AIMissingFieldsResponse = {};

        try {
          payload = (await response.json()) as AIMissingFieldsResponse;
        } catch {
          payload = {};
        }

        if (!response.ok || !payload.result) {
          throw new Error(payload.error || "AI suggestions could not be generated.");
        }

        const isAlreadyComplete = payload.result.suggestions.length === 0;

        updateJob(index, (job) => ({
          ...job,
          result: payload.result ?? null,
          model: payload.model ?? "",
          status: isAlreadyComplete ? "complete" : "ready",
        }));

        if (isAlreadyComplete) {
          onEntryReviewed(String(initialJobs[index].entry.id));
        }
      } catch (generationError) {
        updateJob(index, (job) => ({
          ...job,
          status: "error",
          error:
            generationError instanceof Error
              ? generationError.message
              : "AI suggestions could not be generated.",
        }));
      }
    }

    setIsGenerating(false);
    setNotice("Draft generation finished. Review each entry before applying anything.");
  }


  async function applySuggestion(suggestion: AIMissingFieldSuggestion) {
    if (!activeJob || !activeJob.result || isApplying) return;

    const nextEntry = applySuggestionToEntry(activeJob.entry, suggestion);

    if (!nextEntry) {
      setError(`Unsupported AI field path: ${suggestion.fieldPath}`);
      return;
    }

    try {
      setApplyingSuggestionId(suggestion.id);
      setError("");
      setNotice("");

      await onApplyEntry(nextEntry);

      const nextResult = removeSuggestions(
        activeJob.result,
        new Set([suggestion.id]),
      );
      const isResolved = nextResult.suggestions.length === 0;

      updateJob(activeJobIndex, (job) => ({
        ...job,
        entry: nextEntry,
        result: nextResult,
        status: isResolved ? "complete" : "ready",
        appliedCount: job.appliedCount + 1,
      }));

      if (isResolved) {
        onEntryReviewed(String(activeJob.entry.id));
      }

      setNotice(`${suggestion.fieldLabel} applied to ${activeJob.entry.word}.`);
    } catch (applyError) {
      setError(
        applyError instanceof Error
          ? applyError.message
          : "The suggestion could not be saved.",
      );
    } finally {
      setApplyingSuggestionId("");
    }
  }

  function dismissSuggestion(suggestion: AIMissingFieldSuggestion) {
    if (!activeJob?.result || isApplying) return;

    const nextResult = removeSuggestions(
      activeJob.result,
      new Set([suggestion.id]),
    );
    const isResolved = nextResult.suggestions.length === 0;

    updateJob(activeJobIndex, (job) => ({
      ...job,
      result: nextResult,
      status: isResolved ? "complete" : "ready",
      dismissedCount: job.dismissedCount + 1,
    }));

    if (isResolved) {
      onEntryReviewed(String(activeJob.entry.id));
    }

    setError("");
    setNotice(`${suggestion.fieldLabel} dismissed.`);
  }

  async function applySafeDrafts() {
    if (!activeJob?.result || activeSafeDrafts.length === 0 || isApplying) return;

    let nextEntry = activeJob.entry;
    const appliedIds = new Set<string>();

    activeSafeDrafts.forEach((suggestion) => {
      const updatedEntry = applySuggestionToEntry(nextEntry, suggestion);

      if (!updatedEntry) return;

      nextEntry = updatedEntry;
      appliedIds.add(suggestion.id);
    });

    if (appliedIds.size === 0) return;

    try {
      setIsApplyingSafeDrafts(true);
      setError("");
      setNotice("");

      await onApplyEntry(nextEntry);

      const nextResult = removeSuggestions(activeJob.result, appliedIds);
      const isResolved = nextResult.suggestions.length === 0;

      updateJob(activeJobIndex, (job) => ({
        ...job,
        entry: nextEntry,
        result: nextResult,
        status: isResolved ? "complete" : "ready",
        appliedCount: job.appliedCount + appliedIds.size,
      }));

      if (isResolved) {
        onEntryReviewed(String(activeJob.entry.id));
      }

      setNotice(
        `${appliedIds.size} safe draft${appliedIds.size === 1 ? "" : "s"} applied to ${activeJob.entry.word}.`,
      );
    } catch (applyError) {
      setError(
        applyError instanceof Error
          ? applyError.message
          : "The safe drafts could not be saved.",
      );
    } finally {
      setIsApplyingSafeDrafts(false);
    }
  }

  function resetBatch() {
    if (isGenerating || isApplying) return;

    const confirmed =
      jobs.length === 0 ||
      window.confirm("Clear this generated batch and choose a new set of entries?");

    if (!confirmed) return;

    setJobs([]);
    setActiveJobIndex(0);
    setSelectedEntryIds(
      incompleteEntries.slice(0, Math.min(5, MAX_BATCH_SIZE)).map((entry) =>
        String(entry.id),
      ),
    );
    setSearchQuery("");
    setError("");
    setNotice("");
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[98] bg-black/80 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close Bulk AI Completion"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside className="absolute bottom-0 right-0 max-h-[96vh] w-full overflow-y-auto rounded-t-3xl border-t border-neutral-800 bg-neutral-950 shadow-2xl lg:bottom-auto lg:top-0 lg:h-full lg:max-h-none lg:max-w-5xl lg:rounded-none lg:rounded-l-3xl lg:border-l lg:border-t-0">
        <header className="sticky top-0 z-20 border-b border-neutral-800 bg-neutral-950/95 p-5 backdrop-blur lg:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-violet-300">
                Alpha 5.18C
              </p>
              <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">
                Bulk AI Completion Queue
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
                Generate drafts for several incomplete entries, then review exact values one
                entry at a time. Generation never edits the lexicon.
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
          {!isOnline && (
            <section className="rounded-2xl border border-yellow-300/30 bg-yellow-300/10 p-4 text-sm font-bold text-yellow-100">
              Reconnect before generating bulk AI drafts. Existing entry editing remains
              available through the offline queue.
            </section>
          )}

          {error && (
            <section className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-bold text-red-100">
              {error}
            </section>
          )}

          {notice && (
            <section className="rounded-2xl border border-sky-400/25 bg-sky-400/10 p-4 text-sm font-bold text-sky-100">
              {notice}
            </section>
          )}

          {jobs.length === 0 ? (
            <>
              <section className="rounded-3xl border border-violet-300/25 bg-violet-300/10 p-5">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-200/70">
                      Choose the batch
                    </p>
                    <h3 className="mt-2 text-xl font-black text-white">
                      {selectedEntryIds.length} of {MAX_BATCH_SIZE} selected
                    </h3>
                    <p className="mt-2 text-sm text-neutral-300">
                      Closest-to-complete entries are preselected so the batch produces quick
                      editorial wins.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={generateBatch}
                    disabled={
                      selectedEntryIds.length === 0 || isGenerating || !isOnline
                    }
                    className="rounded-xl bg-violet-300 px-5 py-3 text-sm font-black text-black transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                  >
                    {isGenerating
                      ? "Generating drafts..."
                      : `Generate ${selectedEntryIds.length} draft set${
                          selectedEntryIds.length === 1 ? "" : "s"
                        }`}
                  </button>
                </div>

                <label className="mt-5 block">
                  <span className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
                    Find entry
                  </span>
                  <input
                    value={searchQuery}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setSearchQuery(event.target.value)
                    }
                    placeholder="Search incomplete entries..."
                    className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm font-bold text-white outline-none placeholder:text-neutral-600 focus:border-violet-300"
                  />
                </label>
              </section>

              <section className="grid gap-3 sm:grid-cols-2">
                {visibleEntries.map((entry) => {
                  const entryId = String(entry.id);
                  const isSelected = selectedEntryIds.includes(entryId);
                  const gaps = getRequiredEditorialGaps(entry);

                  return (
                    <button
                      key={entryId}
                      type="button"
                      onClick={() => toggleEntry(entryId)}
                      className={`rounded-2xl border p-4 text-left transition ${
                        isSelected
                          ? "border-violet-300 bg-violet-300/10"
                          : "border-neutral-800 bg-neutral-900 hover:border-neutral-600"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-base font-black text-white">
                            {entry.word || "Untitled entry"}
                          </p>
                          <p className="mt-1 text-xs font-bold text-neutral-500">
                            {entry.status} · {gaps.length} required gap
                            {gaps.length === 1 ? "" : "s"}
                          </p>
                        </div>
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-xs font-black ${
                            isSelected
                              ? "border-violet-200 bg-violet-300 text-black"
                              : "border-neutral-700 text-transparent"
                          }`}
                        >
                          ✓
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {gaps.slice(0, 4).map((gap) => (
                          <span
                            key={gap.key}
                            className="rounded-full border border-neutral-700 bg-neutral-950 px-2 py-1 text-[10px] font-bold text-neutral-400"
                          >
                            {gap.label}
                          </span>
                        ))}
                        {gaps.length > 4 && (
                          <span className="rounded-full border border-neutral-700 bg-neutral-950 px-2 py-1 text-[10px] font-bold text-neutral-500">
                            +{gaps.length - 4}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </section>
            </>
          ) : (
            <>
              <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
                      Batch progress
                    </p>
                    <p className="mt-2 text-sm font-bold text-neutral-300">
                      {generatedCount} of {jobs.length} generated · {completedCount} reviewed · {readyCount} ready
                      {errorCount > 0 ? ` · ${errorCount} failed` : ""}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={resetBatch}
                    disabled={isGenerating || isApplying}
                    className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-black text-neutral-300 hover:border-neutral-500 hover:text-white disabled:opacity-40"
                  >
                    New batch
                  </button>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {jobs.map((job, index) => (
                    <button
                      key={job.entry.id}
                      type="button"
                      onClick={() => setActiveJobIndex(index)}
                      className={`rounded-xl border px-3 py-3 text-left transition ${
                        index === activeJobIndex
                          ? "border-violet-300 bg-violet-300/10"
                          : "border-neutral-800 bg-neutral-950 hover:border-neutral-600"
                      }`}
                    >
                      <p className="truncate text-sm font-black text-white">
                        {job.entry.word || "Untitled entry"}
                      </p>
                      <p
                        className={`mt-1 text-[10px] font-black uppercase tracking-[0.12em] ${
                          job.status === "error"
                            ? "text-red-300"
                            : job.status === "complete"
                              ? "text-green-300"
                              : job.status === "ready"
                                ? "text-violet-300"
                                : "text-neutral-500"
                        }`}
                      >
                        {statusLabel(job.status)}
                      </p>
                    </button>
                  ))}
                </div>
              </section>

              {activeJob && (
                <section className="rounded-3xl border border-violet-300/20 bg-neutral-900 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300/70">
                        Reviewing {activeJobIndex + 1} of {jobs.length}
                      </p>
                      <h3 className="mt-2 text-2xl font-black text-white">
                        {activeJob.entry.word || "Untitled entry"}
                      </h3>
                      <p className="mt-1 text-sm text-neutral-400">
                        {getRequiredEditorialGapCount(activeJob.entry)} required gaps currently remain.
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveJobIndex((current) => Math.max(0, current - 1))}
                        disabled={activeJobIndex === 0}
                        className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-black text-neutral-300 disabled:opacity-30"
                      >
                        ← Previous
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setActiveJobIndex((current) =>
                            Math.min(jobs.length - 1, current + 1),
                          )
                        }
                        disabled={activeJobIndex >= jobs.length - 1}
                        className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-black text-neutral-300 disabled:opacity-30"
                      >
                        Next →
                      </button>
                    </div>
                  </div>

                  {activeJob.status === "generating" || activeJob.status === "queued" ? (
                    <div className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-950 p-5 text-center text-sm font-bold text-neutral-400">
                      {activeJob.status === "generating"
                        ? "Generating exact field drafts..."
                        : "Waiting in the generation queue..."}
                    </div>
                  ) : activeJob.status === "error" ? (
                    <div className="mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-bold text-red-100">
                      {activeJob.error}
                    </div>
                  ) : activeJob.status === "complete" ? (
                    <div className="mt-5 rounded-2xl border border-green-400/25 bg-green-400/10 p-5">
                      <p className="text-lg font-black text-green-100">Entry review complete</p>
                      <p className="mt-2 text-sm text-green-100/70">
                        {activeJob.appliedCount} applied · {activeJob.dismissedCount} dismissed
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                        <div>
                          <p className="text-sm font-black text-white">
                            {activeSuggestions.length} suggestion
                            {activeSuggestions.length === 1 ? "" : "s"} remaining
                          </p>
                          <p className="mt-1 text-xs text-neutral-500">
                            {activeJob.model ? `Model: ${activeJob.model}` : "Human approval required"}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={applySafeDrafts}
                          disabled={activeSafeDrafts.length === 0 || isApplying}
                          className="rounded-xl bg-violet-300 px-4 py-3 text-sm font-black text-black transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                        >
                          {isApplyingSafeDrafts
                            ? "Saving safe drafts..."
                            : `Apply safe drafts · ${activeSafeDrafts.length}`}
                        </button>
                      </div>

                      <div className="mt-4 space-y-3">
                        {activeSuggestions.map((suggestion) => (
                          <article
                            key={suggestion.id}
                            className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-black text-white">
                                  {suggestion.fieldLabel}
                                </p>
                                <p className="mt-1 font-mono text-[11px] text-neutral-600">
                                  {suggestion.fieldPath}
                                </p>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-violet-200">
                                  {suggestion.confidence} confidence
                                </span>
                                {suggestion.requiresVerification && (
                                  <span className="rounded-full border border-yellow-300/20 bg-yellow-300/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-yellow-200">
                                    Verify
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="mt-4 rounded-xl border border-violet-300/20 bg-violet-300/10 p-4">
                              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-200/60">
                                Suggested replacement
                              </p>
                              <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-6 text-violet-50">
                                {suggestion.suggestedValue || "No draft returned"}
                              </p>
                            </div>

                            <p className="mt-3 text-sm leading-6 text-neutral-400">
                              {suggestion.reason}
                            </p>

                            {suggestion.verificationNote && (
                              <p className="mt-3 rounded-xl border border-yellow-300/20 bg-yellow-300/10 p-3 text-xs leading-5 text-yellow-100/80">
                                Verify: {suggestion.verificationNote}
                              </p>
                            )}

                            <div className="mt-4 grid gap-2 sm:grid-cols-2">
                              <button
                                type="button"
                                onClick={() => void applySuggestion(suggestion)}
                                disabled={
                                  isApplying || !suggestion.suggestedValue.trim()
                                }
                                className="rounded-xl bg-green-300 px-4 py-3 text-sm font-black text-black transition hover:bg-green-200 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                              >
                                {applyingSuggestionId === suggestion.id
                                  ? "Applying..."
                                  : "Apply field"}
                              </button>
                              <button
                                type="button"
                                onClick={() => dismissSuggestion(suggestion)}
                                disabled={isApplying}
                                className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-black text-neutral-300 transition hover:border-red-300 hover:text-red-200 disabled:opacity-40"
                              >
                                Dismiss
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

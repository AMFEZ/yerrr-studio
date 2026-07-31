"use client";

import { useMemo, useState } from "react";

import type {
  EditorialStatus,
  Entry,
  EntryStatus,
} from "@/types/entry";
import {
  EDITORIAL_RULESET_VERSION,
  getRequiredEditorialGapCount,
} from "@/lib/editorialCompletionRules";

type SafeEntryStatus = Extract<
  EntryStatus,
  "Draft" | "Needs Review" | "Verified"
>;

type SafeMeaningStatus = Extract<
  EditorialStatus,
  "Draft" | "Needs Review" | "Verified"
>;

type TriagePriority = "high" | "medium" | "low";
type RecommendationState =
  | "pending"
  | "applying"
  | "applied"
  | "dismissed"
  | "error";

type TriageRecommendation = {
  entryId: string;
  entryWord: string;
  currentEntryStatus: string;
  currentMeaningStatuses: string[];
  priority: TriagePriority;
  recommendedEntryStatus: SafeEntryStatus;
  recommendedMeaningStatus: SafeMeaningStatus;
  reason: string;
  nextAction: string;
  requiresHumanReview: boolean;
  missingRequiredFields: string[];
};

type TriageResult = {
  summary: string;
  entryCount: number;
  recommendations: TriageRecommendation[];
};

type TriageResponse = {
  result?: TriageResult;
  model?: string;
  error?: string;
};

type AIBatchTriagePanelProps = {
  entries: Entry[];
  onClose: () => void;
  onOpenEntry?: (entry: Entry) => void;
  onFillMissingFields?: (entry: Entry) => void;
  onApplyTriage: (
    entryId: string,
    entryStatus: SafeEntryStatus,
    meaningStatus: SafeMeaningStatus,
  ) => Promise<void>;
};

const MAX_BATCH_SIZE = 20;
const DEFAULT_SELECTION_SIZE = 10;

function priorityClasses(priority: TriagePriority) {
  if (priority === "high") {
    return "border-red-400/30 bg-red-400/10 text-red-200";
  }

  if (priority === "medium") {
    return "border-yellow-400/30 bg-yellow-400/10 text-yellow-200";
  }

  return "border-sky-400/30 bg-sky-400/10 text-sky-200";
}

function stateLabel(state: RecommendationState) {
  if (state === "applying") return "Applying";
  if (state === "applied") return "Applied";
  if (state === "dismissed") return "Dismissed";
  if (state === "error") return "Failed";
  return "Pending";
}

function recommendationSummary(recommendation: TriageRecommendation) {
  const count = recommendation.missingRequiredFields.length;

  if (count === 0) {
    return "All required content fields are populated. The entry is ready for a final human review.";
  }

  return `${count} required field${count === 1 ? " is" : "s are"} missing. Generate field suggestions before advancing this entry.`;
}

function statusActionLabel(currentStatus: string, recommendedStatus: string) {
  if (!currentStatus || currentStatus === recommendedStatus) {
    return `Keep at ${recommendedStatus}`;
  }

  if (recommendedStatus === "Draft") {
    return `Move back to ${recommendedStatus}`;
  }

  return `Move to ${recommendedStatus}`;
}

export function AIBatchTriagePanel({
  entries,
  onClose,
  onOpenEntry,
  onFillMissingFields,
  onApplyTriage,
}: AIBatchTriagePanelProps) {
  const candidates = useMemo(() => {
    return [...entries]
      .filter(
        (entry) =>
          entry.status !== "Published" &&
          entry.status !== "Archived",
      )
      .sort((first, second) => {
        const gapDifference =
          getRequiredEditorialGapCount(second) - getRequiredEditorialGapCount(first);

        if (gapDifference !== 0) return gapDifference;
        return first.word.localeCompare(second.word);
      });
  }, [entries]);

  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    candidates
      .slice(0, DEFAULT_SELECTION_SIZE)
      .map((entry) => String(entry.id)),
  );
  const [result, setResult] = useState<TriageResult | null>(null);
  const [modelLabel, setModelLabel] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isApplyingAll, setIsApplyingAll] = useState(false);
  const [states, setStates] = useState<
    Record<string, RecommendationState>
  >({});
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});

  const selectedEntries = useMemo(() => {
    const selectedSet = new Set(selectedIds.map(String));
    return candidates.filter((entry) => selectedSet.has(String(entry.id)));
  }, [candidates, selectedIds]);

  const recommendationCounts = useMemo(() => {
    if (!result) {
      return { pending: 0, applied: 0, dismissed: 0, failed: 0 };
    }

    return result.recommendations.reduce(
      (counts, recommendation) => {
        const state = states[recommendation.entryId] ?? "pending";

        if (state === "applied") counts.applied += 1;
        else if (state === "dismissed") counts.dismissed += 1;
        else if (state === "error") counts.failed += 1;
        else if (state !== "applying") counts.pending += 1;

        return counts;
      },
      { pending: 0, applied: 0, dismissed: 0, failed: 0 },
    );
  }, [result, states]);

  function toggleEntry(entryId: string) {
    setSelectedIds((currentIds) => {
      if (currentIds.includes(entryId)) {
        return currentIds.filter((id) => id !== entryId);
      }

      if (currentIds.length >= MAX_BATCH_SIZE) {
        return currentIds;
      }

      return [...currentIds, entryId];
    });
  }

  function selectFirstTwenty() {
    setSelectedIds(
      candidates
        .slice(0, MAX_BATCH_SIZE)
        .map((entry) => String(entry.id)),
    );
  }

  async function runTriage() {
    if (isLoading || selectedEntries.length === 0) return;

    try {
      setIsLoading(true);
      setError("");
      setResult(null);
      setStates({});
      setItemErrors({});

      const response = await fetch("/api/ai-batch-triage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entries: selectedEntries,
        }),
      });

      let payload: TriageResponse = {};

      try {
        payload = (await response.json()) as TriageResponse;
      } catch {
        payload = {};
      }

      if (!response.ok || !payload.result) {
        throw new Error(
          payload.error || "The batch-triage request failed.",
        );
      }

      setResult(payload.result);
      setModelLabel(payload.model ?? "");
      setStates(
        Object.fromEntries(
          payload.result.recommendations.map((recommendation) => [
            recommendation.entryId,
            "pending" as RecommendationState,
          ]),
        ),
      );
    } catch (triageError) {
      setError(
        triageError instanceof Error
          ? triageError.message
          : "The batch-triage request failed.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function applyRecommendation(
    recommendation: TriageRecommendation,
  ) {
    const currentState = states[recommendation.entryId] ?? "pending";

    if (currentState === "applying" || currentState === "applied") return;

    setStates((currentStates) => ({
      ...currentStates,
      [recommendation.entryId]: "applying",
    }));
    setItemErrors((currentErrors) => ({
      ...currentErrors,
      [recommendation.entryId]: "",
    }));

    try {
      await onApplyTriage(
        recommendation.entryId,
        recommendation.recommendedEntryStatus,
        recommendation.recommendedMeaningStatus,
      );

      setStates((currentStates) => ({
        ...currentStates,
        [recommendation.entryId]: "applied",
      }));
    } catch (applyError) {
      setStates((currentStates) => ({
        ...currentStates,
        [recommendation.entryId]: "error",
      }));
      setItemErrors((currentErrors) => ({
        ...currentErrors,
        [recommendation.entryId]:
          applyError instanceof Error
            ? applyError.message
            : "The triage status could not be saved.",
      }));
    }
  }

  async function applyAllPending() {
    if (!result || isApplyingAll) return;

    const pendingRecommendations = result.recommendations.filter(
      (recommendation) =>
        (states[recommendation.entryId] ?? "pending") === "pending" ||
        states[recommendation.entryId] === "error",
    );

    if (pendingRecommendations.length === 0) return;

    const confirmed = window.confirm(
      `Apply workflow status changes to ${pendingRecommendations.length} entr${
        pendingRecommendations.length === 1 ? "y" : "ies"
      }? This does not fill their missing content fields.`,
    );

    if (!confirmed) return;

    setIsApplyingAll(true);

    try {
      for (const recommendation of pendingRecommendations) {
        await applyRecommendation(recommendation);
      }
    } finally {
      setIsApplyingAll(false);
    }
  }

  function dismissRecommendation(entryId: string) {
    setStates((currentStates) => ({
      ...currentStates,
      [entryId]: "dismissed",
    }));
    setItemErrors((currentErrors) => ({
      ...currentErrors,
      [entryId]: "",
    }));
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close AI batch triage"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside className="absolute bottom-0 right-0 flex h-[95vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-neutral-800 bg-neutral-950 shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-w-4xl md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0">
        <header className="border-b border-neutral-800 bg-neutral-950/95 p-5 backdrop-blur sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
<h2 className="mt-2 text-2xl font-black text-white">
                AI Batch Editorial Triage
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
                Sort entries into the right workflow stage, then open exact AI
                field suggestions for entries that still need content. Rules {EDITORIAL_RULESET_VERSION}.
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
          {!result && (
            <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-black text-white">Choose entries</p>
                  <p className="mt-2 text-sm leading-6 text-neutral-500">
                    Select up to {MAX_BATCH_SIZE} entries. Entries with the most
                    required-field gaps appear first.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={selectFirstTwenty}
                    className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-black text-neutral-300 hover:border-fuchsia-400 hover:text-fuchsia-200"
                  >
                    Select first {Math.min(MAX_BATCH_SIZE, candidates.length)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIds([])}
                    className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-black text-neutral-300 hover:border-neutral-500 hover:text-white"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {candidates.map((entry) => {
                  const entryId = String(entry.id);
                  const isSelected = selectedIds.includes(entryId);
                  const gapCount = getRequiredEditorialGapCount(entry);

                  return (
                    <button
                      key={entryId}
                      type="button"
                      onClick={() => toggleEntry(entryId)}
                      className={`rounded-2xl border p-4 text-left transition ${
                        isSelected
                          ? "border-fuchsia-400/40 bg-fuchsia-400/10"
                          : "border-neutral-800 bg-neutral-950 hover:border-neutral-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black text-white">{entry.word}</p>
                          <p className="mt-1 text-xs text-neutral-500">
                            Current: {entry.status}
                          </p>
                        </div>
                        <span className="rounded-full bg-neutral-800 px-2 py-1 text-[10px] font-black text-neutral-300">
                          {gapCount} gap{gapCount === 1 ? "" : "s"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-neutral-300">
                  <span className="font-black text-fuchsia-200">
                    {selectedEntries.length}
                  </span>{" "}
                  selected
                </p>

                <button
                  type="button"
                  onClick={() => void runTriage()}
                  disabled={isLoading || selectedEntries.length === 0}
                  className="rounded-xl bg-fuchsia-300 px-5 py-3 text-sm font-black text-black hover:bg-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isLoading ? "Triaging entries..." : "Run batch triage"}
                </button>
              </div>
            </section>
          )}

          {error && (
            <section className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4">
              <p className="font-black text-red-100">Batch triage failed</p>
              <p className="mt-2 text-sm leading-6 text-red-100/70">
                {error}
              </p>
            </section>
          )}

          {result && (
            <div className="space-y-5">
              <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-fuchsia-300">
                        Triage results
                      </p>
                      {modelLabel && (
                        <span className="rounded-full border border-neutral-800 bg-neutral-950 px-2 py-1 text-[10px] font-bold text-neutral-600">
                          {modelLabel}
                        </span>
                      )}
                    </div>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-300">
                      {result.entryCount} entr{result.entryCount === 1 ? "y" : "ies"}{" "}
                      analyzed. Triage recommends status changes; use each
                      card&apos;s field-suggestion button for actual replacement
                      content.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setResult(null);
                      setStates({});
                      setItemErrors({});
                    }}
                    className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-xs font-black text-neutral-300 hover:border-fuchsia-400 hover:text-fuchsia-200"
                  >
                    New batch
                  </button>
                </div>

                <div className="mt-5 grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-xl bg-neutral-950 p-3">
                    <p className="text-xl font-black text-yellow-200">
                      {recommendationCounts.pending}
                    </p>
                    <p className="mt-1 text-[9px] font-black uppercase tracking-[0.12em] text-neutral-600">
                      Pending
                    </p>
                  </div>
                  <div className="rounded-xl bg-neutral-950 p-3">
                    <p className="text-xl font-black text-green-200">
                      {recommendationCounts.applied}
                    </p>
                    <p className="mt-1 text-[9px] font-black uppercase tracking-[0.12em] text-neutral-600">
                      Applied
                    </p>
                  </div>
                  <div className="rounded-xl bg-neutral-950 p-3">
                    <p className="text-xl font-black text-neutral-300">
                      {recommendationCounts.dismissed}
                    </p>
                    <p className="mt-1 text-[9px] font-black uppercase tracking-[0.12em] text-neutral-600">
                      Dismissed
                    </p>
                  </div>
                  <div className="rounded-xl bg-neutral-950 p-3">
                    <p className="text-xl font-black text-red-200">
                      {recommendationCounts.failed}
                    </p>
                    <p className="mt-1 text-[9px] font-black uppercase tracking-[0.12em] text-neutral-600">
                      Failed
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void applyAllPending()}
                  disabled={
                    isApplyingAll ||
                    recommendationCounts.pending + recommendationCounts.failed ===
                      0
                  }
                  className="mt-4 w-full rounded-xl border border-green-400/30 bg-green-400/10 px-4 py-3 text-sm font-black text-green-200 hover:bg-green-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isApplyingAll
                    ? "Applying status changes..."
                    : `Apply all workflow statuses · ${
                        recommendationCounts.pending +
                        recommendationCounts.failed
                      }`}
                </button>
              </section>

              <section className="space-y-4">
                {result.recommendations.map((recommendation) => {
                  const state = states[recommendation.entryId] ?? "pending";
                  const isFinal = state === "applied" || state === "dismissed";
                  const entry = entries.find(
                    (candidate) =>
                      String(candidate.id) === String(recommendation.entryId),
                  );
                  const gapCount = recommendation.missingRequiredFields.length;

                  return (
                    <article
                      key={recommendation.entryId}
                      className={`rounded-3xl border p-5 ${
                        state === "applied"
                          ? "border-green-400/30 bg-green-400/10"
                          : state === "dismissed"
                            ? "border-neutral-800 bg-neutral-900/50 opacity-70"
                            : state === "error"
                              ? "border-red-400/30 bg-red-400/10"
                              : "border-neutral-800 bg-neutral-900"
                      }`}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="text-xl font-black text-white">
                            {recommendation.entryWord}
                          </h3>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span
                              className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${priorityClasses(
                                recommendation.priority,
                              )}`}
                            >
                              {recommendation.priority} priority
                            </span>
                            <span className="rounded-full bg-neutral-800 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-neutral-300">
                              {stateLabel(state)}
                            </span>
                          </div>
                        </div>

                        {entry && onOpenEntry && (
                          <button
                            type="button"
                            onClick={() => onOpenEntry(entry)}
                            className="shrink-0 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-black text-neutral-300 hover:border-fuchsia-400 hover:text-fuchsia-200"
                          >
                            Open entry
                          </button>
                        )}
                      </div>

                      <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                        <p className="text-sm font-black text-white">
                          {recommendationSummary(recommendation)}
                        </p>
                        <p className="mt-2 text-sm text-neutral-500">
                          Batch Triage changes workflow statuses only. It does
                          not fill definitions, categories, tones, or other
                          content fields.
                        </p>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-neutral-600">
                            Entry workflow
                          </p>
                          <p className="mt-2 text-sm font-black text-white">
                            {statusActionLabel(
                              recommendation.currentEntryStatus,
                              recommendation.recommendedEntryStatus,
                            )}
                          </p>
                          <p className="mt-1 text-xs text-neutral-500">
                            {recommendation.currentEntryStatus || "Unknown"} →{" "}
                            {recommendation.recommendedEntryStatus}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-neutral-600">
                            Meaning workflow
                          </p>
                          <p className="mt-2 text-sm font-black text-white">
                            Set meanings to {recommendation.recommendedMeaningStatus}
                          </p>
                          <p className="mt-1 text-xs text-neutral-500">
                            {recommendation.currentMeaningStatuses.join(", ") ||
                              "Unknown"}{" "}
                            → {recommendation.recommendedMeaningStatus}
                          </p>
                        </div>
                      </div>

                      {gapCount > 0 && (
                        <div className="mt-4 rounded-2xl border border-yellow-400/20 bg-yellow-400/5 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-black uppercase tracking-[0.15em] text-yellow-200">
                              Missing required fields
                            </p>
                            <span className="rounded-full bg-yellow-400/10 px-2 py-1 text-[10px] font-black text-yellow-200">
                              {gapCount}
                            </span>
                          </div>

                          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                            {recommendation.missingRequiredFields.map((field) => (
                              <li
                                key={field}
                                className="flex items-start gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs leading-5 text-neutral-300"
                              >
                                <span className="mt-0.5 text-yellow-300">•</span>
                                <span>{field}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {entry && onFillMissingFields && gapCount > 0 && (
                        <button
                          type="button"
                          onClick={() => onFillMissingFields(entry)}
                          className="mt-4 w-full rounded-xl bg-violet-400 px-4 py-3 text-sm font-black text-black shadow-lg transition hover:bg-violet-300"
                        >
                          ✨ Generate field suggestions for {recommendation.entryWord}
                        </button>
                      )}

                      <details className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                        <summary className="cursor-pointer text-xs font-black text-neutral-400">
                          Why this workflow status?
                        </summary>
                        <p className="mt-3 text-sm leading-6 text-neutral-400">
                          {recommendation.reason}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-neutral-600">
                          {recommendation.nextAction}
                        </p>
                      </details>

                      {itemErrors[recommendation.entryId] && (
                        <p className="mt-3 text-sm font-bold text-red-200">
                          {itemErrors[recommendation.entryId]}
                        </p>
                      )}

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => void applyRecommendation(recommendation)}
                          disabled={isFinal || state === "applying"}
                          className="rounded-xl border border-green-400/30 bg-green-400/10 px-4 py-3 text-sm font-black text-green-200 hover:bg-green-400/20 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          {state === "applying"
                            ? "Applying..."
                            : state === "applied"
                              ? "Status applied"
                              : state === "error"
                                ? "Retry status change"
                                : "Apply status change"}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            dismissRecommendation(recommendation.entryId)
                          }
                          disabled={isFinal || state === "applying"}
                          className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-black text-neutral-300 hover:border-red-400 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          Dismiss
                        </button>
                      </div>
                    </article>
                  );
                })}
              </section>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

export default AIBatchTriagePanel;

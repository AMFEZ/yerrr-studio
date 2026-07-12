"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type { Entry } from "@/types/entry";

import type {
  AIBatchTriageResponse,
  AIBatchTriageResult,
  AITriageItem,
  AITriageNextAction,
  AITriagePriority,
} from "@/types/aiBatchTriage";

type AIBatchTriagePanelProps = {
  entries: Entry[];
  onClose: () => void;
  onOpenEntry?: (entry: Entry) => void;
};

const MAX_SELECTED_ENTRIES = 20;

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

function getMeaningField(
  meaning: unknown,
  aliases: string[],
) {
  return readField(
    meaning,
    aliases,
  );
}

function getEntryGapScore(entry: Entry) {
  let score = 0;

  const normalizedStatus =
    normalize(entry.status);

  if (
    normalizedStatus.includes("draft")
  ) {
    score += 25;
  }

  if (
    normalizedStatus.includes("review")
  ) {
    score += 30;
  }

  if (
    !String(
      entry.pronunciation ?? "",
    ).trim()
  ) {
    score += 5;
  }

  const meanings = Array.isArray(
    entry.meanings,
  )
    ? entry.meanings
    : [];

  if (meanings.length === 0) {
    return score + 100;
  }

  meanings.forEach((meaning) => {
    const definition =
      getMeaningField(
        meaning,
        [
          "definition",
          "meaning",
          "gloss",
        ],
      );

    const plainEnglish =
      getMeaningField(
        meaning,
        [
          "plainEnglish",
          "plain_english",
          "plainMeaning",
        ],
      );

    const example =
      getMeaningField(
        meaning,
        [
          "example",
          "exampleSentence",
          "example_sentence",
          "usageExample",
        ],
      );

    const culturalContext =
      getMeaningField(
        meaning,
        [
          "culturalContext",
          "cultural_context",
          "culture",
          "context",
        ],
      );

    const sources =
      getMeaningField(
        meaning,
        [
          "sources",
          "source",
          "citations",
          "references",
        ],
      );

    const verificationStatus =
      getMeaningField(
        meaning,
        [
          "verificationStatus",
          "verification_status",
          "verified",
        ],
      );

    if (!definition) {
      score += 40;
    }

    if (!plainEnglish) {
      score += 12;
    }

    if (!example) {
      score += 10;
    }

    if (!culturalContext) {
      score += 10;
    }

    if (!sources) {
      score += 14;
    }

    if (!verificationStatus) {
      score += 10;
    }
  });

  return score;
}

function priorityLabel(
  priority: AITriagePriority,
) {
  if (priority === "urgent") {
    return "Urgent";
  }

  if (priority === "high") {
    return "High";
  }

  if (priority === "medium") {
    return "Medium";
  }

  return "Low";
}

function priorityClasses(
  priority: AITriagePriority,
) {
  if (priority === "urgent") {
    return {
      card:
        "border-red-400/40 bg-red-400/10",

      badge:
        "bg-red-400 text-black",

      score:
        "text-red-200",
    };
  }

  if (priority === "high") {
    return {
      card:
        "border-orange-400/30 bg-orange-400/10",

      badge:
        "bg-orange-300 text-black",

      score:
        "text-orange-200",
    };
  }

  if (priority === "medium") {
    return {
      card:
        "border-yellow-400/30 bg-yellow-400/10",

      badge:
        "bg-yellow-300 text-black",

      score:
        "text-yellow-200",
    };
  }

  return {
    card:
      "border-green-400/25 bg-green-400/10",

    badge:
      "bg-green-300 text-black",

    score:
      "text-green-200",
  };
}

function actionLabel(
  action: AITriageNextAction,
) {
  if (action === "full_entry_review") {
    return "Run full entry review";
  }

  if (
    action === "fill_missing_fields"
  ) {
    return "Fill missing fields";
  }

  if (action === "verify_sources") {
    return "Verify sources";
  }

  if (action === "check_duplicates") {
    return "Check semantic duplicates";
  }

  if (
    action === "ready_for_final_review"
  ) {
    return "Final human review";
  }

  return "Open in Entry Editor";
}

function formatTriageReport(
  result: AIBatchTriageResult,
) {
  return [
    "YERRR Studio AI Batch Editorial Triage",
    `Entries analyzed: ${result.analyzedEntryCount}`,
    "",
    result.summary,
    "",
    ...result.items.flatMap(
      (item, index) => [
        `${index + 1}. ${item.entryWord}`,
        `Priority: ${priorityLabel(
          item.priority,
        )}`,
        `Readiness score: ${item.readinessScore}/100`,
        `Primary reason: ${item.primaryReason}`,
        `Recommended next action: ${actionLabel(
          item.recommendedNextAction,
        )}`,
        `Issues: ${
          item.issues.join("; ") ||
          "None listed"
        }`,
        `Review focus: ${
          item.reviewFocus.join("; ") ||
          "General editorial review"
        }`,
        `Human verification: ${
          item.requiresHumanVerification
            ? "Required"
            : "Standard final review"
        }`,
        "",
      ],
    ),
    "No entries were edited or saved automatically.",
  ].join("\n");
}

export function AIBatchTriagePanel({
  entries,
  onClose,
  onOpenEntry,
}: AIBatchTriagePanelProps) {
  const [search, setSearch] =
    useState("");

  const [
    selectedEntryIds,
    setSelectedEntryIds,
  ] = useState<string[]>([]);

  const [result, setResult] =
    useState<AIBatchTriageResult | null>(
      null,
    );

  const [modelLabel, setModelLabel] =
    useState("");

  const [error, setError] =
    useState("");

  const [selectionError, setSelectionError] =
    useState("");

  const [isLoading, setIsLoading] =
    useState(false);

  const [copied, setCopied] =
    useState(false);

  const sortedEntries = useMemo(() => {
    return [...entries].sort(
      (first, second) =>
        first.word.localeCompare(
          second.word,
        ),
    );
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const normalizedSearch =
      normalize(search);

    if (!normalizedSearch) {
      return sortedEntries;
    }

    return sortedEntries.filter(
      (entry) => {
        const searchableText = normalize(
          [
            entry.word,
            entry.slug,
            entry.status,
            entry.alternateSpellings,
          ].join(" "),
        );

        return searchableText.includes(
          normalizedSearch,
        );
      },
    );
  }, [search, sortedEntries]);

  const suggestedEntries =
    useMemo(() => {
      return [...entries]
        .map((entry) => ({
          entry,
          gapScore:
            getEntryGapScore(entry),
        }))
        .sort(
          (first, second) =>
            second.gapScore -
              first.gapScore ||
            first.entry.word.localeCompare(
              second.entry.word,
            ),
        )
        .filter(
          (item) =>
            item.gapScore > 0,
        )
        .slice(
          0,
          MAX_SELECTED_ENTRIES,
        )
        .map((item) => item.entry);
    }, [entries]);

  const selectedEntries = useMemo(() => {
    const selectedSet = new Set(
      selectedEntryIds,
    );

    return entries.filter((entry) =>
      selectedSet.has(
        String(entry.id),
      ),
    );
  }, [entries, selectedEntryIds]);

  useEffect(() => {
    const activeIds = new Set(
      entries.map((entry) =>
        String(entry.id),
      ),
    );

    setSelectedEntryIds(
      (currentIds) =>
        currentIds.filter((id) =>
          activeIds.has(id),
        ),
    );
  }, [entries]);

  function toggleEntry(
    entryId: string,
  ) {
    setSelectionError("");
    setResult(null);
    setCopied(false);

    setSelectedEntryIds(
      (currentIds) => {
        if (
          currentIds.includes(entryId)
        ) {
          return currentIds.filter(
            (id) => id !== entryId,
          );
        }

        if (
          currentIds.length >=
          MAX_SELECTED_ENTRIES
        ) {
          setSelectionError(
            `Select no more than ${MAX_SELECTED_ENTRIES} entries at once.`,
          );

          return currentIds;
        }

        return [
          ...currentIds,
          entryId,
        ];
      },
    );
  }

  function selectSuggestedQueue() {
    setSelectedEntryIds(
      suggestedEntries.map((entry) =>
        String(entry.id),
      ),
    );

    setSelectionError("");
    setResult(null);
    setCopied(false);
  }

  function selectVisibleEntries() {
    const visibleIds =
      filteredEntries
        .slice(
          0,
          MAX_SELECTED_ENTRIES,
        )
        .map((entry) =>
          String(entry.id),
        );

    setSelectedEntryIds(
      visibleIds,
    );

    setSelectionError(
      filteredEntries.length >
        MAX_SELECTED_ENTRIES
        ? `The first ${MAX_SELECTED_ENTRIES} visible entries were selected.`
        : "",
    );

    setResult(null);
    setCopied(false);
  }

  function clearSelection() {
    setSelectedEntryIds([]);
    setSelectionError("");
    setResult(null);
    setCopied(false);
  }

  async function runTriage() {
    if (
      selectedEntries.length === 0 ||
      isLoading
    ) {
      return;
    }

    try {
      setIsLoading(true);
      setError("");
      setResult(null);
      setModelLabel("");
      setCopied(false);

      const response = await fetch(
        "/api/ai-batch-triage",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            entries:
              selectedEntries,
          }),
        },
      );

      let payload:
        AIBatchTriageResponse = {};

      try {
        payload =
          (await response.json()) as AIBatchTriageResponse;
      } catch {
        payload = {};
      }

      if (
        !response.ok ||
        !payload.result
      ) {
        throw new Error(
          payload.error ||
            "The batch editorial triage failed.",
        );
      }

      setResult(payload.result);
      setModelLabel(
        payload.model ?? "",
      );
    } catch (triageError) {
      setError(
        triageError instanceof Error
          ? triageError.message
          : "The batch editorial triage failed.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function copyReport() {
    if (!result) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        formatTriageReport(result),
      );

      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 1_800);
    } catch {
      setCopied(false);
    }
  }

  function openTriageEntry(
    item: AITriageItem,
  ) {
    const entry = entries.find(
      (candidate) =>
        String(candidate.id) ===
        item.entryId,
    );

    if (!entry) {
      return;
    }

    onClose();
    onOpenEntry?.(entry);
  }

  return (
    <div
      className="fixed inset-0 z-[82] bg-black/80 backdrop-blur-sm"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close AI batch triage"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-batch-triage-title"
        className="absolute bottom-0 right-0 flex h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-neutral-800 bg-neutral-950 shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-w-4xl md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0"
      >
        <header className="border-b border-neutral-800 bg-neutral-950/95 p-5 backdrop-blur sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-fuchsia-300">
                Alpha 5.8
              </p>

              <h2
                id="ai-batch-triage-title"
                className="mt-2 text-2xl font-black text-white"
              >
                AI Batch Editorial Triage
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
                Select up to 20 entries and build a
                prioritized human editorial queue.
                Nothing is written to Supabase.
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
          <div className="space-y-5">
            <section className="rounded-3xl border border-fuchsia-400/20 bg-fuchsia-400/10 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-black text-fuchsia-100">
                    Build the triage batch
                  </p>

                  <p className="mt-2 text-sm leading-6 text-fuchsia-100/70">
                    The suggested queue uses local
                    completeness checks. The AI then
                    performs the editorial ranking.
                  </p>
                </div>

                <div className="rounded-2xl border border-fuchsia-300/20 bg-black/20 px-4 py-3 text-center">
                  <p className="text-2xl font-black text-white">
                    {
                      selectedEntryIds.length
                    }
                    /{MAX_SELECTED_ENTRIES}
                  </p>

                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-fuchsia-200/60">
                    Selected
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={
                    selectSuggestedQueue
                  }
                  disabled={
                    suggestedEntries.length ===
                    0
                  }
                  className="rounded-xl bg-fuchsia-300 px-3 py-3 text-xs font-black text-black hover:bg-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Suggested queue
                </button>

                <button
                  type="button"
                  onClick={
                    selectVisibleEntries
                  }
                  disabled={
                    filteredEntries.length ===
                    0
                  }
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-xs font-black text-neutral-300 hover:border-fuchsia-400 hover:text-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Select visible
                </button>

                <button
                  type="button"
                  onClick={
                    clearSelection
                  }
                  disabled={
                    selectedEntryIds.length ===
                    0
                  }
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-xs font-black text-neutral-300 hover:border-red-400 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Clear selection
                </button>
              </div>

              <input
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value,
                  )
                }
                placeholder="Search entries to select..."
                className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-fuchsia-400"
              />

              {selectionError && (
                <p className="mt-3 text-xs font-bold text-yellow-200">
                  {selectionError}
                </p>
              )}

              <div className="mt-4 max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
                {filteredEntries.length ===
                0 ? (
                  <p className="p-4 text-center text-sm text-neutral-600">
                    No entries matched.
                  </p>
                ) : (
                  filteredEntries.map(
                    (entry) => {
                      const entryId =
                        String(entry.id);

                      const isSelected =
                        selectedEntryIds.includes(
                          entryId,
                        );

                      return (
                        <button
                          type="button"
                          key={entryId}
                          onClick={() =>
                            toggleEntry(
                              entryId,
                            )
                          }
                          className={`flex w-full items-center justify-between gap-4 rounded-xl border p-3 text-left transition ${
                            isSelected
                              ? "border-fuchsia-400 bg-fuchsia-400/10"
                              : "border-neutral-800 bg-neutral-900 hover:border-neutral-700"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="truncate font-black text-white">
                              {
                                entry.word
                              }
                            </p>

                            <p className="mt-1 text-xs text-neutral-500">
                              {
                                entry.status
                              }
                              {" · "}
                              {Array.isArray(
                                entry.meanings,
                              )
                                ? entry
                                    .meanings
                                    .length
                                : 0}{" "}
                              meaning(s)
                            </p>
                          </div>

                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-black ${
                              isSelected
                                ? "border-fuchsia-300 bg-fuchsia-300 text-black"
                                : "border-neutral-700 text-neutral-600"
                            }`}
                          >
                            {isSelected
                              ? "✓"
                              : "+"}
                          </span>
                        </button>
                      );
                    },
                  )
                )}
              </div>

              <button
                type="button"
                onClick={() =>
                  void runTriage()
                }
                disabled={
                  selectedEntries.length ===
                    0 ||
                  isLoading
                }
                className="mt-4 w-full rounded-xl bg-fuchsia-300 px-4 py-3 text-sm font-black text-black hover:bg-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isLoading
                  ? "Prioritizing entries..."
                  : `Run triage · ${selectedEntries.length}`}
              </button>
            </section>

            {error && (
              <section className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4">
                <p className="font-black text-red-100">
                  Batch triage failed
                </p>

                <p className="mt-2 text-sm leading-6 text-red-100/70">
                  {error}
                </p>
              </section>
            )}

            {result && (
              <>
                <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-2xl bg-neutral-950 p-4">
                      <p className="text-2xl font-black text-white">
                        {
                          result.analyzedEntryCount
                        }
                      </p>

                      <p className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-neutral-600">
                        Analyzed
                      </p>
                    </div>

                    <div className="rounded-2xl bg-neutral-950 p-4">
                      <p className="text-2xl font-black text-fuchsia-200">
                        {
                          result.items.filter(
                            (item) =>
                              item.priority ===
                                "urgent" ||
                              item.priority ===
                                "high",
                          ).length
                        }
                      </p>

                      <p className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-neutral-600">
                        High priority
                      </p>
                    </div>

                    <div className="rounded-2xl bg-neutral-950 p-4">
                      <p className="truncate text-sm font-black text-neutral-300">
                        {modelLabel ||
                          "AI"}
                      </p>

                      <p className="mt-2 text-[9px] font-black uppercase tracking-[0.14em] text-neutral-600">
                        Model
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-neutral-400">
                    {result.summary}
                  </p>
                </section>

                <section>
                  <div className="mb-3 flex items-center justify-between gap-4">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500">
                      Prioritized queue
                    </p>

                    <button
                      type="button"
                      onClick={() =>
                        void copyReport()
                      }
                      className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-black text-neutral-300 hover:border-fuchsia-400 hover:text-fuchsia-200"
                    >
                      {copied
                        ? "Report copied"
                        : "Copy report"}
                    </button>
                  </div>

                  <div className="space-y-4">
                    {result.items.map(
                      (item, index) => {
                        const classes =
                          priorityClasses(
                            item.priority,
                          );

                        return (
                          <article
                            key={
                              item.entryId
                            }
                            className={`rounded-3xl border p-5 ${classes.card}`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-black text-neutral-300">
                                    #{index + 1}
                                  </span>

                                  <span
                                    className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${classes.badge}`}
                                  >
                                    {priorityLabel(
                                      item.priority,
                                    )}
                                  </span>
                                </div>

                                <h3 className="mt-3 text-xl font-black text-white">
                                  {
                                    item.entryWord
                                  }
                                </h3>

                                <p className="mt-1 text-xs font-bold text-neutral-500">
                                  {actionLabel(
                                    item.recommendedNextAction,
                                  )}
                                </p>
                              </div>

                              <div className="text-right">
                                <p
                                  className={`text-3xl font-black ${classes.score}`}
                                >
                                  {
                                    item.readinessScore
                                  }
                                </p>

                                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-neutral-600">
                                  Readiness
                                </p>
                              </div>
                            </div>

                            <p className="mt-4 text-sm font-bold leading-6 text-white">
                              {
                                item.primaryReason
                              }
                            </p>

                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-red-200">
                                  Issues
                                </p>

                                {item.issues
                                  .length ===
                                0 ? (
                                  <p className="mt-3 text-xs text-neutral-500">
                                    No specific
                                    issues listed.
                                  </p>
                                ) : (
                                  <div className="mt-3 space-y-2">
                                    {item.issues.map(
                                      (
                                        issue,
                                        issueIndex,
                                      ) => (
                                        <p
                                          key={`${issue}-${issueIndex}`}
                                          className="text-xs leading-5 text-neutral-300"
                                        >
                                          •{" "}
                                          {
                                            issue
                                          }
                                        </p>
                                      ),
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200">
                                  Review focus
                                </p>

                                {item.reviewFocus
                                  .length ===
                                0 ? (
                                  <p className="mt-3 text-xs text-neutral-500">
                                    General
                                    editorial
                                    review.
                                  </p>
                                ) : (
                                  <div className="mt-3 space-y-2">
                                    {item.reviewFocus.map(
                                      (
                                        focus,
                                        focusIndex,
                                      ) => (
                                        <p
                                          key={`${focus}-${focusIndex}`}
                                          className="text-xs leading-5 text-neutral-300"
                                        >
                                          •{" "}
                                          {
                                            focus
                                          }
                                        </p>
                                      ),
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {item.requiresHumanVerification && (
                              <div className="mt-4 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-yellow-200">
                                  Human verification required
                                </p>

                                <p className="mt-2 text-xs leading-5 text-yellow-100/70">
                                  Confirm factual,
                                  cultural, and
                                  source claims before
                                  publishing.
                                </p>
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                openTriageEntry(
                                  item,
                                )
                              }
                              className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-black text-neutral-300 hover:border-fuchsia-400 hover:text-fuchsia-200"
                            >
                              Open{" "}
                              {
                                item.entryWord
                              }{" "}
                              in editor
                            </button>
                          </article>
                        );
                      },
                    )}
                  </div>
                </section>

                {result.queueNotes.length >
                  0 && (
                  <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500">
                      Queue notes
                    </p>

                    <div className="mt-4 space-y-2">
                      {result.queueNotes.map(
                        (note, index) => (
                          <div
                            key={`${note}-${index}`}
                            className="flex gap-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3"
                          >
                            <span className="text-neutral-600">
                              □
                            </span>

                            <p className="text-xs leading-5 text-neutral-300">
                              {note}
                            </p>
                          </div>
                        ),
                      )}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </div>

        <footer className="border-t border-neutral-800 bg-neutral-950 p-4 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() =>
                void copyReport()
              }
              disabled={!result}
              className="flex-1 rounded-xl bg-fuchsia-300 px-4 py-3 text-sm font-black text-black hover:bg-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {copied
                ? "Report copied"
                : "Copy triage report"}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-black text-neutral-300 hover:border-neutral-500 hover:text-white"
            >
              Close triage
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}

export default AIBatchTriagePanel;
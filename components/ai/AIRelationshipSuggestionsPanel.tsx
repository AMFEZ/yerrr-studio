"use client";

import { useMemo, useState, type ChangeEvent } from "react";

import type { Entry } from "@/types/entry";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

type RelationshipType =
  | "similar_meaning"
  | "opposite"
  | "variation"
  | "response"
  | "contextually_related"
  | "broader_term"
  | "narrower_term";

type RelationshipConfidence = "low" | "medium" | "high";

type RelationshipSuggestion = {
  id: string;
  sourceEntryId: string;
  sourceWord: string;
  targetEntryId: string;
  targetWord: string;
  relationshipType: RelationshipType;
  strength: number;
  confidence: RelationshipConfidence;
  reason: string;
  verificationNote: string;
};

type RelationshipSuggestionResult = {
  summary: string;
  suggestionCount: number;
  suggestions: RelationshipSuggestion[];
};

type RelationshipSuggestionResponse = {
  result?: RelationshipSuggestionResult;
  model?: string;
  error?: string;
};

type AIRelationshipSuggestionsPanelProps = {
  entries: Entry[];
  isOnline: boolean;
  onClose: () => void;
  onOpenEntry?: (entry: Entry) => void;
  onGraphChanged?: () => void;
};

const MAX_CONTEXT_ENTRIES = 60;

const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  similar_meaning: "Similar meaning",
  opposite: "Opposite",
  variation: "Variation",
  response: "Natural response",
  contextually_related: "Contextually related",
  broader_term: "Broader term",
  narrower_term: "Narrower term",
};

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectEntrySignals(entry: Entry) {
  return normalize(
    [
      entry.word,
      entry.slug,
      entry.type,
      entry.partOfSpeech,
      entry.alternateSpellings,
      ...entry.meanings.flatMap((meaning) => [
        meaning.title,
        meaning.definition,
        meaning.example,
        meaning.category,
        meaning.tone,
        meaning.conceptsText,
      ]),
    ].join(" "),
  )
    .split(" ")
    .filter((token) => token.length > 2);
}

function getCandidateScore(focus: Entry, candidate: Entry) {
  const focusSignals = new Set(collectEntrySignals(focus));
  const candidateSignals = new Set(collectEntrySignals(candidate));

  let score = 0;

  focusSignals.forEach((signal) => {
    if (candidateSignals.has(signal)) score += 1;
  });

  if (
    normalize(focus.word).includes(normalize(candidate.word)) ||
    normalize(candidate.word).includes(normalize(focus.word))
  ) {
    score += 8;
  }

  return score;
}

function buildContextEntries(entries: Entry[], focusEntryId: string) {
  if (!focusEntryId) {
    return [...entries]
      .sort((a, b) => a.word.localeCompare(b.word))
      .slice(0, MAX_CONTEXT_ENTRIES);
  }

  const focus = entries.find(
    (entry) => String(entry.id) === focusEntryId,
  );

  if (!focus) return [];

  const candidates = entries
    .filter((entry) => String(entry.id) !== focusEntryId)
    .map((entry) => ({
      entry,
      score: getCandidateScore(focus, entry),
    }))
    .sort(
      (a, b) =>
        b.score - a.score || a.entry.word.localeCompare(b.entry.word),
    )
    .slice(0, MAX_CONTEXT_ENTRIES - 1)
    .map((item) => item.entry);

  return [focus, ...candidates];
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "The relationship action failed.";
}

function confidenceClasses(confidence: RelationshipConfidence) {
  if (confidence === "high") {
    return "border-green-400/30 bg-green-400/10 text-green-100";
  }

  if (confidence === "medium") {
    return "border-yellow-400/30 bg-yellow-400/10 text-yellow-100";
  }

  return "border-neutral-700 bg-neutral-900 text-neutral-300";
}

export function AIRelationshipSuggestionsPanel({
  entries,
  isOnline,
  onClose,
  onOpenEntry,
  onGraphChanged,
}: AIRelationshipSuggestionsPanelProps) {
  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.word.localeCompare(b.word)),
    [entries],
  );

  const entryById = useMemo(
    () => new Map(entries.map((entry) => [String(entry.id), entry])),
    [entries],
  );

  const [focusEntryId, setFocusEntryId] = useState("");
  const [result, setResult] =
    useState<RelationshipSuggestionResult | null>(null);
  const [modelLabel, setModelLabel] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [applyingId, setApplyingId] = useState("");
  const [isApplyingAll, setIsApplyingAll] = useState(false);
  const [appliedCount, setAppliedCount] = useState(0);
  const [dismissedCount, setDismissedCount] = useState(0);

  const pendingSuggestions = result?.suggestions ?? [];

  async function runSuggestions() {
    if (isLoading) return;

    try {
      setIsLoading(true);
      setError("");
      setMessage("");
      setAppliedCount(0);
      setDismissedCount(0);

      const contextEntries = buildContextEntries(entries, focusEntryId);

      if (contextEntries.length < 2) {
        throw new Error(
          "At least two active entries are required to suggest relationships.",
        );
      }

      const response = await fetch("/api/ai-relationship-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: contextEntries,
          focusEntryId: focusEntryId || undefined,
        }),
      });

      let payload: RelationshipSuggestionResponse = {};

      try {
        payload = (await response.json()) as RelationshipSuggestionResponse;
      } catch {
        payload = {};
      }

      if (!response.ok || !payload.result) {
        throw new Error(
          payload.error || "The relationship suggestion scan failed.",
        );
      }

      setResult(payload.result);
      setModelLabel(payload.model ?? "");
    } catch (scanError) {
      setResult(null);
      setModelLabel("");
      setError(getErrorMessage(scanError));
    } finally {
      setIsLoading(false);
    }
  }

  function removeSuggestion(suggestionId: string) {
    setResult((currentResult) => {
      if (!currentResult) return currentResult;

      const suggestions = currentResult.suggestions.filter(
        (suggestion) => suggestion.id !== suggestionId,
      );

      return {
        ...currentResult,
        suggestionCount: suggestions.length,
        suggestions,
      };
    });
  }

  function dismissSuggestion(suggestionId: string) {
    removeSuggestion(suggestionId);
    setDismissedCount((current) => current + 1);
    setMessage("Relationship suggestion dismissed. No database change was made.");
  }

  async function applySuggestion(
    suggestion: RelationshipSuggestion,
    options: { quiet?: boolean } = {},
  ) {
    if (!isOnline) {
      throw new Error(
        "Relationship creation requires an active connection so the graph stays consistent.",
      );
    }

    const sourceEntry = entryById.get(suggestion.sourceEntryId);
    const targetEntry = entryById.get(suggestion.targetEntryId);

    if (!sourceEntry || !targetEntry) {
      throw new Error(
        "One of the suggested entries is no longer active in the lexicon.",
      );
    }

    const supabase = getSupabaseBrowserClient();

    const { data, error: rpcError } = await supabase.rpc(
      "apply_ai_entry_relationship",
      {
        p_source_entry_id: suggestion.sourceEntryId,
        p_target_entry_id: suggestion.targetEntryId,
        p_relationship_type: suggestion.relationshipType,
        p_strength: suggestion.strength,
        p_notes: [
          `AI suggestion: ${suggestion.reason}`,
          suggestion.verificationNote
            ? `Verification: ${suggestion.verificationNote}`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    );

    if (rpcError) throw rpcError;

    const responseRecord = Array.isArray(data) ? data[0] : data;
    const status =
      responseRecord && typeof responseRecord === "object" && "status" in responseRecord
        ? String(responseRecord.status)
        : "created";

    removeSuggestion(suggestion.id);
    setAppliedCount((current) => current + 1);

    window.dispatchEvent(new CustomEvent("yerrr:cloud-graph-changed"));
    onGraphChanged?.();

    if (!options.quiet) {
      setMessage(
        status === "exists"
          ? `${sourceEntry.word} and ${targetEntry.word} were already linked. The duplicate suggestion was cleared.`
          : `${sourceEntry.word} → ${targetEntry.word} was added to the Knowledge Graph.`,
      );
    }

    return status;
  }

  async function handleApplySuggestion(suggestion: RelationshipSuggestion) {
    if (applyingId || isApplyingAll) return;

    try {
      setApplyingId(suggestion.id);
      setError("");
      setMessage("");
      await applySuggestion(suggestion);
    } catch (applyError) {
      setError(getErrorMessage(applyError));
    } finally {
      setApplyingId("");
    }
  }

  async function applyAllPending() {
    if (pendingSuggestions.length === 0 || isApplyingAll) return;

    if (!isOnline) {
      setError(
        "Relationship creation requires an active connection so the graph stays consistent.",
      );
      return;
    }

    const confirmed = window.confirm(
      `Apply ${pendingSuggestions.length} pending relationship suggestion${
        pendingSuggestions.length === 1 ? "" : "s"
      } to Supabase?`,
    );

    if (!confirmed) return;

    setIsApplyingAll(true);
    setError("");
    setMessage("");

    let successCount = 0;
    const failures: string[] = [];

    for (const suggestion of [...pendingSuggestions]) {
      try {
        await applySuggestion(suggestion, { quiet: true });
        successCount += 1;
      } catch (applyError) {
        failures.push(
          `${suggestion.sourceWord} → ${suggestion.targetWord}: ${getErrorMessage(
            applyError,
          )}`,
        );
      }
    }

    setIsApplyingAll(false);

    if (successCount > 0) {
      setMessage(
        `${successCount} relationship suggestion${
          successCount === 1 ? " was" : "s were"
        } applied to the Knowledge Graph.`,
      );
    }

    if (failures.length > 0) {
      setError(failures.join(" · "));
    }
  }

  function openEntry(entryId: string) {
    const entry = entryById.get(entryId);
    if (!entry || !onOpenEntry) return;
    onOpenEntry(entry);
  }

  return (
    <div className="fixed inset-0 z-[78] bg-black/75 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close AI relationship suggestions"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside className="absolute bottom-0 right-0 flex h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-neutral-800 bg-neutral-950 shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-w-3xl md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0">
        <header className="border-b border-neutral-800 bg-neutral-950/95 p-5 backdrop-blur sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">
                Alpha 5.17H4
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">
                AI Relationship Suggestions
              </h2>
              <p className="mt-2 text-sm leading-6 text-neutral-500">
                Review entry connections, then apply approved relationships directly to the Supabase Knowledge Graph.
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
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <section className="rounded-3xl border border-emerald-400/20 bg-emerald-400/5 p-5">
            <label className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200/70">
              Focus entry
            </label>

            <select
              value={focusEntryId}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                setFocusEntryId(event.target.value);
                setResult(null);
                setError("");
                setMessage("");
              }}
              className="mt-3 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-bold text-white outline-none focus:border-emerald-400"
            >
              <option value="">Scan strongest relationships across entries</option>
              {sortedEntries.map((entry) => (
                <option key={entry.id} value={String(entry.id)}>
                  {entry.word} · {entry.status}
                </option>
              ))}
            </select>

            <p className="mt-2 text-xs leading-5 text-neutral-500">
              Selecting one entry asks AI to find its strongest links. A broad scan reviews a limited cross-section of the lexicon.
            </p>

            <button
              type="button"
              onClick={() => void runSuggestions()}
              disabled={isLoading || entries.length < 2}
              className="mt-4 w-full rounded-xl bg-emerald-300 px-4 py-3 text-sm font-black text-black hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isLoading
                ? "Scanning relationships..."
                : result
                  ? "Run relationship scan again"
                  : "Find relationship suggestions"}
            </button>
          </section>

          {!isOnline && (
            <section className="mt-4 rounded-2xl border border-yellow-400/25 bg-yellow-400/10 p-4">
              <p className="font-black text-yellow-100">Offline review only</p>
              <p className="mt-2 text-sm leading-6 text-yellow-100/70">
                You can inspect or dismiss loaded suggestions, but applying graph relationships requires a connection.
              </p>
            </section>
          )}

          {error && (
            <section className="mt-4 rounded-2xl border border-red-400/25 bg-red-400/10 p-4">
              <p className="font-black text-red-100">Relationship action failed</p>
              <p className="mt-2 text-sm leading-6 text-red-100/70">{error}</p>
            </section>
          )}

          {message && (
            <section className="mt-4 rounded-2xl border border-green-400/25 bg-green-400/10 p-4 text-sm font-bold leading-6 text-green-100">
              {message}
            </section>
          )}

          {result && (
            <>
              <section className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-black text-white">
                      {pendingSuggestions.length} pending suggestion{pendingSuggestions.length === 1 ? "" : "s"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">
                      {result.summary}
                    </p>
                    {modelLabel && (
                      <p className="mt-2 text-xs text-neutral-600">Model: {modelLabel}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-2 text-center">
                    <div className="rounded-xl bg-neutral-950 px-3 py-2">
                      <p className="font-black text-green-200">{appliedCount}</p>
                      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-neutral-600">Applied</p>
                    </div>
                    <div className="rounded-xl bg-neutral-950 px-3 py-2">
                      <p className="font-black text-red-200">{dismissedCount}</p>
                      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-neutral-600">Dismissed</p>
                    </div>
                  </div>
                </div>

                {pendingSuggestions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void applyAllPending()}
                    disabled={!isOnline || isApplyingAll || Boolean(applyingId)}
                    className="mt-4 w-full rounded-xl bg-green-400 px-4 py-3 text-sm font-black text-black hover:bg-green-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isApplyingAll
                      ? "Applying relationships..."
                      : `Apply all pending · ${pendingSuggestions.length}`}
                  </button>
                )}
              </section>

              {pendingSuggestions.length === 0 ? (
                <section className="mt-4 rounded-2xl border border-green-400/20 bg-green-400/10 p-6 text-center">
                  <p className="font-black text-green-100">Relationship review complete</p>
                  <p className="mt-2 text-sm text-green-100/70">
                    Every suggestion from this scan has been applied or dismissed.
                  </p>
                </section>
              ) : (
                <section className="mt-4 space-y-4">
                  {pendingSuggestions.map((suggestion) => (
                    <article
                      key={suggestion.id}
                      className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEntry(suggestion.sourceEntryId)}
                              className="text-lg font-black text-white hover:text-emerald-200"
                            >
                              {suggestion.sourceWord}
                            </button>
                            <span className="text-neutral-600">→</span>
                            <button
                              type="button"
                              onClick={() => openEntry(suggestion.targetEntryId)}
                              className="text-lg font-black text-white hover:text-emerald-200"
                            >
                              {suggestion.targetWord}
                            </button>
                          </div>

                          <p className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
                            {RELATIONSHIP_LABELS[suggestion.relationshipType]}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${confidenceClasses(suggestion.confidence)}`}>
                            {suggestion.confidence} confidence
                          </span>
                          <span className="rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-sky-100">
                            Strength {suggestion.strength}/10
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-neutral-600">
                          Why this link
                        </p>
                        <p className="mt-2 text-sm leading-6 text-neutral-300">
                          {suggestion.reason}
                        </p>
                      </div>

                      <div className="mt-3 rounded-2xl border border-yellow-400/15 bg-yellow-400/5 p-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-yellow-300">
                          Verify
                        </p>
                        <p className="mt-2 text-xs leading-5 text-yellow-100/70">
                          {suggestion.verificationNote}
                        </p>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => void handleApplySuggestion(suggestion)}
                          disabled={!isOnline || Boolean(applyingId) || isApplyingAll}
                          className="rounded-xl bg-green-400 px-3 py-3 text-sm font-black text-black hover:bg-green-300 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {applyingId === suggestion.id ? "Applying..." : "Apply relationship"}
                        </button>

                        <button
                          type="button"
                          onClick={() => dismissSuggestion(suggestion.id)}
                          disabled={Boolean(applyingId) || isApplyingAll}
                          className="rounded-xl border border-red-400/25 bg-red-400/10 px-3 py-3 text-sm font-black text-red-100 hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Dismiss
                        </button>
                      </div>
                    </article>
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

export default AIRelationshipSuggestionsPanel;

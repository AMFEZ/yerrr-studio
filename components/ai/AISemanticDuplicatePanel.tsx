"use client";

import { useMemo, useState } from "react";

import type { Entry } from "@/types/entry";

type DuplicateClassification =
  | "same_entry"
  | "related_but_distinct"
  | "different"
  | "unclear";

type DuplicateConfidence = "low" | "medium" | "high";

type DuplicateReviewResult = {
  leftEntryId: string;
  leftWord: string;
  rightEntryId: string;
  rightWord: string;
  classification: DuplicateClassification;
  similarityScore: number;
  confidence: DuplicateConfidence;
  summary: string;
  sharedSignals: string[];
  importantDifferences: string[];
  recommendedPrimaryEntryId: string;
  recommendation: string;
};

type DuplicateReviewResponse = {
  result?: DuplicateReviewResult;
  model?: string;
  error?: string;
};

type AISemanticDuplicatePanelProps = {
  entries: Entry[];
  isOnline: boolean;
  onClose: () => void;
  onOpenEntry: (entry: Entry) => void;
  onMergeEntries: (
    primaryEntryId: string,
    duplicateEntryId: string,
  ) => Promise<Entry | null>;
};

type CandidatePair = {
  left: Entry;
  right: Entry;
  localScore: number;
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSpellings(entry: Entry) {
  return [entry.word, entry.slug.replace(/-/g, " "), entry.alternateSpellings]
    .flatMap((value) => value.split(/[,;/\n]/g))
    .map(normalize)
    .filter(Boolean);
}

function getLocalPairScore(left: Entry, right: Entry) {
  const leftSpellings = new Set(parseSpellings(left));
  const rightSpellings = new Set(parseSpellings(right));

  let score = 0;

  leftSpellings.forEach((spelling) => {
    if (rightSpellings.has(spelling)) score += 100;
  });

  const leftWord = normalize(left.word);
  const rightWord = normalize(right.word);

  if (leftWord && rightWord) {
    if (leftWord.includes(rightWord) || rightWord.includes(leftWord)) {
      score += 35;
    }

    const leftTokens = new Set(leftWord.split(" "));
    const rightTokens = new Set(rightWord.split(" "));
    let sharedTokens = 0;

    leftTokens.forEach((token) => {
      if (rightTokens.has(token)) sharedTokens += 1;
    });

    score += sharedTokens * 15;
  }

  const leftConcepts = new Set(
    left.meanings.flatMap((meaning) =>
      meaning.conceptsText
        .split(/[,;/\n]/g)
        .map(normalize)
        .filter(Boolean),
    ),
  );

  const rightConcepts = new Set(
    right.meanings.flatMap((meaning) =>
      meaning.conceptsText
        .split(/[,;/\n]/g)
        .map(normalize)
        .filter(Boolean),
    ),
  );

  leftConcepts.forEach((concept) => {
    if (rightConcepts.has(concept)) score += 5;
  });

  return score;
}

function classificationLabel(classification: DuplicateClassification) {
  if (classification === "same_entry") return "Likely same entry";
  if (classification === "related_but_distinct") {
    return "Related but distinct";
  }
  if (classification === "different") return "Different entries";
  return "Needs human review";
}

function classificationClasses(classification: DuplicateClassification) {
  if (classification === "same_entry") {
    return "border-red-400/30 bg-red-400/10 text-red-100";
  }

  if (classification === "related_but_distinct") {
    return "border-yellow-400/30 bg-yellow-400/10 text-yellow-100";
  }

  if (classification === "different") {
    return "border-green-400/30 bg-green-400/10 text-green-100";
  }

  return "border-neutral-700 bg-neutral-900 text-neutral-200";
}

export function AISemanticDuplicatePanel({
  entries,
  isOnline,
  onClose,
  onOpenEntry,
  onMergeEntries,
}: AISemanticDuplicatePanelProps) {
  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.word.localeCompare(b.word)),
    [entries],
  );

  const candidatePairs = useMemo(() => {
    const pairs: CandidatePair[] = [];

    for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < entries.length;
        rightIndex += 1
      ) {
        const left = entries[leftIndex];
        const right = entries[rightIndex];
        const localScore = getLocalPairScore(left, right);

        if (localScore > 0) {
          pairs.push({ left, right, localScore });
        }
      }
    }

    return pairs
      .sort((a, b) => b.localScore - a.localScore)
      .slice(0, 20);
  }, [entries]);

  const [leftEntryId, setLeftEntryId] = useState(
    candidatePairs[0]?.left.id ?? sortedEntries[0]?.id ?? "",
  );
  const [rightEntryId, setRightEntryId] = useState(
    candidatePairs[0]?.right.id ?? sortedEntries[1]?.id ?? "",
  );
  const [result, setResult] = useState<DuplicateReviewResult | null>(null);
  const [modelLabel, setModelLabel] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [primaryEntryId, setPrimaryEntryId] = useState("");

  const leftEntry = useMemo(
    () => entries.find((entry) => String(entry.id) === String(leftEntryId)) ?? null,
    [entries, leftEntryId],
  );

  const rightEntry = useMemo(
    () =>
      entries.find((entry) => String(entry.id) === String(rightEntryId)) ?? null,
    [entries, rightEntryId],
  );

  function selectCandidate(pair: CandidatePair) {
    setLeftEntryId(pair.left.id);
    setRightEntryId(pair.right.id);
    setResult(null);
    setPrimaryEntryId("");
    setError("");
    setMessage("");
  }

  async function runReview() {
    if (!leftEntry || !rightEntry || leftEntry.id === rightEntry.id) {
      setError("Choose two different entries before running the review.");
      return;
    }

    try {
      setIsReviewing(true);
      setError("");
      setMessage("");
      setResult(null);

      const response = await fetch("/api/ai-duplicate-review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leftEntry,
          rightEntry,
        }),
      });

      let payload: DuplicateReviewResponse = {};

      try {
        payload = (await response.json()) as DuplicateReviewResponse;
      } catch {
        payload = {};
      }

      if (!response.ok || !payload.result) {
        throw new Error(payload.error || "The duplicate review failed.");
      }

      setResult(payload.result);
      setModelLabel(payload.model ?? "");
      setPrimaryEntryId(payload.result.recommendedPrimaryEntryId);
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "The duplicate review failed.",
      );
    } finally {
      setIsReviewing(false);
    }
  }

  async function mergeSelectedPair() {
    if (!result || !primaryEntryId || isMerging) return;

    const duplicateEntryId =
      String(primaryEntryId) === String(result.leftEntryId)
        ? result.rightEntryId
        : result.leftEntryId;

    try {
      setIsMerging(true);
      setError("");
      setMessage("");

      const mergedEntry = await onMergeEntries(
        primaryEntryId,
        duplicateEntryId,
      );

      if (!mergedEntry) {
        setMessage("Merge cancelled. No entry data was changed.");
        return;
      }

      onClose();
      return;
    } catch (mergeError) {
      setError(
        mergeError instanceof Error
          ? mergeError.message
          : "The duplicate merge failed.",
      );
    } finally {
      setIsMerging(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[96] bg-black/75 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close AI semantic duplicate review"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside className="absolute bottom-0 right-0 flex h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-neutral-800 bg-neutral-950 shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-w-3xl md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0">
        <header className="border-b border-neutral-800 bg-cyan-400/5 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">
                Alpha 5.17H3
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">
                AI Semantic Duplicate Review
              </h2>
              <p className="mt-2 text-sm leading-6 text-neutral-500">
                Compare two entries, decide whether they should remain separate,
                or merge them without discarding unique meanings.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-black text-neutral-300 hover:border-red-400 hover:text-red-200"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
          {!isOnline && (
            <section className="rounded-2xl border border-yellow-400/25 bg-yellow-400/10 p-4">
              <p className="font-black text-yellow-100">Merge unavailable offline</p>
              <p className="mt-2 text-sm leading-6 text-yellow-100/70">
                You can still run a comparison, but merging waits until Studio is
                online because it updates one entry and moves the other to Trash.
              </p>
            </section>
          )}

          <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-black text-neutral-300">
                First entry
                <select
                  value={leftEntryId}
                  onChange={(event) => {
                    setLeftEntryId(event.target.value);
                    setResult(null);
                    setMessage("");
                  }}
                  className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-cyan-400"
                >
                  <option value="">Choose an entry...</option>
                  {sortedEntries.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.word}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-black text-neutral-300">
                Second entry
                <select
                  value={rightEntryId}
                  onChange={(event) => {
                    setRightEntryId(event.target.value);
                    setResult(null);
                    setMessage("");
                  }}
                  className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-cyan-400"
                >
                  <option value="">Choose an entry...</option>
                  {sortedEntries.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.word}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => leftEntry && onOpenEntry(leftEntry)}
                disabled={!leftEntry}
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-xs font-black text-neutral-300 hover:border-cyan-400 hover:text-cyan-200 disabled:opacity-30"
              >
                Open first
              </button>

              <button
                type="button"
                onClick={() => rightEntry && onOpenEntry(rightEntry)}
                disabled={!rightEntry}
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-xs font-black text-neutral-300 hover:border-cyan-400 hover:text-cyan-200 disabled:opacity-30"
              >
                Open second
              </button>

              <button
                type="button"
                onClick={() => void runReview()}
                disabled={
                  isReviewing ||
                  !leftEntry ||
                  !rightEntry ||
                  leftEntry.id === rightEntry.id
                }
                className="rounded-xl bg-cyan-300 px-3 py-3 text-xs font-black text-black hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isReviewing ? "Comparing..." : "Compare entries"}
              </button>
            </div>
          </section>

          {candidatePairs.length > 0 && (
            <section>
              <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
                Local duplicate candidates
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {candidatePairs.slice(0, 8).map((pair) => (
                  <button
                    key={`${pair.left.id}-${pair.right.id}`}
                    type="button"
                    onClick={() => selectCandidate(pair)}
                    className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-left transition hover:border-cyan-400/50 hover:bg-cyan-400/5"
                  >
                    <p className="font-black text-white">
                      {pair.left.word} ↔ {pair.right.word}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      Local match score {pair.localScore}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {error && (
            <section className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4">
              <p className="font-black text-red-100">Action failed</p>
              <p className="mt-2 text-sm leading-6 text-red-100/70">{error}</p>
            </section>
          )}

          {message && (
            <section className="rounded-2xl border border-green-400/30 bg-green-400/10 p-4">
              <p className="font-black text-green-100">{message}</p>
            </section>
          )}

          {result && (
            <section className="space-y-4">
              <div
                className={`rounded-3xl border p-5 ${classificationClasses(
                  result.classification,
                )}`}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] opacity-70">
                      {classificationLabel(result.classification)}
                    </p>
                    <h3 className="mt-2 text-2xl font-black">
                      {result.leftWord} ↔ {result.rightWord}
                    </h3>
                    <p className="mt-3 text-sm leading-7 opacity-80">
                      {result.summary}
                    </p>
                  </div>

                  <div className="shrink-0 rounded-2xl bg-black/20 px-4 py-3 text-center">
                    <p className="text-3xl font-black">{result.similarityScore}%</p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] opacity-60">
                      {result.confidence} confidence
                    </p>
                  </div>
                </div>

                {modelLabel && (
                  <p className="mt-4 text-xs opacity-50">Model: {modelLabel}</p>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-green-300">
                    Shared signals
                  </p>
                  {result.sharedSignals.length > 0 ? (
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-neutral-300">
                      {result.sharedSignals.map((signal) => (
                        <li key={signal}>• {signal}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-neutral-500">
                      No strong shared signals were identified.
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-yellow-300">
                    Important differences
                  </p>
                  {result.importantDifferences.length > 0 ? (
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-neutral-300">
                      {result.importantDifferences.map((difference) => (
                        <li key={difference}>• {difference}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-neutral-500">
                      No meaningful differences were identified.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
                  Recommended action
                </p>
                <p className="mt-3 text-sm leading-7 text-neutral-300">
                  {result.recommendation}
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <label className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-sm font-black text-white">
                    <input
                      type="radio"
                      name="duplicate-primary"
                      value={result.leftEntryId}
                      checked={primaryEntryId === result.leftEntryId}
                      onChange={(event) => setPrimaryEntryId(event.target.value)}
                      className="mr-3 accent-cyan-300"
                    />
                    Keep {result.leftWord} as primary
                  </label>

                  <label className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-sm font-black text-white">
                    <input
                      type="radio"
                      name="duplicate-primary"
                      value={result.rightEntryId}
                      checked={primaryEntryId === result.rightEntryId}
                      onChange={(event) => setPrimaryEntryId(event.target.value)}
                      className="mr-3 accent-cyan-300"
                    />
                    Keep {result.rightWord} as primary
                  </label>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMessage(
                        "Kept separate for this review. No entry data was changed.",
                      );
                      setResult(null);
                    }}
                    className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-black text-neutral-300 hover:border-green-400 hover:text-green-200"
                  >
                    Keep separate
                  </button>

                  <button
                    type="button"
                    onClick={() => void mergeSelectedPair()}
                    disabled={!isOnline || isMerging || !primaryEntryId}
                    className="rounded-xl bg-red-500 px-4 py-3 text-sm font-black text-white hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isMerging ? "Merging..." : "Merge and move duplicate to Trash"}
                  </button>
                </div>

                <p className="mt-3 text-xs leading-5 text-neutral-600">
                  Merge preserves the primary entry, fills its empty metadata from
                  the duplicate, copies unique meanings, combines alternate
                  spellings, and moves the duplicate record to Trash.
                </p>
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}

export default AISemanticDuplicatePanel;

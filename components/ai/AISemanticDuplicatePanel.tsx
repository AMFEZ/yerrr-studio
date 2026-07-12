"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type { Entry } from "@/types/entry";

import type {
  AIDuplicateClassification,
  AIDuplicateMatch,
  AIDuplicateRecommendedAction,
  AIDuplicateReviewResponse,
  AIDuplicateReviewResult,
} from "@/types/aiDuplicates";

type AISemanticDuplicatePanelProps = {
  entries: Entry[];
  onClose: () => void;
  onOpenEntry?: (entry: Entry) => void;
};

type ScoredCandidate = {
  entry: Entry;
  score: number;
};

const MAX_CANDIDATES = 24;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "was",
  "with",
  "you",
  "your",
]);

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
    if (
      aliasSet.has(normalizeKey(key)) &&
      typeof value === "string"
    ) {
      return value.trim();
    }
  }

  return "";
}

function splitAlternateSpellings(
  value: unknown,
) {
  return String(value ?? "")
    .split(/[,;/\n]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getWordForms(entry: Entry) {
  const forms = [
    entry.word,
    String(entry.slug ?? "").replace(
      /-/g,
      " ",
    ),
    ...splitAlternateSpellings(
      entry.alternateSpellings,
    ),
  ]
    .map(normalize)
    .filter(Boolean);

  return Array.from(new Set(forms));
}

function getMeaningText(entry: Entry) {
  if (!Array.isArray(entry.meanings)) {
    return "";
  }

  return entry.meanings
    .flatMap((meaning) => [
      readField(meaning, [
        "definition",
        "meaning",
        "gloss",
      ]),

      readField(meaning, [
        "plainEnglish",
        "plain_english",
        "plainMeaning",
      ]),

      readField(meaning, [
        "culturalContext",
        "cultural_context",
        "culture",
        "context",
      ]),

      readField(meaning, [
        "example",
        "exampleSentence",
        "example_sentence",
        "usageExample",
      ]),

      readField(meaning, [
        "tone",
        "tones",
      ]),
    ])
    .filter(Boolean)
    .join(" ");
}

function getEntryText(entry: Entry) {
  return [
    entry.word,
    entry.slug,
    entry.alternateSpellings,
    getMeaningText(entry),
  ]
    .filter(Boolean)
    .join(" ");
}

function getTokenSet(value: string) {
  const tokens = normalize(value)
    .split(" ")
    .filter(
      (token) =>
        token.length > 1 &&
        !STOP_WORDS.has(token),
    );

  return new Set(tokens);
}

function jaccardSimilarity(
  firstSet: Set<string>,
  secondSet: Set<string>,
) {
  if (
    firstSet.size === 0 ||
    secondSet.size === 0
  ) {
    return 0;
  }

  let intersectionCount = 0;

  firstSet.forEach((token) => {
    if (secondSet.has(token)) {
      intersectionCount += 1;
    }
  });

  const unionCount =
    new Set([
      ...firstSet,
      ...secondSet,
    ]).size;

  return unionCount === 0
    ? 0
    : intersectionCount / unionCount;
}

function createBigrams(value: string) {
  const compactValue = normalize(value).replace(
    /\s+/g,
    "",
  );

  if (compactValue.length < 2) {
    return compactValue
      ? [compactValue]
      : [];
  }

  const bigrams: string[] = [];

  for (
    let index = 0;
    index < compactValue.length - 1;
    index += 1
  ) {
    bigrams.push(
      compactValue.slice(index, index + 2),
    );
  }

  return bigrams;
}

function diceSimilarity(
  firstValue: string,
  secondValue: string,
) {
  const firstBigrams =
    createBigrams(firstValue);

  const secondBigrams =
    createBigrams(secondValue);

  if (
    firstBigrams.length === 0 ||
    secondBigrams.length === 0
  ) {
    return 0;
  }

  const remainingSecond =
    [...secondBigrams];

  let matches = 0;

  firstBigrams.forEach((bigram) => {
    const matchIndex =
      remainingSecond.indexOf(bigram);

    if (matchIndex === -1) {
      return;
    }

    matches += 1;
    remainingSecond.splice(matchIndex, 1);
  });

  return (
    (2 * matches) /
    (firstBigrams.length +
      secondBigrams.length)
  );
}

function maximumWordSimilarity(
  firstForms: string[],
  secondForms: string[],
) {
  let maximum = 0;

  firstForms.forEach((firstForm) => {
    secondForms.forEach((secondForm) => {
      maximum = Math.max(
        maximum,
        diceSimilarity(
          firstForm,
          secondForm,
        ),
      );
    });
  });

  return maximum;
}

function containsRelatedForm(
  firstForms: string[],
  secondForms: string[],
) {
  return firstForms.some((firstForm) =>
    secondForms.some((secondForm) => {
      if (
        firstForm.length < 3 ||
        secondForm.length < 3
      ) {
        return false;
      }

      return (
        firstForm.includes(secondForm) ||
        secondForm.includes(firstForm)
      );
    }),
  );
}

function scoreCandidate(
  sourceEntry: Entry,
  candidateEntry: Entry,
) {
  const sourceForms =
    getWordForms(sourceEntry);

  const candidateForms =
    getWordForms(candidateEntry);

  const hasExactForm =
    sourceForms.some((form) =>
      candidateForms.includes(form),
    );

  if (hasExactForm) {
    return 100;
  }

  const wordSimilarity =
    maximumWordSimilarity(
      sourceForms,
      candidateForms,
    );

  const sourceTokens = getTokenSet(
    getEntryText(sourceEntry),
  );

  const candidateTokens = getTokenSet(
    getEntryText(candidateEntry),
  );

  const textSimilarity =
    jaccardSimilarity(
      sourceTokens,
      candidateTokens,
    );

  const containmentBonus =
    containsRelatedForm(
      sourceForms,
      candidateForms,
    )
      ? 12
      : 0;

  return Math.min(
    99,
    Math.round(
      wordSimilarity * 58 +
        textSimilarity * 38 +
        containmentBonus,
    ),
  );
}

function buildCandidateEntries(
  sourceEntry: Entry,
  entries: Entry[],
) {
  const scoredCandidates: ScoredCandidate[] =
    entries
      .filter(
        (entry) =>
          String(entry.id) !==
          String(sourceEntry.id),
      )
      .map((entry) => ({
        entry,
        score: scoreCandidate(
          sourceEntry,
          entry,
        ),
      }))
      .sort(
        (first, second) =>
          second.score - first.score ||
          first.entry.word.localeCompare(
            second.entry.word,
          ),
      );

  const strongerCandidates =
    scoredCandidates.filter(
      (candidate) =>
        candidate.score >= 8,
    );

  const selectedCandidates =
    strongerCandidates.length >= 8
      ? strongerCandidates.slice(
          0,
          MAX_CANDIDATES,
        )
      : scoredCandidates.slice(
          0,
          Math.min(
            12,
            scoredCandidates.length,
          ),
        );

  return selectedCandidates;
}

function classificationLabel(
  classification: AIDuplicateClassification,
) {
  if (
    classification === "likely_duplicate"
  ) {
    return "Likely duplicate";
  }

  if (
    classification === "possible_duplicate"
  ) {
    return "Possible duplicate";
  }

  return "Related but distinct";
}

function classificationClasses(
  classification: AIDuplicateClassification,
) {
  if (
    classification === "likely_duplicate"
  ) {
    return {
      card:
        "border-red-400/30 bg-red-400/10",
      badge:
        "bg-red-400/20 text-red-100",
      score: "text-red-200",
    };
  }

  if (
    classification === "possible_duplicate"
  ) {
    return {
      card:
        "border-yellow-400/30 bg-yellow-400/10",
      badge:
        "bg-yellow-400/20 text-yellow-100",
      score: "text-yellow-200",
    };
  }

  return {
    card:
      "border-blue-400/30 bg-blue-400/10",
    badge:
      "bg-blue-400/20 text-blue-100",
    score: "text-blue-200",
  };
}

function actionLabel(
  action: AIDuplicateRecommendedAction,
) {
  if (action === "merge_review") {
    return "Compare for merge";
  }

  if (action === "keep_separate") {
    return "Keep separate";
  }

  return "Editorial review";
}

function formatMatchReport(
  result: AIDuplicateReviewResult,
) {
  return [
    `YERRR Studio AI Semantic Duplicate Review`,
    `Source entry: ${result.sourceEntryWord}`,
    `Candidates analyzed: ${result.analyzedCandidateCount}`,
    `Matches flagged: ${result.matches.length}`,
    "",
    result.summary,
    "",
    ...result.matches.flatMap(
      (match, index) => [
        `${index + 1}. ${match.candidateWord}`,
        `Classification: ${classificationLabel(
          match.classification,
        )}`,
        `Similarity score: ${match.similarityScore}/100`,
        `Confidence: ${match.confidence}`,
        `Recommended action: ${actionLabel(
          match.recommendedAction,
        )}`,
        `Reasoning: ${match.reasoning}`,
        `Shared signals: ${
          match.sharedSignals.join("; ") ||
          "None listed"
        }`,
        `Differences: ${
          match.differences.join("; ") ||
          "None listed"
        }`,
        `Warning: ${match.mergeWarning}`,
        "",
      ],
    ),
    "No entries were merged, deleted, or modified.",
  ].join("\n");
}

export function AISemanticDuplicatePanel({
  entries,
  onClose,
  onOpenEntry,
}: AISemanticDuplicatePanelProps) {
  const [entrySearch, setEntrySearch] =
    useState("");

  const [
    selectedEntryId,
    setSelectedEntryId,
  ] = useState(
    entries[0]
      ? String(entries[0].id)
      : "",
  );

  const [result, setResult] =
    useState<AIDuplicateReviewResult | null>(
      null,
    );

  const [modelLabel, setModelLabel] =
    useState("");

  const [error, setError] =
    useState("");

  const [isLoading, setIsLoading] =
    useState(false);

  const [copied, setCopied] =
    useState(false);

  useEffect(() => {
    if (entries.length === 0) {
      setSelectedEntryId("");
      return;
    }

    const selectedStillExists =
      entries.some(
        (entry) =>
          String(entry.id) ===
          selectedEntryId,
      );

    if (!selectedStillExists) {
      setSelectedEntryId(
        String(entries[0].id),
      );
    }
  }, [entries, selectedEntryId]);

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
      normalize(entrySearch);

    if (!normalizedSearch) {
      return sortedEntries;
    }

    return sortedEntries.filter((entry) =>
      normalize(
        [
          entry.word,
          entry.slug,
          entry.alternateSpellings,
        ].join(" "),
      ).includes(normalizedSearch),
    );
  }, [entrySearch, sortedEntries]);

  const selectedEntry = useMemo(() => {
    return (
      entries.find(
        (entry) =>
          String(entry.id) ===
          selectedEntryId,
      ) ?? null
    );
  }, [entries, selectedEntryId]);

  const scoredCandidates = useMemo(() => {
    if (!selectedEntry) {
      return [];
    }

    return buildCandidateEntries(
      selectedEntry,
      entries,
    );
  }, [entries, selectedEntry]);

  function selectEntry(entryId: string) {
    setSelectedEntryId(entryId);
    setResult(null);
    setModelLabel("");
    setError("");
    setCopied(false);
  }

  async function runDuplicateReview() {
    if (
      !selectedEntry ||
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
        "/api/ai-duplicate-review",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            sourceEntry: selectedEntry,

            candidates:
              scoredCandidates.map(
                (candidate) =>
                  candidate.entry,
              ),
          }),
        },
      );

      let payload:
        AIDuplicateReviewResponse = {};

      try {
        payload =
          (await response.json()) as AIDuplicateReviewResponse;
      } catch {
        payload = {};
      }

      if (
        !response.ok ||
        !payload.result
      ) {
        throw new Error(
          payload.error ||
            "The semantic duplicate review failed.",
        );
      }

      setResult(payload.result);
      setModelLabel(
        payload.model ?? "",
      );
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "The semantic duplicate review failed.",
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
        formatMatchReport(result),
      );

      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 1_800);
    } catch {
      setCopied(false);
    }
  }

  function openEntry(entry: Entry) {
    onClose();
    onOpenEntry?.(entry);
  }

  function openCandidate(
    match: AIDuplicateMatch,
  ) {
    const candidate = entries.find(
      (entry) =>
        String(entry.id) ===
        match.candidateEntryId,
    );

    if (candidate) {
      openEntry(candidate);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close semantic duplicate review"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="semantic-duplicate-title"
        className="absolute bottom-0 right-0 flex h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-neutral-800 bg-neutral-950 shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-w-3xl md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0"
      >
        <header className="border-b border-neutral-800 bg-neutral-950/95 p-5 backdrop-blur sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-300">
                Alpha 5.7
              </p>

              <h2
                id="semantic-duplicate-title"
                className="mt-2 text-2xl font-black text-white"
              >
                AI Semantic Duplicate Review
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
                Compare meaning, usage, tone, and
                cultural context. AI cannot merge,
                delete, or change entries.
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
            <section className="rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-5">
              <p className="font-black text-cyan-100">
                Choose the entry to inspect
              </p>

              <input
                value={entrySearch}
                onChange={(event) =>
                  setEntrySearch(
                    event.target.value,
                  )
                }
                placeholder="Search entries..."
                className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-cyan-400"
              />

              <select
                value={selectedEntryId}
                onChange={(event) =>
                  selectEntry(
                    event.target.value,
                  )
                }
                className="mt-3 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-bold text-white outline-none focus:border-cyan-400"
              >
                {filteredEntries.length ===
                0 ? (
                  <option value="">
                    No entries found
                  </option>
                ) : (
                  filteredEntries.map(
                    (entry) => (
                      <option
                        key={entry.id}
                        value={String(
                          entry.id,
                        )}
                      >
                        {entry.word}
                      </option>
                    ),
                  )
                )}
              </select>

              {selectedEntry && (
                <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-600">
                        Source entry
                      </p>

                      <p className="mt-1 text-xl font-black text-white">
                        {
                          selectedEntry.word
                        }
                      </p>

                      <p className="mt-1 text-xs text-neutral-500">
                        {
                          scoredCandidates.length
                        }{" "}
                        locally selected
                        candidates
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        openEntry(
                          selectedEntry,
                        )
                      }
                      className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-black text-neutral-300 hover:border-cyan-400 hover:text-cyan-200"
                    >
                      Open entry
                    </button>
                  </div>

                  {scoredCandidates.length >
                    0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {scoredCandidates
                        .slice(0, 8)
                        .map(
                          (candidate) => (
                            <span
                              key={
                                candidate
                                  .entry.id
                              }
                              className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-[11px] font-bold text-neutral-400"
                            >
                              {
                                candidate
                                  .entry.word
                              }{" "}
                              ·{" "}
                              {
                                candidate.score
                              }
                            </span>
                          ),
                        )}
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() =>
                  void runDuplicateReview()
                }
                disabled={
                  !selectedEntry ||
                  isLoading ||
                  scoredCandidates.length ===
                    0
                }
                className="mt-4 w-full rounded-xl bg-cyan-300 px-4 py-3 text-sm font-black text-black hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isLoading
                  ? "Comparing entries..."
                  : "Run semantic duplicate review"}
              </button>
            </section>

            {error && (
              <section className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4">
                <p className="font-black text-red-100">
                  Duplicate review failed
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
                          result.analyzedCandidateCount
                        }
                      </p>

                      <p className="mt-1 text-[9px] font-black uppercase tracking-[0.15em] text-neutral-600">
                        Analyzed
                      </p>
                    </div>

                    <div className="rounded-2xl bg-neutral-950 p-4">
                      <p className="text-2xl font-black text-cyan-200">
                        {
                          result.matches
                            .length
                        }
                      </p>

                      <p className="mt-1 text-[9px] font-black uppercase tracking-[0.15em] text-neutral-600">
                        Flagged
                      </p>
                    </div>

                    <div className="rounded-2xl bg-neutral-950 p-4">
                      <p className="truncate text-sm font-black text-neutral-300">
                        {modelLabel ||
                          "AI"}
                      </p>

                      <p className="mt-2 text-[9px] font-black uppercase tracking-[0.15em] text-neutral-600">
                        Model
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-neutral-400">
                    {result.summary}
                  </p>
                </section>

                {result.matches.length ===
                0 ? (
                  <section className="rounded-3xl border border-green-400/20 bg-green-400/10 p-6 text-center">
                    <p className="text-lg font-black text-green-100">
                      No semantic duplicates
                      flagged
                    </p>

                    <p className="mt-2 text-sm leading-6 text-green-100/70">
                      None of the selected
                      candidates showed enough
                      evidence to require duplicate
                      review.
                    </p>
                  </section>
                ) : (
                  <section>
                    <div className="mb-3 flex items-center justify-between gap-4">
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500">
                        Flagged comparisons
                      </p>

                      <button
                        type="button"
                        onClick={() =>
                          void copyReport()
                        }
                        className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-black text-neutral-300 hover:border-cyan-400 hover:text-cyan-200"
                      >
                        {copied
                          ? "Report copied"
                          : "Copy report"}
                      </button>
                    </div>

                    <div className="space-y-4">
                      {result.matches.map(
                        (match) => {
                          const classes =
                            classificationClasses(
                              match.classification,
                            );

                          return (
                            <article
                              key={
                                match.candidateEntryId
                              }
                              className={`rounded-3xl border p-5 ${classes.card}`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                  <span
                                    className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${classes.badge}`}
                                  >
                                    {classificationLabel(
                                      match.classification,
                                    )}
                                  </span>

                                  <h3 className="mt-3 text-xl font-black text-white">
                                    {
                                      result.sourceEntryWord
                                    }{" "}
                                    ↔{" "}
                                    {
                                      match.candidateWord
                                    }
                                  </h3>

                                  <p className="mt-1 text-xs font-bold text-neutral-500">
                                    {actionLabel(
                                      match.recommendedAction,
                                    )}
                                    {" · "}
                                    {
                                      match.confidence
                                    }{" "}
                                    confidence
                                  </p>
                                </div>

                                <div className="text-right">
                                  <p
                                    className={`text-3xl font-black ${classes.score}`}
                                  >
                                    {
                                      match.similarityScore
                                    }
                                  </p>

                                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-neutral-600">
                                    AI score
                                  </p>
                                </div>
                              </div>

                              <p className="mt-4 text-sm leading-6 text-neutral-300">
                                {
                                  match.reasoning
                                }
                              </p>

                              <div className="mt-4 grid gap-3 md:grid-cols-2">
                                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-green-200">
                                    Shared signals
                                  </p>

                                  {match.sharedSignals
                                    .length ===
                                  0 ? (
                                    <p className="mt-2 text-xs text-neutral-500">
                                      No shared
                                      signals listed.
                                    </p>
                                  ) : (
                                    <div className="mt-3 space-y-2">
                                      {match.sharedSignals.map(
                                        (
                                          signal,
                                          index,
                                        ) => (
                                          <p
                                            key={`${signal}-${index}`}
                                            className="text-xs leading-5 text-neutral-300"
                                          >
                                            •{" "}
                                            {
                                              signal
                                            }
                                          </p>
                                        ),
                                      )}
                                    </div>
                                  )}
                                </div>

                                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-200">
                                    Important differences
                                  </p>

                                  {match.differences
                                    .length ===
                                  0 ? (
                                    <p className="mt-2 text-xs text-neutral-500">
                                      No differences
                                      listed.
                                    </p>
                                  ) : (
                                    <div className="mt-3 space-y-2">
                                      {match.differences.map(
                                        (
                                          difference,
                                          index,
                                        ) => (
                                          <p
                                            key={`${difference}-${index}`}
                                            className="text-xs leading-5 text-neutral-300"
                                          >
                                            •{" "}
                                            {
                                              difference
                                            }
                                          </p>
                                        ),
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="mt-4 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-yellow-200">
                                  Editorial warning
                                </p>

                                <p className="mt-2 text-xs leading-5 text-yellow-100/70">
                                  {
                                    match.mergeWarning
                                  }
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  openCandidate(
                                    match,
                                  )
                                }
                                className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-black text-neutral-300 hover:border-cyan-400 hover:text-cyan-200"
                              >
                                Open{" "}
                                {
                                  match.candidateWord
                                }{" "}
                                in editor
                              </button>
                            </article>
                          );
                        },
                      )}
                    </div>
                  </section>
                )}

                {result.reviewChecklist
                  .length > 0 && (
                  <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500">
                      Human review checklist
                    </p>

                    <div className="mt-4 space-y-2">
                      {result.reviewChecklist.map(
                        (item, index) => (
                          <div
                            key={`${item}-${index}`}
                            className="flex gap-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3"
                          >
                            <span className="text-neutral-600">
                              □
                            </span>

                            <p className="text-xs leading-5 text-neutral-300">
                              {item}
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
              className="flex-1 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-black text-black hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {copied
                ? "Report copied"
                : "Copy duplicate report"}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-black text-neutral-300 hover:border-neutral-500 hover:text-white"
            >
              Close review
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}

export default AISemanticDuplicatePanel;
"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type { Entry } from "@/types/entry";

import type {
  AIRelationshipDecision,
  AIRelationshipDirection,
  AIRelationshipSuggestion,
  AIRelationshipSuggestionResponse,
  AIRelationshipSuggestionResult,
  AIRelationshipType,
} from "@/types/aiRelationships";

type AIRelationshipSuggestionsPanelProps = {
  entries: Entry[];
  onClose: () => void;
  onOpenEntry?: (entry: Entry) => void;
  onOpenRelationshipEditor?: () => void;
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
    source as Record<
      string,
      unknown
    >,
  )) {
    if (
      aliasSet.has(normalizeKey(key)) &&
      (
        typeof value === "string" ||
        typeof value === "number"
      )
    ) {
      return String(value).trim();
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

    String(entry.slug ?? "")
      .replace(/-/g, " "),

    ...splitAlternateSpellings(
      entry.alternateSpellings,
    ),
  ]
    .map(normalize)
    .filter(Boolean);

  return Array.from(new Set(forms));
}

function getMeaningText(entry: Entry) {
  const meanings = Array.isArray(
    entry.meanings,
  )
    ? entry.meanings
    : [];

  return meanings
    .flatMap((meaning) => [
      readField(
        meaning,
        [
          "definition",
          "meaning",
          "gloss",
        ],
      ),

      readField(
        meaning,
        [
          "plainEnglish",
          "plain_english",
          "plainMeaning",
        ],
      ),

      readField(
        meaning,
        [
          "example",
          "exampleSentence",
          "example_sentence",
          "usageExample",
        ],
      ),

      readField(
        meaning,
        [
          "culturalContext",
          "cultural_context",
          "culture",
          "context",
        ],
      ),

      readField(
        meaning,
        [
          "tone",
          "tones",
        ],
      ),

      readField(
        meaning,
        [
          "partOfSpeech",
          "part_of_speech",
          "pos",
          "grammar",
          "type",
        ],
      ),

      readField(
        meaning,
        [
          "conceptId",
          "concept_id",
          "conceptID",
        ],
      ),

      readField(
        meaning,
        [
          "conceptName",
          "concept_name",
          "concept",
          "category",
        ],
      ),
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
  return new Set(
    normalize(value)
      .split(" ")
      .filter(
        (token) =>
          token.length > 1 &&
          !STOP_WORDS.has(token),
      ),
  );
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

  const unionCount = new Set([
    ...firstSet,
    ...secondSet,
  ]).size;

  return unionCount === 0
    ? 0
    : intersectionCount /
        unionCount;
}

function createBigrams(value: string) {
  const compactValue =
    normalize(value).replace(
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
    index <
    compactValue.length - 1;
    index += 1
  ) {
    bigrams.push(
      compactValue.slice(
        index,
        index + 2,
      ),
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

  const availableSecond =
    [...secondBigrams];

  let matchCount = 0;

  firstBigrams.forEach((bigram) => {
    const matchIndex =
      availableSecond.indexOf(
        bigram,
      );

    if (matchIndex === -1) {
      return;
    }

    matchCount += 1;

    availableSecond.splice(
      matchIndex,
      1,
    );
  });

  return (
    (2 * matchCount) /
    (
      firstBigrams.length +
      secondBigrams.length
    )
  );
}

function maximumWordSimilarity(
  firstForms: string[],
  secondForms: string[],
) {
  let maximum = 0;

  firstForms.forEach(
    (firstForm) => {
      secondForms.forEach(
        (secondForm) => {
          maximum = Math.max(
            maximum,
            diceSimilarity(
              firstForm,
              secondForm,
            ),
          );
        },
      );
    },
  );

  return maximum;
}

function getConceptSet(entry: Entry) {
  const meanings = Array.isArray(
    entry.meanings,
  )
    ? entry.meanings
    : [];

  const values = meanings.flatMap(
    (meaning) => [
      readField(
        meaning,
        [
          "conceptId",
          "concept_id",
          "conceptID",
        ],
      ),

      readField(
        meaning,
        [
          "conceptName",
          "concept_name",
          "concept",
          "category",
        ],
      ),
    ],
  );

  return new Set(
    values
      .map(normalize)
      .filter(Boolean),
  );
}

function getPartOfSpeechSet(
  entry: Entry,
) {
  const meanings = Array.isArray(
    entry.meanings,
  )
    ? entry.meanings
    : [];

  return new Set(
    meanings
      .map((meaning) =>
        normalize(
          readField(
            meaning,
            [
              "partOfSpeech",
              "part_of_speech",
              "pos",
              "grammar",
              "type",
            ],
          ),
        ),
      )
      .filter(Boolean),
  );
}

function hasSetOverlap(
  firstSet: Set<string>,
  secondSet: Set<string>,
) {
  for (const value of firstSet) {
    if (secondSet.has(value)) {
      return true;
    }
  }

  return false;
}

function scoreCandidate(
  sourceEntry: Entry,
  candidateEntry: Entry,
) {
  const sourceTokens = getTokenSet(
    getEntryText(sourceEntry),
  );

  const candidateTokens =
    getTokenSet(
      getEntryText(candidateEntry),
    );

  const semanticSimilarity =
    jaccardSimilarity(
      sourceTokens,
      candidateTokens,
    );

  const wordSimilarity =
    maximumWordSimilarity(
      getWordForms(sourceEntry),
      getWordForms(candidateEntry),
    );

  const sharedConcept =
    hasSetOverlap(
      getConceptSet(sourceEntry),
      getConceptSet(candidateEntry),
    );

  const sharedPartOfSpeech =
    hasSetOverlap(
      getPartOfSpeechSet(
        sourceEntry,
      ),
      getPartOfSpeechSet(
        candidateEntry,
      ),
    );

  return Math.min(
    100,
    Math.round(
      semanticSimilarity * 60 +
        wordSimilarity * 20 +
        (sharedConcept ? 22 : 0) +
        (
          sharedPartOfSpeech
            ? 8
            : 0
        ),
    ),
  );
}

function buildCandidateEntries(
  sourceEntry: Entry,
  entries: Entry[],
) {
  const scoredCandidates:
    ScoredCandidate[] = entries
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
        second.score -
          first.score ||
        first.entry.word.localeCompare(
          second.entry.word,
        ),
    );

  const strongCandidates =
    scoredCandidates.filter(
      (candidate) =>
        candidate.score >= 6,
    );

  if (
    strongCandidates.length >= 8
  ) {
    return strongCandidates.slice(
      0,
      MAX_CANDIDATES,
    );
  }

  return scoredCandidates.slice(
    0,
    Math.min(
      12,
      scoredCandidates.length,
    ),
  );
}

function relationshipTypeLabel(
  type: AIRelationshipType,
) {
  if (type === "same_concept") {
    return "Same concept";
  }

  if (type === "related_to") {
    return "Related to";
  }

  if (
    type === "contextual_pair"
  ) {
    return "Contextual pair";
  }

  if (type === "derived_form") {
    return "Derived form";
  }

  if (
    type === "phrase_component"
  ) {
    return "Phrase component";
  }

  return (
    type.charAt(0).toUpperCase() +
    type.slice(1)
  );
}

function directionLabel(
  direction:
    AIRelationshipDirection,
) {
  if (
    direction ===
    "source_to_target"
  ) {
    return "Source → target";
  }

  if (
    direction ===
    "target_to_source"
  ) {
    return "Target → source";
  }

  return "Bidirectional";
}

function createPendingDecisions(
  result:
    AIRelationshipSuggestionResult,
) {
  return Object.fromEntries(
    result.suggestions.map(
      (suggestion) => [
        suggestion.id,
        "pending" as AIRelationshipDecision,
      ],
    ),
  );
}

function formatApprovedPlan(
  result:
    AIRelationshipSuggestionResult,

  approvedSuggestions:
    AIRelationshipSuggestion[],
) {
  return [
    "YERRR Studio AI Relationship Plan",
    `Source entry: ${result.sourceEntryWord}`,
    `Approved suggestions: ${approvedSuggestions.length}`,
    "",

    ...approvedSuggestions.flatMap(
      (suggestion, index) => [
        `${index + 1}. ${result.sourceEntryWord} ↔ ${suggestion.targetWord}`,
        `Target entry ID: ${suggestion.targetEntryId}`,
        `Relationship type: ${relationshipTypeLabel(
          suggestion.relationshipType,
        )}`,
        `Direction: ${directionLabel(
          suggestion.direction,
        )}`,
        `Confidence: ${suggestion.confidence}`,
        `Score: ${suggestion.relationshipScore}/100`,
        `Reasoning: ${suggestion.reasoning}`,
        `Shared signals: ${
          suggestion.sharedSignals.join(
            "; ",
          ) || "None listed"
        }`,
        `Differences: ${
          suggestion.differences.join(
            "; ",
          ) || "None listed"
        }`,
        `Verification: ${
          suggestion.verificationNote
        }`,
        "",
      ],
    ),

    "No Knowledge Graph relationships were created automatically.",
  ].join("\n");
}

export function AIRelationshipSuggestionsPanel({
  entries,
  onClose,
  onOpenEntry,
  onOpenRelationshipEditor,
}: AIRelationshipSuggestionsPanelProps) {
  const [search, setSearch] =
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
    useState<AIRelationshipSuggestionResult | null>(
      null,
    );

  const [
    decisions,
    setDecisions,
  ] = useState<
    Record<
      string,
      AIRelationshipDecision
    >
  >({});

  const [modelLabel, setModelLabel] =
    useState("");

  const [error, setError] =
    useState("");

  const [isLoading, setIsLoading] =
    useState(false);

  const [copiedLabel, setCopiedLabel] =
    useState("");

  const sortedEntries = useMemo(() => {
    return [...entries].sort(
      (first, second) =>
        first.word.localeCompare(
          second.word,
        ),
    );
  }, [entries]);

  const selectedEntry = useMemo(() => {
    return (
      entries.find(
        (entry) =>
          String(entry.id) ===
          selectedEntryId,
      ) ?? null
    );
  }, [
    entries,
    selectedEntryId,
  ]);

  const filteredEntries =
    useMemo(() => {
      const normalizedSearch =
        normalize(search);

      const filtered =
        normalizedSearch
          ? sortedEntries.filter(
              (entry) =>
                normalize(
                  [
                    entry.word,
                    entry.slug,
                    entry.alternateSpellings,
                  ].join(" "),
                ).includes(
                  normalizedSearch,
                ),
            )
          : sortedEntries;

      if (
        selectedEntry &&
        !filtered.some(
          (entry) =>
            String(entry.id) ===
            String(
              selectedEntry.id,
            ),
        )
      ) {
        return [
          selectedEntry,
          ...filtered,
        ];
      }

      return filtered;
    }, [
      search,
      selectedEntry,
      sortedEntries,
    ]);

  const scoredCandidates =
    useMemo(() => {
      if (!selectedEntry) {
        return [];
      }

      return buildCandidateEntries(
        selectedEntry,
        entries,
      );
    }, [
      entries,
      selectedEntry,
    ]);

  const approvedSuggestions =
    useMemo(() => {
      if (!result) {
        return [];
      }

      return result.suggestions.filter(
        (suggestion) =>
          decisions[suggestion.id] ===
          "approved",
      );
    }, [
      decisions,
      result,
    ]);

  const decisionCounts =
    useMemo(() => {
      if (!result) {
        return {
          pending: 0,
          approved: 0,
          rejected: 0,
        };
      }

      return result.suggestions.reduce(
        (counts, suggestion) => {
          const decision =
            decisions[
              suggestion.id
            ] ?? "pending";

          counts[decision] += 1;

          return counts;
        },
        {
          pending: 0,
          approved: 0,
          rejected: 0,
        },
      );
    }, [
      decisions,
      result,
    ]);

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
  }, [
    entries,
    selectedEntryId,
  ]);

  useEffect(() => {
    setResult(null);
    setDecisions({});
    setModelLabel("");
    setError("");
    setCopiedLabel("");
  }, [selectedEntryId]);

  function setDecision(
    suggestionId: string,
    decision:
      AIRelationshipDecision,
  ) {
    setDecisions(
      (currentDecisions) => ({
        ...currentDecisions,

        [suggestionId]:
          decision,
      }),
    );
  }

  function approveStrongSuggestions() {
    if (!result) {
      return;
    }

    setDecisions(
      (currentDecisions) => {
        const nextDecisions = {
          ...currentDecisions,
        };

        result.suggestions.forEach(
          (suggestion) => {
            if (
              suggestion.confidence ===
                "high" &&
              suggestion.relationshipScore >=
                70 &&
              !suggestion.requiresVerification
            ) {
              nextDecisions[
                suggestion.id
              ] = "approved";
            }
          },
        );

        return nextDecisions;
      },
    );
  }

  function resetDecisions() {
    if (!result) {
      return;
    }

    setDecisions(
      createPendingDecisions(
        result,
      ),
    );
  }

  async function runSuggestions() {
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
      setDecisions({});
      setCopiedLabel("");

      const response = await fetch(
        "/api/ai-relationship-suggestions",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            sourceEntry:
              selectedEntry,

            candidates:
              scoredCandidates.map(
                (candidate) =>
                  candidate.entry,
              ),
          }),
        },
      );

      let payload:
        AIRelationshipSuggestionResponse =
        {};

      try {
        payload =
          (await response.json()) as AIRelationshipSuggestionResponse;
      } catch {
        payload = {};
      }

      if (
        !response.ok ||
        !payload.result
      ) {
        throw new Error(
          payload.error ||
            "The relationship suggestion request failed.",
        );
      }

      setResult(payload.result);

      setModelLabel(
        payload.model ?? "",
      );

      setDecisions(
        createPendingDecisions(
          payload.result,
        ),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The relationship suggestion request failed.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function copyText(
    label: string,
    value: string,
  ) {
    try {
      await navigator.clipboard.writeText(
        value,
      );

      setCopiedLabel(label);

      window.setTimeout(() => {
        setCopiedLabel(
          (currentLabel) =>
            currentLabel === label
              ? ""
              : currentLabel,
        );
      }, 1_800);

      return true;
    } catch {
      setCopiedLabel("");
      return false;
    }
  }

  async function copyApprovedPlan(
    openRelationshipEditor = false,
  ) {
    if (
      !result ||
      approvedSuggestions.length ===
        0
    ) {
      return;
    }

    await copyText(
      "approved-plan",
      formatApprovedPlan(
        result,
        approvedSuggestions,
      ),
    );

    if (
      openRelationshipEditor &&
      onOpenRelationshipEditor
    ) {
      onClose();
      onOpenRelationshipEditor();
    }
  }

  function openEntry(entry: Entry) {
    onClose();
    onOpenEntry?.(entry);
  }

  function openTargetEntry(
    suggestion:
      AIRelationshipSuggestion,
  ) {
    const targetEntry =
      entries.find(
        (entry) =>
          String(entry.id) ===
          suggestion.targetEntryId,
      );

    if (targetEntry) {
      openEntry(targetEntry);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[83] bg-black/80 backdrop-blur-sm"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close AI relationship suggestions"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-relationship-title"
        className="absolute bottom-0 right-0 flex h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-neutral-800 bg-neutral-950 shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-w-4xl md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0"
      >
        <header className="border-b border-neutral-800 bg-neutral-950/95 p-5 backdrop-blur sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">
                Alpha 5.9
              </p>

              <h2
                id="ai-relationship-title"
                className="mt-2 text-2xl font-black text-white"
              >
                AI Relationship Suggestions
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
                Discover possible Knowledge
                Graph connections, approve a
                plan, then create relationships
                manually in Cloud Relationships.
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
            <section className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5">
              <p className="font-black text-emerald-100">
                Choose a source entry
              </p>

              <p className="mt-2 text-sm leading-6 text-emerald-100/70">
                Local scoring chooses likely
                candidates. AI then compares
                meaning, context, tone, grammar,
                and concepts.
              </p>

              <input
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value,
                  )
                }
                placeholder="Search entries..."
                className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-emerald-400"
              />

              <select
                value={selectedEntryId}
                onChange={(event) =>
                  setSelectedEntryId(
                    event.target.value,
                  )
                }
                className="mt-3 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-bold text-white outline-none focus:border-emerald-400"
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
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-neutral-600">
                        Source
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
                        candidate entries
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        openEntry(
                          selectedEntry,
                        )
                      }
                      className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-black text-neutral-300 hover:border-emerald-400 hover:text-emerald-200"
                    >
                      Open source
                    </button>
                  </div>

                  {scoredCandidates.length >
                    0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {scoredCandidates
                        .slice(0, 10)
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
                  void runSuggestions()
                }
                disabled={
                  !selectedEntry ||
                  isLoading ||
                  scoredCandidates.length ===
                    0
                }
                className="mt-4 w-full rounded-xl bg-emerald-300 px-4 py-3 text-sm font-black text-black hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isLoading
                  ? "Analyzing relationships..."
                  : "Suggest relationships"}
              </button>
            </section>

            {error && (
              <section className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4">
                <p className="font-black text-red-100">
                  Relationship analysis
                  failed
                </p>

                <p className="mt-2 text-sm leading-6 text-red-100/70">
                  {error}
                </p>
              </section>
            )}

            {result && (
              <>
                <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="rounded-2xl bg-neutral-950 p-3">
                      <p className="text-xl font-black text-white">
                        {
                          result.analyzedCandidateCount
                        }
                      </p>

                      <p className="mt-1 text-[9px] font-black uppercase tracking-[0.13em] text-neutral-600">
                        Analyzed
                      </p>
                    </div>

                    <div className="rounded-2xl bg-neutral-950 p-3">
                      <p className="text-xl font-black text-yellow-200">
                        {
                          decisionCounts.pending
                        }
                      </p>

                      <p className="mt-1 text-[9px] font-black uppercase tracking-[0.13em] text-neutral-600">
                        Pending
                      </p>
                    </div>

                    <div className="rounded-2xl bg-neutral-950 p-3">
                      <p className="text-xl font-black text-green-200">
                        {
                          decisionCounts.approved
                        }
                      </p>

                      <p className="mt-1 text-[9px] font-black uppercase tracking-[0.13em] text-neutral-600">
                        Approved
                      </p>
                    </div>

                    <div className="rounded-2xl bg-neutral-950 p-3">
                      <p className="truncate text-xs font-black text-neutral-300">
                        {modelLabel ||
                          "AI"}
                      </p>

                      <p className="mt-2 text-[9px] font-black uppercase tracking-[0.13em] text-neutral-600">
                        Model
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-neutral-400">
                    {result.summary}
                  </p>

                  {result.suggestions.length >
                    0 && (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={
                          approveStrongSuggestions
                        }
                        className="rounded-xl bg-green-400 px-3 py-3 text-xs font-black text-black hover:bg-green-300"
                      >
                        Approve strongest
                      </button>

                      <button
                        type="button"
                        onClick={
                          resetDecisions
                        }
                        className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-xs font-black text-neutral-300 hover:border-neutral-500 hover:text-white"
                      >
                        Reset decisions
                      </button>
                    </div>
                  )}
                </section>

                {result.suggestions.length ===
                0 ? (
                  <section className="rounded-3xl border border-green-400/20 bg-green-400/10 p-6 text-center">
                    <p className="text-lg font-black text-green-100">
                      No relationships flagged
                    </p>

                    <p className="mt-2 text-sm leading-6 text-green-100/70">
                      The selected candidates did
                      not provide enough evidence
                      for a relationship
                      suggestion.
                    </p>
                  </section>
                ) : (
                  <section>
                    <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-neutral-500">
                      Suggested relationships
                    </p>

                    <div className="space-y-4">
                      {result.suggestions.map(
                        (suggestion) => {
                          const decision =
                            decisions[
                              suggestion.id
                            ] ??
                            "pending";

                          const copyLabel =
                            `suggestion-${suggestion.id}`;

                          return (
                            <article
                              key={
                                suggestion.id
                              }
                              className={`rounded-3xl border p-5 ${
                                decision ===
                                "approved"
                                  ? "border-green-400/30 bg-green-400/10"
                                  : decision ===
                                      "rejected"
                                    ? "border-red-400/20 bg-red-400/5"
                                    : "border-neutral-800 bg-neutral-900"
                              }`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                  <div className="flex flex-wrap gap-2">
                                    <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.13em] text-emerald-100">
                                      {relationshipTypeLabel(
                                        suggestion.relationshipType,
                                      )}
                                    </span>

                                    <span className="rounded-full bg-neutral-800 px-3 py-1 text-[10px] font-black text-neutral-300">
                                      {directionLabel(
                                        suggestion.direction,
                                      )}
                                    </span>

                                    <span className="rounded-full bg-neutral-800 px-3 py-1 text-[10px] font-black text-neutral-400">
                                      {
                                        suggestion.confidence
                                      }{" "}
                                      confidence
                                    </span>
                                  </div>

                                  <h3 className="mt-3 text-xl font-black text-white">
                                    {
                                      result.sourceEntryWord
                                    }{" "}
                                    ↔{" "}
                                    {
                                      suggestion.targetWord
                                    }
                                  </h3>
                                </div>

                                <div className="text-right">
                                  <p className="text-3xl font-black text-emerald-200">
                                    {
                                      suggestion.relationshipScore
                                    }
                                  </p>

                                  <p className="text-[9px] font-black uppercase tracking-[0.13em] text-neutral-600">
                                    Score
                                  </p>
                                </div>
                              </div>

                              <p className="mt-4 text-sm leading-6 text-neutral-300">
                                {
                                  suggestion.reasoning
                                }
                              </p>

                              <div className="mt-4 grid gap-3 md:grid-cols-2">
                                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-green-200">
                                    Shared signals
                                  </p>

                                  {suggestion.sharedSignals
                                    .length ===
                                  0 ? (
                                    <p className="mt-3 text-xs text-neutral-500">
                                      No shared
                                      signals listed.
                                    </p>
                                  ) : (
                                    <div className="mt-3 space-y-2">
                                      {suggestion.sharedSignals.map(
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
                                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-cyan-200">
                                    Differences
                                  </p>

                                  {suggestion.differences
                                    .length ===
                                  0 ? (
                                    <p className="mt-3 text-xs text-neutral-500">
                                      No important
                                      differences
                                      listed.
                                    </p>
                                  ) : (
                                    <div className="mt-3 space-y-2">
                                      {suggestion.differences.map(
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

                              {suggestion.requiresVerification && (
                                <div className="mt-4 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
                                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-yellow-200">
                                    Verification required
                                  </p>

                                  <p className="mt-2 text-xs leading-5 text-yellow-100/70">
                                    {
                                      suggestion.verificationNote
                                    }
                                  </p>
                                </div>
                              )}

                              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDecision(
                                      suggestion.id,
                                      "approved",
                                    )
                                  }
                                  className="rounded-xl bg-green-400 px-3 py-2 text-xs font-black text-black hover:bg-green-300"
                                >
                                  Approve
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setDecision(
                                      suggestion.id,
                                      "rejected",
                                    )
                                  }
                                  className="rounded-xl bg-red-500/20 px-3 py-2 text-xs font-black text-red-200 hover:bg-red-500/30"
                                >
                                  Reject
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    void copyText(
                                      copyLabel,
                                      [
                                        `${result.sourceEntryWord} ↔ ${suggestion.targetWord}`,
                                        `Type: ${relationshipTypeLabel(
                                          suggestion.relationshipType,
                                        )}`,
                                        `Direction: ${directionLabel(
                                          suggestion.direction,
                                        )}`,
                                        `Reason: ${suggestion.reasoning}`,
                                      ].join(
                                        "\n",
                                      ),
                                    )
                                  }
                                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-black text-neutral-300 hover:border-emerald-400 hover:text-emerald-200"
                                >
                                  {copiedLabel ===
                                  copyLabel
                                    ? "Copied"
                                    : "Copy"}
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    openTargetEntry(
                                      suggestion,
                                    )
                                  }
                                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-black text-neutral-300 hover:border-cyan-400 hover:text-cyan-200"
                                >
                                  Open target
                                </button>
                              </div>
                            </article>
                          );
                        },
                      )}
                    </div>
                  </section>
                )}

                {result.verificationChecklist
                  .length > 0 && (
                  <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500">
                      Graph review checklist
                    </p>

                    <div className="mt-4 space-y-2">
                      {result.verificationChecklist.map(
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

                <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                  <p className="font-black text-emerald-100">
                    Manual graph editing only
                  </p>

                  <p className="mt-2 text-sm leading-6 text-emerald-100/70">
                    Approving a suggestion only
                    adds it to the local plan. Use
                    Cloud Relationships to create
                    verified graph records
                    manually.
                  </p>
                </section>
              </>
            )}
          </div>
        </div>

        <footer className="border-t border-neutral-800 bg-neutral-950 p-4 sm:p-5">
          <div className="grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() =>
                void copyApprovedPlan(
                  false,
                )
              }
              disabled={
                approvedSuggestions.length ===
                0
              }
              className="rounded-xl bg-emerald-300 px-4 py-3 text-sm font-black text-black hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {copiedLabel ===
              "approved-plan"
                ? "Plan copied"
                : `Copy approved · ${approvedSuggestions.length}`}
            </button>

            <button
              type="button"
              onClick={() =>
                void copyApprovedPlan(
                  true,
                )
              }
              disabled={
                approvedSuggestions.length ===
                  0 ||
                !onOpenRelationshipEditor
              }
              className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm font-black text-emerald-100 hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Copy + open relationships
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-black text-neutral-300 hover:border-neutral-500 hover:text-white"
            >
              Close
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}

export default AIRelationshipSuggestionsPanel;
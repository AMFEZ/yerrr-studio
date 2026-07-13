"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type { Entry } from "@/types/entry";

type CompletionFilter =
  | "all"
  | "urgent"
  | "high_priority"
  | "required_missing"
  | "quick_wins"
  | "incomplete"
  | "nearly_complete"
  | "ready"
  | "missing_definition"
  | "missing_example"
  | "missing_pronunciation"
  | "missing_plain_english"
  | "missing_cultural_context"
  | "missing_sources"
  | "missing_verification";

type CompletionSort =
  | "priority"
  | "lowest_score"
  | "highest_score"
  | "most_missing"
  | "fewest_missing"
  | "a_z"
  | "z_a";

type CompletionStatus =
  | "incomplete"
  | "nearly_complete"
  | "ready";

type PriorityTier =
  | "urgent"
  | "high"
  | "normal"
  | "ready";

type EntryAnalysis = {
  entry: Entry;
  score: number;
  status: CompletionStatus;
  priority: PriorityTier;
  priorityScore: number;
  completedChecks: number;
  totalChecks: number;
  missingFields: string[];
  requiredMissingFields: string[];
  gapKeys: string[];
  recommendedAction: string;
  isQuickWin: boolean;
  hasDefinition: boolean;
  hasExample: boolean;
  hasPronunciation: boolean;
  hasPlainEnglish: boolean;
  hasCulturalContext: boolean;
  hasSources: boolean;
  hasVerification: boolean;
};

type ContentCompletionDashboardProps = {
  isOpen: boolean;
  onClose: () => void;
  entries?: Entry[];
  onOpenEntry?: (entry: Entry) => void;
};

type MeaningFieldDefinition = {
  key: string;
  label: string;
  aliases: string[];
  required: boolean;
};

const MEANING_FIELDS: MeaningFieldDefinition[] = [
  {
    key: "part_of_speech",
    label: "Part of speech",
    aliases: [
      "partOfSpeech",
      "part_of_speech",
      "pos",
      "type",
      "grammar",
    ],
    required: true,
  },
  {
    key: "definition",
    label: "Definition",
    aliases: [
      "definition",
      "meaning",
      "gloss",
    ],
    required: true,
  },
  {
    key: "plain_english",
    label: "Plain English",
    aliases: [
      "plainEnglish",
      "plain_english",
      "plainMeaning",
      "plain_meaning",
    ],
    required: false,
  },
  {
    key: "example",
    label: "Example sentence",
    aliases: [
      "exampleSentence",
      "example_sentence",
      "example",
      "usageExample",
      "usage_example",
    ],
    required: true,
  },
  {
    key: "cultural_context",
    label: "Cultural context",
    aliases: [
      "culturalContext",
      "cultural_context",
      "culture",
      "context",
    ],
    required: false,
  },
  {
    key: "tone",
    label: "Tone",
    aliases: [
      "tone",
      "tones",
    ],
    required: false,
  },
  {
    key: "usage_frequency",
    label: "Usage frequency",
    aliases: [
      "usageFrequency",
      "usage_frequency",
      "frequency",
    ],
    required: false,
  },
  {
    key: "sources",
    label: "Sources",
    aliases: [
      "sources",
      "source",
      "citations",
      "citation",
      "references",
    ],
    required: false,
  },
  {
    key: "verification",
    label: "Verification status",
    aliases: [
      "verificationStatus",
      "verification_status",
      "verified",
      "verification",
    ],
    required: false,
  },
];

const FILTER_OPTIONS: Array<{
  value: CompletionFilter;
  label: string;
}> = [
  {
    value: "all",
    label: "All entries",
  },
  {
    value: "urgent",
    label: "Urgent priority",
  },
  {
    value: "high_priority",
    label: "High priority",
  },
  {
    value: "required_missing",
    label: "Required fields missing",
  },
  {
    value: "quick_wins",
    label: "Quick wins",
  },
  {
    value: "incomplete",
    label: "Incomplete",
  },
  {
    value: "nearly_complete",
    label: "Nearly complete",
  },
  {
    value: "ready",
    label: "Ready",
  },
  {
    value: "missing_definition",
    label: "Missing definition",
  },
  {
    value: "missing_example",
    label: "Missing example",
  },
  {
    value: "missing_pronunciation",
    label: "Missing pronunciation",
  },
  {
    value: "missing_plain_english",
    label: "Missing plain English",
  },
  {
    value: "missing_cultural_context",
    label: "Missing cultural context",
  },
  {
    value: "missing_sources",
    label: "Missing sources",
  },
  {
    value: "missing_verification",
    label: "Missing verification",
  },
];

const SORT_OPTIONS: Array<{
  value: CompletionSort;
  label: string;
}> = [
  {
    value: "priority",
    label: "Highest priority first",
  },
  {
    value: "lowest_score",
    label: "Lowest completion first",
  },
  {
    value: "highest_score",
    label: "Highest completion first",
  },
  {
    value: "most_missing",
    label: "Most missing fields",
  },
  {
    value: "fewest_missing",
    label: "Fewest missing fields",
  },
  {
    value: "a_z",
    label: "Word: A–Z",
  },
  {
    value: "z_a",
    label: "Word: Z–A",
  },
];

const PRIORITY_ORDER: Record<
  PriorityTier,
  number
> = {
  urgent: 4,
  high: 3,
  normal: 2,
  ready: 1,
};

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeSearch(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasValue(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some(hasValue);
  }

  if (value && typeof value === "object") {
    return Object.values(
      value as Record<string, unknown>,
    ).some(hasValue);
  }

  return false;
}

function readAlias(
  source: unknown,
  aliases: string[],
): unknown {
  if (!source || typeof source !== "object") {
    return undefined;
  }

  const wantedKeys = new Set(
    aliases.map(normalizeKey),
  );

  for (const [key, value] of Object.entries(
    source as Record<string, unknown>,
  )) {
    if (wantedKeys.has(normalizeKey(key))) {
      return value;
    }
  }

  return undefined;
}

function hasAlias(
  source: unknown,
  aliases: string[],
) {
  return hasValue(readAlias(source, aliases));
}

function getMeanings(entry: Entry) {
  return Array.isArray(entry.meanings)
    ? entry.meanings
    : [];
}

function getPriority(
  score: number,
  requiredMissingFields: string[],
  gapKeys: Set<string>,
): {
  priority: PriorityTier;
  priorityScore: number;
} {
  const missingCoreMeaning =
    gapKeys.has("meaning") ||
    gapKeys.has("definition");

  const missingExample =
    gapKeys.has("example");

  const missingPartOfSpeech =
    gapKeys.has("part_of_speech");

  let priorityScore =
    requiredMissingFields.length * 20 +
    Math.max(0, 100 - score);

  if (missingCoreMeaning) {
    priorityScore += 50;
  }

  if (missingExample) {
    priorityScore += 25;
  }

  if (missingPartOfSpeech) {
    priorityScore += 20;
  }

  if (
    missingCoreMeaning ||
    requiredMissingFields.length >= 3
  ) {
    return {
      priority: "urgent",
      priorityScore,
    };
  }

  if (
    requiredMissingFields.length > 0 ||
    score < 70
  ) {
    return {
      priority: "high",
      priorityScore,
    };
  }

  if (score < 90) {
    return {
      priority: "normal",
      priorityScore,
    };
  }

  return {
    priority: "ready",
    priorityScore: 0,
  };
}

function getRecommendedAction(
  gapKeys: Set<string>,
  requiredMissingFields: string[],
) {
  if (gapKeys.has("meaning")) {
    return "Add the first meaning";
  }

  if (gapKeys.has("definition")) {
    return "Write the missing definition";
  }

  if (gapKeys.has("part_of_speech")) {
    return "Assign a part of speech";
  }

  if (gapKeys.has("example")) {
    return "Add an example sentence";
  }

  if (requiredMissingFields.length > 0) {
    return `Complete ${requiredMissingFields[0]}`;
  }

  if (gapKeys.has("plain_english")) {
    return "Add the plain-English explanation";
  }

  if (gapKeys.has("cultural_context")) {
    return "Add cultural context";
  }

  if (gapKeys.has("pronunciation")) {
    return "Add pronunciation";
  }

  if (gapKeys.has("sources")) {
    return "Add supporting sources";
  }

  if (gapKeys.has("verification")) {
    return "Review verification status";
  }

  if (gapKeys.has("tone")) {
    return "Document the entry tone";
  }

  if (gapKeys.has("usage_frequency")) {
    return "Set usage frequency";
  }

  return "Review for publication readiness";
}

function analyzeEntry(
  entry: Entry,
): EntryAnalysis {
  let completedChecks = 0;
  let totalChecks = 0;

  const missingFields: string[] = [];
  const requiredMissingFields: string[] = [];
  const gapKeys = new Set<string>();

  function recordCheck(
    label: string,
    isComplete: boolean,
    required: boolean,
    gapKey: string,
  ) {
    totalChecks += 1;

    if (isComplete) {
      completedChecks += 1;
      return;
    }

    missingFields.push(label);
    gapKeys.add(gapKey);

    if (required) {
      requiredMissingFields.push(label);
    }
  }

  recordCheck(
    "Word",
    hasValue(entry.word),
    true,
    "word",
  );

  recordCheck(
    "Slug",
    hasValue(entry.slug),
    true,
    "slug",
  );

  recordCheck(
    "Status",
    hasValue(entry.status),
    false,
    "status",
  );

  recordCheck(
    "Pronunciation",
    hasValue(entry.pronunciation),
    false,
    "pronunciation",
  );

  const meanings = getMeanings(entry);

  recordCheck(
    "At least one meaning",
    meanings.length > 0,
    true,
    "meaning",
  );

  if (meanings.length === 0) {
    MEANING_FIELDS.forEach((field) => {
      recordCheck(
        field.label,
        false,
        field.required,
        field.key,
      );
    });
  } else {
    meanings.forEach((meaning, index) => {
      MEANING_FIELDS.forEach((field) => {
        recordCheck(
          meanings.length === 1
            ? field.label
            : `Meaning ${index + 1}: ${field.label}`,
          hasAlias(meaning, field.aliases),
          field.required,
          field.key,
        );
      });
    });
  }

  const score =
    totalChecks > 0
      ? Math.round(
          (completedChecks / totalChecks) * 100,
        )
      : 0;

  let status: CompletionStatus = "incomplete";

  if (
    score >= 90 &&
    requiredMissingFields.length === 0
  ) {
    status = "ready";
  } else if (score >= 70) {
    status = "nearly_complete";
  }

  const priorityResult = getPriority(
    score,
    requiredMissingFields,
    gapKeys,
  );

  const isQuickWin =
    status !== "ready" &&
    missingFields.length <= 3 &&
    requiredMissingFields.length <= 1;

  return {
    entry,
    score,
    status,
    priority: priorityResult.priority,
    priorityScore:
      priorityResult.priorityScore,
    completedChecks,
    totalChecks,
    missingFields,
    requiredMissingFields,
    gapKeys: Array.from(gapKeys),
    recommendedAction: getRecommendedAction(
      gapKeys,
      requiredMissingFields,
    ),
    isQuickWin,
    hasDefinition:
      !gapKeys.has("definition"),
    hasExample:
      !gapKeys.has("example"),
    hasPronunciation:
      !gapKeys.has("pronunciation"),
    hasPlainEnglish:
      !gapKeys.has("plain_english"),
    hasCulturalContext:
      !gapKeys.has("cultural_context"),
    hasSources:
      !gapKeys.has("sources"),
    hasVerification:
      !gapKeys.has("verification"),
  };
}

function completionStatusLabel(
  status: CompletionStatus,
) {
  if (status === "ready") {
    return "Ready";
  }

  if (status === "nearly_complete") {
    return "Nearly complete";
  }

  return "Incomplete";
}

function completionStatusClasses(
  status: CompletionStatus,
) {
  if (status === "ready") {
    return "border-green-400/25 bg-green-400/10 text-green-200";
  }

  if (status === "nearly_complete") {
    return "border-yellow-400/25 bg-yellow-400/10 text-yellow-100";
  }

  return "border-red-400/25 bg-red-400/10 text-red-100";
}

function priorityLabel(
  priority: PriorityTier,
) {
  if (priority === "urgent") {
    return "Urgent";
  }

  if (priority === "high") {
    return "High priority";
  }

  if (priority === "normal") {
    return "Normal";
  }

  return "Ready";
}

function priorityClasses(
  priority: PriorityTier,
) {
  if (priority === "urgent") {
    return "border-red-400/30 bg-red-400/15 text-red-100";
  }

  if (priority === "high") {
    return "border-orange-400/30 bg-orange-400/15 text-orange-100";
  }

  if (priority === "normal") {
    return "border-blue-400/25 bg-blue-400/10 text-blue-100";
  }

  return "border-green-400/25 bg-green-400/10 text-green-100";
}

function scoreClasses(score: number) {
  if (score >= 90) {
    return "text-green-300";
  }

  if (score >= 70) {
    return "text-yellow-300";
  }

  return "text-red-300";
}

function matchesFilter(
  analysis: EntryAnalysis,
  filter: CompletionFilter,
) {
  if (filter === "all") {
    return true;
  }

  if (filter === "urgent") {
    return analysis.priority === "urgent";
  }

  if (filter === "high_priority") {
    return analysis.priority === "high";
  }

  if (filter === "required_missing") {
    return (
      analysis.requiredMissingFields.length > 0
    );
  }

  if (filter === "quick_wins") {
    return analysis.isQuickWin;
  }

  if (
    filter === "incomplete" ||
    filter === "nearly_complete" ||
    filter === "ready"
  ) {
    return analysis.status === filter;
  }

  if (filter === "missing_definition") {
    return !analysis.hasDefinition;
  }

  if (filter === "missing_example") {
    return !analysis.hasExample;
  }

  if (filter === "missing_pronunciation") {
    return !analysis.hasPronunciation;
  }

  if (filter === "missing_plain_english") {
    return !analysis.hasPlainEnglish;
  }

  if (
    filter === "missing_cultural_context"
  ) {
    return !analysis.hasCulturalContext;
  }

  if (filter === "missing_sources") {
    return !analysis.hasSources;
  }

  if (filter === "missing_verification") {
    return !analysis.hasVerification;
  }

  return true;
}

function sortAnalyses(
  analyses: EntryAnalysis[],
  sort: CompletionSort,
) {
  return [...analyses].sort((a, b) => {
    if (sort === "priority") {
      const priorityDifference =
        PRIORITY_ORDER[b.priority] -
        PRIORITY_ORDER[a.priority];

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      if (
        b.priorityScore !== a.priorityScore
      ) {
        return (
          b.priorityScore - a.priorityScore
        );
      }

      return a.score - b.score;
    }

    if (sort === "highest_score") {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
    }

    if (sort === "lowest_score") {
      if (a.score !== b.score) {
        return a.score - b.score;
      }
    }

    if (sort === "most_missing") {
      if (
        b.missingFields.length !==
        a.missingFields.length
      ) {
        return (
          b.missingFields.length -
          a.missingFields.length
        );
      }
    }

    if (sort === "fewest_missing") {
      if (
        a.missingFields.length !==
        b.missingFields.length
      ) {
        return (
          a.missingFields.length -
          b.missingFields.length
        );
      }
    }

    if (sort === "z_a") {
      return String(
        b.entry.word,
      ).localeCompare(
        String(a.entry.word),
      );
    }

    return String(
      a.entry.word,
    ).localeCompare(
      String(b.entry.word),
    );
  });
}

export function ContentCompletionDashboard({
  isOpen,
  onClose,
  entries = [],
  onOpenEntry,
}: ContentCompletionDashboardProps) {
  const [query, setQuery] = useState("");

  const [filter, setFilter] =
    useState<CompletionFilter>("all");

  const [sort, setSort] =
    useState<CompletionSort>("priority");

  const analyses = useMemo(
    () => entries.map(analyzeEntry),
    [entries],
  );

  const overallCompletion = useMemo(() => {
    if (analyses.length === 0) {
      return 0;
    }

    const scoreTotal = analyses.reduce(
      (total, analysis) =>
        total + analysis.score,
      0,
    );

    return Math.round(
      scoreTotal / analyses.length,
    );
  }, [analyses]);

  const completionStats = useMemo(() => {
    return {
      total: analyses.length,

      incomplete: analyses.filter(
        (analysis) =>
          analysis.status === "incomplete",
      ).length,

      nearlyComplete: analyses.filter(
        (analysis) =>
          analysis.status ===
          "nearly_complete",
      ).length,

      ready: analyses.filter(
        (analysis) =>
          analysis.status === "ready",
      ).length,

      urgent: analyses.filter(
        (analysis) =>
          analysis.priority === "urgent",
      ).length,

      high: analyses.filter(
        (analysis) =>
          analysis.priority === "high",
      ).length,

      quickWins: analyses.filter(
        (analysis) => analysis.isQuickWin,
      ).length,

      requiredMissing: analyses.filter(
        (analysis) =>
          analysis.requiredMissingFields
            .length > 0,
      ).length,
    };
  }, [analyses]);

  const workloadStats = useMemo(() => {
    return analyses.reduce(
      (totals, analysis) => {
        totals.missingChecks +=
          analysis.missingFields.length;

        totals.requiredChecks +=
          analysis.requiredMissingFields
            .length;

        totals.completedChecks +=
          analysis.completedChecks;

        totals.totalChecks +=
          analysis.totalChecks;

        return totals;
      },
      {
        missingChecks: 0,
        requiredChecks: 0,
        completedChecks: 0,
        totalChecks: 0,
      },
    );
  }, [analyses]);

  const fieldGapStats = useMemo(() => {
    const counts = new Map<string, number>();

    analyses.forEach((analysis) => {
      analysis.gapKeys.forEach((gapKey) => {
        counts.set(
          gapKey,
          (counts.get(gapKey) ?? 0) + 1,
        );
      });
    });

    const labels: Record<string, string> = {
      word: "Word",
      slug: "Slug",
      status: "Status",
      pronunciation: "Pronunciation",
      meaning: "Meanings",
      part_of_speech: "Part of speech",
      definition: "Definition",
      plain_english: "Plain English",
      example: "Example sentence",
      cultural_context: "Cultural context",
      tone: "Tone",
      usage_frequency: "Usage frequency",
      sources: "Sources",
      verification: "Verification",
    };

    const requiredKeys = new Set([
      "word",
      "slug",
      "meaning",
      "part_of_speech",
      "definition",
      "example",
    ]);

    return Array.from(counts.entries())
      .map(([key, count]) => ({
        key,
        label: labels[key] ?? key,
        count,
        required: requiredKeys.has(key),
      }))
      .sort((a, b) => {
        if (
          a.required !== b.required
        ) {
          return a.required ? -1 : 1;
        }

        if (b.count !== a.count) {
          return b.count - a.count;
        }

        return a.label.localeCompare(b.label);
      });
  }, [analyses]);

  const visibleAnalyses = useMemo(() => {
    const normalizedQuery =
      normalizeSearch(query);

    const filtered = analyses.filter(
      (analysis) => {
        if (!matchesFilter(analysis, filter)) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        const entryText = normalizeSearch(
          [
            analysis.entry.word,
            analysis.entry.slug,
            analysis.entry.pronunciation,
            analysis.entry.alternateSpellings,
            analysis.entry.status,
            analysis.recommendedAction,
            analysis.priority,
            analysis.missingFields.join(" "),
          ].join(" "),
        );

        return entryText.includes(
          normalizedQuery,
        );
      },
    );

    return sortAnalyses(filtered, sort);
  }, [
    analyses,
    filter,
    query,
    sort,
  ]);

  const nextPriorityAnalysis = useMemo(() => {
    return (
      visibleAnalyses.find(
        (analysis) =>
          analysis.status !== "ready",
      ) ??
      visibleAnalyses[0] ??
      null
    );
  }, [visibleAnalyses]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = "hidden";

    function handleKeyDown(
      event: globalThis.KeyboardEvent,
    ) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [isOpen, onClose]);

  function openEntry(entry: Entry) {
    onClose();
    onOpenEntry?.(entry);
  }

  function openNextPriorityEntry() {
    if (!nextPriorityAnalysis) {
      return;
    }

    openEntry(nextPriorityAnalysis.entry);
  }

  function clearFilters() {
    setQuery("");
    setFilter("all");
    setSort("priority");
  }

  function applyGapFilter(gapKey: string) {
    if (gapKey === "definition") {
      setFilter("missing_definition");
    } else if (gapKey === "example") {
      setFilter("missing_example");
    } else if (
      gapKey === "pronunciation"
    ) {
      setFilter("missing_pronunciation");
    } else if (
      gapKey === "plain_english"
    ) {
      setFilter("missing_plain_english");
    } else if (
      gapKey === "cultural_context"
    ) {
      setFilter(
        "missing_cultural_context",
      );
    } else if (gapKey === "sources") {
      setFilter("missing_sources");
    } else if (
      gapKey === "verification"
    ) {
      setFilter("missing_verification");
    } else {
      setFilter("required_missing");
    }

    setSort("priority");
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm">
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
        className="absolute bottom-0 right-0 flex max-h-[96vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-neutral-800 bg-neutral-950 shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-h-none md:max-w-6xl md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0"
      >
        <header className="shrink-0 border-b border-neutral-800 bg-neutral-950/95 p-5 backdrop-blur sm:p-6">
          <div className="flex items-start justify-between gap-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-400">
                  Alpha 5.13B
                </p>

                <span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-200">
                  Editorial Focus Queue
                </span>

                <span className="rounded-full border border-green-400/20 bg-green-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-green-200">
                  Read only
                </span>
              </div>

              <h2
                id="content-completion-title"
                className="mt-3 text-2xl font-black text-white sm:text-3xl"
              >
                Content Completion Dashboard
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
                Prioritize incomplete records,
                identify quick wins, and open the
                next entry requiring editorial work.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-black text-neutral-300 transition hover:border-neutral-700 hover:text-white"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5 sm:p-6">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500">
                  Overall lexicon completion
                </p>

                <div className="mt-3 flex items-end gap-3">
                  <p
                    className={`text-5xl font-black ${scoreClasses(
                      overallCompletion,
                    )}`}
                  >
                    {overallCompletion}%
                  </p>

                  <p className="pb-1 text-sm text-neutral-500">
                    across {entries.length} entries
                  </p>
                </div>

                <div className="mt-4 h-3 w-full max-w-xl overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className="h-full rounded-full bg-yellow-400 transition-all"
                    style={{
                      width: `${overallCompletion}%`,
                    }}
                  />
                </div>
              </div>

              <div className="w-full rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-5 xl:max-w-md">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-yellow-300">
                  Next priority entry
                </p>

                {nextPriorityAnalysis ? (
                  <>
                    <div className="mt-3 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-xl font-black text-white">
                          {String(
                            nextPriorityAnalysis
                              .entry.word ||
                              "Untitled entry",
                          )}
                        </p>

                        <p className="mt-1 text-sm text-yellow-100/70">
                          {
                            nextPriorityAnalysis
                              .recommendedAction
                          }
                        </p>
                      </div>

                      <p
                        className={`shrink-0 text-2xl font-black ${scoreClasses(
                          nextPriorityAnalysis.score,
                        )}`}
                      >
                        {
                          nextPriorityAnalysis.score
                        }
                        %
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={
                        openNextPriorityEntry
                      }
                      disabled={!onOpenEntry}
                      className="mt-4 w-full rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-black text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Open Next Priority Entry
                    </button>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-yellow-100/70">
                    No entries match the current
                    queue.
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <button
              type="button"
              onClick={() => {
                setFilter("urgent");
                setSort("priority");
              }}
              className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-left transition hover:border-red-400/50"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-red-200/70">
                Urgent
              </p>

              <p className="mt-2 text-3xl font-black text-red-100">
                {completionStats.urgent}
              </p>

              <p className="mt-1 text-xs text-red-100/50">
                Core content missing
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilter("high_priority");
                setSort("priority");
              }}
              className="rounded-2xl border border-orange-400/20 bg-orange-400/10 p-4 text-left transition hover:border-orange-400/50"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-200/70">
                High priority
              </p>

              <p className="mt-2 text-3xl font-black text-orange-100">
                {completionStats.high}
              </p>

              <p className="mt-1 text-xs text-orange-100/50">
                Major work required
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilter("quick_wins");
                setSort("fewest_missing");
              }}
              className="rounded-2xl border border-blue-400/20 bg-blue-400/10 p-4 text-left transition hover:border-blue-400/50"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-200/70">
                Quick wins
              </p>

              <p className="mt-2 text-3xl font-black text-blue-100">
                {completionStats.quickWins}
              </p>

              <p className="mt-1 text-xs text-blue-100/50">
                Three gaps or fewer
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilter("ready");
                setSort("a_z");
              }}
              className="rounded-2xl border border-green-400/20 bg-green-400/10 p-4 text-left transition hover:border-green-400/50"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-green-200/70">
                Ready
              </p>

              <p className="mt-2 text-3xl font-black text-green-100">
                {completionStats.ready}
              </p>

              <p className="mt-1 text-xs text-green-100/50">
                No required gaps
              </p>
            </button>
          </section>

          <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                Missing checks
              </p>

              <p className="mt-2 text-2xl font-black text-white">
                {workloadStats.missingChecks}
              </p>

              <p className="mt-1 text-xs text-neutral-500">
                Total editorial gaps
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setFilter("required_missing");
                setSort("priority");
              }}
              className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-left transition hover:border-red-400/40"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                Required gaps
              </p>

              <p className="mt-2 text-2xl font-black text-red-200">
                {workloadStats.requiredChecks}
              </p>

              <p className="mt-1 text-xs text-neutral-500">
                Blocking readiness
              </p>
            </button>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                Checks complete
              </p>

              <p className="mt-2 text-2xl font-black text-white">
                {workloadStats.completedChecks}
              </p>

              <p className="mt-1 text-xs text-neutral-500">
                Of {workloadStats.totalChecks}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setFilter("required_missing");
                setSort("priority");
              }}
              className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-left transition hover:border-yellow-400/40"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                Blocked entries
              </p>

              <p className="mt-2 text-2xl font-black text-yellow-200">
                {
                  completionStats.requiredMissing
                }
              </p>

              <p className="mt-1 text-xs text-neutral-500">
                Required fields missing
              </p>
            </button>
          </section>

          <section className="mt-5 rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
              <label className="flex-1">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                  Search queue
                </span>

                <input
                  value={query}
                  onChange={(event) =>
                    setQuery(event.target.value)
                  }
                  placeholder="Search words, missing fields, status, or recommended actions..."
                  className="mt-2 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-yellow-400"
                />
              </label>

              <label className="lg:w-64">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                  Queue filter
                </span>

                <select
                  value={filter}
                  onChange={(event) =>
                    setFilter(
                      event.target
                        .value as CompletionFilter,
                    )
                  }
                  className="mt-2 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
                >
                  {FILTER_OPTIONS.map(
                    (option) => (
                      <option
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label className="lg:w-64">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                  Queue order
                </span>

                <select
                  value={sort}
                  onChange={(event) =>
                    setSort(
                      event.target
                        .value as CompletionSort,
                    )
                  }
                  className="mt-2 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
                >
                  {SORT_OPTIONS.map(
                    (option) => (
                      <option
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <button
                type="button"
                onClick={clearFilters}
                className="rounded-2xl border border-neutral-700 bg-neutral-950 px-5 py-3 text-sm font-black text-neutral-300 transition hover:border-neutral-600 hover:text-white"
              >
                Clear
              </button>
            </div>
          </section>

          <section className="mt-5 rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
                Most common content gaps
              </p>

              <p className="mt-2 text-sm text-neutral-400">
                Required gaps are shown first because
                they block content readiness.
              </p>
            </div>

            {fieldGapStats.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-green-400/20 bg-green-400/10 p-4 text-sm font-bold text-green-100">
                No missing fields were detected.
              </div>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {fieldGapStats
                  .slice(0, 8)
                  .map((gap) => (
                    <button
                      key={gap.key}
                      type="button"
                      onClick={() =>
                        applyGapFilter(gap.key)
                      }
                      className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-left transition hover:border-yellow-400/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-white">
                            {gap.label}
                          </p>

                          {gap.required && (
                            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-red-300">
                              Required
                            </p>
                          )}
                        </div>

                        <span className="rounded-full bg-neutral-800 px-2.5 py-1 text-xs font-black text-yellow-300">
                          {gap.count}
                        </span>
                      </div>

                      <p className="mt-3 text-xs text-neutral-500">
                        {gap.count === 1
                          ? "1 entry needs attention"
                          : `${gap.count} entries need attention`}
                      </p>
                    </button>
                  ))}
              </div>
            )}
          </section>

          <section className="mt-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
                  Editorial queue
                </p>

                <h3 className="mt-2 text-xl font-black text-white">
                  {visibleAnalyses.length}{" "}
                  {visibleAnalyses.length === 1
                    ? "entry"
                    : "entries"}
                </h3>
              </div>

              <p className="text-xs text-neutral-500">
                Priority and completion are
                calculated locally.
              </p>
            </div>

            {visibleAnalyses.length === 0 ? (
              <div className="mt-4 rounded-3xl border border-dashed border-neutral-700 p-8 text-center">
                <p className="font-black text-white">
                  No entries match this queue
                </p>

                <p className="mt-2 text-sm text-neutral-500">
                  Clear the search or choose another
                  filter.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {visibleAnalyses.map(
                  (analysis, index) => (
                    <article
                      key={String(
                        analysis.entry.id,
                      )}
                      className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5"
                    >
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-neutral-400">
                              Queue #{index + 1}
                            </span>

                            <span
                              className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${priorityClasses(
                                analysis.priority,
                              )}`}
                            >
                              {priorityLabel(
                                analysis.priority,
                              )}
                            </span>

                            <span
                              className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${completionStatusClasses(
                                analysis.status,
                              )}`}
                            >
                              {completionStatusLabel(
                                analysis.status,
                              )}
                            </span>

                            {analysis.isQuickWin && (
                              <span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-200">
                                Quick win
                              </span>
                            )}
                          </div>

                          <h4 className="mt-3 truncate text-xl font-black text-white">
                            {String(
                              analysis.entry.word ||
                                "Untitled entry",
                            )}
                          </h4>

                          <p className="mt-1 text-sm text-neutral-500">
                            {String(
                              analysis.entry.status ||
                                "No status",
                            )}
                            {" · "}
                            {
                              analysis.completedChecks
                            }
                            /{analysis.totalChecks}{" "}
                            checks complete
                          </p>

                          <div className="mt-4 rounded-2xl border border-yellow-400/15 bg-yellow-400/5 p-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-yellow-400/70">
                              Recommended next action
                            </p>

                            <p className="mt-1 text-sm font-bold text-yellow-100">
                              {
                                analysis.recommendedAction
                              }
                            </p>
                          </div>

                          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-neutral-800">
                            <div
                              className="h-full rounded-full bg-yellow-400"
                              style={{
                                width: `${analysis.score}%`,
                              }}
                            />
                          </div>

                          {analysis.missingFields
                            .length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {analysis.missingFields
                                .slice(0, 6)
                                .map((field) => {
                                  const isRequired =
                                    analysis.requiredMissingFields.includes(
                                      field,
                                    );

                                  return (
                                    <span
                                      key={field}
                                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${
                                        isRequired
                                          ? "border-red-400/20 bg-red-400/10 text-red-200"
                                          : "border-neutral-800 bg-neutral-950 text-neutral-400"
                                      }`}
                                    >
                                      {field}
                                      {isRequired
                                        ? " · Required"
                                        : ""}
                                    </span>
                                  );
                                })}

                              {analysis.missingFields
                                .length > 6 && (
                                <span className="rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-xs font-bold text-neutral-500">
                                  +
                                  {analysis
                                    .missingFields
                                    .length - 6}{" "}
                                  more
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center gap-4 lg:flex-col lg:items-end">
                          <div className="text-right">
                            <p
                              className={`text-4xl font-black ${scoreClasses(
                                analysis.score,
                              )}`}
                            >
                              {analysis.score}%
                            </p>

                            <p className="mt-1 text-xs text-neutral-500">
                              {
                                analysis.missingFields
                                  .length
                              }{" "}
                              missing
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              openEntry(
                                analysis.entry,
                              )
                            }
                            disabled={!onOpenEntry}
                            className="rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-black text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Open Entry
                          </button>
                        </div>
                      </div>
                    </article>
                  ),
                )}
              </div>
            )}
          </section>
        </div>

        <footer className="shrink-0 border-t border-neutral-800 bg-neutral-950/95 p-4 text-xs text-neutral-500 backdrop-blur sm:px-6">
          Alpha 5.13B · Editorial Focus Queue · No
          automatic database changes
        </footer>
      </aside>
    </div>
  );
}

export default ContentCompletionDashboard;
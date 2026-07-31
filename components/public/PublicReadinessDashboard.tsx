"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type { Entry } from "@/types/entry";

type ReadinessState =
  | "blocked"
  | "needs_work"
  | "ready";

type IssueSeverity =
  | "blocker"
  | "high"
  | "medium"
  | "info";

type ReadinessFilter =
  | "all"
  | "blocked"
  | "needs_work"
  | "ready"
  | "slug_issues"
  | "workflow_issues"
  | "visibility_issues"
  | "content_issues"
  | "internal_fields";

type ReadinessSort =
  | "priority"
  | "lowest_score"
  | "highest_score"
  | "most_issues"
  | "a_z"
  | "z_a";

type PublicAuditIssue = {
  id: string;
  severity: IssueSeverity;
  category:
    | "slug"
    | "workflow"
    | "visibility"
    | "content"
    | "privacy"
    | "schema";
  title: string;
  description: string;
  recommendation: string;
};

type PublicMeaningPreview = {
  partOfSpeech: string;
  definition: string;
  plainEnglish: string;
  exampleSentence: string;
  culturalContext: string;
  tone: string;
  usageFrequency: string;
};

type PublicEntryPreview = {
  id: string;
  word: string;
  slug: string;
  pronunciation: string;
  alternateSpellings: string[];
  meanings: PublicMeaningPreview[];
};

type EntryPublicAnalysis = {
  entry: Entry;
  score: number;
  state: ReadinessState;
  issues: PublicAuditIssue[];
  publicPreview: PublicEntryPreview;
  publicUrl: string;
  blockerCount: number;
  highCount: number;
  mediumCount: number;
  internalFieldCount: number;
  visibilityState:
    | "public"
    | "private"
    | "unknown";
  recommendedAction: string;
};

type PublicReadinessDashboardProps = {
  isOpen: boolean;
  onClose: () => void;
  entries?: Entry[];
  onOpenEntry?: (entry: Entry) => void;
};

const FILTER_OPTIONS: Array<{
  value: ReadinessFilter;
  label: string;
}> = [
  {
    value: "all",
    label: "All entries",
  },
  {
    value: "blocked",
    label: "Blocked",
  },
  {
    value: "needs_work",
    label: "Needs work",
  },
  {
    value: "ready",
    label: "Public ready",
  },
  {
    value: "slug_issues",
    label: "Slug issues",
  },
  {
    value: "workflow_issues",
    label: "Workflow issues",
  },
  {
    value: "visibility_issues",
    label: "Visibility issues",
  },
  {
    value: "content_issues",
    label: "Content issues",
  },
  {
    value: "internal_fields",
    label: "Internal fields detected",
  },
];

const SORT_OPTIONS: Array<{
  value: ReadinessSort;
  label: string;
}> = [
  {
    value: "priority",
    label: "Highest priority first",
  },
  {
    value: "lowest_score",
    label: "Lowest score first",
  },
  {
    value: "highest_score",
    label: "Highest score first",
  },
  {
    value: "most_issues",
    label: "Most issues first",
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

const SEVERITY_WEIGHT: Record<
  IssueSeverity,
  number
> = {
  blocker: 30,
  high: 16,
  medium: 7,
  info: 0,
};

const INTERNAL_KEY_PATTERNS = [
  "editorialnote",
  "internalnote",
  "adminnote",
  "ainote",
  "aihistory",
  "aireview",
  "activitylog",
  "reviewhistory",
  "moderation",
  "privatecomment",
  "createdby",
  "updatedby",
  "deletedby",
];

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function displayText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (Array.isArray(value)) {
    return value
      .map(displayText)
      .filter(Boolean)
      .join(", ");
  }

  return "";
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

function readAliasText(
  source: unknown,
  aliases: string[],
) {
  return displayText(
    readAlias(source, aliases),
  );
}

function readStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => displayText(item))
      .filter(Boolean);
  }

  return String(value ?? "")
    .split(/[,;/\n]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getMeanings(entry: Entry) {
  return Array.isArray(entry.meanings)
    ? entry.meanings
    : [];
}

function isValidSlug(slug: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
    slug,
  );
}

function getVisibilityState(
  entry: Entry,
): "public" | "private" | "unknown" {
  const value = readAlias(entry, [
    "isPublic",
    "is_public",
    "public",
    "visibility",
    "publicVisibility",
    "public_visibility",
  ]);

  if (typeof value === "boolean") {
    return value ? "public" : "private";
  }

  const normalized = normalizeText(value);

  if (
    normalized === "public" ||
    normalized === "visible" ||
    normalized === "published"
  ) {
    return "public";
  }

  if (
    normalized === "private" ||
    normalized === "hidden" ||
    normalized === "internal"
  ) {
    return "private";
  }

  return "unknown";
}

function countInternalFields(entry: Entry) {
  if (!entry || typeof entry !== "object") {
    return 0;
  }

  return Object.entries(
    entry as Record<string, unknown>,
  ).filter(([key, value]) => {
    if (!hasValue(value)) {
      return false;
    }

    const normalizedKey = normalizeKey(key);

    return INTERNAL_KEY_PATTERNS.some(
      (pattern) =>
        normalizedKey.includes(pattern),
    );
  }).length;
}

function buildPublicMeaning(
  meaning: unknown,
): PublicMeaningPreview {
  return {
    partOfSpeech: readAliasText(meaning, [
      "partOfSpeech",
      "part_of_speech",
      "pos",
      "type",
      "grammar",
    ]),

    definition: readAliasText(meaning, [
      "definition",
      "meaning",
      "gloss",
    ]),

    plainEnglish: readAliasText(meaning, [
      "plainEnglish",
      "plain_english",
      "plainMeaning",
      "plain_meaning",
    ]),

    exampleSentence: readAliasText(
      meaning,
      [
        "exampleSentence",
        "example_sentence",
        "example",
        "usageExample",
        "usage_example",
      ],
    ),

    culturalContext: readAliasText(
      meaning,
      [
        "culturalContext",
        "cultural_context",
        "culture",
        "context",
      ],
    ),

    tone: readAliasText(meaning, [
      "tone",
      "tones",
    ]),

    usageFrequency: readAliasText(
      meaning,
      [
        "usageFrequency",
        "usage_frequency",
        "frequency",
      ],
    ),
  };
}

function buildPublicPreview(
  entry: Entry,
): PublicEntryPreview {
  return {
    id: String(entry.id),

    word:
      String(entry.word ?? "").trim(),

    slug:
      String(entry.slug ?? "").trim(),

    pronunciation:
      String(
        entry.pronunciation ?? "",
      ).trim(),

    alternateSpellings: readStringArray(
      entry.alternateSpellings,
    ),

    meanings: getMeanings(entry).map(
      buildPublicMeaning,
    ),
  };
}

function analyzeEntry(
  entry: Entry,
  slugCounts: Map<string, number>,
): EntryPublicAnalysis {
  const issues: PublicAuditIssue[] = [];

  const entryId = String(entry.id);

  const word =
    String(entry.word ?? "").trim();

  const slug =
    String(entry.slug ?? "").trim();

  const status =
    String(entry.status ?? "").trim();

  const normalizedStatus =
    normalizeText(status);

  const meanings = getMeanings(entry);

  const visibilityState =
    getVisibilityState(entry);

  const internalFieldCount =
    countInternalFields(entry);

  function addIssue(
    issue: PublicAuditIssue,
  ) {
    if (
      issues.some(
        (existing) =>
          existing.id === issue.id,
      )
    ) {
      return;
    }

    issues.push(issue);
  }

  if (!word) {
    addIssue({
      id: `missing-word-${entryId}`,
      severity: "blocker",
      category: "content",
      title: "Public word is missing",
      description:
        "The public app would have no entry title to display.",
      recommendation:
        "Add the slang word or phrase.",
    });
  }

  if (!slug) {
    addIssue({
      id: `missing-slug-${entryId}`,
      severity: "blocker",
      category: "slug",
      title: "Public slug is missing",
      description:
        "The entry cannot receive a stable public URL.",
      recommendation:
        "Add a permanent lowercase URL slug.",
    });
  } else {
    if (!isValidSlug(slug)) {
      addIssue({
        id: `invalid-slug-${entryId}`,
        severity: "blocker",
        category: "slug",
        title: "Public slug is invalid",
        description: `"${slug}" is not safely formatted for a public URL.`,
        recommendation:
          "Use lowercase letters, numbers, and single hyphens only.",
      });
    }

    if (
      (slugCounts.get(slug) ?? 0) > 1
    ) {
      addIssue({
        id: `duplicate-slug-${entryId}`,
        severity: "blocker",
        category: "slug",
        title: "Public slug is duplicated",
        description: `More than one entry currently uses "/${slug}".`,
        recommendation:
          "Assign a unique permanent slug to each entry.",
      });
    }
  }

  if (
    normalizedStatus !== "verified" &&
    normalizedStatus !== "published" &&
    normalizedStatus !== "approved"
  ) {
    addIssue({
      id: `workflow-status-${entryId}`,
      severity: "high",
      category: "workflow",
      title:
        "Entry is not in a public-ready workflow state",
      description: status
        ? `The current status is "${status}".`
        : "The entry has no workflow status.",
      recommendation:
        "Complete editorial review before exposing this entry publicly.",
    });
  }

  if (visibilityState === "unknown") {
    addIssue({
      id: `missing-visibility-${entryId}`,
      severity: "medium",
      category: "visibility",
      title:
        "Public visibility field is not configured",
      description:
        "Studio cannot determine whether this entry should be visible in the public app.",
      recommendation:
        "Add an explicit public/private visibility field during Alpha 5.15B.",
    });
  }

  if (visibilityState === "private") {
    addIssue({
      id: `private-entry-${entryId}`,
      severity: "high",
      category: "visibility",
      title: "Entry is marked private",
      description:
        "This record should not be returned by the public application.",
      recommendation:
        "Keep it private or explicitly approve it for public visibility.",
    });
  }

  if (meanings.length === 0) {
    addIssue({
      id: `missing-meanings-${entryId}`,
      severity: "blocker",
      category: "content",
      title: "No public meanings exist",
      description:
        "The public entry would not contain a definition.",
      recommendation:
        "Add at least one complete meaning.",
    });
  }

  meanings.forEach((meaning, index) => {
    const meaningNumber = index + 1;

    const preview =
      buildPublicMeaning(meaning);

    if (!preview.partOfSpeech) {
      addIssue({
        id: `missing-pos-${entryId}-${index}`,
        severity: "high",
        category: "content",
        title: `Meaning ${meaningNumber} has no part of speech`,
        description:
          "The public entry cannot show how this sense functions grammatically.",
        recommendation:
          "Assign a part of speech.",
      });
    }

    if (!preview.definition) {
      addIssue({
        id: `missing-definition-${entryId}-${index}`,
        severity: "blocker",
        category: "content",
        title: `Meaning ${meaningNumber} has no definition`,
        description:
          "The public record would display an empty meaning.",
        recommendation:
          "Write the complete definition.",
      });
    }

    if (!preview.exampleSentence) {
      addIssue({
        id: `missing-example-${entryId}-${index}`,
        severity: "high",
        category: "content",
        title: `Meaning ${meaningNumber} has no example`,
        description:
          "Public readers would not see the term used naturally.",
        recommendation:
          "Add an authentic example sentence.",
      });
    }

    if (!preview.plainEnglish) {
      addIssue({
        id: `missing-plain-${entryId}-${index}`,
        severity: "medium",
        category: "content",
        title: `Meaning ${meaningNumber} has no plain-English explanation`,
        description:
          "Readers unfamiliar with NYC slang may need a simpler equivalent.",
        recommendation:
          "Add a brief standard-English explanation.",
      });
    }

    if (!preview.culturalContext) {
      addIssue({
        id: `missing-context-${entryId}-${index}`,
        severity: "medium",
        category: "content",
        title: `Meaning ${meaningNumber} has no cultural context`,
        description:
          "The public app would not explain context, tone, or responsible usage.",
        recommendation:
          "Add concise cultural context.",
      });
    }
  });

  if (
    !String(
      entry.pronunciation ?? "",
    ).trim()
  ) {
    addIssue({
      id: `missing-pronunciation-${entryId}`,
      severity: "medium",
      category: "content",
      title: "Pronunciation is missing",
      description:
        "The public app cannot help readers say this entry correctly.",
      recommendation:
        "Add the pronunciation before launch.",
    });
  }

  if (internalFieldCount > 0) {
    addIssue({
      id: `internal-fields-${entryId}`,
      severity: "info",
      category: "privacy",
      title: `${internalFieldCount} internal field${
        internalFieldCount === 1
          ? ""
          : "s"
      } excluded`,
      description:
        "The safe public projection intentionally omits editorial, AI, review, and administrative fields.",
      recommendation:
        "Continue serving only the explicit public data shape.",
    });
  }

  const hasFeaturedField = hasValue(
    readAlias(entry, [
      "featured",
      "isFeatured",
      "is_featured",
    ]),
  );

  if (!hasFeaturedField) {
    addIssue({
      id: `featured-schema-${entryId}`,
      severity: "info",
      category: "schema",
      title:
        "Featured-entry support is not configured",
      description:
        "The future public app cannot yet identify featured entries.",
      recommendation:
        "Add featured-entry support during Alpha 5.15B.",
    });
  }

  const hasDisplayOrderField = hasValue(
    readAlias(entry, [
      "displayOrder",
      "display_order",
      "sortOrder",
      "sort_order",
      "position",
    ]),
  );

  if (!hasDisplayOrderField) {
    addIssue({
      id: `display-order-schema-${entryId}`,
      severity: "info",
      category: "schema",
      title:
        "Public display ordering is not configured",
      description:
        "The future public app will need a predictable ordering strategy.",
      recommendation:
        "Add an optional public display-order field during Alpha 5.15B.",
    });
  }

  const blockerCount = issues.filter(
    (issue) =>
      issue.severity === "blocker",
  ).length;

  const highCount = issues.filter(
    (issue) => issue.severity === "high",
  ).length;

  const mediumCount = issues.filter(
    (issue) =>
      issue.severity === "medium",
  ).length;

  const penalty = issues.reduce(
    (total, issue) =>
      total +
      SEVERITY_WEIGHT[issue.severity],
    0,
  );

  const score = Math.max(
    0,
    Math.min(100, 100 - penalty),
  );

  let state: ReadinessState =
    "needs_work";

  if (blockerCount > 0) {
    state = "blocked";
  } else if (
    highCount === 0 &&
    mediumCount === 0 &&
    visibilityState !== "private"
  ) {
    state = "ready";
  }

  const sortedIssues = [...issues].sort(
    (a, b) => {
      const order: Record<
        IssueSeverity,
        number
      > = {
        blocker: 4,
        high: 3,
        medium: 2,
        info: 1,
      };

      return (
        order[b.severity] -
        order[a.severity]
      );
    },
  );

  return {
    entry,
    score,
    state,
    issues: sortedIssues,
    publicPreview:
      buildPublicPreview(entry),
    publicUrl: slug
      ? `/dictionary/${slug}`
      : "/dictionary/missing-slug",
    blockerCount,
    highCount,
    mediumCount,
    internalFieldCount,
    visibilityState,
    recommendedAction:
      sortedIssues.find(
        (issue) =>
          issue.severity !== "info",
      )?.recommendation ??
      "This entry is ready for public preview.",
  };
}

function stateLabel(state: ReadinessState) {
  if (state === "blocked") {
    return "Blocked";
  }

  if (state === "needs_work") {
    return "Needs work";
  }

  return "Public ready";
}

function stateClasses(
  state: ReadinessState,
) {
  if (state === "blocked") {
    return "border-red-400/25 bg-red-400/10 text-red-100";
  }

  if (state === "needs_work") {
    return "border-yellow-400/25 bg-yellow-400/10 text-yellow-100";
  }

  return "border-green-400/25 bg-green-400/10 text-green-100";
}

function severityClasses(
  severity: IssueSeverity,
) {
  if (severity === "blocker") {
    return "border-red-400/25 bg-red-400/10 text-red-100";
  }

  if (severity === "high") {
    return "border-orange-400/25 bg-orange-400/10 text-orange-100";
  }

  if (severity === "medium") {
    return "border-yellow-400/25 bg-yellow-400/10 text-yellow-100";
  }

  return "border-blue-400/25 bg-blue-400/10 text-blue-100";
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
  analysis: EntryPublicAnalysis,
  filter: ReadinessFilter,
) {
  if (filter === "all") {
    return true;
  }

  if (
    filter === "blocked" ||
    filter === "needs_work" ||
    filter === "ready"
  ) {
    return analysis.state === filter;
  }

  if (filter === "slug_issues") {
    return analysis.issues.some(
      (issue) =>
        issue.category === "slug",
    );
  }

  if (filter === "workflow_issues") {
    return analysis.issues.some(
      (issue) =>
        issue.category === "workflow",
    );
  }

  if (filter === "visibility_issues") {
    return analysis.issues.some(
      (issue) =>
        issue.category === "visibility",
    );
  }

  if (filter === "content_issues") {
    return analysis.issues.some(
      (issue) =>
        issue.category === "content",
    );
  }

  if (filter === "internal_fields") {
    return analysis.internalFieldCount > 0;
  }

  return true;
}

function priorityScore(
  analysis: EntryPublicAnalysis,
) {
  return (
    analysis.blockerCount * 1000 +
    analysis.highCount * 100 +
    analysis.mediumCount * 10 +
    analysis.issues.length
  );
}

function sortAnalyses(
  analyses: EntryPublicAnalysis[],
  sort: ReadinessSort,
) {
  return [...analyses].sort((a, b) => {
    if (sort === "priority") {
      const difference =
        priorityScore(b) -
        priorityScore(a);

      if (difference !== 0) {
        return difference;
      }
    }

    if (sort === "lowest_score") {
      if (a.score !== b.score) {
        return a.score - b.score;
      }
    }

    if (sort === "highest_score") {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
    }

    if (sort === "most_issues") {
      if (
        b.issues.length !== a.issues.length
      ) {
        return (
          b.issues.length - a.issues.length
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

export function PublicReadinessDashboard({
  isOpen,
  onClose,
  entries = [],
  onOpenEntry,
}: PublicReadinessDashboardProps) {
  const [query, setQuery] = useState("");

  const [filter, setFilter] =
    useState<ReadinessFilter>("all");

  const [sort, setSort] =
    useState<ReadinessSort>("priority");

  const [
    previewAnalysis,
    setPreviewAnalysis,
  ] =
    useState<EntryPublicAnalysis | null>(
      null,
    );

  const slugCounts = useMemo(() => {
    const counts = new Map<
      string,
      number
    >();

    entries.forEach((entry) => {
      const slug =
        String(entry.slug ?? "").trim();

      if (!slug) {
        return;
      }

      counts.set(
        slug,
        (counts.get(slug) ?? 0) + 1,
      );
    });

    return counts;
  }, [entries]);

  const analyses = useMemo(
    () =>
      entries.map((entry) =>
        analyzeEntry(entry, slugCounts),
      ),
    [entries, slugCounts],
  );

  const stats = useMemo(() => {
    return {
      total: analyses.length,

      blocked: analyses.filter(
        (analysis) =>
          analysis.state === "blocked",
      ).length,

      needsWork: analyses.filter(
        (analysis) =>
          analysis.state === "needs_work",
      ).length,

      ready: analyses.filter(
        (analysis) =>
          analysis.state === "ready",
      ).length,

      visibilityUnknown: analyses.filter(
        (analysis) =>
          analysis.visibilityState ===
          "unknown",
      ).length,

      internalFields: analyses.reduce(
        (total, analysis) =>
          total +
          analysis.internalFieldCount,
        0,
      ),
    };
  }, [analyses]);

  const averageScore = useMemo(() => {
    if (analyses.length === 0) {
      return 0;
    }

    return Math.round(
      analyses.reduce(
        (total, analysis) =>
          total + analysis.score,
        0,
      ) / analyses.length,
    );
  }, [analyses]);

  const visibleAnalyses = useMemo(() => {
    const normalizedQuery =
      normalizeText(query);

    const filtered = analyses.filter(
      (analysis) => {
        if (
          !matchesFilter(analysis, filter)
        ) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        const searchable = normalizeText(
          [
            analysis.entry.word,
            analysis.entry.slug,
            analysis.entry.status,
            analysis.state,
            analysis.publicUrl,
            analysis.recommendedAction,
            ...analysis.issues.map(
              (issue) =>
                `${issue.title} ${issue.description}`,
            ),
          ].join(" "),
        );

        return searchable.includes(
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

  const nextPriority =
    visibleAnalyses.find(
      (analysis) =>
        analysis.state !== "ready",
    ) ??
    visibleAnalyses[0] ??
    null;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    function handleKeyDown(
      event: globalThis.KeyboardEvent,
    ) {
      if (event.key === "Escape") {
        if (previewAnalysis) {
          setPreviewAnalysis(null);
        } else {
          onClose();
        }
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
  }, [
    isOpen,
    onClose,
    previewAnalysis,
  ]);

  function openEntry(entry: Entry) {
    setPreviewAnalysis(null);
    onClose();
    onOpenEntry?.(entry);
  }

  function clearFilters() {
    setQuery("");
    setFilter("all");
    setSort("priority");
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close Public Readiness Dashboard"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="public-readiness-title"
        className="absolute bottom-0 right-0 flex max-h-[96vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-neutral-800 bg-neutral-950 shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-h-none md:max-w-6xl md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0"
      >
        <header className="shrink-0 border-b border-neutral-800 bg-neutral-950/95 p-5 backdrop-blur sm:p-6">
          <div className="flex items-start justify-between gap-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
<span className="rounded-full border border-purple-400/20 bg-purple-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-purple-200">
                  Public Readiness
                </span>

                <span className="rounded-full border border-green-400/20 bg-green-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-green-200">
                  Read only
                </span>
              </div>

              <h2
                id="public-readiness-title"
                className="mt-3 text-2xl font-black text-white sm:text-3xl"
              >
                Public Content Readiness
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
                Audit public URLs, workflow
                status, visibility, display fields,
                and the safe data shape that will
                eventually power the YERRR app.
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
                  Public readiness score
                </p>

                <div className="mt-3 flex items-end gap-3">
                  <p
                    className={`text-5xl font-black ${scoreClasses(
                      averageScore,
                    )}`}
                  >
                    {averageScore}%
                  </p>

                  <p className="pb-1 text-sm text-neutral-500">
                    across {entries.length} entries
                  </p>
                </div>

                <div className="mt-4 h-3 w-full max-w-xl overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className="h-full rounded-full bg-purple-400"
                    style={{
                      width: `${averageScore}%`,
                    }}
                  />
                </div>
              </div>

              <div className="w-full rounded-3xl border border-purple-400/20 bg-purple-400/10 p-5 xl:max-w-md">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-purple-200">
                  Next public-readiness task
                </p>

                {nextPriority ? (
                  <>
                    <div className="mt-3 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-xl font-black text-white">
                          {String(
                            nextPriority.entry.word ||
                              "Untitled entry",
                          )}
                        </p>

                        <p className="mt-1 text-sm leading-6 text-purple-100/70">
                          {
                            nextPriority.recommendedAction
                          }
                        </p>
                      </div>

                      <p
                        className={`shrink-0 text-2xl font-black ${scoreClasses(
                          nextPriority.score,
                        )}`}
                      >
                        {nextPriority.score}%
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        openEntry(
                          nextPriority.entry,
                        )
                      }
                      disabled={!onOpenEntry}
                      className="mt-4 w-full rounded-2xl bg-purple-400 px-5 py-3 text-sm font-black text-black transition hover:bg-purple-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Open Next Public Task
                    </button>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-purple-100/70">
                    No entries match this view.
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <button
              type="button"
              onClick={() => {
                setFilter("blocked");
                setSort("priority");
              }}
              className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-left transition hover:border-red-400/50"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-red-200/70">
                Blocked
              </p>

              <p className="mt-2 text-3xl font-black text-red-100">
                {stats.blocked}
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilter("needs_work");
                setSort("priority");
              }}
              className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-left transition hover:border-yellow-400/50"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-yellow-200/70">
                Needs work
              </p>

              <p className="mt-2 text-3xl font-black text-yellow-100">
                {stats.needsWork}
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
                Public ready
              </p>

              <p className="mt-2 text-3xl font-black text-green-100">
                {stats.ready}
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilter(
                  "visibility_issues",
                );
                setSort("priority");
              }}
              className="rounded-2xl border border-blue-400/20 bg-blue-400/10 p-4 text-left transition hover:border-blue-400/50"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-200/70">
                Visibility unknown
              </p>

              <p className="mt-2 text-3xl font-black text-blue-100">
                {stats.visibilityUnknown}
              </p>
            </button>
          </section>

          <section className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                Entries audited
              </p>

              <p className="mt-2 text-2xl font-black text-white">
                {stats.total}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setFilter("slug_issues");
                setSort("priority");
              }}
              className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-left transition hover:border-red-400/40"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                URL safety
              </p>

              <p className="mt-2 text-sm font-black text-white">
                Review missing, invalid, and
                duplicated slugs
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilter(
                  "internal_fields",
                );
                setSort("most_issues");
              }}
              className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-left transition hover:border-cyan-400/40"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                Internal fields excluded
              </p>

              <p className="mt-2 text-2xl font-black text-cyan-200">
                {stats.internalFields}
              </p>
            </button>
          </section>

          <section className="mt-5 rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
              <label className="flex-1">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                  Search readiness audit
                </span>

                <input
                  value={query}
                  onChange={(event) =>
                    setQuery(event.target.value)
                  }
                  placeholder="Search words, slugs, problems, or recommendations..."
                  className="mt-2 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-purple-400"
                />
              </label>

              <label className="lg:w-64">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                  Readiness filter
                </span>

                <select
                  value={filter}
                  onChange={(event) =>
                    setFilter(
                      event.target
                        .value as ReadinessFilter,
                    )
                  }
                  className="mt-2 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-purple-400"
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
                        .value as ReadinessSort,
                    )
                  }
                  className="mt-2 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-purple-400"
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

          <section className="mt-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
                  Public readiness queue
                </p>

                <h3 className="mt-2 text-xl font-black text-white">
                  {visibleAnalyses.length}{" "}
                  {visibleAnalyses.length === 1
                    ? "entry"
                    : "entries"}
                </h3>
              </div>

              <p className="text-xs text-neutral-500">
                No public API exists yet.
              </p>
            </div>

            <div className="mt-4 space-y-3">
              {visibleAnalyses.map(
                (analysis, index) => (
                  <article
                    key={String(
                      analysis.entry.id,
                    )}
                    className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5"
                  >
                    <div className="flex flex-col gap-5 lg:flex-row">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-neutral-400">
                            Queue #{index + 1}
                          </span>

                          <span
                            className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${stateClasses(
                              analysis.state,
                            )}`}
                          >
                            {stateLabel(
                              analysis.state,
                            )}
                          </span>

                          <span className="rounded-full border border-purple-400/20 bg-purple-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-purple-200">
                            {
                              analysis.visibilityState
                            }
                          </span>
                        </div>

                        <h4 className="mt-3 text-xl font-black text-white">
                          {String(
                            analysis.entry.word ||
                              "Untitled entry",
                          )}
                        </h4>

                        <p className="mt-1 font-mono text-sm text-purple-300">
                          {analysis.publicUrl}
                        </p>

                        <p className="mt-3 text-sm font-bold text-yellow-100">
                          {
                            analysis.recommendedAction
                          }
                        </p>

                        <div className="mt-4 space-y-2">
                          {analysis.issues
                            .filter(
                              (issue) =>
                                issue.severity !==
                                "info",
                            )
                            .slice(0, 4)
                            .map((issue) => (
                              <div
                                key={issue.id}
                                className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
                              >
                                <span
                                  className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${severityClasses(
                                    issue.severity,
                                  )}`}
                                >
                                  {issue.severity}
                                </span>

                                <p className="mt-3 font-black text-white">
                                  {issue.title}
                                </p>

                                <p className="mt-1 text-sm leading-6 text-neutral-500">
                                  {
                                    issue.description
                                  }
                                </p>
                              </div>
                            ))}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-3 lg:flex-col lg:items-end">
                        <p
                          className={`text-4xl font-black ${scoreClasses(
                            analysis.score,
                          )}`}
                        >
                          {analysis.score}%
                        </p>

                        <button
                          type="button"
                          onClick={() =>
                            setPreviewAnalysis(
                              analysis,
                            )
                          }
                          className="rounded-2xl border border-purple-400/30 bg-purple-400/10 px-5 py-3 text-sm font-black text-purple-100 transition hover:bg-purple-400/20"
                        >
                          Public Preview
                        </button>

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
          </section>
        </div>

        <footer className="shrink-0 border-t border-neutral-800 bg-neutral-950/95 p-4 text-xs text-neutral-500 backdrop-blur sm:px-6">
          Alpha 5.15A · Public Content Readiness
          Audit · No automatic database changes
        </footer>
      </aside>

      {previewAnalysis && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-neutral-800 bg-neutral-950 shadow-2xl">
            <header className="sticky top-0 z-10 flex items-start justify-between gap-5 border-b border-neutral-800 bg-neutral-950/95 p-5 backdrop-blur">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-purple-300">
                  Public Entry Preview
                </p>

                <h3 className="mt-2 text-2xl font-black text-white">
                  {
                    previewAnalysis.publicPreview
                      .word
                  }
                </h3>

                <p className="mt-1 font-mono text-sm text-purple-300">
                  {previewAnalysis.publicUrl}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setPreviewAnalysis(null)
                }
                className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 font-black text-neutral-300"
              >
                ✕
              </button>
            </header>

            <div className="p-5 sm:p-6">
              <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                <p className="text-3xl font-black text-white">
                  {
                    previewAnalysis.publicPreview
                      .word
                  }
                </p>

                {previewAnalysis.publicPreview
                  .pronunciation && (
                  <p className="mt-2 text-sm text-neutral-400">
                    Pronunciation:{" "}
                    {
                      previewAnalysis
                        .publicPreview
                        .pronunciation
                    }
                  </p>
                )}

                {previewAnalysis.publicPreview
                  .alternateSpellings.length >
                  0 && (
                  <p className="mt-2 text-sm text-neutral-500">
                    Also spelled:{" "}
                    {previewAnalysis.publicPreview.alternateSpellings.join(
                      ", ",
                    )}
                  </p>
                )}

                <div className="mt-6 space-y-4">
                  {previewAnalysis.publicPreview.meanings.map(
                    (meaning, index) => (
                      <article
                        key={index}
                        className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5"
                      >
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-purple-300">
                          Meaning {index + 1}
                          {meaning.partOfSpeech
                            ? ` · ${meaning.partOfSpeech}`
                            : ""}
                        </p>

                        <p className="mt-3 text-lg font-bold leading-8 text-white">
                          {meaning.definition ||
                            "Definition unavailable"}
                        </p>

                        {meaning.plainEnglish && (
                          <p className="mt-3 text-sm leading-6 text-neutral-400">
                            Plain English:{" "}
                            {meaning.plainEnglish}
                          </p>
                        )}

                        {meaning.exampleSentence && (
                          <blockquote className="mt-4 border-l-2 border-yellow-400 pl-4 text-sm italic leading-7 text-neutral-300">
                            “
                            {
                              meaning.exampleSentence
                            }
                            ”
                          </blockquote>
                        )}

                        {meaning.culturalContext && (
                          <p className="mt-4 text-sm leading-6 text-neutral-500">
                            {
                              meaning.culturalContext
                            }
                          </p>
                        )}
                      </article>
                    ),
                  )}
                </div>
              </section>

              <section className="mt-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
                  Safe public data shape
                </p>

                <pre className="mt-3 overflow-x-auto rounded-3xl border border-neutral-800 bg-black p-5 text-xs leading-6 text-green-300">
                  {JSON.stringify(
                    previewAnalysis.publicPreview,
                    null,
                    2,
                  )}
                </pre>
              </section>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() =>
                    setPreviewAnalysis(null)
                  }
                  className="rounded-2xl border border-neutral-700 px-5 py-3 text-sm font-black text-neutral-300"
                >
                  Return to Audit
                </button>

                <button
                  type="button"
                  onClick={() =>
                    openEntry(
                      previewAnalysis.entry,
                    )
                  }
                  disabled={!onOpenEntry}
                  className="rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-black text-black disabled:opacity-40"
                >
                  Open Entry Editor
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PublicReadinessDashboard;
"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type { Entry } from "@/types/entry";

type QualitySeverity =
  | "blocker"
  | "high"
  | "medium"
  | "low";

type QualityCategory =
  | "structure"
  | "content"
  | "duplicate"
  | "sources"
  | "verification"
  | "publishing";

type QualityState =
  | "blocked"
  | "needs_review"
  | "clean";

type QualityFilter =
  | "all"
  | "blocked"
  | "needs_review"
  | "clean"
  | "blockers"
  | "duplicates"
  | "weak_content"
  | "missing_sources"
  | "verification"
  | "publishing";

type QualitySort =
  | "severity"
  | "lowest_score"
  | "most_issues"
  | "fewest_issues"
  | "a_z"
  | "z_a";

type QualityIssue = {
  id: string;
  severity: QualitySeverity;
  category: QualityCategory;
  title: string;
  description: string;
  field?: string;
  recommendedAction: string;
};

type EntryQualityAnalysis = {
  entry: Entry;
  score: number;
  state: QualityState;
  issues: QualityIssue[];
  blockerCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  publishBlockerCount: number;
  recommendedAction: string;
};

type EditorialQualityDashboardProps = {
  isOpen: boolean;
  onClose: () => void;
  entries?: Entry[];
  onOpenEntry?: (entry: Entry) => void;
};

type DuplicateRecord = {
  entryId: string;
  word: string;
};

const FILTER_OPTIONS: Array<{
  value: QualityFilter;
  label: string;
}> = [
  {
    value: "all",
    label: "All entries",
  },
  {
    value: "blocked",
    label: "Blocked entries",
  },
  {
    value: "needs_review",
    label: "Needs review",
  },
  {
    value: "clean",
    label: "Clean entries",
  },
  {
    value: "blockers",
    label: "Critical blockers",
  },
  {
    value: "duplicates",
    label: "Duplicate warnings",
  },
  {
    value: "weak_content",
    label: "Weak content",
  },
  {
    value: "missing_sources",
    label: "Missing sources",
  },
  {
    value: "verification",
    label: "Verification gaps",
  },
  {
    value: "publishing",
    label: "Publish blockers",
  },
];

const SORT_OPTIONS: Array<{
  value: QualitySort;
  label: string;
}> = [
  {
    value: "severity",
    label: "Most serious first",
  },
  {
    value: "lowest_score",
    label: "Lowest quality score",
  },
  {
    value: "most_issues",
    label: "Most issues",
  },
  {
    value: "fewest_issues",
    label: "Fewest issues",
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
  QualitySeverity,
  number
> = {
  blocker: 28,
  high: 16,
  medium: 8,
  low: 3,
};

const SEVERITY_ORDER: Record<
  QualitySeverity,
  number
> = {
  blocker: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const PLACEHOLDER_PATTERNS = [
  /^todo$/i,
  /^tbd$/i,
  /^n\/?a$/i,
  /^none yet$/i,
  /^placeholder$/i,
  /^fill later$/i,
  /^coming soon$/i,
  /^test content$/i,
  /^lorem ipsum/i,
  /\badd later\b/i,
  /\bneeds content\b/i,
  /\bwrite this\b/i,
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

function getMeanings(entry: Entry) {
  return Array.isArray(entry.meanings)
    ? entry.meanings
    : [];
}

function getAlternateSpellings(entry: Entry) {
  const value = entry.alternateSpellings;

  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  return String(value ?? "")
    .split(/[,;/\n]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isPlaceholder(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return false;
  }

  return PLACEHOLDER_PATTERNS.some(
    (pattern) => pattern.test(trimmed),
  );
}

function isValidSlug(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
    value,
  );
}

function uniqueIssueId(
  prefix: string,
  entryId: string,
  suffix = "",
) {
  return `${prefix}-${entryId}-${suffix}`;
}

function addDuplicateIssue(
  map: Map<string, QualityIssue[]>,
  entryId: string,
  issue: QualityIssue,
) {
  const existing = map.get(entryId) ?? [];

  if (
    existing.some(
      (item) => item.id === issue.id,
    )
  ) {
    return;
  }

  map.set(entryId, [...existing, issue]);
}

function buildDuplicateIssues(
  entries: Entry[],
) {
  const issuesByEntryId = new Map<
    string,
    QualityIssue[]
  >();

  const termMap = new Map<
    string,
    Map<string, DuplicateRecord>
  >();

  entries.forEach((entry) => {
    const entryId = String(entry.id);

    const terms = [
      String(entry.word ?? ""),
      String(entry.slug ?? "").replace(
        /-/g,
        " ",
      ),
      ...getAlternateSpellings(entry),
    ];

    terms.forEach((term) => {
      const normalized = normalizeText(term);

      if (!normalized) {
        return;
      }

      const records =
        termMap.get(normalized) ??
        new Map<string, DuplicateRecord>();

      records.set(entryId, {
        entryId,
        word:
          String(entry.word ?? "").trim() ||
          "Untitled entry",
      });

      termMap.set(normalized, records);
    });
  });

  let termGroupIndex = 0;

  termMap.forEach((recordMap, term) => {
    const records = Array.from(
      recordMap.values(),
    );

    if (records.length < 2) {
      return;
    }

    termGroupIndex += 1;

    records.forEach((record) => {
      const relatedWords = records
        .filter(
          (item) =>
            item.entryId !== record.entryId,
        )
        .map((item) => item.word);

      addDuplicateIssue(
        issuesByEntryId,
        record.entryId,
        {
          id: uniqueIssueId(
            "duplicate-term",
            record.entryId,
            String(termGroupIndex),
          ),
          severity: "high",
          category: "duplicate",
          title: "Possible duplicate entry",
          description: `"${term}" also matches ${relatedWords.join(
            ", ",
          )}.`,
          field: "word",
          recommendedAction:
            "Compare the entries and decide whether they represent separate meanings, alternate spellings, or a duplicate record.",
        },
      );
    });
  });

  const definitionMap = new Map<
    string,
    Map<string, DuplicateRecord>
  >();

  entries.forEach((entry) => {
    const entryId = String(entry.id);

    getMeanings(entry).forEach((meaning) => {
      const definition = readAliasText(
        meaning,
        [
          "definition",
          "meaning",
          "gloss",
        ],
      );

      const normalized =
        normalizeText(definition);

      if (normalized.length < 24) {
        return;
      }

      const records =
        definitionMap.get(normalized) ??
        new Map<string, DuplicateRecord>();

      records.set(entryId, {
        entryId,
        word:
          String(entry.word ?? "").trim() ||
          "Untitled entry",
      });

      definitionMap.set(
        normalized,
        records,
      );
    });
  });

  let definitionGroupIndex = 0;

  definitionMap.forEach((recordMap) => {
    const records = Array.from(
      recordMap.values(),
    );

    if (records.length < 2) {
      return;
    }

    definitionGroupIndex += 1;

    records.forEach((record) => {
      const relatedWords = records
        .filter(
          (item) =>
            item.entryId !== record.entryId,
        )
        .map((item) => item.word);

      addDuplicateIssue(
        issuesByEntryId,
        record.entryId,
        {
          id: uniqueIssueId(
            "duplicate-definition",
            record.entryId,
            String(definitionGroupIndex),
          ),
          severity: "medium",
          category: "duplicate",
          title:
            "Definition duplicates another entry",
          description: `The same definition appears under ${relatedWords.join(
            ", ",
          )}.`,
          field: "definition",
          recommendedAction:
            "Check whether the entries truly share one meaning or whether each definition needs more specific wording.",
        },
      );
    });
  });

  return issuesByEntryId;
}

function analyzeEntry(
  entry: Entry,
  duplicateIssues: QualityIssue[],
): EntryQualityAnalysis {
  const entryId = String(entry.id);

  const issues: QualityIssue[] = [
    ...duplicateIssues,
  ];

  function addIssue(issue: QualityIssue) {
    if (
      issues.some(
        (item) => item.id === issue.id,
      )
    ) {
      return;
    }

    issues.push(issue);
  }

  const word =
    String(entry.word ?? "").trim();

  const slug =
    String(entry.slug ?? "").trim();

  const status =
    String(entry.status ?? "").trim();

  const normalizedStatus =
    normalizeText(status);

  const isPublishStatus =
    normalizedStatus === "verified" ||
    normalizedStatus === "published";

  if (!word) {
    addIssue({
      id: uniqueIssueId(
        "missing-word",
        entryId,
      ),
      severity: "blocker",
      category: "structure",
      title: "Entry word is missing",
      description:
        "The entry has no public-facing word or phrase.",
      field: "word",
      recommendedAction:
        "Add the slang word or phrase before continuing.",
    });
  } else if (isPlaceholder(word)) {
    addIssue({
      id: uniqueIssueId(
        "placeholder-word",
        entryId,
      ),
      severity: "blocker",
      category: "content",
      title:
        "Entry word contains placeholder text",
      description: `"${word}" appears to be temporary content.`,
      field: "word",
      recommendedAction:
        "Replace the placeholder with the real entry word.",
    });
  }

  if (!slug) {
    addIssue({
      id: uniqueIssueId(
        "missing-slug",
        entryId,
      ),
      severity: "blocker",
      category: "structure",
      title: "Slug is missing",
      description:
        "The entry does not have a stable URL-safe slug.",
      field: "slug",
      recommendedAction:
        "Generate a lowercase, hyphenated slug for the entry.",
    });
  } else if (!isValidSlug(slug)) {
    addIssue({
      id: uniqueIssueId(
        "invalid-slug",
        entryId,
      ),
      severity: "high",
      category: "structure",
      title: "Slug format is invalid",
      description: `"${slug}" contains characters or spacing that are not public-URL safe.`,
      field: "slug",
      recommendedAction:
        "Use lowercase letters, numbers, and single hyphens only.",
    });
  }

  if (isPlaceholder(slug)) {
    addIssue({
      id: uniqueIssueId(
        "placeholder-slug",
        entryId,
      ),
      severity: "high",
      category: "content",
      title: "Slug appears temporary",
      description:
        "The current slug looks like placeholder content.",
      field: "slug",
      recommendedAction:
        "Replace it with the permanent entry slug.",
    });
  }

  const meanings = getMeanings(entry);

  if (meanings.length === 0) {
    addIssue({
      id: uniqueIssueId(
        "missing-meanings",
        entryId,
      ),
      severity: "blocker",
      category: "structure",
      title: "No meanings exist",
      description:
        "The entry cannot be understood or published without at least one meaning.",
      field: "meanings",
      recommendedAction:
        "Add the first meaning, definition, part of speech, and example.",
    });
  }

  meanings.forEach((meaning, index) => {
    const meaningNumber = index + 1;

    const partOfSpeech = readAliasText(
      meaning,
      [
        "partOfSpeech",
        "part_of_speech",
        "pos",
        "type",
        "grammar",
      ],
    );

    const definition = readAliasText(
      meaning,
      [
        "definition",
        "meaning",
        "gloss",
      ],
    );

    const plainEnglish = readAliasText(
      meaning,
      [
        "plainEnglish",
        "plain_english",
        "plainMeaning",
        "plain_meaning",
      ],
    );

    const example = readAliasText(
      meaning,
      [
        "exampleSentence",
        "example_sentence",
        "example",
        "usageExample",
        "usage_example",
      ],
    );

    const culturalContext = readAliasText(
      meaning,
      [
        "culturalContext",
        "cultural_context",
        "culture",
        "context",
      ],
    );

    const sources = readAliasText(
      meaning,
      [
        "sources",
        "source",
        "citations",
        "citation",
        "references",
      ],
    );

    const verification = readAliasText(
      meaning,
      [
        "verificationStatus",
        "verification_status",
        "verification",
        "verified",
      ],
    );

    if (!partOfSpeech) {
      addIssue({
        id: uniqueIssueId(
          "missing-part-of-speech",
          entryId,
          String(index),
        ),
        severity: "high",
        category: "structure",
        title: `Meaning ${meaningNumber} has no part of speech`,
        description:
          "Readers and editors cannot tell how this meaning functions grammatically.",
        field: "partOfSpeech",
        recommendedAction:
          "Assign the most accurate part of speech.",
      });
    }

    if (!definition) {
      addIssue({
        id: uniqueIssueId(
          "missing-definition",
          entryId,
          String(index),
        ),
        severity: "blocker",
        category: "content",
        title: `Meaning ${meaningNumber} has no definition`,
        description:
          "A meaning exists but its central definition is empty.",
        field: "definition",
        recommendedAction:
          "Write a clear definition describing this specific sense.",
      });
    } else {
      if (isPlaceholder(definition)) {
        addIssue({
          id: uniqueIssueId(
            "placeholder-definition",
            entryId,
            String(index),
          ),
          severity: "blocker",
          category: "content",
          title: `Meaning ${meaningNumber} uses a placeholder definition`,
          description:
            "The definition appears to contain temporary editorial text.",
          field: "definition",
          recommendedAction:
            "Replace the placeholder with a complete definition.",
        });
      } else if (
        normalizeText(definition).length < 12
      ) {
        addIssue({
          id: uniqueIssueId(
            "short-definition",
            entryId,
            String(index),
          ),
          severity: "high",
          category: "content",
          title: `Meaning ${meaningNumber} has a very short definition`,
          description: `"${definition}" may not give readers enough information.`,
          field: "definition",
          recommendedAction:
            "Expand the definition while keeping it direct and specific.",
        });
      }
    }

    if (!example) {
      addIssue({
        id: uniqueIssueId(
          "missing-example",
          entryId,
          String(index),
        ),
        severity: "high",
        category: "content",
        title: `Meaning ${meaningNumber} has no example`,
        description:
          "The entry does not demonstrate how this meaning is used in natural speech.",
        field: "example",
        recommendedAction:
          "Add an authentic sentence showing this exact meaning.",
      });
    } else {
      if (isPlaceholder(example)) {
        addIssue({
          id: uniqueIssueId(
            "placeholder-example",
            entryId,
            String(index),
          ),
          severity: "high",
          category: "content",
          title: `Meaning ${meaningNumber} uses a placeholder example`,
          description:
            "The example sentence appears unfinished.",
          field: "example",
          recommendedAction:
            "Replace it with a believable NYC usage example.",
        });
      } else if (
        normalizeText(example).length < 10
      ) {
        addIssue({
          id: uniqueIssueId(
            "short-example",
            entryId,
            String(index),
          ),
          severity: "medium",
          category: "content",
          title: `Meaning ${meaningNumber} has a weak example`,
          description: `"${example}" may be too short to communicate real usage.`,
          field: "example",
          recommendedAction:
            "Expand the example into a complete natural sentence.",
        });
      }
    }

    if (!plainEnglish) {
      addIssue({
        id: uniqueIssueId(
          "missing-plain-english",
          entryId,
          String(index),
        ),
        severity: "low",
        category: "content",
        title: `Meaning ${meaningNumber} has no plain-English explanation`,
        description:
          "A simplified explanation would help readers unfamiliar with NYC slang.",
        field: "plainEnglish",
        recommendedAction:
          "Add a brief standard-English equivalent.",
      });
    } else if (isPlaceholder(plainEnglish)) {
      addIssue({
        id: uniqueIssueId(
          "placeholder-plain-english",
          entryId,
          String(index),
        ),
        severity: "medium",
        category: "content",
        title: `Meaning ${meaningNumber} has placeholder plain English`,
        description:
          "The simplified explanation is not finished.",
        field: "plainEnglish",
        recommendedAction:
          "Replace it with a short clear explanation.",
      });
    }

    if (!culturalContext) {
      addIssue({
        id: uniqueIssueId(
          "missing-cultural-context",
          entryId,
          String(index),
        ),
        severity: "low",
        category: "content",
        title: `Meaning ${meaningNumber} has no cultural context`,
        description:
          "The entry does not yet explain its cultural setting, tone, community, or history.",
        field: "culturalContext",
        recommendedAction:
          "Add concise cultural context that helps prevent misuse or misunderstanding.",
      });
    } else if (
      !isPlaceholder(culturalContext) &&
      normalizeText(culturalContext).length <
        20
    ) {
      addIssue({
        id: uniqueIssueId(
          "short-cultural-context",
          entryId,
          String(index),
        ),
        severity: "low",
        category: "content",
        title: `Meaning ${meaningNumber} has limited cultural context`,
        description:
          "The cultural note may be too brief to explain the term responsibly.",
        field: "culturalContext",
        recommendedAction:
          "Add relevant context about usage, audience, tone, or origin.",
      });
    }

    if (!sources) {
      addIssue({
        id: uniqueIssueId(
          "missing-sources",
          entryId,
          String(index),
        ),
        severity: isPublishStatus
          ? "high"
          : "medium",
        category: "sources",
        title: `Meaning ${meaningNumber} has no sources`,
        description:
          "There is no supporting reference, interview, media example, or editorial source.",
        field: "sources",
        recommendedAction:
          "Add at least one source or evidence note before final verification.",
      });
    } else if (isPlaceholder(sources)) {
      addIssue({
        id: uniqueIssueId(
          "placeholder-sources",
          entryId,
          String(index),
        ),
        severity: "medium",
        category: "sources",
        title: `Meaning ${meaningNumber} has placeholder sources`,
        description:
          "The source field does not yet contain usable evidence.",
        field: "sources",
        recommendedAction:
          "Replace the placeholder with a real source or verification note.",
      });
    }

    const normalizedVerification =
      normalizeText(verification);

    if (!verification) {
      addIssue({
        id: uniqueIssueId(
          "missing-verification",
          entryId,
          String(index),
        ),
        severity: isPublishStatus
          ? "high"
          : "low",
        category: "verification",
        title: `Meaning ${meaningNumber} has no verification status`,
        description:
          "The meaning has not been clearly marked as verified, under review, or needing evidence.",
        field: "verificationStatus",
        recommendedAction:
          "Review the evidence and assign the appropriate verification status.",
      });
    } else if (
      isPublishStatus &&
      normalizedVerification !== "verified"
    ) {
      addIssue({
        id: uniqueIssueId(
          "unverified-published-meaning",
          entryId,
          String(index),
        ),
        severity: "high",
        category: "verification",
        title: `Meaning ${meaningNumber} is not verified`,
        description: `The entry is marked ${status}, but this meaning is marked "${verification}".`,
        field: "verificationStatus",
        recommendedAction:
          "Verify the meaning or move the entry back into editorial review.",
      });
    }
  });

  const substantiveIssues = issues.filter(
    (issue) =>
      issue.severity === "blocker" ||
      issue.severity === "high",
  );

  if (
    isPublishStatus &&
    substantiveIssues.length > 0
  ) {
    addIssue({
      id: uniqueIssueId(
        "publish-status-conflict",
        entryId,
      ),
      severity: "high",
      category: "publishing",
      title:
        "Workflow status conflicts with content quality",
      description: `This entry is marked ${status}, but ${substantiveIssues.length} major quality issue${
        substantiveIssues.length === 1
          ? ""
          : "s"
      } remain.`,
      field: "status",
      recommendedAction:
        "Resolve the major issues or move the entry back to Draft/Needs Review.",
    });
  }

  const sortedIssues = [...issues].sort(
    (a, b) => {
      const severityDifference =
        SEVERITY_ORDER[b.severity] -
        SEVERITY_ORDER[a.severity];

      if (severityDifference !== 0) {
        return severityDifference;
      }

      return a.title.localeCompare(b.title);
    },
  );

  const penalty = sortedIssues.reduce(
    (total, issue) =>
      total + SEVERITY_WEIGHT[issue.severity],
    0,
  );

  const score = Math.max(
    0,
    Math.min(100, 100 - penalty),
  );

  const blockerCount =
    sortedIssues.filter(
      (issue) =>
        issue.severity === "blocker",
    ).length;

  const highCount =
    sortedIssues.filter(
      (issue) => issue.severity === "high",
    ).length;

  const mediumCount =
    sortedIssues.filter(
      (issue) =>
        issue.severity === "medium",
    ).length;

  const lowCount =
    sortedIssues.filter(
      (issue) => issue.severity === "low",
    ).length;

  const publishBlockerCount =
    sortedIssues.filter(
      (issue) =>
        issue.category === "publishing" ||
        issue.severity === "blocker",
    ).length;

  let state: QualityState = "clean";

  if (
    blockerCount > 0 ||
    publishBlockerCount > 0
  ) {
    state = "blocked";
  } else if (
    highCount > 0 ||
    mediumCount > 0
  ) {
    state = "needs_review";
  }

  return {
    entry,
    score,
    state,
    issues: sortedIssues,
    blockerCount,
    highCount,
    mediumCount,
    lowCount,
    publishBlockerCount,
    recommendedAction:
      sortedIssues[0]?.recommendedAction ??
      "No major quality problems were detected.",
  };
}

function stateLabel(state: QualityState) {
  if (state === "blocked") {
    return "Blocked";
  }

  if (state === "needs_review") {
    return "Needs review";
  }

  return "Clean";
}

function stateClasses(state: QualityState) {
  if (state === "blocked") {
    return "border-red-400/30 bg-red-400/15 text-red-100";
  }

  if (state === "needs_review") {
    return "border-yellow-400/30 bg-yellow-400/10 text-yellow-100";
  }

  return "border-green-400/30 bg-green-400/10 text-green-100";
}

function severityClasses(
  severity: QualitySeverity,
) {
  if (severity === "blocker") {
    return "border-red-400/30 bg-red-400/15 text-red-100";
  }

  if (severity === "high") {
    return "border-orange-400/30 bg-orange-400/10 text-orange-100";
  }

  if (severity === "medium") {
    return "border-yellow-400/30 bg-yellow-400/10 text-yellow-100";
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

function categoryLabel(
  category: QualityCategory,
) {
  if (category === "structure") {
    return "Structure";
  }

  if (category === "content") {
    return "Content";
  }

  if (category === "duplicate") {
    return "Duplicate";
  }

  if (category === "sources") {
    return "Sources";
  }

  if (category === "verification") {
    return "Verification";
  }

  return "Publishing";
}

function matchesFilter(
  analysis: EntryQualityAnalysis,
  filter: QualityFilter,
) {
  if (filter === "all") {
    return true;
  }

  if (
    filter === "blocked" ||
    filter === "needs_review" ||
    filter === "clean"
  ) {
    return analysis.state === filter;
  }

  if (filter === "blockers") {
    return analysis.blockerCount > 0;
  }

  if (filter === "duplicates") {
    return analysis.issues.some(
      (issue) =>
        issue.category === "duplicate",
    );
  }

  if (filter === "weak_content") {
    return analysis.issues.some(
      (issue) =>
        issue.category === "content",
    );
  }

  if (filter === "missing_sources") {
    return analysis.issues.some(
      (issue) =>
        issue.category === "sources",
    );
  }

  if (filter === "verification") {
    return analysis.issues.some(
      (issue) =>
        issue.category === "verification",
    );
  }

  if (filter === "publishing") {
    return analysis.issues.some(
      (issue) =>
        issue.category === "publishing",
    );
  }

  return true;
}

function analysisSeverityScore(
  analysis: EntryQualityAnalysis,
) {
  return (
    analysis.blockerCount * 1000 +
    analysis.highCount * 100 +
    analysis.mediumCount * 10 +
    analysis.lowCount
  );
}

function sortAnalyses(
  analyses: EntryQualityAnalysis[],
  sort: QualitySort,
) {
  return [...analyses].sort((a, b) => {
    if (sort === "severity") {
      const difference =
        analysisSeverityScore(b) -
        analysisSeverityScore(a);

      if (difference !== 0) {
        return difference;
      }
    }

    if (sort === "lowest_score") {
      if (a.score !== b.score) {
        return a.score - b.score;
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

    if (sort === "fewest_issues") {
      if (
        a.issues.length !== b.issues.length
      ) {
        return (
          a.issues.length - b.issues.length
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

export function EditorialQualityDashboard({
  isOpen,
  onClose,
  entries = [],
  onOpenEntry,
}: EditorialQualityDashboardProps) {
  const [query, setQuery] = useState("");

  const [filter, setFilter] =
    useState<QualityFilter>("all");

  const [sort, setSort] =
    useState<QualitySort>("severity");

  const duplicateIssuesByEntryId =
    useMemo(
      () => buildDuplicateIssues(entries),
      [entries],
    );

  const analyses = useMemo(
    () =>
      entries.map((entry) =>
        analyzeEntry(
          entry,
          duplicateIssuesByEntryId.get(
            String(entry.id),
          ) ?? [],
        ),
      ),
    [entries, duplicateIssuesByEntryId],
  );

  const stats = useMemo(() => {
    return {
      total: analyses.length,

      blocked: analyses.filter(
        (analysis) =>
          analysis.state === "blocked",
      ).length,

      needsReview: analyses.filter(
        (analysis) =>
          analysis.state ===
          "needs_review",
      ).length,

      clean: analyses.filter(
        (analysis) =>
          analysis.state === "clean",
      ).length,

      totalIssues: analyses.reduce(
        (total, analysis) =>
          total + analysis.issues.length,
        0,
      ),

      blockers: analyses.reduce(
        (total, analysis) =>
          total + analysis.blockerCount,
        0,
      ),

      duplicates: analyses.filter(
        (analysis) =>
          analysis.issues.some(
            (issue) =>
              issue.category ===
              "duplicate",
          ),
      ).length,

      publishBlocked: analyses.filter(
        (analysis) =>
          analysis.publishBlockerCount > 0,
      ).length,
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

  const issueCategoryStats =
    useMemo(() => {
      const counts = new Map<
        QualityCategory,
        number
      >();

      analyses.forEach((analysis) => {
        analysis.issues.forEach((issue) => {
          counts.set(
            issue.category,
            (counts.get(issue.category) ??
              0) + 1,
          );
        });
      });

      return Array.from(counts.entries())
        .map(([category, count]) => ({
          category,
          label:
            categoryLabel(category),
          count,
        }))
        .sort(
          (a, b) => b.count - a.count,
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

        const searchableText =
          normalizeText(
            [
              analysis.entry.word,
              analysis.entry.slug,
              analysis.entry.status,
              analysis.state,
              analysis.recommendedAction,
              ...analysis.issues.map(
                (issue) =>
                  `${issue.title} ${issue.description} ${issue.field ?? ""}`,
              ),
            ].join(" "),
          );

        return searchableText.includes(
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

  const nextPriorityAnalysis =
    useMemo(() => {
      return (
        visibleAnalyses.find(
          (analysis) =>
            analysis.state !== "clean",
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

    document.body.style.overflow =
      "hidden";

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

  function clearFilters() {
    setQuery("");
    setFilter("all");
    setSort("severity");
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close Editorial Quality Control"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="editorial-quality-title"
        className="absolute bottom-0 right-0 flex max-h-[96vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-neutral-800 bg-neutral-950 shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-h-none md:max-w-6xl md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0"
      >
        <header className="shrink-0 border-b border-neutral-800 bg-neutral-950/95 p-5 backdrop-blur sm:p-6">
          <div className="flex items-start justify-between gap-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
<span className="rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-red-200">
                  Quality Control
                </span>

                <span className="rounded-full border border-green-400/20 bg-green-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-green-200">
                  Read only
                </span>
              </div>

              <h2
                id="editorial-quality-title"
                className="mt-3 text-2xl font-black text-white sm:text-3xl"
              >
                Editorial Quality Control
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
                Detect structural errors,
                placeholder content, duplicate
                wording, weak definitions, source
                gaps, and publishing conflicts.
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
                  Average quality score
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
                    className="h-full rounded-full bg-yellow-400 transition-all"
                    style={{
                      width: `${averageScore}%`,
                    }}
                  />
                </div>
              </div>

              <div className="w-full rounded-3xl border border-red-400/20 bg-red-400/10 p-5 xl:max-w-md">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-red-200">
                  Next quality priority
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

                        <p className="mt-1 text-sm leading-6 text-red-100/70">
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
                      onClick={() =>
                        openEntry(
                          nextPriorityAnalysis.entry,
                        )
                      }
                      disabled={!onOpenEntry}
                      className="mt-4 w-full rounded-2xl bg-red-400 px-5 py-3 text-sm font-black text-black transition hover:bg-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Open Next Quality Issue
                    </button>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-red-100/70">
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
                setSort("severity");
              }}
              className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-left transition hover:border-red-400/50"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-red-200/70">
                Blocked
              </p>

              <p className="mt-2 text-3xl font-black text-red-100">
                {stats.blocked}
              </p>

              <p className="mt-1 text-xs text-red-100/50">
                Cannot publish safely
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilter("needs_review");
                setSort("severity");
              }}
              className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-left transition hover:border-yellow-400/50"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-yellow-200/70">
                Needs review
              </p>

              <p className="mt-2 text-3xl font-black text-yellow-100">
                {stats.needsReview}
              </p>

              <p className="mt-1 text-xs text-yellow-100/50">
                Quality issues remain
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilter("clean");
                setSort("a_z");
              }}
              className="rounded-2xl border border-green-400/20 bg-green-400/10 p-4 text-left transition hover:border-green-400/50"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-green-200/70">
                Clean
              </p>

              <p className="mt-2 text-3xl font-black text-green-100">
                {stats.clean}
              </p>

              <p className="mt-1 text-xs text-green-100/50">
                No major issues
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilter("publishing");
                setSort("severity");
              }}
              className="rounded-2xl border border-purple-400/20 bg-purple-400/10 p-4 text-left transition hover:border-purple-400/50"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-purple-200/70">
                Publish blocked
              </p>

              <p className="mt-2 text-3xl font-black text-purple-100">
                {stats.publishBlocked}
              </p>

              <p className="mt-1 text-xs text-purple-100/50">
                Status conflicts
              </p>
            </button>
          </section>

          <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                Total issues
              </p>

              <p className="mt-2 text-2xl font-black text-white">
                {stats.totalIssues}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setFilter("blockers");
                setSort("severity");
              }}
              className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-left transition hover:border-red-400/40"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                Critical blockers
              </p>

              <p className="mt-2 text-2xl font-black text-red-200">
                {stats.blockers}
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilter("duplicates");
                setSort("severity");
              }}
              className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-left transition hover:border-cyan-400/40"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                Duplicate entries
              </p>

              <p className="mt-2 text-2xl font-black text-cyan-200">
                {stats.duplicates}
              </p>
            </button>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                Entries checked
              </p>

              <p className="mt-2 text-2xl font-black text-white">
                {stats.total}
              </p>
            </div>
          </section>

          <section className="mt-5 rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
              <label className="flex-1">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                  Search quality issues
                </span>

                <input
                  value={query}
                  onChange={(event) =>
                    setQuery(event.target.value)
                  }
                  placeholder="Search words, fields, issues, or recommended actions..."
                  className="mt-2 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-yellow-400"
                />
              </label>

              <label className="lg:w-64">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                  Quality filter
                </span>

                <select
                  value={filter}
                  onChange={(event) =>
                    setFilter(
                      event.target
                        .value as QualityFilter,
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
                        .value as QualitySort,
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
            <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
              Issue categories
            </p>

            {issueCategoryStats.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-green-400/20 bg-green-400/10 p-4 text-sm font-bold text-green-100">
                No quality issues were detected.
              </div>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {issueCategoryStats.map(
                  (item) => (
                    <button
                      key={item.category}
                      type="button"
                      onClick={() => {
                        if (
                          item.category ===
                          "duplicate"
                        ) {
                          setFilter("duplicates");
                        } else if (
                          item.category ===
                          "sources"
                        ) {
                          setFilter(
                            "missing_sources",
                          );
                        } else if (
                          item.category ===
                          "verification"
                        ) {
                          setFilter(
                            "verification",
                          );
                        } else if (
                          item.category ===
                          "publishing"
                        ) {
                          setFilter(
                            "publishing",
                          );
                        } else {
                          setFilter(
                            "weak_content",
                          );
                        }

                        setSort("severity");
                      }}
                      className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-left transition hover:border-yellow-400/40"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-black text-white">
                          {item.label}
                        </p>

                        <span className="rounded-full bg-neutral-800 px-2.5 py-1 text-xs font-black text-yellow-300">
                          {item.count}
                        </span>
                      </div>
                    </button>
                  ),
                )}
              </div>
            )}
          </section>

          <section className="mt-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
                  Quality queue
                </p>

                <h3 className="mt-2 text-xl font-black text-white">
                  {visibleAnalyses.length}{" "}
                  {visibleAnalyses.length === 1
                    ? "entry"
                    : "entries"}
                </h3>
              </div>

              <p className="text-xs text-neutral-500">
                Analysis is calculated locally.
              </p>
            </div>

            {visibleAnalyses.length === 0 ? (
              <div className="mt-4 rounded-3xl border border-dashed border-neutral-700 p-8 text-center">
                <p className="font-black text-white">
                  No entries match this quality
                  view
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

                            {analysis.blockerCount >
                              0 && (
                              <span className="rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-red-200">
                                {
                                  analysis.blockerCount
                                }{" "}
                                blocker
                                {analysis.blockerCount ===
                                1
                                  ? ""
                                  : "s"}
                              </span>
                            )}

                            {analysis.highCount >
                              0 && (
                              <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-orange-200">
                                {
                                  analysis.highCount
                                }{" "}
                                high
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
                            {analysis.issues.length}{" "}
                            {analysis.issues.length ===
                            1
                              ? "issue"
                              : "issues"}
                          </p>

                          <div className="mt-4 rounded-2xl border border-yellow-400/15 bg-yellow-400/5 p-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-yellow-400/70">
                              Recommended next action
                            </p>

                            <p className="mt-1 text-sm font-bold leading-6 text-yellow-100">
                              {
                                analysis.recommendedAction
                              }
                            </p>
                          </div>

                          <div className="mt-4 space-y-3">
                            {analysis.issues
                              .slice(0, 4)
                              .map((issue) => (
                                <div
                                  key={issue.id}
                                  className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span
                                      className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${severityClasses(
                                        issue.severity,
                                      )}`}
                                    >
                                      {
                                        issue.severity
                                      }
                                    </span>

                                    <span className="rounded-full border border-neutral-700 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-neutral-400">
                                      {categoryLabel(
                                        issue.category,
                                      )}
                                    </span>

                                    {issue.field && (
                                      <span className="text-xs font-bold text-neutral-600">
                                        {issue.field}
                                      </span>
                                    )}
                                  </div>

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

                            {analysis.issues.length >
                              4 && (
                              <div className="rounded-2xl border border-dashed border-neutral-700 p-3 text-center text-xs font-bold text-neutral-500">
                                +
                                {analysis.issues.length -
                                  4}{" "}
                                additional issues
                              </div>
                            )}
                          </div>
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
                              Quality score
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
          Alpha 5.14A · Editorial Quality Control ·
          No automatic database changes
        </footer>
      </aside>
    </div>
  );
}

export default EditorialQualityDashboard;
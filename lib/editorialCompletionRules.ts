import type {
  EditorialStatus,
  Entry,
  EntryStatus,
} from "@/types/entry";

/**
 * The single source of truth for editorial completeness throughout YERRR Studio.
 * Update this file first whenever the editorial contract changes.
 */
export const EDITORIAL_RULESET_VERSION = "2026.07.26-A";

export type RequiredEditorialFieldKey =
  | "word"
  | "type"
  | "slug"
  | "pronunciation"
  | "partOfSpeech"
  | "meaningTitle"
  | "definition"
  | "example"
  | "category"
  | "tone"
  | "concepts"
  | "usageFrequency";

export type EditorialFieldScope = "entry" | "meaning";

export type EditorialFieldDefinition = {
  key: RequiredEditorialFieldKey;
  label: string;
  scope: EditorialFieldScope;
  property: string;
};

export type EditorialCompletionGap = {
  key: string;
  fieldKey: RequiredEditorialFieldKey;
  label: string;
  scope: EditorialFieldScope;
  meaningIndex: number | null;
};

export type EditorialCompletionReport = {
  gaps: EditorialCompletionGap[];
  gapCount: number;
  completedChecks: number;
  totalChecks: number;
  score: number;
  missingFieldKeys: RequiredEditorialFieldKey[];
  missingLabels: string[];
  isComplete: boolean;
};

export type EditorialEntryLike = {
  word?: unknown;
  type?: unknown;
  slug?: unknown;
  pronunciation?: unknown;
  partOfSpeech?: unknown;
  status?: unknown;
  meanings?: EditorialMeaningLike[] | null;
};

export type EditorialMeaningLike = {
  title?: unknown;
  definition?: unknown;
  example?: unknown;
  category?: unknown;
  tone?: unknown;
  conceptsText?: unknown;
  usageFrequency?: unknown;
  editorialStatus?: unknown;
};

export const REQUIRED_ENTRY_FIELDS: readonly EditorialFieldDefinition[] = [
  { key: "word", label: "Word / Phrase", scope: "entry", property: "word" },
  { key: "type", label: "Type", scope: "entry", property: "type" },
  { key: "slug", label: "Slug", scope: "entry", property: "slug" },
  {
    key: "pronunciation",
    label: "Pronunciation",
    scope: "entry",
    property: "pronunciation",
  },
  {
    key: "partOfSpeech",
    label: "Part of Speech",
    scope: "entry",
    property: "partOfSpeech",
  },
] as const;

export const REQUIRED_MEANING_FIELDS: readonly EditorialFieldDefinition[] = [
  {
    key: "meaningTitle",
    label: "Meaning Title",
    scope: "meaning",
    property: "title",
  },
  {
    key: "definition",
    label: "Definition",
    scope: "meaning",
    property: "definition",
  },
  {
    key: "example",
    label: "Example Sentence",
    scope: "meaning",
    property: "example",
  },
  {
    key: "category",
    label: "Category",
    scope: "meaning",
    property: "category",
  },
  { key: "tone", label: "Tone", scope: "meaning", property: "tone" },
  {
    key: "concepts",
    label: "Concepts",
    scope: "meaning",
    property: "conceptsText",
  },
  {
    key: "usageFrequency",
    label: "Usage Frequency",
    scope: "meaning",
    property: "usageFrequency",
  },
] as const;

export const REQUIRED_EDITORIAL_FIELDS: readonly EditorialFieldDefinition[] = [
  ...REQUIRED_ENTRY_FIELDS,
  ...REQUIRED_MEANING_FIELDS,
] as const;

export const OPTIONAL_EDITORIAL_FIELDS = [
  "Alternate Spellings",
  "Cultural Context",
  "Source",
  "Editorial Notes",
  "Audio",
  "Illustration",
] as const;

export const RETIRED_EDITORIAL_FIELDS = ["Plain English Translation"] as const;

export function normalizeEditorialText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}

export function isEditorialValueBlank(value: unknown) {
  return normalizeEditorialText(value).length === 0;
}

function readProperty(source: unknown, property: string) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return undefined;
  }

  return (source as Record<string, unknown>)[property];
}

export function getRequiredEditorialGaps(
  entry: EditorialEntryLike,
): EditorialCompletionGap[] {
  const gaps: EditorialCompletionGap[] = [];

  for (const field of REQUIRED_ENTRY_FIELDS) {
    if (isEditorialValueBlank(readProperty(entry, field.property))) {
      gaps.push({
        key: field.property,
        fieldKey: field.key,
        label: field.label,
        scope: "entry",
        meaningIndex: null,
      });
    }
  }

  const meanings = Array.isArray(entry.meanings) ? entry.meanings : [];
  const meaningCount = Math.max(meanings.length, 1);

  for (let meaningIndex = 0; meaningIndex < meaningCount; meaningIndex += 1) {
    const meaning = meanings[meaningIndex] ?? {};
    const prefix = `Meaning ${meaningIndex + 1}`;

    for (const field of REQUIRED_MEANING_FIELDS) {
      if (isEditorialValueBlank(readProperty(meaning, field.property))) {
        gaps.push({
          key: `meanings.${meaningIndex}.${field.property}`,
          fieldKey: field.key,
          label: `${prefix} · ${field.label}`,
          scope: "meaning",
          meaningIndex,
        });
      }
    }
  }

  return gaps;
}

export function getRequiredEditorialGapCount(entry: EditorialEntryLike) {
  return getRequiredEditorialGaps(entry).length;
}

export function isEditorialContentComplete(entry: EditorialEntryLike) {
  return getRequiredEditorialGapCount(entry) === 0;
}

export function getEditorialCompletionReport(
  entry: EditorialEntryLike,
): EditorialCompletionReport {
  const gaps = getRequiredEditorialGaps(entry);
  const meaningCount = Math.max(
    Array.isArray(entry.meanings) ? entry.meanings.length : 0,
    1,
  );
  const totalChecks =
    REQUIRED_ENTRY_FIELDS.length + REQUIRED_MEANING_FIELDS.length * meaningCount;
  const completedChecks = Math.max(totalChecks - gaps.length, 0);
  const score =
    totalChecks === 0
      ? 100
      : Math.round((completedChecks / totalChecks) * 100);
  const missingFieldKeys = Array.from(
    new Set(gaps.map((gap) => gap.fieldKey)),
  );

  return {
    gaps,
    gapCount: gaps.length,
    completedChecks,
    totalChecks,
    score,
    missingFieldKeys,
    missingLabels: Array.from(new Set(gaps.map((gap) => gap.label))),
    isComplete: gaps.length === 0,
  };
}

export function entryHasRequiredEditorialGap(
  entry: EditorialEntryLike,
  fieldKey: RequiredEditorialFieldKey,
) {
  return getRequiredEditorialGaps(entry).some(
    (gap) => gap.fieldKey === fieldKey,
  );
}

export function isEntryInEditorialReviewQueue(entry: EditorialEntryLike) {
  if (normalizeEditorialText(entry.status) === "Needs Review") return true;
  if (!isEditorialContentComplete(entry)) return true;

  const meanings = Array.isArray(entry.meanings) ? entry.meanings : [];

  return meanings.some((meaning) => {
    const status = normalizeEditorialText(meaning.editorialStatus);
    return status === "Needs Review" || status === "AI Suggested";
  });
}

export type SafeEditorialEntryStatus = Extract<
  EntryStatus,
  "Draft" | "Needs Review" | "Verified"
>;

export type SafeEditorialMeaningStatus = Extract<
  EditorialStatus,
  "Draft" | "Needs Review" | "Verified"
>;

export function getRecommendedEditorialStatuses(entry: EditorialEntryLike): {
  entryStatus: SafeEditorialEntryStatus;
  meaningStatus: SafeEditorialMeaningStatus;
} {
  const gapCount = getRequiredEditorialGapCount(entry);

  if (gapCount >= 4) {
    return { entryStatus: "Draft", meaningStatus: "Draft" };
  }

  if (gapCount > 0) {
    return {
      entryStatus: "Needs Review",
      meaningStatus: "Needs Review",
    };
  }

  const meanings = Array.isArray(entry.meanings) ? entry.meanings : [];
  const allMeaningsVerified =
    meanings.length > 0 &&
    meanings.every(
      (meaning) => normalizeEditorialText(meaning.editorialStatus) === "Verified",
    );

  if (allMeaningsVerified) {
    return { entryStatus: "Verified", meaningStatus: "Verified" };
  }

  // Complete content still requires a human verification step.
  return { entryStatus: "Needs Review", meaningStatus: "Needs Review" };
}

export function isEntryEditoriallyVerified(entry: EditorialEntryLike) {
  if (!isEditorialContentComplete(entry)) return false;

  const entryStatus = normalizeEditorialText(entry.status);
  if (entryStatus !== "Verified" && entryStatus !== "Published") return false;

  const meanings = Array.isArray(entry.meanings) ? entry.meanings : [];
  if (meanings.length === 0) return false;

  return meanings.every(
    (meaning) => normalizeEditorialText(meaning.editorialStatus) === "Verified",
  );
}

export function getEditorialRulesSummary() {
  return {
    version: EDITORIAL_RULESET_VERSION,
    requiredEntryFields: REQUIRED_ENTRY_FIELDS.map((field) => field.label),
    requiredMeaningFields: REQUIRED_MEANING_FIELDS.map((field) => field.label),
    optionalFields: [...OPTIONAL_EDITORIAL_FIELDS],
    retiredFields: [...RETIRED_EDITORIAL_FIELDS],
  };
}

// Structural assertion: the production Entry type remains compatible with the
// shared rules without introducing a runtime dependency.
const _entryCompatibilityCheck: EditorialEntryLike | null = null as Entry | null;
void _entryCompatibilityCheck;

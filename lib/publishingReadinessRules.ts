import type { Entry } from "@/types/entry";
import {
  getEditorialStatusAlignment,
  isEntryVerifiedOrPublishedReady,
} from "@/lib/editorialStatusRules";
import { getRequiredEditorialGaps } from "@/lib/editorialCompletionRules";
import {
  buildMediaReadinessSnapshot,
  getEntryMediaCoverage,
  type MediaReadinessSnapshot,
} from "@/lib/mediaReadinessRules";

export const PUBLISHING_READINESS_RULESET_VERSION = "2026.07.26-B";

export type PublicEntrySettingsLike = {
  visibility?: unknown;
  isFeatured?: unknown;
  displayOrder?: unknown;
  publicTitle?: unknown;
  publicSummary?: unknown;
  publishedAt?: unknown;
};

export type PublishingReadinessState =
  | "ready"
  | "live"
  | "blocked"
  | "needs-settings"
  | "private"
  | "archived";

export type PublishingReadinessIssueCode =
  | "required-content"
  | "editorial-status"
  | "meaning-verification"
  | "public-too-early"
  | "published-private"
  | "featured-private"
  | "missing-display-order"
  | "duplicate-display-order"
  | "duplicate-slug"
  | "missing-public-title"
  | "missing-public-summary"
  | "retired-public-entry"
  | "broken-concept-reference"
  | "broken-relationship"
  | "no-relationships"
  | "media-unavailable"
  | "featured-missing-image"
  | "missing-entry-image"
  | "missing-pronunciation-audio"
  | "missing-image-alt-text";

export type PublishingReadinessIssue = {
  code: PublishingReadinessIssueCode;
  label: string;
  detail: string;
  severity: "blocker" | "warning";
};

export type GraphIntegritySnapshot = {
  isLoading: boolean;
  conceptsChecked: boolean;
  relationshipsChecked: boolean;
  conceptAliases: string[];
  missingConceptsByEntryId: Record<string, string[]>;
  brokenRelationshipCountByEntryId: Record<string, number>;
  relationshipCountByEntryId: Record<string, number>;
  totalBrokenRelationships: number;
  notices: string[];
};

export type PublishingReadinessRow = {
  entry: Entry;
  settings: NormalizedPublicEntrySettings;
  state: PublishingReadinessState;
  blockers: PublishingReadinessIssue[];
  warnings: PublishingReadinessIssue[];
  isEditoriallyReady: boolean;
  requiredGapCount: number;
  verifiedMeaningCount: number;
  totalMeaningCount: number;
  media: ReturnType<typeof getEntryMediaCoverage>;
};

export type PublishingReadinessSummary = {
  total: number;
  ready: number;
  live: number;
  blocked: number;
  needsSettings: number;
  private: number;
  archived: number;
  blockerCount: number;
  warningCount: number;
};

export type NormalizedPublicEntrySettings = {
  visibility: "public" | "private";
  isFeatured: boolean;
  displayOrder: number | null;
  publicTitle: string;
  publicSummary: string;
  publishedAt: string;
};

function normalizeText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}

function normalizeKey(value: unknown) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDisplayOrder(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.trunc(parsed));
  }

  return null;
}

export function normalizePublicEntrySettings(
  entry: Entry,
  settings?: PublicEntrySettingsLike,
): NormalizedPublicEntrySettings {
  const rawVisibility = normalizeText(settings?.visibility).toLowerCase();
  const entryVisibility = normalizeText(entry.visibility).toLowerCase();
  const visibility =
    rawVisibility === "public" || rawVisibility === "private"
      ? rawVisibility
      : entryVisibility === "public"
        ? "public"
        : "private";

  return {
    visibility,
    isFeatured:
      typeof settings?.isFeatured === "boolean"
        ? settings.isFeatured
        : Boolean(entry.featured),
    displayOrder: normalizeDisplayOrder(settings?.displayOrder),
    publicTitle: normalizeText(settings?.publicTitle),
    publicSummary: normalizeText(settings?.publicSummary),
    publishedAt: normalizeText(settings?.publishedAt),
  };
}

export function splitEntryConceptReferences(entry: Entry) {
  const values = entry.meanings.flatMap((meaning) =>
    normalizeText(meaning.conceptsText)
      .split(/[,;/\n|]+/g)
      .map((item) => item.trim())
      .filter(Boolean),
  );

  return Array.from(new Set(values));
}

export function buildEmptyGraphIntegritySnapshot(): GraphIntegritySnapshot {
  return {
    isLoading: false,
    conceptsChecked: false,
    relationshipsChecked: false,
    conceptAliases: [],
    missingConceptsByEntryId: {},
    brokenRelationshipCountByEntryId: {},
    relationshipCountByEntryId: {},
    totalBrokenRelationships: 0,
    notices: [],
  };
}

function issue(
  code: PublishingReadinessIssueCode,
  label: string,
  detail: string,
  severity: "blocker" | "warning",
): PublishingReadinessIssue {
  return { code, label, detail, severity };
}

export function analyzePublishingReadiness(
  entries: Entry[],
  settingsByEntryId: Record<string, PublicEntrySettingsLike | undefined>,
  graph: GraphIntegritySnapshot = buildEmptyGraphIntegritySnapshot(),
  mediaSnapshot: MediaReadinessSnapshot = buildMediaReadinessSnapshot(),
): PublishingReadinessRow[] {
  const activeEntries = entries.filter((entry) => entry.status !== "Archived");

  const slugCounts = new Map<string, number>();
  activeEntries.forEach((entry) => {
    const slug = normalizeKey(entry.slug);
    if (!slug) return;
    slugCounts.set(slug, (slugCounts.get(slug) ?? 0) + 1);
  });

  const publicOrderCounts = new Map<number, number>();
  const featuredOrderCounts = new Map<number, number>();

  activeEntries.forEach((entry) => {
    const settings = normalizePublicEntrySettings(
      entry,
      settingsByEntryId[String(entry.id)],
    );

    if (settings.visibility === "public" && settings.displayOrder !== null) {
      publicOrderCounts.set(
        settings.displayOrder,
        (publicOrderCounts.get(settings.displayOrder) ?? 0) + 1,
      );
    }

    if (settings.isFeatured && settings.displayOrder !== null) {
      featuredOrderCounts.set(
        settings.displayOrder,
        (featuredOrderCounts.get(settings.displayOrder) ?? 0) + 1,
      );
    }
  });

  return entries.map((entry) => {
    const settings = normalizePublicEntrySettings(
      entry,
      settingsByEntryId[String(entry.id)],
    );
    const blockers: PublishingReadinessIssue[] = [];
    const warnings: PublishingReadinessIssue[] = [];
    const gaps = getRequiredEditorialGaps(entry);
    const alignment = getEditorialStatusAlignment(entry);
    const verifiedMeaningCount = entry.meanings.filter(
      (meaning) => meaning.editorialStatus === "Verified",
    ).length;
    const isEditoriallyReady = isEntryVerifiedOrPublishedReady(entry);
    const media = getEntryMediaCoverage(
      entry.id,
      mediaSnapshot.assetsByEntryId,
    );

    if (entry.status === "Archived") {
      return {
        entry,
        settings,
        state: "archived" as const,
        blockers,
        warnings,
        isEditoriallyReady: false,
        requiredGapCount: gaps.length,
        verifiedMeaningCount,
        totalMeaningCount: entry.meanings.length,
        media,
      };
    }

    if (gaps.length > 0) {
      blockers.push(
        issue(
          "required-content",
          `${gaps.length} required field${gaps.length === 1 ? " is" : "s are"} missing`,
          gaps
            .slice(0, 6)
            .map((gap) => gap.label)
            .join(", ") + (gaps.length > 6 ? `, and ${gaps.length - 6} more` : ""),
          "blocker",
        ),
      );
    }

    if (alignment.hasMismatch) {
      blockers.push(
        issue(
          "editorial-status",
          "Editorial status is not aligned",
          `${entry.status} should be ${alignment.recommendedEntryStatus} under the current status rules.`,
          "blocker",
        ),
      );
    }

    if (entry.meanings.length === 0 || verifiedMeaningCount !== entry.meanings.length) {
      blockers.push(
        issue(
          "meaning-verification",
          "Every meaning must be human-verified",
          `${verifiedMeaningCount} of ${entry.meanings.length} meaning${entry.meanings.length === 1 ? " is" : "s are"} Verified.`,
          "blocker",
        ),
      );
    }

    if (
      settings.visibility === "public" &&
      entry.status !== "Verified" &&
      entry.status !== "Published"
    ) {
      blockers.push(
        issue(
          "public-too-early",
          "Public visibility is enabled too early",
          `Move this entry through editorial review before exposing it publicly. Current status: ${entry.status}.`,
          "blocker",
        ),
      );
    }

    if (entry.status === "Published" && settings.visibility !== "public") {
      blockers.push(
        issue(
          "published-private",
          "Published entry is still private",
          "Set Public Visibility to public or move the entry out of Published.",
          "blocker",
        ),
      );
    }

    if (settings.isFeatured && settings.visibility !== "public") {
      blockers.push(
        issue(
          "featured-private",
          "Featured entry is private",
          "Featured entries must also be publicly visible.",
          "blocker",
        ),
      );
    }

    if (
      (settings.visibility === "public" || settings.isFeatured) &&
      settings.displayOrder === null
    ) {
      warnings.push(
        issue(
          "missing-display-order",
          "Display order is not set",
          "Assign a display order so the public app can sort this entry predictably.",
          "warning",
        ),
      );
    }

    if (
      settings.displayOrder !== null &&
      settings.isFeatured &&
      (featuredOrderCounts.get(settings.displayOrder) ?? 0) > 1
    ) {
      blockers.push(
        issue(
          "duplicate-display-order",
          "Featured display order is duplicated",
          `More than one featured entry uses display order ${settings.displayOrder}.`,
          "blocker",
        ),
      );
    } else if (
      settings.displayOrder !== null &&
      settings.visibility === "public" &&
      (publicOrderCounts.get(settings.displayOrder) ?? 0) > 1
    ) {
      warnings.push(
        issue(
          "duplicate-display-order",
          "Public display order is duplicated",
          `Multiple public entries use display order ${settings.displayOrder}.`,
          "warning",
        ),
      );
    }

    const normalizedSlug = normalizeKey(entry.slug);
    if (normalizedSlug && (slugCounts.get(normalizedSlug) ?? 0) > 1) {
      blockers.push(
        issue(
          "duplicate-slug",
          "Slug is duplicated",
          `The public route “${entry.slug}” is used by more than one active entry.`,
          "blocker",
        ),
      );
    }

    if (settings.visibility === "public" && !settings.publicTitle) {
      warnings.push(
        issue(
          "missing-public-title",
          "Public title is blank",
          `The public app will need to fall back to “${entry.word}”.`,
          "warning",
        ),
      );
    }

    if (settings.visibility === "public" && !settings.publicSummary) {
      warnings.push(
        issue(
          "missing-public-summary",
          "Public summary is blank",
          "Add a concise summary for search cards, featured sections, and previews.",
          "warning",
        ),
      );
    }

    if (settings.visibility === "public" && entry.lifecycle === "Retired") {
      warnings.push(
        issue(
          "retired-public-entry",
          "Retired slang is publicly visible",
          "Confirm that this historical entry should appear in the launch collection.",
          "warning",
        ),
      );
    }

    const missingConcepts = graph.missingConceptsByEntryId[String(entry.id)] ?? [];
    if (missingConcepts.length > 0) {
      blockers.push(
        issue(
          "broken-concept-reference",
          `${missingConcepts.length} concept reference${missingConcepts.length === 1 ? " is" : "s are"} unresolved`,
          missingConcepts.join(", "),
          "blocker",
        ),
      );
    }

    const brokenRelationshipCount =
      graph.brokenRelationshipCountByEntryId[String(entry.id)] ?? 0;
    if (brokenRelationshipCount > 0) {
      blockers.push(
        issue(
          "broken-relationship",
          `${brokenRelationshipCount} broken relationship${brokenRelationshipCount === 1 ? "" : "s"}`,
          "One or more graph relationships point to an entry that no longer exists.",
          "blocker",
        ),
      );
    }

    if (
      graph.relationshipsChecked &&
      (graph.relationshipCountByEntryId[String(entry.id)] ?? 0) === 0 &&
      settings.visibility === "public"
    ) {
      warnings.push(
        issue(
          "no-relationships",
          "No Knowledge Graph relationships",
          "This entry can launch, but related-entry discovery will be limited.",
          "warning",
        ),
      );
    }

    if (settings.visibility === "public") {
      if (!mediaSnapshot.checked) {
        blockers.push(
          issue(
            "media-unavailable",
            "Media library could not be verified",
            mediaSnapshot.error ||
              (mediaSnapshot.isLoading
                ? "Media assets are still loading."
                : "Refresh the media library before approving this entry for launch."),
            "blocker",
          ),
        );
      } else {
        if (!media.hasImage) {
          const isFeatured = settings.isFeatured;
          (isFeatured ? blockers : warnings).push(
            issue(
              isFeatured ? "featured-missing-image" : "missing-entry-image",
              isFeatured
                ? "Featured entry is missing an image"
                : "Entry image is missing",
              isFeatured
                ? "Featured launch cards require an entry image."
                : "This entry can launch, but cards and learning surfaces will have no visual.",
              isFeatured ? "blocker" : "warning",
            ),
          );
        } else if (!media.imageHasAltText) {
          blockers.push(
            issue(
              "missing-image-alt-text",
              "Entry image is missing alt text",
              "Add concise alt text before exposing this image in the public app.",
              "blocker",
            ),
          );
        }

        if (!media.hasAudio) {
          warnings.push(
            issue(
              "missing-pronunciation-audio",
              "Pronunciation audio is missing",
              "This entry can launch, but learners will not have a recorded pronunciation.",
              "warning",
            ),
          );
        }
      }
    }

    let state: PublishingReadinessState;

    if (blockers.length > 0) {
      state = "blocked";
    } else if (entry.status === "Published" && settings.visibility === "public") {
      state = "live";
    } else if (
      entry.status === "Verified" &&
      settings.visibility === "public" &&
      isEditoriallyReady
    ) {
      state = "ready";
    } else if (isEditoriallyReady && settings.visibility === "private") {
      state = "needs-settings";
    } else {
      state = "private";
    }

    return {
      entry,
      settings,
      state,
      blockers,
      warnings,
      isEditoriallyReady,
      requiredGapCount: gaps.length,
      verifiedMeaningCount,
      totalMeaningCount: entry.meanings.length,
      media,
    };
  });
}

export function summarizePublishingReadiness(
  rows: PublishingReadinessRow[],
): PublishingReadinessSummary {
  return rows.reduce<PublishingReadinessSummary>(
    (summary, row) => {
      summary.total += 1;
      if (row.state === "ready") summary.ready += 1;
      if (row.state === "live") summary.live += 1;
      if (row.state === "blocked") summary.blocked += 1;
      if (row.state === "needs-settings") summary.needsSettings += 1;
      if (row.state === "private") summary.private += 1;
      if (row.state === "archived") summary.archived += 1;
      summary.blockerCount += row.blockers.length;
      summary.warningCount += row.warnings.length;
      return summary;
    },
    {
      total: 0,
      ready: 0,
      live: 0,
      blocked: 0,
      needsSettings: 0,
      private: 0,
      archived: 0,
      blockerCount: 0,
      warningCount: 0,
    },
  );
}

export function getLocalPublishingReadinessSummary(
  entries: Entry[],
  settingsByEntryId: Record<string, PublicEntrySettingsLike | undefined>,
  mediaSnapshot: MediaReadinessSnapshot = buildMediaReadinessSnapshot(),
) {
  return summarizePublishingReadiness(
    analyzePublishingReadiness(
      entries,
      settingsByEntryId,
      buildEmptyGraphIntegritySnapshot(),
      mediaSnapshot,
    ),
  );
}

export function buildGraphIntegritySnapshot(
  entries: Entry[],
  conceptRows: Array<Record<string, unknown>>,
  relationshipRows: Array<Record<string, unknown>>,
  options: {
    conceptsChecked: boolean;
    relationshipsChecked: boolean;
    notices?: string[];
  },
): GraphIntegritySnapshot {
  const entryIds = new Set(entries.map((entry) => String(entry.id)));
  const conceptAliases = new Set<string>();

  conceptRows.forEach((row) => {
    [
      row.name,
      row.label,
      row.title,
      row.slug,
      row.concept_name,
      row.conceptName,
    ].forEach((value) => {
      const normalized = normalizeKey(value);
      if (normalized) conceptAliases.add(normalized);
    });
  });

  const missingConceptsByEntryId: Record<string, string[]> = {};

  if (options.conceptsChecked && conceptAliases.size > 0) {
    entries.forEach((entry) => {
      const missing = splitEntryConceptReferences(entry).filter(
        (concept) => !conceptAliases.has(normalizeKey(concept)),
      );

      if (missing.length > 0) {
        missingConceptsByEntryId[String(entry.id)] = missing;
      }
    });
  }

  const relationshipCountByEntryId: Record<string, number> = {};
  const brokenRelationshipCountByEntryId: Record<string, number> = {};
  let totalBrokenRelationships = 0;

  const readEndpoint = (
    row: Record<string, unknown>,
    candidates: string[],
  ) => {
    for (const candidate of candidates) {
      const value = row[candidate];
      if (value !== null && value !== undefined && normalizeText(value)) {
        return normalizeText(value);
      }
    }
    return "";
  };

  relationshipRows.forEach((row) => {
    const sourceId = readEndpoint(row, [
      "source_entry_id",
      "from_entry_id",
      "source_id",
      "entry_id",
      "sourceEntryId",
    ]);
    const targetId = readEndpoint(row, [
      "target_entry_id",
      "to_entry_id",
      "target_id",
      "related_entry_id",
      "targetEntryId",
    ]);

    if (!sourceId || !targetId) return;

    relationshipCountByEntryId[sourceId] =
      (relationshipCountByEntryId[sourceId] ?? 0) + 1;
    relationshipCountByEntryId[targetId] =
      (relationshipCountByEntryId[targetId] ?? 0) + 1;

    const sourceBroken = !entryIds.has(sourceId);
    const targetBroken = !entryIds.has(targetId);

    if (!sourceBroken && !targetBroken) return;

    totalBrokenRelationships += 1;

    if (entryIds.has(sourceId)) {
      brokenRelationshipCountByEntryId[sourceId] =
        (brokenRelationshipCountByEntryId[sourceId] ?? 0) + 1;
    }

    if (entryIds.has(targetId)) {
      brokenRelationshipCountByEntryId[targetId] =
        (brokenRelationshipCountByEntryId[targetId] ?? 0) + 1;
    }
  });

  return {
    isLoading: false,
    conceptsChecked: options.conceptsChecked,
    relationshipsChecked: options.relationshipsChecked,
    conceptAliases: Array.from(conceptAliases),
    missingConceptsByEntryId,
    brokenRelationshipCountByEntryId,
    relationshipCountByEntryId,
    totalBrokenRelationships,
    notices: options.notices ?? [],
  };
}

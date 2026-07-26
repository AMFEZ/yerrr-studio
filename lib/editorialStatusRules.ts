import type { EditorialStatus, Entry, EntryStatus } from "@/types/entry";
import {
  getRequiredEditorialGapCount,
  getRequiredEditorialGaps,
  isEditorialContentComplete,
  normalizeEditorialText,
} from "@/lib/editorialCompletionRules";

export const EDITORIAL_STATUS_RULESET_VERSION = "2026.07.26-B";

export type EditorialStatusAuditSeverity = "critical" | "warning" | "healthy";

export type MeaningStatusRecommendation = {
  meaningId: string;
  meaningIndex: number;
  currentStatus: EditorialStatus;
  recommendedStatus: EditorialStatus;
  gapCount: number;
  changed: boolean;
};

export type EditorialStatusAlignment = {
  entryId: string;
  currentEntryStatus: EntryStatus;
  recommendedEntryStatus: EntryStatus;
  meaningRecommendations: MeaningStatusRecommendation[];
  gapCount: number;
  severity: EditorialStatusAuditSeverity;
  reasons: string[];
  hasMismatch: boolean;
  isArchivedExempt: boolean;
};

function getMeaningGapCount(entry: Entry, meaningIndex: number) {
  return getRequiredEditorialGaps(entry).filter(
    (gap) => gap.scope === "meaning" && gap.meaningIndex === meaningIndex,
  ).length;
}

function getRecommendedMeaningStatus(
  currentStatus: EditorialStatus,
  gapCount: number,
): EditorialStatus {
  if (gapCount >= 4) return "Draft";
  if (gapCount > 0) return "Needs Review";

  // Completeness alone never grants human verification.
  if (currentStatus === "Verified") return "Verified";
  return "Needs Review";
}

export function getEditorialStatusAlignment(entry: Entry): EditorialStatusAlignment {
  const currentEntryStatus = entry.status;
  const gapCount = getRequiredEditorialGapCount(entry);

  if (currentEntryStatus === "Archived") {
    return {
      entryId: String(entry.id),
      currentEntryStatus,
      recommendedEntryStatus: "Archived",
      meaningRecommendations: entry.meanings.map((meaning, meaningIndex) => ({
        meaningId: String(meaning.id),
        meaningIndex,
        currentStatus: meaning.editorialStatus,
        recommendedStatus: meaning.editorialStatus,
        gapCount: getMeaningGapCount(entry, meaningIndex),
        changed: false,
      })),
      gapCount,
      severity: "healthy",
      reasons: ["Archived entries are exempt from active editorial queues."],
      hasMismatch: false,
      isArchivedExempt: true,
    };
  }

  const meaningRecommendations = entry.meanings.map((meaning, meaningIndex) => {
    const meaningGapCount = getMeaningGapCount(entry, meaningIndex);
    const recommendedStatus = getRecommendedMeaningStatus(
      meaning.editorialStatus,
      meaningGapCount,
    );

    return {
      meaningId: String(meaning.id),
      meaningIndex,
      currentStatus: meaning.editorialStatus,
      recommendedStatus,
      gapCount: meaningGapCount,
      changed: meaning.editorialStatus !== recommendedStatus,
    };
  });

  const allMeaningsVerified =
    meaningRecommendations.length > 0 &&
    meaningRecommendations.every(
      (meaning) => meaning.recommendedStatus === "Verified",
    );

  let recommendedEntryStatus: EntryStatus;

  if (gapCount >= 4) {
    recommendedEntryStatus = "Draft";
  } else if (gapCount > 0) {
    recommendedEntryStatus = "Needs Review";
  } else if (allMeaningsVerified) {
    recommendedEntryStatus =
      currentEntryStatus === "Published" ? "Published" : "Verified";
  } else {
    recommendedEntryStatus = "Needs Review";
  }

  const reasons: string[] = [];

  if (gapCount >= 4) {
    reasons.push(`${gapCount} required fields are missing, so this belongs in Draft.`);
  } else if (gapCount > 0) {
    reasons.push(`${gapCount} required field${gapCount === 1 ? " is" : "s are"} missing, so this needs editorial review.`);
  } else if (!allMeaningsVerified) {
    reasons.push("All required content is filled, but at least one meaning still needs human verification.");
  } else {
    reasons.push("Required content is complete and every meaning is human-verified.");
  }

  const entryChanged = currentEntryStatus !== recommendedEntryStatus;
  const meaningChanged = meaningRecommendations.some((meaning) => meaning.changed);
  const hasMismatch = entryChanged || meaningChanged;
  const isUnsafeCurrentStatus =
    (currentEntryStatus === "Verified" || currentEntryStatus === "Published") &&
    (gapCount > 0 || !allMeaningsVerified);

  return {
    entryId: String(entry.id),
    currentEntryStatus,
    recommendedEntryStatus,
    meaningRecommendations,
    gapCount,
    severity: isUnsafeCurrentStatus
      ? "critical"
      : hasMismatch
        ? "warning"
        : "healthy",
    reasons,
    hasMismatch,
    isArchivedExempt: false,
  };
}

export function applyEditorialStatusAlignment(entry: Entry): Entry {
  const alignment = getEditorialStatusAlignment(entry);

  if (!alignment.hasMismatch) return entry;

  return {
    ...entry,
    status: alignment.recommendedEntryStatus,
    updatedAt: new Date().toISOString(),
    meanings: entry.meanings.map((meaning, meaningIndex) => ({
      ...meaning,
      editorialStatus:
        alignment.meaningRecommendations[meaningIndex]?.recommendedStatus ??
        meaning.editorialStatus,
    })),
  };
}

export function getEntryStatusTransitionBlocker(
  entry: Entry,
  targetStatus: EntryStatus,
): string | null {
  if (
    targetStatus === "Draft" ||
    targetStatus === "Needs Review" ||
    targetStatus === "Archived"
  ) {
    return null;
  }

  if (!isEditorialContentComplete(entry)) {
    const gapCount = getRequiredEditorialGapCount(entry);
    return `${entry.word} cannot move to ${targetStatus} while ${gapCount} required field${gapCount === 1 ? " is" : "s are"} missing.`;
  }

  if (entry.meanings.length === 0) {
    return `${entry.word} cannot move to ${targetStatus} without at least one meaning.`;
  }

  const unverifiedMeaningCount = entry.meanings.filter(
    (meaning) => normalizeEditorialText(meaning.editorialStatus) !== "Verified",
  ).length;

  if (unverifiedMeaningCount > 0) {
    return `${entry.word} cannot move to ${targetStatus} until all ${unverifiedMeaningCount} unverified meaning${unverifiedMeaningCount === 1 ? " is" : "s are"} marked Verified.`;
  }

  return null;
}

export function isEntryInDraftQueue(entry: Entry) {
  if (entry.status === "Archived" || entry.status === "Published") return false;
  return getEditorialStatusAlignment(entry).recommendedEntryStatus === "Draft";
}

export function isEntryInReviewQueue(entry: Entry) {
  if (entry.status === "Archived" || entry.status === "Published") return false;
  return getEditorialStatusAlignment(entry).recommendedEntryStatus === "Needs Review";
}

export function isEntryInPublishQueue(entry: Entry) {
  if (entry.status !== "Verified") return false;
  return getEditorialStatusAlignment(entry).recommendedEntryStatus === "Verified";
}

export function isEntryVerifiedOrPublishedReady(entry: Entry) {
  const alignment = getEditorialStatusAlignment(entry);
  return (
    (entry.status === "Verified" && alignment.recommendedEntryStatus === "Verified") ||
    (entry.status === "Published" && alignment.recommendedEntryStatus === "Published")
  );
}

export function countEditorialStatusMismatches(entries: Entry[]) {
  return entries.reduce(
    (counts, entry) => {
      const alignment = getEditorialStatusAlignment(entry);

      if (alignment.severity === "critical") counts.critical += 1;
      if (alignment.severity === "warning") counts.warning += 1;
      if (alignment.severity === "healthy") counts.healthy += 1;
      if (alignment.hasMismatch) counts.total += 1;

      return counts;
    },
    { critical: 0, warning: 0, healthy: 0, total: 0 },
  );
}

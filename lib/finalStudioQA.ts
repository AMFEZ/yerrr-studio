import type { Entry } from "@/types/entry";
import type { EntryMediaAssetsByEntryId } from "@/lib/mediaReadinessRules";
import {
  buildMediaReadinessSnapshot,
  summarizeMediaCoverage,
} from "@/lib/mediaReadinessRules";
import {
  analyzePublishingReadiness,
  buildEmptyGraphIntegritySnapshot,
  normalizePublicEntrySettings,
  type PublicEntrySettingsLike,
} from "@/lib/publishingReadinessRules";
import { getRequiredEditorialGapCount } from "@/lib/editorialCompletionRules";
import {
  countEditorialStatusMismatches,
  isEntryVerifiedOrPublishedReady,
} from "@/lib/editorialStatusRules";

export const FINAL_STUDIO_QA_RULESET_VERSION = "2026.07.26-A";

export type FinalStudioQACategory = "system" | "content";
export type FinalStudioQACheckStatus =
  | "pass"
  | "warning"
  | "blocked";

export type FinalStudioQACheck = {
  id: string;
  category: FinalStudioQACategory;
  label: string;
  detail: string;
  status: FinalStudioQACheckStatus;
  action?:
    | "completion"
    | "status-audit"
    | "launch-gate"
    | "dry-run"
    | "media"
    | "sync";
};

export type FinalStudioQASummary = {
  totalEntries: number;
  activeEntries: number;
  archivedEntries: number;
  incompleteEntries: number;
  requiredGapCount: number;
  statusMismatchCount: number;
  verifiedEntries: number;
  publicEntries: number;
  featuredEntries: number;
  launchableEntries: number;
  blockedPublicEntries: number;
  publicMediaWarnings: number;
  mediaWithImage: number;
  mediaWithAudio: number;
  mediaComplete: number;
  duplicateEntryIds: number;
  duplicateActiveSlugs: number;
  pendingSyncCount: number;
};

export type FinalStudioQASnapshot = {
  generatedAt: string;
  studioVersion: string;
  rulesetVersion: string;
  checks: FinalStudioQACheck[];
  systemChecks: FinalStudioQACheck[];
  contentChecks: FinalStudioQACheck[];
  systemBlockerCount: number;
  contentBlockerCount: number;
  warningCount: number;
  systemReady: boolean;
  contentFrozen: boolean;
  summary: FinalStudioQASummary;
};

export type BuildFinalStudioQAInput = {
  studioVersion: string;
  entries: Entry[];
  isEntriesLoading: boolean;
  isOnline: boolean;
  pendingSyncCount: number;
  isSyncingOffline: boolean;
  offlineSyncError?: string | null;
  settingsByEntryId: Record<
    string,
    PublicEntrySettingsLike | undefined
  >;
  isPublicSettingsLoading: boolean;
  publicSettingsError?: string | null;
  mediaAssetsByEntryId: EntryMediaAssetsByEntryId;
  isMediaLoading: boolean;
  mediaError?: string | null;
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSlug(value: unknown) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeCheck(
  id: string,
  category: FinalStudioQACategory,
  label: string,
  detail: string,
  status: FinalStudioQACheckStatus,
  action?: FinalStudioQACheck["action"],
): FinalStudioQACheck {
  return { id, category, label, detail, status, action };
}

function countDuplicates(values: string[]) {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach((value) => {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  return Array.from(counts.values()).filter((count) => count > 1).length;
}

export function buildFinalStudioQASnapshot(
  input: BuildFinalStudioQAInput,
): FinalStudioQASnapshot {
  const activeEntries = input.entries.filter(
    (entry) => entry.status !== "Archived",
  );
  const archivedEntries = input.entries.filter(
    (entry) => entry.status === "Archived",
  );

  const incompleteEntries = activeEntries.filter(
    (entry) => getRequiredEditorialGapCount(entry) > 0,
  );
  const requiredGapCount = activeEntries.reduce(
    (total, entry) => total + getRequiredEditorialGapCount(entry),
    0,
  );
  const statusMismatches = countEditorialStatusMismatches(activeEntries);
  const verifiedEntries = activeEntries.filter((entry) =>
    isEntryVerifiedOrPublishedReady(entry),
  );

  const publicEntries = activeEntries.filter((entry) =>
    normalizePublicEntrySettings(
      entry,
      input.settingsByEntryId[String(entry.id)],
    ).visibility === "public",
  );
  const featuredEntries = activeEntries.filter((entry) =>
    normalizePublicEntrySettings(
      entry,
      input.settingsByEntryId[String(entry.id)],
    ).isFeatured,
  );

  const mediaSnapshot = buildMediaReadinessSnapshot({
    isLoading: input.isMediaLoading,
    error: input.mediaError,
    assetsByEntryId: input.mediaAssetsByEntryId,
  });
  const mediaSummary = summarizeMediaCoverage(
    activeEntries,
    input.mediaAssetsByEntryId,
  );

  const readinessRows = analyzePublishingReadiness(
    input.entries,
    input.settingsByEntryId,
    buildEmptyGraphIntegritySnapshot(),
    mediaSnapshot,
  );
  const publicReadinessRows = readinessRows.filter(
    (row) => row.settings.visibility === "public",
  );
  const launchableEntries = publicReadinessRows.filter(
    (row) => row.state === "ready" || row.state === "live",
  );
  const blockedPublicEntries = publicReadinessRows.filter(
    (row) => row.state === "blocked",
  );
  const publicMediaWarnings = publicReadinessRows.reduce(
    (count, row) =>
      count +
      row.warnings.filter((warning) =>
        [
          "missing-entry-image",
          "missing-pronunciation-audio",
          "missing-image-alt-text",
        ].includes(warning.code),
      ).length,
    0,
  );

  const duplicateEntryIds = countDuplicates(
    input.entries.map((entry) => String(entry.id)),
  );
  const duplicateActiveSlugs = countDuplicates(
    activeEntries.map((entry) => normalizeSlug(entry.slug)),
  );

  const checks: FinalStudioQACheck[] = [];

  checks.push(
    makeCheck(
      "entries-loaded",
      "system",
      "Studio dataset loaded",
      input.isEntriesLoading
        ? "Entry data is still loading."
        : activeEntries.length > 0
          ? `${activeEntries.length} active entries are available for QA.`
          : "No active entries were loaded.",
      input.isEntriesLoading
        ? "warning"
        : activeEntries.length > 0
          ? "pass"
          : "blocked",
    ),
  );

  checks.push(
    makeCheck(
      "online-session",
      "system",
      "Online Studio session",
      input.isOnline
        ? "Studio is connected and can verify Supabase-backed systems."
        : "Studio is offline. Final release checks require an online session.",
      input.isOnline ? "pass" : "warning",
      "sync",
    ),
  );

  const normalizedOfflineError = normalizeText(input.offlineSyncError);
  checks.push(
    makeCheck(
      "offline-sync",
      "system",
      "Offline changes synchronized",
      normalizedOfflineError
        ? normalizedOfflineError
        : input.isSyncingOffline
          ? "Queued offline changes are currently syncing."
          : input.pendingSyncCount > 0
            ? `${input.pendingSyncCount} queued change${input.pendingSyncCount === 1 ? " is" : "s are"} waiting to sync.`
            : "No offline changes are waiting to sync.",
      normalizedOfflineError || input.pendingSyncCount > 0
        ? "blocked"
        : input.isSyncingOffline
          ? "warning"
          : "pass",
      "sync",
    ),
  );

  const normalizedSettingsError = normalizeText(input.publicSettingsError);
  checks.push(
    makeCheck(
      "public-settings",
      "system",
      "Public settings accessible",
      normalizedSettingsError
        ? normalizedSettingsError
        : input.isPublicSettingsLoading
          ? "Public settings are still loading."
          : "Public visibility and featured settings loaded successfully.",
      normalizedSettingsError
        ? "blocked"
        : input.isPublicSettingsLoading
          ? "warning"
          : "pass",
      "launch-gate",
    ),
  );

  const normalizedMediaError = normalizeText(input.mediaError);
  checks.push(
    makeCheck(
      "media-library",
      "system",
      "Media library accessible",
      normalizedMediaError
        ? normalizedMediaError
        : input.isMediaLoading
          ? "Media records are still loading."
          : "Entry image and pronunciation-audio records loaded successfully.",
      normalizedMediaError
        ? "blocked"
        : input.isMediaLoading
          ? "warning"
          : "pass",
      "media",
    ),
  );

  checks.push(
    makeCheck(
      "unique-entry-ids",
      "system",
      "Entry identifiers are unique",
      duplicateEntryIds > 0
        ? `${duplicateEntryIds} duplicated entry ID group${duplicateEntryIds === 1 ? " was" : "s were"} detected.`
        : "No duplicated entry IDs were detected.",
      duplicateEntryIds > 0 ? "blocked" : "pass",
    ),
  );

  checks.push(
    makeCheck(
      "unique-active-slugs",
      "content",
      "Active public routes are unique",
      duplicateActiveSlugs > 0
        ? `${duplicateActiveSlugs} duplicated active slug group${duplicateActiveSlugs === 1 ? " was" : "s were"} detected.`
        : "Every active entry currently has a unique slug.",
      duplicateActiveSlugs > 0 ? "blocked" : "pass",
      "launch-gate",
    ),
  );

  checks.push(
    makeCheck(
      "required-content",
      "content",
      "Every active entry is editorially complete",
      incompleteEntries.length > 0
        ? `${incompleteEntries.length} active entr${incompleteEntries.length === 1 ? "y is" : "ies are"} missing ${requiredGapCount} required field${requiredGapCount === 1 ? "" : "s"}.`
        : "All active entries contain every required editorial field.",
      incompleteEntries.length > 0 ? "blocked" : "pass",
      "completion",
    ),
  );

  checks.push(
    makeCheck(
      "status-alignment",
      "content",
      "Editorial statuses are aligned",
      statusMismatches.total > 0
        ? `${statusMismatches.total} entr${statusMismatches.total === 1 ? "y has" : "ies have"} a status mismatch, including ${statusMismatches.critical} critical mismatch${statusMismatches.critical === 1 ? "" : "es"}.`
        : "Entry and meaning statuses follow the shared editorial rules.",
      statusMismatches.total > 0 ? "blocked" : "pass",
      "status-audit",
    ),
  );

  const unverifiedEntryCount = activeEntries.length - verifiedEntries.length;
  checks.push(
    makeCheck(
      "human-verification",
      "content",
      "Every active entry is human-verified",
      unverifiedEntryCount > 0
        ? `${unverifiedEntryCount} active entr${unverifiedEntryCount === 1 ? "y still needs" : "ies still need"} final human verification.`
        : "Every active entry and meaning has completed human verification.",
      unverifiedEntryCount > 0 ? "blocked" : "pass",
      "status-audit",
    ),
  );

  checks.push(
    makeCheck(
      "public-selection",
      "content",
      "Launch visibility has been selected",
      publicEntries.length > 0
        ? `${publicEntries.length} entr${publicEntries.length === 1 ? "y is" : "ies are"} marked public, including ${featuredEntries.length} featured entr${featuredEntries.length === 1 ? "y" : "ies"}.`
        : "No entries are marked public yet. Finish the lexicon before selecting the launch dataset.",
      publicEntries.length > 0 ? "pass" : "blocked",
      "launch-gate",
    ),
  );

  checks.push(
    makeCheck(
      "public-readiness",
      "content",
      "Public entries pass the local launch gate",
      publicEntries.length === 0
        ? "This check will run after at least one entry is marked public."
        : blockedPublicEntries.length > 0
          ? `${blockedPublicEntries.length} public entr${blockedPublicEntries.length === 1 ? "y is" : "ies are"} blocked by editorial, settings, or media requirements.`
          : `${launchableEntries.length} public entr${launchableEntries.length === 1 ? "y is" : "ies are"} locally launchable. Run the full Launch Gate for graph verification.`,
      publicEntries.length === 0 || blockedPublicEntries.length > 0
        ? "blocked"
        : "pass",
      "launch-gate",
    ),
  );

  checks.push(
    makeCheck(
      "media-coverage",
      "content",
      "Public media policy reviewed",
      publicEntries.length === 0
        ? "Media launch policy will be evaluated after entries are marked public."
        : publicMediaWarnings > 0
          ? `${publicMediaWarnings} public-media warning${publicMediaWarnings === 1 ? " remains" : "s remain"}. Audio is optional, but every public image needs alt text and featured entries need an image.`
          : "Public entries satisfy the current media policy without warnings.",
      publicEntries.length === 0
        ? "warning"
        : publicMediaWarnings > 0
          ? "warning"
          : "pass",
      "media",
    ),
  );

  checks.push(
    makeCheck(
      "full-dry-run",
      "content",
      "Publishing dry run completed",
      "Run the full dry run after content, public settings, graph checks, and media are finalized. Record completion in the manual checklist.",
      "warning",
      "dry-run",
    ),
  );

  const systemChecks = checks.filter((check) => check.category === "system");
  const contentChecks = checks.filter((check) => check.category === "content");
  const systemBlockerCount = systemChecks.filter(
    (check) => check.status === "blocked",
  ).length;
  const contentBlockerCount = contentChecks.filter(
    (check) => check.status === "blocked",
  ).length;
  const warningCount = checks.filter(
    (check) => check.status === "warning",
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    studioVersion: input.studioVersion,
    rulesetVersion: FINAL_STUDIO_QA_RULESET_VERSION,
    checks,
    systemChecks,
    contentChecks,
    systemBlockerCount,
    contentBlockerCount,
    warningCount,
    systemReady: systemBlockerCount === 0,
    contentFrozen:
      contentBlockerCount === 0 &&
      publicEntries.length > 0 &&
      launchableEntries.length === publicEntries.length,
    summary: {
      totalEntries: input.entries.length,
      activeEntries: activeEntries.length,
      archivedEntries: archivedEntries.length,
      incompleteEntries: incompleteEntries.length,
      requiredGapCount,
      statusMismatchCount: statusMismatches.total,
      verifiedEntries: verifiedEntries.length,
      publicEntries: publicEntries.length,
      featuredEntries: featuredEntries.length,
      launchableEntries: launchableEntries.length,
      blockedPublicEntries: blockedPublicEntries.length,
      publicMediaWarnings,
      mediaWithImage: mediaSummary.withImage,
      mediaWithAudio: mediaSummary.withAudio,
      mediaComplete: mediaSummary.complete,
      duplicateEntryIds,
      duplicateActiveSlugs,
      pendingSyncCount: input.pendingSyncCount,
    },
  };
}

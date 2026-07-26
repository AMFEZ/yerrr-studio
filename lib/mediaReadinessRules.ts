import type { Entry } from "@/types/entry";
import type {
  EntryMediaAsset,
  EntryMediaKind,
} from "@/types/entryMedia";

export const MEDIA_READINESS_RULESET_VERSION = "2026.07.26-B";

export type EntryMediaAssetsByEntryId = Record<
  string,
  Partial<Record<EntryMediaKind, EntryMediaAsset>>
>;

export type MediaReadinessSnapshot = {
  checked: boolean;
  isLoading: boolean;
  error: string | null;
  assetsByEntryId: EntryMediaAssetsByEntryId;
};

export type EntryMediaCoverage = {
  entryId: string;
  image?: EntryMediaAsset;
  audio?: EntryMediaAsset;
  hasImage: boolean;
  hasAudio: boolean;
  hasBoth: boolean;
  imageHasAltText: boolean;
  missingKinds: EntryMediaKind[];
};

export type MediaCoverageSummary = {
  total: number;
  withImage: number;
  withAudio: number;
  complete: number;
  missingImage: number;
  missingAudio: number;
  missingBoth: number;
  imagesMissingAltText: number;
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildMediaReadinessSnapshot(input?: {
  isLoading?: boolean;
  error?: string | null;
  assetsByEntryId?: EntryMediaAssetsByEntryId;
}): MediaReadinessSnapshot {
  const isLoading = Boolean(input?.isLoading);
  const error = normalizeText(input?.error) || null;

  return {
    checked: !isLoading && !error,
    isLoading,
    error,
    assetsByEntryId: input?.assetsByEntryId ?? {},
  };
}

export function getEntryMediaCoverage(
  entryId: string | number,
  assetsByEntryId: EntryMediaAssetsByEntryId,
): EntryMediaCoverage {
  const normalizedEntryId = String(entryId);
  const assets = assetsByEntryId[normalizedEntryId] ?? {};
  const image = assets.image;
  const audio = assets.audio;
  const hasImage = Boolean(image);
  const hasAudio = Boolean(audio);
  const missingKinds: EntryMediaKind[] = [];

  if (!hasImage) missingKinds.push("image");
  if (!hasAudio) missingKinds.push("audio");

  return {
    entryId: normalizedEntryId,
    image,
    audio,
    hasImage,
    hasAudio,
    hasBoth: hasImage && hasAudio,
    imageHasAltText: Boolean(image && normalizeText(image.altText)),
    missingKinds,
  };
}

export function summarizeMediaCoverage(
  entries: Entry[],
  assetsByEntryId: EntryMediaAssetsByEntryId,
): MediaCoverageSummary {
  return entries.reduce<MediaCoverageSummary>(
    (summary, entry) => {
      if (entry.status === "Archived") return summary;

      const coverage = getEntryMediaCoverage(entry.id, assetsByEntryId);
      summary.total += 1;
      if (coverage.hasImage) summary.withImage += 1;
      if (coverage.hasAudio) summary.withAudio += 1;
      if (coverage.hasBoth) summary.complete += 1;
      if (!coverage.hasImage) summary.missingImage += 1;
      if (!coverage.hasAudio) summary.missingAudio += 1;
      if (!coverage.hasImage && !coverage.hasAudio) summary.missingBoth += 1;
      if (coverage.image && !coverage.imageHasAltText) {
        summary.imagesMissingAltText += 1;
      }
      return summary;
    },
    {
      total: 0,
      withImage: 0,
      withAudio: 0,
      complete: 0,
      missingImage: 0,
      missingAudio: 0,
      missingBoth: 0,
      imagesMissingAltText: 0,
    },
  );
}

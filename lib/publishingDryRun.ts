import type { Entry } from "@/types/entry";
import type {
  GraphIntegritySnapshot,
  PublishingReadinessRow,
} from "@/lib/publishingReadinessRules";
import type { MediaReadinessSnapshot } from "@/lib/mediaReadinessRules";

export const PUBLISHING_DRY_RUN_VERSION = "2026.07.26-C";

export type PublicDryRunMeaning = {
  id: string;
  title: string;
  definition: string;
  example: string;
  category: string;
  tone: string;
  concepts: string[];
  usageFrequency: string;
  culturalContext: string;
};


export type PublicDryRunMediaAsset = {
  url: string;
  filename: string;
  mimeType: string;
  altText: string;
  attribution: string;
  sourceUrl: string;
};

export type PublicDryRunEntry = {
  id: string;
  word: string;
  slug: string;
  route: string;
  type: string;
  pronunciation: string;
  partOfSpeech: string;
  alternateSpellings: string[];
  lifecycle: string;
  editorialStatus: "Verified" | "Published";
  featured: boolean;
  displayOrder: number | null;
  publicTitle: string;
  publicSummary: string;
  relationshipCount: number;
  image: PublicDryRunMediaAsset | null;
  pronunciationAudio: PublicDryRunMediaAsset | null;
  meanings: PublicDryRunMeaning[];
  updatedAt: string;
};

export type PublishingDryRunManifest = {
  app: "YERRR Studio";
  manifestType: "public-dataset-dry-run";
  dryRunVersion: string;
  studioVersion: string;
  generatedAt: string;
  fingerprint: string;
  summary: {
    totalEntries: number;
    activeEntries: number;
    publicEntries: number;
    launchableEntries: number;
    readyEntries: number;
    liveEntries: number;
    blockedPublicEntries: number;
    privateEntries: number;
    archivedEntries: number;
    featuredEntries: number;
    routeCount: number;
    entriesWithImage: number;
    entriesWithAudio: number;
    mediaCompleteEntries: number;
    publicEntriesMissingImage: number;
    publicEntriesMissingAudio: number;
    imagesMissingAltText: number;
    blockerCount: number;
    warningCount: number;
  };
  integrity: {
    conceptsChecked: boolean;
    relationshipsChecked: boolean;
    unresolvedConceptReferences: number;
    brokenRelationships: number;
    mediaChecked: boolean;
    mediaError: string | null;
    notices: string[];
  };
  excluded: {
    blockedPublicEntryIds: string[];
    privateEntryIds: string[];
    archivedEntryIds: string[];
  };
  entries: PublicDryRunEntry[];
};

function normalizeText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}

function splitList(value: unknown) {
  return normalizeText(value)
    .split(/[,;/\n|]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function stableHash(value: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function mapPublicMediaAsset(
  asset: PublishingReadinessRow["media"]["image"],
): PublicDryRunMediaAsset | null {
  if (!asset) return null;

  return {
    url: asset.publicUrl,
    filename: asset.filename,
    mimeType: asset.mimeType,
    altText: asset.altText,
    attribution: asset.attribution,
    sourceUrl: asset.sourceUrl,
  };
}

function buildPublicEntry(
  row: PublishingReadinessRow,
  graph: GraphIntegritySnapshot,
): PublicDryRunEntry {
  const entry = row.entry;
  const firstDefinition = normalizeText(entry.meanings[0]?.definition);

  return {
    id: String(entry.id),
    word: entry.word.trim(),
    slug: entry.slug.trim(),
    route: `/slang/${entry.slug.trim()}`,
    type: entry.type.trim(),
    pronunciation: entry.pronunciation.trim(),
    partOfSpeech: entry.partOfSpeech.trim(),
    alternateSpellings: splitList(entry.alternateSpellings),
    lifecycle: entry.lifecycle,
    editorialStatus:
      entry.status === "Published" ? "Published" : "Verified",
    featured: row.settings.isFeatured,
    displayOrder: row.settings.displayOrder,
    publicTitle: row.settings.publicTitle || entry.word.trim(),
    publicSummary: row.settings.publicSummary || firstDefinition,
    relationshipCount:
      graph.relationshipCountByEntryId[String(entry.id)] ?? 0,
    image: mapPublicMediaAsset(row.media.image),
    pronunciationAudio: mapPublicMediaAsset(row.media.audio),
    meanings: entry.meanings.map((meaning) => ({
      id: String(meaning.id),
      title: meaning.title.trim(),
      definition: meaning.definition.trim(),
      example: meaning.example.trim(),
      category: meaning.category.trim(),
      tone: meaning.tone.trim(),
      concepts: splitList(meaning.conceptsText),
      usageFrequency: meaning.usageFrequency.trim(),
      culturalContext: meaning.culturalContext.trim(),
    })),
    updatedAt: entry.updatedAt,
  };
}

function sortPublicEntries(
  left: PublicDryRunEntry,
  right: PublicDryRunEntry,
) {
  if (left.featured !== right.featured) return left.featured ? -1 : 1;

  const leftOrder = left.displayOrder ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = right.displayOrder ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;

  return left.publicTitle.localeCompare(right.publicTitle);
}

export function buildPublishingDryRunManifest(
  rows: PublishingReadinessRow[],
  graph: GraphIntegritySnapshot,
  mediaSnapshot: MediaReadinessSnapshot,
  studioVersion: string,
  generatedAt = new Date().toISOString(),
): PublishingDryRunManifest {
  const launchableRows = rows.filter(
    (row) => row.state === "ready" || row.state === "live",
  );
  const publicRows = rows.filter(
    (row) =>
      row.settings.visibility === "public" && row.state !== "archived",
  );
  const blockedPublicRows = publicRows.filter(
    (row) => row.state === "blocked",
  );
  const privateRows = rows.filter(
    (row) =>
      row.settings.visibility === "private" && row.state !== "archived",
  );
  const archivedRows = rows.filter((row) => row.state === "archived");

  const entries = launchableRows
    .map((row) => buildPublicEntry(row, graph))
    .sort(sortPublicEntries);

  const blockerCount = publicRows.reduce(
    (total, row) => total + row.blockers.length,
    0,
  );
  const warningCount = publicRows.reduce(
    (total, row) => total + row.warnings.length,
    0,
  );
  const unresolvedConceptReferences = publicRows.reduce(
    (total, row) =>
      total +
      (graph.missingConceptsByEntryId[String(row.entry.id)] ?? []).length,
    0,
  );
  const brokenPublicRelationships = publicRows.reduce(
    (total, row) =>
      total +
      (graph.brokenRelationshipCountByEntryId[String(row.entry.id)] ?? 0),
    0,
  );
  const publicEntriesMissingImage = publicRows.filter(
    (row) => !row.media.hasImage,
  ).length;
  const publicEntriesMissingAudio = publicRows.filter(
    (row) => !row.media.hasAudio,
  ).length;
  const imagesMissingAltText = publicRows.filter(
    (row) => row.media.image && !row.media.imageHasAltText,
  ).length;

  const fingerprintSource = JSON.stringify(
    entries.map((entry) => ({
      id: entry.id,
      slug: entry.slug,
      status: entry.editorialStatus,
      featured: entry.featured,
      displayOrder: entry.displayOrder,
      publicTitle: entry.publicTitle,
      publicSummary: entry.publicSummary,
      relationshipCount: entry.relationshipCount,
      image: entry.image,
      pronunciationAudio: entry.pronunciationAudio,
      meanings: entry.meanings,
      updatedAt: entry.updatedAt,
    })),
  );

  return {
    app: "YERRR Studio",
    manifestType: "public-dataset-dry-run",
    dryRunVersion: PUBLISHING_DRY_RUN_VERSION,
    studioVersion,
    generatedAt,
    fingerprint: stableHash(fingerprintSource),
    summary: {
      totalEntries: rows.length,
      activeEntries: rows.length - archivedRows.length,
      publicEntries: publicRows.length,
      launchableEntries: entries.length,
      readyEntries: rows.filter((row) => row.state === "ready").length,
      liveEntries: rows.filter((row) => row.state === "live").length,
      blockedPublicEntries: blockedPublicRows.length,
      privateEntries: privateRows.length,
      archivedEntries: archivedRows.length,
      featuredEntries: entries.filter((entry) => entry.featured).length,
      routeCount: new Set(entries.map((entry) => entry.route)).size,
      entriesWithImage: entries.filter((entry) => Boolean(entry.image)).length,
      entriesWithAudio: entries.filter((entry) => Boolean(entry.pronunciationAudio)).length,
      mediaCompleteEntries: entries.filter(
        (entry) => Boolean(entry.image && entry.pronunciationAudio),
      ).length,
      publicEntriesMissingImage,
      publicEntriesMissingAudio,
      imagesMissingAltText,
      blockerCount,
      warningCount,
    },
    integrity: {
      conceptsChecked: graph.conceptsChecked,
      relationshipsChecked: graph.relationshipsChecked,
      unresolvedConceptReferences,
      brokenRelationships: brokenPublicRelationships,
      mediaChecked: mediaSnapshot.checked,
      mediaError: mediaSnapshot.error,
      notices: graph.notices,
    },
    excluded: {
      blockedPublicEntryIds: blockedPublicRows.map((row) =>
        String(row.entry.id),
      ),
      privateEntryIds: privateRows.map((row) => String(row.entry.id)),
      archivedEntryIds: archivedRows.map((row) => String(row.entry.id)),
    },
    entries,
  };
}

export function findEntryForDryRunRecord(
  entries: Entry[],
  record: PublicDryRunEntry,
) {
  return entries.find((entry) => String(entry.id) === record.id) ?? null;
}

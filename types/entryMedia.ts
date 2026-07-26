export type EntryMediaKind = "image" | "audio";

export type EntryMediaAsset = {
  id: string;
  entryId: string;
  kind: EntryMediaKind;
  bucket: string;
  objectPath: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  publicUrl: string;
  altText: string;
  attribution: string;
  sourceUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type EntryMediaMetadataInput = {
  altText?: string;
  attribution?: string;
  sourceUrl?: string;
};

export type EntryMediaUploadInput = EntryMediaMetadataInput & {
  entryId: string;
  kind: EntryMediaKind;
  file: File;
};

export type EntryMediaBulkMetadataInput = {
  assets: EntryMediaAsset[];
  attribution?: string;
  sourceUrl?: string;
  fillBlankOnly: boolean;
};

export type EntryMediaBulkMetadataResult = {
  updated: number;
  skipped: number;
};

export type EntryMediaStorageObject = {
  bucket: string;
  objectPath: string;
  filename: string;
};

export type EntryMediaStorageAudit = {
  checkedAt: string;
  referencedAssets: number;
  storedObjects: number;
  orphanedObjects: EntryMediaStorageObject[];
  missingAssets: EntryMediaAsset[];
};

export type EntryMediaStorageCleanupInput = {
  removeOrphanedObjects: boolean;
  removeMissingAssetRows: boolean;
};

export type EntryMediaStorageCleanupResult = {
  removedObjects: number;
  removedRows: number;
  warnings: string[];
};

export type EntryMediaRemoveResult = {
  storageCleanupPending: boolean;
  warning?: string;
};

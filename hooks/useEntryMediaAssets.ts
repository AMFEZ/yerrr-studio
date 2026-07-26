"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  EntryMediaAsset,
  EntryMediaBulkMetadataInput,
  EntryMediaBulkMetadataResult,
  EntryMediaKind,
  EntryMediaMetadataInput,
  EntryMediaRemoveResult,
  EntryMediaStorageAudit,
  EntryMediaStorageCleanupInput,
  EntryMediaStorageCleanupResult,
  EntryMediaStorageObject,
  EntryMediaUploadInput,
} from "@/types/entryMedia";

const MEDIA_TABLE = "entry_media_assets";
const IMAGE_BUCKET = "entry-images";
const AUDIO_BUCKET = "entry-audio";
const STORAGE_BUCKETS = [IMAGE_BUCKET, AUDIO_BUCKET] as const;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_BULK_METADATA_ASSETS = 50;

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/ogg",
  "audio/webm",
]);

type EntryMediaRow = {
  id: string;
  entry_id: string | number;
  kind: string;
  bucket: string;
  object_path: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | string | null;
  public_url: string | null;
  alt_text: string | null;
  attribution: string | null;
  source_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type StorageListItem = {
  id?: string | null;
  name?: string | null;
  metadata?: Record<string, unknown> | null;
};

const MEDIA_SELECT =
  "id, entry_id, kind, bucket, object_path, filename, mime_type, size_bytes, public_url, alt_text, attribution, source_url, created_at, updated_at";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKind(value: unknown): EntryMediaKind {
  return normalizeText(value).toLowerCase() === "audio" ? "audio" : "image";
}

function normalizeSize(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function mapRow(row: EntryMediaRow): EntryMediaAsset {
  return {
    id: String(row.id),
    entryId: String(row.entry_id),
    kind: normalizeKind(row.kind),
    bucket: normalizeText(row.bucket),
    objectPath: normalizeText(row.object_path),
    filename: normalizeText(row.filename),
    mimeType: normalizeText(row.mime_type),
    sizeBytes: normalizeSize(row.size_bytes),
    publicUrl: normalizeText(row.public_url),
    altText: normalizeText(row.alt_text),
    attribution: normalizeText(row.attribution),
    sourceUrl: normalizeText(row.source_url),
    createdAt: normalizeText(row.created_at),
    updatedAt: normalizeText(row.updated_at),
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = normalizeText(record.message);
    const code = normalizeText(record.code);
    const hint = normalizeText(record.hint);

    return [
      message || fallback,
      code ? `Code: ${code}.` : "",
      hint ? `Hint: ${hint}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return fallback;
}

function bucketForKind(kind: EntryMediaKind) {
  return kind === "audio" ? AUDIO_BUCKET : IMAGE_BUCKET;
}

function sanitizeFilename(filename: string) {
  const normalized = filename
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return normalized || "media-file";
}

function validateFile(kind: EntryMediaKind, file: File) {
  const allowedTypes = kind === "audio" ? AUDIO_MIME_TYPES : IMAGE_MIME_TYPES;
  const maxBytes = kind === "audio" ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES;
  const label = kind === "audio" ? "audio" : "image";

  if (!allowedTypes.has(file.type)) {
    throw new Error(
      kind === "audio"
        ? "Use MP3, WAV, M4A, OGG, or WebM audio."
        : "Use a JPG, PNG, or WebP image.",
    );
  }

  if (file.size <= 0) {
    throw new Error(`The selected ${label} file is empty.`);
  }

  if (file.size > maxBytes) {
    throw new Error(
      `${label === "audio" ? "Audio" : "Image"} files must be ${
        maxBytes / 1024 / 1024
      } MB or smaller.`,
    );
  }
}

function assetMapFromRows(rows: EntryMediaRow[]) {
  return rows.reduce<
    Record<string, Partial<Record<EntryMediaKind, EntryMediaAsset>>>
  >((result, row) => {
    const asset = mapRow(row);
    result[asset.entryId] = {
      ...(result[asset.entryId] ?? {}),
      [asset.kind]: asset,
    };
    return result;
  }, {});
}

function flattenAssetMap(
  assetsByEntryId: Record<
    string,
    Partial<Record<EntryMediaKind, EntryMediaAsset>>
  >,
) {
  return Object.values(assetsByEntryId).flatMap((entryAssets) =>
    [entryAssets.image, entryAssets.audio].filter(
      (asset): asset is EntryMediaAsset => Boolean(asset),
    ),
  );
}

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function listBucketObjectsRecursively(
  bucketClient: any,
  bucket: string,
  path: string,
  depth = 0,
): Promise<EntryMediaStorageObject[]> {
  if (depth > 6) return [];

  const collected: EntryMediaStorageObject[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await bucketClient.list(path, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) throw error;

    const items = (data ?? []) as StorageListItem[];
    for (const item of items) {
      const itemName = normalizeText(item.name);
      if (!itemName || itemName === ".emptyFolderPlaceholder") continue;

      const objectPath = path ? `${path}/${itemName}` : itemName;
      const looksLikeFile = Boolean(item.id) || Boolean(item.metadata);

      if (looksLikeFile) {
        collected.push({
          bucket,
          objectPath,
          filename: itemName,
        });
      } else {
        collected.push(
          ...(await listBucketObjectsRecursively(
            bucketClient,
            bucket,
            objectPath,
            depth + 1,
          )),
        );
      }
    }

    if (items.length < pageSize) break;
    offset += pageSize;
  }

  return collected;
}

export function useEntryMediaAssets() {
  const supabase = useMemo(() => createClient(), []);
  const [assetsByEntryId, setAssetsByEntryId] = useState<
    Record<string, Partial<Record<EntryMediaKind, EntryMediaAsset>>>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [activeOperation, setActiveOperation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) {
        throw new Error(
          "Media management requires an authenticated Studio session.",
        );
      }

      const { data, error: loadError } = await supabase
        .from(MEDIA_TABLE)
        .select(MEDIA_SELECT)
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (loadError) throw loadError;

      setAssetsByEntryId(assetMapFromRows((data ?? []) as EntryMediaRow[]));
    } catch (loadError) {
      setAssetsByEntryId({});
      setError(
        getErrorMessage(
          loadError,
          "Media assets could not be loaded. Run the Alpha 6.0A migration and refresh.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const uploadAsset = useCallback(
    async (input: EntryMediaUploadInput): Promise<EntryMediaAsset> => {
      const entryId = String(input.entryId).trim();
      if (!entryId) throw new Error("Choose an entry before uploading media.");

      validateFile(input.kind, input.file);
      setActiveOperation(`${entryId}:${input.kind}:upload`);
      setError(null);

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;
        if (!user) {
          throw new Error(
            "Media uploads require an authenticated Studio session.",
          );
        }

        const bucket = bucketForKind(input.kind);
        const safeFilename = sanitizeFilename(input.file.name);
        const uniqueToken =
          typeof crypto !== "undefined" &&
          typeof crypto.randomUUID === "function"
            ? crypto.randomUUID().slice(0, 8)
            : Math.random().toString(36).slice(2, 10);
        const objectPath = `${user.id}/${entryId}/${input.kind}/${Date.now()}-${uniqueToken}-${safeFilename}`;
        const existingAsset = assetsByEntryId[entryId]?.[input.kind];

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(objectPath, input.file, {
            cacheControl: "3600",
            contentType: input.file.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(objectPath);

        const payload = {
          user_id: user.id,
          entry_id: entryId,
          kind: input.kind,
          bucket,
          object_path: objectPath,
          filename: input.file.name,
          mime_type: input.file.type,
          size_bytes: input.file.size,
          public_url: publicUrlData.publicUrl,
          alt_text: normalizeText(input.altText),
          attribution: normalizeText(input.attribution),
          source_url: normalizeText(input.sourceUrl),
          updated_at: new Date().toISOString(),
        };

        const { data, error: saveError } = await supabase
          .from(MEDIA_TABLE)
          .upsert(payload, { onConflict: "user_id,entry_id,kind" })
          .select(MEDIA_SELECT)
          .single();

        if (saveError) {
          await supabase.storage.from(bucket).remove([objectPath]);
          throw saveError;
        }

        const mapped = mapRow(data as EntryMediaRow);
        setAssetsByEntryId((current) => ({
          ...current,
          [entryId]: {
            ...(current[entryId] ?? {}),
            [input.kind]: mapped,
          },
        }));

        if (
          existingAsset &&
          existingAsset.objectPath &&
          (existingAsset.bucket !== bucket ||
            existingAsset.objectPath !== objectPath)
        ) {
          const { error: cleanupError } = await supabase.storage
            .from(existingAsset.bucket)
            .remove([existingAsset.objectPath]);

          if (cleanupError) {
            console.warn(
              "The replaced media file could not be removed. Run Storage Audit to clean it up.",
              cleanupError,
            );
          }
        }

        return mapped;
      } catch (uploadError) {
        const message = getErrorMessage(
          uploadError,
          "The media file could not be uploaded.",
        );
        setError(message);
        throw new Error(message);
      } finally {
        setActiveOperation(null);
      }
    },
    [assetsByEntryId, supabase],
  );

  const updateMetadata = useCallback(
    async (
      asset: EntryMediaAsset,
      input: EntryMediaMetadataInput,
    ): Promise<EntryMediaAsset> => {
      setActiveOperation(`${asset.entryId}:${asset.kind}:metadata`);
      setError(null);

      try {
        const { data, error: updateError } = await supabase
          .from(MEDIA_TABLE)
          .update({
            alt_text: normalizeText(input.altText),
            attribution: normalizeText(input.attribution),
            source_url: normalizeText(input.sourceUrl),
            updated_at: new Date().toISOString(),
          })
          .eq("id", asset.id)
          .select(MEDIA_SELECT)
          .single();

        if (updateError) throw updateError;

        const mapped = mapRow(data as EntryMediaRow);
        setAssetsByEntryId((current) => ({
          ...current,
          [mapped.entryId]: {
            ...(current[mapped.entryId] ?? {}),
            [mapped.kind]: mapped,
          },
        }));

        return mapped;
      } catch (metadataError) {
        const message = getErrorMessage(
          metadataError,
          "Media details could not be saved.",
        );
        setError(message);
        throw new Error(message);
      } finally {
        setActiveOperation(null);
      }
    },
    [supabase],
  );

  const updateMetadataBulk = useCallback(
    async (
      input: EntryMediaBulkMetadataInput,
    ): Promise<EntryMediaBulkMetadataResult> => {
      const attribution = normalizeText(input.attribution);
      const sourceUrl = normalizeText(input.sourceUrl);
      const uniqueAssets = Array.from(
        new Map(input.assets.map((asset) => [asset.id, asset])).values(),
      ).slice(0, MAX_BULK_METADATA_ASSETS);

      if (uniqueAssets.length === 0) {
        throw new Error("Select at least one media asset.");
      }
      if (!attribution && !sourceUrl) {
        throw new Error("Enter an attribution or source URL to apply.");
      }

      setActiveOperation("bulk-metadata");
      setError(null);

      try {
        const updatedAssets: EntryMediaAsset[] = [];
        let skipped = 0;

        for (const asset of uniqueAssets) {
          const payload: Record<string, string> = {
            updated_at: new Date().toISOString(),
          };

          if (attribution && (!input.fillBlankOnly || !asset.attribution)) {
            payload.attribution = attribution;
          }
          if (sourceUrl && (!input.fillBlankOnly || !asset.sourceUrl)) {
            payload.source_url = sourceUrl;
          }

          if (Object.keys(payload).length === 1) {
            skipped += 1;
            continue;
          }

          const { data, error: updateError } = await supabase
            .from(MEDIA_TABLE)
            .update(payload)
            .eq("id", asset.id)
            .select(MEDIA_SELECT)
            .single();

          if (updateError) throw updateError;
          updatedAssets.push(mapRow(data as EntryMediaRow));
        }

        if (updatedAssets.length > 0) {
          setAssetsByEntryId((current) => {
            const next = { ...current };
            for (const asset of updatedAssets) {
              next[asset.entryId] = {
                ...(next[asset.entryId] ?? {}),
                [asset.kind]: asset,
              };
            }
            return next;
          });
        }

        return { updated: updatedAssets.length, skipped };
      } catch (bulkError) {
        const message = getErrorMessage(
          bulkError,
          "Bulk media details could not be saved.",
        );
        setError(message);
        throw new Error(message);
      } finally {
        setActiveOperation(null);
      }
    },
    [supabase],
  );

  const removeAsset = useCallback(
    async (asset: EntryMediaAsset): Promise<EntryMediaRemoveResult> => {
      setActiveOperation(`${asset.entryId}:${asset.kind}:remove`);
      setError(null);

      try {
        // Delete the database record first. If Storage cleanup fails, the public
        // app will not point at a missing file; Storage Audit can remove the orphan.
        const { error: deleteError } = await supabase
          .from(MEDIA_TABLE)
          .delete()
          .eq("id", asset.id);

        if (deleteError) throw deleteError;

        setAssetsByEntryId((current) => {
          const next = { ...current };
          const entryAssets = { ...(next[asset.entryId] ?? {}) };
          delete entryAssets[asset.kind];

          if (Object.keys(entryAssets).length === 0) {
            delete next[asset.entryId];
          } else {
            next[asset.entryId] = entryAssets;
          }

          return next;
        });

        const { error: storageError } = await supabase.storage
          .from(asset.bucket)
          .remove([asset.objectPath]);

        if (storageError) {
          return {
            storageCleanupPending: true,
            warning:
              "The media record was removed, but the stored file could not be deleted. Run Storage Audit to clean up the orphaned file.",
          };
        }

        return { storageCleanupPending: false };
      } catch (removeError) {
        const message = getErrorMessage(
          removeError,
          "The media asset could not be removed.",
        );
        setError(message);
        throw new Error(message);
      } finally {
        setActiveOperation(null);
      }
    },
    [supabase],
  );

  const auditStorage = useCallback(async (): Promise<EntryMediaStorageAudit> => {
    setActiveOperation("storage-audit");
    setError(null);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) {
        throw new Error("Storage Audit requires an authenticated Studio session.");
      }

      const { data, error: loadError } = await supabase
        .from(MEDIA_TABLE)
        .select(MEDIA_SELECT)
        .eq("user_id", user.id);

      if (loadError) throw loadError;

      const referencedAssets = ((data ?? []) as EntryMediaRow[]).map(mapRow);
      const storedObjects = (
        await Promise.all(
          STORAGE_BUCKETS.map((bucket) =>
            listBucketObjectsRecursively(
              supabase.storage.from(bucket),
              bucket,
              user.id,
            ),
          ),
        )
      ).flat();

      const referencedKeys = new Set(
        referencedAssets.map(
          (asset) => `${asset.bucket}:${asset.objectPath}`,
        ),
      );
      const storedKeys = new Set(
        storedObjects.map(
          (object) => `${object.bucket}:${object.objectPath}`,
        ),
      );

      return {
        checkedAt: new Date().toISOString(),
        referencedAssets: referencedAssets.length,
        storedObjects: storedObjects.length,
        orphanedObjects: storedObjects.filter(
          (object) =>
            !referencedKeys.has(`${object.bucket}:${object.objectPath}`),
        ),
        missingAssets: referencedAssets.filter(
          (asset) => !storedKeys.has(`${asset.bucket}:${asset.objectPath}`),
        ),
      };
    } catch (auditError) {
      const message = getErrorMessage(
        auditError,
        "Storage Audit could not compare media records and stored files.",
      );
      setError(message);
      throw new Error(message);
    } finally {
      setActiveOperation(null);
    }
  }, [supabase]);

  const cleanupStorageIssues = useCallback(
    async (
      audit: EntryMediaStorageAudit,
      input: EntryMediaStorageCleanupInput,
    ): Promise<EntryMediaStorageCleanupResult> => {
      if (!input.removeOrphanedObjects && !input.removeMissingAssetRows) {
        throw new Error("Choose at least one cleanup action.");
      }

      setActiveOperation("storage-cleanup");
      setError(null);

      try {
        let removedObjects = 0;
        let removedRows = 0;
        const warnings: string[] = [];

        if (input.removeOrphanedObjects && audit.orphanedObjects.length > 0) {
          for (const bucket of STORAGE_BUCKETS) {
            const paths = audit.orphanedObjects
              .filter((object) => object.bucket === bucket)
              .map((object) => object.objectPath);

            for (const pathChunk of chunkValues(paths, 100)) {
              const { error: removeError } = await supabase.storage
                .from(bucket)
                .remove(pathChunk);

              if (removeError) {
                warnings.push(
                  `${bucket}: ${getErrorMessage(
                    removeError,
                    "Some orphaned files could not be removed.",
                  )}`,
                );
              } else {
                removedObjects += pathChunk.length;
              }
            }
          }
        }

        if (input.removeMissingAssetRows && audit.missingAssets.length > 0) {
          const ids = audit.missingAssets.map((asset) => asset.id);
          for (const idChunk of chunkValues(ids, 100)) {
            const { error: deleteError } = await supabase
              .from(MEDIA_TABLE)
              .delete()
              .in("id", idChunk);

            if (deleteError) {
              warnings.push(
                getErrorMessage(
                  deleteError,
                  "Some broken media records could not be removed.",
                ),
              );
            } else {
              removedRows += idChunk.length;
            }
          }
        }

        await refresh();

        return { removedObjects, removedRows, warnings };
      } catch (cleanupError) {
        const message = getErrorMessage(
          cleanupError,
          "Storage cleanup could not be completed.",
        );
        setError(message);
        throw new Error(message);
      } finally {
        setActiveOperation(null);
      }
    },
    [refresh, supabase],
  );

  const assets = useMemo(
    () => flattenAssetMap(assetsByEntryId),
    [assetsByEntryId],
  );

  return {
    assetsByEntryId,
    assets,
    isLoading,
    activeOperation,
    error,
    refresh,
    uploadAsset,
    updateMetadata,
    updateMetadataBulk,
    removeAsset,
    auditStorage,
    cleanupStorageIssues,
  };
}

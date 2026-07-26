"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from "react";
import type { Entry } from "@/types/entry";
import type {
  EntryMediaAsset,
  EntryMediaKind,
  EntryMediaMetadataInput,
} from "@/types/entryMedia";
import { useEntryMediaAssets } from "@/hooks/useEntryMediaAssets";
import { getEntryMediaCoverage } from "@/lib/mediaReadinessRules";
import { MediaBulkWorkflowPanel } from "@/components/media/MediaBulkWorkflowPanel";

type EntryMediaManagerPanelProps = {
  isOpen: boolean;
  entries: Entry[];
  isOnline: boolean;
  initialEntryId?: string | null;
  onClose: () => void;
  onOpenEntry: (entry: Entry) => void;
  onEntryMediaFilenameChange?: (
    entryId: string,
    kind: EntryMediaKind,
    filename: string,
  ) => Promise<void> | void;
  onMediaChanged?: () => Promise<void> | void;
};

type MediaCoverageFilter =
  | "all"
  | "missing-image"
  | "missing-audio"
  | "missing-both"
  | "complete";

type MetadataDraft = {
  altText: string;
  attribution: string;
  sourceUrl: string;
};

const EMPTY_METADATA: MetadataDraft = {
  altText: "",
  attribution: "",
  sourceUrl: "",
};

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function metadataFromAsset(asset: EntryMediaAsset | undefined): MetadataDraft {
  if (!asset) return EMPTY_METADATA;
  return {
    altText: asset.altText,
    attribution: asset.attribution,
    sourceUrl: asset.sourceUrl,
  };
}

function MediaStatusBadge({ complete, label }: { complete: boolean; label: string }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${
        complete
          ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
          : "border-neutral-700 bg-neutral-900 text-neutral-400"
      }`}
    >
      {complete ? "Ready" : "Missing"} · {label}
    </span>
  );
}

export function EntryMediaManagerPanel({
  isOpen,
  entries,
  isOnline,
  initialEntryId,
  onClose,
  onOpenEntry,
  onEntryMediaFilenameChange,
  onMediaChanged,
}: EntryMediaManagerPanelProps) {
  const {
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
  } = useEntryMediaAssets();

  const sortedEntries = useMemo(
    () =>
      [...entries]
        .filter((entry) => entry.status !== "Archived")
        .sort((left, right) => left.word.localeCompare(right.word)),
    [entries],
  );

  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [coverageFilter, setCoverageFilter] = useState<MediaCoverageFilter>("all");
  const [entrySearch, setEntrySearch] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [imageMetadata, setImageMetadata] = useState<MetadataDraft>(EMPTY_METADATA);
  const [audioMetadata, setAudioMetadata] = useState<MetadataDraft>(EMPTY_METADATA);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBulkWorkflowOpen, setIsBulkWorkflowOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const requestedId = initialEntryId ? String(initialEntryId) : "";
    const requestedExists = sortedEntries.some(
      (entry) => String(entry.id) === requestedId,
    );

    setSelectedEntryId((current) => {
      if (requestedExists) return requestedId;
      if (sortedEntries.some((entry) => String(entry.id) === current)) return current;
      return sortedEntries[0] ? String(sortedEntries[0].id) : "";
    });
  }, [initialEntryId, isOpen, sortedEntries]);

  const selectedEntry = useMemo(
    () =>
      sortedEntries.find((entry) => String(entry.id) === selectedEntryId) ?? null,
    [selectedEntryId, sortedEntries],
  );

  const selectedAssets = selectedEntryId ? assetsByEntryId[selectedEntryId] ?? {} : {};
  const imageAsset = selectedAssets.image;
  const audioAsset = selectedAssets.audio;

  useEffect(() => {
    setImageFile(null);
    setAudioFile(null);
    setImageMetadata(metadataFromAsset(imageAsset));
    setAudioMetadata(metadataFromAsset(audioAsset));
    setNotice(null);

    if (imageInputRef.current) imageInputRef.current.value = "";
    if (audioInputRef.current) audioInputRef.current.value = "";
  }, [imageAsset?.id, imageAsset?.updatedAt, audioAsset?.id, audioAsset?.updatedAt, selectedEntryId]);

  const mediaCounts = useMemo(() => {
    let withImage = 0;
    let withAudio = 0;
    let complete = 0;
    let missingBoth = 0;

    for (const entry of sortedEntries) {
      const assets = assetsByEntryId[String(entry.id)] ?? {};
      if (assets.image) withImage += 1;
      if (assets.audio) withAudio += 1;
      if (assets.image && assets.audio) complete += 1;
      if (!assets.image && !assets.audio) missingBoth += 1;
    }

    return {
      withImage,
      withAudio,
      complete,
      missingBoth,
      missingAny: Math.max(0, sortedEntries.length - complete),
    };
  }, [assetsByEntryId, sortedEntries]);

  const filteredEntries = useMemo(() => {
    const query = entrySearch.trim().toLowerCase();

    return sortedEntries.filter((entry) => {
      const coverage = getEntryMediaCoverage(entry.id, assetsByEntryId);
      if (coverageFilter === "missing-image" && coverage.hasImage) return false;
      if (coverageFilter === "missing-audio" && coverage.hasAudio) return false;
      if (
        coverageFilter === "missing-both" &&
        (coverage.hasImage || coverage.hasAudio)
      ) {
        return false;
      }
      if (coverageFilter === "complete" && !coverage.hasBoth) return false;
      if (query && !entry.word.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [assetsByEntryId, coverageFilter, entrySearch, sortedEntries]);

  useEffect(() => {
    if (!isOpen) return;
    if (filteredEntries.length === 0) {
      if (selectedEntryId) setSelectedEntryId("");
      return;
    }
    if (
      filteredEntries.some((entry) => String(entry.id) === selectedEntryId)
    ) {
      return;
    }
    setSelectedEntryId(String(filteredEntries[0].id));
  }, [filteredEntries, isOpen, selectedEntryId]);

  const selectedQueueIndex = filteredEntries.findIndex(
    (entry) => String(entry.id) === selectedEntryId,
  );

  function moveSelection(direction: -1 | 1) {
    if (filteredEntries.length === 0) return;
    const currentIndex = selectedQueueIndex >= 0 ? selectedQueueIndex : 0;
    const nextIndex =
      (currentIndex + direction + filteredEntries.length) % filteredEntries.length;
    setSelectedEntryId(String(filteredEntries[nextIndex].id));
  }

  if (!isOpen) return null;

  async function handleUpload(kind: EntryMediaKind) {
    if (!selectedEntry) return;
    const file = kind === "image" ? imageFile : audioFile;
    const metadata = kind === "image" ? imageMetadata : audioMetadata;

    if (!file) {
      setNotice(`Choose an ${kind} file first.`);
      return;
    }

    try {
      setNotice(null);
      const saved = await uploadAsset({
        entryId: String(selectedEntry.id),
        kind,
        file,
        ...metadata,
      });

      await onEntryMediaFilenameChange?.(
        String(selectedEntry.id),
        kind,
        saved.filename,
      );
      await onMediaChanged?.();

      if (kind === "image") {
        setImageFile(null);
        if (imageInputRef.current) imageInputRef.current.value = "";
      } else {
        setAudioFile(null);
        if (audioInputRef.current) audioInputRef.current.value = "";
      }

      setNotice(`${kind === "image" ? "Image" : "Pronunciation audio"} saved for ${selectedEntry.word}.`);
    } catch (uploadError) {
      setNotice(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    }
  }

  async function handleSaveMetadata(
    asset: EntryMediaAsset,
    metadata: EntryMediaMetadataInput,
  ) {
    try {
      setNotice(null);
      await updateMetadata(asset, metadata);
      await onMediaChanged?.();
      setNotice(`${asset.kind === "image" ? "Image" : "Audio"} details saved.`);
    } catch (metadataError) {
      setNotice(metadataError instanceof Error ? metadataError.message : "Details could not be saved.");
    }
  }

  async function handleRemove(asset: EntryMediaAsset) {
    if (!selectedEntry) return;

    const confirmed = window.confirm(
      `Remove the ${asset.kind === "image" ? "entry image" : "pronunciation audio"} from ${selectedEntry.word}? The stored file will also be deleted.`,
    );
    if (!confirmed) return;

    try {
      setNotice(null);
      const result = await removeAsset(asset);
      await onEntryMediaFilenameChange?.(
        String(selectedEntry.id),
        asset.kind,
        "",
      );
      await onMediaChanged?.();
      setNotice(
        result.storageCleanupPending
          ? result.warning ?? "Media removed. Run Storage Audit to finish file cleanup."
          : `${asset.kind === "image" ? "Image" : "Audio"} removed.`,
      );
    } catch (removeError) {
      setNotice(removeError instanceof Error ? removeError.message : "Media could not be removed.");
    }
  }

  const isBusy = Boolean(activeOperation);

  return (
    <div className="fixed inset-0 z-[110] overflow-y-auto bg-black/85 p-3 backdrop-blur-sm sm:p-6">
      <div className="mx-auto min-h-full max-w-6xl rounded-[28px] border border-neutral-800 bg-[#090909] shadow-2xl">
        <header className="border-b border-neutral-800 p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">
                Phase 6 Media Readiness
              </p>
              <h2 className="mt-2 text-3xl font-black text-white sm:text-4xl">
                Entry Media Manager
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-400">
                Filter the media queue by missing image or audio, then upload one public-facing image and one pronunciation recording per entry. Replacements preserve metadata and delete the old stored file.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIsBulkWorkflowOpen(true)}
                disabled={isLoading}
                className="rounded-xl border border-fuchsia-300/30 bg-fuchsia-300/10 px-4 py-3 text-sm font-black text-fuchsia-100 transition hover:border-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Bulk & cleanup
              </button>
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={isLoading || isBusy || !isOnline}
                className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-black text-white transition hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-black text-white transition hover:border-white"
              >
                Close
              </button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Images", mediaCounts.withImage],
              ["Audio", mediaCounts.withAudio],
              ["Media complete", mediaCounts.complete],
              ["Missing media", mediaCounts.missingAny],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
                  {label}
                </p>
                <p className="mt-2 text-3xl font-black text-white">{value}</p>
              </div>
            ))}
          </div>
        </header>

        <main className="p-5 sm:p-7">
          {!isOnline && (
            <div className="mb-5 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm font-bold text-amber-100">
              Media uploads and removals require an online connection. Existing previews remain available when the browser has cached them.
            </div>
          )}

          {(error || notice) && (
            <div
              className={`mb-5 rounded-2xl border p-4 text-sm font-bold ${
                error
                  ? "border-red-400/30 bg-red-400/10 text-red-100"
                  : "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
              }`}
            >
              {error ?? notice}
            </div>
          )}

          <div className="mb-5 rounded-2xl border border-neutral-800 bg-neutral-950 p-4 sm:p-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap gap-2">
                {([
                  ["all", `All · ${sortedEntries.length}`],
                  ["missing-image", `Missing image · ${Math.max(0, sortedEntries.length - mediaCounts.withImage)}`],
                  ["missing-audio", `Missing audio · ${Math.max(0, sortedEntries.length - mediaCounts.withAudio)}`],
                  ["missing-both", `Missing both · ${mediaCounts.missingBoth}`],
                  ["complete", `Complete · ${mediaCounts.complete}`],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCoverageFilter(value)}
                    className={`rounded-xl px-3 py-2 text-xs font-black transition ${
                      coverageFilter === value
                        ? "bg-cyan-200 text-black"
                        : "border border-neutral-700 bg-black text-neutral-300 hover:border-cyan-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                value={entrySearch}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setEntrySearch(event.target.value)
                }
                placeholder="Search media queue..."
                className="min-w-0 rounded-xl border border-neutral-700 bg-black px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-cyan-300 sm:min-w-72"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500">
                Select entry
              </label>
              <span className="text-xs font-bold text-neutral-500">
                {filteredEntries.length === 0
                  ? "0 matches"
                  : `${Math.max(1, selectedQueueIndex + 1)} of ${filteredEntries.length}`}
              </span>
            </div>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <select
                value={selectedEntryId}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setSelectedEntryId(event.target.value)
                }
                className="min-w-0 flex-1 rounded-xl border border-neutral-700 bg-black px-4 py-3 font-bold text-white outline-none transition focus:border-cyan-300"
              >
                {filteredEntries.length === 0 && <option value="">No entries match this filter</option>}
                {filteredEntries.map((entry) => {
                  const assets = assetsByEntryId[String(entry.id)] ?? {};
                  const count = Number(Boolean(assets.image)) + Number(Boolean(assets.audio));
                  return (
                    <option key={entry.id} value={String(entry.id)}>
                      {entry.word} · {count}/2 media
                    </option>
                  );
                })}
              </select>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => moveSelection(-1)}
                  disabled={filteredEntries.length < 2}
                  className="rounded-xl border border-neutral-700 px-3 py-3 text-sm font-black text-white transition hover:border-cyan-300 disabled:opacity-40"
                  aria-label="Previous filtered entry"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => moveSelection(1)}
                  disabled={filteredEntries.length < 2}
                  className="rounded-xl border border-neutral-700 px-3 py-3 text-sm font-black text-white transition hover:border-cyan-300 disabled:opacity-40"
                  aria-label="Next filtered entry"
                >
                  →
                </button>
              </div>

              {selectedEntry && (
                <button
                  type="button"
                  onClick={() => onOpenEntry(selectedEntry)}
                  className="rounded-xl border border-neutral-700 px-4 py-3 text-sm font-black text-white transition hover:border-yellow-300 hover:text-yellow-200"
                >
                  Open entry
                </button>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="py-20 text-center font-bold text-neutral-500">Loading media library…</div>
          ) : selectedEntry ? (
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <MediaCard
                kind="image"
                entry={selectedEntry}
                asset={imageAsset}
                file={imageFile}
                metadata={imageMetadata}
                inputRef={imageInputRef}
                isOnline={isOnline}
                isBusy={isBusy}
                operation={activeOperation}
                onFileChange={setImageFile}
                onMetadataChange={setImageMetadata}
                onUpload={() => void handleUpload("image")}
                onSaveMetadata={() =>
                  imageAsset && void handleSaveMetadata(imageAsset, imageMetadata)
                }
                onRemove={() => imageAsset && void handleRemove(imageAsset)}
              />

              <MediaCard
                kind="audio"
                entry={selectedEntry}
                asset={audioAsset}
                file={audioFile}
                metadata={audioMetadata}
                inputRef={audioInputRef}
                isOnline={isOnline}
                isBusy={isBusy}
                operation={activeOperation}
                onFileChange={setAudioFile}
                onMetadataChange={setAudioMetadata}
                onUpload={() => void handleUpload("audio")}
                onSaveMetadata={() =>
                  audioAsset && void handleSaveMetadata(audioAsset, audioMetadata)
                }
                onRemove={() => audioAsset && void handleRemove(audioAsset)}
              />
            </div>
          ) : (
            <div className="py-20 text-center font-bold text-neutral-500">Create an entry before adding media.</div>
          )}
        </main>
      </div>

      <MediaBulkWorkflowPanel
        isOpen={isBulkWorkflowOpen}
        entries={sortedEntries}
        assets={assets}
        isOnline={isOnline}
        isLoading={isLoading}
        activeOperation={activeOperation}
        onClose={() => setIsBulkWorkflowOpen(false)}
        onRefresh={refresh}
        onBulkUpdateMetadata={updateMetadataBulk}
        onAuditStorage={auditStorage}
        onCleanupStorage={cleanupStorageIssues}
        onMediaChanged={onMediaChanged}
      />
    </div>
  );
}

type MediaCardProps = {
  kind: EntryMediaKind;
  entry: Entry;
  asset?: EntryMediaAsset;
  file: File | null;
  metadata: MetadataDraft;
  inputRef: RefObject<HTMLInputElement | null>;
  isOnline: boolean;
  isBusy: boolean;
  operation: string | null;
  onFileChange: (file: File | null) => void;
  onMetadataChange: (metadata: MetadataDraft) => void;
  onUpload: () => void;
  onSaveMetadata: () => void;
  onRemove: () => void;
};

function MediaCard({
  kind,
  entry,
  asset,
  file,
  metadata,
  inputRef,
  isOnline,
  isBusy,
  operation,
  onFileChange,
  onMetadataChange,
  onUpload,
  onSaveMetadata,
  onRemove,
}: MediaCardProps) {
  const isImage = kind === "image";
  const operationPrefix = `${entry.id}:${kind}:`;
  const isThisCardBusy = Boolean(operation?.startsWith(operationPrefix));

  return (
    <section className="overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-950">
      <div className="flex items-start justify-between gap-3 border-b border-neutral-800 p-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500">
            {isImage ? "Entry image" : "Pronunciation audio"}
          </p>
          <h3 className="mt-1 text-xl font-black text-white">
            {isImage ? "Visual" : "Voice"} · {entry.word}
          </h3>
        </div>
        <MediaStatusBadge complete={Boolean(asset)} label={isImage ? "image" : "audio"} />
      </div>

      <div className="space-y-5 p-5">
        <div className="flex min-h-56 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-neutral-700 bg-black p-3">
          {asset ? (
            isImage ? (
              <img
                src={asset.publicUrl}
                alt={asset.altText || `${entry.word} entry image`}
                className="max-h-80 w-full rounded-xl object-contain"
              />
            ) : (
              <div className="w-full">
                <p className="mb-4 text-center text-sm font-bold text-neutral-400">
                  {asset.filename}
                </p>
                <audio controls preload="metadata" src={asset.publicUrl} className="w-full" />
              </div>
            )
          ) : (
            <div className="text-center">
              <p className="text-4xl">{isImage ? "🖼️" : "🎙️"}</p>
              <p className="mt-3 font-black text-white">
                No {isImage ? "image" : "pronunciation recording"} uploaded
              </p>
              <p className="mt-1 text-sm text-neutral-500">
                {isImage ? "JPG, PNG, or WebP · max 8 MB" : "MP3, WAV, M4A, OGG, or WebM · max 20 MB"}
              </p>
            </div>
          )}
        </div>

        {asset && (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border border-neutral-800 bg-black p-3">
              <p className="font-black uppercase tracking-[0.14em] text-neutral-600">File</p>
              <p className="mt-1 truncate font-bold text-neutral-300" title={asset.filename}>
                {asset.filename}
              </p>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-black p-3">
              <p className="font-black uppercase tracking-[0.14em] text-neutral-600">Size</p>
              <p className="mt-1 font-bold text-neutral-300">{formatBytes(asset.sizeBytes)}</p>
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={isImage ? "image/jpeg,image/png,image/webp" : "audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/ogg,audio/webm"}
          disabled={!isOnline || isBusy}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onFileChange(event.target.files?.[0] ?? null)
          }
          className="block w-full rounded-xl border border-neutral-700 bg-black px-3 py-3 text-sm font-bold text-neutral-300 file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-300 file:px-3 file:py-2 file:font-black file:text-black disabled:opacity-50"
        />

        {file && (
          <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3 text-sm text-cyan-100">
            Ready to upload: <span className="font-black">{file.name}</span> · {formatBytes(file.size)}
          </div>
        )}

        {isImage && (
          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">Alt text</span>
            <input
              value={metadata.altText}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                onMetadataChange({ ...metadata, altText: event.target.value })
              }
              placeholder={`Describe the image for ${entry.word}`}
              className="mt-2 w-full rounded-xl border border-neutral-700 bg-black px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
            />
          </label>
        )}

        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">Attribution / creator</span>
          <input
            value={metadata.attribution}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onMetadataChange({ ...metadata, attribution: event.target.value })
            }
            placeholder={isImage ? "Photographer, artist, or YERRR Studio" : "Speaker or recording credit"}
            className="mt-2 w-full rounded-xl border border-neutral-700 bg-black px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
          />
        </label>

        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">Source URL</span>
          <input
            value={metadata.sourceUrl}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onMetadataChange({ ...metadata, sourceUrl: event.target.value })
            }
            placeholder="https://…"
            className="mt-2 w-full rounded-xl border border-neutral-700 bg-black px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onUpload}
            disabled={!file || !isOnline || isBusy}
            className="rounded-xl bg-cyan-300 px-4 py-3 text-sm font-black text-black transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isThisCardBusy ? "Working…" : asset ? `Replace ${kind}` : `Upload ${kind}`}
          </button>

          {asset && (
            <>
              <button
                type="button"
                onClick={onSaveMetadata}
                disabled={!isOnline || isBusy}
                className="rounded-xl border border-neutral-700 px-4 py-3 text-sm font-black text-white transition hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Save details
              </button>
              <button
                type="button"
                onClick={onRemove}
                disabled={!isOnline || isBusy}
                className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-black text-red-100 transition hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Remove
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

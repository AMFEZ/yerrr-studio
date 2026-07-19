"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { syncEntryCloudConcepts } from "@/lib/syncEntryCloudConcepts";
import {
  getPendingEntryUpdates,
  loadEntrySnapshot,
  mergePendingEntryUpdates,
  OFFLINE_QUEUE_CHANGED_EVENT,
  queueEntryUpdate,
  recordEntrySyncFailure,
  removePendingEntryUpdate,
  saveEntrySnapshot,
} from "@/lib/offlineEntryQueue";
import type {
  AiAddedStatus,
  EditorialStatus,
  Entry,
  EntryStatus,
  Lifecycle,
  Visibility,
} from "@/types/entry";
import {
  aiAddedStatusOptions,
  editorialStatusOptions,
  entryStatusOptions,
  lifecycleOptions,
  visibilityOptions,
} from "@/types/entry";

type EntryRow = {
  id: string;
  word: string;
  type: string | null;
  slug: string | null;
  pronunciation: string | null;
  part_of_speech: string | null;
  alternate_spellings: string | null;
  status: string | null;
  lifecycle: string | null;
  visibility: string | null;
  featured: boolean | null;
  ai_added_status: string | null;
  audio_filename: string | null;
  illustration_filename: string | null;
  illustration_notes: string | null;
  notes: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  deleted_previous_status: string | null;
};

type MeaningRow = {
  id: string;
  entry_id: string;
  meaning_order: number;
  title: string | null;
  definition: string | null;
  example: string | null;
  plain_english: string | null;
  category: string | null;
  tone: string | null;
  concepts_text: string | null;
  usage_frequency: string | null;
  cultural_context: string | null;
  editorial_status: string | null;
  ai_added_status: string | null;
  verified: boolean | null;
  source: string | null;
};

function normalizeEntryStatus(status: string | null): EntryStatus {
  if ((entryStatusOptions as readonly string[]).includes(status ?? "")) {
    return status as EntryStatus;
  }

  return "Draft";
}

function normalizeDeletedPreviousStatus(
  status: string | null
): EntryStatus | "" {
  if ((entryStatusOptions as readonly string[]).includes(status ?? "")) {
    return status as EntryStatus;
  }

  return "";
}

function normalizeEditorialStatus(status: string | null): EditorialStatus {
  if ((editorialStatusOptions as readonly string[]).includes(status ?? "")) {
    return status as EditorialStatus;
  }

  return "Needs Review";
}

function normalizeLifecycle(lifecycle: string | null): Lifecycle {
  if ((lifecycleOptions as readonly string[]).includes(lifecycle ?? "")) {
    return lifecycle as Lifecycle;
  }

  return "Current";
}

function normalizeVisibility(visibility: string | null): Visibility {
  if ((visibilityOptions as readonly string[]).includes(visibility ?? "")) {
    return visibility as Visibility;
  }

  return "Private";
}

function normalizeAiAddedStatus(status: string | null): AiAddedStatus {
  if ((aiAddedStatusOptions as readonly string[]).includes(status ?? "")) {
    return status as AiAddedStatus;
  }

  return "No";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function entryMatchesSearch(entry: Entry, search: string) {
  const query = search.toLowerCase();

  return (
    entry.word.toLowerCase().includes(query) ||
    entry.type.toLowerCase().includes(query) ||
    entry.slug.toLowerCase().includes(query) ||
    entry.pronunciation.toLowerCase().includes(query) ||
    entry.partOfSpeech.toLowerCase().includes(query) ||
    entry.alternateSpellings.toLowerCase().includes(query) ||
    entry.status.toLowerCase().includes(query) ||
    entry.lifecycle.toLowerCase().includes(query) ||
    entry.visibility.toLowerCase().includes(query) ||
    entry.audioFilename.toLowerCase().includes(query) ||
    entry.illustrationFilename.toLowerCase().includes(query) ||
    entry.illustrationNotes.toLowerCase().includes(query) ||
    entry.notes.toLowerCase().includes(query) ||
    entry.meanings.some(
      (meaning) =>
        meaning.title.toLowerCase().includes(query) ||
        meaning.definition.toLowerCase().includes(query) ||
        meaning.example.toLowerCase().includes(query) ||
        meaning.category.toLowerCase().includes(query) ||
        meaning.tone.toLowerCase().includes(query) ||
        meaning.conceptsText.toLowerCase().includes(query) ||
        meaning.usageFrequency.toLowerCase().includes(query) ||
        meaning.culturalContext.toLowerCase().includes(query) ||
        meaning.editorialStatus.toLowerCase().includes(query) ||
        meaning.source.toLowerCase().includes(query)
    )
  );
}

function isEntryInReviewQueue(entry: Entry) {
  if (entry.status === "Needs Review") return true;
  if (entry.meanings.length === 0) return true;

  return entry.meanings.some((meaning) => {
    return (
      meaning.editorialStatus === "Needs Review" ||
      !meaning.title.trim() ||
      !meaning.definition.trim() ||
      !meaning.example.trim() ||
      !meaning.category.trim() ||
      !meaning.tone.trim() ||
      !meaning.usageFrequency.trim()
    );
  });
}

function getErrorMessage(
  error: unknown,
  fallback = "Unable to save the entry.",
) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error
  ) {
    return String(
      (
        error as {
          message?: unknown;
        }
      ).message ?? fallback,
    );
  }

  return fallback;
}

function toError(
  error: unknown,
  fallback: string,
) {
  return error instanceof Error
    ? error
    : new Error(
        getErrorMessage(error, fallback),
      );
}

function isNetworkError(error: unknown) {
  if (
    typeof navigator !== "undefined" &&
    !navigator.onLine
  ) {
    return true;
  }

  const message = getErrorMessage(
    error,
    "",
  ).toLowerCase();

  return [
    "failed to fetch",
    "fetch failed",
    "network",
    "load failed",
    "offline",
    "connection",
    "timeout",
    "timed out",
  ].some((term) =>
    message.includes(term),
  );
}

export function useEntries() {
  const supabase = useMemo(
    () => createClient(),
    [],
  );

  const [allEntries, setAllEntries] =
    useState<Entry[]>([]);

  const [search, setSearch] =
    useState("");

  const [isLoading, setIsLoading] =
    useState(true);

  const [isOnline, setIsOnline] =
    useState(() => {
      if (
        typeof navigator === "undefined"
      ) {
        return true;
      }

      return navigator.onLine;
    });

  const [
    pendingSyncCount,
    setPendingSyncCount,
  ] = useState(0);

  const [
    isSyncingOffline,
    setIsSyncingOffline,
  ] = useState(false);

  const [
    offlineSyncError,
    setOfflineSyncError,
  ] = useState("");

  const syncInProgressRef =
    useRef(false);

  const refreshOfflineQueueState =
    useCallback(async () => {
      const pending =
        await getPendingEntryUpdates();

      setPendingSyncCount(
        pending.length,
      );

      return pending;
    }, []);

  const saveEntryToSupabase =
    useCallback(
      async (
        updatedEntry: Entry,
      ) => {
        const savedAt =
          new Date().toISOString();

        const {
          error: entryError,
        } = await supabase
          .from("entries")
          .update({
            word: updatedEntry.word,
            type: updatedEntry.type,
            slug:
              updatedEntry.slug.trim() ||
              slugify(
                updatedEntry.word,
              ),
            pronunciation:
              updatedEntry.pronunciation,
            part_of_speech:
              updatedEntry.partOfSpeech,
            alternate_spellings:
              updatedEntry.alternateSpellings,
            status: updatedEntry.status,
            lifecycle:
              updatedEntry.lifecycle,
            visibility:
              updatedEntry.visibility,
            featured:
              updatedEntry.featured,
            ai_added_status:
              updatedEntry.aiAddedStatus,
            audio_filename:
              updatedEntry.audioFilename,
            illustration_filename:
              updatedEntry.illustrationFilename,
            illustration_notes:
              updatedEntry.illustrationNotes,
            notes: updatedEntry.notes,
            updated_at: savedAt,
          })
          .eq(
            "id",
            updatedEntry.id,
          );

        if (entryError) {
          throw toError(
            entryError,
            "Unable to save the entry.",
          );
        }

        const {
          data: existingMeanings,
          error:
            existingMeaningError,
        } = await supabase
          .from("meanings")
          .select("id")
          .eq(
            "entry_id",
            updatedEntry.id,
          );

        if (existingMeaningError) {
          throw toError(
            existingMeaningError,
            "Unable to load the entry meanings.",
          );
        }

        const keptMeaningIds =
          updatedEntry.meanings
            .filter(
              (meaning) =>
                !meaning.id.startsWith(
                  "temp-",
                ),
            )
            .map(
              (meaning) =>
                meaning.id,
            );

        const meaningIdsToDelete = (
          existingMeanings ?? []
        )
          .map(
            (meaning) =>
              meaning.id,
          )
          .filter(
            (id) =>
              !keptMeaningIds.includes(
                id,
              ),
          );

        if (
          meaningIdsToDelete.length > 0
        ) {
          const {
            error:
              deleteMeaningsError,
          } = await supabase
            .from("meanings")
            .delete()
            .in(
              "id",
              meaningIdsToDelete,
            );

          if (
            deleteMeaningsError
          ) {
            throw toError(
              deleteMeaningsError,
              "Unable to remove an old meaning.",
            );
          }
        }

        for (
          let index = 0;
          index <
          updatedEntry.meanings.length;
          index += 1
        ) {
          const meaning =
            updatedEntry.meanings[index];

          const meaningPayload = {
            meaning_order: index + 1,
            title: meaning.title,
            definition:
              meaning.definition,
            example: meaning.example,
            plain_english:
              meaning.plainEnglish,
            category:
              meaning.category,
            tone: meaning.tone,
            concepts_text:
              meaning.conceptsText,
            usage_frequency:
              meaning.usageFrequency,
            cultural_context:
              meaning.culturalContext,
            editorial_status:
              meaning.editorialStatus,
            ai_added_status:
              meaning.aiAddedStatus,
            verified:
              meaning.verified,
            source: meaning.source,
            updated_at: savedAt,
          };

          if (
            meaning.id.startsWith(
              "temp-",
            )
          ) {
            const { error } =
              await supabase
                .from("meanings")
                .insert({
                  entry_id:
                    updatedEntry.id,
                  ...meaningPayload,
                });

            if (error) {
              throw toError(
                error,
                "Unable to create a new meaning.",
              );
            }
          } else {
            const { error } =
              await supabase
                .from("meanings")
                .update(
                  meaningPayload,
                )
                .eq(
                  "id",
                  meaning.id,
                );

            if (error) {
              throw toError(
                error,
                "Unable to save a meaning.",
              );
            }
          }
        }

        await syncEntryCloudConcepts(
          supabase,
          updatedEntry,
        );
      },
      [supabase],
    );

  const loadEntries = useCallback(
    async () => {
      setIsLoading(true);

      try {
        const {
          data: { session },
          error: sessionError,
        } =
          await supabase.auth.getSession();

        if (
          sessionError ||
          !session?.user
        ) {
          throw (
            sessionError ??
            new Error(
              "No active Studio session was found.",
            )
          );
        }

        const {
          data: entryRows,
          error: entryError,
        } = await supabase
          .from("entries")
          .select(
            `
            id,
            word,
            type,
            slug,
            pronunciation,
            part_of_speech,
            alternate_spellings,
            status,
            lifecycle,
            visibility,
            featured,
            ai_added_status,
            audio_filename,
            illustration_filename,
            illustration_notes,
            notes,
            updated_at,
            deleted_at,
            deleted_previous_status
          `,
          )
          .eq(
            "user_id",
            session.user.id,
          )
          .order("created_at", {
            ascending: false,
          });

        if (entryError) {
          throw toError(
            entryError,
            "Unable to load entries.",
          );
        }

        const entryList =
          (entryRows ??
            []) as EntryRow[];

        const entryIds =
          entryList.map(
            (entry) =>
              entry.id,
          );

        let meaningList:
          MeaningRow[] = [];

        if (
          entryIds.length > 0
        ) {
          const {
            data: meaningRows,
            error: meaningError,
          } = await supabase
            .from("meanings")
            .select(
              `
              id,
              entry_id,
              meaning_order,
              title,
              definition,
              example,
              plain_english,
              category,
              tone,
              concepts_text,
              usage_frequency,
              cultural_context,
              editorial_status,
              ai_added_status,
              verified,
              source
            `,
            )
            .in(
              "entry_id",
              entryIds,
            )
            .order(
              "meaning_order",
              {
                ascending: true,
              },
            );

          if (meaningError) {
            throw toError(
              meaningError,
              "Unable to load entry meanings.",
            );
          }

          meaningList =
            (meaningRows ??
              []) as MeaningRow[];
        }

        const mappedEntries:
          Entry[] = entryList.map(
          (entry) => ({
            id: entry.id,
            word: entry.word,
            type:
              entry.type ??
              "Word",
            slug:
              entry.slug ??
              slugify(
                entry.word,
              ),
            pronunciation:
              entry.pronunciation ??
              "",
            partOfSpeech:
              entry.part_of_speech ??
              "",
            alternateSpellings:
              entry.alternate_spellings ??
              "",
            status:
              normalizeEntryStatus(
                entry.status,
              ),
            lifecycle:
              normalizeLifecycle(
                entry.lifecycle,
              ),
            visibility:
              normalizeVisibility(
                entry.visibility,
              ),
            featured: Boolean(
              entry.featured,
            ),
            aiAddedStatus:
              normalizeAiAddedStatus(
                entry.ai_added_status,
              ),
            audioFilename:
              entry.audio_filename ??
              "",
            illustrationFilename:
              entry.illustration_filename ??
              "",
            illustrationNotes:
              entry.illustration_notes ??
              "",
            notes:
              entry.notes ?? "",
            updatedAt:
              entry.updated_at ?? "",
            deletedAt:
              entry.deleted_at ?? "",
            deletedPreviousStatus:
              normalizeDeletedPreviousStatus(
                entry.deleted_previous_status,
              ),
            meanings:
              meaningList
                .filter(
                  (meaning) =>
                    meaning.entry_id ===
                    entry.id,
                )
                .map(
                  (meaning) => ({
                    id: meaning.id,
                    title:
                      meaning.title ??
                      "",
                    definition:
                      meaning.definition ??
                      "",
                    example:
                      meaning.example ??
                      "",
                    plainEnglish:
                      meaning.plain_english ??
                      "",
                    category:
                      meaning.category ??
                      "",
                    tone:
                      meaning.tone ??
                      "",
                    conceptsText:
                      meaning.concepts_text ??
                      "",
                    usageFrequency:
                      meaning.usage_frequency ??
                      "",
                    culturalContext:
                      meaning.cultural_context ??
                      "",
                    editorialStatus:
                      normalizeEditorialStatus(
                        meaning.editorial_status,
                      ),
                    aiAddedStatus:
                      normalizeAiAddedStatus(
                        meaning.ai_added_status,
                      ),
                    verified:
                      Boolean(
                        meaning.verified,
                      ),
                    source:
                      meaning.source ??
                      "Original",
                  }),
                ),
          }),
        );

        const pending =
          await getPendingEntryUpdates();

        const mergedEntries =
          mergePendingEntryUpdates(
            mappedEntries,
            pending,
          );

        setAllEntries(
          mergedEntries,
        );

        await saveEntrySnapshot(
          mergedEntries,
        );

        setOfflineSyncError("");
      } catch (error) {
        if (
          isNetworkError(error)
        ) {
          const [
            cachedEntries,
            pending,
          ] = await Promise.all([
            loadEntrySnapshot(),
            getPendingEntryUpdates(),
          ]);

          setAllEntries(
            mergePendingEntryUpdates(
              cachedEntries,
              pending,
            ),
          );

          setIsOnline(
            typeof navigator ===
              "undefined"
              ? false
              : navigator.onLine,
          );

          setOfflineSyncError(
            "Studio could not reach Supabase. Cached entries and local edits are still available.",
          );
        } else {
          setAllEntries([]);
          setOfflineSyncError(
            getErrorMessage(
              error,
              "Unable to load entries.",
            ),
          );
        }
      } finally {
        setIsLoading(false);
        await refreshOfflineQueueState();
      }
    },
    [
      refreshOfflineQueueState,
      supabase,
    ],
  );

  const syncPendingChanges =
    useCallback(async () => {
      if (
        syncInProgressRef.current ||
        typeof navigator ===
          "undefined" ||
        !navigator.onLine
      ) {
        return;
      }

      syncInProgressRef.current = true;
      setIsSyncingOffline(true);
      setOfflineSyncError("");

      let syncedAny = false;

      try {
        const pending =
          await getPendingEntryUpdates();

        for (
          const record of pending
        ) {
          try {
            await saveEntryToSupabase(
              record.entry,
            );

            await removePendingEntryUpdate(
              record.entryId,
            );

            syncedAny = true;
          } catch (error) {
            const message =
              getErrorMessage(
                error,
                "Unable to sync a saved offline entry.",
              );

            await recordEntrySyncFailure(
              record.entryId,
              message,
            );

            setOfflineSyncError(
              message,
            );

            if (
              isNetworkError(error)
            ) {
              setIsOnline(
                navigator.onLine,
              );

              break;
            }
          }
        }

        await refreshOfflineQueueState();

        if (syncedAny) {
          await loadEntries();
        }
      } finally {
        syncInProgressRef.current = false;
        setIsSyncingOffline(false);
      }
    }, [
      loadEntries,
      refreshOfflineQueueState,
      saveEntryToSupabase,
    ]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      setOfflineSyncError("");
      void syncPendingChanges();
    }

    function handleOffline() {
      setIsOnline(false);
    }

    function handleQueueChanged() {
      void refreshOfflineQueueState();
    }

    window.addEventListener(
      "online",
      handleOnline,
    );

    window.addEventListener(
      "offline",
      handleOffline,
    );

    window.addEventListener(
      OFFLINE_QUEUE_CHANGED_EVENT,
      handleQueueChanged,
    );

    setIsOnline(
      navigator.onLine,
    );

    void refreshOfflineQueueState().then(
      () => {
        if (navigator.onLine) {
          void syncPendingChanges();
        }
      },
    );

    return () => {
      window.removeEventListener(
        "online",
        handleOnline,
      );

      window.removeEventListener(
        "offline",
        handleOffline,
      );

      window.removeEventListener(
        OFFLINE_QUEUE_CHANGED_EVENT,
        handleQueueChanged,
      );
    };
  }, [
    refreshOfflineQueueState,
    syncPendingChanges,
  ]);

  const entries = useMemo(() => {
    return allEntries.filter((entry) => !entry.deletedAt);
  }, [allEntries]);

  const trashEntries = useMemo(() => {
    return allEntries.filter((entry) => entry.deletedAt);
  }, [allEntries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => entryMatchesSearch(entry, search));
  }, [entries, search]);

  const filteredTrashEntries = useMemo(() => {
    return trashEntries.filter((entry) => entryMatchesSearch(entry, search));
  }, [trashEntries, search]);

  const reviewQueueEntries = useMemo(() => {
    return entries.filter(isEntryInReviewQueue);
  }, [entries]);

  const filteredReviewQueueEntries = useMemo(() => {
    return filteredEntries.filter(isEntryInReviewQueue);
  }, [filteredEntries]);

  const draftCount = entries.filter((entry) => entry.status === "Draft").length;

  const needsReviewStatusCount = entries.filter(
    (entry) => entry.status === "Needs Review"
  ).length;

  const reviewQueueCount = reviewQueueEntries.length;

  const verifiedCount = entries.filter(
    (entry) => entry.status === "Verified" || entry.status === "Published"
  ).length;

  const archivedCount = entries.filter(
    (entry) => entry.status === "Archived"
  ).length;

  const publishedCount = entries.filter(
    (entry) => entry.status === "Published"
  ).length;

  const trashCount = trashEntries.length;

  const addEntry = useCallback(
    async function addEntry(word: string, type: string) {
      if (!word.trim()) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const cleanWord = word.trim();

      const { data: entry, error: entryError } = await supabase
        .from("entries")
        .insert({
          user_id: user.id,
          word: cleanWord,
          type,
          slug: slugify(cleanWord),
          pronunciation: "",
          part_of_speech: "",
          alternate_spellings: "",
          status: "Draft",
          lifecycle: "Current",
          visibility: "Private",
          featured: false,
          ai_added_status: "No",
          audio_filename: "",
          illustration_filename: "",
          illustration_notes: "",
          notes: "",
          deleted_at: null,
          deleted_previous_status: "",
        })
        .select("id")
        .single();

      if (entryError) {
        alert(entryError.message);
        return;
      }

      const { error: meaningError } = await supabase.from("meanings").insert({
        entry_id: entry.id,
        meaning_order: 1,
        title: "General Meaning",
        definition: "",
        example: "",
        plain_english: "",
        category: "",
        tone: "",
        concepts_text: "",
        usage_frequency: "",
        cultural_context: "",
        editorial_status: "Draft",
        ai_added_status: "No",
        verified: false,
        source: "Original",
      });

      if (meaningError) {
        alert(meaningError.message);
        return;
      }

      await loadEntries();
    },
    [loadEntries, supabase]
  );

  const updateEntry = useCallback(
    async function updateEntry(
      updatedEntry: Entry,
    ) {
      setAllEntries(
        (currentEntries) => {
          const nextEntries =
            currentEntries.map(
              (entry) =>
                String(entry.id) ===
                String(
                  updatedEntry.id,
                )
                  ? updatedEntry
                  : entry,
            );

          void saveEntrySnapshot(
            nextEntries,
          );

          return nextEntries;
        },
      );

      if (
        typeof navigator !==
          "undefined" &&
        !navigator.onLine
      ) {
        await queueEntryUpdate(
          updatedEntry,
        );

        setIsOnline(false);
        setOfflineSyncError(
          "",
        );

        await refreshOfflineQueueState();
        return "queued" as const;
      }

      try {
        await saveEntryToSupabase(
          updatedEntry,
        );

        await removePendingEntryUpdate(
          String(updatedEntry.id),
        );

        setIsOnline(true);
        setOfflineSyncError("");

        await refreshOfflineQueueState();
        await loadEntries();

        return "synced" as const;
      } catch (error) {
        if (
          isNetworkError(error)
        ) {
          await queueEntryUpdate(
            updatedEntry,
          );

          setIsOnline(
            typeof navigator ===
              "undefined"
              ? false
              : navigator.onLine,
          );

          setOfflineSyncError(
            "Connection lost. This edit was saved locally and will sync automatically.",
          );

          await refreshOfflineQueueState();
          return "queued" as const;
        }

        throw toError(
          error,
          "Unable to save the entry.",
        );
      }
    },
    [
      loadEntries,
      refreshOfflineQueueState,
      saveEntryToSupabase,
    ],
  );

  const updateStatus = useCallback(
    async function updateStatus(id: string, status: EntryStatus) {
      const { error } = await supabase
        .from("entries")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) {
        alert(error.message);
        return;
      }

      await loadEntries();
    },
    [loadEntries, supabase]
  );

  const updateEntriesStatus = useCallback(
    async function updateEntriesStatus(ids: string[], status: EntryStatus) {
      if (ids.length === 0) return;

      const { error } = await supabase
        .from("entries")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .in("id", ids);

      if (error) {
        alert(error.message);
        return;
      }

      await loadEntries();
    },
    [loadEntries, supabase]
  );

  const deleteEntry = useCallback(
    async function deleteEntry(id: string) {
      const confirmed = window.confirm(
        "Move this entry to Trash? You can restore it later."
      );

      if (!confirmed) return;

      const { data: entry, error: fetchError } = await supabase
        .from("entries")
        .select("status")
        .eq("id", id)
        .single();

      if (fetchError) {
        alert(fetchError.message);
        return;
      }

      const previousStatus = normalizeEntryStatus(entry.status);

      const { error } = await supabase
        .from("entries")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_previous_status: previousStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) {
        alert(error.message);
        return;
      }

      await loadEntries();
    },
    [loadEntries, supabase]
  );

  const deleteEntries = useCallback(
    async function deleteEntries(ids: string[]) {
      if (ids.length === 0) return;

      const { data: entriesToDelete, error: fetchError } = await supabase
        .from("entries")
        .select("id, status")
        .in("id", ids);

      if (fetchError) {
        alert(fetchError.message);
        return;
      }

      const groupedByStatus = new Map<EntryStatus, string[]>();

      (entriesToDelete ?? []).forEach((entry) => {
        const previousStatus = normalizeEntryStatus(entry.status);
        const currentIds = groupedByStatus.get(previousStatus) ?? [];
        groupedByStatus.set(previousStatus, [...currentIds, entry.id]);
      });

      for (const [previousStatus, groupedIds] of groupedByStatus.entries()) {
        const { error } = await supabase
          .from("entries")
          .update({
            deleted_at: new Date().toISOString(),
            deleted_previous_status: previousStatus,
            updated_at: new Date().toISOString(),
          })
          .in("id", groupedIds);

        if (error) {
          alert(error.message);
          return;
        }
      }

      await loadEntries();
    },
    [loadEntries, supabase]
  );

  const restoreEntry = useCallback(
    async function restoreEntry(id: string) {
      const { data: entry, error: fetchError } = await supabase
        .from("entries")
        .select("deleted_previous_status")
        .eq("id", id)
        .single();

      if (fetchError) {
        alert(fetchError.message);
        return;
      }

      const restoreStatus =
        normalizeDeletedPreviousStatus(entry.deleted_previous_status) ||
        "Draft";

      const { error } = await supabase
        .from("entries")
        .update({
          deleted_at: null,
          deleted_previous_status: "",
          status: restoreStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) {
        alert(error.message);
        return;
      }

      await loadEntries();
    },
    [loadEntries, supabase]
  );

  const restoreEntries = useCallback(
    async function restoreEntries(ids: string[]) {
      if (ids.length === 0) return;

      const { data: entriesToRestore, error: fetchError } = await supabase
        .from("entries")
        .select("id, deleted_previous_status")
        .in("id", ids);

      if (fetchError) {
        alert(fetchError.message);
        return;
      }

      const groupedByStatus = new Map<EntryStatus, string[]>();

      (entriesToRestore ?? []).forEach((entry) => {
        const restoreStatus =
          normalizeDeletedPreviousStatus(entry.deleted_previous_status) ||
          "Draft";

        const currentIds = groupedByStatus.get(restoreStatus) ?? [];
        groupedByStatus.set(restoreStatus, [...currentIds, entry.id]);
      });

      for (const [restoreStatus, groupedIds] of groupedByStatus.entries()) {
        const { error } = await supabase
          .from("entries")
          .update({
            deleted_at: null,
            deleted_previous_status: "",
            status: restoreStatus,
            updated_at: new Date().toISOString(),
          })
          .in("id", groupedIds);

        if (error) {
          alert(error.message);
          return;
        }
      }

      await loadEntries();
    },
    [loadEntries, supabase]
  );

  return {
    entries,
    trashEntries,
    filteredEntries,
    filteredTrashEntries,
    reviewQueueEntries,
    filteredReviewQueueEntries,
    search,
    setSearch,
    addEntry,
    updateEntry,
    updateStatus,
    updateEntriesStatus,
    deleteEntry,
    deleteEntries,
    restoreEntry,
    restoreEntries,
    draftCount,
    needsReviewStatusCount,
    reviewQueueCount,
    reviewCount: reviewQueueCount,
    verifiedCount,
    archivedCount,
    publishedCount,
    trashCount,
    isLoading,
    isOnline,
    pendingSyncCount,
    isSyncingOffline,
    offlineSyncError,
    syncPendingChanges,
  };
}
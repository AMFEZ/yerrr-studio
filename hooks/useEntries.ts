"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
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

function isEntryInReviewQueue(entry: Entry) {
  if (entry.status === "Needs Review") return true;
  if (entry.meanings.length === 0) return true;

  return entry.meanings.some((meaning) => {
    return (
      meaning.editorialStatus === "Needs Review" ||
      !meaning.title.trim() ||
      !meaning.definition.trim() ||
      !meaning.example.trim() ||
      !meaning.plainEnglish.trim() ||
      !meaning.category.trim() ||
      !meaning.tone.trim() ||
      !meaning.usageFrequency.trim()
    );
  });
}

export function useEntries() {
  const supabase = useMemo(() => createClient(), []);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadEntries = useCallback(async () => {
    setIsLoading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setEntries([]);
      setIsLoading(false);
      return;
    }

    const { data: entryRows, error: entryError } = await supabase
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
        updated_at
      `
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (entryError) {
      alert(entryError.message);
      setIsLoading(false);
      return;
    }

    const entryList = (entryRows ?? []) as EntryRow[];
    const entryIds = entryList.map((entry) => entry.id);

    if (entryIds.length === 0) {
      setEntries([]);
      setIsLoading(false);
      return;
    }

    const { data: meaningRows, error: meaningError } = await supabase
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
      `
      )
      .in("entry_id", entryIds)
      .order("meaning_order", { ascending: true });

    if (meaningError) {
      alert(meaningError.message);
      setIsLoading(false);
      return;
    }

    const meaningList = (meaningRows ?? []) as MeaningRow[];

    const mappedEntries: Entry[] = entryList.map((entry) => ({
      id: entry.id,
      word: entry.word,
      type: entry.type ?? "Word",
      slug: entry.slug ?? slugify(entry.word),
      pronunciation: entry.pronunciation ?? "",
      partOfSpeech: entry.part_of_speech ?? "",
      alternateSpellings: entry.alternate_spellings ?? "",
      status: normalizeEntryStatus(entry.status),
      lifecycle: normalizeLifecycle(entry.lifecycle),
      visibility: normalizeVisibility(entry.visibility),
      featured: Boolean(entry.featured),
      aiAddedStatus: normalizeAiAddedStatus(entry.ai_added_status),
      audioFilename: entry.audio_filename ?? "",
      illustrationFilename: entry.illustration_filename ?? "",
      illustrationNotes: entry.illustration_notes ?? "",
      notes: entry.notes ?? "",
      updatedAt: entry.updated_at ?? "",
      meanings: meaningList
        .filter((meaning) => meaning.entry_id === entry.id)
        .map((meaning) => ({
          id: meaning.id,
          title: meaning.title ?? "",
          definition: meaning.definition ?? "",
          example: meaning.example ?? "",
          plainEnglish: meaning.plain_english ?? "",
          category: meaning.category ?? "",
          tone: meaning.tone ?? "",
          conceptsText: meaning.concepts_text ?? "",
          usageFrequency: meaning.usage_frequency ?? "",
          culturalContext: meaning.cultural_context ?? "",
          editorialStatus: normalizeEditorialStatus(meaning.editorial_status),
          aiAddedStatus: normalizeAiAddedStatus(meaning.ai_added_status),
          verified: Boolean(meaning.verified),
          source: meaning.source ?? "Original",
        })),
    }));

    setEntries(mappedEntries);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
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
            meaning.plainEnglish.toLowerCase().includes(query) ||
            meaning.category.toLowerCase().includes(query) ||
            meaning.tone.toLowerCase().includes(query) ||
            meaning.conceptsText.toLowerCase().includes(query) ||
            meaning.usageFrequency.toLowerCase().includes(query) ||
            meaning.culturalContext.toLowerCase().includes(query) ||
            meaning.editorialStatus.toLowerCase().includes(query) ||
            meaning.source.toLowerCase().includes(query)
        )
      );
    });
  }, [entries, search]);

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
    async function updateEntry(updatedEntry: Entry) {
      const { error: entryError } = await supabase
        .from("entries")
        .update({
          word: updatedEntry.word,
          type: updatedEntry.type,
          slug: updatedEntry.slug.trim() || slugify(updatedEntry.word),
          pronunciation: updatedEntry.pronunciation,
          part_of_speech: updatedEntry.partOfSpeech,
          alternate_spellings: updatedEntry.alternateSpellings,
          status: updatedEntry.status,
          lifecycle: updatedEntry.lifecycle,
          visibility: updatedEntry.visibility,
          featured: updatedEntry.featured,
          ai_added_status: updatedEntry.aiAddedStatus,
          audio_filename: updatedEntry.audioFilename,
          illustration_filename: updatedEntry.illustrationFilename,
          illustration_notes: updatedEntry.illustrationNotes,
          notes: updatedEntry.notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", updatedEntry.id);

      if (entryError) {
        alert(entryError.message);
        return;
      }

      const { data: existingMeanings, error: existingMeaningError } =
        await supabase
          .from("meanings")
          .select("id")
          .eq("entry_id", updatedEntry.id);

      if (existingMeaningError) {
        alert(existingMeaningError.message);
        return;
      }

      const keptMeaningIds = updatedEntry.meanings
        .filter((meaning) => !meaning.id.startsWith("temp-"))
        .map((meaning) => meaning.id);

      const meaningIdsToDelete = (existingMeanings ?? [])
        .map((meaning) => meaning.id)
        .filter((id) => !keptMeaningIds.includes(id));

      if (meaningIdsToDelete.length > 0) {
        const { error: deleteMeaningsError } = await supabase
          .from("meanings")
          .delete()
          .in("id", meaningIdsToDelete);

        if (deleteMeaningsError) {
          alert(deleteMeaningsError.message);
          return;
        }
      }

      for (let index = 0; index < updatedEntry.meanings.length; index++) {
        const meaning = updatedEntry.meanings[index];

        const meaningPayload = {
          meaning_order: index + 1,
          title: meaning.title,
          definition: meaning.definition,
          example: meaning.example,
          plain_english: meaning.plainEnglish,
          category: meaning.category,
          tone: meaning.tone,
          concepts_text: meaning.conceptsText,
          usage_frequency: meaning.usageFrequency,
          cultural_context: meaning.culturalContext,
          editorial_status: meaning.editorialStatus,
          ai_added_status: meaning.aiAddedStatus,
          verified: meaning.verified,
          source: meaning.source,
          updated_at: new Date().toISOString(),
        };

        if (meaning.id.startsWith("temp-")) {
          const { error } = await supabase.from("meanings").insert({
            entry_id: updatedEntry.id,
            ...meaningPayload,
          });

          if (error) {
            alert(error.message);
            return;
          }
        } else {
          const { error } = await supabase
            .from("meanings")
            .update(meaningPayload)
            .eq("id", meaning.id);

          if (error) {
            alert(error.message);
            return;
          }
        }
      }

      await loadEntries();
    },
    [loadEntries, supabase]
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
        "Delete this entry? This will also delete all meanings attached to it."
      );

      if (!confirmed) return;

      const { error } = await supabase.from("entries").delete().eq("id", id);

      if (error) {
        alert(error.message);
        return;
      }

      await loadEntries();
    },
    [loadEntries, supabase]
  );

  return {
    entries,
    filteredEntries,
    reviewQueueEntries,
    filteredReviewQueueEntries,
    search,
    setSearch,
    addEntry,
    updateEntry,
    updateStatus,
    updateEntriesStatus,
    deleteEntry,
    draftCount,
    needsReviewStatusCount,
    reviewQueueCount,
    reviewCount: needsReviewStatusCount,
    verifiedCount,
    archivedCount,
    publishedCount,
    isLoading,
  };
}
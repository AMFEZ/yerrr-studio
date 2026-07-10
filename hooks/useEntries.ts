"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Entry, EntryStatus, Meaning } from "@/types/entry";

type EntryRow = {
  id: string;
  word: string;
  type: string | null;
  status: string | null;
  notes: string | null;
};

type MeaningRow = {
  id: string;
  entry_id: string;
  meaning_order: number;
  title: string | null;
  definition: string | null;
  example: string | null;
};

function normalizeStatus(status: string | null): EntryStatus {
  if (status === "Published") return "Published";
  if (status === "Needs Review") return "Needs Review";
  return "Draft";
}

export function useEntries() {
  const supabase = createClient();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function loadEntries() {
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
      .select("id, word, type, status, notes")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (entryError) {
      alert(entryError.message);
      setIsLoading(false);
      return;
    }

    const entryIds = (entryRows ?? []).map((entry) => entry.id);

    if (entryIds.length === 0) {
      setEntries([]);
      setIsLoading(false);
      return;
    }

    const { data: meaningRows, error: meaningError } = await supabase
      .from("meanings")
      .select("id, entry_id, meaning_order, title, definition, example")
      .in("entry_id", entryIds)
      .order("meaning_order", { ascending: true });

    if (meaningError) {
      alert(meaningError.message);
      setIsLoading(false);
      return;
    }

    const mappedEntries: Entry[] = (entryRows as EntryRow[]).map((entry) => ({
      id: entry.id,
      word: entry.word,
      type: entry.type ?? "Word",
      status: normalizeStatus(entry.status),
      notes: entry.notes ?? "",
      meanings: (meaningRows as MeaningRow[])
        .filter((meaning) => meaning.entry_id === entry.id)
        .map((meaning) => ({
          id: meaning.id,
          title: meaning.title ?? "",
          definition: meaning.definition ?? "",
          example: meaning.example ?? "",
        })),
    }));

    setEntries(mappedEntries);
    setIsLoading(false);
  }

  useEffect(() => {
    loadEntries();
  }, []);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const query = search.toLowerCase();

      return (
        entry.word.toLowerCase().includes(query) ||
        entry.type.toLowerCase().includes(query) ||
        entry.notes.toLowerCase().includes(query) ||
        entry.meanings.some(
          (meaning) =>
            meaning.title.toLowerCase().includes(query) ||
            meaning.definition.toLowerCase().includes(query) ||
            meaning.example.toLowerCase().includes(query)
        )
      );
    });
  }, [entries, search]);

  const draftCount = entries.filter((entry) => entry.status === "Draft").length;
  const publishedCount = entries.filter(
    (entry) => entry.status === "Published"
  ).length;
  const reviewCount = entries.filter(
    (entry) => entry.status === "Needs Review"
  ).length;

  async function addEntry(word: string, type: string) {
    if (!word.trim()) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data: entry, error: entryError } = await supabase
      .from("entries")
      .insert({
        user_id: user.id,
        word: word.trim(),
        type,
        status: "Draft",
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
      title: "",
      definition: "",
      example: "",
    });

    if (meaningError) {
      alert(meaningError.message);
      return;
    }

    await loadEntries();
  }

  async function updateEntry(updatedEntry: Entry) {
    const { error: entryError } = await supabase
      .from("entries")
      .update({
        word: updatedEntry.word,
        type: updatedEntry.type,
        status: updatedEntry.status,
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

      if (meaning.id.startsWith("temp-")) {
        const { error } = await supabase.from("meanings").insert({
          entry_id: updatedEntry.id,
          meaning_order: index + 1,
          title: meaning.title,
          definition: meaning.definition,
          example: meaning.example,
        });

        if (error) {
          alert(error.message);
          return;
        }
      } else {
        const { error } = await supabase
          .from("meanings")
          .update({
            meaning_order: index + 1,
            title: meaning.title,
            definition: meaning.definition,
            example: meaning.example,
            updated_at: new Date().toISOString(),
          })
          .eq("id", meaning.id);

        if (error) {
          alert(error.message);
          return;
        }
      }
    }

    await loadEntries();
  }

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
  }

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
  }

  return {
    entries,
    filteredEntries,
    search,
    setSearch,
    addEntry,
    updateEntry,
    updateStatus,
    deleteEntry,
    draftCount,
    publishedCount,
    reviewCount,
    isLoading,
  };
}
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Entry, EntryStatus, Meaning } from "@/types/entry";

type EntryRow = {
  id: string;
  word: string;
  type: string;
  status: EntryStatus | string | null;
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
      console.log("No logged-in user found.");
      setIsLoading(false);
      return;
    }

    console.log("Logged in user:", user.id);

    const { data: entryRows, error: entryError } = await supabase
      .from("entries")
      .select("id, word, type, status, notes")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (entryError) {
      console.error("Entry load error:", entryError);
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
      console.error("Meaning load error:", meaningError);
      alert(meaningError.message);
      setIsLoading(false);
      return;
    }

    const mappedEntries: Entry[] = (entryRows as EntryRow[]).map((entry) => ({
      id: entry.id,
      word: entry.word,
      type: entry.type || "Word",
      status:
        entry.status === "Published" ||
        entry.status === "Needs Review" ||
        entry.status === "Draft"
          ? entry.status
          : "Draft",
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

    console.log("Loaded entries:", mappedEntries.length);

    setEntries(mappedEntries);
    setIsLoading(false);
  }

  useEffect(() => {
    loadEntries();
  }, []);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) =>
      entry.word.toLowerCase().includes(search.toLowerCase())
    );
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
      .select()
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

  return {
    entries,
    filteredEntries,
    search,
    setSearch,
    addEntry,
    updateEntry,
    updateStatus,
    draftCount,
    publishedCount,
    reviewCount,
    isLoading,
  };
}
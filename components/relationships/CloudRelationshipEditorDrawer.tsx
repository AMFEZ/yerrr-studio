"use client";

import { useMemo, useState } from "react";

import type { Entry } from "@/types/entry";

import type {
  EntryRelationship,
  EntryRelationshipType,
} from "@/types/relationship";

import {
  entryRelationshipTypeOptions,
  getDefaultRelationshipDirection,
} from "@/types/relationship";

import { useCloudKnowledgeGraph } from "@/hooks/useCloudKnowledgeGraph";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

type CloudRelationshipEditorDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  entries?: Entry[];
  onOpenEntry?: (entry: Entry) => void;
  onGraphChanged?: () => void;
};

type DrawerTab = "manage" | "browse";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "An unknown cloud relationship error occurred.";
}

function getRelationshipClasses(type: EntryRelationshipType) {
  if (type === "Synonym Of") {
    return "border-green-400/30 bg-green-400/10 text-green-100";
  }

  if (type === "Opposite Of") {
    return "border-red-400/30 bg-red-400/10 text-red-100";
  }

  if (type === "Stronger Than") {
    return "border-orange-400/30 bg-orange-400/10 text-orange-100";
  }

  if (type === "Softer Than") {
    return "border-blue-400/30 bg-blue-400/10 text-blue-100";
  }

  if (type === "Phrase Version Of") {
    return "border-purple-400/30 bg-purple-400/10 text-purple-100";
  }

  if (type === "Regional Variant Of") {
    return "border-pink-400/30 bg-pink-400/10 text-pink-100";
  }

  if (type === "Derived From") {
    return "border-yellow-400/30 bg-yellow-400/10 text-yellow-100";
  }

  if (type === "Used With") {
    return "border-cyan-400/30 bg-cyan-400/10 text-cyan-100";
  }

  return "border-zinc-400/30 bg-zinc-400/10 text-zinc-100";
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getRelationshipKey(
  sourceEntryId: string,
  targetEntryId: string,
  relationshipType: EntryRelationshipType,
  isBidirectional: boolean
) {
  if (isBidirectional) {
    const [firstEntryId, secondEntryId] = [
      sourceEntryId,
      targetEntryId,
    ].sort();

    return `${firstEntryId}|${secondEntryId}|${relationshipType}|two-way`;
  }

  return `${sourceEntryId}|${targetEntryId}|${relationshipType}|directional`;
}

export function CloudRelationshipEditorDrawer({
  isOpen,
  onClose,
  entries = [],
  onOpenEntry,
  onGraphChanged,
}: CloudRelationshipEditorDrawerProps) {
  const {
    relationships,
    stats,
    isLoading,
    error: cloudError,
    refresh,
  } = useCloudKnowledgeGraph(isOpen);

  const [activeTab, setActiveTab] =
    useState<DrawerTab>("manage");

  const [
    selectedRelationshipId,
    setSelectedRelationshipId,
  ] = useState("");

  const [sourceEntryId, setSourceEntryId] = useState("");
  const [targetEntryId, setTargetEntryId] = useState("");

  const [relationshipType, setRelationshipType] =
    useState<EntryRelationshipType>("Related To");

  const [note, setNote] = useState("");
  const [isBidirectional, setIsBidirectional] =
    useState(true);

  const [relationshipSearch, setRelationshipSearch] =
    useState("");

  const [browseEntryId, setBrowseEntryId] =
    useState("");

  const [browseSearch, setBrowseSearch] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [localError, setLocalError] = useState("");

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) =>
      a.word.localeCompare(b.word)
    );
  }, [entries]);

  const entryById = useMemo(() => {
    return new Map(
      entries.map((entry) => [
        String(entry.id),
        entry,
      ])
    );
  }, [entries]);

  const selectedRelationship = useMemo(() => {
    return (
      relationships.find(
        (relationship) =>
          String(relationship.id) ===
          selectedRelationshipId
      ) ?? null
    );
  }, [
    relationships,
    selectedRelationshipId,
  ]);

  const selectedSourceEntry = useMemo(() => {
    return entryById.get(sourceEntryId) ?? null;
  }, [entryById, sourceEntryId]);

  const selectedTargetEntry = useMemo(() => {
    return entryById.get(targetEntryId) ?? null;
  }, [entryById, targetEntryId]);

  const validRelationships = useMemo(() => {
    return relationships.filter((relationship) => {
      return (
        entryById.has(
          String(relationship.sourceEntryId)
        ) &&
        entryById.has(
          String(relationship.targetEntryId)
        )
      );
    });
  }, [relationships, entryById]);

  const invalidRelationships = useMemo(() => {
    return relationships.filter((relationship) => {
      return (
        !entryById.has(
          String(relationship.sourceEntryId)
        ) ||
        !entryById.has(
          String(relationship.targetEntryId)
        )
      );
    });
  }, [relationships, entryById]);

  const relationshipStats = useMemo(() => {
    const connectedEntryIds = new Set<string>();
    const usedTypes = new Set<EntryRelationshipType>();

    validRelationships.forEach((relationship) => {
      connectedEntryIds.add(
        String(relationship.sourceEntryId)
      );

      connectedEntryIds.add(
        String(relationship.targetEntryId)
      );

      usedTypes.add(relationship.type);
    });

    const unconnectedEntries = entries.filter(
      (entry) =>
        !connectedEntryIds.has(String(entry.id))
    );

    return {
      relationships: validRelationships.length,
      connectedEntries: connectedEntryIds.size,
      unconnectedEntries,
      typesUsed: usedTypes.size,
      invalidRelationships:
        invalidRelationships.length,
    };
  }, [
    entries,
    validRelationships,
    invalidRelationships,
  ]);

  const filteredRelationships = useMemo(() => {
    const query =
      relationshipSearch.trim().toLowerCase();

    const sortedRelationships = [
      ...validRelationships,
    ].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );

    if (!query) {
      return sortedRelationships;
    }

    return sortedRelationships.filter(
      (relationship) => {
        const sourceEntry = entryById.get(
          String(relationship.sourceEntryId)
        );

        const targetEntry = entryById.get(
          String(relationship.targetEntryId)
        );

        return (
          sourceEntry?.word
            .toLowerCase()
            .includes(query) ||
          targetEntry?.word
            .toLowerCase()
            .includes(query) ||
          relationship.type
            .toLowerCase()
            .includes(query) ||
          relationship.note
            .toLowerCase()
            .includes(query)
        );
      }
    );
  }, [
    validRelationships,
    relationshipSearch,
    entryById,
  ]);

  const browseEntry = useMemo(() => {
    return entryById.get(browseEntryId) ?? null;
  }, [entryById, browseEntryId]);

  const browseRelationships = useMemo(() => {
    if (!browseEntryId) {
      return [];
    }

    const query = browseSearch.trim().toLowerCase();

    return validRelationships
      .filter((relationship) => {
        return (
          String(relationship.sourceEntryId) ===
            browseEntryId ||
          String(relationship.targetEntryId) ===
            browseEntryId
        );
      })
      .filter((relationship) => {
        if (!query) {
          return true;
        }

        const sourceEntry = entryById.get(
          String(relationship.sourceEntryId)
        );

        const targetEntry = entryById.get(
          String(relationship.targetEntryId)
        );

        return (
          sourceEntry?.word
            .toLowerCase()
            .includes(query) ||
          targetEntry?.word
            .toLowerCase()
            .includes(query) ||
          relationship.type
            .toLowerCase()
            .includes(query) ||
          relationship.note
            .toLowerCase()
            .includes(query)
        );
      })
      .sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)
      );
  }, [
    browseEntryId,
    browseSearch,
    validRelationships,
    entryById,
  ]);

  async function getAuthenticatedClient() {
    const supabase = getSupabaseBrowserClient();

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      throw error;
    }

    if (!user) {
      throw new Error(
        "Auth session missing. Log out and log back into YERRR Studio."
      );
    }

    return supabase;
  }

  function resetMessages() {
    setMessage("");
    setLocalError("");
  }

  function resetForm() {
    setSelectedRelationshipId("");
    setSourceEntryId("");
    setTargetEntryId("");
    setRelationshipType("Related To");
    setNote("");
    setIsBidirectional(true);
    resetMessages();
  }

  function changeRelationshipType(
    nextType: EntryRelationshipType
  ) {
    setRelationshipType(nextType);

    setIsBidirectional(
      getDefaultRelationshipDirection(nextType)
    );

    resetMessages();
  }

  function editRelationship(
    relationship: EntryRelationship
  ) {
    setSelectedRelationshipId(
      String(relationship.id)
    );

    setSourceEntryId(
      String(relationship.sourceEntryId)
    );

    setTargetEntryId(
      String(relationship.targetEntryId)
    );

    setRelationshipType(relationship.type);
    setNote(relationship.note);
    setIsBidirectional(
      relationship.isBidirectional
    );

    setActiveTab("manage");
    resetMessages();
  }

  function relationshipAlreadyExists() {
    const proposedKey = getRelationshipKey(
      sourceEntryId,
      targetEntryId,
      relationshipType,
      isBidirectional
    );

    return relationships.some((relationship) => {
      if (
        String(relationship.id) ===
        selectedRelationshipId
      ) {
        return false;
      }

      const existingKey = getRelationshipKey(
        String(relationship.sourceEntryId),
        String(relationship.targetEntryId),
        relationship.type,
        relationship.isBidirectional
      );

      return existingKey === proposedKey;
    });
  }

  async function saveRelationship() {
    if (
      !selectedSourceEntry ||
      !selectedTargetEntry
    ) {
      setLocalError(
        "Choose a source entry and a target entry."
      );

      return;
    }

    if (sourceEntryId === targetEntryId) {
      setLocalError(
        "An entry cannot be related to itself."
      );

      return;
    }

    if (relationshipAlreadyExists()) {
      setLocalError(
        "This cloud relationship already exists."
      );

      return;
    }

    try {
      setIsSaving(true);
      resetMessages();

      const supabase =
        await getAuthenticatedClient();

      const payload = {
        source_entry_id: selectedSourceEntry.id,
        target_entry_id: selectedTargetEntry.id,
        relationship_type: relationshipType,
        note: note.trim(),
        is_bidirectional: isBidirectional,
      };

      if (selectedRelationship) {
        const { error } = await supabase
          .from("entry_relationships")
          .update(payload)
          .eq("id", selectedRelationship.id);

        if (error) {
          throw error;
        }

        setMessage(
          `The relationship between "${selectedSourceEntry.word}" and "${selectedTargetEntry.word}" was updated.`
        );
      } else {
        const {
          data: insertedRelationship,
          error,
        } = await supabase
          .from("entry_relationships")
          .insert(payload)
          .select("id")
          .single();

        if (error) {
          throw error;
        }

        setSelectedRelationshipId(
          String(insertedRelationship.id)
        );

        setMessage(
          `A cloud relationship was created between "${selectedSourceEntry.word}" and "${selectedTargetEntry.word}".`
        );
      }

      await refresh();
      onGraphChanged?.();
    } catch (saveError) {
      setLocalError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteRelationship(
    relationship: EntryRelationship
  ) {
    const sourceEntry = entryById.get(
      String(relationship.sourceEntryId)
    );

    const targetEntry = entryById.get(
      String(relationship.targetEntryId)
    );

    const confirmed = window.confirm(
      `Delete the cloud relationship between "${
        sourceEntry?.word ?? "Unknown entry"
      }" and "${
        targetEntry?.word ?? "Unknown entry"
      }"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsSaving(true);
      resetMessages();

      const supabase =
        await getAuthenticatedClient();

      const { error } = await supabase
        .from("entry_relationships")
        .delete()
        .eq("id", relationship.id);

      if (error) {
        throw error;
      }

      if (
        selectedRelationshipId ===
        String(relationship.id)
      ) {
        resetForm();
      }

      await refresh();
      onGraphChanged?.();

      setMessage(
        "The cloud relationship was deleted."
      );
    } catch (deleteError) {
      setLocalError(
        getErrorMessage(deleteError)
      );
    } finally {
      setIsSaving(false);
    }
  }

  function browseFromRelationship(
    relationship: EntryRelationship,
    entryId: string
  ) {
    setBrowseEntryId(entryId);
    setBrowseSearch("");
    setActiveTab("browse");
    resetMessages();
  }

  function openEntry(entry: Entry) {
    if (!onOpenEntry) {
      return;
    }

    onClose();
    onOpenEntry(entry);
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
      <button
        aria-label="Close cloud relationship editor"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside className="absolute bottom-0 right-0 max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border-t border-neutral-800 bg-neutral-950 p-5 shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-h-none md:max-w-6xl md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0 md:p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.25em] text-sky-400">
              Supabase Knowledge Graph
            </p>

            <h2 className="mt-2 text-2xl font-black text-white">
              Cloud Relationship Editor
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500">
              Create, edit, delete, and browse permanent
              entry-to-entry relationships stored in Supabase.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-black text-neutral-300 hover:border-neutral-700 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Relationships
            </p>

            <p className="mt-2 text-2xl font-black text-white">
              {relationshipStats.relationships}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Connected
            </p>

            <p className="mt-2 text-2xl font-black text-white">
              {relationshipStats.connectedEntries}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Unconnected
            </p>

            <p className="mt-2 text-2xl font-black text-white">
              {
                relationshipStats
                  .unconnectedEntries.length
              }
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Types Used
            </p>

            <p className="mt-2 text-2xl font-black text-white">
              {relationshipStats.typesUsed}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Storage
            </p>

            <p className="mt-2 text-lg font-black text-sky-300">
              Supabase
            </p>
          </div>
        </div>

        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-2 sm:flex-row">
          <div className="grid flex-1 grid-cols-2 gap-2">
            <button
              onClick={() =>
                setActiveTab("manage")
              }
              className={`rounded-xl px-4 py-3 text-sm font-black ${
                activeTab === "manage"
                  ? "bg-sky-400 text-black"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Create / Manage
            </button>

            <button
              onClick={() =>
                setActiveTab("browse")
              }
              className={`rounded-xl px-4 py-3 text-sm font-black ${
                activeTab === "browse"
                  ? "bg-sky-400 text-black"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Browse Network
            </button>
          </div>

          <button
            onClick={() => void refresh()}
            disabled={isLoading || isSaving}
            className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-black text-white hover:border-sky-400 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isLoading
              ? "Refreshing..."
              : "Refresh Cloud"}
          </button>
        </div>

        {(cloudError || localError) && (
          <div className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm font-bold text-red-100">
            {localError || cloudError}
          </div>
        )}

        {message && (
          <div className="mb-5 rounded-xl border border-sky-400/20 bg-sky-400/10 p-4 text-sm font-bold text-sky-100">
            {message}
          </div>
        )}

        {isLoading &&
        relationships.length === 0 ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-8 text-center">
            <p className="font-black text-white">
              Loading cloud relationships...
            </p>
          </div>
        ) : activeTab === "manage" ? (
          <div className="grid gap-5 xl:grid-cols-[1fr_1.15fr]">
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-black text-white">
                    {selectedRelationship
                      ? "Edit Cloud Relationship"
                      : "Create Cloud Relationship"}
                  </h3>

                  <p className="mt-1 text-sm text-neutral-500">
                    Choose two entries and define how they
                    connect.
                  </p>
                </div>

                <button
                  onClick={resetForm}
                  disabled={isSaving}
                  className="rounded-xl bg-neutral-800 px-3 py-2 text-xs font-black text-white hover:bg-neutral-700 disabled:opacity-40"
                >
                  New
                </button>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <span className="text-sm font-bold text-neutral-300">
                    Source Entry
                  </span>

                  <select
                    value={sourceEntryId}
                    onChange={(event) => {
                      setSourceEntryId(
                        event.target.value
                      );

                      resetMessages();
                    }}
                    disabled={isSaving}
                    className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-sky-400 disabled:opacity-40"
                  >
                    <option value="">
                      Choose source entry...
                    </option>

                    {sortedEntries.map((entry) => (
                      <option
                        key={entry.id}
                        value={String(entry.id)}
                        disabled={
                          String(entry.id) ===
                          targetEntryId
                        }
                      >
                        {entry.word} · {entry.status}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-bold text-neutral-300">
                    Relationship Type
                  </span>

                  <select
                    value={relationshipType}
                    onChange={(event) =>
                      changeRelationshipType(
                        event.target
                          .value as EntryRelationshipType
                      )
                    }
                    disabled={isSaving}
                    className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-sky-400 disabled:opacity-40"
                  >
                    {entryRelationshipTypeOptions.map(
                      (type) => (
                        <option
                          key={type}
                          value={type}
                        >
                          {type}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-bold text-neutral-300">
                    Target Entry
                  </span>

                  <select
                    value={targetEntryId}
                    onChange={(event) => {
                      setTargetEntryId(
                        event.target.value
                      );

                      resetMessages();
                    }}
                    disabled={isSaving}
                    className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-sky-400 disabled:opacity-40"
                  >
                    <option value="">
                      Choose target entry...
                    </option>

                    {sortedEntries.map((entry) => (
                      <option
                        key={entry.id}
                        value={String(entry.id)}
                        disabled={
                          String(entry.id) ===
                          sourceEntryId
                        }
                      >
                        {entry.word} · {entry.status}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                  <input
                    type="checkbox"
                    checked={isBidirectional}
                    onChange={(event) =>
                      setIsBidirectional(
                        event.target.checked
                      )
                    }
                    disabled={isSaving}
                    className="mt-1 h-4 w-4"
                  />

                  <div>
                    <p className="font-black text-white">
                      Two-way relationship
                    </p>

                    <p className="mt-1 text-sm leading-6 text-neutral-500">
                      Both entries are treated as equally
                      connected. Disable this for directional
                      relationships such as derived from,
                      stronger than, or softer than.
                    </p>
                  </div>
                </label>

                <label className="block">
                  <span className="text-sm font-bold text-neutral-300">
                    Relationship Note
                  </span>

                  <textarea
                    value={note}
                    onChange={(event) =>
                      setNote(event.target.value)
                    }
                    disabled={isSaving}
                    rows={4}
                    placeholder="Explain the context or difference between these entries..."
                    className="mt-2 w-full resize-none rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-sky-400 disabled:opacity-40"
                  />
                </label>

                {selectedSourceEntry &&
                  selectedTargetEntry && (
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                        Preview
                      </p>

                      <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                        <span className="rounded-xl bg-neutral-800 px-4 py-3 font-black text-white">
                          {selectedSourceEntry.word}
                        </span>

                        <span
                          className={`rounded-full border px-3 py-2 text-xs font-black ${getRelationshipClasses(
                            relationshipType
                          )}`}
                        >
                          {isBidirectional
                            ? "↔"
                            : "→"}{" "}
                          {relationshipType}
                        </span>

                        <span className="rounded-xl bg-neutral-800 px-4 py-3 font-black text-white">
                          {selectedTargetEntry.word}
                        </span>
                      </div>
                    </div>
                  )}

                <button
                  onClick={() =>
                    void saveRelationship()
                  }
                  disabled={isSaving}
                  className="w-full rounded-xl bg-sky-400 px-4 py-3 text-sm font-black text-black hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSaving
                    ? "Saving..."
                    : selectedRelationship
                    ? "Save Relationship"
                    : "Create Relationship"}
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="mb-4">
                <h3 className="font-black text-white">
                  Cloud Relationship Library
                </h3>

                <p className="mt-1 text-sm text-neutral-500">
                  Search, edit, browse, or delete
                  Supabase relationships.
                </p>
              </div>

              <input
                value={relationshipSearch}
                onChange={(event) =>
                  setRelationshipSearch(
                    event.target.value
                  )
                }
                placeholder="Search entries, types, or notes..."
                className="mb-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-sky-400"
              />

              {filteredRelationships.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
                  {validRelationships.length === 0
                    ? "No cloud relationships have been created yet."
                    : "No cloud relationships match your search."}
                </div>
              ) : (
                <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
                  {filteredRelationships.map(
                    (relationship) => {
                      const sourceEntry =
                        entryById.get(
                          String(
                            relationship.sourceEntryId
                          )
                        );

                      const targetEntry =
                        entryById.get(
                          String(
                            relationship.targetEntryId
                          )
                        );

                      if (
                        !sourceEntry ||
                        !targetEntry
                      ) {
                        return null;
                      }

                      return (
                        <div
                          key={relationship.id}
                          className={`rounded-2xl border p-4 ${
                            selectedRelationshipId ===
                            String(
                              relationship.id
                            )
                              ? "border-sky-400 bg-sky-400/10"
                              : "border-neutral-800 bg-neutral-950"
                          }`}
                        >
                          <p className="font-black text-white">
                            {sourceEntry.word}

                            <span className="mx-2 text-neutral-600">
                              {relationship.isBidirectional
                                ? "↔"
                                : "→"}
                            </span>

                            {targetEntry.word}
                          </p>

                          <span
                            className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-black ${getRelationshipClasses(
                              relationship.type
                            )}`}
                          >
                            {relationship.type}
                          </span>

                          {relationship.note && (
                            <p className="mt-3 text-sm leading-6 text-neutral-400">
                              {relationship.note}
                            </p>
                          )}

                          <p className="mt-3 text-xs text-neutral-600">
                            Updated{" "}
                            {formatDate(
                              relationship.updatedAt
                            )}
                          </p>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              onClick={() =>
                                browseFromRelationship(
                                  relationship,
                                  String(sourceEntry.id)
                                )
                              }
                              className="rounded-xl bg-neutral-800 px-3 py-2 text-xs font-black text-white hover:bg-neutral-700"
                            >
                              Browse
                            </button>

                            <button
                              onClick={() =>
                                editRelationship(
                                  relationship
                                )
                              }
                              className="rounded-xl bg-neutral-800 px-3 py-2 text-xs font-black text-white hover:bg-neutral-700"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() =>
                                void deleteRelationship(
                                  relationship
                                )
                              }
                              disabled={isSaving}
                              className="rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white hover:bg-red-500 disabled:opacity-40"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              )}

              {invalidRelationships.length > 0 && (
                <div className="mt-4 rounded-xl border border-orange-400/20 bg-orange-400/10 p-4">
                  <p className="font-black text-orange-100">
                    Missing entry references
                  </p>

                  <p className="mt-2 text-sm text-orange-100/70">
                    {
                      invalidRelationships.length
                    }{" "}
                    relationship
                    {invalidRelationships.length === 1
                      ? ""
                      : "s"}{" "}
                    could not be matched to the entries
                    loaded in Studio.
                  </p>
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[0.8fr_1.3fr]">
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="font-black text-white">
                Choose an Entry
              </h3>

              <p className="mt-1 text-sm leading-6 text-neutral-500">
                Select an entry to browse its permanent
                Supabase relationship network.
              </p>

              <select
                value={browseEntryId}
                onChange={(event) => {
                  setBrowseEntryId(
                    event.target.value
                  );

                  setBrowseSearch("");
                  resetMessages();
                }}
                className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-sky-400"
              >
                <option value="">
                  Choose entry...
                </option>

                {sortedEntries.map((entry) => (
                  <option
                    key={entry.id}
                    value={String(entry.id)}
                  >
                    {entry.word}
                  </option>
                ))}
              </select>

              <div className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                  Cloud Coverage
                </p>

                <p className="mt-2 text-3xl font-black text-white">
                  {
                    relationshipStats.connectedEntries
                  }
                  /{entries.length}
                </p>

                <p className="mt-2 text-sm text-neutral-500">
                  entries have at least one cloud
                  relationship.
                </p>
              </div>

              <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="font-black text-white">
                  Unconnected Entries
                </p>

                <p className="mt-2 text-2xl font-black text-white">
                  {
                    relationshipStats
                      .unconnectedEntries.length
                  }
                </p>

                {relationshipStats
                  .unconnectedEntries.length >
                  0 && (
                  <div className="mt-3 flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                    {relationshipStats
                      .unconnectedEntries
                      .slice(0, 40)
                      .map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() =>
                            setBrowseEntryId(
                              String(entry.id)
                            )
                          }
                          className="rounded-full bg-neutral-800 px-3 py-1 text-xs font-bold text-neutral-300 hover:bg-neutral-700"
                        >
                          {entry.word}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              {browseEntry ? (
                <>
                  <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                        Cloud Entry Network
                      </p>

                      <h3 className="mt-2 text-3xl font-black text-white">
                        {browseEntry.word}
                      </h3>

                      <p className="mt-1 text-sm text-neutral-500">
                        /{browseEntry.slug} ·{" "}
                        {browseRelationships.length}{" "}
                        direct connection
                        {browseRelationships.length ===
                        1
                          ? ""
                          : "s"}
                      </p>
                    </div>

                    {onOpenEntry && (
                      <button
                        onClick={() =>
                          openEntry(browseEntry)
                        }
                        className="rounded-xl bg-sky-400 px-4 py-3 text-sm font-black text-black hover:bg-sky-300"
                      >
                        Open Entry
                      </button>
                    )}
                  </div>

                  <input
                    value={browseSearch}
                    onChange={(event) =>
                      setBrowseSearch(
                        event.target.value
                      )
                    }
                    placeholder="Search this entry's connections..."
                    className="mb-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-sky-400"
                  />

                  {browseRelationships.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
                      This entry does not have any cloud
                      relationships yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {browseRelationships.map(
                        (relationship) => {
                          const sourceEntry =
                            entryById.get(
                              String(
                                relationship.sourceEntryId
                              )
                            );

                          const targetEntry =
                            entryById.get(
                              String(
                                relationship.targetEntryId
                              )
                            );

                          if (
                            !sourceEntry ||
                            !targetEntry
                          ) {
                            return null;
                          }

                          const browseIsSource =
                            String(
                              relationship.sourceEntryId
                            ) === browseEntryId;

                          const connectedEntry =
                            browseIsSource
                              ? targetEntry
                              : sourceEntry;

                          const directionLabel =
                            relationship.isBidirectional
                              ? "Two-way"
                              : browseIsSource
                              ? "Outgoing"
                              : "Incoming";

                          return (
                            <div
                              key={relationship.id}
                              className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
                            >
                              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <p className="text-lg font-black text-white">
                                    {
                                      browseEntry.word
                                    }

                                    <span className="mx-2 text-neutral-600">
                                      {relationship.isBidirectional
                                        ? "↔"
                                        : browseIsSource
                                        ? "→"
                                        : "←"}
                                    </span>

                                    {
                                      connectedEntry.word
                                    }
                                  </p>

                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <span
                                      className={`rounded-full border px-3 py-1 text-xs font-black ${getRelationshipClasses(
                                        relationship.type
                                      )}`}
                                    >
                                      {
                                        relationship.type
                                      }
                                    </span>

                                    <span className="rounded-full bg-neutral-800 px-3 py-1 text-xs font-black text-neutral-400">
                                      {directionLabel}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex shrink-0 gap-2">
                                  <button
                                    onClick={() =>
                                      setBrowseEntryId(
                                        String(
                                          connectedEntry.id
                                        )
                                      )
                                    }
                                    className="rounded-xl bg-neutral-800 px-3 py-2 text-xs font-black text-white hover:bg-neutral-700"
                                  >
                                    Follow
                                  </button>

                                  {onOpenEntry && (
                                    <button
                                      onClick={() =>
                                        openEntry(
                                          connectedEntry
                                        )
                                      }
                                      className="rounded-xl bg-sky-400 px-3 py-2 text-xs font-black text-black hover:bg-sky-300"
                                    >
                                      Open
                                    </button>
                                  )}
                                </div>
                              </div>

                              {relationship.note && (
                                <p className="mt-4 text-sm leading-6 text-neutral-400">
                                  {
                                    relationship.note
                                  }
                                </p>
                              )}

                              <button
                                onClick={() =>
                                  editRelationship(
                                    relationship
                                  )
                                }
                                className="mt-4 text-xs font-black text-neutral-500 hover:text-sky-300"
                              >
                                Edit relationship
                              </button>
                            </div>
                          );
                        }
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
                  Choose an entry from the left to browse
                  its cloud relationship network.
                </div>
              )}
            </section>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-sky-400/20 bg-sky-400/10 p-4">
          <p className="font-black text-sky-100">
            Alpha 3.7C3 note
          </p>

          <p className="mt-2 text-sm leading-6 text-sky-100/70">
            Relationships created here write directly to
            Supabase and remain available across devices.
            The original local relationship editor remains
            untouched for backup compatibility.
          </p>
        </div>
      </aside>
    </div>
  );
}

export default CloudRelationshipEditorDrawer;
"use client";

import { useEffect, useMemo, useState } from "react";
import type { Entry } from "@/types/entry";
import type {
  EntryRelationship,
  EntryRelationshipType,
} from "@/types/relationship";
import {
  entryRelationshipTypeOptions,
  getDefaultRelationshipDirection,
} from "@/types/relationship";

type RelationshipDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  entries?: Entry[];
  onOpenEntry?: (entry: Entry) => void;
};

type DrawerTab = "manage" | "browse";

const RELATIONSHIP_STORAGE_KEY =
  "yerrr-studio-entry-relationships-alpha-3";

function createId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getDateSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
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

export function RelationshipDrawer({
  isOpen,
  onClose,
  entries = [],
  onOpenEntry,
}: RelationshipDrawerProps) {
  const [hasLoaded, setHasLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<DrawerTab>("manage");
  const [relationships, setRelationships] = useState<EntryRelationship[]>([]);

  const [selectedRelationshipId, setSelectedRelationshipId] = useState<
    string | null
  >(null);

  const [sourceEntryId, setSourceEntryId] = useState("");
  const [targetEntryId, setTargetEntryId] = useState("");
  const [relationshipType, setRelationshipType] =
    useState<EntryRelationshipType>("Related To");
  const [note, setNote] = useState("");
  const [isBidirectional, setIsBidirectional] = useState(true);

  const [relationshipSearch, setRelationshipSearch] = useState("");
  const [browseEntryId, setBrowseEntryId] = useState("");
  const [browseSearch, setBrowseSearch] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const storedRelationships = window.localStorage.getItem(
        RELATIONSHIP_STORAGE_KEY
      );

      if (storedRelationships) {
        const parsedRelationships = JSON.parse(
          storedRelationships
        ) as unknown;

        if (Array.isArray(parsedRelationships)) {
          setRelationships(parsedRelationships as EntryRelationship[]);
        }
      }
    } catch {
      setRelationships([]);
    } finally {
      setHasLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;

    window.localStorage.setItem(
      RELATIONSHIP_STORAGE_KEY,
      JSON.stringify(relationships)
    );
  }, [relationships, hasLoaded]);

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => a.word.localeCompare(b.word));
  }, [entries]);

  const entryById = useMemo(() => {
    return new Map(
      entries.map((entry) => [String(entry.id), entry])
    );
  }, [entries]);

  const selectedRelationship = useMemo(() => {
    return (
      relationships.find(
        (relationship) => relationship.id === selectedRelationshipId
      ) ?? null
    );
  }, [relationships, selectedRelationshipId]);

  const selectedSourceEntry = useMemo(() => {
    return entryById.get(sourceEntryId) ?? null;
  }, [entryById, sourceEntryId]);

  const selectedTargetEntry = useMemo(() => {
    return entryById.get(targetEntryId) ?? null;
  }, [entryById, targetEntryId]);

  const validRelationships = useMemo(() => {
    return relationships.filter((relationship) => {
      return (
        entryById.has(String(relationship.sourceEntryId)) &&
        entryById.has(String(relationship.targetEntryId))
      );
    });
  }, [relationships, entryById]);

  const invalidRelationships = useMemo(() => {
    return relationships.filter((relationship) => {
      return (
        !entryById.has(String(relationship.sourceEntryId)) ||
        !entryById.has(String(relationship.targetEntryId))
      );
    });
  }, [relationships, entryById]);

  const relationshipStats = useMemo(() => {
    const connectedEntryIds = new Set<string>();
    const usedTypes = new Set<EntryRelationshipType>();

    validRelationships.forEach((relationship) => {
      connectedEntryIds.add(String(relationship.sourceEntryId));
      connectedEntryIds.add(String(relationship.targetEntryId));
      usedTypes.add(relationship.type);
    });

    const unconnectedEntries = entries.filter(
      (entry) => !connectedEntryIds.has(String(entry.id))
    );

    return {
      total: validRelationships.length,
      connectedEntries: connectedEntryIds.size,
      unconnectedEntries,
      usedTypes: usedTypes.size,
      invalid: invalidRelationships.length,
    };
  }, [validRelationships, invalidRelationships, entries]);

  const filteredRelationships = useMemo(() => {
    const query = relationshipSearch.trim().toLowerCase();

    const sortedRelationships = [...validRelationships].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );

    if (!query) return sortedRelationships;

    return sortedRelationships.filter((relationship) => {
      const sourceEntry = entryById.get(String(relationship.sourceEntryId));
      const targetEntry = entryById.get(String(relationship.targetEntryId));

      return (
        sourceEntry?.word.toLowerCase().includes(query) ||
        targetEntry?.word.toLowerCase().includes(query) ||
        relationship.type.toLowerCase().includes(query) ||
        relationship.note.toLowerCase().includes(query)
      );
    });
  }, [validRelationships, relationshipSearch, entryById]);

  const browseEntry = useMemo(() => {
    return entryById.get(browseEntryId) ?? null;
  }, [entryById, browseEntryId]);

  const browseRelationships = useMemo(() => {
    if (!browseEntryId) return [];

    const query = browseSearch.trim().toLowerCase();

    return validRelationships
      .filter((relationship) => {
        return (
          String(relationship.sourceEntryId) === browseEntryId ||
          String(relationship.targetEntryId) === browseEntryId
        );
      })
      .filter((relationship) => {
        if (!query) return true;

        const sourceEntry = entryById.get(String(relationship.sourceEntryId));
        const targetEntry = entryById.get(String(relationship.targetEntryId));

        return (
          sourceEntry?.word.toLowerCase().includes(query) ||
          targetEntry?.word.toLowerCase().includes(query) ||
          relationship.type.toLowerCase().includes(query) ||
          relationship.note.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [
    browseEntryId,
    browseSearch,
    validRelationships,
    entryById,
  ]);

  function resetForm() {
    setSelectedRelationshipId(null);
    setSourceEntryId("");
    setTargetEntryId("");
    setRelationshipType("Related To");
    setNote("");
    setIsBidirectional(true);
    setMessage("");
  }

  function changeRelationshipType(type: EntryRelationshipType) {
    setRelationshipType(type);
    setIsBidirectional(getDefaultRelationshipDirection(type));
    setMessage("");
  }

  function relationshipAlreadyExists() {
    return relationships.some((relationship) => {
      if (relationship.id === selectedRelationshipId) return false;
      if (relationship.type !== relationshipType) return false;

      const sameDirection =
        String(relationship.sourceEntryId) === sourceEntryId &&
        String(relationship.targetEntryId) === targetEntryId;

      const reverseDirection =
        String(relationship.sourceEntryId) === targetEntryId &&
        String(relationship.targetEntryId) === sourceEntryId;

      if (sameDirection) return true;

      return (
        reverseDirection &&
        (relationship.isBidirectional || isBidirectional)
      );
    });
  }

  function saveRelationship() {
    if (!sourceEntryId || !targetEntryId) {
      setMessage("Choose a source entry and a target entry.");
      return;
    }

    if (sourceEntryId === targetEntryId) {
      setMessage("An entry cannot be related to itself.");
      return;
    }

    if (relationshipAlreadyExists()) {
      setMessage("This relationship already exists.");
      return;
    }

    const now = new Date().toISOString();

    if (selectedRelationship) {
      setRelationships((currentRelationships) =>
        currentRelationships.map((relationship) =>
          relationship.id === selectedRelationship.id
            ? {
                ...relationship,
                sourceEntryId,
                targetEntryId,
                type: relationshipType,
                note: note.trim(),
                isBidirectional,
                updatedAt: now,
              }
            : relationship
        )
      );

      setMessage("Relationship updated.");
      return;
    }

    const newRelationship: EntryRelationship = {
      id: createId(),
      sourceEntryId,
      targetEntryId,
      type: relationshipType,
      note: note.trim(),
      isBidirectional,
      createdAt: now,
      updatedAt: now,
    };

    setRelationships((currentRelationships) => [
      newRelationship,
      ...currentRelationships,
    ]);

    setSelectedRelationshipId(newRelationship.id);
    setMessage("Relationship created.");
  }

  function editRelationship(relationship: EntryRelationship) {
    setSelectedRelationshipId(relationship.id);
    setSourceEntryId(String(relationship.sourceEntryId));
    setTargetEntryId(String(relationship.targetEntryId));
    setRelationshipType(relationship.type);
    setNote(relationship.note);
    setIsBidirectional(relationship.isBidirectional);
    setActiveTab("manage");
    setMessage("");
  }

  function deleteRelationship(relationship: EntryRelationship) {
    const sourceEntry = entryById.get(String(relationship.sourceEntryId));
    const targetEntry = entryById.get(String(relationship.targetEntryId));

    const confirmed = window.confirm(
      `Delete the relationship between "${
        sourceEntry?.word ?? "Unknown entry"
      }" and "${targetEntry?.word ?? "Unknown entry"}"?`
    );

    if (!confirmed) return;

    setRelationships((currentRelationships) =>
      currentRelationships.filter(
        (currentRelationship) =>
          currentRelationship.id !== relationship.id
      )
    );

    if (selectedRelationshipId === relationship.id) {
      resetForm();
    }

    setMessage("Relationship deleted.");
  }

  function removeInvalidRelationships() {
    if (invalidRelationships.length === 0) return;

    const confirmed = window.confirm(
      `Remove ${invalidRelationships.length} invalid relationship${
        invalidRelationships.length === 1 ? "" : "s"
      }?`
    );

    if (!confirmed) return;

    const invalidIds = new Set(
      invalidRelationships.map((relationship) => relationship.id)
    );

    setRelationships((currentRelationships) =>
      currentRelationships.filter(
        (relationship) => !invalidIds.has(relationship.id)
      )
    );

    setMessage("Invalid relationships removed.");
  }

  function openEntry(entry: Entry) {
    if (!onOpenEntry) return;

    onClose();
    onOpenEntry(entry);
  }

  function browseFromRelationship(
    relationship: EntryRelationship,
    entryId: string
  ) {
    setBrowseEntryId(entryId);
    setBrowseSearch("");
    setActiveTab("browse");
    setMessage("");
  }

  function exportRelationshipsJson() {
    const backup = {
      app: "YERRR Studio",
      version: "Alpha 3.5",
      exportType: "entry_relationships",
      exportedAt: new Date().toISOString(),
      counts: {
        relationships: validRelationships.length,
        connectedEntries: relationshipStats.connectedEntries,
        unconnectedEntries: relationshipStats.unconnectedEntries.length,
        invalidRelationships: invalidRelationships.length,
      },
      relationships,
    };

    downloadTextFile(
      `yerrr-entry-relationships-${getDateSlug()}.json`,
      JSON.stringify(backup, null, 2),
      "application/json"
    );

    setMessage("Relationships exported.");
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
      <button
        aria-label="Close relationships"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside className="absolute bottom-0 right-0 max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border-t border-neutral-800 bg-neutral-950 p-5 shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-h-none md:max-w-6xl md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0 md:p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.25em] text-yellow-400">
              Knowledge Graph
            </p>

            <h2 className="mt-2 text-2xl font-black text-white">
              Entry Relationships
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500">
              Connect slang entries directly to synonyms, opposites, stronger
              versions, phrase variants, regional forms, and related terms.
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
              {relationshipStats.total}
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
              {relationshipStats.unconnectedEntries.length}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Types Used
            </p>
            <p className="mt-2 text-2xl font-black text-white">
              {relationshipStats.usedTypes}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Invalid
            </p>
            <p className="mt-2 text-2xl font-black text-white">
              {relationshipStats.invalid}
            </p>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border border-neutral-800 bg-neutral-900 p-2">
          <button
            onClick={() => setActiveTab("manage")}
            className={`rounded-xl px-4 py-3 text-sm font-black ${
              activeTab === "manage"
                ? "bg-yellow-400 text-black"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Create / Manage
          </button>

          <button
            onClick={() => setActiveTab("browse")}
            className={`rounded-xl px-4 py-3 text-sm font-black ${
              activeTab === "browse"
                ? "bg-yellow-400 text-black"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Browse Network
          </button>
        </div>

        {message && (
          <div className="mb-5 rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-sm font-bold text-yellow-100">
            {message}
          </div>
        )}

        {activeTab === "manage" ? (
          <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-black text-white">
                    {selectedRelationship
                      ? "Edit Relationship"
                      : "Create Relationship"}
                  </h3>

                  <p className="mt-1 text-sm text-neutral-500">
                    Choose two entries and describe how they connect.
                  </p>
                </div>

                <button
                  onClick={resetForm}
                  className="rounded-xl bg-neutral-800 px-3 py-2 text-xs font-black text-white hover:bg-neutral-700"
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
                      setSourceEntryId(event.target.value);
                      setMessage("");
                    }}
                    className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
                  >
                    <option value="">Choose source entry...</option>

                    {sortedEntries.map((entry) => (
                      <option
                        key={entry.id}
                        value={String(entry.id)}
                        disabled={String(entry.id) === targetEntryId}
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
                        event.target.value as EntryRelationshipType
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
                  >
                    {entryRelationshipTypeOptions.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-bold text-neutral-300">
                    Target Entry
                  </span>

                  <select
                    value={targetEntryId}
                    onChange={(event) => {
                      setTargetEntryId(event.target.value);
                      setMessage("");
                    }}
                    className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
                  >
                    <option value="">Choose target entry...</option>

                    {sortedEntries.map((entry) => (
                      <option
                        key={entry.id}
                        value={String(entry.id)}
                        disabled={String(entry.id) === sourceEntryId}
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
                      setIsBidirectional(event.target.checked)
                    }
                    className="mt-1 h-4 w-4"
                  />

                  <div>
                    <p className="font-black text-white">
                      Two-way relationship
                    </p>

                    <p className="mt-1 text-sm leading-6 text-neutral-500">
                      Both entries will be treated as equally connected. Disable
                      this for directional relationships such as “derived from”
                      or “stronger than.”
                    </p>
                  </div>
                </label>

                <label className="block">
                  <span className="text-sm font-bold text-neutral-300">
                    Relationship Note
                  </span>

                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Explain the difference, context, or reason for this relationship..."
                    rows={4}
                    className="mt-2 w-full resize-none rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400"
                  />
                </label>

                {selectedSourceEntry && selectedTargetEntry && (
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
                        {isBidirectional ? "↔" : "→"} {relationshipType}
                      </span>

                      <span className="rounded-xl bg-neutral-800 px-4 py-3 font-black text-white">
                        {selectedTargetEntry.word}
                      </span>
                    </div>
                  </div>
                )}

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    onClick={saveRelationship}
                    className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-black hover:bg-yellow-300"
                  >
                    {selectedRelationship
                      ? "Save Relationship"
                      : "Create Relationship"}
                  </button>

                  <button
                    onClick={exportRelationshipsJson}
                    disabled={relationships.length === 0}
                    className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-black text-white hover:border-yellow-400 hover:text-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Export Relationships
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="mb-4">
                <h3 className="font-black text-white">
                  Relationship Library
                </h3>

                <p className="mt-1 text-sm text-neutral-500">
                  Search, edit, browse, or remove existing connections.
                </p>
              </div>

              <input
                value={relationshipSearch}
                onChange={(event) =>
                  setRelationshipSearch(event.target.value)
                }
                placeholder="Search entries, types, or notes..."
                className="mb-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400"
              />

              {filteredRelationships.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
                  {validRelationships.length === 0
                    ? "No entry relationships have been created yet."
                    : "No relationships match your search."}
                </div>
              ) : (
                <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
                  {filteredRelationships.map((relationship) => {
                    const sourceEntry = entryById.get(
                      String(relationship.sourceEntryId)
                    );
                    const targetEntry = entryById.get(
                      String(relationship.targetEntryId)
                    );

                    if (!sourceEntry || !targetEntry) return null;

                    return (
                      <div
                        key={relationship.id}
                        className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="font-black text-white">
                              {sourceEntry.word}
                              <span className="mx-2 text-neutral-600">
                                {relationship.isBidirectional ? "↔" : "→"}
                              </span>
                              {targetEntry.word}
                            </p>

                            <span
                              className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-black ${getRelationshipClasses(
                                relationship.type
                              )}`}
                            >
                              {relationship.type}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-2">
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
                              onClick={() => editRelationship(relationship)}
                              className="rounded-xl bg-neutral-800 px-3 py-2 text-xs font-black text-white hover:bg-neutral-700"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() =>
                                deleteRelationship(relationship)
                              }
                              className="rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white hover:bg-red-500"
                            >
                              Delete
                            </button>
                          </div>
                        </div>

                        {relationship.note && (
                          <p className="mt-3 text-sm leading-6 text-neutral-400">
                            {relationship.note}
                          </p>
                        )}

                        <p className="mt-3 text-xs text-neutral-600">
                          Updated {formatDate(relationship.updatedAt)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {invalidRelationships.length > 0 && (
                <div className="mt-4 rounded-xl border border-orange-400/20 bg-orange-400/10 p-4">
                  <p className="font-black text-orange-100">
                    Invalid relationships detected
                  </p>

                  <p className="mt-2 text-sm text-orange-100/70">
                    {invalidRelationships.length} relationship
                    {invalidRelationships.length === 1 ? "" : "s"} point to an
                    entry that no longer exists.
                  </p>

                  <button
                    onClick={removeInvalidRelationships}
                    className="mt-3 rounded-xl bg-orange-400 px-4 py-2 text-xs font-black text-black hover:bg-orange-300"
                  >
                    Remove Invalid Links
                  </button>
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[0.8fr_1.3fr]">
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="font-black text-white">Choose an Entry</h3>

              <p className="mt-1 text-sm leading-6 text-neutral-500">
                Select one entry to see every direct connection.
              </p>

              <select
                value={browseEntryId}
                onChange={(event) => {
                  setBrowseEntryId(event.target.value);
                  setBrowseSearch("");
                  setMessage("");
                }}
                className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
              >
                <option value="">Choose entry...</option>

                {sortedEntries.map((entry) => (
                  <option key={entry.id} value={String(entry.id)}>
                    {entry.word}
                  </option>
                ))}
              </select>

              <div className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                  Network Coverage
                </p>

                <p className="mt-2 text-3xl font-black text-white">
                  {relationshipStats.connectedEntries}/{entries.length}
                </p>

                <p className="mt-2 text-sm text-neutral-500">
                  entries currently have at least one direct relationship.
                </p>
              </div>

              <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="font-black text-white">Unconnected Entries</p>

                <p className="mt-2 text-2xl font-black text-white">
                  {relationshipStats.unconnectedEntries.length}
                </p>

                {relationshipStats.unconnectedEntries.length > 0 && (
                  <div className="mt-3 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                    {relationshipStats.unconnectedEntries
                      .slice(0, 30)
                      .map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() =>
                            setBrowseEntryId(String(entry.id))
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
                        Entry Network
                      </p>

                      <h3 className="mt-2 text-3xl font-black text-white">
                        {browseEntry.word}
                      </h3>

                      <p className="mt-1 text-sm text-neutral-500">
                        /{browseEntry.slug} · {browseRelationships.length} direct
                        connection
                        {browseRelationships.length === 1 ? "" : "s"}
                      </p>
                    </div>

                    {onOpenEntry && (
                      <button
                        onClick={() => openEntry(browseEntry)}
                        className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-black hover:bg-yellow-300"
                      >
                        Open Entry
                      </button>
                    )}
                  </div>

                  <input
                    value={browseSearch}
                    onChange={(event) =>
                      setBrowseSearch(event.target.value)
                    }
                    placeholder="Search this entry's connections..."
                    className="mb-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400"
                  />

                  {browseRelationships.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
                      This entry does not have any relationships yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {browseRelationships.map((relationship) => {
                        const sourceEntry = entryById.get(
                          String(relationship.sourceEntryId)
                        );
                        const targetEntry = entryById.get(
                          String(relationship.targetEntryId)
                        );

                        if (!sourceEntry || !targetEntry) return null;

                        const browseIsSource =
                          String(relationship.sourceEntryId) === browseEntryId;

                        const connectedEntry = browseIsSource
                          ? targetEntry
                          : sourceEntry;

                        const directionLabel = relationship.isBidirectional
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
                              <div className="min-w-0">
                                <p className="text-lg font-black text-white">
                                  {browseEntry.word}
                                  <span className="mx-2 text-neutral-600">
                                    {relationship.isBidirectional
                                      ? "↔"
                                      : browseIsSource
                                      ? "→"
                                      : "←"}
                                  </span>
                                  {connectedEntry.word}
                                </p>

                                <div className="mt-2 flex flex-wrap gap-2">
                                  <span
                                    className={`rounded-full border px-3 py-1 text-xs font-black ${getRelationshipClasses(
                                      relationship.type
                                    )}`}
                                  >
                                    {relationship.type}
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
                                      String(connectedEntry.id)
                                    )
                                  }
                                  className="rounded-xl bg-neutral-800 px-3 py-2 text-xs font-black text-white hover:bg-neutral-700"
                                >
                                  Follow
                                </button>

                                {onOpenEntry && (
                                  <button
                                    onClick={() =>
                                      openEntry(connectedEntry)
                                    }
                                    className="rounded-xl bg-yellow-400 px-3 py-2 text-xs font-black text-black hover:bg-yellow-300"
                                  >
                                    Open
                                  </button>
                                )}
                              </div>
                            </div>

                            {relationship.note && (
                              <p className="mt-4 text-sm leading-6 text-neutral-400">
                                {relationship.note}
                              </p>
                            )}

                            <button
                              onClick={() => editRelationship(relationship)}
                              className="mt-4 text-xs font-black text-neutral-500 hover:text-yellow-300"
                            >
                              Edit relationship
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
                  Choose an entry from the left to browse its relationship
                  network.
                </div>
              )}
            </section>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
          <p className="font-black text-yellow-100">Alpha 3.5 note</p>

          <p className="mt-2 text-sm leading-6 text-yellow-100/70">
            Entry relationships are currently stored in this browser. The next
            step can add a combined Relationship Browser that displays entries,
            concepts, and direct connections together in one graph view.
          </p>
        </div>
      </aside>
    </div>
  );
}

export default RelationshipDrawer;
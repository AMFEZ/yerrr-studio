"use client";

import {
  useMemo,
  useState,
} from "react";

import type { Entry } from "@/types/entry";
import type { Concept } from "@/types/concept";
import type {
  EntryRelationshipType,
} from "@/types/relationship";

import { useCloudKnowledgeGraph } from "@/hooks/useCloudKnowledgeGraph";

type CloudGraphDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  entries?: Entry[];
  onOpenEntry?: (entry: Entry) => void;
};

type CloudTab = "concepts" | "relationships";

function getConceptColorClasses(color: Concept["color"]) {
  if (color === "yellow") {
    return "border-yellow-400/30 bg-yellow-400/10 text-yellow-100";
  }

  if (color === "blue") {
    return "border-blue-400/30 bg-blue-400/10 text-blue-100";
  }

  if (color === "purple") {
    return "border-purple-400/30 bg-purple-400/10 text-purple-100";
  }

  if (color === "green") {
    return "border-green-400/30 bg-green-400/10 text-green-100";
  }

  if (color === "red") {
    return "border-red-400/30 bg-red-400/10 text-red-100";
  }

  if (color === "pink") {
    return "border-pink-400/30 bg-pink-400/10 text-pink-100";
  }

  if (color === "orange") {
    return "border-orange-400/30 bg-orange-400/10 text-orange-100";
  }

  return "border-zinc-400/30 bg-zinc-400/10 text-zinc-100";
}

function getRelationshipClasses(
  type: EntryRelationshipType
) {
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

export function CloudGraphDrawer({
  isOpen,
  onClose,
  entries = [],
  onOpenEntry,
}: CloudGraphDrawerProps) {
  const {
    concepts,
    assignments,
    relationships,
    stats,
    isLoading,
    hasLoaded,
    error,
    refresh,
  } = useCloudKnowledgeGraph(isOpen);

  const [activeTab, setActiveTab] =
    useState<CloudTab>("concepts");

  const [selectedConceptId, setSelectedConceptId] =
    useState("");

  const [conceptSearch, setConceptSearch] = useState("");
  const [relationshipSearch, setRelationshipSearch] =
    useState("");

  const entryById = useMemo(() => {
    return new Map(
      entries.map((entry) => [
        String(entry.id),
        entry,
      ])
    );
  }, [entries]);

  const selectedConcept = useMemo(() => {
    return (
      concepts.find(
        (concept) =>
          String(concept.id) === selectedConceptId
      ) ?? null
    );
  }, [concepts, selectedConceptId]);

  const conceptUsageCounts = useMemo(() => {
    const usageMap = new Map<string, number>();

    assignments.forEach((assignment) => {
      assignment.conceptIds.forEach((conceptId) => {
        usageMap.set(
          String(conceptId),
          (usageMap.get(String(conceptId)) ?? 0) + 1
        );
      });
    });

    return usageMap;
  }, [assignments]);

  const filteredConcepts = useMemo(() => {
    const query = conceptSearch.trim().toLowerCase();

    const sortedConcepts = [...concepts].sort((a, b) => {
      const bUsage =
        conceptUsageCounts.get(String(b.id)) ?? 0;

      const aUsage =
        conceptUsageCounts.get(String(a.id)) ?? 0;

      if (bUsage !== aUsage) {
        return bUsage - aUsage;
      }

      return a.name.localeCompare(b.name);
    });

    if (!query) return sortedConcepts;

    return sortedConcepts.filter((concept) => {
      return (
        concept.name.toLowerCase().includes(query) ||
        concept.slug.toLowerCase().includes(query) ||
        concept.category.toLowerCase().includes(query) ||
        concept.description.toLowerCase().includes(query)
      );
    });
  }, [
    concepts,
    conceptSearch,
    conceptUsageCounts,
  ]);

  const selectedConceptEntries = useMemo(() => {
    if (!selectedConceptId) return [];

    const linkedEntryIds = new Set(
      assignments
        .filter((assignment) =>
          assignment.conceptIds
            .map(String)
            .includes(selectedConceptId)
        )
        .map((assignment) =>
          String(assignment.entryId)
        )
    );

    return entries
      .filter((entry) =>
        linkedEntryIds.has(String(entry.id))
      )
      .sort((a, b) =>
        a.word.localeCompare(b.word)
      );
  }, [
    assignments,
    entries,
    selectedConceptId,
  ]);

  const filteredRelationships = useMemo(() => {
    const query =
      relationshipSearch.trim().toLowerCase();

    return relationships.filter((relationship) => {
      const sourceEntry = entryById.get(
        String(relationship.sourceEntryId)
      );

      const targetEntry = entryById.get(
        String(relationship.targetEntryId)
      );

      if (!query) return true;

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
    });
  }, [
    relationships,
    relationshipSearch,
    entryById,
  ]);

  function openEntry(entry: Entry) {
    if (!onOpenEntry) return;

    onClose();
    onOpenEntry(entry);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
      <button
        aria-label="Close cloud graph"
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
              Cloud Graph Reader
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500">
              Browse the permanent concepts, assignments, and
              entry relationships stored in Supabase.
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
              Concepts
            </p>

            <p className="mt-2 text-2xl font-black text-white">
              {stats.concepts}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Assigned
            </p>

            <p className="mt-2 text-2xl font-black text-white">
              {stats.assignedEntries}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Concept Links
            </p>

            <p className="mt-2 text-2xl font-black text-white">
              {stats.conceptLinks}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Relationships
            </p>

            <p className="mt-2 text-2xl font-black text-white">
              {stats.relationships}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Connected
            </p>

            <p className="mt-2 text-2xl font-black text-white">
              {stats.connectedEntries}
            </p>
          </div>
        </div>

        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid flex-1 grid-cols-2 gap-2">
            <button
              onClick={() => setActiveTab("concepts")}
              className={`rounded-xl px-4 py-3 text-sm font-black ${
                activeTab === "concepts"
                  ? "bg-sky-400 text-black"
                  : "bg-neutral-950 text-neutral-400 hover:text-white"
              }`}
            >
              Cloud Concepts
            </button>

            <button
              onClick={() =>
                setActiveTab("relationships")
              }
              className={`rounded-xl px-4 py-3 text-sm font-black ${
                activeTab === "relationships"
                  ? "bg-sky-400 text-black"
                  : "bg-neutral-950 text-neutral-400 hover:text-white"
              }`}
            >
              Cloud Relationships
            </button>
          </div>

          <button
            onClick={() => void refresh()}
            disabled={isLoading}
            className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-black text-white hover:border-sky-400 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isLoading ? "Refreshing..." : "Refresh Cloud"}
          </button>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm font-bold text-red-100">
            {error}
          </div>
        )}

        {isLoading && !hasLoaded ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-8 text-center">
            <p className="font-black text-white">
              Loading Supabase graph...
            </p>

            <p className="mt-2 text-sm text-neutral-500">
              Reading concepts, assignments, and relationships.
            </p>
          </div>
        ) : activeTab === "concepts" ? (
          <div className="grid gap-5 lg:grid-cols-[0.85fr_1.35fr]">
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="font-black text-white">
                Supabase Concepts
              </h3>

              <p className="mt-1 text-sm text-neutral-500">
                Select a cloud concept to view its linked entries.
              </p>

              <input
                value={conceptSearch}
                onChange={(event) =>
                  setConceptSearch(event.target.value)
                }
                placeholder="Search cloud concepts..."
                className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-sky-400"
              />

              {filteredConcepts.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-neutral-700 p-5 text-sm text-neutral-500">
                  No Supabase concepts were found.
                </div>
              ) : (
                <div className="mt-4 max-h-[62vh] space-y-2 overflow-y-auto pr-1">
                  {filteredConcepts.map((concept) => {
                    const isSelected =
                      selectedConceptId ===
                      String(concept.id);

                    const usageCount =
                      conceptUsageCounts.get(
                        String(concept.id)
                      ) ?? 0;

                    return (
                      <button
                        key={concept.id}
                        type="button"
                        onClick={() =>
                          setSelectedConceptId(
                            String(concept.id)
                          )
                        }
                        className={`w-full rounded-2xl border p-4 text-left transition ${
                          isSelected
                            ? "border-sky-400 bg-sky-400/10"
                            : "border-neutral-800 bg-neutral-950 hover:border-neutral-700"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-black text-white">
                              {concept.name}
                            </p>

                            <p className="mt-1 text-xs text-neutral-500">
                              /{concept.slug}
                            </p>
                          </div>

                          <span className="rounded-full bg-neutral-800 px-2 py-1 text-xs font-black text-neutral-300">
                            {usageCount} linked
                          </span>
                        </div>

                        <span
                          className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-black ${getConceptColorClasses(
                            concept.color
                          )}`}
                        >
                          {concept.category}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              {selectedConcept ? (
                <>
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                      Cloud Concept
                    </p>

                    <h3 className="mt-2 text-3xl font-black text-white">
                      {selectedConcept.name}
                    </h3>

                    <p className="mt-1 text-sm text-neutral-500">
                      /{selectedConcept.slug} ·{" "}
                      {selectedConceptEntries.length} linked
                      entries
                    </p>

                    {selectedConcept.description && (
                      <p className="mt-4 text-sm leading-6 text-neutral-400">
                        {selectedConcept.description}
                      </p>
                    )}
                  </div>

                  {selectedConceptEntries.length === 0 ? (
                    <div className="mt-4 rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
                      This Supabase concept has no linked entries.
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {selectedConceptEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-black text-white">
                                {entry.word}
                              </p>

                              <p className="mt-1 text-xs text-neutral-500">
                                /{entry.slug} · {entry.status}
                              </p>
                            </div>

                            {onOpenEntry && (
                              <button
                                onClick={() =>
                                  openEntry(entry)
                                }
                                className="rounded-xl bg-sky-400 px-3 py-2 text-xs font-black text-black hover:bg-sky-300"
                              >
                                Open
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
                  Select a Supabase concept from the left.
                </div>
              )}
            </section>
          </div>
        ) : (
          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-black text-white">
                  Supabase Relationships
                </h3>

                <p className="mt-1 text-sm text-neutral-500">
                  Permanent entry connections stored in the cloud.
                </p>
              </div>

              <input
                value={relationshipSearch}
                onChange={(event) =>
                  setRelationshipSearch(event.target.value)
                }
                placeholder="Search relationships..."
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-sky-400 sm:max-w-sm"
              />
            </div>

            {filteredRelationships.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
                No Supabase relationships were found.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {filteredRelationships.map(
                  (relationship) => {
                    const sourceEntry = entryById.get(
                      String(
                        relationship.sourceEntryId
                      )
                    );

                    const targetEntry = entryById.get(
                      String(
                        relationship.targetEntryId
                      )
                    );

                    return (
                      <div
                        key={relationship.id}
                        className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-black text-white">
                              {sourceEntry?.word ??
                                "Missing entry"}

                              <span className="mx-2 text-neutral-600">
                                {relationship.isBidirectional
                                  ? "↔"
                                  : "→"}
                              </span>

                              {targetEntry?.word ??
                                "Missing entry"}
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
                          </div>

                          <div className="flex shrink-0 gap-2">
                            {sourceEntry && onOpenEntry && (
                              <button
                                onClick={() =>
                                  openEntry(sourceEntry)
                                }
                                className="rounded-xl bg-neutral-800 px-3 py-2 text-xs font-black text-white hover:bg-neutral-700"
                              >
                                Open Source
                              </button>
                            )}

                            {targetEntry && onOpenEntry && (
                              <button
                                onClick={() =>
                                  openEntry(targetEntry)
                                }
                                className="rounded-xl bg-sky-400 px-3 py-2 text-xs font-black text-black hover:bg-sky-300"
                              >
                                Open Target
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            )}
          </section>
        )}

        <div className="mt-6 rounded-2xl border border-sky-400/20 bg-sky-400/10 p-4">
          <p className="font-black text-sky-100">
            Alpha 3.7C1 note
          </p>

          <p className="mt-2 text-sm leading-6 text-sky-100/70">
            This drawer reads directly from Supabase. The existing
            concept and relationship editors still use local storage
            until the next sync stage.
          </p>
        </div>
      </aside>
    </div>
  );
}

export default CloudGraphDrawer;
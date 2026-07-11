"use client";

import { useMemo, useState } from "react";

import type { Entry } from "@/types/entry";
import type { Concept } from "@/types/concept";
import type {
  EntryRelationship,
  EntryRelationshipType,
} from "@/types/relationship";

import { useCloudKnowledgeGraph } from "@/hooks/useCloudKnowledgeGraph";

type GraphExplorerDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  entries?: Entry[];
  onOpenEntry?: (entry: Entry) => void;
  onOpenCloudConcepts?: () => void;
  onOpenCloudRelationships?: () => void;
};

type ExplorerTab = "entry" | "concept";

function getDateSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string
) {
  const blob = new Blob([content], {
    type: mimeType,
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

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

export function GraphExplorerDrawer({
  isOpen,
  onClose,
  entries = [],
  onOpenEntry,
  onOpenCloudConcepts,
  onOpenCloudRelationships,
}: GraphExplorerDrawerProps) {
  const {
    concepts,
    assignments,
    relationships,
    isLoading,
    hasLoaded,
    error,
    refresh,
  } = useCloudKnowledgeGraph(isOpen);

  const [activeTab, setActiveTab] =
    useState<ExplorerTab>("entry");

  const [selectedEntryId, setSelectedEntryId] =
    useState("");

  const [selectedConceptId, setSelectedConceptId] =
    useState("");

  const [entrySearch, setEntrySearch] = useState("");
  const [networkSearch, setNetworkSearch] = useState("");
  const [conceptSearch, setConceptSearch] = useState("");
  const [conceptEntrySearch, setConceptEntrySearch] =
    useState("");

  const [message, setMessage] = useState("");

  const entryById = useMemo(() => {
    return new Map(
      entries.map((entry) => [
        String(entry.id),
        entry,
      ])
    );
  }, [entries]);

  const conceptById = useMemo(() => {
    return new Map(
      concepts.map((concept) => [
        String(concept.id),
        concept,
      ])
    );
  }, [concepts]);

  const validAssignments = useMemo(() => {
    return assignments.filter((assignment) => {
      return entryById.has(String(assignment.entryId));
    });
  }, [assignments, entryById]);

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

  const unmatchedAssignmentCount = useMemo(() => {
    return assignments.reduce((total, assignment) => {
      const entryExists = entryById.has(
        String(assignment.entryId)
      );

      return (
        total +
        assignment.conceptIds.filter((conceptId) => {
          return (
            !entryExists ||
            !conceptById.has(String(conceptId))
          );
        }).length
      );
    }, 0);
  }, [
    assignments,
    entryById,
    conceptById,
  ]);

  const unmatchedRelationshipCount = useMemo(() => {
    return relationships.length - validRelationships.length;
  }, [relationships, validRelationships]);

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) =>
      a.word.localeCompare(b.word)
    );
  }, [entries]);

  const conceptUsageCounts = useMemo(() => {
    const counts = new Map<string, number>();

    validAssignments.forEach((assignment) => {
      assignment.conceptIds.forEach((conceptId) => {
        const normalizedConceptId =
          String(conceptId);

        if (!conceptById.has(normalizedConceptId)) {
          return;
        }

        counts.set(
          normalizedConceptId,
          (counts.get(normalizedConceptId) ?? 0) + 1
        );
      });
    });

    return counts;
  }, [validAssignments, conceptById]);

  const relationshipCountsByEntry = useMemo(() => {
    const counts = new Map<string, number>();

    validRelationships.forEach((relationship) => {
      const sourceId = String(
        relationship.sourceEntryId
      );

      const targetId = String(
        relationship.targetEntryId
      );

      counts.set(
        sourceId,
        (counts.get(sourceId) ?? 0) + 1
      );

      counts.set(
        targetId,
        (counts.get(targetId) ?? 0) + 1
      );
    });

    return counts;
  }, [validRelationships]);

  const conceptCountsByEntry = useMemo(() => {
    const counts = new Map<string, number>();

    validAssignments.forEach((assignment) => {
      const validConceptIds =
        assignment.conceptIds.filter((conceptId) =>
          conceptById.has(String(conceptId))
        );

      counts.set(
        String(assignment.entryId),
        new Set(validConceptIds.map(String)).size
      );
    });

    return counts;
  }, [validAssignments, conceptById]);

  const filteredEntryChoices = useMemo(() => {
    const query = entrySearch.trim().toLowerCase();

    if (!query) {
      return sortedEntries;
    }

    return sortedEntries.filter((entry) => {
      return (
        entry.word.toLowerCase().includes(query) ||
        entry.slug.toLowerCase().includes(query) ||
        entry.status.toLowerCase().includes(query)
      );
    });
  }, [sortedEntries, entrySearch]);

  const selectedEntry = useMemo(() => {
    return entryById.get(selectedEntryId) ?? null;
  }, [entryById, selectedEntryId]);

  const selectedConcept = useMemo(() => {
    return conceptById.get(selectedConceptId) ?? null;
  }, [conceptById, selectedConceptId]);

  const selectedEntryConcepts = useMemo(() => {
    if (!selectedEntryId) {
      return [];
    }

    const assignment = validAssignments.find(
      (currentAssignment) =>
        String(currentAssignment.entryId) ===
        selectedEntryId
    );

    if (!assignment) {
      return [];
    }

    return Array.from(
      new Set(assignment.conceptIds.map(String))
    )
      .map((conceptId) =>
        conceptById.get(conceptId)
      )
      .filter(
        (concept): concept is Concept =>
          Boolean(concept)
      )
      .sort((a, b) =>
        a.name.localeCompare(b.name)
      );
  }, [
    selectedEntryId,
    validAssignments,
    conceptById,
  ]);

  const selectedEntryRelationships = useMemo(() => {
    if (!selectedEntryId) {
      return [];
    }

    const query = networkSearch.trim().toLowerCase();

    return validRelationships
      .filter((relationship) => {
        return (
          String(relationship.sourceEntryId) ===
            selectedEntryId ||
          String(relationship.targetEntryId) ===
            selectedEntryId
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
      });
  }, [
    selectedEntryId,
    validRelationships,
    networkSearch,
    entryById,
  ]);

  const connectedEntries = useMemo(() => {
    const connectedMap = new Map<
      string,
      {
        entry: Entry;
        relationships: EntryRelationship[];
      }
    >();

    selectedEntryRelationships.forEach(
      (relationship) => {
        const sourceId = String(
          relationship.sourceEntryId
        );

        const targetId = String(
          relationship.targetEntryId
        );

        const connectedId =
          sourceId === selectedEntryId
            ? targetId
            : sourceId;

        const connectedEntry =
          entryById.get(connectedId);

        if (!connectedEntry) {
          return;
        }

        const existing =
          connectedMap.get(connectedId);

        connectedMap.set(connectedId, {
          entry: connectedEntry,
          relationships: [
            ...(existing?.relationships ?? []),
            relationship,
          ],
        });
      }
    );

    return Array.from(connectedMap.values()).sort(
      (a, b) =>
        a.entry.word.localeCompare(b.entry.word)
    );
  }, [
    selectedEntryRelationships,
    selectedEntryId,
    entryById,
  ]);

  const filteredConcepts = useMemo(() => {
    const query = conceptSearch.trim().toLowerCase();

    const sortedConcepts = [...concepts].sort(
      (a, b) => {
        const bUsage =
          conceptUsageCounts.get(String(b.id)) ?? 0;

        const aUsage =
          conceptUsageCounts.get(String(a.id)) ?? 0;

        if (bUsage !== aUsage) {
          return bUsage - aUsage;
        }

        return a.name.localeCompare(b.name);
      }
    );

    if (!query) {
      return sortedConcepts;
    }

    return sortedConcepts.filter((concept) => {
      return (
        concept.name.toLowerCase().includes(query) ||
        concept.slug.toLowerCase().includes(query) ||
        concept.category.toLowerCase().includes(query) ||
        concept.description
          .toLowerCase()
          .includes(query)
      );
    });
  }, [
    concepts,
    conceptSearch,
    conceptUsageCounts,
  ]);

  const allSelectedConceptEntries = useMemo(() => {
    if (!selectedConceptId) {
      return [];
    }

    const linkedEntryIds = new Set(
      validAssignments
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
    selectedConceptId,
    validAssignments,
    entries,
  ]);

  const filteredSelectedConceptEntries =
    useMemo(() => {
      const query =
        conceptEntrySearch.trim().toLowerCase();

      if (!query) {
        return allSelectedConceptEntries;
      }

      return allSelectedConceptEntries.filter(
        (entry) => {
          return (
            entry.word.toLowerCase().includes(query) ||
            entry.slug.toLowerCase().includes(query) ||
            entry.status
              .toLowerCase()
              .includes(query)
          );
        }
      );
    }, [
      allSelectedConceptEntries,
      conceptEntrySearch,
    ]);

  const graphStats = useMemo(() => {
    const entriesWithConcepts = new Set<string>();
    const entriesWithRelationships = new Set<string>();

    validAssignments.forEach((assignment) => {
      const hasValidConcept =
        assignment.conceptIds.some((conceptId) =>
          conceptById.has(String(conceptId))
        );

      if (hasValidConcept) {
        entriesWithConcepts.add(
          String(assignment.entryId)
        );
      }
    });

    validRelationships.forEach((relationship) => {
      entriesWithRelationships.add(
        String(relationship.sourceEntryId)
      );

      entriesWithRelationships.add(
        String(relationship.targetEntryId)
      );
    });

    const fullyConnectedEntries = entries.filter(
      (entry) => {
        const entryId = String(entry.id);

        return (
          entriesWithConcepts.has(entryId) &&
          entriesWithRelationships.has(entryId)
        );
      }
    ).length;

    const conceptLinks = validAssignments.reduce(
      (total, assignment) => {
        return (
          total +
          assignment.conceptIds.filter((conceptId) =>
            conceptById.has(String(conceptId))
          ).length
        );
      },
      0
    );

    return {
      concepts: concepts.length,
      conceptLinks,
      relationships: validRelationships.length,
      entriesWithConcepts:
        entriesWithConcepts.size,
      entriesWithRelationships:
        entriesWithRelationships.size,
      fullyConnectedEntries,
    };
  }, [
    concepts,
    conceptById,
    entries,
    validAssignments,
    validRelationships,
  ]);

  function selectEntry(entryId: string) {
    setSelectedEntryId(entryId);
    setNetworkSearch("");
    setMessage("");
    setActiveTab("entry");
  }

  function selectConcept(conceptId: string) {
    setSelectedConceptId(conceptId);
    setConceptEntrySearch("");
    setMessage("");
    setActiveTab("concept");
  }

  function openEntry(entry: Entry) {
    if (!onOpenEntry) {
      return;
    }

    onClose();
    onOpenEntry(entry);
  }

  function openCloudConcepts() {
    onClose();
    onOpenCloudConcepts?.();
  }

  function openCloudRelationships() {
    onClose();
    onOpenCloudRelationships?.();
  }

  function exportSelectedEntryGraph() {
    if (!selectedEntry) {
      return;
    }

    const relationshipsForExport =
      validRelationships.filter((relationship) => {
        return (
          String(relationship.sourceEntryId) ===
            String(selectedEntry.id) ||
          String(relationship.targetEntryId) ===
            String(selectedEntry.id)
        );
      });

    const connectedEntryIds = new Set<string>();

    relationshipsForExport.forEach(
      (relationship) => {
        connectedEntryIds.add(
          String(relationship.sourceEntryId)
        );

        connectedEntryIds.add(
          String(relationship.targetEntryId)
        );
      }
    );

    connectedEntryIds.delete(
      String(selectedEntry.id)
    );

    const connectedEntriesForExport =
      entries.filter((entry) =>
        connectedEntryIds.has(String(entry.id))
      );

    const exportSlug =
      selectedEntry.slug ||
      String(selectedEntry.id);

    const backup = {
      app: "YERRR Studio",
      version: "Alpha 3.7C4B",
      source: "Supabase",
      exportType: "cloud_entry_graph_neighborhood",
      exportedAt: new Date().toISOString(),

      entry: selectedEntry,
      concepts: selectedEntryConcepts,
      relationships: relationshipsForExport,
      connectedEntries: connectedEntriesForExport,

      counts: {
        concepts: selectedEntryConcepts.length,
        relationships:
          relationshipsForExport.length,
        connectedEntries:
          connectedEntriesForExport.length,
      },
    };

    downloadTextFile(
      `yerrr-cloud-entry-graph-${exportSlug}-${getDateSlug()}.json`,
      JSON.stringify(backup, null, 2),
      "application/json"
    );

    setMessage(
      `Cloud graph exported for "${selectedEntry.word}".`
    );
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
      <button
        aria-label="Close cloud graph explorer"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside className="absolute bottom-0 right-0 max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border-t border-neutral-800 bg-neutral-950 p-5 shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-h-none md:max-w-6xl md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0 md:p-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.25em] text-sky-400">
              Supabase Knowledge Graph
            </p>

            <h2 className="mt-2 text-2xl font-black text-white">
              Unified Cloud Graph Explorer
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500">
              Explore permanent Supabase concepts,
              assignments, and entry relationships in one
              connected workspace.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void refresh()}
              disabled={isLoading}
              className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs font-black text-neutral-300 hover:border-sky-400 hover:text-sky-300 disabled:opacity-40"
            >
              {isLoading
                ? "Refreshing..."
                : "Refresh Cloud"}
            </button>

            <button
              onClick={onClose}
              className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-black text-neutral-300 hover:border-neutral-700 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm font-bold text-red-100">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-5 rounded-xl border border-sky-400/20 bg-sky-400/10 p-4 text-sm font-bold text-sky-100">
            {message}
          </div>
        )}

        {isLoading && !hasLoaded ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-8 text-center">
            <p className="font-black text-white">
              Loading cloud graph...
            </p>

            <p className="mt-2 text-sm text-neutral-500">
              Reading concepts, assignments, and
              relationships from Supabase.
            </p>
          </div>
        ) : (
          <>
            <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                  Concepts
                </p>

                <p className="mt-2 text-2xl font-black text-white">
                  {graphStats.concepts}
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                  Concept Links
                </p>

                <p className="mt-2 text-2xl font-black text-white">
                  {graphStats.conceptLinks}
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                  Relationships
                </p>

                <p className="mt-2 text-2xl font-black text-white">
                  {graphStats.relationships}
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                  With Concepts
                </p>

                <p className="mt-2 text-2xl font-black text-white">
                  {graphStats.entriesWithConcepts}
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                  Related
                </p>

                <p className="mt-2 text-2xl font-black text-white">
                  {graphStats.entriesWithRelationships}
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                  Fully Connected
                </p>

                <p className="mt-2 text-2xl font-black text-white">
                  {graphStats.fullyConnectedEntries}
                </p>
              </div>
            </section>

            {(unmatchedAssignmentCount > 0 ||
              unmatchedRelationshipCount > 0) && (
              <div className="mb-5 rounded-xl border border-orange-400/20 bg-orange-400/10 p-4 text-sm text-orange-100">
                Supabase contains{" "}
                <strong>
                  {unmatchedAssignmentCount}
                </strong>{" "}
                unmatched concept link
                {unmatchedAssignmentCount === 1
                  ? ""
                  : "s"}{" "}
                and{" "}
                <strong>
                  {unmatchedRelationshipCount}
                </strong>{" "}
                unmatched relationship
                {unmatchedRelationshipCount === 1
                  ? ""
                  : "s"}{" "}
                that could not be connected to the entries
                currently loaded in Studio.
              </div>
            )}

            <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-2 sm:flex-row">
              <div className="grid flex-1 grid-cols-2 gap-2">
                <button
                  onClick={() =>
                    setActiveTab("entry")
                  }
                  className={`rounded-xl px-4 py-3 text-sm font-black ${
                    activeTab === "entry"
                      ? "bg-sky-400 text-black"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  Entry Network
                </button>

                <button
                  onClick={() =>
                    setActiveTab("concept")
                  }
                  className={`rounded-xl px-4 py-3 text-sm font-black ${
                    activeTab === "concept"
                      ? "bg-sky-400 text-black"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  Concept Network
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {onOpenCloudConcepts && (
                  <button
                    onClick={openCloudConcepts}
                    className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-xs font-black text-white hover:border-sky-400 hover:text-sky-300"
                  >
                    Edit Concepts
                  </button>
                )}

                {onOpenCloudRelationships && (
                  <button
                    onClick={openCloudRelationships}
                    className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-xs font-black text-white hover:border-sky-400 hover:text-sky-300"
                  >
                    Edit Relationships
                  </button>
                )}
              </div>
            </div>

            {activeTab === "entry" ? (
              <div className="grid gap-5 xl:grid-cols-[0.8fr_1.35fr]">
                <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                  <h3 className="font-black text-white">
                    Select an Entry
                  </h3>

                  <p className="mt-1 text-sm text-neutral-500">
                    Choose an entry to explore its permanent
                    cloud neighborhood.
                  </p>

                  <input
                    value={entrySearch}
                    onChange={(event) =>
                      setEntrySearch(event.target.value)
                    }
                    placeholder="Search entries..."
                    className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-sky-400"
                  />

                  <div className="mt-4 max-h-[65vh] space-y-2 overflow-y-auto pr-1">
                    {filteredEntryChoices.map((entry) => {
                      const entryId = String(entry.id);

                      const conceptCount =
                        conceptCountsByEntry.get(entryId) ??
                        0;

                      const relationshipCount =
                        relationshipCountsByEntry.get(
                          entryId
                        ) ?? 0;

                      const isSelected =
                        selectedEntryId === entryId;

                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() =>
                            selectEntry(entryId)
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
                                {entry.word}
                              </p>

                              <p className="mt-1 text-xs text-neutral-500">
                                /{entry.slug} ·{" "}
                                {entry.status}
                              </p>
                            </div>

                            <div className="flex shrink-0 gap-1">
                              <span className="rounded-full bg-neutral-800 px-2 py-1 text-[10px] font-black text-neutral-400">
                                {conceptCount} C
                              </span>

                              <span className="rounded-full bg-neutral-800 px-2 py-1 text-[10px] font-black text-neutral-400">
                                {relationshipCount} R
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                  {selectedEntry ? (
                    <>
                      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                              Cloud Entry Network
                            </p>

                            <h3 className="mt-2 text-3xl font-black text-white">
                              {selectedEntry.word}
                            </h3>

                            <p className="mt-1 text-sm text-neutral-500">
                              /{selectedEntry.slug} ·{" "}
                              {selectedEntry.status}
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            {onOpenEntry && (
                              <button
                                onClick={() =>
                                  openEntry(selectedEntry)
                                }
                                className="rounded-xl bg-sky-400 px-4 py-3 text-xs font-black text-black hover:bg-sky-300"
                              >
                                Open Entry
                              </button>
                            )}

                            <button
                              onClick={
                                exportSelectedEntryGraph
                              }
                              className="rounded-xl bg-neutral-800 px-4 py-3 text-xs font-black text-white hover:bg-neutral-700"
                            >
                              Export Graph
                            </button>
                          </div>
                        </div>

                        {selectedEntry.meanings?.[0]
                          ?.definition && (
                          <p className="mt-4 text-sm leading-6 text-neutral-400">
                            {
                              selectedEntry.meanings[0]
                                .definition
                            }
                          </p>
                        )}
                      </div>

                      <section className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="font-black text-white">
                              Cloud Concepts
                            </h3>

                            <p className="mt-1 text-sm text-neutral-500">
                              Permanent semantic and cultural
                              categories assigned in Supabase.
                            </p>
                          </div>

                          <span className="rounded-full bg-neutral-800 px-3 py-1 text-xs font-black text-neutral-300">
                            {selectedEntryConcepts.length}
                          </span>
                        </div>

                        {selectedEntryConcepts.length ===
                        0 ? (
                          <div className="mt-4 rounded-xl border border-dashed border-neutral-700 p-5 text-sm text-neutral-500">
                            No cloud concepts are assigned to
                            this entry.
                          </div>
                        ) : (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {selectedEntryConcepts.map(
                              (concept) => (
                                <button
                                  key={concept.id}
                                  type="button"
                                  onClick={() =>
                                    selectConcept(
                                      String(concept.id)
                                    )
                                  }
                                  className={`rounded-full border px-3 py-2 text-xs font-black ${getConceptColorClasses(
                                    concept.color
                                  )}`}
                                >
                                  {concept.name}
                                </button>
                              )
                            )}
                          </div>
                        )}
                      </section>

                      <section className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h3 className="font-black text-white">
                              Cloud Relationships
                            </h3>

                            <p className="mt-1 text-sm text-neutral-500">
                              Follow permanent entry
                              connections stored in Supabase.
                            </p>
                          </div>

                          <input
                            value={networkSearch}
                            onChange={(event) =>
                              setNetworkSearch(
                                event.target.value
                              )
                            }
                            placeholder="Search connections..."
                            className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-sky-400 sm:max-w-xs"
                          />
                        </div>

                        {connectedEntries.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-neutral-700 p-5 text-sm text-neutral-500">
                            This entry has no cloud
                            relationships yet.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {connectedEntries.map(
                              ({
                                entry,
                                relationships:
                                  connectedRelationships,
                              }) => (
                                <div
                                  key={entry.id}
                                  className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
                                >
                                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                      <p className="truncate text-lg font-black text-white">
                                        {entry.word}
                                      </p>

                                      <p className="mt-1 text-xs text-neutral-500">
                                        /{entry.slug} ·{" "}
                                        {entry.status}
                                      </p>
                                    </div>

                                    <div className="flex shrink-0 gap-2">
                                      <button
                                        onClick={() =>
                                          selectEntry(
                                            String(entry.id)
                                          )
                                        }
                                        className="rounded-xl bg-neutral-800 px-3 py-2 text-xs font-black text-white hover:bg-neutral-700"
                                      >
                                        Follow
                                      </button>

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

                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {connectedRelationships.map(
                                      (relationship) => (
                                        <span
                                          key={
                                            relationship.id
                                          }
                                          className={`rounded-full border px-3 py-1 text-xs font-black ${getRelationshipClasses(
                                            relationship.type
                                          )}`}
                                        >
                                          {relationship.isBidirectional
                                            ? "↔"
                                            : String(
                                                relationship.sourceEntryId
                                              ) ===
                                              selectedEntryId
                                            ? "→"
                                            : "←"}{" "}
                                          {relationship.type}
                                        </span>
                                      )
                                    )}
                                  </div>

                                  {connectedRelationships
                                    .map((relationship) =>
                                      relationship.note.trim()
                                    )
                                    .filter(Boolean)
                                    .map(
                                      (
                                        relationshipNote,
                                        index
                                      ) => (
                                        <p
                                          key={`${entry.id}-note-${index}`}
                                          className="mt-3 text-sm leading-6 text-neutral-400"
                                        >
                                          {relationshipNote}
                                        </p>
                                      )
                                    )}
                                </div>
                              )
                            )}
                          </div>
                        )}
                      </section>
                    </>
                  ) : (
                    <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
                      Select an entry from the left to
                      explore its complete cloud network.
                    </div>
                  )}
                </section>
              </div>
            ) : (
              <div className="grid gap-5 xl:grid-cols-[0.8fr_1.35fr]">
                <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                  <h3 className="font-black text-white">
                    Browse Cloud Concepts
                  </h3>

                  <p className="mt-1 text-sm text-neutral-500">
                    Select a Supabase concept to view every
                    linked entry.
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
                      No cloud concepts were found.
                    </div>
                  ) : (
                    <div className="mt-4 max-h-[65vh] space-y-2 overflow-y-auto pr-1">
                      {filteredConcepts.map((concept) => {
                        const isSelected =
                          selectedConceptId ===
                          String(concept.id);

                        const usage =
                          conceptUsageCounts.get(
                            String(concept.id)
                          ) ?? 0;

                        return (
                          <button
                            key={concept.id}
                            type="button"
                            onClick={() =>
                              selectConcept(
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
                                {usage} linked
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
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                              Cloud Concept Network
                            </p>

                            <h3 className="mt-2 text-3xl font-black text-white">
                              {selectedConcept.name}
                            </h3>

                            <p className="mt-1 text-sm text-neutral-500">
                              /{selectedConcept.slug} ·{" "}
                              {
                                allSelectedConceptEntries.length
                              }{" "}
                              linked entries
                            </p>
                          </div>

                          <span
                            className={`w-fit rounded-full border px-3 py-2 text-xs font-black ${getConceptColorClasses(
                              selectedConcept.color
                            )}`}
                          >
                            {selectedConcept.category}
                          </span>
                        </div>

                        {selectedConcept.description && (
                          <p className="mt-4 text-sm leading-6 text-neutral-400">
                            {
                              selectedConcept.description
                            }
                          </p>
                        )}
                      </div>

                      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="font-black text-white">
                            Linked Cloud Entries
                          </h3>

                          <p className="mt-1 text-sm text-neutral-500">
                            Follow an entry to return to the
                            entry network.
                          </p>
                        </div>

                        <input
                          value={conceptEntrySearch}
                          onChange={(event) =>
                            setConceptEntrySearch(
                              event.target.value
                            )
                          }
                          placeholder="Search linked entries..."
                          className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-sky-400 sm:max-w-xs"
                        />
                      </div>

                      {filteredSelectedConceptEntries.length ===
                      0 ? (
                        <div className="mt-4 rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
                          {allSelectedConceptEntries.length ===
                          0
                            ? "No entries are linked to this cloud concept."
                            : "No linked entries match your search."}
                        </div>
                      ) : (
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          {filteredSelectedConceptEntries.map(
                            (entry) => {
                              const entryId = String(
                                entry.id
                              );

                              const relationshipCount =
                                relationshipCountsByEntry.get(
                                  entryId
                                ) ?? 0;

                              const conceptCount =
                                conceptCountsByEntry.get(
                                  entryId
                                ) ?? 0;

                              return (
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
                                        {conceptCount} concepts
                                        ·{" "}
                                        {relationshipCount}{" "}
                                        relationships
                                      </p>
                                    </div>

                                    <div className="flex shrink-0 gap-2">
                                      <button
                                        onClick={() =>
                                          selectEntry(
                                            entryId
                                          )
                                        }
                                        className="rounded-xl bg-neutral-800 px-3 py-2 text-xs font-black text-white hover:bg-neutral-700"
                                      >
                                        Follow
                                      </button>

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
                                </div>
                              );
                            }
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
                      Select a cloud concept from the left to
                      explore its linked entries.
                    </div>
                  )}
                </section>
              </div>
            )}
          </>
        )}

        <div className="mt-6 rounded-2xl border border-sky-400/20 bg-sky-400/10 p-4">
          <p className="font-black text-sky-100">
            Alpha 3.7C4B note
          </p>

          <p className="mt-2 text-sm leading-6 text-sky-100/70">
            The Unified Graph Explorer now reads concepts,
            assignments, and relationships directly from
            Supabase. Graph Health and Graph Explorer are
            both fully cloud-backed.
          </p>
        </div>
      </aside>
    </div>
  );
}

export default GraphExplorerDrawer;
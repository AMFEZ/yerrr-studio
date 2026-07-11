"use client";

import { useEffect, useMemo, useState } from "react";
import type { Entry } from "@/types/entry";
import type { Concept, ConceptAssignment } from "@/types/concept";
import type {
  EntryRelationship,
  EntryRelationshipType,
} from "@/types/relationship";

type GraphExplorerDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  entries?: Entry[];
  onOpenEntry?: (entry: Entry) => void;
};

type ExplorerTab = "network" | "concept";

const CONCEPT_STORAGE_KEY = "yerrr-studio-concepts-alpha-3";
const ASSIGNMENT_STORAGE_KEY = "yerrr-studio-concept-assignments-alpha-3";
const RELATIONSHIP_STORAGE_KEY =
  "yerrr-studio-entry-relationships-alpha-3";

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

export function GraphExplorerDrawer({
  isOpen,
  onClose,
  entries = [],
  onOpenEntry,
}: GraphExplorerDrawerProps) {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [assignments, setAssignments] = useState<ConceptAssignment[]>([]);
  const [relationships, setRelationships] = useState<EntryRelationship[]>([]);

  const [activeTab, setActiveTab] = useState<ExplorerTab>("network");
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [selectedConceptId, setSelectedConceptId] = useState("");
  const [entrySearch, setEntrySearch] = useState("");
  const [networkSearch, setNetworkSearch] = useState("");
  const [conceptEntrySearch, setConceptEntrySearch] = useState("");
  const [message, setMessage] = useState("");

  function loadGraphData() {
    try {
      const storedConcepts = window.localStorage.getItem(CONCEPT_STORAGE_KEY);
      const storedAssignments = window.localStorage.getItem(
        ASSIGNMENT_STORAGE_KEY
      );
      const storedRelationships = window.localStorage.getItem(
        RELATIONSHIP_STORAGE_KEY
      );

      const parsedConcepts = storedConcepts
        ? (JSON.parse(storedConcepts) as unknown)
        : [];

      const parsedAssignments = storedAssignments
        ? (JSON.parse(storedAssignments) as unknown)
        : [];

      const parsedRelationships = storedRelationships
        ? (JSON.parse(storedRelationships) as unknown)
        : [];

      setConcepts(
        Array.isArray(parsedConcepts)
          ? (parsedConcepts as Concept[])
          : []
      );

      setAssignments(
        Array.isArray(parsedAssignments)
          ? (parsedAssignments as ConceptAssignment[])
          : []
      );

      setRelationships(
        Array.isArray(parsedRelationships)
          ? (parsedRelationships as EntryRelationship[])
          : []
      );
    } catch {
      setConcepts([]);
      setAssignments([]);
      setRelationships([]);
      setMessage("Local Knowledge Graph data could not be read.");
    }
  }

  useEffect(() => {
    if (!isOpen) return;

    loadGraphData();
    setMessage("");
  }, [isOpen]);

  const entryById = useMemo(() => {
    return new Map(
      entries.map((entry) => [String(entry.id), entry])
    );
  }, [entries]);

  const conceptById = useMemo(() => {
    return new Map(
      concepts.map((concept) => [String(concept.id), concept])
    );
  }, [concepts]);

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) =>
      a.word.localeCompare(b.word)
    );
  }, [entries]);

  const filteredEntryChoices = useMemo(() => {
    const query = entrySearch.trim().toLowerCase();

    if (!query) return sortedEntries;

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

  const validRelationships = useMemo(() => {
    return relationships.filter((relationship) => {
      return (
        entryById.has(String(relationship.sourceEntryId)) &&
        entryById.has(String(relationship.targetEntryId))
      );
    });
  }, [relationships, entryById]);

  const validAssignments = useMemo(() => {
    return assignments.filter((assignment) => {
      return entryById.has(String(assignment.entryId));
    });
  }, [assignments, entryById]);

  const selectedEntryConcepts = useMemo(() => {
    if (!selectedEntryId) return [];

    const assignment = validAssignments.find(
      (currentAssignment) =>
        String(currentAssignment.entryId) === selectedEntryId
    );

    if (!assignment) return [];

    return assignment.conceptIds
      .map((conceptId) => conceptById.get(String(conceptId)))
      .filter((concept): concept is Concept => Boolean(concept));
  }, [
    selectedEntryId,
    validAssignments,
    conceptById,
  ]);

  const selectedEntryRelationships = useMemo(() => {
    if (!selectedEntryId) return [];

    const query = networkSearch.trim().toLowerCase();

    return validRelationships
      .filter((relationship) => {
        return (
          String(relationship.sourceEntryId) === selectedEntryId ||
          String(relationship.targetEntryId) === selectedEntryId
        );
      })
      .filter((relationship) => {
        if (!query) return true;

        const sourceEntry = entryById.get(
          String(relationship.sourceEntryId)
        );
        const targetEntry = entryById.get(
          String(relationship.targetEntryId)
        );

        return (
          sourceEntry?.word.toLowerCase().includes(query) ||
          targetEntry?.word.toLowerCase().includes(query) ||
          relationship.type.toLowerCase().includes(query) ||
          relationship.note.toLowerCase().includes(query)
        );
      });
  }, [
    selectedEntryId,
    validRelationships,
    entryById,
    networkSearch,
  ]);

  const connectedEntries = useMemo(() => {
    const connectedMap = new Map<
      string,
      {
        entry: Entry;
        relationships: EntryRelationship[];
      }
    >();

    selectedEntryRelationships.forEach((relationship) => {
      const sourceId = String(relationship.sourceEntryId);
      const targetId = String(relationship.targetEntryId);

      const connectedId =
        sourceId === selectedEntryId ? targetId : sourceId;

      const connectedEntry = entryById.get(connectedId);

      if (!connectedEntry) return;

      const current = connectedMap.get(connectedId);

      connectedMap.set(connectedId, {
        entry: connectedEntry,
        relationships: [
          ...(current?.relationships ?? []),
          relationship,
        ],
      });
    });

    return Array.from(connectedMap.values()).sort((a, b) =>
      a.entry.word.localeCompare(b.entry.word)
    );
  }, [
    selectedEntryRelationships,
    selectedEntryId,
    entryById,
  ]);

  const conceptUsageCounts = useMemo(() => {
    const counts = new Map<string, number>();

    validAssignments.forEach((assignment) => {
      assignment.conceptIds.forEach((conceptId) => {
        const normalizedId = String(conceptId);

        if (!conceptById.has(normalizedId)) return;

        counts.set(
          normalizedId,
          (counts.get(normalizedId) ?? 0) + 1
        );
      });
    });

    return counts;
  }, [validAssignments, conceptById]);

  const sortedConcepts = useMemo(() => {
    return [...concepts].sort((a, b) => {
      const bUsage = conceptUsageCounts.get(String(b.id)) ?? 0;
      const aUsage = conceptUsageCounts.get(String(a.id)) ?? 0;

      if (bUsage !== aUsage) {
        return bUsage - aUsage;
      }

      return a.name.localeCompare(b.name);
    });
  }, [concepts, conceptUsageCounts]);

  const selectedConceptEntries = useMemo(() => {
    if (!selectedConceptId) return [];

    const query = conceptEntrySearch.trim().toLowerCase();

    const linkedEntryIds = new Set(
      validAssignments
        .filter((assignment) =>
          assignment.conceptIds
            .map(String)
            .includes(selectedConceptId)
        )
        .map((assignment) => String(assignment.entryId))
    );

    return entries
      .filter((entry) =>
        linkedEntryIds.has(String(entry.id))
      )
      .filter((entry) => {
        if (!query) return true;

        return (
          entry.word.toLowerCase().includes(query) ||
          entry.slug.toLowerCase().includes(query) ||
          entry.status.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => a.word.localeCompare(b.word));
  }, [
    selectedConceptId,
    validAssignments,
    entries,
    conceptEntrySearch,
  ]);

  const graphStats = useMemo(() => {
    const relationshipEntryIds = new Set<string>();
    const conceptEntryIds = new Set<string>();

    validRelationships.forEach((relationship) => {
      relationshipEntryIds.add(
        String(relationship.sourceEntryId)
      );
      relationshipEntryIds.add(
        String(relationship.targetEntryId)
      );
    });

    validAssignments.forEach((assignment) => {
      if (assignment.conceptIds.length > 0) {
        conceptEntryIds.add(String(assignment.entryId));
      }
    });

    const fullyConnectedEntries = entries.filter((entry) => {
      const id = String(entry.id);

      return (
        relationshipEntryIds.has(id) &&
        conceptEntryIds.has(id)
      );
    }).length;

    return {
      concepts: concepts.length,
      conceptAssignments: validAssignments.length,
      relationships: validRelationships.length,
      entriesWithConcepts: conceptEntryIds.size,
      entriesWithRelationships: relationshipEntryIds.size,
      fullyConnectedEntries,
    };
  }, [
    entries,
    concepts,
    validAssignments,
    validRelationships,
  ]);

  function selectEntry(entryId: string) {
    setSelectedEntryId(entryId);
    setNetworkSearch("");
    setMessage("");
    setActiveTab("network");
  }

  function selectConcept(conceptId: string) {
    setSelectedConceptId(conceptId);
    setConceptEntrySearch("");
    setMessage("");
    setActiveTab("concept");
  }

  function openEntry(entry: Entry) {
    if (!onOpenEntry) return;

    onClose();
    onOpenEntry(entry);
  }

  function exportSelectedEntryGraph() {
    if (!selectedEntry) return;

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

    relationshipsForExport.forEach((relationship) => {
      connectedEntryIds.add(
        String(relationship.sourceEntryId)
      );
      connectedEntryIds.add(
        String(relationship.targetEntryId)
      );
    });

    connectedEntryIds.delete(String(selectedEntry.id));

    const connectedEntriesForExport = entries.filter((entry) =>
      connectedEntryIds.has(String(entry.id))
    );

    const backup = {
      app: "YERRR Studio",
      version: "Alpha 3.6",
      exportType: "entry_graph_neighborhood",
      exportedAt: new Date().toISOString(),
      entry: selectedEntry,
      concepts: selectedEntryConcepts,
      relationships: relationshipsForExport,
      connectedEntries: connectedEntriesForExport,
      counts: {
        concepts: selectedEntryConcepts.length,
        relationships: relationshipsForExport.length,
        connectedEntries: connectedEntriesForExport.length,
      },
    };

    downloadTextFile(
      `yerrr-entry-graph-${selectedEntry.slug}-${getDateSlug()}.json`,
      JSON.stringify(backup, null, 2),
      "application/json"
    );

    setMessage(
      `Graph neighborhood exported for "${selectedEntry.word}".`
    );
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
      <button
        aria-label="Close graph explorer"
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
              Unified Graph Explorer
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500">
              Explore concepts and entry relationships together in
              one connected view.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-black text-neutral-300 hover:border-neutral-700 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
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
              Assignments
            </p>

            <p className="mt-2 text-2xl font-black text-white">
              {graphStats.conceptAssignments}
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
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border border-neutral-800 bg-neutral-900 p-2">
          <button
            onClick={() => setActiveTab("network")}
            className={`rounded-xl px-4 py-3 text-sm font-black ${
              activeTab === "network"
                ? "bg-yellow-400 text-black"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Entry Network
          </button>

          <button
            onClick={() => setActiveTab("concept")}
            className={`rounded-xl px-4 py-3 text-sm font-black ${
              activeTab === "concept"
                ? "bg-yellow-400 text-black"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Concept Network
          </button>
        </div>

        {message && (
          <div className="mb-5 rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-sm font-bold text-yellow-100">
            {message}
          </div>
        )}

        {activeTab === "network" ? (
          <div className="grid gap-5 xl:grid-cols-[0.8fr_1.35fr]">
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="font-black text-white">
                Select an Entry
              </h3>

              <p className="mt-1 text-sm text-neutral-500">
                Choose one entry to explore its complete graph
                neighborhood.
              </p>

              <input
                value={entrySearch}
                onChange={(event) =>
                  setEntrySearch(event.target.value)
                }
                placeholder="Search entries..."
                className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400"
              />

              <div className="mt-4 max-h-[65vh] space-y-2 overflow-y-auto pr-1">
                {filteredEntryChoices.map((entry) => {
                  const isSelected =
                    selectedEntryId === String(entry.id);

                  const assignment = validAssignments.find(
                    (currentAssignment) =>
                      String(currentAssignment.entryId) ===
                      String(entry.id)
                  );

                  const entryRelationshipCount =
                    validRelationships.filter((relationship) => {
                      return (
                        String(relationship.sourceEntryId) ===
                          String(entry.id) ||
                        String(relationship.targetEntryId) ===
                          String(entry.id)
                      );
                    }).length;

                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() =>
                        selectEntry(String(entry.id))
                      }
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        isSelected
                          ? "border-yellow-400 bg-yellow-400/10"
                          : "border-neutral-800 bg-neutral-950 hover:border-neutral-700"
                      }`}
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

                        <div className="flex shrink-0 gap-1">
                          <span className="rounded-full bg-neutral-800 px-2 py-1 text-[10px] font-black text-neutral-400">
                            {assignment?.conceptIds.length ?? 0} C
                          </span>

                          <span className="rounded-full bg-neutral-800 px-2 py-1 text-[10px] font-black text-neutral-400">
                            {entryRelationshipCount} R
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
                          Selected Entry
                        </p>

                        <h3 className="mt-2 text-3xl font-black text-white">
                          {selectedEntry.word}
                        </h3>

                        <p className="mt-1 text-sm text-neutral-500">
                          /{selectedEntry.slug} ·{" "}
                          {selectedEntry.status}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:flex">
                        {onOpenEntry && (
                          <button
                            onClick={() =>
                              openEntry(selectedEntry)
                            }
                            className="rounded-xl bg-yellow-400 px-4 py-3 text-xs font-black text-black hover:bg-yellow-300"
                          >
                            Open Entry
                          </button>
                        )}

                        <button
                          onClick={exportSelectedEntryGraph}
                          className="rounded-xl bg-neutral-800 px-4 py-3 text-xs font-black text-white hover:bg-neutral-700"
                        >
                          Export Graph
                        </button>
                      </div>
                    </div>

                    {selectedEntry.meanings[0]?.definition && (
                      <p className="mt-4 text-sm leading-6 text-neutral-400">
                        {selectedEntry.meanings[0].definition}
                      </p>
                    )}
                  </div>

                  <section className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="font-black text-white">
                          Assigned Concepts
                        </h3>

                        <p className="mt-1 text-sm text-neutral-500">
                          Semantic and cultural categories connected
                          to this entry.
                        </p>
                      </div>

                      <span className="rounded-full bg-neutral-800 px-3 py-1 text-xs font-black text-neutral-300">
                        {selectedEntryConcepts.length}
                      </span>
                    </div>

                    {selectedEntryConcepts.length === 0 ? (
                      <p className="mt-4 text-sm text-neutral-500">
                        No concepts are assigned to this entry.
                      </p>
                    ) : (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {selectedEntryConcepts.map((concept) => (
                          <button
                            key={concept.id}
                            type="button"
                            onClick={() =>
                              selectConcept(String(concept.id))
                            }
                            className={`rounded-full border px-3 py-2 text-xs font-black ${getConceptColorClasses(
                              concept.color
                            )}`}
                          >
                            {concept.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-black text-white">
                          Direct Relationships
                        </h3>

                        <p className="mt-1 text-sm text-neutral-500">
                          Follow connected entries through the
                          relationship network.
                        </p>
                      </div>

                      <input
                        value={networkSearch}
                        onChange={(event) =>
                          setNetworkSearch(event.target.value)
                        }
                        placeholder="Search connections..."
                        className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400 sm:max-w-xs"
                      />
                    </div>

                    {connectedEntries.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-neutral-700 p-5 text-sm text-neutral-500">
                        This entry has no direct relationships yet.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {connectedEntries.map(
                          ({ entry, relationships: entryRelationships }) => (
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
                                    /{entry.slug} · {entry.status}
                                  </p>
                                </div>

                                <div className="flex shrink-0 gap-2">
                                  <button
                                    onClick={() =>
                                      selectEntry(String(entry.id))
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
                                      className="rounded-xl bg-yellow-400 px-3 py-2 text-xs font-black text-black hover:bg-yellow-300"
                                    >
                                      Open
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="mt-3 flex flex-wrap gap-2">
                                {entryRelationships.map(
                                  (relationship) => (
                                    <span
                                      key={relationship.id}
                                      className={`rounded-full border px-3 py-1 text-xs font-black ${getRelationshipClasses(
                                        relationship.type
                                      )}`}
                                    >
                                      {relationship.isBidirectional
                                        ? "↔"
                                        : String(
                                            relationship.sourceEntryId
                                          ) === selectedEntryId
                                        ? "→"
                                        : "←"}{" "}
                                      {relationship.type}
                                    </span>
                                  )
                                )}
                              </div>

                              {entryRelationships
                                .map((relationship) =>
                                  relationship.note.trim()
                                )
                                .filter(Boolean)
                                .map((relationshipNote, index) => (
                                  <p
                                    key={`${entry.id}-note-${index}`}
                                    className="mt-3 text-sm leading-6 text-neutral-400"
                                  >
                                    {relationshipNote}
                                  </p>
                                ))}
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </section>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
                  Select an entry from the left to explore its
                  complete network.
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[0.8fr_1.35fr]">
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="font-black text-white">
                Browse Concepts
              </h3>

              <p className="mt-1 text-sm text-neutral-500">
                Select a concept to view every linked entry.
              </p>

              {sortedConcepts.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-neutral-700 p-5 text-sm text-neutral-500">
                  No concepts have been created yet.
                </div>
              ) : (
                <div className="mt-4 max-h-[65vh] space-y-2 overflow-y-auto pr-1">
                  {sortedConcepts.map((concept) => {
                    const isSelected =
                      selectedConceptId === String(concept.id);

                    const usage =
                      conceptUsageCounts.get(String(concept.id)) ??
                      0;

                    return (
                      <button
                        key={concept.id}
                        type="button"
                        onClick={() =>
                          selectConcept(String(concept.id))
                        }
                        className={`w-full rounded-2xl border p-4 text-left transition ${
                          isSelected
                            ? "border-yellow-400 bg-yellow-400/10"
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
                          Selected Concept
                        </p>

                        <h3 className="mt-2 text-3xl font-black text-white">
                          {selectedConcept.name}
                        </h3>

                        <p className="mt-1 text-sm text-neutral-500">
                          /{selectedConcept.slug} ·{" "}
                          {selectedConceptEntries.length} linked
                          entries
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
                        {selectedConcept.description}
                      </p>
                    )}
                  </div>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-black text-white">
                        Linked Entries
                      </h3>

                      <p className="mt-1 text-sm text-neutral-500">
                        Follow an entry to switch back into the
                        entry network.
                      </p>
                    </div>

                    <input
                      value={conceptEntrySearch}
                      onChange={(event) =>
                        setConceptEntrySearch(event.target.value)
                      }
                      placeholder="Search linked entries..."
                      className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400 sm:max-w-xs"
                    />
                  </div>

                  {selectedConceptEntries.length === 0 ? (
                    <div className="mt-4 rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
                      No entries are linked to this concept.
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {selectedConceptEntries.map((entry) => {
                        const entryRelationshipCount =
                          validRelationships.filter(
                            (relationship) => {
                              return (
                                String(
                                  relationship.sourceEntryId
                                ) === String(entry.id) ||
                                String(
                                  relationship.targetEntryId
                                ) === String(entry.id)
                              );
                            }
                          ).length;

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
                                  /{entry.slug} ·{" "}
                                  {entryRelationshipCount} direct
                                  relationship
                                  {entryRelationshipCount === 1
                                    ? ""
                                    : "s"}
                                </p>
                              </div>

                              <div className="flex shrink-0 gap-2">
                                <button
                                  onClick={() =>
                                    selectEntry(String(entry.id))
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
                                    className="rounded-xl bg-yellow-400 px-3 py-2 text-xs font-black text-black hover:bg-yellow-300"
                                  >
                                    Open
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
                  Select a concept from the left to explore its
                  linked entries.
                </div>
              )}
            </section>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
          <p className="font-black text-yellow-100">
            Alpha 3.6 note
          </p>

          <p className="mt-2 text-sm leading-6 text-yellow-100/70">
            The Unified Graph Explorer combines entry concepts and
            direct relationships. The next step will move the local
            Knowledge Graph into Supabase so it works across devices
            and production sessions.
          </p>
        </div>
      </aside>
    </div>
  );
}

export default GraphExplorerDrawer;
"use client";

import { useMemo, useState } from "react";

import type { Entry } from "@/types/entry";
import type { Concept } from "@/types/concept";

import { useCloudKnowledgeGraph } from "@/hooks/useCloudKnowledgeGraph";

type GraphStatsDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  entries?: Entry[];
  onOpenConcepts?: () => void;
  onOpenEntry?: (entry: Entry) => void;
};

type GapView =
  | "missing-concepts"
  | "missing-relationships"
  | "unused-concepts";

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

function getScoreLabel(score: number) {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Strong";
  if (score >= 50) return "Building";
  if (score >= 25) return "Early";
  return "Starting";
}

function getScoreClasses(score: number) {
  if (score >= 75) {
    return "border-green-400/30 bg-green-400/10 text-green-100";
  }

  if (score >= 50) {
    return "border-yellow-400/30 bg-yellow-400/10 text-yellow-100";
  }

  return "border-orange-400/30 bg-orange-400/10 text-orange-100";
}

export function GraphStatsDrawer({
  isOpen,
  onClose,
  entries = [],
  onOpenConcepts,
  onOpenEntry,
}: GraphStatsDrawerProps) {
  const {
    concepts,
    assignments,
    relationships,
    isLoading,
    hasLoaded,
    error,
    refresh,
  } = useCloudKnowledgeGraph(isOpen);

  const [gapView, setGapView] =
    useState<GapView>("missing-concepts");

  const [search, setSearch] = useState("");

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

  const analysis = useMemo(() => {
    const entryConceptCounts = new Map<string, number>();
    const conceptUsageCounts = new Map<string, number>();
    const entryRelationshipCounts = new Map<string, number>();

    let validConceptLinks = 0;
    let unmatchedConceptLinks = 0;
    let validRelationships = 0;
    let unmatchedRelationships = 0;

    assignments.forEach((assignment) => {
      const entryId = String(assignment.entryId);
      const entryExists = entryById.has(entryId);

      const uniqueConceptIds = Array.from(
        new Set(assignment.conceptIds.map(String))
      );

      uniqueConceptIds.forEach((conceptId) => {
        const conceptExists = conceptById.has(conceptId);

        if (!entryExists || !conceptExists) {
          unmatchedConceptLinks += 1;
          return;
        }

        validConceptLinks += 1;

        entryConceptCounts.set(
          entryId,
          (entryConceptCounts.get(entryId) ?? 0) + 1
        );

        conceptUsageCounts.set(
          conceptId,
          (conceptUsageCounts.get(conceptId) ?? 0) + 1
        );
      });
    });

    relationships.forEach((relationship) => {
      const sourceEntryId = String(
        relationship.sourceEntryId
      );

      const targetEntryId = String(
        relationship.targetEntryId
      );

      const sourceExists =
        entryById.has(sourceEntryId);

      const targetExists =
        entryById.has(targetEntryId);

      if (!sourceExists || !targetExists) {
        unmatchedRelationships += 1;
        return;
      }

      validRelationships += 1;

      entryRelationshipCounts.set(
        sourceEntryId,
        (entryRelationshipCounts.get(sourceEntryId) ??
          0) + 1
      );

      entryRelationshipCounts.set(
        targetEntryId,
        (entryRelationshipCounts.get(targetEntryId) ??
          0) + 1
      );
    });

    const entriesWithConcepts = entries.filter(
      (entry) =>
        (entryConceptCounts.get(String(entry.id)) ?? 0) >
        0
    );

    const entriesWithoutConcepts = entries.filter(
      (entry) =>
        (entryConceptCounts.get(String(entry.id)) ?? 0) ===
        0
    );

    const entriesWithRelationships = entries.filter(
      (entry) =>
        (entryRelationshipCounts.get(String(entry.id)) ??
          0) > 0
    );

    const entriesWithoutRelationships = entries.filter(
      (entry) =>
        (entryRelationshipCounts.get(String(entry.id)) ??
          0) === 0
    );

    const fullyConnectedEntries = entries.filter(
      (entry) => {
        const entryId = String(entry.id);

        return (
          (entryConceptCounts.get(entryId) ?? 0) > 0 &&
          (entryRelationshipCounts.get(entryId) ?? 0) > 0
        );
      }
    );

    const usedConcepts = concepts.filter(
      (concept) =>
        (conceptUsageCounts.get(String(concept.id)) ??
          0) > 0
    );

    const unusedConcepts = concepts.filter(
      (concept) =>
        (conceptUsageCounts.get(String(concept.id)) ??
          0) === 0
    );

    const mostUsedConcepts = concepts
      .map((concept) => ({
        concept,
        count:
          conceptUsageCounts.get(String(concept.id)) ??
          0,
      }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const mostConnectedEntries = entries
      .map((entry) => ({
        entry,
        relationshipCount:
          entryRelationshipCounts.get(String(entry.id)) ??
          0,
        conceptCount:
          entryConceptCounts.get(String(entry.id)) ?? 0,
      }))
      .filter(
        (item) =>
          item.relationshipCount > 0 ||
          item.conceptCount > 0
      )
      .sort((a, b) => {
        if (
          b.relationshipCount !==
          a.relationshipCount
        ) {
          return (
            b.relationshipCount -
            a.relationshipCount
          );
        }

        return b.conceptCount - a.conceptCount;
      })
      .slice(0, 8);

    const entryConceptCoverage =
      entries.length > 0
        ? Math.round(
            (entriesWithConcepts.length /
              entries.length) *
              100
          )
        : 0;

    const relationshipCoverage =
      entries.length > 0
        ? Math.round(
            (entriesWithRelationships.length /
              entries.length) *
              100
          )
        : 0;

    const conceptUsageCoverage =
      concepts.length > 0
        ? Math.round(
            (usedConcepts.length / concepts.length) *
              100
          )
        : 0;

    const healthScore = Math.round(
      entryConceptCoverage * 0.45 +
        relationshipCoverage * 0.35 +
        conceptUsageCoverage * 0.2
    );

    const averageConceptsPerAssignedEntry =
      entriesWithConcepts.length > 0
        ? validConceptLinks /
          entriesWithConcepts.length
        : 0;

    const averageRelationshipsPerConnectedEntry =
      entriesWithRelationships.length > 0
        ? (validRelationships * 2) /
          entriesWithRelationships.length
        : 0;

    return {
      validConceptLinks,
      unmatchedConceptLinks,
      validRelationships,
      unmatchedRelationships,

      entryConceptCounts,
      conceptUsageCounts,
      entryRelationshipCounts,

      entriesWithConcepts,
      entriesWithoutConcepts,

      entriesWithRelationships,
      entriesWithoutRelationships,

      fullyConnectedEntries,

      usedConcepts,
      unusedConcepts,

      mostUsedConcepts,
      mostConnectedEntries,

      entryConceptCoverage,
      relationshipCoverage,
      conceptUsageCoverage,
      healthScore,

      averageConceptsPerAssignedEntry,
      averageRelationshipsPerConnectedEntry,
    };
  }, [
    assignments,
    concepts,
    entries,
    entryById,
    conceptById,
    relationships,
  ]);

  const filteredEntriesWithoutConcepts = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return analysis.entriesWithoutConcepts;
    }

    return analysis.entriesWithoutConcepts.filter(
      (entry) => {
        return (
          entry.word.toLowerCase().includes(query) ||
          entry.slug.toLowerCase().includes(query) ||
          entry.status.toLowerCase().includes(query)
        );
      }
    );
  }, [
    analysis.entriesWithoutConcepts,
    search,
  ]);

  const filteredEntriesWithoutRelationships =
    useMemo(() => {
      const query = search.trim().toLowerCase();

      if (!query) {
        return analysis.entriesWithoutRelationships;
      }

      return analysis.entriesWithoutRelationships.filter(
        (entry) => {
          return (
            entry.word.toLowerCase().includes(query) ||
            entry.slug.toLowerCase().includes(query) ||
            entry.status.toLowerCase().includes(query)
          );
        }
      );
    }, [
      analysis.entriesWithoutRelationships,
      search,
    ]);

  const filteredUnusedConcepts = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return analysis.unusedConcepts;
    }

    return analysis.unusedConcepts.filter(
      (concept) => {
        return (
          concept.name.toLowerCase().includes(query) ||
          concept.slug.toLowerCase().includes(query) ||
          concept.category.toLowerCase().includes(query)
        );
      }
    );
  }, [analysis.unusedConcepts, search]);

  function openEntry(entry: Entry) {
    if (!onOpenEntry) return;

    onClose();
    onOpenEntry(entry);
  }

  function openCloudConcepts() {
    onClose();
    onOpenConcepts?.();
  }

  function exportHealthReport() {
    const report = {
      app: "YERRR Studio",
      version: "Alpha 3.7C4A",
      source: "Supabase",
      exportType: "cloud_graph_health_report",
      exportedAt: new Date().toISOString(),

      summary: {
        healthScore: analysis.healthScore,
        healthLabel: getScoreLabel(
          analysis.healthScore
        ),

        totalEntries: entries.length,
        totalConcepts: concepts.length,

        entryConceptCoverage:
          analysis.entryConceptCoverage,

        relationshipCoverage:
          analysis.relationshipCoverage,

        conceptUsageCoverage:
          analysis.conceptUsageCoverage,

        entriesWithConcepts:
          analysis.entriesWithConcepts.length,

        entriesWithoutConcepts:
          analysis.entriesWithoutConcepts.length,

        entriesWithRelationships:
          analysis.entriesWithRelationships.length,

        entriesWithoutRelationships:
          analysis.entriesWithoutRelationships.length,

        fullyConnectedEntries:
          analysis.fullyConnectedEntries.length,

        validConceptLinks:
          analysis.validConceptLinks,

        validRelationships:
          analysis.validRelationships,

        unmatchedConceptLinks:
          analysis.unmatchedConceptLinks,

        unmatchedRelationships:
          analysis.unmatchedRelationships,

        averageConceptsPerAssignedEntry:
          analysis.averageConceptsPerAssignedEntry,

        averageRelationshipsPerConnectedEntry:
          analysis.averageRelationshipsPerConnectedEntry,
      },

      mostUsedConcepts:
        analysis.mostUsedConcepts.map(
          ({ concept, count }) => ({
            conceptId: concept.id,
            name: concept.name,
            slug: concept.slug,
            category: concept.category,
            linkedEntries: count,
          })
        ),

      mostConnectedEntries:
        analysis.mostConnectedEntries.map(
          ({
            entry,
            relationshipCount,
            conceptCount,
          }) => ({
            entryId: entry.id,
            word: entry.word,
            slug: entry.slug,
            relationshipCount,
            conceptCount,
          })
        ),

      entriesWithoutConcepts:
        analysis.entriesWithoutConcepts.map(
          (entry) => ({
            entryId: entry.id,
            word: entry.word,
            slug: entry.slug,
            status: entry.status,
          })
        ),

      entriesWithoutRelationships:
        analysis.entriesWithoutRelationships.map(
          (entry) => ({
            entryId: entry.id,
            word: entry.word,
            slug: entry.slug,
            status: entry.status,
          })
        ),

      unusedConcepts: analysis.unusedConcepts,
    };

    downloadTextFile(
      `yerrr-cloud-graph-health-${getDateSlug()}.json`,
      JSON.stringify(report, null, 2),
      "application/json"
    );
  }

  if (!isOpen) return null;

  const scoreLabel = getScoreLabel(
    analysis.healthScore
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
      <button
        aria-label="Close cloud graph health"
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
              Cloud Graph Health
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500">
              Measure cloud concept coverage,
              relationship coverage, unused concepts,
              and entries that still need graph
              connections.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-black text-neutral-300 hover:border-neutral-700 hover:text-white"
          >
            ✕
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
              Loading cloud graph health...
            </p>

            <p className="mt-2 text-sm text-neutral-500">
              Reading concepts, assignments, and
              relationships from Supabase.
            </p>
          </div>
        ) : (
          <>
            <section
              className={`mb-5 rounded-3xl border p-5 ${getScoreClasses(
                analysis.healthScore
              )}`}
            >
              <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.25em] opacity-70">
                    Overall Cloud Graph Health
                  </p>

                  <div className="mt-2 flex items-end gap-3">
                    <p className="text-5xl font-black">
                      {analysis.healthScore}%
                    </p>

                    <p className="pb-1 text-lg font-black opacity-80">
                      {scoreLabel}
                    </p>
                  </div>

                  <p className="mt-3 max-w-2xl text-sm leading-6 opacity-75">
                    The score combines entry concept
                    coverage, entry relationship coverage,
                    and concept usage.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => void refresh()}
                    disabled={isLoading}
                    className="rounded-xl bg-black/20 px-4 py-3 text-sm font-black hover:bg-black/30 disabled:opacity-40"
                  >
                    {isLoading
                      ? "Refreshing..."
                      : "Refresh Cloud"}
                  </button>

                  <button
                    onClick={exportHealthReport}
                    className="rounded-xl bg-black/20 px-4 py-3 text-sm font-black hover:bg-black/30"
                  >
                    Export Report
                  </button>
                </div>
              </div>

              <div className="mt-5 h-3 overflow-hidden rounded-full bg-black/20">
                <div
                  className="h-full rounded-full bg-current transition-all"
                  style={{
                    width: `${Math.min(
                      analysis.healthScore,
                      100
                    )}%`,
                  }}
                />
              </div>
            </section>

            <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                  Concept Coverage
                </p>

                <p className="mt-2 text-2xl font-black text-white">
                  {analysis.entryConceptCoverage}%
                </p>

                <p className="mt-1 text-xs text-neutral-500">
                  {analysis.entriesWithConcepts.length}/
                  {entries.length} entries
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                  Relationship Coverage
                </p>

                <p className="mt-2 text-2xl font-black text-white">
                  {analysis.relationshipCoverage}%
                </p>

                <p className="mt-1 text-xs text-neutral-500">
                  {
                    analysis.entriesWithRelationships
                      .length
                  }
                  /{entries.length} entries
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                  Concept Usage
                </p>

                <p className="mt-2 text-2xl font-black text-white">
                  {analysis.conceptUsageCoverage}%
                </p>

                <p className="mt-1 text-xs text-neutral-500">
                  {analysis.usedConcepts.length}/
                  {concepts.length} concepts
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                  Concept Links
                </p>

                <p className="mt-2 text-2xl font-black text-white">
                  {analysis.validConceptLinks}
                </p>

                <p className="mt-1 text-xs text-neutral-500">
                  {analysis.averageConceptsPerAssignedEntry.toFixed(
                    1
                  )}{" "}
                  average
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                  Relationships
                </p>

                <p className="mt-2 text-2xl font-black text-white">
                  {analysis.validRelationships}
                </p>

                <p className="mt-1 text-xs text-neutral-500">
                  {analysis.averageRelationshipsPerConnectedEntry.toFixed(
                    1
                  )}{" "}
                  average
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                  Fully Connected
                </p>

                <p className="mt-2 text-2xl font-black text-white">
                  {
                    analysis.fullyConnectedEntries
                      .length
                  }
                </p>

                <p className="mt-1 text-xs text-neutral-500">
                  concepts + relationships
                </p>
              </div>
            </section>

            <div className="grid gap-5 xl:grid-cols-2">
              <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <div className="mb-4">
                  <h3 className="font-black text-white">
                    Most Used Cloud Concepts
                  </h3>

                  <p className="mt-1 text-sm text-neutral-500">
                    Supabase concepts linked to the most
                    entries.
                  </p>
                </div>

                {analysis.mostUsedConcepts.length ===
                0 ? (
                  <div className="rounded-xl border border-dashed border-neutral-700 p-5 text-sm text-neutral-500">
                    No cloud concepts have been assigned
                    yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {analysis.mostUsedConcepts.map(
                      ({ concept, count }, index) => (
                        <div
                          key={concept.id}
                          className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-800 text-sm font-black text-neutral-300">
                              {index + 1}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="truncate font-black text-white">
                                {concept.name}
                              </p>

                              <p className="mt-1 text-xs text-neutral-500">
                                /{concept.slug}
                              </p>
                            </div>

                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-black ${getConceptColorClasses(
                                concept.color
                              )}`}
                            >
                              {count} linked
                            </span>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <div className="mb-4">
                  <h3 className="font-black text-white">
                    Most Connected Entries
                  </h3>

                  <p className="mt-1 text-sm text-neutral-500">
                    Entries with the strongest cloud graph
                    presence.
                  </p>
                </div>

                {analysis.mostConnectedEntries.length ===
                0 ? (
                  <div className="rounded-xl border border-dashed border-neutral-700 p-5 text-sm text-neutral-500">
                    No cloud graph connections exist yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {analysis.mostConnectedEntries.map(
                      (
                        {
                          entry,
                          relationshipCount,
                          conceptCount,
                        },
                        index
                      ) => (
                        <div
                          key={entry.id}
                          className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-800 text-sm font-black text-neutral-300">
                              {index + 1}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="truncate font-black text-white">
                                {entry.word}
                              </p>

                              <p className="mt-1 text-xs text-neutral-500">
                                {conceptCount} concepts ·{" "}
                                {relationshipCount}{" "}
                                relationships
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
                      )
                    )}
                  </div>
                )}
              </section>
            </div>

            <section className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="font-black text-white">
                    Cloud Coverage Gaps
                  </h3>

                  <p className="mt-1 text-sm text-neutral-500">
                    Find entries and concepts that still
                    need permanent graph connections.
                  </p>
                </div>

                <button
                  onClick={openCloudConcepts}
                  className="rounded-xl bg-sky-400 px-4 py-3 text-xs font-black text-black hover:bg-sky-300"
                >
                  Manage Cloud Concepts
                </button>
              </div>

              <div className="mb-4 grid gap-2 rounded-xl border border-neutral-800 bg-neutral-950 p-2 md:grid-cols-3">
                <button
                  onClick={() => {
                    setGapView("missing-concepts");
                    setSearch("");
                  }}
                  className={`rounded-lg px-3 py-3 text-xs font-black sm:text-sm ${
                    gapView === "missing-concepts"
                      ? "bg-sky-400 text-black"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  Missing Concepts ·{" "}
                  {
                    analysis.entriesWithoutConcepts
                      .length
                  }
                </button>

                <button
                  onClick={() => {
                    setGapView(
                      "missing-relationships"
                    );
                    setSearch("");
                  }}
                  className={`rounded-lg px-3 py-3 text-xs font-black sm:text-sm ${
                    gapView ===
                    "missing-relationships"
                      ? "bg-sky-400 text-black"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  Missing Relationships ·{" "}
                  {
                    analysis
                      .entriesWithoutRelationships
                      .length
                  }
                </button>

                <button
                  onClick={() => {
                    setGapView("unused-concepts");
                    setSearch("");
                  }}
                  className={`rounded-lg px-3 py-3 text-xs font-black sm:text-sm ${
                    gapView === "unused-concepts"
                      ? "bg-sky-400 text-black"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  Unused Concepts ·{" "}
                  {analysis.unusedConcepts.length}
                </button>
              </div>

              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder={
                  gapView === "unused-concepts"
                    ? "Search unused concepts..."
                    : "Search entries..."
                }
                className="mb-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-sky-400"
              />

              {gapView === "missing-concepts" ? (
                filteredEntriesWithoutConcepts.length ===
                0 ? (
                  <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
                    {analysis.entriesWithoutConcepts
                      .length === 0
                      ? "Every entry has at least one cloud concept."
                      : "No entries match your search."}
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {filteredEntriesWithoutConcepts
                      .slice(0, 40)
                      .map((entry) => (
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
                                {entry.status}
                              </p>
                            </div>

                            {onOpenEntry && (
                              <button
                                onClick={() =>
                                  openEntry(entry)
                                }
                                className="rounded-xl bg-neutral-800 px-3 py-2 text-xs font-black text-white hover:bg-neutral-700"
                              >
                                Open
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )
              ) : gapView ===
                "missing-relationships" ? (
                filteredEntriesWithoutRelationships.length ===
                0 ? (
                  <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
                    {analysis
                      .entriesWithoutRelationships
                      .length === 0
                      ? "Every entry has at least one cloud relationship."
                      : "No entries match your search."}
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {filteredEntriesWithoutRelationships
                      .slice(0, 40)
                      .map((entry) => (
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
                                {entry.status}
                              </p>
                            </div>

                            {onOpenEntry && (
                              <button
                                onClick={() =>
                                  openEntry(entry)
                                }
                                className="rounded-xl bg-neutral-800 px-3 py-2 text-xs font-black text-white hover:bg-neutral-700"
                              >
                                Open
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )
              ) : filteredUnusedConcepts.length ===
                0 ? (
                <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
                  {analysis.unusedConcepts.length === 0
                    ? "Every cloud concept is linked to at least one entry."
                    : "No concepts match your search."}
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {filteredUnusedConcepts.map(
                    (concept) => (
                      <div
                        key={concept.id}
                        className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
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

                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-black ${getConceptColorClasses(
                              concept.color
                            )}`}
                          >
                            {concept.category}
                          </span>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </section>

            <section className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="font-black text-white">
                Cloud Data Integrity
              </h3>

              <p className="mt-1 text-sm leading-6 text-neutral-500">
                These counts identify Supabase graph
                records that could not be matched to the
                entries or concepts currently loaded in
                Studio.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                    Unmatched Concept Links
                  </p>

                  <p className="mt-2 text-2xl font-black text-white">
                    {analysis.unmatchedConceptLinks}
                  </p>
                </div>

                <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                    Unmatched Relationships
                  </p>

                  <p className="mt-2 text-2xl font-black text-white">
                    {analysis.unmatchedRelationships}
                  </p>
                </div>
              </div>

              <div
                className={`mt-4 rounded-xl border p-4 text-sm ${
                  analysis.unmatchedConceptLinks === 0 &&
                  analysis.unmatchedRelationships === 0
                    ? "border-green-400/20 bg-green-400/10 text-green-100"
                    : "border-orange-400/20 bg-orange-400/10 text-orange-100"
                }`}
              >
                {analysis.unmatchedConceptLinks === 0 &&
                analysis.unmatchedRelationships === 0
                  ? "All Supabase graph records match the current Studio entries and concepts."
                  : "Some cloud graph records could not be matched to the data currently loaded in Studio."}
              </div>
            </section>
          </>
        )}

        <div className="mt-6 rounded-2xl border border-sky-400/20 bg-sky-400/10 p-4">
          <p className="font-black text-sky-100">
            Alpha 3.7C4A note
          </p>

          <p className="mt-2 text-sm leading-6 text-sky-100/70">
            Graph Health now reads concepts, assignments,
            and relationships directly from Supabase. The
            next step converts the Unified Graph Explorer
            to the same permanent cloud source.
          </p>
        </div>
      </aside>
    </div>
  );
}

export default GraphStatsDrawer;
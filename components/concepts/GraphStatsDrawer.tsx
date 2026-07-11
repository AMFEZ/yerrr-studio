"use client";

import { useEffect, useMemo, useState } from "react";
import type { Entry } from "@/types/entry";
import type { Concept, ConceptAssignment } from "@/types/concept";

type GraphStatsDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  entries?: Entry[];
  onOpenConcepts?: () => void;
  onOpenEntry?: (entry: Entry) => void;
};

type GapView = "entries" | "concepts";

const CONCEPT_STORAGE_KEY = "yerrr-studio-concepts-alpha-3";
const ASSIGNMENT_STORAGE_KEY = "yerrr-studio-concept-assignments-alpha-3";

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

function getDateSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function escapeCsvValue(value: unknown) {
  const stringValue = String(value ?? "");
  return `"${stringValue.replace(/"/g, '""')}"`;
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
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [assignments, setAssignments] = useState<ConceptAssignment[]>([]);
  const [gapView, setGapView] = useState<GapView>("entries");
  const [search, setSearch] = useState("");
  const [lastScannedAt, setLastScannedAt] = useState("");

  function loadGraphData() {
    try {
      const storedConcepts = window.localStorage.getItem(CONCEPT_STORAGE_KEY);
      const storedAssignments = window.localStorage.getItem(
        ASSIGNMENT_STORAGE_KEY
      );

      const parsedConcepts = storedConcepts
        ? (JSON.parse(storedConcepts) as unknown)
        : [];

      const parsedAssignments = storedAssignments
        ? (JSON.parse(storedAssignments) as unknown)
        : [];

      setConcepts(Array.isArray(parsedConcepts) ? parsedConcepts : []);
      setAssignments(
        Array.isArray(parsedAssignments) ? parsedAssignments : []
      );
    } catch {
      setConcepts([]);
      setAssignments([]);
    }

    setLastScannedAt(new Date().toISOString());
  }

  useEffect(() => {
    if (!isOpen) return;

    loadGraphData();
  }, [isOpen]);

  const graphAnalysis = useMemo(() => {
    const entryById = new Map(
      entries.map((entry) => [String(entry.id), entry])
    );

    const conceptById = new Map(
      concepts.map((concept) => [String(concept.id), concept])
    );

    const conceptUsageCounts = new Map<string, number>();
    const entryConceptCounts = new Map<string, number>();

    let totalValidLinks = 0;
    let orphanedEntryLinks = 0;
    let orphanedConceptLinks = 0;

    assignments.forEach((assignment) => {
      const entryId = String(assignment.entryId);
      const entryExists = entryById.has(entryId);
      const uniqueConceptIds = Array.from(
        new Set(assignment.conceptIds.map(String))
      );

      if (!entryExists) {
        orphanedEntryLinks += uniqueConceptIds.length;
      }

      uniqueConceptIds.forEach((conceptId) => {
        const conceptExists = conceptById.has(conceptId);

        if (!conceptExists) {
          orphanedConceptLinks += 1;
          return;
        }

        if (!entryExists) return;

        totalValidLinks += 1;

        conceptUsageCounts.set(
          conceptId,
          (conceptUsageCounts.get(conceptId) ?? 0) + 1
        );

        entryConceptCounts.set(
          entryId,
          (entryConceptCounts.get(entryId) ?? 0) + 1
        );
      });
    });

    const assignedEntries = entries.filter(
      (entry) => (entryConceptCounts.get(String(entry.id)) ?? 0) > 0
    );

    const unassignedEntries = entries.filter(
      (entry) => (entryConceptCounts.get(String(entry.id)) ?? 0) === 0
    );

    const usedConcepts = concepts.filter(
      (concept) => (conceptUsageCounts.get(String(concept.id)) ?? 0) > 0
    );

    const unusedConcepts = concepts.filter(
      (concept) => (conceptUsageCounts.get(String(concept.id)) ?? 0) === 0
    );

    const mostUsedConcepts = concepts
      .map((concept) => ({
        concept,
        count: conceptUsageCounts.get(String(concept.id)) ?? 0,
      }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const mostConnectedEntries = entries
      .map((entry) => ({
        entry,
        count: entryConceptCounts.get(String(entry.id)) ?? 0,
      }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const categoryMap = new Map<string, number>();

    concepts.forEach((concept) => {
      categoryMap.set(
        concept.category,
        (categoryMap.get(concept.category) ?? 0) + 1
      );
    });

    const categoryBreakdown = Array.from(categoryMap.entries())
      .map(([category, count]) => ({
        category,
        count,
      }))
      .sort((a, b) => b.count - a.count);

    const entryCoverage =
      entries.length > 0
        ? Math.round((assignedEntries.length / entries.length) * 100)
        : 0;

    const conceptCoverage =
      concepts.length > 0
        ? Math.round((usedConcepts.length / concepts.length) * 100)
        : 0;

    const healthScore = Math.round(
      entryCoverage * 0.7 + conceptCoverage * 0.3
    );

    const averageLinksPerAssignedEntry =
      assignedEntries.length > 0
        ? totalValidLinks / assignedEntries.length
        : 0;

    return {
      totalEntries: entries.length,
      totalConcepts: concepts.length,
      totalAssignments: assignments.length,
      totalValidLinks,
      orphanedEntryLinks,
      orphanedConceptLinks,
      orphanedLinks: orphanedEntryLinks + orphanedConceptLinks,
      assignedEntries,
      unassignedEntries,
      usedConcepts,
      unusedConcepts,
      mostUsedConcepts,
      mostConnectedEntries,
      categoryBreakdown,
      entryCoverage,
      conceptCoverage,
      healthScore,
      averageLinksPerAssignedEntry,
    };
  }, [entries, concepts, assignments]);

  const filteredUnassignedEntries = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return graphAnalysis.unassignedEntries;

    return graphAnalysis.unassignedEntries.filter((entry) => {
      return (
        entry.word.toLowerCase().includes(query) ||
        entry.slug.toLowerCase().includes(query) ||
        entry.status.toLowerCase().includes(query)
      );
    });
  }, [graphAnalysis.unassignedEntries, search]);

  const filteredUnusedConcepts = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return graphAnalysis.unusedConcepts;

    return graphAnalysis.unusedConcepts.filter((concept) => {
      return (
        concept.name.toLowerCase().includes(query) ||
        concept.slug.toLowerCase().includes(query) ||
        concept.category.toLowerCase().includes(query)
      );
    });
  }, [graphAnalysis.unusedConcepts, search]);

  function openConceptManager() {
    onClose();
    onOpenConcepts?.();
  }

  function openEntry(entry: Entry) {
    if (!onOpenEntry) return;

    onClose();
    onOpenEntry(entry);
  }

  function exportHealthReportJson() {
    const report = {
      app: "YERRR Studio",
      version: "Alpha 3.3",
      exportType: "knowledge_graph_health_report",
      exportedAt: new Date().toISOString(),
      summary: {
        healthScore: graphAnalysis.healthScore,
        healthLabel: getScoreLabel(graphAnalysis.healthScore),
        entryCoverage: graphAnalysis.entryCoverage,
        conceptCoverage: graphAnalysis.conceptCoverage,
        totalEntries: graphAnalysis.totalEntries,
        assignedEntries: graphAnalysis.assignedEntries.length,
        unassignedEntries: graphAnalysis.unassignedEntries.length,
        totalConcepts: graphAnalysis.totalConcepts,
        usedConcepts: graphAnalysis.usedConcepts.length,
        unusedConcepts: graphAnalysis.unusedConcepts.length,
        totalValidLinks: graphAnalysis.totalValidLinks,
        averageLinksPerAssignedEntry:
          graphAnalysis.averageLinksPerAssignedEntry,
        orphanedEntryLinks: graphAnalysis.orphanedEntryLinks,
        orphanedConceptLinks: graphAnalysis.orphanedConceptLinks,
      },
      mostUsedConcepts: graphAnalysis.mostUsedConcepts.map((item) => ({
        conceptId: item.concept.id,
        name: item.concept.name,
        slug: item.concept.slug,
        category: item.concept.category,
        linkedEntries: item.count,
      })),
      mostConnectedEntries: graphAnalysis.mostConnectedEntries.map((item) => ({
        entryId: item.entry.id,
        word: item.entry.word,
        slug: item.entry.slug,
        conceptCount: item.count,
      })),
      unassignedEntries: graphAnalysis.unassignedEntries.map((entry) => ({
        entryId: entry.id,
        word: entry.word,
        slug: entry.slug,
        status: entry.status,
      })),
      unusedConcepts: graphAnalysis.unusedConcepts,
      categoryBreakdown: graphAnalysis.categoryBreakdown,
    };

    downloadTextFile(
      `yerrr-graph-health-${getDateSlug()}.json`,
      JSON.stringify(report, null, 2),
      "application/json"
    );
  }

  function exportGapCsv() {
    const headers = [
      "gapType",
      "id",
      "name",
      "slug",
      "statusOrCategory",
    ];

    const unassignedRows = graphAnalysis.unassignedEntries.map((entry) => [
      "unassigned_entry",
      entry.id,
      entry.word,
      entry.slug,
      entry.status,
    ]);

    const unusedConceptRows = graphAnalysis.unusedConcepts.map((concept) => [
      "unused_concept",
      concept.id,
      concept.name,
      concept.slug,
      concept.category,
    ]);

    const rows = [...unassignedRows, ...unusedConceptRows];

    const csv = [
      headers.map(escapeCsvValue).join(","),
      ...rows.map((row) => row.map(escapeCsvValue).join(",")),
    ].join("\n");

    downloadTextFile(
      `yerrr-graph-coverage-gaps-${getDateSlug()}.csv`,
      csv,
      "text/csv"
    );
  }

  if (!isOpen) return null;

  const scoreLabel = getScoreLabel(graphAnalysis.healthScore);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
      <button
        aria-label="Close graph health"
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
              Graph Health
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500">
              Measure concept coverage, discover unconnected entries, find
              unused concepts, and identify the strongest parts of the graph.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-black text-neutral-300 hover:border-neutral-700 hover:text-white"
          >
            ✕
          </button>
        </div>

        <section
          className={`mb-5 rounded-3xl border p-5 ${getScoreClasses(
            graphAnalysis.healthScore
          )}`}
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] opacity-70">
                Overall Graph Health
              </p>

              <div className="mt-2 flex items-end gap-3">
                <p className="text-5xl font-black">
                  {graphAnalysis.healthScore}%
                </p>

                <p className="pb-1 text-lg font-black opacity-80">
                  {scoreLabel}
                </p>
              </div>

              <p className="mt-3 max-w-2xl text-sm leading-6 opacity-75">
                The score combines entry assignment coverage and concept usage.
                Entry coverage has more weight because every slang entry should
                eventually connect to the graph.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button
                onClick={loadGraphData}
                className="rounded-xl bg-black/20 px-4 py-3 text-sm font-black hover:bg-black/30"
              >
                Refresh Scan
              </button>

              <button
                onClick={exportHealthReportJson}
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
                width: `${Math.min(graphAnalysis.healthScore, 100)}%`,
              }}
            />
          </div>

          {lastScannedAt && (
            <p className="mt-3 text-xs opacity-60">
              Last scanned: {new Date(lastScannedAt).toLocaleString()}
            </p>
          )}
        </section>

        <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Entry Coverage
            </p>
            <p className="mt-2 text-2xl font-black text-white">
              {graphAnalysis.entryCoverage}%
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {graphAnalysis.assignedEntries.length}/
              {graphAnalysis.totalEntries}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Concept Usage
            </p>
            <p className="mt-2 text-2xl font-black text-white">
              {graphAnalysis.conceptCoverage}%
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {graphAnalysis.usedConcepts.length}/
              {graphAnalysis.totalConcepts}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Valid Links
            </p>
            <p className="mt-2 text-2xl font-black text-white">
              {graphAnalysis.totalValidLinks}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Average Links
            </p>
            <p className="mt-2 text-2xl font-black text-white">
              {graphAnalysis.averageLinksPerAssignedEntry.toFixed(1)}
            </p>
            <p className="mt-1 text-xs text-neutral-500">per assigned entry</p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Unassigned
            </p>
            <p className="mt-2 text-2xl font-black text-white">
              {graphAnalysis.unassignedEntries.length}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Invalid Links
            </p>
            <p className="mt-2 text-2xl font-black text-white">
              {graphAnalysis.orphanedLinks}
            </p>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <div className="mb-4">
              <h3 className="font-black text-white">Most Used Concepts</h3>
              <p className="mt-1 text-sm text-neutral-500">
                Concepts connected to the highest number of slang entries.
              </p>
            </div>

            {graphAnalysis.mostUsedConcepts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-700 p-5 text-sm text-neutral-500">
                No concepts have been assigned yet.
              </div>
            ) : (
              <div className="space-y-2">
                {graphAnalysis.mostUsedConcepts.map(
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
                Entries currently connected to the most concepts.
              </p>
            </div>

            {graphAnalysis.mostConnectedEntries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-700 p-5 text-sm text-neutral-500">
                No entries have concept assignments yet.
              </div>
            ) : (
              <div className="space-y-2">
                {graphAnalysis.mostConnectedEntries.map(
                  ({ entry, count }, index) => (
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
                            /{entry.slug} · {entry.status}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <span className="rounded-full bg-neutral-800 px-3 py-1 text-xs font-black text-neutral-300">
                            {count} concepts
                          </span>

                          {onOpenEntry && (
                            <button
                              onClick={() => openEntry(entry)}
                              className="rounded-xl bg-yellow-400 px-3 py-2 text-xs font-black text-black hover:bg-yellow-300"
                            >
                              Open
                            </button>
                          )}
                        </div>
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
              <h3 className="font-black text-white">Coverage Gaps</h3>
              <p className="mt-1 text-sm text-neutral-500">
                Find entries without concepts and concepts that have never been
                used.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button
                onClick={exportGapCsv}
                disabled={
                  graphAnalysis.unassignedEntries.length === 0 &&
                  graphAnalysis.unusedConcepts.length === 0
                }
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-xs font-black text-white hover:border-yellow-400 hover:text-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Export Gap CSV
              </button>

              <button
                onClick={openConceptManager}
                className="rounded-xl bg-yellow-400 px-4 py-3 text-xs font-black text-black hover:bg-yellow-300"
              >
                Manage Concepts
              </button>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-neutral-800 bg-neutral-950 p-2">
            <button
              onClick={() => {
                setGapView("entries");
                setSearch("");
              }}
              className={`rounded-lg px-4 py-3 text-sm font-black ${
                gapView === "entries"
                  ? "bg-yellow-400 text-black"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Unassigned Entries · {graphAnalysis.unassignedEntries.length}
            </button>

            <button
              onClick={() => {
                setGapView("concepts");
                setSearch("");
              }}
              className={`rounded-lg px-4 py-3 text-sm font-black ${
                gapView === "concepts"
                  ? "bg-yellow-400 text-black"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Unused Concepts · {graphAnalysis.unusedConcepts.length}
            </button>
          </div>

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              gapView === "entries"
                ? "Search unassigned entries..."
                : "Search unused concepts..."
            }
            className="mb-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400"
          />

          {gapView === "entries" ? (
            filteredUnassignedEntries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
                {graphAnalysis.unassignedEntries.length === 0
                  ? "Every entry has at least one concept. Entry coverage is complete."
                  : "No unassigned entries match your search."}
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {filteredUnassignedEntries.slice(0, 30).map((entry) => (
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
                          onClick={() => openEntry(entry)}
                          className="rounded-xl bg-neutral-800 px-3 py-2 text-xs font-black text-white hover:bg-neutral-700"
                        >
                          Open
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {filteredUnassignedEntries.length > 30 && (
                  <div className="rounded-2xl border border-dashed border-neutral-700 p-4 text-sm text-neutral-500 md:col-span-2">
                    Showing the first 30 results. Use search to narrow the list
                    or export the full gap CSV.
                  </div>
                )}
              </div>
            )
          ) : filteredUnusedConcepts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
              {graphAnalysis.unusedConcepts.length === 0
                ? "Every concept is connected to at least one entry."
                : "No unused concepts match your search."}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {filteredUnusedConcepts.map((concept) => (
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

                  {concept.description && (
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-neutral-400">
                      {concept.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <h3 className="font-black text-white">Category Breakdown</h3>

            <p className="mt-1 text-sm text-neutral-500">
              Distribution of concepts across Knowledge Graph categories.
            </p>

            {graphAnalysis.categoryBreakdown.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-neutral-700 p-5 text-sm text-neutral-500">
                No concept categories are available yet.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {graphAnalysis.categoryBreakdown.map((item) => {
                  const percentage =
                    graphAnalysis.totalConcepts > 0
                      ? Math.round(
                          (item.count / graphAnalysis.totalConcepts) * 100
                        )
                      : 0;

                  return (
                    <div key={item.category}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-sm font-bold text-neutral-300">
                          {item.category}
                        </p>

                        <p className="text-xs font-black text-neutral-500">
                          {item.count} · {percentage}%
                        </p>
                      </div>

                      <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
                        <div
                          className="h-full rounded-full bg-yellow-400"
                          style={{
                            width: `${percentage}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <h3 className="font-black text-white">Data Integrity</h3>

            <p className="mt-1 text-sm text-neutral-500">
              Invalid links can appear when an entry or concept is removed
              without cleaning an old local assignment.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                  Missing Entries
                </p>

                <p className="mt-2 text-2xl font-black text-white">
                  {graphAnalysis.orphanedEntryLinks}
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                  Missing Concepts
                </p>

                <p className="mt-2 text-2xl font-black text-white">
                  {graphAnalysis.orphanedConceptLinks}
                </p>
              </div>
            </div>

            <div
              className={`mt-4 rounded-xl border p-4 text-sm ${
                graphAnalysis.orphanedLinks === 0
                  ? "border-green-400/20 bg-green-400/10 text-green-100"
                  : "border-orange-400/20 bg-orange-400/10 text-orange-100"
              }`}
            >
              {graphAnalysis.orphanedLinks === 0
                ? "No invalid local graph links were detected."
                : `${graphAnalysis.orphanedLinks} invalid local link${
                    graphAnalysis.orphanedLinks === 1 ? " was" : "s were"
                  } detected. A cleanup tool can be added during the Supabase migration step.`}
            </div>
          </section>
        </div>

        <div className="mt-6 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
          <p className="font-black text-yellow-100">Alpha 3.3 note</p>

          <p className="mt-2 text-sm leading-6 text-yellow-100/70">
            Graph Health currently analyzes the local concept and assignment
            data stored in this browser. The next Phase 3 step will add safe
            concept merging and automatically transfer assignments from one
            concept to another.
          </p>
        </div>
      </aside>
    </div>
  );
}

export default GraphStatsDrawer;
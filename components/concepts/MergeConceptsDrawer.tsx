"use client";

import { useEffect, useMemo, useState } from "react";
import type { Entry } from "@/types/entry";
import type { Concept, ConceptAssignment } from "@/types/concept";

type MergeConceptsDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  entries?: Entry[];
  onMerged?: () => void;
};

const CONCEPT_STORAGE_KEY = "yerrr-studio-concepts-alpha-3";
const ASSIGNMENT_STORAGE_KEY = "yerrr-studio-concept-assignments-alpha-3";
const MERGE_HISTORY_STORAGE_KEY =
  "yerrr-studio-concept-merge-history-alpha-3";

type MergeHistoryItem = {
  id: string;
  sourceConceptId: string;
  sourceConceptName: string;
  targetConceptId: string;
  targetConceptName: string;
  transferredAssignments: number;
  mergedAt: string;
};

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

function getColorClasses(color: Concept["color"]) {
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

export function MergeConceptsDrawer({
  isOpen,
  onClose,
  entries = [],
  onMerged,
}: MergeConceptsDrawerProps) {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [assignments, setAssignments] = useState<ConceptAssignment[]>([]);
  const [mergeHistory, setMergeHistory] = useState<MergeHistoryItem[]>([]);
  const [sourceConceptId, setSourceConceptId] = useState("");
  const [targetConceptId, setTargetConceptId] = useState("");
  const [message, setMessage] = useState("");
  const [isMerging, setIsMerging] = useState(false);

  function loadGraphData() {
    try {
      const storedConcepts = window.localStorage.getItem(CONCEPT_STORAGE_KEY);
      const storedAssignments = window.localStorage.getItem(
        ASSIGNMENT_STORAGE_KEY
      );
      const storedHistory = window.localStorage.getItem(
        MERGE_HISTORY_STORAGE_KEY
      );

      const parsedConcepts = storedConcepts
        ? (JSON.parse(storedConcepts) as unknown)
        : [];

      const parsedAssignments = storedAssignments
        ? (JSON.parse(storedAssignments) as unknown)
        : [];

      const parsedHistory = storedHistory
        ? (JSON.parse(storedHistory) as unknown)
        : [];

      setConcepts(Array.isArray(parsedConcepts) ? parsedConcepts : []);
      setAssignments(
        Array.isArray(parsedAssignments) ? parsedAssignments : []
      );
      setMergeHistory(Array.isArray(parsedHistory) ? parsedHistory : []);
    } catch {
      setConcepts([]);
      setAssignments([]);
      setMergeHistory([]);
      setMessage("Local graph data could not be read.");
    }
  }

  useEffect(() => {
    if (!isOpen) return;

    loadGraphData();
    setSourceConceptId("");
    setTargetConceptId("");
    setMessage("");
  }, [isOpen]);

  const sortedConcepts = useMemo(() => {
    return [...concepts].sort((a, b) => a.name.localeCompare(b.name));
  }, [concepts]);

  const sourceConcept = useMemo(() => {
    return (
      concepts.find((concept) => concept.id === sourceConceptId) ?? null
    );
  }, [concepts, sourceConceptId]);

  const targetConcept = useMemo(() => {
    return (
      concepts.find((concept) => concept.id === targetConceptId) ?? null
    );
  }, [concepts, targetConceptId]);

  const mergePreview = useMemo(() => {
    if (!sourceConcept || !targetConcept) {
      return {
        sourceEntryIds: [] as string[],
        targetEntryIds: [] as string[],
        affectedEntryIds: [] as string[],
        overlappingEntryIds: [] as string[],
        projectedTargetEntryIds: [] as string[],
        affectedEntries: [] as Entry[],
      };
    }

    const sourceEntryIds = assignments
      .filter((assignment) =>
        assignment.conceptIds.includes(sourceConcept.id)
      )
      .map((assignment) => String(assignment.entryId));

    const targetEntryIds = assignments
      .filter((assignment) =>
        assignment.conceptIds.includes(targetConcept.id)
      )
      .map((assignment) => String(assignment.entryId));

    const sourceEntryIdSet = new Set(sourceEntryIds);
    const targetEntryIdSet = new Set(targetEntryIds);

    const overlappingEntryIds = sourceEntryIds.filter((entryId) =>
      targetEntryIdSet.has(entryId)
    );

    const projectedTargetEntryIds = Array.from(
      new Set([...sourceEntryIds, ...targetEntryIds])
    );

    const affectedEntryIds = Array.from(sourceEntryIdSet);

    const affectedEntryIdSet = new Set(affectedEntryIds);

    const affectedEntries = entries.filter((entry) =>
      affectedEntryIdSet.has(String(entry.id))
    );

    return {
      sourceEntryIds,
      targetEntryIds,
      affectedEntryIds,
      overlappingEntryIds,
      projectedTargetEntryIds,
      affectedEntries,
    };
  }, [assignments, entries, sourceConcept, targetConcept]);

  const canMerge =
    Boolean(sourceConcept) &&
    Boolean(targetConcept) &&
    sourceConceptId !== targetConceptId &&
    !isMerging;

  function selectSourceConcept(value: string) {
    setSourceConceptId(value);
    setMessage("");

    if (value === targetConceptId) {
      setTargetConceptId("");
    }
  }

  function selectTargetConcept(value: string) {
    setTargetConceptId(value);
    setMessage("");

    if (value === sourceConceptId) {
      setSourceConceptId("");
    }
  }

  function downloadSafetyBackup() {
    if (!sourceConcept || !targetConcept) return;

    const backup = {
      app: "YERRR Studio",
      version: "Alpha 3.4",
      exportType: "pre_concept_merge_backup",
      exportedAt: new Date().toISOString(),
      plannedMerge: {
        sourceConcept,
        targetConcept,
        sourceLinkedEntries: mergePreview.sourceEntryIds.length,
        targetLinkedEntries: mergePreview.targetEntryIds.length,
        overlappingEntries: mergePreview.overlappingEntryIds.length,
      },
      concepts,
      assignments,
    };

    downloadTextFile(
      `yerrr-before-merge-${sourceConcept.slug}-into-${targetConcept.slug}-${getDateSlug()}.json`,
      JSON.stringify(backup, null, 2),
      "application/json"
    );
  }

  function mergeConcepts() {
    if (!sourceConcept || !targetConcept || !canMerge) {
      setMessage("Choose two different concepts before merging.");
      return;
    }

    const confirmed = window.confirm(
      `Merge "${sourceConcept.name}" into "${targetConcept.name}"?\n\n` +
        `${mergePreview.sourceEntryIds.length} linked assignment${
          mergePreview.sourceEntryIds.length === 1 ? "" : "s"
        } will be transferred.\n\n` +
        `"${sourceConcept.name}" will then be deleted.`
    );

    if (!confirmed) return;

    try {
      setIsMerging(true);
      setMessage("");

      downloadSafetyBackup();

      const now = new Date().toISOString();

      const nextAssignments = assignments
        .map((assignment) => {
          if (!assignment.conceptIds.includes(sourceConcept.id)) {
            return assignment;
          }

          const replacedConceptIds = assignment.conceptIds.map((conceptId) =>
            conceptId === sourceConcept.id ? targetConcept.id : conceptId
          );

          return {
            ...assignment,
            conceptIds: Array.from(new Set(replacedConceptIds)),
            updatedAt: now,
          };
        })
        .filter((assignment) => assignment.conceptIds.length > 0);

      const nextConcepts = concepts
        .filter((concept) => concept.id !== sourceConcept.id)
        .map((concept) =>
          concept.id === targetConcept.id
            ? {
                ...concept,
                updatedAt: now,
              }
            : concept
        );

      const historyItem: MergeHistoryItem = {
        id: createId(),
        sourceConceptId: sourceConcept.id,
        sourceConceptName: sourceConcept.name,
        targetConceptId: targetConcept.id,
        targetConceptName: targetConcept.name,
        transferredAssignments: mergePreview.sourceEntryIds.length,
        mergedAt: now,
      };

      const nextHistory = [historyItem, ...mergeHistory].slice(0, 25);

      window.localStorage.setItem(
        CONCEPT_STORAGE_KEY,
        JSON.stringify(nextConcepts)
      );

      window.localStorage.setItem(
        ASSIGNMENT_STORAGE_KEY,
        JSON.stringify(nextAssignments)
      );

      window.localStorage.setItem(
        MERGE_HISTORY_STORAGE_KEY,
        JSON.stringify(nextHistory)
      );

      setConcepts(nextConcepts);
      setAssignments(nextAssignments);
      setMergeHistory(nextHistory);
      setSourceConceptId("");
      setTargetConceptId("");

      setMessage(
        `"${sourceConcept.name}" was merged into "${targetConcept.name}".`
      );

      onMerged?.();
    } catch {
      setMessage("The merge failed. Your downloaded safety backup was not changed.");
    } finally {
      setIsMerging(false);
    }
  }

  function clearMergeHistory() {
    const confirmed = window.confirm(
      "Clear the local concept merge history?"
    );

    if (!confirmed) return;

    window.localStorage.removeItem(MERGE_HISTORY_STORAGE_KEY);
    setMergeHistory([]);
    setMessage("Merge history cleared.");
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
      <button
        aria-label="Close merge concepts"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside className="absolute bottom-0 right-0 max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border-t border-neutral-800 bg-neutral-950 p-5 shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-h-none md:max-w-5xl md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0 md:p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.25em] text-yellow-400">
              Knowledge Graph
            </p>

            <h2 className="mt-2 text-2xl font-black text-white">
              Merge Concepts
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500">
              Transfer assignments from one concept into another and remove the
              old duplicate concept safely.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-black text-neutral-300 hover:border-neutral-700 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Concepts
            </p>
            <p className="mt-2 text-2xl font-black text-white">
              {concepts.length}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Assignments
            </p>
            <p className="mt-2 text-2xl font-black text-white">
              {assignments.length}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Previous Merges
            </p>
            <p className="mt-2 text-2xl font-black text-white">
              {mergeHistory.length}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Storage
            </p>
            <p className="mt-2 text-lg font-black text-white">Local</p>
          </div>
        </div>

        {message && (
          <div className="mb-5 rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-sm font-bold text-yellow-100">
            {message}
          </div>
        )}

        {concepts.length < 2 ? (
          <div className="rounded-2xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
            At least two concepts are required before a merge can be performed.
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="grid gap-5 lg:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-black text-white">
                    1. Concept to remove
                  </span>

                  <p className="mt-1 text-xs leading-5 text-neutral-500">
                    Its entry assignments will be transferred to the surviving
                    concept.
                  </p>

                  <select
                    value={sourceConceptId}
                    onChange={(event) =>
                      selectSourceConcept(event.target.value)
                    }
                    className="mt-3 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-red-400"
                  >
                    <option value="">Choose source concept...</option>

                    {sortedConcepts.map((concept) => (
                      <option
                        key={concept.id}
                        value={concept.id}
                        disabled={concept.id === targetConceptId}
                      >
                        {concept.name} · {concept.category}
                      </option>
                    ))}
                  </select>

                  {sourceConcept && (
                    <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black text-red-100">
                            {sourceConcept.name}
                          </p>

                          <p className="mt-1 text-xs text-red-100/60">
                            /{sourceConcept.slug}
                          </p>
                        </div>

                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-black ${getColorClasses(
                            sourceConcept.color
                          )}`}
                        >
                          {sourceConcept.category}
                        </span>
                      </div>

                      <p className="mt-3 text-sm text-red-100/70">
                        {mergePreview.sourceEntryIds.length} linked entr
                        {mergePreview.sourceEntryIds.length === 1
                          ? "y"
                          : "ies"}{" "}
                        will be transferred.
                      </p>
                    </div>
                  )}
                </label>

                <label className="block">
                  <span className="text-sm font-black text-white">
                    2. Concept to keep
                  </span>

                  <p className="mt-1 text-xs leading-5 text-neutral-500">
                    This concept survives and receives all transferred
                    assignments.
                  </p>

                  <select
                    value={targetConceptId}
                    onChange={(event) =>
                      selectTargetConcept(event.target.value)
                    }
                    className="mt-3 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-green-400"
                  >
                    <option value="">Choose target concept...</option>

                    {sortedConcepts.map((concept) => (
                      <option
                        key={concept.id}
                        value={concept.id}
                        disabled={concept.id === sourceConceptId}
                      >
                        {concept.name} · {concept.category}
                      </option>
                    ))}
                  </select>

                  {targetConcept && (
                    <div className="mt-4 rounded-2xl border border-green-400/20 bg-green-400/10 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black text-green-100">
                            {targetConcept.name}
                          </p>

                          <p className="mt-1 text-xs text-green-100/60">
                            /{targetConcept.slug}
                          </p>
                        </div>

                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-black ${getColorClasses(
                            targetConcept.color
                          )}`}
                        >
                          {targetConcept.category}
                        </span>
                      </div>

                      <p className="mt-3 text-sm text-green-100/70">
                        Currently linked to{" "}
                        {mergePreview.targetEntryIds.length} entr
                        {mergePreview.targetEntryIds.length === 1
                          ? "y"
                          : "ies"}
                        .
                      </p>
                    </div>
                  )}
                </label>
              </div>
            </section>

            {sourceConcept && targetConcept && (
              <section className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <div className="mb-4">
                  <h3 className="font-black text-white">Merge Preview</h3>

                  <p className="mt-1 text-sm text-neutral-500">
                    Review the impact before applying the merge.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                      Transferred
                    </p>

                    <p className="mt-2 text-2xl font-black text-white">
                      {mergePreview.sourceEntryIds.length}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                      Existing Target
                    </p>

                    <p className="mt-2 text-2xl font-black text-white">
                      {mergePreview.targetEntryIds.length}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                      Overlap
                    </p>

                    <p className="mt-2 text-2xl font-black text-white">
                      {mergePreview.overlappingEntryIds.length}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                      Final Target
                    </p>

                    <p className="mt-2 text-2xl font-black text-white">
                      {mergePreview.projectedTargetEntryIds.length}
                    </p>
                  </div>
                </div>

                {mergePreview.affectedEntries.length > 0 && (
                  <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                    <p className="font-black text-white">Affected entries</p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {mergePreview.affectedEntries
                        .slice(0, 12)
                        .map((entry) => (
                          <span
                            key={entry.id}
                            className="rounded-full bg-neutral-800 px-3 py-1 text-xs font-bold text-neutral-300"
                          >
                            {entry.word}
                          </span>
                        ))}

                      {mergePreview.affectedEntries.length > 12 && (
                        <span className="rounded-full bg-neutral-800 px-3 py-1 text-xs font-bold text-neutral-500">
                          +{mergePreview.affectedEntries.length - 12} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-4 rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-4">
                  <p className="font-black text-yellow-100">
                    Automatic safety backup
                  </p>

                  <p className="mt-2 text-sm leading-6 text-yellow-100/70">
                    A full copy of your concepts and assignments will download
                    before the merge changes local graph data.
                  </p>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    onClick={downloadSafetyBackup}
                    className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-black text-white hover:border-yellow-400 hover:text-yellow-300"
                  >
                    Download Backup Only
                  </button>

                  <button
                    onClick={mergeConcepts}
                    disabled={!canMerge}
                    className="rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isMerging
                      ? "Merging..."
                      : `Merge into ${targetConcept.name}`}
                  </button>
                </div>
              </section>
            )}
          </>
        )}

        <section className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="font-black text-white">Merge History</h3>

              <p className="mt-1 text-sm text-neutral-500">
                Recent concept merges performed in this browser.
              </p>
            </div>

            <button
              onClick={clearMergeHistory}
              disabled={mergeHistory.length === 0}
              className="rounded-xl bg-neutral-800 px-3 py-2 text-xs font-black text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear
            </button>
          </div>

          {mergeHistory.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-700 p-5 text-sm text-neutral-500">
              No concept merges have been recorded yet.
            </div>
          ) : (
            <div className="space-y-2">
              {mergeHistory.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
                >
                  <p className="font-black text-white">
                    {item.sourceConceptName}
                    <span className="mx-2 text-neutral-600">→</span>
                    {item.targetConceptName}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                    <span>
                      {item.transferredAssignments} assignment
                      {item.transferredAssignments === 1 ? "" : "s"} transferred
                    </span>

                    <span>{formatDate(item.mergedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="mt-6 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
          <p className="font-black text-yellow-100">Alpha 3.4 note</p>

          <p className="mt-2 text-sm leading-6 text-yellow-100/70">
            Concept merging currently updates the Knowledge Graph stored in this
            browser. When the graph moves to Supabase, this same workflow will
            be converted into a database transaction.
          </p>
        </div>
      </aside>
    </div>
  );
}

export default MergeConceptsDrawer;
"use client";

import { useEffect, useMemo, useState } from "react";
import type { Entry } from "@/types/entry";
import type {
  Concept,
  ConceptAssignment,
  ConceptCategory,
  ConceptColor,
} from "@/types/concept";
import {
  conceptCategoryOptions,
  conceptColorOptions,
} from "@/types/concept";

type ConceptDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  entries?: Entry[];
};

type ConceptFormState = {
  name: string;
  description: string;
  category: ConceptCategory;
  color: ConceptColor;
};

type DrawerTab = "concepts" | "assign";

const CONCEPT_STORAGE_KEY = "yerrr-studio-concepts-alpha-3";
const ASSIGNMENT_STORAGE_KEY = "yerrr-studio-concept-assignments-alpha-3";

const EMPTY_FORM: ConceptFormState = {
  name: "",
  description: "",
  category: "Meaning",
  color: "yellow",
};

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getColorClasses(color: ConceptColor) {
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

function downloadTextFile(filename: string, content: string, mimeType: string) {
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ConceptDrawer({
  isOpen,
  onClose,
  entries = [],
}: ConceptDrawerProps) {
  const [hasLoaded, setHasLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<DrawerTab>("concepts");
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [assignments, setAssignments] = useState<ConceptAssignment[]>([]);
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(
    null
  );
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [draftConceptIds, setDraftConceptIds] = useState<string[]>([]);
  const [form, setForm] = useState<ConceptFormState>(EMPTY_FORM);
  const [conceptSearch, setConceptSearch] = useState("");
  const [entrySearch, setEntrySearch] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const storedConcepts = window.localStorage.getItem(CONCEPT_STORAGE_KEY);
      const storedAssignments = window.localStorage.getItem(
        ASSIGNMENT_STORAGE_KEY
      );

      if (storedConcepts) {
        const parsedConcepts = JSON.parse(storedConcepts) as Concept[];

        if (Array.isArray(parsedConcepts)) {
          setConcepts(parsedConcepts);
        }
      }

      if (storedAssignments) {
        const parsedAssignments = JSON.parse(
          storedAssignments
        ) as ConceptAssignment[];

        if (Array.isArray(parsedAssignments)) {
          setAssignments(parsedAssignments);
        }
      }
    } catch {
      setConcepts([]);
      setAssignments([]);
    } finally {
      setHasLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;

    window.localStorage.setItem(
      CONCEPT_STORAGE_KEY,
      JSON.stringify(concepts)
    );
  }, [concepts, hasLoaded]);

  useEffect(() => {
    if (!hasLoaded) return;

    window.localStorage.setItem(
      ASSIGNMENT_STORAGE_KEY,
      JSON.stringify(assignments)
    );
  }, [assignments, hasLoaded]);

  const selectedConcept = useMemo(() => {
    return concepts.find((concept) => concept.id === selectedConceptId) ?? null;
  }, [concepts, selectedConceptId]);

  const selectedEntry = useMemo(() => {
    return entries.find((entry) => entry.id === selectedEntryId) ?? null;
  }, [entries, selectedEntryId]);

  const selectedEntryAssignment = useMemo(() => {
    if (!selectedEntryId) return null;

    return (
      assignments.find((assignment) => assignment.entryId === selectedEntryId) ??
      null
    );
  }, [assignments, selectedEntryId]);

  const filteredConcepts = useMemo(() => {
    const query = conceptSearch.trim().toLowerCase();

    if (!query) return concepts;

    return concepts.filter((concept) => {
      return (
        concept.name.toLowerCase().includes(query) ||
        concept.slug.toLowerCase().includes(query) ||
        concept.description.toLowerCase().includes(query) ||
        concept.category.toLowerCase().includes(query)
      );
    });
  }, [concepts, conceptSearch]);

  const filteredEntries = useMemo(() => {
    const query = entrySearch.trim().toLowerCase();

    if (!query) return entries;

    return entries.filter((entry) => {
      return (
        entry.word.toLowerCase().includes(query) ||
        entry.slug.toLowerCase().includes(query) ||
        entry.status.toLowerCase().includes(query)
      );
    });
  }, [entries, entrySearch]);

  const conceptUsageCounts = useMemo(() => {
    const usageMap = new Map<string, number>();

    assignments.forEach((assignment) => {
      assignment.conceptIds.forEach((conceptId) => {
        usageMap.set(conceptId, (usageMap.get(conceptId) ?? 0) + 1);
      });
    });

    return usageMap;
  }, [assignments]);

  const selectedEntryConcepts = useMemo(() => {
    return concepts.filter((concept) =>
      draftConceptIds.includes(concept.id)
    );
  }, [concepts, draftConceptIds]);

  const conceptStats = useMemo(() => {
    const categoryCounts = new Map<ConceptCategory, number>();

    concepts.forEach((concept) => {
      categoryCounts.set(
        concept.category,
        (categoryCounts.get(concept.category) ?? 0) + 1
      );
    });

    const topCategory = Array.from(categoryCounts.entries()).sort(
      (a, b) => b[1] - a[1]
    )[0];

    const assignedEntries = assignments.filter(
      (assignment) => assignment.conceptIds.length > 0
    ).length;

    const totalLinks = assignments.reduce(
      (total, assignment) => total + assignment.conceptIds.length,
      0
    );

    return {
      total: concepts.length,
      categoriesUsed: categoryCounts.size,
      topCategory: topCategory?.[0] ?? "None",
      assignedEntries,
      totalLinks,
    };
  }, [concepts, assignments]);

  function resetForm() {
    setSelectedConceptId(null);
    setForm(EMPTY_FORM);
    setMessage("");
  }

  function editConcept(concept: Concept) {
    setSelectedConceptId(concept.id);
    setForm({
      name: concept.name,
      description: concept.description,
      category: concept.category,
      color: concept.color,
    });
    setMessage("");
  }

  function saveConcept() {
    const name = form.name.trim();
    const description = form.description.trim();
    const slug = slugify(name);

    if (!name) {
      setMessage("Concept name is required.");
      return;
    }

    if (!slug) {
      setMessage("Concept needs a valid slug.");
      return;
    }

    const duplicateConcept = concepts.find(
      (concept) => concept.slug === slug && concept.id !== selectedConceptId
    );

    if (duplicateConcept) {
      setMessage("A concept with this name already exists.");
      return;
    }

    const now = new Date().toISOString();

    if (selectedConcept) {
      setConcepts((currentConcepts) =>
        currentConcepts.map((concept) =>
          concept.id === selectedConcept.id
            ? {
                ...concept,
                name,
                slug,
                description,
                category: form.category,
                color: form.color,
                updatedAt: now,
              }
            : concept
        )
      );

      setMessage("Concept updated.");
      return;
    }

    const newConcept: Concept = {
      id: createId(),
      name,
      slug,
      description,
      category: form.category,
      color: form.color,
      createdAt: now,
      updatedAt: now,
    };

    setConcepts((currentConcepts) => [newConcept, ...currentConcepts]);
    setSelectedConceptId(newConcept.id);
    setMessage("Concept created.");
  }

  function deleteSelectedConcept() {
    if (!selectedConcept) return;

    const confirmed = window.confirm(
      `Delete the concept "${selectedConcept.name}"? This also removes local assignments to that concept.`
    );

    if (!confirmed) return;

    setConcepts((currentConcepts) =>
      currentConcepts.filter((concept) => concept.id !== selectedConcept.id)
    );

    setAssignments((currentAssignments) =>
      currentAssignments
        .map((assignment) => ({
          ...assignment,
          conceptIds: assignment.conceptIds.filter(
            (conceptId) => conceptId !== selectedConcept.id
          ),
          updatedAt: new Date().toISOString(),
        }))
        .filter((assignment) => assignment.conceptIds.length > 0)
    );

    setDraftConceptIds((currentIds) =>
      currentIds.filter((conceptId) => conceptId !== selectedConcept.id)
    );

    resetForm();
    setMessage("Concept deleted.");
  }

  function selectEntry(entry: Entry) {
    const assignment = assignments.find(
      (currentAssignment) => currentAssignment.entryId === entry.id
    );

    setSelectedEntryId(entry.id);
    setDraftConceptIds(assignment?.conceptIds ?? []);
    setMessage("");
  }

  function toggleDraftConcept(conceptId: string) {
    setDraftConceptIds((currentIds) => {
      if (currentIds.includes(conceptId)) {
        return currentIds.filter((currentId) => currentId !== conceptId);
      }

      return [...currentIds, conceptId];
    });
  }

  function saveEntryConcepts() {
    if (!selectedEntry) {
      setMessage("Select an entry first.");
      return;
    }

    const now = new Date().toISOString();

    setAssignments((currentAssignments) => {
      const otherAssignments = currentAssignments.filter(
        (assignment) => assignment.entryId !== selectedEntry.id
      );

      if (draftConceptIds.length === 0) {
        return otherAssignments;
      }

      return [
        ...otherAssignments,
        {
          entryId: selectedEntry.id,
          conceptIds: draftConceptIds,
          updatedAt: now,
        },
      ];
    });

    setMessage(`Concepts saved for "${selectedEntry.word}".`);
  }

  function clearEntryConcepts() {
    if (!selectedEntry) return;

    const confirmed = window.confirm(
      `Clear all concept assignments for "${selectedEntry.word}"?`
    );

    if (!confirmed) return;

    setAssignments((currentAssignments) =>
      currentAssignments.filter(
        (assignment) => assignment.entryId !== selectedEntry.id
      )
    );

    setDraftConceptIds([]);
    setMessage(`Concepts cleared for "${selectedEntry.word}".`);
  }

  function exportConceptsJson() {
    const backup = {
      app: "YERRR Studio",
      version: "Alpha 3.1",
      exportType: "concepts",
      exportedAt: new Date().toISOString(),
      counts: {
        concepts: concepts.length,
      },
      concepts,
    };

    downloadTextFile(
      `yerrr-concepts-${getDateSlug()}.json`,
      JSON.stringify(backup, null, 2),
      "application/json"
    );

    setMessage("Concepts exported.");
  }

  function exportGraphJson() {
    const backup = {
      app: "YERRR Studio",
      version: "Alpha 3.1",
      exportType: "local_knowledge_graph",
      exportedAt: new Date().toISOString(),
      counts: {
        concepts: concepts.length,
        assignments: assignments.length,
        assignedEntries: conceptStats.assignedEntries,
        totalLinks: conceptStats.totalLinks,
      },
      concepts,
      assignments,
    };

    downloadTextFile(
      `yerrr-local-knowledge-graph-${getDateSlug()}.json`,
      JSON.stringify(backup, null, 2),
      "application/json"
    );

    setMessage("Knowledge graph exported.");
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
      <button
        aria-label="Close concept editor"
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
              Concept Editor
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500">
              Create high-level ideas and connect slang entries to them. This
              builds the local foundation for the YERRR Knowledge Graph.
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
              {conceptStats.total}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Categories
            </p>
            <p className="mt-2 text-2xl font-black text-white">
              {conceptStats.categoriesUsed}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Assigned
            </p>
            <p className="mt-2 text-2xl font-black text-white">
              {conceptStats.assignedEntries}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Links
            </p>
            <p className="mt-2 text-2xl font-black text-white">
              {conceptStats.totalLinks}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Top Type
            </p>
            <p className="mt-2 truncate text-lg font-black text-white">
              {conceptStats.topCategory}
            </p>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border border-neutral-800 bg-neutral-900 p-2">
          <button
            onClick={() => setActiveTab("concepts")}
            className={`rounded-xl px-4 py-3 text-sm font-black ${
              activeTab === "concepts"
                ? "bg-yellow-400 text-black"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Concept Library
          </button>

          <button
            onClick={() => setActiveTab("assign")}
            className={`rounded-xl px-4 py-3 text-sm font-black ${
              activeTab === "assign"
                ? "bg-yellow-400 text-black"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Assign to Entries
          </button>
        </div>

        {message && (
          <div className="mb-5 rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-3 text-sm font-bold text-yellow-100">
            {message}
          </div>
        )}

        {activeTab === "concepts" ? (
          <div className="grid gap-5 lg:grid-cols-[1fr_1.15fr]">
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-black text-white">Concept Library</h3>
                  <p className="mt-1 text-sm text-neutral-500">
                    Search and select concepts.
                  </p>
                </div>

                <button
                  onClick={resetForm}
                  className="rounded-xl bg-yellow-400 px-3 py-2 text-xs font-black text-black hover:bg-yellow-300"
                >
                  New
                </button>
              </div>

              <input
                value={conceptSearch}
                onChange={(event) => setConceptSearch(event.target.value)}
                placeholder="Search concepts..."
                className="mb-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400"
              />

              {filteredConcepts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-700 p-5 text-sm text-neutral-500">
                  {concepts.length === 0
                    ? "No concepts yet. Create your first Knowledge Graph concept."
                    : "No concepts match your search."}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredConcepts.map((concept) => {
                    const isSelected = selectedConceptId === concept.id;
                    const usageCount = conceptUsageCounts.get(concept.id) ?? 0;

                    return (
                      <button
                        key={concept.id}
                        type="button"
                        onClick={() => editConcept(concept)}
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
                              /{concept.slug} · {usageCount} linked
                            </p>
                          </div>

                          <span
                            className={`shrink-0 rounded-full border px-2 py-1 text-xs font-bold ${getColorClasses(
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
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="mb-4">
                <h3 className="font-black text-white">
                  {selectedConcept ? "Edit Concept" : "Create Concept"}
                </h3>
                <p className="mt-1 text-sm text-neutral-500">
                  These concepts can now be assigned to slang entries.
                </p>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <span className="text-sm font-bold text-neutral-300">
                    Concept Name
                  </span>
                  <input
                    value={form.name}
                    onChange={(event) =>
                      setForm((currentForm) => ({
                        ...currentForm,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Example: cold weather, honesty, bodega culture"
                    className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-bold text-neutral-300">
                    Description
                  </span>
                  <textarea
                    value={form.description}
                    onChange={(event) =>
                      setForm((currentForm) => ({
                        ...currentForm,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Describe the cultural or semantic idea this concept represents..."
                    rows={5}
                    className="mt-2 w-full resize-none rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-bold text-neutral-300">
                      Category
                    </span>
                    <select
                      value={form.category}
                      onChange={(event) =>
                        setForm((currentForm) => ({
                          ...currentForm,
                          category: event.target.value as ConceptCategory,
                        }))
                      }
                      className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
                    >
                      {conceptCategoryOptions.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-sm font-bold text-neutral-300">
                      Color
                    </span>
                    <select
                      value={form.color}
                      onChange={(event) =>
                        setForm((currentForm) => ({
                          ...currentForm,
                          color: event.target.value as ConceptColor,
                        }))
                      }
                      className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
                    >
                      {conceptColorOptions.map((color) => (
                        <option key={color} value={color}>
                          {color}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                    Preview
                  </p>

                  <div
                    className={`mt-3 rounded-2xl border p-4 ${getColorClasses(
                      form.color
                    )}`}
                  >
                    <p className="font-black">
                      {form.name.trim() || "Untitled Concept"}
                    </p>
                    <p className="mt-1 text-xs opacity-70">
                      /{slugify(form.name) || "concept-slug"} · {form.category}
                    </p>
                    <p className="mt-3 text-sm leading-6 opacity-80">
                      {form.description.trim() ||
                        "Concept description will appear here."}
                    </p>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <button
                    onClick={saveConcept}
                    className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-black hover:bg-yellow-300"
                  >
                    {selectedConcept ? "Save Concept" : "Create Concept"}
                  </button>

                  <button
                    onClick={resetForm}
                    className="rounded-xl bg-neutral-800 px-4 py-3 text-sm font-black text-white hover:bg-neutral-700"
                  >
                    Reset
                  </button>

                  <button
                    onClick={deleteSelectedConcept}
                    disabled={!selectedConcept}
                    className="rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    onClick={exportConceptsJson}
                    disabled={concepts.length === 0}
                    className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-black text-white hover:border-yellow-400 hover:text-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Export Concepts
                  </button>

                  <button
                    onClick={exportGraphJson}
                    disabled={concepts.length === 0}
                    className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-black text-white hover:border-yellow-400 hover:text-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Export Graph
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="mb-4">
                <h3 className="font-black text-white">Entry Browser</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Select an entry and attach concepts to it.
                </p>
              </div>

              <input
                value={entrySearch}
                onChange={(event) => setEntrySearch(event.target.value)}
                placeholder="Search entries..."
                className="mb-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400"
              />

              {entries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-700 p-5 text-sm text-neutral-500">
                  No entries are available to assign.
                </div>
              ) : filteredEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-700 p-5 text-sm text-neutral-500">
                  No entries match your search.
                </div>
              ) : (
                <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
                  {filteredEntries.map((entry) => {
                    const isSelected = selectedEntryId === entry.id;
                    const assignment = assignments.find(
                      (currentAssignment) =>
                        currentAssignment.entryId === entry.id
                    );
                    const assignedCount = assignment?.conceptIds.length ?? 0;

                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => selectEntry(entry)}
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

                          <span className="shrink-0 rounded-full bg-neutral-800 px-2 py-1 text-xs font-bold text-neutral-300">
                            {assignedCount} concepts
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              {selectedEntry ? (
                <>
                  <div className="mb-4">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                      Selected Entry
                    </p>
                    <h3 className="mt-2 text-2xl font-black text-white">
                      {selectedEntry.word}
                    </h3>
                    <p className="mt-1 text-sm text-neutral-500">
                      /{selectedEntry.slug} · {selectedEntry.status}
                    </p>
                  </div>

                  {selectedEntryAssignment && (
                    <div className="mb-4 rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-500">
                      Last saved: {formatDate(selectedEntryAssignment.updatedAt)}
                    </div>
                  )}

                  {concepts.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-neutral-700 p-5 text-sm text-neutral-500">
                      Create concepts first before assigning them to entries.
                    </div>
                  ) : (
                    <>
                      <div className="mb-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                        <p className="font-black text-white">
                          Assigned Concepts
                        </p>

                        {selectedEntryConcepts.length === 0 ? (
                          <p className="mt-2 text-sm text-neutral-500">
                            No concepts selected yet.
                          </p>
                        ) : (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedEntryConcepts.map((concept) => (
                              <span
                                key={concept.id}
                                className={`rounded-full border px-3 py-1 text-xs font-bold ${getColorClasses(
                                  concept.color
                                )}`}
                              >
                                {concept.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        {concepts.map((concept) => {
                          const isChecked = draftConceptIds.includes(
                            concept.id
                          );

                          return (
                            <button
                              key={concept.id}
                              type="button"
                              onClick={() => toggleDraftConcept(concept.id)}
                              className={`w-full rounded-2xl border p-4 text-left transition ${
                                isChecked
                                  ? "border-yellow-400 bg-yellow-400/10"
                                  : "border-neutral-800 bg-neutral-950 hover:border-neutral-700"
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div
                                  className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                                    isChecked
                                      ? "border-yellow-400 bg-yellow-400 text-black"
                                      : "border-neutral-700 bg-neutral-900"
                                  }`}
                                >
                                  {isChecked ? "✓" : ""}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-3">
                                    <p className="font-black text-white">
                                      {concept.name}
                                    </p>
                                    <span
                                      className={`shrink-0 rounded-full border px-2 py-1 text-xs font-bold ${getColorClasses(
                                        concept.color
                                      )}`}
                                    >
                                      {concept.category}
                                    </span>
                                  </div>

                                  {concept.description && (
                                    <p className="mt-2 text-sm leading-6 text-neutral-400">
                                      {concept.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-5 grid gap-2 sm:grid-cols-2">
                        <button
                          onClick={saveEntryConcepts}
                          className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-black hover:bg-yellow-300"
                        >
                          Save Assignments
                        </button>

                        <button
                          onClick={clearEntryConcepts}
                          disabled={draftConceptIds.length === 0}
                          className="rounded-xl bg-neutral-800 px-4 py-3 text-sm font-black text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Clear Concepts
                        </button>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
                  Select an entry from the left to assign concepts.
                </div>
              )}
            </section>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
          <p className="font-black text-yellow-100">Alpha 3.1 note</p>
          <p className="mt-2 text-sm leading-6 text-yellow-100/70">
            Concept assignments are stored locally for now. The next step can
            add Browse Concepts, where clicking a concept shows every linked
            slang entry.
          </p>
        </div>
      </aside>
    </div>
  );
}

export default ConceptDrawer;
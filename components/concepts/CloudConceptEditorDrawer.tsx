"use client";

import { useMemo, useState } from "react";

import type { Entry } from "@/types/entry";

import type {
  Concept,
  ConceptCategory,
  ConceptColor,
} from "@/types/concept";

import {
  conceptCategoryOptions,
  conceptColorOptions,
} from "@/types/concept";

import { useCloudKnowledgeGraph } from "@/hooks/useCloudKnowledgeGraph";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

type CloudConceptEditorDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  entries?: Entry[];
  onOpenEntry?: (entry: Entry) => void;
  onGraphChanged?: () => void;
};

type DrawerTab = "library" | "assign" | "browse";

type ConceptFormState = {
  name: string;
  description: string;
  category: ConceptCategory;
  color: ConceptColor;
};

const EMPTY_FORM: ConceptFormState = {
  name: "",
  description: "",
  category: "Meaning",
  color: "yellow",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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

  return "An unknown cloud graph error occurred.";
}

function getConceptColorClasses(color: ConceptColor) {
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

export function CloudConceptEditorDrawer({
  isOpen,
  onClose,
  entries = [],
  onOpenEntry,
  onGraphChanged,
}: CloudConceptEditorDrawerProps) {
  const {
    concepts,
    assignments,
    stats,
    isLoading,
    error: cloudError,
    refresh,
  } = useCloudKnowledgeGraph(isOpen);

  const [activeTab, setActiveTab] =
    useState<DrawerTab>("library");

  const [selectedConceptId, setSelectedConceptId] =
    useState("");

  const [selectedEntryId, setSelectedEntryId] =
    useState("");

  const [browseConceptId, setBrowseConceptId] =
    useState("");

  const [draftConceptIds, setDraftConceptIds] = useState<
    string[]
  >([]);

  const [form, setForm] =
    useState<ConceptFormState>(EMPTY_FORM);

  const [conceptSearch, setConceptSearch] = useState("");
  const [entrySearch, setEntrySearch] = useState("");
  const [browseSearch, setBrowseSearch] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [localError, setLocalError] = useState("");

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) =>
      a.word.localeCompare(b.word)
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

  const selectedEntry = useMemo(() => {
    return (
      entries.find(
        (entry) =>
          String(entry.id) === selectedEntryId
      ) ?? null
    );
  }, [entries, selectedEntryId]);

  const browseConcept = useMemo(() => {
    return (
      concepts.find(
        (concept) =>
          String(concept.id) === browseConceptId
      ) ?? null
    );
  }, [concepts, browseConceptId]);

  const conceptUsageCounts = useMemo(() => {
    const usageMap = new Map<string, number>();

    assignments.forEach((assignment) => {
      assignment.conceptIds.forEach((conceptId) => {
        const normalizedId = String(conceptId);

        usageMap.set(
          normalizedId,
          (usageMap.get(normalizedId) ?? 0) + 1
        );
      });
    });

    return usageMap;
  }, [assignments]);

  const selectedEntryAssignment = useMemo(() => {
    if (!selectedEntryId) return null;

    return (
      assignments.find(
        (assignment) =>
          String(assignment.entryId) === selectedEntryId
      ) ?? null
    );
  }, [assignments, selectedEntryId]);

  const selectedEntryConcepts = useMemo(() => {
    return concepts.filter((concept) =>
      draftConceptIds.includes(String(concept.id))
    );
  }, [concepts, draftConceptIds]);

  const filteredConcepts = useMemo(() => {
    const query = conceptSearch.trim().toLowerCase();

    const sortedConcepts = [...concepts].sort((a, b) => {
      const bUsage =
        conceptUsageCounts.get(String(b.id)) ?? 0;

      const aUsage =
        conceptUsageCounts.get(String(a.id)) ?? 0;

      if (aUsage !== bUsage) {
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

  const filteredEntries = useMemo(() => {
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

  const linkedEntriesForBrowseConcept = useMemo(() => {
    if (!browseConceptId) return [];

    const linkedEntryIds = new Set(
      assignments
        .filter((assignment) =>
          assignment.conceptIds
            .map(String)
            .includes(browseConceptId)
        )
        .map((assignment) =>
          String(assignment.entryId)
        )
    );

    const query = browseSearch.trim().toLowerCase();

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
      .sort((a, b) =>
        a.word.localeCompare(b.word)
      );
  }, [
    assignments,
    entries,
    browseConceptId,
    browseSearch,
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

  function resetConceptForm() {
    setSelectedConceptId("");
    setForm(EMPTY_FORM);
    resetMessages();
  }

  function editConcept(concept: Concept) {
    setSelectedConceptId(String(concept.id));

    setForm({
      name: concept.name,
      description: concept.description,
      category: concept.category,
      color: concept.color,
    });

    resetMessages();
  }

  async function saveConcept() {
    const name = form.name.trim();
    const description = form.description.trim();
    const slug = slugify(name);

    if (!name) {
      setLocalError("Concept name is required.");
      return;
    }

    if (!slug) {
      setLocalError("Concept needs a valid slug.");
      return;
    }

    const duplicateConcept = concepts.find(
      (concept) =>
        concept.slug.toLowerCase() ===
          slug.toLowerCase() &&
        String(concept.id) !== selectedConceptId
    );

    if (duplicateConcept) {
      setLocalError(
        `A cloud concept named "${duplicateConcept.name}" already uses this slug.`
      );

      return;
    }

    try {
      setIsSaving(true);
      resetMessages();

      const supabase = await getAuthenticatedClient();

      const payload = {
        name,
        slug,
        description,
        category: form.category,
        color: form.color,
      };

      if (selectedConcept) {
        const { error } = await supabase
          .from("concepts")
          .update(payload)
          .eq("id", selectedConcept.id);

        if (error) {
          throw error;
        }

        setMessage(`"${name}" was updated in Supabase.`);
      } else {
        const {
          data: insertedConcept,
          error,
        } = await supabase
          .from("concepts")
          .insert(payload)
          .select("id")
          .single();

        if (error) {
          throw error;
        }

        setSelectedConceptId(
          String(insertedConcept.id)
        );

        setBrowseConceptId(
          String(insertedConcept.id)
        );

        setMessage(`"${name}" was created in Supabase.`);
      }

      await refresh();
      onGraphChanged?.();
    } catch (saveError) {
      setLocalError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteSelectedConcept() {
    if (!selectedConcept) return;

    const confirmed = window.confirm(
      `Delete "${selectedConcept.name}" from Supabase?\n\nAll entry assignments connected to this concept will also be removed.`
    );

    if (!confirmed) return;

    try {
      setIsSaving(true);
      resetMessages();

      const supabase = await getAuthenticatedClient();

      const { error } = await supabase
        .from("concepts")
        .delete()
        .eq("id", selectedConcept.id);

      if (error) {
        throw error;
      }

      const deletedConceptName = selectedConcept.name;

      setSelectedConceptId("");
      setBrowseConceptId("");
      setForm(EMPTY_FORM);

      setDraftConceptIds((currentIds) =>
        currentIds.filter(
          (conceptId) =>
            conceptId !== String(selectedConcept.id)
        )
      );

      await refresh();
      onGraphChanged?.();

      setMessage(
        `"${deletedConceptName}" was deleted from Supabase.`
      );
    } catch (deleteError) {
      setLocalError(getErrorMessage(deleteError));
    } finally {
      setIsSaving(false);
    }
  }

  function selectEntry(entry: Entry) {
    const entryId = String(entry.id);

    const assignment = assignments.find(
      (currentAssignment) =>
        String(currentAssignment.entryId) === entryId
    );

    setSelectedEntryId(entryId);

    setDraftConceptIds(
      assignment?.conceptIds.map(String) ?? []
    );

    resetMessages();
  }

  function toggleDraftConcept(conceptId: string) {
    setDraftConceptIds((currentIds) => {
      if (currentIds.includes(conceptId)) {
        return currentIds.filter(
          (currentId) => currentId !== conceptId
        );
      }

      return [...currentIds, conceptId];
    });
  }

  async function saveEntryAssignments() {
    if (!selectedEntry) {
      setLocalError("Select an entry first.");
      return;
    }

    try {
      setIsSaving(true);
      resetMessages();

      const supabase = await getAuthenticatedClient();

      const currentConceptIds = new Set(
        selectedEntryAssignment?.conceptIds.map(String) ??
          []
      );

      const nextConceptIds = new Set(
        draftConceptIds.map(String)
      );

      const conceptIdsToAdd = Array.from(
        nextConceptIds
      ).filter(
        (conceptId) =>
          !currentConceptIds.has(conceptId)
      );

      const conceptIdsToRemove = Array.from(
        currentConceptIds
      ).filter(
        (conceptId) =>
          !nextConceptIds.has(conceptId)
      );

      if (conceptIdsToAdd.length > 0) {
        const rows = conceptIdsToAdd.map(
          (conceptId) => ({
            entry_id: selectedEntry.id,
            concept_id: conceptId,
          })
        );

        const { error } = await supabase
          .from("entry_concepts")
          .insert(rows);

        if (error) {
          throw error;
        }
      }

      if (conceptIdsToRemove.length > 0) {
        const { error } = await supabase
          .from("entry_concepts")
          .delete()
          .eq("entry_id", selectedEntry.id)
          .in("concept_id", conceptIdsToRemove);

        if (error) {
          throw error;
        }
      }

      await refresh();
      onGraphChanged?.();

      setMessage(
        `Cloud concepts were saved for "${selectedEntry.word}".`
      );
    } catch (saveError) {
      setLocalError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function clearEntryAssignments() {
    if (!selectedEntry) return;

    const confirmed = window.confirm(
      `Remove all cloud concept assignments from "${selectedEntry.word}"?`
    );

    if (!confirmed) return;

    try {
      setIsSaving(true);
      resetMessages();

      const supabase = await getAuthenticatedClient();

      const { error } = await supabase
        .from("entry_concepts")
        .delete()
        .eq("entry_id", selectedEntry.id);

      if (error) {
        throw error;
      }

      setDraftConceptIds([]);

      await refresh();
      onGraphChanged?.();

      setMessage(
        `All cloud concepts were removed from "${selectedEntry.word}".`
      );
    } catch (clearError) {
      setLocalError(getErrorMessage(clearError));
    } finally {
      setIsSaving(false);
    }
  }

  function browseConceptFromLibrary(concept: Concept) {
    setBrowseConceptId(String(concept.id));
    setBrowseSearch("");
    setActiveTab("browse");
    resetMessages();
  }

  function openEntry(entry: Entry) {
    if (!onOpenEntry) return;

    onClose();
    onOpenEntry(entry);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
      <button
        aria-label="Close cloud concept editor"
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
              Cloud Concept Editor
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500">
              Create concepts, edit cloud records, assign concepts
              to entries, and browse permanent Supabase links.
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
              Cloud Concepts
            </p>

            <p className="mt-2 text-2xl font-black text-white">
              {stats.concepts}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Assigned Entries
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
              Storage
            </p>

            <p className="mt-2 text-lg font-black text-sky-300">
              Supabase
            </p>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-3 gap-2 rounded-2xl border border-neutral-800 bg-neutral-900 p-2">
          <button
            onClick={() => setActiveTab("library")}
            className={`rounded-xl px-3 py-3 text-xs font-black sm:text-sm ${
              activeTab === "library"
                ? "bg-sky-400 text-black"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Concept Library
          </button>

          <button
            onClick={() => setActiveTab("assign")}
            className={`rounded-xl px-3 py-3 text-xs font-black sm:text-sm ${
              activeTab === "assign"
                ? "bg-sky-400 text-black"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Assign to Entries
          </button>

          <button
            onClick={() => setActiveTab("browse")}
            className={`rounded-xl px-3 py-3 text-xs font-black sm:text-sm ${
              activeTab === "browse"
                ? "bg-sky-400 text-black"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Browse Cloud
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

        {isLoading && concepts.length === 0 ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-8 text-center">
            <p className="font-black text-white">
              Loading cloud concepts...
            </p>
          </div>
        ) : activeTab === "library" ? (
          <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-black text-white">
                    Supabase Concept Library
                  </h3>

                  <p className="mt-1 text-sm text-neutral-500">
                    Search, select, edit, or browse cloud concepts.
                  </p>
                </div>

                <button
                  onClick={resetConceptForm}
                  className="rounded-xl bg-sky-400 px-3 py-2 text-xs font-black text-black hover:bg-sky-300"
                >
                  New
                </button>
              </div>

              <input
                value={conceptSearch}
                onChange={(event) =>
                  setConceptSearch(event.target.value)
                }
                placeholder="Search cloud concepts..."
                className="mb-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-sky-400"
              />

              {filteredConcepts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-700 p-5 text-sm text-neutral-500">
                  No cloud concepts were found.
                </div>
              ) : (
                <div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1">
                  {filteredConcepts.map((concept) => {
                    const usageCount =
                      conceptUsageCounts.get(
                        String(concept.id)
                      ) ?? 0;

                    const isSelected =
                      selectedConceptId ===
                      String(concept.id);

                    return (
                      <div
                        key={concept.id}
                        className={`rounded-2xl border p-4 ${
                          isSelected
                            ? "border-sky-400 bg-sky-400/10"
                            : "border-neutral-800 bg-neutral-950"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => editConcept(concept)}
                          className="w-full text-left"
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
                              className={`rounded-full border px-2 py-1 text-xs font-black ${getConceptColorClasses(
                                concept.color
                              )}`}
                            >
                              {concept.category}
                            </span>
                          </div>
                        </button>

                        <button
                          onClick={() =>
                            browseConceptFromLibrary(concept)
                          }
                          className="mt-3 rounded-xl border border-neutral-700 px-3 py-2 text-xs font-black text-neutral-300 hover:border-sky-400 hover:text-sky-300"
                        >
                          Browse Linked Entries
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="font-black text-white">
                {selectedConcept
                  ? "Edit Cloud Concept"
                  : "Create Cloud Concept"}
              </h3>

              <div className="mt-4 space-y-4">
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
                    placeholder="Example: Bodega Culture"
                    className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-sky-400"
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
                    rows={5}
                    placeholder="Describe this concept..."
                    className="mt-2 w-full resize-none rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-sky-400"
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
                          category:
                            event.target
                              .value as ConceptCategory,
                        }))
                      }
                      className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-sky-400"
                    >
                      {conceptCategoryOptions.map(
                        (category) => (
                          <option
                            key={category}
                            value={category}
                          >
                            {category}
                          </option>
                        )
                      )}
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
                          color:
                            event.target
                              .value as ConceptColor,
                        }))
                      }
                      className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-sky-400"
                    >
                      {conceptColorOptions.map((color) => (
                        <option key={color} value={color}>
                          {color}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div
                  className={`rounded-2xl border p-4 ${getConceptColorClasses(
                    form.color
                  )}`}
                >
                  <p className="font-black">
                    {form.name.trim() ||
                      "Untitled Concept"}
                  </p>

                  <p className="mt-1 text-xs opacity-70">
                    /
                    {slugify(form.name) ||
                      "concept-slug"}{" "}
                    · {form.category}
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <button
                    onClick={() => void saveConcept()}
                    disabled={isSaving}
                    className="rounded-xl bg-sky-400 px-4 py-3 text-sm font-black text-black hover:bg-sky-300 disabled:opacity-40"
                  >
                    {isSaving
                      ? "Saving..."
                      : selectedConcept
                      ? "Save Concept"
                      : "Create Concept"}
                  </button>

                  <button
                    onClick={resetConceptForm}
                    disabled={isSaving}
                    className="rounded-xl bg-neutral-800 px-4 py-3 text-sm font-black text-white hover:bg-neutral-700 disabled:opacity-40"
                  >
                    Reset
                  </button>

                  <button
                    onClick={() =>
                      void deleteSelectedConcept()
                    }
                    disabled={!selectedConcept || isSaving}
                    className="rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white hover:bg-red-500 disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : activeTab === "assign" ? (
          <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="font-black text-white">
                Entry Browser
              </h3>

              <input
                value={entrySearch}
                onChange={(event) =>
                  setEntrySearch(event.target.value)
                }
                placeholder="Search entries..."
                className="my-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-sky-400"
              />

              <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                {filteredEntries.map((entry) => {
                  const assignment = assignments.find(
                    (currentAssignment) =>
                      String(
                        currentAssignment.entryId
                      ) === String(entry.id)
                  );

                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => selectEntry(entry)}
                      className={`w-full rounded-2xl border p-4 text-left ${
                        selectedEntryId === String(entry.id)
                          ? "border-sky-400 bg-sky-400/10"
                          : "border-neutral-800 bg-neutral-950"
                      }`}
                    >
                      <div className="flex justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-black text-white">
                            {entry.word}
                          </p>

                          <p className="mt-1 text-xs text-neutral-500">
                            /{entry.slug}
                          </p>
                        </div>

                        <span className="rounded-full bg-neutral-800 px-2 py-1 text-xs font-black text-neutral-300">
                          {assignment?.conceptIds.length ?? 0}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              {selectedEntry ? (
                <>
                  <h3 className="text-2xl font-black text-white">
                    {selectedEntry.word}
                  </h3>

                  <p className="mt-1 text-sm text-neutral-500">
                    {draftConceptIds.length} cloud concept
                    {draftConceptIds.length === 1 ? "" : "s"} selected
                  </p>

                  {selectedEntryConcepts.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedEntryConcepts.map((concept) => (
                        <span
                          key={concept.id}
                          className={`rounded-full border px-3 py-1 text-xs font-black ${getConceptColorClasses(
                            concept.color
                          )}`}
                        >
                          {concept.name}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-5 space-y-2">
                    {concepts.map((concept) => {
                      const checked =
                        draftConceptIds.includes(
                          String(concept.id)
                        );

                      return (
                        <button
                          key={concept.id}
                          type="button"
                          onClick={() =>
                            toggleDraftConcept(
                              String(concept.id)
                            )
                          }
                          className={`w-full rounded-2xl border p-4 text-left ${
                            checked
                              ? "border-sky-400 bg-sky-400/10"
                              : "border-neutral-800 bg-neutral-950"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded border ${
                                checked
                                  ? "border-sky-400 bg-sky-400 text-black"
                                  : "border-neutral-700"
                              }`}
                            >
                              {checked ? "✓" : ""}
                            </span>

                            <p className="font-black text-white">
                              {concept.name}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    <button
                      onClick={() =>
                        void saveEntryAssignments()
                      }
                      disabled={isSaving}
                      className="rounded-xl bg-sky-400 px-4 py-3 text-sm font-black text-black hover:bg-sky-300 disabled:opacity-40"
                    >
                      Save Cloud Assignments
                    </button>

                    <button
                      onClick={() =>
                        void clearEntryAssignments()
                      }
                      disabled={
                        isSaving ||
                        draftConceptIds.length === 0
                      }
                      className="rounded-xl bg-neutral-800 px-4 py-3 text-sm font-black text-white hover:bg-neutral-700 disabled:opacity-40"
                    >
                      Clear Concepts
                    </button>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
                  Select an entry to edit its cloud assignments.
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[0.85fr_1.3fr]">
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="font-black text-white">
                Browse Cloud Concepts
              </h3>

              <div className="mt-4 space-y-2">
                {filteredConcepts.map((concept) => (
                  <button
                    key={concept.id}
                    type="button"
                    onClick={() => {
                      setBrowseConceptId(
                        String(concept.id)
                      );

                      setBrowseSearch("");
                    }}
                    className={`w-full rounded-2xl border p-4 text-left ${
                      browseConceptId ===
                      String(concept.id)
                        ? "border-sky-400 bg-sky-400/10"
                        : "border-neutral-800 bg-neutral-950"
                    }`}
                  >
                    <p className="font-black text-white">
                      {concept.name}
                    </p>

                    <p className="mt-1 text-xs text-neutral-500">
                      {conceptUsageCounts.get(
                        String(concept.id)
                      ) ?? 0}{" "}
                      linked
                    </p>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              {browseConcept ? (
                <>
                  <h3 className="text-3xl font-black text-white">
                    {browseConcept.name}
                  </h3>

                  <p className="mt-1 text-sm text-neutral-500">
                    {linkedEntriesForBrowseConcept.length} linked
                    entries
                  </p>

                  <input
                    value={browseSearch}
                    onChange={(event) =>
                      setBrowseSearch(event.target.value)
                    }
                    placeholder="Search linked entries..."
                    className="my-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-sky-400"
                  />

                  {linkedEntriesForBrowseConcept.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
                      No entries are linked to this cloud concept.
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {linkedEntriesForBrowseConcept.map(
                        (entry) => (
                          <div
                            key={entry.id}
                            className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
                          >
                            <div className="flex justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-black text-white">
                                  {entry.word}
                                </p>

                                <p className="mt-1 text-xs text-neutral-500">
                                  /{entry.slug}
                                </p>
                              </div>

                              {onOpenEntry && (
                                <button
                                  onClick={() =>
                                    openEntry(entry)
                                  }
                                  className="rounded-xl bg-sky-400 px-3 py-2 text-xs font-black text-black"
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
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
                  Select a cloud concept from the left.
                </div>
              )}
            </section>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-sky-400/20 bg-sky-400/10 p-4">
          <p className="font-black text-sky-100">
            Alpha 3.7C2 note
          </p>

          <p className="mt-2 text-sm leading-6 text-sky-100/70">
            Changes made here write directly to Supabase and remain
            available across devices. Local browser graph records are
            not deleted.
          </p>
        </div>
      </aside>
    </div>
  );
}

export default CloudConceptEditorDrawer;
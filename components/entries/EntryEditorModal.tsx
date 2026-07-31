"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Concept } from "@/types/concept";
import type { Entry, EntryStatus, Meaning } from "@/types/entry";
import { EditorialTaxonomyManager } from "@/components/settings/EditorialTaxonomyManager";
import { useEditorialTaxonomy } from "@/hooks/useEditorialTaxonomy";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import {
  formatConceptNames,
  loadEntryCloudConceptState,
  parseConceptNames,
  syncEntryCloudConcepts,
} from "@/lib/syncEntryCloudConcepts";
import {
  aiAddedStatusOptions,
  editorialStatusOptions,
  entryStatusOptions,
  entryTypes,
  lifecycleOptions,
  partOfSpeechOptions,
  usageFrequencyOptions,
  visibilityOptions,
} from "@/types/entry";

const inputClass =
  "mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400";

const textareaClass =
  "mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400";

const selectClass =
  "mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-yellow-400";

type AutosaveStatus =
  | "saved"
  | "unsaved"
  | "saving"
  | "offline"
  | "error";

type CloudSyncStatus =
  | "loading"
  | "idle"
  | "syncing"
  | "pending"
  | "synced"
  | "error";

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error) {
    return String(
      (
        error as {
          message?: unknown;
        }
      ).message ?? fallback,
    );
  }

  return fallback;
}

function getMissingMeaningFields(meaning: Meaning) {
  const missingFields: string[] = [];

  if (!meaning.title.trim()) missingFields.push("Meaning Title");
  if (!meaning.definition.trim()) missingFields.push("Definition");
  if (!meaning.example.trim()) missingFields.push("Example Sentence");
  if (!meaning.category.trim()) missingFields.push("Category");
  if (!meaning.tone.trim()) missingFields.push("Tone");
  if (!meaning.conceptsText.trim()) missingFields.push("Concepts");

  if (!meaning.usageFrequency.trim()) missingFields.push("Usage Frequency");

  return missingFields;
}

function getMeaningCompleteness(meaning: Meaning) {
  const totalFields = 6;
  const missingCount = getMissingMeaningFields(meaning).length;
  return Math.round(((totalFields - missingCount) / totalFields) * 100);
}

export function EntryEditorModal({
  entry,
  onClose,
  onSave,
  onAutoSave,
  onDelete,
}: {
  entry: Entry;
  onClose: () => void;
  onSave: (
    entry: Entry,
  ) => void | Promise<void>;
  onAutoSave: (
    entry: Entry,
  ) => Promise<
    "synced" | "queued" | void
  >;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Entry>(entry);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("saved");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [isTaxonomyManagerOpen, setIsTaxonomyManagerOpen] = useState(false);

  const {
    categories,
    tones,
    customOptions: customTaxonomyOptions,
    isLoading: isTaxonomyLoading,
    isSaving: isTaxonomySaving,
    error: taxonomyError,
    addOption: addTaxonomyOption,
    removeOption: removeTaxonomyOption,
  } = useEditorialTaxonomy();

  const [cloudConcepts, setCloudConcepts] = useState<Concept[]>([]);
  const [cloudAssignedConceptIds, setCloudAssignedConceptIds] = useState<
    string[]
  >([]);
  const [cloudSyncStatus, setCloudSyncStatus] =
    useState<CloudSyncStatus>("loading");
  const [cloudSyncError, setCloudSyncError] = useState("");
  const [cloudSyncedAt, setCloudSyncedAt] = useState<Date | null>(null);

  const firstRenderRef = useRef(true);
  const lastSavedSnapshotRef = useRef(JSON.stringify(entry));
  const saveVersionRef = useRef(0);
  const cloudStateLoadedRef = useRef(false);
  const conceptFieldsTouchedRef = useRef(false);
  const assignedConceptNamesRef = useRef<string[]>([]);

  const assignedCloudConcepts = useMemo(() => {
    const assignedIdSet = new Set(cloudAssignedConceptIds.map(String));

    return cloudConcepts.filter((concept) =>
      assignedIdSet.has(String(concept.id)),
    );
  }, [cloudAssignedConceptIds, cloudConcepts]);

  const refreshCloudConceptState =
    useCallback(async () => {
      const supabase =
        getSupabaseBrowserClient();

      const state =
        await loadEntryCloudConceptState(
          supabase,
          entry.id,
        );

      setCloudConcepts(
        state.concepts,
      );

      setCloudAssignedConceptIds(
        state.assignedConceptIds,
      );

      assignedConceptNamesRef.current =
        state.assignedConceptNames;

      cloudStateLoadedRef.current = true;
      conceptFieldsTouchedRef.current = false;
      setCloudSyncedAt(new Date());
      setCloudSyncStatus("synced");
      setCloudSyncError("");

      return state;
    }, [entry.id]);

  useEffect(() => {
    let cancelled = false;

    cloudStateLoadedRef.current = false;
    conceptFieldsTouchedRef.current = false;
    assignedConceptNamesRef.current = [];
    setCloudSyncStatus("loading");
    setCloudSyncError("");

    async function loadCloudConcepts() {
      try {
        const supabase = getSupabaseBrowserClient();

        const state = await loadEntryCloudConceptState(supabase, entry.id);

        if (cancelled) {
          return;
        }

        setCloudConcepts(state.concepts);
        setCloudAssignedConceptIds(state.assignedConceptIds);
        assignedConceptNamesRef.current = state.assignedConceptNames;
        cloudStateLoadedRef.current = true;
        setCloudSyncStatus("idle");
      } catch (error) {
        if (cancelled) {
          return;
        }

        cloudStateLoadedRef.current = true;
        setCloudSyncStatus("error");
        setCloudSyncError(
          getErrorMessage(error, "Unable to load the Concept Library."),
        );
      }
    }

    void loadCloudConcepts();

    return () => {
      cancelled = true;
    };
  }, [entry.id]);

  const syncCloudConcepts = useCallback(async (nextEntry: Entry) => {
    const supabase = getSupabaseBrowserClient();

    setCloudSyncStatus("syncing");
    setCloudSyncError("");

    try {
      let preserveConceptNames = conceptFieldsTouchedRef.current
        ? []
        : assignedConceptNamesRef.current;

      if (!cloudStateLoadedRef.current) {
        const currentState = await loadEntryCloudConceptState(
          supabase,
          nextEntry.id,
        );

        setCloudConcepts(currentState.concepts);
        setCloudAssignedConceptIds(currentState.assignedConceptIds);

        assignedConceptNamesRef.current = currentState.assignedConceptNames;

        preserveConceptNames = conceptFieldsTouchedRef.current
          ? []
          : currentState.assignedConceptNames;

        cloudStateLoadedRef.current = true;
      }

      const state = await syncEntryCloudConcepts(supabase, nextEntry, {
        preserveConceptNames,
      });

      setCloudConcepts(state.concepts);
      setCloudAssignedConceptIds(state.assignedConceptIds);
      assignedConceptNamesRef.current = state.assignedConceptNames;
      conceptFieldsTouchedRef.current = false;
      setCloudSyncedAt(new Date());
      setCloudSyncStatus("synced");

      window.dispatchEvent(new CustomEvent("yerrr:cloud-graph-changed"));

      return state;
    } catch (error) {
      setCloudSyncStatus("error");
      setCloudSyncError(
        getErrorMessage(
          error,
          "Unable to sync concepts with the Concept Library.",
        ),
      );

      throw error;
    }
  }, []);

  useEffect(() => {
    const currentSnapshot = JSON.stringify(draft);

    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }

    if (currentSnapshot === lastSavedSnapshotRef.current) {
      return;
    }

    setAutosaveStatus("unsaved");

    const timeout = window.setTimeout(async () => {
      const saveVersion = saveVersionRef.current + 1;
      saveVersionRef.current = saveVersion;

      try {
        setAutosaveStatus("saving");

        const saveResult =
          await onAutoSave(draft);

        if (
          saveResult === "queued"
        ) {
          if (
            saveVersion ===
            saveVersionRef.current
          ) {
            lastSavedSnapshotRef.current =
              currentSnapshot;

            setSavedAt(new Date());
            setAutosaveStatus(
              "offline",
            );

            setCloudSyncStatus(
              "pending",
            );

            setCloudSyncError("");
          }

          return;
        }

        try {
          await refreshCloudConceptState();
        } catch (error) {
          setCloudSyncStatus("error");

          setCloudSyncError(
            getErrorMessage(
              error,
              "The entry saved, but the Concept Library status could not be refreshed.",
            ),
          );
        }

        if (
          saveVersion ===
          saveVersionRef.current
        ) {
          lastSavedSnapshotRef.current =
            currentSnapshot;

          setSavedAt(new Date());
          setAutosaveStatus("saved");
        }
      } catch {
        setAutosaveStatus("error");
      }
    }, 1500);

    return () =>
      window.clearTimeout(timeout);
  }, [
    draft,
    onAutoSave,
    refreshCloudConceptState,
  ]);

  function updateMeaning(meaningId: string, updates: Partial<Meaning>) {
    if (Object.prototype.hasOwnProperty.call(updates, "conceptsText")) {
      conceptFieldsTouchedRef.current = true;
    }

    setDraft((currentDraft) => ({
      ...currentDraft,
      meanings: currentDraft.meanings.map((meaning) =>
        meaning.id === meaningId ? { ...meaning, ...updates } : meaning,
      ),
    }));
  }

  function addConceptToMeaning(meaningId: string, conceptName: string) {
    const cleanName = conceptName.trim();

    if (!cleanName) {
      return;
    }

    const meaning = draft.meanings.find(
      (currentMeaning) => currentMeaning.id === meaningId,
    );

    if (!meaning) {
      return;
    }

    const nextNames = [...parseConceptNames(meaning.conceptsText), cleanName];

    updateMeaning(meaningId, {
      conceptsText: formatConceptNames(nextNames),
    });
  }

  function removeConceptFromMeaning(meaningId: string, conceptName: string) {
    const meaning = draft.meanings.find(
      (currentMeaning) => currentMeaning.id === meaningId,
    );

    if (!meaning) {
      return;
    }

    const normalizedName = conceptName.trim().toLowerCase();

    updateMeaning(meaningId, {
      conceptsText: formatConceptNames(
        parseConceptNames(meaning.conceptsText).filter(
          (currentName) => currentName.trim().toLowerCase() !== normalizedName,
        ),
      ),
    });
  }

  async function handleManualSave() {
    try {
      setAutosaveStatus("saving");

      await Promise.resolve(
        onSave(draft),
      );

      lastSavedSnapshotRef.current =
        JSON.stringify(draft);

      setSavedAt(new Date());

      if (
        typeof navigator !==
          "undefined" &&
        !navigator.onLine
      ) {
        setAutosaveStatus(
          "offline",
        );

        setCloudSyncStatus(
          "pending",
        );
      } else {
        setAutosaveStatus(
          "saved",
        );
      }
    } catch {
      setAutosaveStatus("error");
    }
  }

  function addMeaning() {
    setDraft((currentDraft) => ({
      ...currentDraft,
      meanings: [
        ...currentDraft.meanings,
        {
          id: `temp-${Date.now()}`,
          title: "",
          definition: "",
          example: "",
          plainEnglish: "",
          category: "",
          tone: "",
          conceptsText: "",
          usageFrequency: "",
          culturalContext: "",
          editorialStatus: "Draft",
          aiAddedStatus: "No",
          verified: false,
          source: "Original",
        },
      ],
    }));
  }

  function removeMeaning(meaningId: string) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      meanings:
        currentDraft.meanings.length === 1
          ? currentDraft.meanings
          : currentDraft.meanings.filter((meaning) => meaning.id !== meaningId),
    }));
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
        <div className="sticky top-0 z-10 -mx-6 -mt-6 mb-6 border-b border-neutral-800 bg-neutral-900/95 px-6 py-5 backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-yellow-400">
                Full Lexicon V8 Editor
              </p>
              <h2 className="mt-2 text-3xl font-black">{draft.word}</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Autosave is active. Changes save after you stop typing.
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-fit rounded-lg bg-neutral-800 px-3 py-2 text-sm font-bold hover:bg-neutral-700"
            >
              Close
            </button>
          </div>

          <div className="mt-4 grid gap-3 rounded-xl border border-neutral-800 bg-neutral-950 p-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-black text-neutral-300">
                Entry Autosave
              </p>

              <AutosaveIndicator status={autosaveStatus} savedAt={savedAt} />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black text-neutral-300">
                  Concept Library Sync
                </p>

                <button
                  type="button"
                  onClick={() => {
                    void syncCloudConcepts(
                      draft,
                    ).catch(
                      () => undefined,
                    );
                  }}
                  disabled={
                    cloudSyncStatus === "loading" ||
                    cloudSyncStatus === "syncing"
                  }
                  className="rounded-lg border border-sky-400/30 px-2 py-1 text-[11px] font-black text-sky-300 hover:bg-sky-400/10 disabled:opacity-40"
                >
                  Sync now
                </button>
              </div>

              <CloudConceptSyncIndicator
                status={cloudSyncStatus}
                error={cloudSyncError}
                syncedAt={cloudSyncedAt}
                assignedCount={cloudAssignedConceptIds.length}
              />
            </div>
          </div>

          {assignedCloudConcepts.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {assignedCloudConcepts.map((concept) => (
                <span
                  key={concept.id}
                  className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-black text-sky-200"
                >
                  {concept.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <Section title="Word Editor" subtitle="Core word or phrase metadata.">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Word / Phrase">
              <input
                value={draft.word}
                onChange={(event) =>
                  setDraft({ ...draft, word: event.target.value })
                }
                className={inputClass}
              />
            </Field>

            <Field label="Type">
              <select
                value={draft.type}
                onChange={(event) =>
                  setDraft({ ...draft, type: event.target.value })
                }
                className={selectClass}
              >
                {entryTypes.map((entryType) => (
                  <option key={entryType}>{entryType}</option>
                ))}
              </select>
            </Field>

            <Field label="Slug">
              <input
                value={draft.slug}
                onChange={(event) =>
                  setDraft({ ...draft, slug: event.target.value })
                }
                className={inputClass}
              />
            </Field>

            <Field label="Pronunciation">
              <input
                value={draft.pronunciation}
                onChange={(event) =>
                  setDraft({ ...draft, pronunciation: event.target.value })
                }
                className={inputClass}
              />
            </Field>

            <Field label="Part of Speech">
              <select
                value={draft.partOfSpeech}
                onChange={(event) =>
                  setDraft({ ...draft, partOfSpeech: event.target.value })
                }
                className={selectClass}
              >
                {partOfSpeechOptions.map((partOfSpeech) => (
                  <option key={partOfSpeech}>{partOfSpeech}</option>
                ))}
              </select>
            </Field>

            <Field label="Alternate Spellings">
              <input
                value={draft.alternateSpellings}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    alternateSpellings: event.target.value,
                  })
                }
                className={inputClass}
              />
            </Field>
          </div>
        </Section>

        <Section title="Meaning Editor" subtitle="Edit each distinct meaning.">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setIsTaxonomyManagerOpen(true)}
              className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-black text-neutral-300 hover:border-yellow-400 hover:text-yellow-200"
            >
              ⚙ Manage Categories & Tones
            </button>

            <button
              type="button"
              onClick={addMeaning}
              className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-black hover:bg-yellow-300"
            >
              ➕ Add Meaning
            </button>
          </div>

          <div className="space-y-5">
            {draft.meanings.map((meaning, index) => {
              const missingFields = getMissingMeaningFields(meaning);
              const completeness = getMeaningCompleteness(meaning);
              const categoryChoices = mergeCurrentOption(
                categories,
                meaning.category,
              );
              const toneChoices = mergeCurrentOption(tones, meaning.tone);

              return (
                <div
                  key={meaning.id}
                  className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5"
                >
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-black text-yellow-400">
                        Meaning #{index + 1}
                      </p>
                      <p className="text-sm text-neutral-500">
                        Completeness: {completeness}%
                      </p>
                    </div>

                    <button
                      onClick={() => removeMeaning(meaning.id)}
                      disabled={draft.meanings.length === 1}
                      className="rounded-lg bg-neutral-800 px-3 py-2 text-xs font-bold text-neutral-300 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Meaning Title">
                      <input
                        value={meaning.title}
                        onChange={(event) =>
                          updateMeaning(meaning.id, {
                            title: event.target.value,
                          })
                        }
                        className={inputClass}
                      />
                    </Field>

                    <Field label="Category">
                      <select
                        value={meaning.category}
                        onChange={(event) =>
                          updateMeaning(meaning.id, {
                            category: event.target.value,
                          })
                        }
                        className={selectClass}
                      >
                        {categoryChoices.map((category) => (
                          <option key={category}>{category}</option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Tone">
                      <select
                        value={meaning.tone}
                        onChange={(event) =>
                          updateMeaning(meaning.id, {
                            tone: event.target.value,
                          })
                        }
                        className={selectClass}
                      >
                        {toneChoices.map((tone) => (
                          <option key={tone}>{tone}</option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Usage Frequency">
                      <select
                        value={meaning.usageFrequency}
                        onChange={(event) =>
                          updateMeaning(meaning.id, {
                            usageFrequency: event.target.value,
                          })
                        }
                        className={selectClass}
                      >
                        {usageFrequencyOptions.map((frequency) => (
                          <option key={frequency}>{frequency}</option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Editorial Status">
                      <select
                        value={meaning.editorialStatus}
                        onChange={(event) =>
                          updateMeaning(meaning.id, {
                            editorialStatus: event.target
                              .value as Meaning["editorialStatus"],
                          })
                        }
                        className={selectClass}
                      >
                        {editorialStatusOptions.map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                    </Field>

                    <Field label="AI Added?">
                      <select
                        value={meaning.aiAddedStatus}
                        onChange={(event) =>
                          updateMeaning(meaning.id, {
                            aiAddedStatus: event.target
                              .value as Meaning["aiAddedStatus"],
                          })
                        }
                        className={selectClass}
                      >
                        {aiAddedStatusOptions.map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <div className="mt-4 space-y-4">
                    <Field label="Definition">
                      <textarea
                        value={meaning.definition}
                        onChange={(event) =>
                          updateMeaning(meaning.id, {
                            definition: event.target.value,
                          })
                        }
                        rows={3}
                        className={textareaClass}
                      />
                    </Field>

                    <Field label="Example Sentence">
                      <textarea
                        value={meaning.example}
                        onChange={(event) =>
                          updateMeaning(meaning.id, {
                            example: event.target.value,
                          })
                        }
                        rows={3}
                        className={textareaClass}
                      />
                    </Field>

                    <div className="block text-sm font-bold text-neutral-300">
                      <p>Concepts</p>

                      <input
                        value={meaning.conceptsText}
                        onChange={(event) =>
                          updateMeaning(meaning.id, {
                            conceptsText: event.target.value,
                          })
                        }
                        className={inputClass}
                      />

                      <div className="mt-3 rounded-xl border border-sky-400/20 bg-sky-400/5 p-4">
{parseConceptNames(meaning.conceptsText).length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {parseConceptNames(meaning.conceptsText).map(
                              (conceptName) => (
                                <button
                                  key={conceptName}
                                  type="button"
                                  onClick={() =>
                                    removeConceptFromMeaning(
                                      meaning.id,
                                      conceptName,
                                    )
                                  }
                                  className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-black text-sky-200 hover:border-red-400/40 hover:bg-red-400/10 hover:text-red-200"
                                  title="Remove concept"
                                >
                                  {conceptName} ×
                                </button>
                              ),
                            )}
                          </div>
                        )}

                        <select
                          defaultValue=""
                          onChange={(event) => {
                            addConceptToMeaning(meaning.id, event.target.value);

                            event.currentTarget.value = "";
                          }}
                          disabled={cloudSyncStatus === "loading"}
                          className={`${selectClass} text-sm`}
                        >
                          <option value="">Add from Concept Library...</option>

                          {cloudConcepts
                            .filter(
                              (concept) =>
                                !parseConceptNames(meaning.conceptsText).some(
                                  (selectedName) =>
                                    selectedName.toLowerCase() ===
                                    concept.name.toLowerCase(),
                                ),
                            )
                            .map((concept) => (
                              <option key={concept.id} value={concept.name}>
                                {concept.name} · {concept.category}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>

                    <Field label="Cultural Context">
                      <textarea
                        value={meaning.culturalContext}
                        onChange={(event) =>
                          updateMeaning(meaning.id, {
                            culturalContext: event.target.value,
                          })
                        }
                        rows={3}
                        className={textareaClass}
                      />
                    </Field>

                    <Field label="Source">
                      <input
                        value={meaning.source}
                        onChange={(event) =>
                          updateMeaning(meaning.id, {
                            source: event.target.value,
                          })
                        }
                        className={inputClass}
                      />
                    </Field>

                    <CheckboxField
                      label="Verified?"
                      checked={meaning.verified}
                      onChange={(checked) =>
                        updateMeaning(meaning.id, { verified: checked })
                      }
                    />

                    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                      <p className="text-sm font-black text-neutral-300">
                        Missing Fields
                      </p>
                      <p className="mt-2 text-sm text-neutral-500">
                        {missingFields.length > 0
                          ? missingFields.join(", ")
                          : "None. This meaning is complete."}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        <Section
          title="Publishing & Media"
          subtitle="Status, visibility, audio, and illustration fields."
        >
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Entry Status">
              <select
                value={draft.status}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    status: event.target.value as EntryStatus,
                  })
                }
                className={selectClass}
              >
                {entryStatusOptions.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </Field>

            <Field label="Lifecycle">
              <select
                value={draft.lifecycle}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    lifecycle: event.target.value as Entry["lifecycle"],
                  })
                }
                className={selectClass}
              >
                {lifecycleOptions.map((lifecycle) => (
                  <option key={lifecycle}>{lifecycle}</option>
                ))}
              </select>
            </Field>

            <Field label="Visibility">
              <select
                value={draft.visibility}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    visibility: event.target.value as Entry["visibility"],
                  })
                }
                className={selectClass}
              >
                {visibilityOptions.map((visibility) => (
                  <option key={visibility}>{visibility}</option>
                ))}
              </select>
            </Field>

            <Field label="AI Added?">
              <select
                value={draft.aiAddedStatus}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    aiAddedStatus: event.target.value as Entry["aiAddedStatus"],
                  })
                }
                className={selectClass}
              >
                {aiAddedStatusOptions.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </Field>

            <Field label="Audio Filename">
              <input
                value={draft.audioFilename}
                onChange={(event) =>
                  setDraft({ ...draft, audioFilename: event.target.value })
                }
                className={inputClass}
              />
            </Field>

            <Field label="Illustration Filename">
              <input
                value={draft.illustrationFilename}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    illustrationFilename: event.target.value,
                  })
                }
                className={inputClass}
              />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <CheckboxField
              label="Featured?"
              checked={draft.featured}
              onChange={(checked) => setDraft({ ...draft, featured: checked })}
            />

            <Field label="Illustration Notes">
              <textarea
                value={draft.illustrationNotes}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    illustrationNotes: event.target.value,
                  })
                }
                rows={3}
                className={textareaClass}
              />
            </Field>
          </div>
        </Section>

        <Section title="Editorial Notes" subtitle="Private notes for your CMS.">
          <textarea
            value={draft.notes}
            onChange={(event) =>
              setDraft({ ...draft, notes: event.target.value })
            }
            rows={4}
            className={textareaClass}
          />
        </Section>

        <div className="mt-6 flex flex-col gap-3 md:flex-row">
          <button
            onClick={() => void handleManualSave()}
            className="flex-1 rounded-xl bg-yellow-400 px-4 py-3 font-black text-black hover:bg-yellow-300"
          >
            Save Changes Manually
          </button>

          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-neutral-800 px-4 py-3 font-bold text-white hover:bg-neutral-700"
          >
            Cancel
          </button>

          <button
            onClick={() => onDelete(draft.id)}
            className="rounded-xl bg-red-600 px-4 py-3 font-black text-white hover:bg-red-500"
          >
            Delete Entry
          </button>
        </div>
        </div>
      </div>

      <EditorialTaxonomyManager
        isOpen={isTaxonomyManagerOpen}
        onClose={() => setIsTaxonomyManagerOpen(false)}
        categories={categories}
        tones={tones}
        customOptions={customTaxonomyOptions}
        isLoading={isTaxonomyLoading}
        isSaving={isTaxonomySaving}
        error={taxonomyError}
        onAddOption={addTaxonomyOption}
        onRemoveOption={removeTaxonomyOption}
      />
    </>
  );
}

function mergeCurrentOption(options: string[], currentValue: string) {
  const cleanCurrentValue = currentValue.trim();
  const values = cleanCurrentValue
    ? [...options, cleanCurrentValue]
    : [...options];

  const unique = new Map<string, string>();

  values.forEach((value) => {
    const cleanValue = value.trim();

    if (!cleanValue) {
      return;
    }

    const key = cleanValue.toLocaleLowerCase();

    if (!unique.has(key)) {
      unique.set(key, cleanValue);
    }
  });

  return [
    "",
    ...Array.from(unique.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    ),
  ];
}

function CloudConceptSyncIndicator({
  status,
  error,
  syncedAt,
  assignedCount,
}: {
  status: CloudSyncStatus;
  error: string;
  syncedAt: Date | null;
  assignedCount: number;
}) {
  if (status === "loading") {
    return (
      <div className="rounded-full bg-neutral-800 px-3 py-1 text-xs font-black uppercase tracking-wide text-neutral-300">
        Loading library...
      </div>
    );
  }

  if (status === "syncing") {
    return (
      <div className="rounded-full bg-blue-500/20 px-3 py-1 text-xs font-black uppercase tracking-wide text-blue-300">
        Syncing concepts...
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="rounded-xl bg-yellow-500/20 px-3 py-2 text-xs font-bold text-yellow-300">
        Saved locally · concept sync pending
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        className="rounded-xl bg-red-500/20 px-3 py-2 text-xs font-bold text-red-300"
        title={error}
      >
        Concept sync failed
        {error ? `: ${error}` : ""}
      </div>
    );
  }

  if (status === "synced") {
    return (
      <div className="rounded-full bg-sky-500/20 px-3 py-1 text-xs font-black uppercase tracking-wide text-sky-300">
        {assignedCount} linked
        {syncedAt
          ? ` · ${syncedAt.toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}`
          : ""}
      </div>
    );
  }

  return (
    <div className="rounded-full bg-sky-500/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-sky-300">
      {assignedCount} linked · ready
    </div>
  );
}

function AutosaveIndicator({
  status,
  savedAt,
}: {
  status: AutosaveStatus;
  savedAt: Date | null;
}) {
  if (status === "saving") {
    return (
      <div className="rounded-full bg-blue-500/20 px-3 py-1 text-xs font-black uppercase tracking-wide text-blue-300">
        Saving...
      </div>
    );
  }

  if (status === "unsaved") {
    return (
      <div className="rounded-full bg-yellow-500/20 px-3 py-1 text-xs font-black uppercase tracking-wide text-yellow-300">
        Unsaved changes...
      </div>
    );
  }

  if (status === "offline") {
    return (
      <div className="rounded-xl bg-yellow-500/20 px-3 py-2 text-xs font-black uppercase tracking-wide text-yellow-300">
        Saved locally · syncs when online
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-black uppercase tracking-wide text-red-300">
        Autosave failed
      </div>
    );
  }

  return (
    <div className="rounded-full bg-green-500/20 px-3 py-1 text-xs font-black uppercase tracking-wide text-green-300">
      Saved
      {savedAt
        ? ` at ${savedAt.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}`
        : ""}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5">
      <div className="mb-5">
        <h3 className="text-xl font-black">{title}</h3>
        <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>
      </div>

      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-bold text-neutral-300">
      {label}
      {children}
    </label>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm font-bold text-neutral-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-yellow-400"
      />
      {label}
    </label>
  );
}

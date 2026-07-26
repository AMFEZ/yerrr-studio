"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  Entry,
  Meaning,
} from "@/types/entry";

import type {
  AIApprovedEdit,
  AIEditorialHandoff,
} from "@/types/aiEditorial";

type AIEditorialHandoffPanelProps = {
  handoff: AIEditorialHandoff;
  entry: Entry;
  onApplyEntry: (entry: Entry) => Promise<void>;
  onClose: () => void;
};

type EntryEditableField =
  | "pronunciation"
  | "partOfSpeech";

type MeaningEditableField =
  | "title"
  | "definition"
  | "example"
  | "category"
  | "tone"
  | "conceptsText"
  | "usageFrequency";

const ENTRY_EDITABLE_FIELDS =
  new Set<EntryEditableField>([
    "pronunciation",
    "partOfSpeech",
  ]);

const MEANING_EDITABLE_FIELDS =
  new Set<MeaningEditableField>([
    "title",
    "definition",
    "example",
    "category",
    "tone",
    "conceptsText",
    "usageFrequency",
  ]);

function titleCaseToken(value: string) {
  return value
    .replace(/\[(\d+)\]/g, " $1 ")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    )
    .replace(/\s+/g, " ")
    .trim();
}

function readinessLabel(
  readiness:
    AIEditorialHandoff["publishReadiness"],
) {
  if (readiness === "not_ready") {
    return "Not ready";
  }

  if (
    readiness ===
    "ready_after_verification"
  ) {
    return "Ready after verification";
  }

  return "Needs editor review";
}

function isEntryEditableField(
  value: string,
): value is EntryEditableField {
  return ENTRY_EDITABLE_FIELDS.has(
    value as EntryEditableField,
  );
}

function isMeaningEditableField(
  value: string,
): value is MeaningEditableField {
  return MEANING_EDITABLE_FIELDS.has(
    value as MeaningEditableField,
  );
}

function normalizeLegacyFieldPath(
  field: string,
  entry: Entry,
) {
  const trimmed = field.trim();

  if (
    isEntryEditableField(trimmed)
  ) {
    return trimmed;
  }

  const compact = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  if (compact === "pronunciation") {
    return "pronunciation";
  }

  if (
    compact === "partofspeech" ||
    compact === "pos"
  ) {
    return "partOfSpeech";
  }

  const exactPath = trimmed.match(
    /^meanings\[(\d+)\]\.([A-Za-z]+)$/,
  );

  if (exactPath) {
    return `meanings[${exactPath[1]}].${exactPath[2]}`;
  }

  const legacyMeaning = trimmed.match(
    /meaning(?:s)?[\s_\-]*(\d+)[\s._\-]+([A-Za-z_\- ]+)/i,
  );

  if (legacyMeaning) {
    const oneBasedIndex = Number(
      legacyMeaning[1],
    );
    const rawField = legacyMeaning[2]
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");

    const fieldMap: Record<
      string,
      MeaningEditableField
    > = {
      title: "title",
      meaningtitle: "title",
      definition: "definition",
      example: "example",
      examplesentence: "example",
      category: "category",
      tone: "tone",
      concept: "conceptsText",
      concepts: "conceptsText",
      conceptstext: "conceptsText",
      usagefrequency: "usageFrequency",
      frequency: "usageFrequency",
    };

    const mappedField = fieldMap[rawField];

    if (
      mappedField &&
      Number.isInteger(oneBasedIndex) &&
      oneBasedIndex >= 1
    ) {
      return `meanings[${oneBasedIndex - 1}].${mappedField}`;
    }
  }

  if (entry.meanings.length === 1) {
    const singleMeaningMap: Record<
      string,
      MeaningEditableField
    > = {
      title: "title",
      meaningtitle: "title",
      definition: "definition",
      example: "example",
      examplesentence: "example",
      category: "category",
      tone: "tone",
      concept: "conceptsText",
      concepts: "conceptsText",
      conceptstext: "conceptsText",
      usagefrequency: "usageFrequency",
      frequency: "usageFrequency",
    };

    const mappedField =
      singleMeaningMap[compact];

    if (mappedField) {
      return `meanings[0].${mappedField}`;
    }
  }

  return "";
}

function applyEditToEntry(
  entry: Entry,
  edit: AIApprovedEdit,
): Entry | null {
  const suggestedValue =
    edit.suggestedValue.trim();

  if (!suggestedValue) {
    return null;
  }

  const fieldPath =
    normalizeLegacyFieldPath(
      edit.field,
      entry,
    );

  if (
    isEntryEditableField(fieldPath)
  ) {
    return {
      ...entry,
      [fieldPath]: suggestedValue,
    };
  }

  const meaningMatch =
    fieldPath.match(
      /^meanings\[(\d+)\]\.([A-Za-z]+)$/,
    );

  if (!meaningMatch) {
    return null;
  }

  const meaningIndex = Number(
    meaningMatch[1],
  );
  const meaningField =
    meaningMatch[2];

  if (
    !Number.isInteger(meaningIndex) ||
    meaningIndex < 0 ||
    meaningIndex >=
      entry.meanings.length ||
    !isMeaningEditableField(
      meaningField,
    )
  ) {
    return null;
  }

  const meanings = entry.meanings.map(
    (meaning, index): Meaning => {
      if (index !== meaningIndex) {
        return meaning;
      }

      return {
        ...meaning,
        [meaningField]: suggestedValue,
      };
    },
  );

  return {
    ...entry,
    meanings,
  };
}

function getEditKey(
  edit: AIApprovedEdit,
  index: number,
) {
  return [
    index,
    edit.field,
    edit.suggestedValue,
  ].join("::");
}

function formatEdit(edit: AIApprovedEdit) {
  return [
    titleCaseToken(edit.field),
    `Current: ${
      edit.currentValue || "(empty)"
    }`,
    `Approved suggestion: ${
      edit.suggestedValue ||
      "(no replacement text)"
    }`,
    `Reason: ${edit.reason}`,
    `Confidence: ${edit.confidence}`,
  ].join("\n");
}

function formatHandoff(
  handoff: AIEditorialHandoff,
  edits: AIApprovedEdit[],
) {
  return [
    `YERRR Studio AI Editorial Review: ${handoff.entryWord}`,
    `Quality score: ${handoff.qualityScore}/100`,
    `Publish readiness: ${readinessLabel(
      handoff.publishReadiness,
    )}`,
    `Remaining approved changes: ${edits.length}`,
    "",
    "Approved edits",
    ...edits.flatMap(
      (edit, index) => [
        "",
        `${index + 1}. ${formatEdit(edit)}`,
      ],
    ),
    "",
    "Verification checklist",
    ...(handoff.verificationChecklist.length
      ? handoff.verificationChecklist.map(
          (item) => `- ${item}`,
        )
      : ["- No additional checks listed"]),
  ].join("\n");
}

export function AIEditorialHandoffPanel({
  handoff,
  entry,
  onApplyEntry,
  onClose,
}: AIEditorialHandoffPanelProps) {
  const [workingEntry, setWorkingEntry] =
    useState<Entry>(entry);

  const [remainingEdits, setRemainingEdits] =
    useState<AIApprovedEdit[]>(
      handoff.approvedEdits,
    );

  const [isCollapsed, setIsCollapsed] =
    useState(false);
  const [applyingKey, setApplyingKey] =
    useState("");
  const [isApplyingAll, setIsApplyingAll] =
    useState(false);
  const [notice, setNotice] =
    useState("");
  const [error, setError] =
    useState("");
  const [copiedLabel, setCopiedLabel] =
    useState("");
  const [appliedCount, setAppliedCount] =
    useState(0);
  const [dismissedCount, setDismissedCount] =
    useState(0);

  useEffect(() => {
    setWorkingEntry(entry);
  }, [entry]);

  useEffect(() => {
    setRemainingEdits(
      handoff.approvedEdits,
    );
    setNotice("");
    setError("");
    setAppliedCount(0);
    setDismissedCount(0);
  }, [handoff.id, handoff.approvedEdits]);

  const applicableCount = useMemo(
    () =>
      remainingEdits.filter((edit) =>
        Boolean(
          applyEditToEntry(
            workingEntry,
            edit,
          ),
        ),
      ).length,
    [remainingEdits, workingEntry],
  );

  async function applySingleEdit(
    edit: AIApprovedEdit,
    index: number,
  ) {
    const key = getEditKey(edit, index);
    const nextEntry = applyEditToEntry(
      workingEntry,
      edit,
    );

    if (!nextEntry) {
      setError(
        `“${edit.field}” is not a supported editable field path.`,
      );
      return;
    }

    try {
      setApplyingKey(key);
      setError("");
      setNotice("");

      await onApplyEntry(nextEntry);

      setWorkingEntry(nextEntry);
      setRemainingEdits((current) =>
        current.filter(
          (candidate) =>
            candidate !== edit,
        ),
      );
      setAppliedCount(
        (current) => current + 1,
      );
      setNotice(
        `${titleCaseToken(edit.field)} applied and saved.`,
      );
    } catch (applyError) {
      setError(
        applyError instanceof Error
          ? applyError.message
          : "The approved edit could not be saved.",
      );
    } finally {
      setApplyingKey("");
    }
  }

  async function applyAllEdits() {
    if (
      isApplyingAll ||
      remainingEdits.length === 0
    ) {
      return;
    }

    let nextEntry = workingEntry;
    const appliedEdits: AIApprovedEdit[] = [];
    const unsupportedEdits: AIApprovedEdit[] = [];

    remainingEdits.forEach((edit) => {
      const candidate =
        applyEditToEntry(nextEntry, edit);

      if (!candidate) {
        unsupportedEdits.push(edit);
        return;
      }

      nextEntry = candidate;
      appliedEdits.push(edit);
    });

    if (appliedEdits.length === 0) {
      setError(
        "None of the remaining approved edits use supported field paths.",
      );
      return;
    }

    try {
      setIsApplyingAll(true);
      setError("");
      setNotice("");

      await onApplyEntry(nextEntry);

      setWorkingEntry(nextEntry);
      setRemainingEdits(unsupportedEdits);
      setAppliedCount(
        (current) =>
          current + appliedEdits.length,
      );
      setNotice(
        `${appliedEdits.length} approved edit${
          appliedEdits.length === 1
            ? ""
            : "s"
        } applied and saved.`,
      );

      if (unsupportedEdits.length > 0) {
        setError(
          `${unsupportedEdits.length} older suggestion${
            unsupportedEdits.length === 1
              ? " uses"
              : "s use"
          } an unsupported field path and was not applied.`,
        );
      }
    } catch (applyError) {
      setError(
        applyError instanceof Error
          ? applyError.message
          : "The approved edits could not be saved.",
      );
    } finally {
      setIsApplyingAll(false);
    }
  }

  function dismissEdit(edit: AIApprovedEdit) {
    setRemainingEdits((current) =>
      current.filter(
        (candidate) =>
          candidate !== edit,
      ),
    );
    setDismissedCount(
      (current) => current + 1,
    );
    setError("");
    setNotice(
      `${titleCaseToken(edit.field)} dismissed without changing the entry.`,
    );
  }

  async function copyText(
    label: string,
    value: string,
  ) {
    try {
      await navigator.clipboard.writeText(
        value,
      );

      setCopiedLabel(label);

      window.setTimeout(() => {
        setCopiedLabel((current) =>
          current === label ? "" : current,
        );
      }, 1_800);
    } catch {
      setCopiedLabel("");
    }
  }

  return (
    <aside className="fixed inset-x-3 bottom-24 z-[95] overflow-hidden rounded-3xl border border-yellow-400/30 bg-neutral-950 shadow-2xl md:bottom-6 md:left-auto md:right-6 md:w-[500px]">
      <header className="border-b border-neutral-800 bg-yellow-400/10 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-300">
              AI Entry Review
            </p>

            <h2 className="mt-1 text-lg font-black text-white">
              {handoff.entryWord}
            </h2>

            <p className="mt-1 text-xs text-neutral-400">
              {remainingEdits.length} remaining
              {" · "}
              {handoff.qualityScore}/100
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setIsCollapsed(
                  (current) => !current,
                )
              }
              className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-black text-neutral-300 hover:border-yellow-400 hover:text-yellow-200"
            >
              {isCollapsed
                ? "Expand"
                : "Minimize"}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close AI entry review"
              className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-black text-neutral-300 hover:border-red-400 hover:text-red-200"
            >
              ✕
            </button>
          </div>
        </div>
      </header>

      {!isCollapsed && (
        <>
          <div className="max-h-[62vh] space-y-4 overflow-y-auto p-4">
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-neutral-950 p-3">
                  <p className="text-lg font-black text-green-200">
                    {appliedCount}
                  </p>
                  <p className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-neutral-600">
                    Applied
                  </p>
                </div>
                <div className="rounded-xl bg-neutral-950 p-3">
                  <p className="text-lg font-black text-red-200">
                    {dismissedCount}
                  </p>
                  <p className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-neutral-600">
                    Dismissed
                  </p>
                </div>
                <div className="rounded-xl bg-neutral-950 p-3">
                  <p className="text-lg font-black text-yellow-200">
                    {remainingEdits.length}
                  </p>
                  <p className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-neutral-600">
                    Remaining
                  </p>
                </div>
              </div>

              <p className="mt-4 text-sm font-black text-white">
                {readinessLabel(
                  handoff.publishReadiness,
                )}
              </p>

              <p className="mt-2 text-xs leading-5 text-neutral-500">
                Apply writes the approved value to the real entry and saves through the normal Studio workflow. Dismiss removes it without changing anything.
              </p>
            </section>

            {notice && (
              <section className="rounded-2xl border border-green-400/25 bg-green-400/10 p-4 text-sm font-bold text-green-100">
                {notice}
              </section>
            )}

            {error && (
              <section className="rounded-2xl border border-red-400/25 bg-red-400/10 p-4 text-sm font-bold text-red-100">
                {error}
              </section>
            )}

            {remainingEdits.length === 0 ? (
              <section className="rounded-2xl border border-green-400/20 bg-green-400/10 p-5 text-center">
                <p className="font-black text-green-100">
                  Review complete
                </p>
                <p className="mt-2 text-sm text-green-100/70">
                  Every approved suggestion has been applied or dismissed.
                </p>
              </section>
            ) : (
              <section>
                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">
                  Approved suggestions
                </p>

                <div className="space-y-3">
                  {remainingEdits.map(
                    (edit, index) => {
                      const key = getEditKey(
                        edit,
                        index,
                      );
                      const supported = Boolean(
                        applyEditToEntry(
                          workingEntry,
                          edit,
                        ),
                      );

                      return (
                        <article
                          key={key}
                          className={`rounded-2xl border p-4 ${
                            supported
                              ? "border-green-400/20 bg-green-400/5"
                              : "border-red-400/20 bg-red-400/5"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-black text-white">
                                {titleCaseToken(
                                  edit.field,
                                )}
                              </p>
                              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-neutral-600">
                                {edit.confidence} confidence
                              </p>
                            </div>

                            {!supported && (
                              <span className="rounded-full bg-red-400/15 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-red-200">
                                Unsupported path
                              </span>
                            )}
                          </div>

                          <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-neutral-600">
                              Current
                            </p>
                            <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-neutral-400">
                              {edit.currentValue ||
                                "Empty"}
                            </p>
                          </div>

                          <div className="mt-2 rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-3">
                            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-yellow-100/60">
                              Approved suggestion
                            </p>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-yellow-50">
                              {edit.suggestedValue ||
                                "No replacement text supplied."}
                            </p>
                          </div>

                          <p className="mt-3 text-xs leading-5 text-neutral-500">
                            {edit.reason}
                          </p>

                          <div className="mt-4 grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                void applySingleEdit(
                                  edit,
                                  index,
                                )
                              }
                              disabled={
                                !supported ||
                                Boolean(applyingKey) ||
                                isApplyingAll
                              }
                              className="rounded-xl bg-green-400 px-2 py-2 text-xs font-black text-black hover:bg-green-300 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              {applyingKey === key
                                ? "Saving..."
                                : "Apply"}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                dismissEdit(edit)
                              }
                              disabled={
                                Boolean(applyingKey) ||
                                isApplyingAll
                              }
                              className="rounded-xl bg-red-500/20 px-2 py-2 text-xs font-black text-red-200 hover:bg-red-500/30 disabled:opacity-30"
                            >
                              Dismiss
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                void copyText(
                                  key,
                                  edit.suggestedValue,
                                )
                              }
                              disabled={
                                !edit.suggestedValue
                              }
                              className="rounded-xl border border-neutral-700 bg-neutral-950 px-2 py-2 text-xs font-black text-neutral-300 hover:border-yellow-400 hover:text-yellow-200 disabled:opacity-30"
                            >
                              {copiedLabel === key
                                ? "Copied"
                                : "Copy"}
                            </button>
                          </div>
                        </article>
                      );
                    },
                  )}
                </div>
              </section>
            )}

            {handoff.verificationChecklist.length > 0 && (
              <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">
                  Verification checklist
                </p>

                <div className="mt-3 space-y-2">
                  {handoff.verificationChecklist.map(
                    (item, index) => (
                      <div
                        key={`${item}-${index}`}
                        className="flex gap-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3"
                      >
                        <span className="text-neutral-600">
                          □
                        </span>
                        <p className="text-xs leading-5 text-neutral-300">
                          {item}
                        </p>
                      </div>
                    ),
                  )}
                </div>
              </section>
            )}
          </div>

          <footer className="grid grid-cols-2 gap-2 border-t border-neutral-800 bg-neutral-950 p-4">
            <button
              type="button"
              onClick={() =>
                void applyAllEdits()
              }
              disabled={
                applicableCount === 0 ||
                isApplyingAll ||
                Boolean(applyingKey)
              }
              className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {isApplyingAll
                ? "Saving..."
                : `Apply all · ${applicableCount}`}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-black text-neutral-300 hover:border-neutral-500 hover:text-white"
            >
              Close review
            </button>

            {remainingEdits.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  void copyText(
                    "all",
                    formatHandoff(
                      handoff,
                      remainingEdits,
                    ),
                  )
                }
                className="col-span-2 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-xs font-black text-neutral-400 hover:border-yellow-400 hover:text-yellow-200"
              >
                {copiedLabel === "all"
                  ? "Plan copied"
                  : "Copy remaining plan"}
              </button>
            )}
          </footer>
        </>
      )}
    </aside>
  );
}

export default AIEditorialHandoffPanel;

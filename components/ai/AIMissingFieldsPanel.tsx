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
  AIMissingFieldSuggestion,
  AIMissingFieldsResponse,
  AIMissingFieldsResult,
} from "@/types/aiMissingFields";

type AIMissingFieldsPanelProps = {
  entry: Entry;
  onClose: () => void;
  onApplyEntry: (entry: Entry) => Promise<void>;
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

function applySuggestionToEntry(
  entry: Entry,
  suggestion: AIMissingFieldSuggestion,
): Entry | null {
  const suggestedValue =
    suggestion.suggestedValue.trim();

  if (!suggestedValue) {
    return null;
  }

  if (
    isEntryEditableField(
      suggestion.fieldPath,
    )
  ) {
    return {
      ...entry,
      [suggestion.fieldPath]:
        suggestedValue,
    };
  }

  const meaningMatch =
    suggestion.fieldPath.match(
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

  const meanings =
    entry.meanings.map(
      (meaning, index): Meaning => {
        if (index !== meaningIndex) {
          return meaning;
        }

        return {
          ...meaning,
          [meaningField]:
            suggestedValue,
        };
      },
    );

  return {
    ...entry,
    meanings,
  };
}

function confidenceLabel(
  suggestion: AIMissingFieldSuggestion,
) {
  return `${suggestion.confidence} confidence`;
}

function removeSuggestion(
  result: AIMissingFieldsResult,
  suggestionIds: Set<string>,
): AIMissingFieldsResult {
  const suggestions =
    result.suggestions.filter(
      (suggestion) =>
        !suggestionIds.has(
          suggestion.id,
        ),
    );

  return {
    ...result,
    suggestions,
    missingFieldCount:
      suggestions.length,
    summary:
      suggestions.length === 0
        ? "All generated suggestions have been applied or dismissed."
        : `${suggestions.length} suggestion${
            suggestions.length === 1
              ? ""
              : "s"
          } remaining.`,
  };
}

export function AIMissingFieldsPanel({
  entry,
  onClose,
  onApplyEntry,
}: AIMissingFieldsPanelProps) {
  const [workingEntry, setWorkingEntry] =
    useState<Entry>(entry);

  const [result, setResult] =
    useState<AIMissingFieldsResult | null>(
      null,
    );

  const [modelLabel, setModelLabel] =
    useState("");

  const [error, setError] =
    useState("");

  const [notice, setNotice] =
    useState("");

  const [isLoading, setIsLoading] =
    useState(false);

  const [isCollapsed, setIsCollapsed] =
    useState(false);

  const [
    applyingSuggestionId,
    setApplyingSuggestionId,
  ] = useState("");

  const [
    isApplyingSafeDrafts,
    setIsApplyingSafeDrafts,
  ] = useState(false);

  const [copiedLabel, setCopiedLabel] =
    useState("");

  const [appliedCount, setAppliedCount] =
    useState(0);

  const [deniedCount, setDeniedCount] =
    useState(0);

  useEffect(() => {
    setWorkingEntry(entry);
    setResult(null);
    setModelLabel("");
    setError("");
    setNotice("");
    setIsLoading(false);
    setIsCollapsed(false);
    setApplyingSuggestionId("");
    setIsApplyingSafeDrafts(false);
    setCopiedLabel("");
    setAppliedCount(0);
    setDeniedCount(0);
  }, [entry.id]);

  const safeDrafts = useMemo(() => {
    if (!result) {
      return [];
    }

    return result.suggestions.filter(
      (suggestion) =>
        suggestion.suggestedValue.trim() &&
        !suggestion.requiresVerification &&
        suggestion.confidence !== "low" &&
        applySuggestionToEntry(
          workingEntry,
          suggestion,
        ) !== null,
    );
  }, [result, workingEntry]);

  const isApplying =
    Boolean(applyingSuggestionId) ||
    isApplyingSafeDrafts;

  async function runMissingFieldsScan() {
    if (isLoading || isApplying) {
      return;
    }

    try {
      setIsLoading(true);
      setError("");
      setNotice("");
      setCopiedLabel("");

      const response = await fetch(
        "/api/ai-fill-missing-fields",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            entry: workingEntry,
          }),
        },
      );

      let payload:
        AIMissingFieldsResponse = {};

      try {
        payload =
          (await response.json()) as AIMissingFieldsResponse;
      } catch {
        payload = {};
      }

      if (
        !response.ok ||
        !payload.result
      ) {
        throw new Error(
          payload.error ||
            "The missing-fields scan failed.",
        );
      }

      setResult(payload.result);
      setModelLabel(
        payload.model ?? "",
      );
      setNotice("");
    } catch (scanError) {
      setResult(null);

      setError(
        scanError instanceof Error
          ? scanError.message
          : "The missing-fields scan failed.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function approveSuggestion(
    suggestion: AIMissingFieldSuggestion,
  ) {
    if (isApplying) {
      return;
    }

    const nextEntry =
      applySuggestionToEntry(
        workingEntry,
        suggestion,
      );

    if (!nextEntry) {
      setError(
        `The AI returned an unsupported field path: ${suggestion.fieldPath}`,
      );
      return;
    }

    try {
      setApplyingSuggestionId(
        suggestion.id,
      );
      setError("");
      setNotice("");

      await onApplyEntry(nextEntry);

      setWorkingEntry(nextEntry);
      setAppliedCount(
        (current) => current + 1,
      );

      setResult((currentResult) =>
        currentResult
          ? removeSuggestion(
              currentResult,
              new Set([
                suggestion.id,
              ]),
            )
          : currentResult,
      );

      setNotice(
        `${suggestion.fieldLabel} applied and saved.`,
      );
    } catch (applyError) {
      setError(
        applyError instanceof Error
          ? applyError.message
          : "The suggestion could not be saved.",
      );
    } finally {
      setApplyingSuggestionId("");
    }
  }

  function denySuggestion(
    suggestion: AIMissingFieldSuggestion,
  ) {
    if (isApplying) {
      return;
    }

    setResult((currentResult) =>
      currentResult
        ? removeSuggestion(
            currentResult,
            new Set([
              suggestion.id,
            ]),
          )
        : currentResult,
    );

    setDeniedCount(
      (current) => current + 1,
    );

    setError("");
    setNotice(
      `${suggestion.fieldLabel} dismissed.`,
    );
  }

  async function applySafeDrafts() {
    if (
      !result ||
      safeDrafts.length === 0 ||
      isApplying
    ) {
      return;
    }

    let nextEntry = workingEntry;
    const appliedIds =
      new Set<string>();

    safeDrafts.forEach(
      (suggestion) => {
        const updatedEntry =
          applySuggestionToEntry(
            nextEntry,
            suggestion,
          );

        if (!updatedEntry) {
          return;
        }

        nextEntry = updatedEntry;
        appliedIds.add(
          suggestion.id,
        );
      },
    );

    if (appliedIds.size === 0) {
      return;
    }

    try {
      setIsApplyingSafeDrafts(true);
      setError("");
      setNotice("");

      await onApplyEntry(nextEntry);

      setWorkingEntry(nextEntry);
      setAppliedCount(
        (current) =>
          current + appliedIds.size,
      );

      setResult((currentResult) =>
        currentResult
          ? removeSuggestion(
              currentResult,
              appliedIds,
            )
          : currentResult,
      );

      setNotice(
        `${appliedIds.size} safe draft${
          appliedIds.size === 1
            ? ""
            : "s"
        } applied and saved.`,
      );
    } catch (applyError) {
      setError(
        applyError instanceof Error
          ? applyError.message
          : "The safe drafts could not be saved.",
      );
    } finally {
      setIsApplyingSafeDrafts(false);
    }
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
        setCopiedLabel(
          (current) =>
            current === label
              ? ""
              : current,
        );
      }, 1_800);
    } catch {
      setCopiedLabel("");
    }
  }

  return (
    <aside className="fixed inset-x-3 bottom-24 z-[96] overflow-hidden rounded-3xl border border-violet-400/30 bg-neutral-950 shadow-2xl md:bottom-6 md:left-6 md:right-auto md:w-[520px]">
      <header className="border-b border-neutral-800 bg-violet-400/10 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">
              Alpha 5.17G
            </p>

            <h2 className="mt-1 text-lg font-black text-white">
              AI Fill Missing Fields
            </h2>

            <p className="mt-1 text-xs text-neutral-400">
              {workingEntry.word}
              {modelLabel
                ? ` · ${modelLabel}`
                : ""}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setIsCollapsed(
                  (current) =>
                    !current,
                )
              }
              className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-black text-neutral-300 hover:border-violet-400 hover:text-violet-200"
            >
              {isCollapsed
                ? "Expand"
                : "Minimize"}
            </button>

            <button
              type="button"
              aria-label="Close AI missing fields panel"
              onClick={onClose}
              className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-black text-neutral-300 hover:border-red-400 hover:text-red-200"
            >
              ✕
            </button>
          </div>
        </div>
      </header>

      {!isCollapsed && (
        <>
          <div className="max-h-[64vh] space-y-4 overflow-y-auto p-4">
            <section className="rounded-2xl border border-violet-400/20 bg-violet-400/5 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-200">
                Apply suggestions directly
              </p>

              <p className="mt-2 text-sm leading-6 text-neutral-400">
                AI scans supported empty
                fields only. Approve writes the
                suggestion into the entry and
                saves it. Deny removes the
                suggestion without changing the
                entry.
              </p>

              <button
                type="button"
                onClick={() =>
                  void runMissingFieldsScan()
                }
                disabled={
                  isLoading ||
                  isApplying
                }
                className="mt-4 w-full rounded-xl bg-violet-400 px-4 py-3 text-sm font-black text-black hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading
                  ? "Scanning entry..."
                  : result
                    ? "Scan remaining fields"
                    : "Scan missing fields"}
              </button>
            </section>

            {notice && (
              <section className="rounded-2xl border border-green-400/30 bg-green-400/10 p-4">
                <p className="font-black text-green-100">
                  Saved
                </p>

                <p className="mt-1 text-sm text-green-100/70">
                  {notice}
                </p>
              </section>
            )}

            {error && (
              <section className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4">
                <p className="font-black text-red-100">
                  Action failed
                </p>

                <p className="mt-2 text-sm leading-6 text-red-100/70">
                  {error}
                </p>
              </section>
            )}

            {result && (
              <>
                <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-neutral-950 p-3">
                      <p className="text-lg font-black text-yellow-200">
                        {
                          result.suggestions
                            .length
                        }
                      </p>

                      <p className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-neutral-600">
                        Remaining
                      </p>
                    </div>

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
                        {deniedCount}
                      </p>

                      <p className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-neutral-600">
                        Denied
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-neutral-400">
                    {result.summary}
                  </p>

                  {safeDrafts.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        void applySafeDrafts()
                      }
                      disabled={isApplying}
                      className="mt-4 w-full rounded-xl bg-green-400 px-3 py-3 text-xs font-black text-black hover:bg-green-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isApplyingSafeDrafts
                        ? "Applying safe drafts..."
                        : `Apply safe drafts · ${safeDrafts.length}`}
                    </button>
                  )}
                </section>

                {result.suggestions.length ===
                0 ? (
                  <section className="rounded-2xl border border-green-400/20 bg-green-400/10 p-5 text-center">
                    <p className="font-black text-green-100">
                      Suggestions cleared
                    </p>

                    <p className="mt-2 text-sm text-green-100/70">
                      Every generated suggestion
                      has been applied or denied.
                      Run another scan to confirm
                      what remains.
                    </p>
                  </section>
                ) : (
                  <section>
                    <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">
                      Field suggestions
                    </p>

                    <div className="space-y-3">
                      {result.suggestions.map(
                        (suggestion) => {
                          const copyKey =
                            `suggestion-${suggestion.id}`;

                          const isThisApplying =
                            applyingSuggestionId ===
                            suggestion.id;

                          return (
                            <article
                              key={
                                suggestion.id
                              }
                              className={`rounded-2xl border p-4 ${
                                suggestion.requiresVerification
                                  ? "border-yellow-400/20 bg-yellow-400/5"
                                  : "border-neutral-800 bg-neutral-900"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-black text-white">
                                    {
                                      suggestion.fieldLabel
                                    }
                                  </p>

                                  <p className="mt-1 break-all text-[10px] text-neutral-600">
                                    {
                                      suggestion.fieldPath
                                    }
                                  </p>
                                </div>

                                <span className="rounded-full bg-neutral-800 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-neutral-400">
                                  {confidenceLabel(
                                    suggestion,
                                  )}
                                </span>
                              </div>

                              {suggestion.suggestedValue ? (
                                <div className="mt-3 rounded-xl border border-violet-400/20 bg-violet-400/10 p-3">
                                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-violet-200/60">
                                    AI suggestion
                                  </p>

                                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-violet-50">
                                    {
                                      suggestion.suggestedValue
                                    }
                                  </p>
                                </div>
                              ) : (
                                <div className="mt-3 rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-3">
                                  <p className="text-sm font-black text-yellow-100">
                                    No useful draft generated
                                  </p>

                                  <p className="mt-2 text-xs leading-5 text-yellow-100/70">
                                    Deny this suggestion
                                    or add the value
                                    manually.
                                  </p>
                                </div>
                              )}

                              <p className="mt-3 text-xs leading-5 text-neutral-400">
                                {
                                  suggestion.reason
                                }
                              </p>

                              {suggestion.requiresVerification && (
                                <div className="mt-3 rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-3">
                                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-yellow-300">
                                    Verify before publishing
                                  </p>

                                  <p className="mt-2 text-xs leading-5 text-yellow-100/70">
                                    {
                                      suggestion.verificationNote
                                    }
                                  </p>
                                </div>
                              )}

                              <div className="mt-4 grid grid-cols-3 gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void approveSuggestion(
                                      suggestion,
                                    )
                                  }
                                  disabled={
                                    isApplying ||
                                    !suggestion.suggestedValue.trim()
                                  }
                                  className="rounded-xl bg-green-400 px-2 py-2 text-xs font-black text-black hover:bg-green-300 disabled:cursor-not-allowed disabled:opacity-30"
                                >
                                  {isThisApplying
                                    ? "Saving..."
                                    : "Approve"}
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    denySuggestion(
                                      suggestion,
                                    )
                                  }
                                  disabled={isApplying}
                                  className="rounded-xl bg-red-500/20 px-2 py-2 text-xs font-black text-red-200 hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-30"
                                >
                                  Deny
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    void copyText(
                                      copyKey,
                                      suggestion.suggestedValue,
                                    )
                                  }
                                  disabled={
                                    isApplying ||
                                    !suggestion.suggestedValue
                                  }
                                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-2 py-2 text-xs font-black text-neutral-300 hover:border-violet-400 hover:text-violet-200 disabled:cursor-not-allowed disabled:opacity-30"
                                >
                                  {copiedLabel ===
                                  copyKey
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

                {result.verificationChecklist
                  .length > 0 && (
                  <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">
                      Verification checklist
                    </p>

                    <div className="mt-3 space-y-2">
                      {result.verificationChecklist.map(
                        (
                          checklistItem,
                          index,
                        ) => (
                          <div
                            key={`${checklistItem}-${index}`}
                            className="flex gap-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3"
                          >
                            <span className="text-neutral-600">
                              □
                            </span>

                            <p className="text-xs leading-5 text-neutral-300">
                              {
                                checklistItem
                              }
                            </p>
                          </div>
                        ),
                      )}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>

          <footer className="border-t border-neutral-800 bg-neutral-950 p-4">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-black text-neutral-300 hover:border-neutral-500 hover:text-white"
            >
              Close tool
            </button>
          </footer>
        </>
      )}
    </aside>
  );
}

export default AIMissingFieldsPanel;

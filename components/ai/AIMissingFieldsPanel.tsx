"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type { Entry } from "@/types/entry";

import type {
  AIMissingFieldDecision,
  AIMissingFieldSuggestion,
  AIMissingFieldsResponse,
  AIMissingFieldsResult,
} from "@/types/aiMissingFields";

type AIMissingFieldsPanelProps = {
  entry: Entry;
  onClose: () => void;
};

function createPendingDecisions(
  result: AIMissingFieldsResult,
) {
  return Object.fromEntries(
    result.suggestions.map(
      (suggestion) => [
        suggestion.id,
        "pending" as AIMissingFieldDecision,
      ],
    ),
  );
}

function confidenceLabel(
  suggestion: AIMissingFieldSuggestion,
) {
  return `${suggestion.confidence} confidence`;
}

function formatApprovedPlan(
  result: AIMissingFieldsResult,
  approvedSuggestions:
    AIMissingFieldSuggestion[],
) {
  return [
    `YERRR Studio AI Missing Fields Plan: ${result.entryWord}`,
    `Approved drafts: ${approvedSuggestions.length}`,
    "",
    ...approvedSuggestions.flatMap(
      (suggestion, index) => [
        `${index + 1}. ${suggestion.fieldLabel}`,
        `Field path: ${suggestion.fieldPath}`,
        `Suggested value: ${suggestion.suggestedValue}`,
        `Reason: ${suggestion.reason}`,
        `Confidence: ${suggestion.confidence}`,
        suggestion.requiresVerification
          ? `Verification: ${
              suggestion.verificationNote ||
              "Human verification required."
            }`
          : "Verification: Standard editorial review.",
        "",
      ],
    ),
    "These drafts have not been written to Supabase.",
  ].join("\n");
}

export function AIMissingFieldsPanel({
  entry,
  onClose,
}: AIMissingFieldsPanelProps) {
  const [result, setResult] =
    useState<AIMissingFieldsResult | null>(
      null,
    );

  const [modelLabel, setModelLabel] =
    useState("");

  const [error, setError] =
    useState("");

  const [isLoading, setIsLoading] =
    useState(false);

  const [isCollapsed, setIsCollapsed] =
    useState(false);

  const [copiedLabel, setCopiedLabel] =
    useState("");

  const [decisions, setDecisions] =
    useState<
      Record<
        string,
        AIMissingFieldDecision
      >
    >({});

  useEffect(() => {
    setResult(null);
    setModelLabel("");
    setError("");
    setIsLoading(false);
    setIsCollapsed(false);
    setCopiedLabel("");
    setDecisions({});
  }, [entry.id]);

  const decisionSummary = useMemo(() => {
    if (!result) {
      return {
        pending: 0,
        approved: 0,
        rejected: 0,
      };
    }

    return result.suggestions.reduce(
      (summary, suggestion) => {
        const decision =
          decisions[suggestion.id] ??
          "pending";

        summary[decision] += 1;

        return summary;
      },
      {
        pending: 0,
        approved: 0,
        rejected: 0,
      },
    );
  }, [decisions, result]);

  const approvedSuggestions =
    useMemo(() => {
      if (!result) {
        return [];
      }

      return result.suggestions.filter(
        (suggestion) =>
          decisions[suggestion.id] ===
            "approved" &&
          suggestion.suggestedValue.trim(),
      );
    }, [decisions, result]);

  async function runMissingFieldsScan() {
    if (isLoading) {
      return;
    }

    try {
      setIsLoading(true);
      setError("");
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
            entry,
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
      setModelLabel(payload.model ?? "");
      setDecisions(
        createPendingDecisions(
          payload.result,
        ),
      );
    } catch (scanError) {
      setResult(null);
      setDecisions({});

      setError(
        scanError instanceof Error
          ? scanError.message
          : "The missing-fields scan failed.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function setDecision(
    suggestionId: string,
    decision: AIMissingFieldDecision,
  ) {
    setDecisions(
      (currentDecisions) => ({
        ...currentDecisions,
        [suggestionId]: decision,
      }),
    );
  }

  function approveSafeDrafts() {
    if (!result) {
      return;
    }

    setDecisions(
      (currentDecisions) => {
        const nextDecisions = {
          ...currentDecisions,
        };

        result.suggestions.forEach(
          (suggestion) => {
            const isSafeDraft =
              suggestion.suggestedValue.trim() &&
              !suggestion.requiresVerification &&
              suggestion.confidence !==
                "low";

            if (isSafeDraft) {
              nextDecisions[
                suggestion.id
              ] = "approved";
            }
          },
        );

        return nextDecisions;
      },
    );
  }

  function resetDecisions() {
    if (!result) {
      return;
    }

    setDecisions(
      createPendingDecisions(result),
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
    <aside className="fixed inset-x-3 bottom-24 z-[96] overflow-hidden rounded-3xl border border-violet-400/30 bg-neutral-950 shadow-2xl md:bottom-6 md:left-6 md:right-auto md:w-[500px]">
      <header className="border-b border-neutral-800 bg-violet-400/10 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">
              Alpha 5.6
            </p>

            <h2 className="mt-1 text-lg font-black text-white">
              AI Fill Missing Fields
            </h2>

            <p className="mt-1 text-xs text-neutral-400">
              {entry.word}
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
                  (current) => !current,
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
                Human-controlled drafting
              </p>

              <p className="mt-2 text-sm leading-6 text-neutral-400">
                AI scans only empty fields. It
                cannot overwrite existing text,
                change the Entry Editor, or save
                anything to Supabase.
              </p>

              <button
                type="button"
                onClick={() =>
                  void runMissingFieldsScan()
                }
                disabled={isLoading}
                className="mt-4 w-full rounded-xl bg-violet-400 px-4 py-3 text-sm font-black text-black hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading
                  ? "Scanning entry..."
                  : result
                    ? "Run scan again"
                    : "Scan missing fields"}
              </button>
            </section>

            {error && (
              <section className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4">
                <p className="font-black text-red-100">
                  Scan failed
                </p>

                <p className="mt-2 text-sm leading-6 text-red-100/70">
                  {error}
                </p>
              </section>
            )}

            {result && (
              <>
                <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="rounded-xl bg-neutral-950 p-3">
                      <p className="text-lg font-black text-white">
                        {
                          result.missingFieldCount
                        }
                      </p>

                      <p className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-neutral-600">
                        Missing
                      </p>
                    </div>

                    <div className="rounded-xl bg-neutral-950 p-3">
                      <p className="text-lg font-black text-yellow-200">
                        {
                          decisionSummary.pending
                        }
                      </p>

                      <p className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-neutral-600">
                        Pending
                      </p>
                    </div>

                    <div className="rounded-xl bg-neutral-950 p-3">
                      <p className="text-lg font-black text-green-200">
                        {
                          decisionSummary.approved
                        }
                      </p>

                      <p className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-neutral-600">
                        Approved
                      </p>
                    </div>

                    <div className="rounded-xl bg-neutral-950 p-3">
                      <p className="text-lg font-black text-red-200">
                        {
                          decisionSummary.rejected
                        }
                      </p>

                      <p className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-neutral-600">
                        Rejected
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-neutral-400">
                    {result.summary}
                  </p>

                  {result.suggestions.length >
                    0 && (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={
                          approveSafeDrafts
                        }
                        className="rounded-xl bg-green-400 px-3 py-3 text-xs font-black text-black hover:bg-green-300"
                      >
                        Approve safe drafts
                      </button>

                      <button
                        type="button"
                        onClick={
                          resetDecisions
                        }
                        className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-xs font-black text-neutral-300 hover:border-neutral-500 hover:text-white"
                      >
                        Reset decisions
                      </button>
                    </div>
                  )}
                </section>

                {result.suggestions.length ===
                0 ? (
                  <section className="rounded-2xl border border-green-400/20 bg-green-400/10 p-5 text-center">
                    <p className="font-black text-green-100">
                      No missing fields detected
                    </p>

                    <p className="mt-2 text-sm text-green-100/70">
                      This entry already contains
                      the supported Lexicon V8
                      fields.
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
                          const decision =
                            decisions[
                              suggestion.id
                            ] ?? "pending";

                          const copyKey =
                            `suggestion-${suggestion.id}`;

                          return (
                            <article
                              key={
                                suggestion.id
                              }
                              className={`rounded-2xl border p-4 ${
                                decision ===
                                "approved"
                                  ? "border-green-400/30 bg-green-400/10"
                                  : decision ===
                                      "rejected"
                                    ? "border-red-400/20 bg-red-400/5"
                                    : suggestion.requiresVerification
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

                                <span
                                  className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${
                                    decision ===
                                    "approved"
                                      ? "bg-green-400/20 text-green-200"
                                      : decision ===
                                          "rejected"
                                        ? "bg-red-400/20 text-red-200"
                                        : "bg-neutral-800 text-neutral-400"
                                  }`}
                                >
                                  {decision}
                                </span>
                              </div>

                              <p className="mt-3 text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
                                {confidenceLabel(
                                  suggestion,
                                )}
                              </p>

                              {suggestion.suggestedValue ? (
                                <div className="mt-3 rounded-xl border border-violet-400/20 bg-violet-400/10 p-3">
                                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-violet-200/60">
                                    AI draft
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
                                    No safe draft
                                    generated
                                  </p>

                                  <p className="mt-2 text-xs leading-5 text-yellow-100/70">
                                    This field needs
                                    evidence or direct
                                    editorial input.
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
                                    Verification required
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
                                    setDecision(
                                      suggestion.id,
                                      "approved",
                                    )
                                  }
                                  disabled={
                                    !suggestion.suggestedValue
                                  }
                                  className="rounded-xl bg-green-400 px-2 py-2 text-xs font-black text-black hover:bg-green-300 disabled:cursor-not-allowed disabled:opacity-30"
                                >
                                  Approve
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setDecision(
                                      suggestion.id,
                                      "rejected",
                                    )
                                  }
                                  className="rounded-xl bg-red-500/20 px-2 py-2 text-xs font-black text-red-200 hover:bg-red-500/30"
                                >
                                  Reject
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

          <footer className="grid grid-cols-2 gap-2 border-t border-neutral-800 bg-neutral-950 p-4">
            <button
              type="button"
              disabled={
                !result ||
                approvedSuggestions.length ===
                  0
              }
              onClick={() => {
                if (!result) {
                  return;
                }

                void copyText(
                  "approved-plan",
                  formatApprovedPlan(
                    result,
                    approvedSuggestions,
                  ),
                );
              }}
              className="rounded-xl bg-violet-400 px-4 py-3 text-sm font-black text-black hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {copiedLabel ===
              "approved-plan"
                ? "Plan copied"
                : `Copy approved · ${approvedSuggestions.length}`}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-black text-neutral-300 hover:border-neutral-500 hover:text-white"
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
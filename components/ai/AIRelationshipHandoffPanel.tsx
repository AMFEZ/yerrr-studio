"use client";

import { useState } from "react";

import type {
  AIRelationshipHandoff,
} from "@/types/aiRelationshipHandoff";

import type {
  AIRelationshipDirection,
  AIRelationshipType,
} from "@/types/aiRelationships";

type AIRelationshipHandoffPanelProps = {
  handoff: AIRelationshipHandoff;
  onClose: () => void;
};

function relationshipTypeLabel(
  type: AIRelationshipType,
) {
  return type
    .split("_")
    .map((word) => {
      return (
        word.charAt(0).toUpperCase() +
        word.slice(1)
      );
    })
    .join(" ");
}

function directionLabel(
  direction: AIRelationshipDirection,
) {
  if (
    direction === "source_to_target"
  ) {
    return "Source → target";
  }

  if (
    direction === "target_to_source"
  ) {
    return "Target → source";
  }

  return "Bidirectional";
}

function relationshipExpression(
  sourceWord: string,
  targetWord: string,
  direction: AIRelationshipDirection,
) {
  if (
    direction === "source_to_target"
  ) {
    return `${sourceWord} → ${targetWord}`;
  }

  if (
    direction === "target_to_source"
  ) {
    return `${targetWord} → ${sourceWord}`;
  }

  return `${sourceWord} ↔ ${targetWord}`;
}

function formatHandoffPlan(
  handoff: AIRelationshipHandoff,
) {
  return [
    "YERRR Studio AI Relationship Editor Handoff",
    `Source entry: ${handoff.sourceEntryWord}`,
    `Approved relationships: ${handoff.approvedRelationships.length}`,
    `Created: ${handoff.createdAt}`,
    "",

    ...handoff.approvedRelationships.flatMap(
      (relationship, index) => [
        `${index + 1}. ${relationshipExpression(
          handoff.sourceEntryWord,
          relationship.targetWord,
          relationship.direction,
        )}`,

        `Target entry ID: ${relationship.targetEntryId}`,

        `Relationship type: ${relationshipTypeLabel(
          relationship.relationshipType,
        )}`,

        `Direction: ${directionLabel(
          relationship.direction,
        )}`,

        `Confidence: ${relationship.confidence}`,

        `Relationship score: ${relationship.relationshipScore}/100`,

        `Reasoning: ${relationship.reasoning}`,

        `Shared signals: ${
          relationship.sharedSignals.join(
            "; ",
          ) || "None listed"
        }`,

        `Differences: ${
          relationship.differences.join(
            "; ",
          ) || "None listed"
        }`,

        `Verification: ${
          relationship.verificationNote ||
          "Human verification required."
        }`,

        "",
      ],
    ),

    "No Knowledge Graph relationships were created automatically.",
  ].join("\n");
}

export function AIRelationshipHandoffPanel({
  handoff,
  onClose,
}: AIRelationshipHandoffPanelProps) {
  const [
    isMinimized,
    setIsMinimized,
  ] = useState(false);

  const [
    copiedLabel,
    setCopiedLabel,
  ] = useState("");

  async function copyText(
    label: string,
    text: string,
  ) {
    try {
      await navigator.clipboard.writeText(
        text,
      );

      setCopiedLabel(label);

      window.setTimeout(() => {
        setCopiedLabel(
          (currentLabel) =>
            currentLabel === label
              ? ""
              : currentLabel,
        );
      }, 1_800);
    } catch {
      setCopiedLabel("");
    }
  }

  return (
    <aside className="fixed inset-x-3 bottom-24 z-[96] overflow-hidden rounded-3xl border border-emerald-400/30 bg-neutral-950 shadow-2xl md:bottom-6 md:left-6 md:right-auto md:w-[500px]">
      <header className="border-b border-neutral-800 bg-emerald-400/10 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">
              Alpha 5.10
            </p>

            <h2 className="mt-1 text-lg font-black text-white">
              AI Relationship Handoff
            </h2>

            <p className="mt-1 truncate text-xs text-neutral-400">
              {handoff.sourceEntryWord}
              {" · "}
              {
                handoff
                  .approvedRelationships
                  .length
              }{" "}
              approved
            </p>
          </div>

          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() =>
                setIsMinimized(
                  (currentValue) =>
                    !currentValue,
                )
              }
              className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-black text-neutral-300 hover:border-emerald-400 hover:text-emerald-200"
            >
              {isMinimized
                ? "Expand"
                : "Minimize"}
            </button>

            <button
              type="button"
              aria-label="Close AI relationship handoff"
              onClick={onClose}
              className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-black text-neutral-300 hover:border-red-400 hover:text-red-200"
            >
              ✕
            </button>
          </div>
        </div>
      </header>

      {!isMinimized && (
        <>
          <div className="max-h-[62vh] space-y-4 overflow-y-auto p-4">
            <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-200">
                Manual graph editing
              </p>

              <p className="mt-2 text-sm leading-6 text-emerald-100/70">
                Use these approved suggestions
                as a reference while creating
                relationships in Cloud
                Relationships.
              </p>

              <p className="mt-2 text-sm font-black text-emerald-100">
                Nothing has been saved
                automatically.
              </p>
            </section>

            <section>
              <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">
                Approved relationships
              </p>

              <div className="space-y-3">
                {handoff.approvedRelationships.map(
                  (
                    relationship,
                    index,
                  ) => {
                    const copyKey =
                      `relationship-${relationship.id}`;

                    return (
                      <article
                        key={`${relationship.id}-${index}`}
                        className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-600">
                              Relationship{" "}
                              {index + 1}
                            </p>

                            <p className="mt-2 break-words text-lg font-black text-white">
                              {relationshipExpression(
                                handoff.sourceEntryWord,
                                relationship.targetWord,
                                relationship.direction,
                              )}
                            </p>
                          </div>

                          <div className="shrink-0 text-right">
                            <p className="text-2xl font-black text-emerald-200">
                              {
                                relationship.relationshipScore
                              }
                            </p>

                            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-neutral-600">
                              Score
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-[10px] font-black text-emerald-100">
                            {relationshipTypeLabel(
                              relationship.relationshipType,
                            )}
                          </span>

                          <span className="rounded-full bg-neutral-800 px-3 py-1 text-[10px] font-black text-neutral-300">
                            {directionLabel(
                              relationship.direction,
                            )}
                          </span>

                          <span className="rounded-full bg-neutral-800 px-3 py-1 text-[10px] font-black text-neutral-400">
                            {
                              relationship.confidence
                            }{" "}
                            confidence
                          </span>
                        </div>

                        <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-neutral-600">
                            Reasoning
                          </p>

                          <p className="mt-2 text-xs leading-5 text-neutral-300">
                            {
                              relationship.reasoning
                            }
                          </p>
                        </div>

                        {relationship.sharedSignals
                          .length > 0 && (
                          <div className="mt-3">
                            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-green-300">
                              Shared signals
                            </p>

                            <div className="mt-2 space-y-1">
                              {relationship.sharedSignals.map(
                                (
                                  signal,
                                  signalIndex,
                                ) => (
                                  <p
                                    key={`${signal}-${signalIndex}`}
                                    className="text-xs leading-5 text-neutral-400"
                                  >
                                    • {signal}
                                  </p>
                                ),
                              )}
                            </div>
                          </div>
                        )}

                        {relationship.differences
                          .length > 0 && (
                          <div className="mt-3">
                            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-cyan-300">
                              Differences
                            </p>

                            <div className="mt-2 space-y-1">
                              {relationship.differences.map(
                                (
                                  difference,
                                  differenceIndex,
                                ) => (
                                  <p
                                    key={`${difference}-${differenceIndex}`}
                                    className="text-xs leading-5 text-neutral-400"
                                  >
                                    •{" "}
                                    {
                                      difference
                                    }
                                  </p>
                                ),
                              )}
                            </div>
                          </div>
                        )}

                        <div className="mt-3 rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-3">
                          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-yellow-200">
                            Verify before creating
                          </p>

                          <p className="mt-2 text-xs leading-5 text-yellow-100/70">
                            {
                              relationship.verificationNote
                            }
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            void copyText(
                              copyKey,
                              [
                                relationshipExpression(
                                  handoff.sourceEntryWord,
                                  relationship.targetWord,
                                  relationship.direction,
                                ),

                                `Type: ${relationshipTypeLabel(
                                  relationship.relationshipType,
                                )}`,

                                `Direction: ${directionLabel(
                                  relationship.direction,
                                )}`,

                                `Reasoning: ${relationship.reasoning}`,

                                `Verification: ${relationship.verificationNote}`,
                              ].join("\n"),
                            )
                          }
                          className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-black text-neutral-300 hover:border-emerald-400 hover:text-emerald-200"
                        >
                          {copiedLabel === copyKey
                            ? "Relationship copied"
                            : "Copy relationship"}
                        </button>
                      </article>
                    );
                  },
                )}
              </div>
            </section>

            {handoff.verificationChecklist
              .length > 0 && (
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
                void copyText(
                  "full-plan",
                  formatHandoffPlan(
                    handoff,
                  ),
                )
              }
              className="rounded-xl bg-emerald-300 px-4 py-3 text-sm font-black text-black hover:bg-emerald-200"
            >
              {copiedLabel === "full-plan"
                ? "Plan copied"
                : "Copy full plan"}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-black text-neutral-300 hover:border-neutral-500 hover:text-white"
            >
              Close handoff
            </button>
          </footer>
        </>
      )}
    </aside>
  );
}

export default AIRelationshipHandoffPanel;
"use client";

import { useState } from "react";

import type {
  AIApprovedEdit,
  AIEditorialHandoff,
} from "@/types/aiEditorial";

type AIEditorialHandoffPanelProps = {
  handoff: AIEditorialHandoff;
  onClose: () => void;
};

function titleCaseToken(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
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
) {
  return [
    `YERRR Studio AI Editorial Handoff: ${handoff.entryWord}`,
    `Quality score: ${handoff.qualityScore}/100`,
    `Publish readiness: ${readinessLabel(
      handoff.publishReadiness,
    )}`,
    `Approved changes: ${handoff.approvedEdits.length}`,
    "",
    "Approved edits",
    ...handoff.approvedEdits.flatMap(
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
    "",
    "Verify every change before saving.",
  ].join("\n");
}

export function AIEditorialHandoffPanel({
  handoff,
  onClose,
}: AIEditorialHandoffPanelProps) {
  const [isCollapsed, setIsCollapsed] =
    useState(false);
  const [copiedLabel, setCopiedLabel] =
    useState("");

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
    <aside className="fixed inset-x-3 bottom-24 z-[95] overflow-hidden rounded-3xl border border-yellow-400/30 bg-neutral-950 shadow-2xl md:bottom-6 md:left-auto md:right-6 md:w-[460px]">
      <header className="border-b border-neutral-800 bg-yellow-400/10 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-300">
              AI editorial handoff
            </p>

            <h2 className="mt-1 text-lg font-black text-white">
              {handoff.entryWord}
            </h2>

            <p className="mt-1 text-xs text-neutral-400">
              {handoff.approvedEdits.length} approved
              change
              {handoff.approvedEdits.length === 1
                ? ""
                : "s"}{" "}
              · {handoff.qualityScore}/100
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
              {isCollapsed ? "Expand" : "Minimize"}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close AI editorial handoff"
              className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-black text-neutral-300 hover:border-red-400 hover:text-red-200"
            >
              ✕
            </button>
          </div>
        </div>
      </header>

      {!isCollapsed && (
        <>
          <div className="max-h-[58vh] space-y-4 overflow-y-auto p-4">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">
                Editor status
              </p>

              <p className="mt-2 text-sm font-black text-white">
                {readinessLabel(
                  handoff.publishReadiness,
                )}
              </p>

              <p className="mt-2 text-xs leading-5 text-neutral-500">
                This panel is a reference only. The
                Entry Editor remains the source of
                truth.
              </p>
            </div>

            <section>
              <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">
                Approved changes
              </p>

              <div className="space-y-3">
                {handoff.approvedEdits.map(
                  (edit, index) => {
                    const copyKey =
                      `edit-${index}`;

                    return (
                      <article
                        key={`${edit.field}-${index}`}
                        className="rounded-2xl border border-green-400/20 bg-green-400/5 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black text-green-100">
                              {titleCaseToken(
                                edit.field,
                              )}
                            </p>

                            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.15em] text-green-200/60">
                              {edit.confidence} confidence
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              void copyText(
                                copyKey,
                                edit.suggestedValue,
                              )
                            }
                            disabled={
                              !edit.suggestedValue
                            }
                            className="rounded-xl border border-green-400/20 bg-green-400/10 px-3 py-2 text-xs font-black text-green-100 hover:bg-green-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {copiedLabel ===
                            copyKey
                              ? "Copied"
                              : "Copy"}
                          </button>
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
                      </article>
                    );
                  },
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">
                Verification checklist
              </p>

              {handoff.verificationChecklist
                .length > 0 ? (
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
              ) : (
                <p className="mt-2 text-xs text-neutral-500">
                  No additional checks listed.
                </p>
              )}
            </section>
          </div>

          <footer className="grid grid-cols-2 gap-2 border-t border-neutral-800 bg-neutral-950 p-4">
            <button
              type="button"
              onClick={() =>
                void copyText(
                  "all",
                  formatHandoff(handoff),
                )
              }
              className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-black hover:bg-yellow-300"
            >
              {copiedLabel === "all"
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

export default AIEditorialHandoffPanel;
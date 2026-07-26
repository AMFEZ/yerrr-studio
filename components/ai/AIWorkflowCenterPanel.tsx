"use client";

import { useMemo } from "react";

import type { Entry } from "@/types/entry";
import {
  EDITORIAL_RULESET_VERSION,
  getRequiredEditorialGapCount,
} from "@/lib/editorialCompletionRules";
import {
  isEntryInReviewQueue,
  isEntryVerifiedOrPublishedReady,
} from "@/lib/editorialStatusRules";

type AIWorkflowCenterPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  onOpenAIAssistant: () => void;
  onOpenMissingFields: () => void;
  onSelectEntry: (entry: Entry) => void;
  onOpenBatchTriage: () => void;
  onOpenSemanticDuplicates: () => void;
  onOpenRelationshipSuggestions: () => void;
  entries: Entry[];
  selectedEntry: Entry | null;
  duplicateCandidateCount: number;
  isOnline: boolean;
};

type WorkflowCardProps = {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  detail: string;
  icon: string;
  accentClass: string;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
  countLabel?: string;
};

function WorkflowCard({
  eyebrow,
  title,
  description,
  actionLabel,
  detail,
  icon,
  accentClass,
  onClick,
  disabled = false,
  disabledReason,
  countLabel,
}: WorkflowCardProps) {
  return (
    <article className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg ${accentClass}`}
        >
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">
              {eyebrow}
            </p>

            {countLabel && (
              <span className="rounded-full border border-neutral-700 bg-neutral-950 px-2 py-1 text-[10px] font-black text-neutral-300">
                {countLabel}
              </span>
            )}
          </div>

          <h3 className="mt-1 text-base font-black text-white">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-neutral-400">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-600">
          What the approved action does
        </p>
        <p className="mt-2 text-xs leading-5 text-neutral-300">{detail}</p>
      </div>

      {disabled && disabledReason && (
        <p className="mt-3 text-xs leading-5 text-yellow-200/80">
          {disabledReason}
        </p>
      )}

      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="mt-4 w-full rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
      >
        {actionLabel}
      </button>
    </article>
  );
}

export function AIWorkflowCenterPanel({
  isOpen,
  onClose,
  onOpenAIAssistant,
  onOpenMissingFields,
  onSelectEntry,
  onOpenBatchTriage,
  onOpenSemanticDuplicates,
  onOpenRelationshipSuggestions,
  entries,
  selectedEntry,
  duplicateCandidateCount,
  isOnline,
}: AIWorkflowCenterPanelProps) {
  const metrics = useMemo(() => {
    const incompleteEntries = entries.filter(
      (entry) => getRequiredEditorialGapCount(entry) > 0,
    ).length;

    const reviewEntries = entries.filter(isEntryInReviewQueue).length;

    return {
      incompleteEntries,
      reviewEntries,
      verifiedEntries: entries.filter(isEntryVerifiedOrPublishedReady).length,
    };
  }, [entries]);

  const sortedEntries = useMemo(() => {
    return [...entries].sort((first, second) =>
      first.word.localeCompare(second.word, undefined, {
        sensitivity: "base",
      }),
    );
  }, [entries]);

  if (!isOpen) return null;

  const selectedGapCount = selectedEntry
    ? getRequiredEditorialGapCount(selectedEntry)
    : 0;

  return (
    <div className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close AI Workflow Center"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside className="absolute bottom-0 right-0 max-h-[94vh] w-full overflow-y-auto rounded-t-3xl border-t border-neutral-800 bg-neutral-950 shadow-2xl lg:bottom-auto lg:top-0 lg:h-full lg:max-h-none lg:max-w-3xl lg:rounded-none lg:rounded-l-3xl lg:border-l lg:border-t-0">
        <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/95 p-5 backdrop-blur lg:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-yellow-400">
                Alpha 5.19A
              </p>
              <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">
                AI Workflow Center
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
                Every workflow below now reads the same versioned editorial rules. AI
                can propose, but it cannot publish, permanently delete, or
                silently overwrite your lexicon.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-black text-neutral-300 hover:border-neutral-500 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-green-400/20 bg-green-400/10 p-3">
              <p className="text-xl font-black text-green-100">5/5</p>
              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-green-100/60">
                Action-enabled
              </p>
            </div>

            <div className="rounded-2xl border border-violet-400/20 bg-violet-400/10 p-3">
              <p className="text-xl font-black text-violet-100">
                {metrics.incompleteEntries}
              </p>
              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-violet-100/60">
                Incomplete
              </p>
            </div>

            <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/10 p-3">
              <p className="text-xl font-black text-fuchsia-100">
                {metrics.reviewEntries}
              </p>
              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-fuchsia-100/60">
                Review queue
              </p>
            </div>

            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-3">
              <p className="text-xl font-black text-cyan-100">
                {duplicateCandidateCount}
              </p>
              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100/60">
                Duplicate flags
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="ai-workflow-entry-selector"
                  className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500"
                >
                  Select entry
                </label>

                <select
                  id="ai-workflow-entry-selector"
                  value={selectedEntry?.id ?? ""}
                  onChange={(event) => {
                    const nextEntry = entries.find(
                      (entry) => entry.id === event.target.value,
                    );

                    if (nextEntry) {
                      onSelectEntry(nextEntry);
                    }
                  }}
                  className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-black text-white outline-none transition focus:border-yellow-400"
                >
                  <option value="">Choose an entry...</option>
                  {sortedEntries.map((entry) => {
                    const gapCount = getRequiredEditorialGapCount(entry);

                    return (
                      <option key={entry.id} value={entry.id}>
                        {entry.word} · {gapCount} gap{gapCount === 1 ? "" : "s"}
                      </option>
                    );
                  })}
                </select>

                <p className="mt-2 text-xs leading-5 text-neutral-500">
                  Choose an entry here to enable Fill Missing Fields without
                  leaving the AI Workflow Center.
                </p>
              </div>

              <div className="shrink-0 text-left sm:text-right">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                  Connection
                </p>
                <p
                  className={`mt-1 font-black ${
                    isOnline ? "text-green-300" : "text-yellow-300"
                  }`}
                >
                  {isOnline ? "Online" : "Offline"}
                </p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-neutral-600">
                  Rules {EDITORIAL_RULESET_VERSION}
                </p>

                {selectedEntry && (
                  <p className="mt-1 text-xs font-bold text-violet-200">
                    {selectedGapCount} required gap
                    {selectedGapCount === 1 ? "" : "s"}
                  </p>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-4 p-5 lg:grid-cols-2 lg:p-6">
          <WorkflowCard
            eyebrow="Entry content"
            title="Fill Missing Fields"
            description={
              selectedEntry
                ? `Generate real suggestions for ${selectedEntry.word}. ${selectedGapCount} required field${selectedGapCount === 1 ? " is" : "s are"} currently missing.`
                : "Open an entry first, then generate suggestions for its empty required fields."
            }
            actionLabel={
              selectedEntry
                ? `Fill missing fields for ${selectedEntry.word}`
                : "Open an entry first"
            }
            detail="Approve writes the suggested value into the real field and saves it through the offline-capable entry workflow. Dismiss removes the suggestion."
            icon="✨"
            accentClass="bg-violet-400/15 text-violet-200"
            onClick={onOpenMissingFields}
            disabled={!selectedEntry}
            disabledReason="Select an entry above to enable this workflow."
            countLabel={`${metrics.incompleteEntries} entries`}
          />

          <WorkflowCard
            eyebrow="Editorial review"
            title="AI Entry Review"
            description="Review one entry for supported editorial improvements and apply only the changes you approve."
            actionLabel="Open AI Entry Review"
            detail="Approved field edits open in the apply panel. Apply saves the real field; Dismiss changes nothing."
            icon="🧠"
            accentClass="bg-blue-400/15 text-blue-200"
            onClick={onOpenAIAssistant}
            countLabel="Applies fields"
          />

          <WorkflowCard
            eyebrow="Workflow status"
            title="AI Batch Triage"
            description="Assess multiple entries and recommend Draft, Needs Review, or Verified based on the shared completion rules."
            actionLabel="Open Batch Triage"
            detail="Apply Status Change updates entry and meaning editorial statuses. Generate Field Suggestions sends a specific entry to the fill tool."
            icon="📋"
            accentClass="bg-fuchsia-400/15 text-fuchsia-200"
            onClick={onOpenBatchTriage}
            countLabel={`${metrics.reviewEntries} review`}
          />

          <WorkflowCard
            eyebrow="Duplicate resolution"
            title="AI Semantic Duplicates"
            description="Compare two entries, keep them separate, or merge unique content into a selected primary record."
            actionLabel="Open Duplicate Review"
            detail="A confirmed merge preserves the primary entry, copies unique meanings and spellings, and moves the duplicate to Trash—not permanent deletion."
            icon="🧬"
            accentClass="bg-cyan-400/15 text-cyan-200"
            onClick={onOpenSemanticDuplicates}
            disabled={!isOnline}
            disabledReason="Duplicate merging is online-only so the primary update and Trash action stay coordinated."
            countLabel={`${duplicateCandidateCount} flagged`}
          />

          <div className="lg:col-span-2">
            <WorkflowCard
              eyebrow="Knowledge graph"
              title="AI Relationship Suggestions"
              description="Discover useful entry-to-entry connections and add approved relationships directly to the Supabase Knowledge Graph."
              actionLabel="Open Relationship Suggestions"
              detail="Apply creates the relationship, blocks self-links and duplicates, then refreshes Graph Explorer and Graph Health. Dismiss writes nothing."
              icon="🕸️"
              accentClass="bg-emerald-400/15 text-emerald-200"
              onClick={onOpenRelationshipSuggestions}
              disabled={!isOnline}
              disabledReason="Graph writes are online-only to prevent duplicate or partially synchronized relationships."
              countLabel="Applies graph links"
            />
          </div>
        </div>

        <footer className="border-t border-neutral-800 bg-neutral-950 p-5 lg:p-6">
          <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
            <p className="font-black text-yellow-100">AI audit complete</p>
            <p className="mt-2 text-sm leading-6 text-yellow-100/70">
              The next Studio phase is the rapid content-completion sprint:
              next-incomplete navigation, session progress, skip-and-return,
              and faster approved-field workflows across the remaining entries.
            </p>
          </div>
        </footer>
      </aside>
    </div>
  );
}

export default AIWorkflowCenterPanel;

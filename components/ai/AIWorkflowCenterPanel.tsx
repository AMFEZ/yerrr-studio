"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type WorkflowCategory =
  | "all"
  | "entry"
  | "collection"
  | "graph";

type EntrySummary = {
  id: string | number;
  word?: string;
};

type AIWorkflowCenterPanelProps = {
  isOpen?: boolean;
  onClose: () => void;

  onOpenAIAssistant?: () => void;
  onOpenAssistant?: () => void;
  onLaunchAIAssistant?: () => void;

  onOpenMissingFields?: () => void;
  onOpenAIMissingFields?: () => void;
  onOpenFillMissingFields?: () => void;
  onLaunchMissingFields?: () => void;

  onOpenBatchTriage?: () => void;
  onOpenAIBatchTriage?: () => void;
  onLaunchBatchTriage?: () => void;

  onOpenSemanticDuplicates?: () => void;
  onOpenAISemanticDuplicates?: () => void;
  onOpenDuplicateReview?: () => void;
  onLaunchSemanticDuplicates?: () => void;

  onOpenRelationshipSuggestions?: () => void;
  onOpenAIRelationshipSuggestions?: () => void;
  onLaunchRelationshipSuggestions?: () => void;

  entries?: readonly EntrySummary[];
  entryCount?: number;

  selectedEntry?: {
    word?: string;
  } | null;

  selectedEntryWord?: string | null;
  duplicateCandidateCount?: number;
  activeTaskLabel?: string | null;

  /*
   * Allows the panel to remain compatible with harmless additional
   * Alpha 5.11 props without forcing page.tsx changes.
   */
  [key: string]: unknown;
};

type WorkflowTool = {
  key: string;
  title: string;
  description: string;
  icon: string;
  category: Exclude<WorkflowCategory, "all">;
  categoryLabel: string;
  accentClasses: string;
  action?: () => void;
  context: string;
};

const CATEGORY_OPTIONS: Array<{
  value: WorkflowCategory;
  label: string;
}> = [
  {
    value: "all",
    label: "All Tools",
  },
  {
    value: "entry",
    label: "Entry",
  },
  {
    value: "collection",
    label: "Collection",
  },
  {
    value: "graph",
    label: "Graph",
  },
];

export function AIWorkflowCenterPanel({
  isOpen = true,
  onClose,

  onOpenAIAssistant,
  onOpenAssistant,
  onLaunchAIAssistant,

  onOpenMissingFields,
  onOpenAIMissingFields,
  onOpenFillMissingFields,
  onLaunchMissingFields,

  onOpenBatchTriage,
  onOpenAIBatchTriage,
  onLaunchBatchTriage,

  onOpenSemanticDuplicates,
  onOpenAISemanticDuplicates,
  onOpenDuplicateReview,
  onLaunchSemanticDuplicates,

  onOpenRelationshipSuggestions,
  onOpenAIRelationshipSuggestions,
  onLaunchRelationshipSuggestions,

  entries,
  entryCount,
  selectedEntry,
  selectedEntryWord,
  duplicateCandidateCount = 0,
  activeTaskLabel,
}: AIWorkflowCenterPanelProps) {
  const [activeCategory, setActiveCategory] =
    useState<WorkflowCategory>("all");

  const [launchingToolKey, setLaunchingToolKey] =
    useState("");

  const closeButtonRef =
    useRef<HTMLButtonElement | null>(null);

  const assistantAction =
    onOpenAIAssistant ??
    onOpenAssistant ??
    onLaunchAIAssistant;

  const missingFieldsAction =
    onOpenMissingFields ??
    onOpenAIMissingFields ??
    onOpenFillMissingFields ??
    onLaunchMissingFields;

  const batchTriageAction =
    onOpenBatchTriage ??
    onOpenAIBatchTriage ??
    onLaunchBatchTriage;

  const semanticDuplicatesAction =
    onOpenSemanticDuplicates ??
    onOpenAISemanticDuplicates ??
    onOpenDuplicateReview ??
    onLaunchSemanticDuplicates;

  const relationshipSuggestionsAction =
    onOpenRelationshipSuggestions ??
    onOpenAIRelationshipSuggestions ??
    onLaunchRelationshipSuggestions;

  const resolvedEntryCount =
    typeof entryCount === "number"
      ? entryCount
      : entries?.length ?? 0;

  const resolvedSelectedEntryWord =
    selectedEntryWord?.trim() ||
    selectedEntry?.word?.trim() ||
    "";

  const workflowTools = useMemo<WorkflowTool[]>(
    () => [
      {
        key: "assistant",
        title: "AI Assistant",
        description:
          "Chat with the lexicon, compare slang terms, and run structured editorial reviews.",
        icon: "✨",
        category: "entry",
        categoryLabel: "Entry intelligence",
        accentClasses:
          "border-yellow-400/25 bg-yellow-400/10 text-yellow-100",
        action: assistantAction,
        context: resolvedSelectedEntryWord
          ? `Current entry: ${resolvedSelectedEntryWord}`
          : "Works across the full lexicon",
      },
      {
        key: "missing-fields",
        title: "Fill Missing Fields",
        description:
          "Inspect an entry and generate suggestions for incomplete editorial fields.",
        icon: "🧩",
        category: "entry",
        categoryLabel: "Entry completion",
        accentClasses:
          "border-violet-400/25 bg-violet-400/10 text-violet-100",
        action: missingFieldsAction,
        context: resolvedSelectedEntryWord
          ? `Ready for ${resolvedSelectedEntryWord}`
          : "Select an entry inside the workflow",
      },
      {
        key: "batch-triage",
        title: "Batch Triage",
        description:
          "Review a group of entries and identify which records need editorial attention first.",
        icon: "📚",
        category: "collection",
        categoryLabel: "Collection review",
        accentClasses:
          "border-orange-400/25 bg-orange-400/10 text-orange-100",
        action: batchTriageAction,
        context:
          resolvedEntryCount > 0
            ? `${resolvedEntryCount} active entries available`
            : "Waiting for lexicon entries",
      },
      {
        key: "semantic-duplicates",
        title: "Semantic Duplicate Review",
        description:
          "Compare similar entries and meanings without merging, deleting, or rewriting anything automatically.",
        icon: "🧠",
        category: "collection",
        categoryLabel: "Duplicate analysis",
        accentClasses:
          "border-cyan-400/25 bg-cyan-400/10 text-cyan-100",
        action: semanticDuplicatesAction,
        context:
          duplicateCandidateCount > 0
            ? `${duplicateCandidateCount} spelling-based candidates`
            : "Runs an independent semantic comparison",
      },
      {
        key: "relationship-suggestions",
        title: "Relationship Suggestions",
        description:
          "Suggest Knowledge Graph connections between entries, concepts, meanings, and related slang.",
        icon: "🕸️",
        category: "graph",
        categoryLabel: "Knowledge Graph",
        accentClasses:
          "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
        action: relationshipSuggestionsAction,
        context:
          resolvedEntryCount > 0
            ? `Analyze relationships across ${resolvedEntryCount} entries`
            : "Waiting for graph context",
      },
    ],
    [
      assistantAction,
      batchTriageAction,
      duplicateCandidateCount,
      missingFieldsAction,
      relationshipSuggestionsAction,
      resolvedEntryCount,
      resolvedSelectedEntryWord,
      semanticDuplicatesAction,
    ],
  );

  const visibleTools = useMemo(() => {
    if (activeCategory === "all") {
      return workflowTools;
    }

    return workflowTools.filter(
      (tool) => tool.category === activeCategory,
    );
  }, [activeCategory, workflowTools]);

  const connectedToolCount = useMemo(() => {
    return workflowTools.filter(
      (tool) => typeof tool.action === "function",
    ).length;
  }, [workflowTools]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const focusFrame =
      window.requestAnimationFrame(() => {
        closeButtonRef.current?.focus();
      });

    function handleKeyDown(
      event: globalThis.KeyboardEvent,
    ) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      window.cancelAnimationFrame(focusFrame);

      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );

      document.body.style.overflow =
        previousOverflow;
    };
  }, [isOpen, onClose]);

  function launchTool(tool: WorkflowTool) {
    if (
      !tool.action ||
      launchingToolKey
    ) {
      return;
    }

    setLaunchingToolKey(tool.key);

    /*
     * Close the Workflow Center first. The requested panel opens
     * on the following animation frame, preventing two large AI
     * overlays from remaining open at the same time.
     */
    window.requestAnimationFrame(() => {
      onClose();

      window.requestAnimationFrame(() => {
        tool.action?.();
      });
    });
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close AI Workflow Center"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-workflow-center-title"
        className="absolute bottom-0 right-0 flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-neutral-800 bg-neutral-950 shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-h-none md:max-w-5xl md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0"
      >
        <header className="shrink-0 border-b border-neutral-800 bg-neutral-950/95 p-5 backdrop-blur sm:p-6">
          <div className="flex items-start justify-between gap-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-400">
                  Alpha 5.12
                </p>

                <span className="rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-yellow-200">
                  Suggestion only
                </span>
              </div>

              <h2
                id="ai-workflow-center-title"
                className="mt-3 text-2xl font-black text-white sm:text-3xl"
              >
                AI Workflow Center
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
                Launch YERRR Studio&apos;s editorial,
                completion, duplicate, and Knowledge
                Graph tools from one protected workspace.
              </p>
            </div>

            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-black text-neutral-300 transition hover:border-neutral-700 hover:text-white"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <section className="rounded-3xl border border-green-400/20 bg-green-400/10 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-green-400/20 bg-green-400/10">
                🛡️
              </div>

              <div>
                <p className="font-black text-green-100">
                  Manual approval remains required
                </p>

                <p className="mt-1 text-sm leading-6 text-green-100/70">
                  Opening or running an AI workflow does
                  not automatically update entries,
                  meanings, concepts, relationships, or
                  editorial statuses in Supabase.
                </p>
              </div>
            </div>
          </section>

          {activeTaskLabel && (
            <section className="mt-4 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-yellow-300">
                Active task
              </p>

              <p className="mt-2 font-bold text-yellow-50">
                {activeTaskLabel}
              </p>
            </section>
          )}

          <section className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
                AI tools
              </p>

              <p className="mt-2 text-2xl font-black text-white">
                {connectedToolCount}/{workflowTools.length}
              </p>

              <p className="mt-1 text-xs text-neutral-500">
                Connected launchers
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
                Lexicon
              </p>

              <p className="mt-2 text-2xl font-black text-white">
                {resolvedEntryCount}
              </p>

              <p className="mt-1 text-xs text-neutral-500">
                Active entries
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
                Entry context
              </p>

              <p className="mt-2 truncate text-lg font-black text-white">
                {resolvedSelectedEntryWord || "None selected"}
              </p>

              <p className="mt-1 text-xs text-neutral-500">
                Current editorial focus
              </p>
            </div>
          </section>

          <nav
            aria-label="AI workflow categories"
            className="mt-6 flex gap-2 overflow-x-auto pb-1"
          >
            {CATEGORY_OPTIONS.map((option) => {
              const isActive =
                option.value === activeCategory;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setActiveCategory(option.value)
                  }
                  className={`shrink-0 rounded-xl px-4 py-3 text-sm font-black transition ${
                    isActive
                      ? "bg-yellow-400 text-black"
                      : "border border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-700 hover:text-white"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </nav>

          <section className="mt-5 grid gap-4 lg:grid-cols-2">
            {visibleTools.map((tool) => {
              const isConnected =
                typeof tool.action === "function";

              const isLaunching =
                launchingToolKey === tool.key;

              return (
                <article
                  key={tool.key}
                  className="flex flex-col rounded-3xl border border-neutral-800 bg-neutral-900 p-5 transition hover:border-neutral-700"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-xl ${tool.accentClasses}`}
                    >
                      {tool.icon}
                    </div>

                    <span
                      className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
                        isConnected
                          ? "border-green-400/20 bg-green-400/10 text-green-200"
                          : "border-neutral-700 bg-neutral-950 text-neutral-500"
                      }`}
                    >
                      {isConnected
                        ? "Ready"
                        : "Not connected"}
                    </span>
                  </div>

                  <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
                    {tool.categoryLabel}
                  </p>

                  <h3 className="mt-2 text-xl font-black text-white">
                    {tool.title}
                  </h3>

                  <p className="mt-2 flex-1 text-sm leading-6 text-neutral-400">
                    {tool.description}
                  </p>

                  <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
                    <p className="text-xs font-bold text-neutral-500">
                      {tool.context}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => launchTool(tool)}
                    disabled={
                      !isConnected ||
                      Boolean(launchingToolKey)
                    }
                    className="mt-4 rounded-2xl bg-yellow-400 px-4 py-3 text-sm font-black text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isLaunching
                      ? "Opening workflow..."
                      : `Open ${tool.title}`}
                  </button>
                </article>
              );
            })}
          </section>

          {visibleTools.length === 0 && (
            <div className="mt-5 rounded-3xl border border-dashed border-neutral-700 p-8 text-center">
              <p className="font-black text-white">
                No workflows in this category
              </p>

              <p className="mt-2 text-sm text-neutral-500">
                Choose another category to view the
                available AI tools.
              </p>
            </div>
          )}

          <section className="mt-6 rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
              Alpha 5.12 workflow rules
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="font-black text-white">
                  1. Generate
                </p>

                <p className="mt-2 text-sm leading-6 text-neutral-500">
                  AI analyzes existing lexicon or graph
                  context.
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="font-black text-white">
                  2. Review
                </p>

                <p className="mt-2 text-sm leading-6 text-neutral-500">
                  You inspect, approve, reject, or revise
                  each suggestion.
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="font-black text-white">
                  3. Apply manually
                </p>

                <p className="mt-2 text-sm leading-6 text-neutral-500">
                  Database changes require a separate
                  intentional action.
                </p>
              </div>
            </div>
          </section>
        </div>

        <footer className="shrink-0 border-t border-neutral-800 bg-neutral-950/95 p-4 backdrop-blur sm:px-6">
          <div className="flex flex-col gap-3 text-xs text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
            <p>
              YERRR Studio Alpha 5.12 · AI Workflow
              Center Polish
            </p>

            <p>
              Press Escape to close
            </p>
          </div>
        </footer>
      </aside>
    </div>
  );
}

export default AIWorkflowCenterPanel;
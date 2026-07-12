"use client";

import { useMemo } from "react";

type EntryLike = Record<string, any>;

type SidebarProps = {
  entries?: EntryLike[];

  activeView?: string;
  setActiveView?: (view: string) => void;

  activeFilter?: string;
  setActiveFilter?: (filter: string) => void;

  currentFilter?: string;
  setCurrentFilter?: (filter: string) => void;

  activeQueue?: string;
  setActiveQueue?: (queue: string) => void;

  selectedView?: string;
  setSelectedView?: (view: string) => void;

  onNavigate?: (view: string) => void;
  onFilterChange?: (filter: string) => void;
  onQueueChange?: (queue: string) => void;

  onCreateEntry?: () => void;
  onNewEntry?: () => void;
  openCreateModal?: () => void;

  onOpenAdvancedSearch?: () => void;
  onOpenActivity?: () => void;
  onOpenBackup?: () => void;
  onOpenGraphStats?: () => void;
  onOpenGraphExplorer?: () => void;
  onOpenGraphMigration?: () => void;
  onOpenCloudConceptEditor?: () => void;
  onOpenCloudRelationshipEditor?: () => void;

  userEmail?: string | null;
  onLogout?: () => void;

  className?: string;
} & Record<string, any>;

type NavItem = {
  key: string;
  label: string;
  description: string;
  icon: string;
  count?: number;
  disabled?: boolean;
  soon?: boolean;
  action?: () => void;
};

const VERSION_LABEL = "Alpha 4.2";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function getEntryWord(entry: EntryLike) {
  return normalize(
    entry.word ??
      entry.term ??
      entry.entry ??
      entry.title ??
      entry.name ??
      entry.phrase
  );
}

function getEntryStatus(entry: EntryLike) {
  return normalize(
    entry.status ??
      entry.workflow_status ??
      entry.workflowStatus ??
      entry.publish_status ??
      entry.publishStatus ??
      entry.state
  );
}

function isTrashed(entry: EntryLike) {
  return Boolean(
    entry.deleted_at ??
      entry.deletedAt ??
      entry.trashed_at ??
      entry.trashedAt ??
      entry.is_deleted ??
      entry.isDeleted ??
      entry.in_trash ??
      entry.inTrash
  );
}

function isPublished(entry: EntryLike) {
  const status = getEntryStatus(entry);

  return (
    !isTrashed(entry) &&
    (status === "published" ||
      status === "publish" ||
      status === "live" ||
      status === "verified" ||
      entry.is_published === true ||
      entry.isPublished === true ||
      Boolean(entry.published_at ?? entry.publishedAt))
  );
}

function isDraft(entry: EntryLike) {
  const status = getEntryStatus(entry);

  return (
    !isTrashed(entry) &&
    (status === "draft" ||
      status === "saved_draft" ||
      status === "unpublished" ||
      entry.is_draft === true ||
      entry.isDraft === true)
  );
}

function needsReview(entry: EntryLike) {
  const status = getEntryStatus(entry);

  return (
    !isTrashed(entry) &&
    (status === "review" ||
      status === "needs_review" ||
      status === "review_needed" ||
      entry.needs_review === true ||
      entry.needsReview === true ||
      entry.review_needed === true ||
      entry.reviewNeeded === true)
  );
}

function countDuplicates(entries: EntryLike[]) {
  const wordCounts = new Map<string, number>();

  entries.forEach((entry) => {
    if (isTrashed(entry)) return;

    const word = getEntryWord(entry);

    if (!word) return;

    wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
  });

  let duplicates = 0;

  wordCounts.forEach((count) => {
    if (count > 1) {
      duplicates += count;
    }
  });

  return duplicates;
}

export function Sidebar(props: SidebarProps) {
  const entries = props.entries ?? [];

  const activeKey = normalize(
    props.activeView ??
      props.activeFilter ??
      props.currentFilter ??
      props.activeQueue ??
      props.selectedView ??
      props.view ??
      props.filter ??
      "all"
  );

  const counts = useMemo(() => {
    const total = entries.filter((entry) => !isTrashed(entry)).length;
    const review = entries.filter(needsReview).length;
    const draft = entries.filter(isDraft).length;
    const published = entries.filter(isPublished).length;
    const trash = entries.filter(isTrashed).length;
    const duplicates = countDuplicates(entries);

    return {
      total,
      review,
      draft,
      published,
      trash,
      duplicates,
    };
  }, [entries]);

  const mainItems: NavItem[] = [
    {
      key: "all",
      label: "All Entries",
      description: "Browse the full slang lexicon.",
      icon: "📚",
      count: counts.total,
    },
    {
      key: "review",
      label: "Review Queue",
      description: "Entries that still need approval.",
      icon: "🟡",
      count: counts.review,
    },
    {
      key: "draft",
      label: "Draft Queue",
      description: "Unpublished or unfinished entries.",
      icon: "📝",
      count: counts.draft,
    },
    {
      key: "published",
      label: "Publish Queue",
      description: "Verified entries ready to publish.",
      icon: "🚀",
      count: counts.published,
    },
  ];

  const toolItems: NavItem[] = [
    {
      key: "advanced-search",
      label: "Advanced Search",
      description: "Search every field with filters and ranked results.",
      icon: "🔎",
      action: props.onOpenAdvancedSearch,
    },
    {
      key: "duplicates",
      label: "Duplicates",
      description: "Find repeated words or phrases.",
      icon: "👯",
      count: counts.duplicates,
    },
    {
      key: "trash",
      label: "Trash",
      description: "Deleted entries you can restore.",
      icon: "🗑️",
      count: counts.trash,
    },
    {
      key: "activity",
      label: "Activity Log",
      description: "View recent local CMS changes.",
      icon: "🧾",
      action: props.onOpenActivity,
    },
    {
      key: "backup",
      label: "Import / Export",
      description: "Export backups and preview imports.",
      icon: "💾",
      action: props.onOpenBackup,
    },
  ];

  const graphItems: NavItem[] = [
    {
      key: "concepts",
      label: "Concepts",
      description: "Create concepts and assign entries in Supabase.",
      icon: "🧠",
      action: props.onOpenCloudConceptEditor,
    },
    {
      key: "relationships",
      label: "Relationships",
      description: "Create entry relationships in Supabase.",
      icon: "🔗",
      action: props.onOpenCloudRelationshipEditor,
    },
    {
      key: "graph-health",
      label: "Graph Health",
      description: "Measure Supabase coverage and graph gaps.",
      icon: "📊",
      action: props.onOpenGraphStats,
    },
    {
      key: "graph-explorer",
      label: "Graph Explorer",
      description: "Explore the permanent Supabase graph.",
      icon: "🧭",
      action: props.onOpenGraphExplorer,
    },
    {
      key: "graph-migration",
      label: "Migration Backup",
      description: "Review or repeat the local-to-cloud migration.",
      icon: "🧳",
      action: props.onOpenGraphMigration,
    },
  ];

  function navigate(key: string) {
    const handlers = [
      props.setActiveView,
      props.setActiveFilter,
      props.setCurrentFilter,
      props.setActiveQueue,
      props.setSelectedView,
      props.onNavigate,
      props.onFilterChange,
      props.onQueueChange,
    ];

    handlers.forEach((handler) => {
      if (typeof handler === "function") {
        handler(key);
      }
    });
  }

  function createEntry() {
    const handler =
      props.onCreateEntry ?? props.onNewEntry ?? props.openCreateModal;

    if (typeof handler === "function") {
      handler();
    }
  }

  function renderNavItem(item: NavItem) {
    const isActive =
      activeKey === item.key ||
      (item.key === "all" &&
        ["dashboard", "home", "entries", "lexicon"].includes(activeKey)) ||
      (item.key === "review" &&
        ["needs_review", "review_needed"].includes(activeKey)) ||
      (item.key === "draft" && ["drafts"].includes(activeKey)) ||
      (item.key === "published" &&
        ["publish", "verified"].includes(activeKey));

    return (
      <button
        key={item.key}
        type="button"
        disabled={item.disabled}
        onClick={() => {
          if (item.disabled) return;

          if (item.action) {
            item.action();
            return;
          }

          navigate(item.key);
        }}
        className={cx(
          "group w-full rounded-2xl border px-3 py-3 text-left transition",
          isActive
            ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
            : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50",
          item.disabled && "cursor-not-allowed opacity-60 hover:bg-white"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={cx(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base",
                isActive ? "bg-white/10" : "bg-zinc-100"
              )}
            >
              {item.icon}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold">{item.label}</p>

                {item.soon && (
                  <span
                    className={cx(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                      isActive
                        ? "bg-white/15 text-white"
                        : "bg-zinc-100 text-zinc-500"
                    )}
                  >
                    Soon
                  </span>
                )}
              </div>

              <p
                className={cx(
                  "mt-0.5 line-clamp-2 text-xs leading-5",
                  isActive ? "text-zinc-300" : "text-zinc-500"
                )}
              >
                {item.description}
              </p>
            </div>
          </div>

          {typeof item.count === "number" && (
            <span
              className={cx(
                "shrink-0 rounded-full px-2 py-1 text-xs font-bold",
                isActive
                  ? "bg-white text-zinc-900"
                  : "bg-zinc-100 text-zinc-700"
              )}
            >
              {item.count}
            </span>
          )}
        </div>
      </button>
    );
  }

  return (
    <>
      <div className="md:hidden">
        <div className="mb-4 rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-zinc-400">
                YERRR Studio
              </p>

              <h2 className="text-lg font-black text-zinc-950">
                Lexicon CMS
              </h2>
            </div>

            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600">
              {VERSION_LABEL}
            </span>
          </div>

          <select
            value={
              [
                "all",
                "review",
                "draft",
                "published",
                "duplicates",
                "trash",
              ].includes(activeKey)
                ? activeKey
                : "all"
            }
            onChange={(event) => navigate(event.target.value)}
            className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-400"
          >
            <option value="all">All Entries</option>
            <option value="review">Review Queue</option>
            <option value="draft">Draft Queue</option>
            <option value="published">Publish Queue</option>
            <option value="duplicates">Duplicates</option>
            <option value="trash">Trash</option>
          </select>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {(props.onCreateEntry ||
              props.onNewEntry ||
              props.openCreateModal) && (
              <button
                type="button"
                onClick={createEntry}
                className="rounded-2xl bg-zinc-950 px-3 py-3 text-xs font-bold text-white transition hover:bg-zinc-800"
              >
                + Entry
              </button>
            )}

            {props.onOpenAdvancedSearch && (
              <button
                type="button"
                onClick={props.onOpenAdvancedSearch}
                className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-xs font-bold text-zinc-800 transition hover:bg-zinc-50"
              >
                🔎 Search
              </button>
            )}

            {props.onOpenActivity && (
              <button
                type="button"
                onClick={props.onOpenActivity}
                className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-xs font-bold text-zinc-800 transition hover:bg-zinc-50"
              >
                Activity
              </button>
            )}

            {props.onOpenBackup && (
              <button
                type="button"
                onClick={props.onOpenBackup}
                className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-xs font-bold text-zinc-800 transition hover:bg-zinc-50"
              >
                Backup
              </button>
            )}

            {props.onOpenCloudConceptEditor && (
              <button
                type="button"
                onClick={props.onOpenCloudConceptEditor}
                className="col-span-2 rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-xs font-bold text-zinc-800 transition hover:bg-zinc-50"
              >
                🧠 Concepts
              </button>
            )}

            {props.onOpenCloudRelationshipEditor && (
              <button
                type="button"
                onClick={props.onOpenCloudRelationshipEditor}
                className="col-span-2 rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-xs font-bold text-zinc-800 transition hover:bg-zinc-50"
              >
                🔗 Relationships
              </button>
            )}

            {props.onOpenGraphStats && (
              <button
                type="button"
                onClick={props.onOpenGraphStats}
                className="col-span-2 rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-xs font-bold text-zinc-800 transition hover:bg-zinc-50"
              >
                📊 Graph Health
              </button>
            )}

            {props.onOpenGraphExplorer && (
              <button
                type="button"
                onClick={props.onOpenGraphExplorer}
                className="col-span-2 rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-xs font-bold text-zinc-800 transition hover:bg-zinc-50"
              >
                🧭 Graph Explorer
              </button>
            )}

            {props.onOpenGraphMigration && (
              <button
                type="button"
                onClick={props.onOpenGraphMigration}
                className="col-span-2 rounded-2xl border border-zinc-200 bg-zinc-100 px-3 py-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-200"
              >
                🧳 Migration Backup
              </button>
            )}
          </div>
        </div>
      </div>

      <aside
        className={cx(
          "hidden md:block md:w-80 md:shrink-0",
          props.className
        )}
      >
        <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto rounded-3xl border border-zinc-200 bg-zinc-50/80 p-4 shadow-sm backdrop-blur">
          <div className="mb-5 rounded-3xl bg-zinc-950 p-5 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-zinc-400">
              YERRR Studio
            </p>

            <h1 className="mt-2 text-2xl font-black tracking-tight">
              Lexicon CMS
            </h1>

            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Build, review, publish, and organize the NYC slang database.
            </p>

            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-zinc-200">
                {VERSION_LABEL}
              </span>

              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-zinc-950">
                {counts.total} entries
              </span>
            </div>
          </div>

          {(props.onCreateEntry ||
            props.onNewEntry ||
            props.openCreateModal) && (
            <button
              type="button"
              onClick={createEntry}
              className="mb-4 w-full rounded-2xl bg-zinc-950 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-zinc-800"
            >
              + Create New Entry
            </button>
          )}

          <div className="space-y-6">
            <section>
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
                  Entries
                </h2>
              </div>

              <div className="space-y-2">
                {mainItems.map(renderNavItem)}
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
                  Tools
                </h2>
              </div>

              <div className="space-y-2">
                {toolItems.map(renderNavItem)}
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
                  Knowledge Graph
                </h2>
              </div>

              <div className="space-y-2">
                {graphItems.map(renderNavItem)}
              </div>
            </section>
          </div>

          <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
              Roadmap
            </p>

            <div className="mt-3 space-y-3">
              <div>
                <div className="flex items-center justify-between text-sm font-bold text-zinc-900">
                  <span>Phase 3 Knowledge Graph</span>
                  <span>Complete</span>
                </div>

                <div className="mt-2 h-2 rounded-full bg-zinc-100">
                  <div className="h-2 w-full rounded-full bg-zinc-950" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-sm font-bold text-zinc-900">
                  <span>Phase 4 Search</span>
                  <span>Started</span>
                </div>

                <div className="mt-2 h-2 rounded-full bg-zinc-100">
                  <div className="h-2 w-1/5 rounded-full bg-zinc-950" />
                </div>
              </div>

              <div className="rounded-2xl bg-zinc-50 p-3">
                <p className="text-sm font-bold text-zinc-900">
                  Current: Advanced Search
                </p>

                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Search fields, filters, matching modes, ranking, and
                  discovery tools.
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                <p className="text-sm font-bold text-zinc-900">
  Current: Supabase Search Connection
</p>

<p className="mt-1 text-xs leading-5 text-zinc-500">
  Ranked database search with local fallback and editorial
  filters.
</p>
              </div>
            </div>
          </div>

          {(props.userEmail || props.onLogout) && (
            <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-4">
              {props.userEmail && (
                <div className="mb-3">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">
                    Signed in
                  </p>

                  <p className="mt-1 truncate text-sm font-semibold text-zinc-800">
                    {props.userEmail}
                  </p>
                </div>
              )}

              {props.onLogout && (
                <button
                  type="button"
                  onClick={props.onLogout}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-bold text-zinc-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                >
                  Logout
                </button>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
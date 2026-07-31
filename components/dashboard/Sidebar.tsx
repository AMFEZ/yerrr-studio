"use client";

import { useMemo } from "react";
import { STUDIO_VERSION } from "@/lib/studioVersion";

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
  onOpenAIAssistant?: () => void;
  onOpenActivity?: () => void;
  onOpenBackup?: () => void;
  onOpenSettings?: () => void;
  onOpenGraphStats?: () => void;
  onOpenGraphExplorer?: () => void;
  onOpenGraphMigration?: () => void;
  onOpenCloudConceptEditor?: () => void;
  onOpenCloudRelationshipEditor?: () => void;

  userEmail?: string | null;
  onLogout?: () => void;

  reviewCount?: number;
  draftCount?: number;
  publishQueueCount?: number;

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

const VERSION_LABEL = STUDIO_VERSION;

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
    const review =
      typeof props.reviewCount === "number"
        ? props.reviewCount
        : entries.filter(needsReview).length;

    const draft =
      typeof props.draftCount === "number"
        ? props.draftCount
        : entries.filter(isDraft).length;

    const published =
      typeof props.publishQueueCount === "number"
        ? props.publishQueueCount
        : entries.filter(isPublished).length;
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
  }, [
    entries,
    props.draftCount,
    props.publishQueueCount,
    props.reviewCount,
  ]);

  const mainItems: NavItem[] = [
  {
    key: "all",
    label: "All Entries",
    description:
      "Browse the full slang lexicon.",
    icon: "📚",
    count: counts.total,
  },
  {
    key: "draft",
    label: "Draft Queue",
    description:
      "Unfinished entries at the beginning of the editorial workflow.",
    icon: "📝",
    count: counts.draft,
  },
  {
    key: "review",
    label: "Review Queue",
    description:
      "Completed drafts waiting for editorial review and approval.",
    icon: "🟡",
    count: counts.review,
  },
  {
    key: "published",
    label: "Publish Queue",
    description:
      "Verified entries ready for final publishing.",
    icon: "🚀",
    count: counts.published,
  },
];

  const toolItems: NavItem[] = [
    {
      key: "ai-assistant",
      label: "AI Assistant",
      description: "Ask grounded questions and review lexicon content.",
      icon: "✨",
      action: props.onOpenAIAssistant,
    },
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
      key: "settings",
      label: "Settings",
      description: "Account, activity, backups, and offline sync.",
      icon: "⚙️",
      action: props.onOpenSettings,
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
      <div className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-950/95 p-3 backdrop-blur lg:hidden">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-yellow-400">
                YERRR Studio
              </p>
              <p className="truncate text-sm font-black text-white">
                Lexicon CMS
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">

              {props.onOpenSettings && (
                <button
                  type="button"
                  onClick={props.onOpenSettings}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-neutral-700 bg-neutral-900 text-lg text-white transition hover:border-yellow-400"
                  aria-label="Open Studio Settings"
                >
                  ⚙️
                </button>
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <select
              value={
                [
                  "all",
                  "draft",
                  "review",
                  "published",
                  "duplicates",
                  "trash",
                ].includes(activeKey)
                  ? activeKey
                  : "all"
              }
              onChange={(event) => navigate(event.target.value)}
              className="min-w-0 rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-3 text-sm font-black text-white outline-none focus:border-yellow-400"
            >
              <option value="all">All Entries · {counts.total}</option>
              <option value="draft">Draft Queue · {counts.draft}</option>
              <option value="review">Review Queue · {counts.review}</option>
              <option value="published">Publish Queue · {counts.published}</option>
              <option value="duplicates">Duplicates · {counts.duplicates}</option>
              <option value="trash">Trash · {counts.trash}</option>
            </select>

            {props.onOpenAdvancedSearch && (
              <button
                type="button"
                onClick={props.onOpenAdvancedSearch}
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-700 bg-neutral-900 text-lg text-white transition hover:border-yellow-400"
                aria-label="Open Advanced Search"
              >
                🔎
              </button>
            )}
          </div>
        </div>
      </div>

      <aside
        className={cx(
          "hidden lg:block lg:w-80 lg:shrink-0",
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

              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-zinc-950">
                {counts.total} entries
              </span>
            </div>
          </div>

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
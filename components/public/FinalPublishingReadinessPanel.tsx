"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import type { Entry } from "@/types/entry";
import { createClient } from "@/lib/supabase/client";
import {
  PUBLISHING_READINESS_RULESET_VERSION,
  analyzePublishingReadiness,
  buildEmptyGraphIntegritySnapshot,
  buildGraphIntegritySnapshot,
  summarizePublishingReadiness,
  type GraphIntegritySnapshot,
  type PublicEntrySettingsLike,
  type PublishingReadinessIssue,
  type PublishingReadinessRow,
  type PublishingReadinessState,
} from "@/lib/publishingReadinessRules";
import {
  buildMediaReadinessSnapshot,
  MEDIA_READINESS_RULESET_VERSION,
  type EntryMediaAssetsByEntryId,
} from "@/lib/mediaReadinessRules";

const CONCEPT_TABLE_CANDIDATES = ["concepts", "cloud_concepts"] as const;
const RELATIONSHIP_TABLE_CANDIDATES = [
  "entry_relationships",
  "relationships",
  "graph_relationships",
] as const;

type ReadinessFilter =
  | "all"
  | "ready"
  | "blocked"
  | "needs-settings"
  | "live"
  | "warnings";

type FinalPublishingReadinessPanelProps = {
  isOpen: boolean;
  entries: Entry[];
  settingsByEntryId: Record<string, PublicEntrySettingsLike | undefined>;
  isSettingsLoading?: boolean;
  settingsError?: string | null;
  mediaAssetsByEntryId: EntryMediaAssetsByEntryId;
  isMediaLoading?: boolean;
  mediaError?: string | null;
  onClose: () => void;
  onOpenEntry: (entry: Entry) => void;
  onOpenPublishingControls: () => void;
  onOpenStatusAudit: () => void;
  onOpenMediaManager: (entry: Entry) => void;
  onRefreshSettings?: () => void | Promise<void>;
  onRefreshMedia?: () => void | Promise<void>;
};

function stateLabel(state: PublishingReadinessState) {
  if (state === "ready") return "Ready to publish";
  if (state === "live") return "Live";
  if (state === "blocked") return "Blocked";
  if (state === "needs-settings") return "Choose public settings";
  if (state === "archived") return "Archived";
  return "Private / in progress";
}

function stateClasses(state: PublishingReadinessState) {
  if (state === "ready") {
    return "border-emerald-300/35 bg-emerald-300/10 text-emerald-100";
  }
  if (state === "live") {
    return "border-cyan-300/35 bg-cyan-300/10 text-cyan-100";
  }
  if (state === "blocked") {
    return "border-red-400/35 bg-red-400/10 text-red-100";
  }
  if (state === "needs-settings") {
    return "border-violet-300/35 bg-violet-300/10 text-violet-100";
  }
  return "border-neutral-700 bg-neutral-900 text-neutral-300";
}

function issueClasses(issue: PublishingReadinessIssue) {
  return issue.severity === "blocker"
    ? "border-red-400/25 bg-red-400/5 text-red-100"
    : "border-amber-300/25 bg-amber-300/5 text-amber-100";
}

function formatVisibility(value: "public" | "private") {
  return value === "public" ? "Public" : "Private";
}

async function readFirstAvailableTable(
  tableCandidates: readonly string[],
): Promise<{
  tableName: string | null;
  rows: Array<Record<string, unknown>>;
  notice: string | null;
}> {
  const supabase = createClient();
  let lastMessage = "";

  for (const tableName of tableCandidates) {
    const { data, error } = await (supabase as any)
      .from(tableName)
      .select("*")
      .limit(5000);

    if (!error) {
      return {
        tableName,
        rows: Array.isArray(data)
          ? (data as Array<Record<string, unknown>>)
          : [],
        notice: null,
      };
    }

    lastMessage = error.message;
  }

  return {
    tableName: null,
    rows: [],
    notice: lastMessage || "No compatible table was available.",
  };
}

export function FinalPublishingReadinessPanel({
  isOpen,
  entries,
  settingsByEntryId,
  isSettingsLoading = false,
  settingsError = null,
  mediaAssetsByEntryId,
  isMediaLoading = false,
  mediaError = null,
  onClose,
  onOpenEntry,
  onOpenPublishingControls,
  onOpenStatusAudit,
  onOpenMediaManager,
  onRefreshSettings,
  onRefreshMedia,
}: FinalPublishingReadinessPanelProps) {
  const [filter, setFilter] = useState<ReadinessFilter>("blocked");
  const [search, setSearch] = useState("");
  const [graph, setGraph] = useState<GraphIntegritySnapshot>(() =>
    buildEmptyGraphIntegritySnapshot(),
  );
  const [graphRevision, setGraphRevision] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    let isCancelled = false;

    async function loadGraphIntegrity() {
      setGraph((current) => ({ ...current, isLoading: true, notices: [] }));

      const [conceptResult, relationshipResult] = await Promise.all([
        readFirstAvailableTable(CONCEPT_TABLE_CANDIDATES),
        readFirstAvailableTable(RELATIONSHIP_TABLE_CANDIDATES),
      ]);

      if (isCancelled) return;

      const notices: string[] = [];

      if (!conceptResult.tableName) {
        notices.push(
          `Concept validation was skipped: ${conceptResult.notice ?? "concept table unavailable"}`,
        );
      } else if (conceptResult.rows.length === 0) {
        notices.push(
          `${conceptResult.tableName} exists but contains no concept records.`,
        );
      }

      if (!relationshipResult.tableName) {
        notices.push(
          `Relationship validation was skipped: ${relationshipResult.notice ?? "relationship table unavailable"}`,
        );
      }

      setGraph(
        buildGraphIntegritySnapshot(
          entries,
          conceptResult.rows,
          relationshipResult.rows,
          {
            conceptsChecked: Boolean(conceptResult.tableName),
            relationshipsChecked: Boolean(relationshipResult.tableName),
            notices,
          },
        ),
      );
    }

    void loadGraphIntegrity();

    return () => {
      isCancelled = true;
    };
  }, [entries, graphRevision, isOpen]);

  const mediaSnapshot = useMemo(
    () =>
      buildMediaReadinessSnapshot({
        assetsByEntryId: mediaAssetsByEntryId,
        isLoading: isMediaLoading,
        error: mediaError,
      }),
    [isMediaLoading, mediaAssetsByEntryId, mediaError],
  );

  const rows = useMemo(
    () =>
      analyzePublishingReadiness(
        entries,
        settingsByEntryId,
        graph,
        mediaSnapshot,
      ),
    [entries, graph, mediaSnapshot, settingsByEntryId],
  );

  const summary = useMemo(() => summarizePublishingReadiness(rows), [rows]);

  const visibleRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return rows
      .filter((row) => {
        if (row.state === "archived") return false;
        if (filter === "ready" && row.state !== "ready") return false;
        if (filter === "blocked" && row.state !== "blocked") return false;
        if (
          filter === "needs-settings" &&
          row.state !== "needs-settings"
        ) {
          return false;
        }
        if (filter === "live" && row.state !== "live") return false;
        if (filter === "warnings" && row.warnings.length === 0) return false;

        if (!normalizedSearch) return true;

        const issueText = [...row.blockers, ...row.warnings]
          .map((item) => `${item.label} ${item.detail}`)
          .join(" ")
          .toLowerCase();

        return (
          row.entry.word.toLowerCase().includes(normalizedSearch) ||
          row.entry.slug.toLowerCase().includes(normalizedSearch) ||
          row.entry.status.toLowerCase().includes(normalizedSearch) ||
          issueText.includes(normalizedSearch)
        );
      })
      .sort((left, right) => {
        const stateOrder: Record<PublishingReadinessState, number> = {
          blocked: 0,
          "needs-settings": 1,
          ready: 2,
          live: 3,
          private: 4,
          archived: 5,
        };

        const stateDifference = stateOrder[left.state] - stateOrder[right.state];
        if (stateDifference !== 0) return stateDifference;

        const issueDifference =
          right.blockers.length + right.warnings.length -
          (left.blockers.length + left.warnings.length);
        if (issueDifference !== 0) return issueDifference;

        return left.entry.word.localeCompare(right.entry.word);
      });
  }, [filter, rows, search]);

  if (!isOpen) return null;

  const refreshAll = async () => {
    await Promise.all([
      onRefreshSettings?.(),
      onRefreshMedia?.(),
    ]);
    setGraphRevision((current) => current + 1);
  };

  return (
    <div className="fixed inset-0 z-[95] overflow-y-auto bg-black/90 p-3 backdrop-blur-sm sm:p-6">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-3xl border border-neutral-700 bg-neutral-950 shadow-2xl">
        <header className="border-b border-neutral-800 p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-violet-300">
                Launch gate · Ruleset {PUBLISHING_READINESS_RULESET_VERSION}
              </p>
              <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">
                Final Publishing Readiness
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
                Validate editorial completion, human verification, public settings,
                route uniqueness, media accessibility, concepts, and Knowledge Graph relationships before an
                entry reaches the public YERRR app. This screen never publishes or edits
                content automatically.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void refreshAll()}
                disabled={graph.isLoading || isSettingsLoading || isMediaLoading}
                className="rounded-xl border border-neutral-700 px-4 py-3 text-sm font-black text-neutral-200 transition hover:border-violet-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {graph.isLoading || isSettingsLoading || isMediaLoading
                  ? "Refreshing checks..."
                  : "Refresh checks"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-neutral-700 px-4 py-3 text-sm font-black text-neutral-200 transition hover:border-white hover:text-white"
              >
                Close
              </button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <SummaryCard
              label="Ready"
              value={summary.ready}
              detail="Verified, public, no blockers"
            />
            <SummaryCard
              label="Blocked"
              value={summary.blocked}
              detail={`${summary.blockerCount} launch blockers`}
            />
            <SummaryCard
              label="Needs settings"
              value={summary.needsSettings}
              detail="Editorially ready but private"
            />
            <SummaryCard
              label="Live"
              value={summary.live}
              detail="Published and public"
            />
            <SummaryCard
              label="Warnings"
              value={summary.warningCount}
              detail="Review before launch"
            />
          </div>
        </header>

        <div className="p-5 sm:p-7">
          {(settingsError || mediaError || graph.notices.length > 0) && (
            <div className="mb-5 space-y-2">
              {settingsError && (
                <NoticeBox>
                  Public settings could not be fully loaded: {settingsError}
                </NoticeBox>
              )}
              {mediaError && (
                <NoticeBox>
                  Media assets could not be fully loaded: {mediaError}
                </NoticeBox>
              )}
              {graph.notices.map((notice) => (
                <NoticeBox key={notice}>{notice}</NoticeBox>
              ))}
            </div>
          )}

          <div className="grid gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 md:grid-cols-2 xl:grid-cols-4">
            <IntegrityCheck
              label="Public settings"
              status={
                isSettingsLoading
                  ? "Checking"
                  : settingsError
                    ? "Needs attention"
                    : "Checked"
              }
              detail="Visibility, featured state, display order, title, and summary"
            />
            <IntegrityCheck
              label={`Media · ${MEDIA_READINESS_RULESET_VERSION}`}
              status={
                isMediaLoading
                  ? "Checking"
                  : mediaError
                    ? "Needs attention"
                    : "Checked"
              }
              detail={`${rows.filter((row) => row.media.hasImage).length} images · ${rows.filter((row) => row.media.hasAudio).length} audio recordings`}
            />
            <IntegrityCheck
              label="Concept references"
              status={
                graph.isLoading
                  ? "Checking"
                  : graph.conceptsChecked
                    ? "Checked"
                    : "Unavailable"
              }
              detail={`${Object.values(graph.missingConceptsByEntryId).reduce((total, values) => total + values.length, 0)} unresolved references`}
            />
            <IntegrityCheck
              label="Relationships"
              status={
                graph.isLoading
                  ? "Checking"
                  : graph.relationshipsChecked
                    ? "Checked"
                    : "Unavailable"
              }
              detail={`${graph.totalBrokenRelationships} broken relationship${graph.totalBrokenRelationships === 1 ? "" : "s"}`}
            />
          </div>

          <div className="mt-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "All active"],
                  ["blocked", `Blocked · ${summary.blocked}`],
                  ["needs-settings", `Needs settings · ${summary.needsSettings}`],
                  ["ready", `Ready · ${summary.ready}`],
                  ["live", `Live · ${summary.live}`],
                  ["warnings", `Warnings · ${summary.warningCount}`],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`rounded-xl px-4 py-2 text-sm font-black transition ${
                    filter === value
                      ? "bg-white text-black"
                      : "border border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={search}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setSearch(event.target.value)
                }
                placeholder="Search entries or launch issues..."
                className="min-w-0 rounded-xl border border-neutral-700 bg-black px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-violet-300 sm:min-w-72"
              />
              <button
                type="button"
                onClick={onOpenStatusAudit}
                className="rounded-xl border border-sky-300/30 bg-sky-300/10 px-4 py-3 text-sm font-black text-sky-100 transition hover:border-sky-300"
              >
                Open Status Audit
              </button>
              <button
                type="button"
                onClick={onOpenPublishingControls}
                className="rounded-xl bg-violet-300 px-4 py-3 text-sm font-black text-black transition hover:bg-violet-200"
              >
                Open Publishing Settings
              </button>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {visibleRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-700 p-10 text-center text-neutral-500">
                No entries match this launch-gate filter.
              </div>
            ) : (
              visibleRows.map((row) => (
                <ReadinessCard
                  key={row.entry.id}
                  row={row}
                  onOpenEntry={() => onOpenEntry(row.entry)}
                  onOpenPublishingControls={onOpenPublishingControls}
                  onOpenStatusAudit={onOpenStatusAudit}
                  onOpenMediaManager={() => onOpenMediaManager(row.entry)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReadinessCard({
  row,
  onOpenEntry,
  onOpenPublishingControls,
  onOpenStatusAudit,
  onOpenMediaManager,
}: {
  row: PublishingReadinessRow;
  onOpenEntry: () => void;
  onOpenPublishingControls: () => void;
  onOpenStatusAudit: () => void;
  onOpenMediaManager: () => void;
}) {
  const issueCount = row.blockers.length + row.warnings.length;

  return (
    <article className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-black text-white">{row.entry.word}</h3>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-black ${stateClasses(row.state)}`}
            >
              {stateLabel(row.state)}
            </span>
            <span className="rounded-full border border-neutral-700 bg-black/30 px-3 py-1 text-xs font-bold text-neutral-300">
              {row.entry.status}
            </span>
            <span className="rounded-full border border-neutral-700 bg-black/30 px-3 py-1 text-xs font-bold text-neutral-300">
              {formatVisibility(row.settings.visibility)}
            </span>
            {row.settings.isFeatured && (
              <span className="rounded-full border border-yellow-300/30 bg-yellow-300/10 px-3 py-1 text-xs font-black text-yellow-100">
                Featured
              </span>
            )}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <MetricBox
              label="Required gaps"
              value={String(row.requiredGapCount)}
            />
            <MetricBox
              label="Meanings verified"
              value={`${row.verifiedMeaningCount}/${row.totalMeaningCount}`}
            />
            <MetricBox
              label="Display order"
              value={
                row.settings.displayOrder === null
                  ? "Not set"
                  : String(row.settings.displayOrder)
              }
            />
            <MetricBox label="Slug" value={row.entry.slug || "Missing"} />
            <MetricBox
              label="Media"
              value={`${Number(row.media.hasImage) + Number(row.media.hasAudio)}/2`}
            />
          </div>

          {issueCount === 0 ? (
            <div className="mt-4 rounded-xl border border-emerald-300/25 bg-emerald-300/5 px-4 py-3 text-sm text-emerald-100">
              No launch blockers or warnings were found for this entry.
            </div>
          ) : (
            <div className="mt-4 grid gap-2 lg:grid-cols-2">
              {[...row.blockers, ...row.warnings].map((item, index) => (
                <div
                  key={`${item.code}-${index}`}
                  className={`rounded-xl border p-3 ${issueClasses(item)}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-black">{item.label}</p>
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] opacity-70">
                      {item.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 opacity-75">{item.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row xl:flex-col">
          <button
            type="button"
            onClick={onOpenEntry}
            className="rounded-xl border border-neutral-700 px-4 py-3 text-sm font-black text-white transition hover:border-white"
          >
            Open entry
          </button>
          {row.blockers.some(
            (item) =>
              item.code === "editorial-status" ||
              item.code === "meaning-verification",
          ) && (
            <button
              type="button"
              onClick={onOpenStatusAudit}
              className="rounded-xl border border-sky-300/30 bg-sky-300/10 px-4 py-3 text-sm font-black text-sky-100 transition hover:border-sky-300"
            >
              Fix statuses
            </button>
          )}
          <button
            type="button"
            onClick={onOpenMediaManager}
            className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-100 transition hover:border-cyan-300"
          >
            Media
          </button>
          <button
            type="button"
            onClick={onOpenPublishingControls}
            className="rounded-xl border border-violet-300/30 bg-violet-300/10 px-4 py-3 text-sm font-black text-violet-100 transition hover:border-violet-300"
          >
            Public settings
          </button>
        </div>
      </div>
    </article>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{detail}</p>
    </div>
  );
}

function IntegrityCheck({
  label,
  status,
  detail,
}: {
  label: string;
  status: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-black/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
          {label}
        </p>
        <span className="text-xs font-black text-violet-200">{status}</span>
      </div>
      <p className="mt-2 text-sm text-neutral-300">{detail}</p>
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-black/25 p-3">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
        {label}
      </p>
      <p className="mt-2 truncate text-sm font-black text-white" title={value}>
        {value}
      </p>
    </div>
  );
}

function NoticeBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
      {children}
    </div>
  );
}

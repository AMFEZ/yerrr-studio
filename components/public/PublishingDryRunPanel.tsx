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
  analyzePublishingReadiness,
  buildEmptyGraphIntegritySnapshot,
  buildGraphIntegritySnapshot,
  type GraphIntegritySnapshot,
  type PublicEntrySettingsLike,
  type PublishingReadinessRow,
} from "@/lib/publishingReadinessRules";
import {
  buildPublishingDryRunManifest,
  type PublishingDryRunManifest,
} from "@/lib/publishingDryRun";
import {
  buildMediaReadinessSnapshot,
  type EntryMediaAssetsByEntryId,
} from "@/lib/mediaReadinessRules";

const CONCEPT_TABLE_CANDIDATES = ["concepts", "cloud_concepts"] as const;
const RELATIONSHIP_TABLE_CANDIDATES = [
  "entry_relationships",
  "relationships",
  "graph_relationships",
] as const;
const CHECKLIST_STORAGE_KEY = "yerrr-studio-publishing-dry-run-checklist";

type DryRunTab = "overview" | "dataset" | "checklist";

type ManualChecklistId =
  | "production-build"
  | "database-backup"
  | "migrations"
  | "environment"
  | "mobile-qa"
  | "offline-qa"
  | "content-freeze";

type ManualChecklistState = Record<ManualChecklistId, boolean>;

type PublishingDryRunPanelProps = {
  isOpen: boolean;
  entries: Entry[];
  settingsByEntryId: Record<string, PublicEntrySettingsLike | undefined>;
  studioVersion: string;
  isSettingsLoading?: boolean;
  settingsError?: string | null;
  mediaAssetsByEntryId: EntryMediaAssetsByEntryId;
  isMediaLoading?: boolean;
  mediaError?: string | null;
  onClose: () => void;
  onRefreshSettings?: () => void | Promise<void>;
  onOpenEntry: (entry: Entry) => void;
  onOpenLaunchGate: () => void;
  onOpenPublishingControls: () => void;
  onOpenMediaManager: (entry?: Entry) => void;
  onRefreshMedia?: () => void | Promise<void>;
};

const EMPTY_CHECKLIST: ManualChecklistState = {
  "production-build": false,
  "database-backup": false,
  migrations: false,
  environment: false,
  "mobile-qa": false,
  "offline-qa": false,
  "content-freeze": false,
};

const MANUAL_CHECKLIST_ITEMS: Array<{
  id: ManualChecklistId;
  label: string;
  detail: string;
}> = [
  {
    id: "production-build",
    label: "Production build passed",
    detail: "npm run build completed with no TypeScript or Next.js errors.",
  },
  {
    id: "database-backup",
    label: "Database and media backup exported",
    detail: "A restorable Supabase backup and current Studio JSON export exist.",
  },
  {
    id: "migrations",
    label: "Supabase migrations verified",
    detail: "Production contains every Studio migration through this release.",
  },
  {
    id: "environment",
    label: "Production environment verified",
    detail: "Supabase and OpenAI server variables are configured in Vercel.",
  },
  {
    id: "mobile-qa",
    label: "Mobile workflow tested",
    detail: "Editor, queues, AI tools, and launch panels were checked on mobile.",
  },
  {
    id: "offline-qa",
    label: "Offline and reconnect sync tested",
    detail: "An offline edit queued, reconnected, and synchronized successfully.",
  },
  {
    id: "content-freeze",
    label: "Launch dataset freeze approved",
    detail: "The launch collection is reviewed and ready to remain stable for media work.",
  },
];

async function readFirstAvailableTable(tableCandidates: readonly string[]) {
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
        notice: null as string | null,
      };
    }

    lastMessage = error.message;
  }

  return {
    tableName: null,
    rows: [] as Array<Record<string, unknown>>,
    notice: lastMessage || "No compatible table was available.",
  };
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export function PublishingDryRunPanel({
  isOpen,
  entries,
  settingsByEntryId,
  studioVersion,
  isSettingsLoading = false,
  settingsError = null,
  mediaAssetsByEntryId,
  isMediaLoading = false,
  mediaError = null,
  onClose,
  onRefreshSettings,
  onOpenEntry,
  onOpenLaunchGate,
  onOpenPublishingControls,
  onOpenMediaManager,
  onRefreshMedia,
}: PublishingDryRunPanelProps) {
  const [tab, setTab] = useState<DryRunTab>("overview");
  const [graph, setGraph] = useState<GraphIntegritySnapshot>(() =>
    buildEmptyGraphIntegritySnapshot(),
  );
  const [runRevision, setRunRevision] = useState(0);
  const [generatedAt, setGeneratedAt] = useState(() => new Date().toISOString());
  const [manualChecklist, setManualChecklist] =
    useState<ManualChecklistState>(EMPTY_CHECKLIST);
  const [isChecklistHydrated, setIsChecklistHydrated] = useState(false);
  const [datasetSearch, setDatasetSearch] = useState("");

  useEffect(() => {
    if (!isOpen || isChecklistHydrated) return;

    try {
      const stored = window.localStorage.getItem(CHECKLIST_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<ManualChecklistState>;
        setManualChecklist({ ...EMPTY_CHECKLIST, ...parsed });
      }
    } catch {
      setManualChecklist(EMPTY_CHECKLIST);
    } finally {
      setIsChecklistHydrated(true);
    }
  }, [isChecklistHydrated, isOpen]);

  useEffect(() => {
    if (!isChecklistHydrated) return;
    window.localStorage.setItem(
      CHECKLIST_STORAGE_KEY,
      JSON.stringify(manualChecklist),
    );
  }, [isChecklistHydrated, manualChecklist]);

  useEffect(() => {
    if (!isOpen) return;

    let isCancelled = false;

    async function runGraphChecks() {
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
      setGeneratedAt(new Date().toISOString());
    }

    void runGraphChecks();

    return () => {
      isCancelled = true;
    };
  }, [entries, isOpen, runRevision]);

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

  const manifest = useMemo(
    () =>
      buildPublishingDryRunManifest(
        rows,
        graph,
        mediaSnapshot,
        studioVersion,
        generatedAt,
      ),
    [generatedAt, graph, mediaSnapshot, rows, studioVersion],
  );

  const blockedPublicRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.settings.visibility === "public" && row.state === "blocked",
      ),
    [rows],
  );

  const automaticChecks = useMemo(() => {
    const settingsStatus = settingsError
      ? ("blocked" as const)
      : isSettingsLoading
        ? ("waiting" as const)
        : ("pass" as const);
    const hasLaunchableEntries = manifest.summary.launchableEntries > 0;

    const checks = [
      {
        label: "Public settings loaded",
        detail: settingsError
          ? settingsError
          : isSettingsLoading
            ? "Loading visibility and launch metadata from Supabase."
            : "Visibility and launch metadata are available.",
        status: settingsStatus,
      },
      {
        label: "Media library loaded",
        detail: mediaError
          ? mediaError
          : isMediaLoading
            ? "Loading entry images and pronunciation recordings from Supabase."
            : `${manifest.summary.entriesWithImage} launchable images · ${manifest.summary.entriesWithAudio} launchable audio recordings.`,
        status: mediaError
          ? ("blocked" as const)
          : isMediaLoading
            ? ("waiting" as const)
            : ("pass" as const),
      },
      {
        label: "Public media policy",
        detail: `${manifest.summary.publicEntriesMissingImage} public entries missing images · ${manifest.summary.publicEntriesMissingAudio} missing audio · ${manifest.summary.imagesMissingAltText} images missing alt text.`,
        status:
          manifest.summary.imagesMissingAltText === 0 &&
          rows.every(
            (row) =>
              row.settings.visibility !== "public" ||
              !row.settings.isFeatured ||
              row.media.hasImage,
          )
            ? ("pass" as const)
            : ("blocked" as const),
      },
      {
        label: "Concept integrity checked",
        detail: graph.conceptsChecked
          ? `${manifest.integrity.unresolvedConceptReferences} unresolved reference${manifest.integrity.unresolvedConceptReferences === 1 ? "" : "s"}.`
          : "The concept table could not be checked.",
        status:
          graph.conceptsChecked &&
          manifest.integrity.unresolvedConceptReferences === 0
            ? ("pass" as const)
            : ("blocked" as const),
      },
      {
        label: "Relationship integrity checked",
        detail: graph.relationshipsChecked
          ? `${manifest.integrity.brokenRelationships} broken relationship${manifest.integrity.brokenRelationships === 1 ? "" : "s"}.`
          : "The relationship table could not be checked.",
        status:
          graph.relationshipsChecked &&
          manifest.integrity.brokenRelationships === 0
            ? ("pass" as const)
            : ("blocked" as const),
      },
      {
        label: "No blocked public entries",
        detail: `${manifest.summary.blockedPublicEntries} public entr${manifest.summary.blockedPublicEntries === 1 ? "y is" : "ies are"} blocked.`,
        status:
          manifest.summary.blockedPublicEntries === 0
            ? ("pass" as const)
            : ("blocked" as const),
      },
      {
        label: "Public routes are unique",
        detail:
          settingsStatus !== "pass"
            ? "Waiting for public settings before validating routes."
            : !hasLaunchableEntries
              ? "Not evaluated yet—no entries are currently launchable."
              : `${manifest.summary.routeCount} unique routes for ${manifest.summary.launchableEntries} launchable entries.`,
        status:
          settingsStatus !== "pass" || !hasLaunchableEntries
            ? ("waiting" as const)
            : manifest.summary.routeCount === manifest.summary.launchableEntries
              ? ("pass" as const)
              : ("blocked" as const),
      },
      {
        label: "Dry-run dataset generated",
        detail:
          settingsStatus !== "pass"
            ? "Waiting for public settings before generating the dataset."
            : hasLaunchableEntries
              ? `${manifest.summary.launchableEntries} entries · fingerprint ${manifest.fingerprint}.`
              : `${manifest.summary.privateEntries} private entries are excluded. Mark at least one verified entry Public when you are ready to test the launch dataset.`,
        status:
          settingsStatus !== "pass" || !hasLaunchableEntries
            ? ("waiting" as const)
            : ("pass" as const),
      },
    ];

    return checks.map((check) => ({
      ...check,
      passed: check.status === "pass",
    }));
  }, [
    graph.conceptsChecked,
    graph.relationshipsChecked,
    isMediaLoading,
    isSettingsLoading,
    manifest,
    mediaError,
    rows,
    settingsError,
  ]);

  const automaticPassed = automaticChecks.every((item) => item.status === "pass");
  const hasBlockedAutomaticCheck = automaticChecks.some(
    (item) => item.status === "blocked",
  );
  const hasWaitingAutomaticCheck = automaticChecks.some(
    (item) => item.status === "waiting",
  );
  const manualCompletedCount = Object.values(manualChecklist).filter(Boolean).length;
  const manualPassed = manualCompletedCount === MANUAL_CHECKLIST_ITEMS.length;
  const overallState = hasBlockedAutomaticCheck
    ? "blocked"
    : hasWaitingAutomaticCheck || !automaticPassed
      ? "waiting"
      : manualPassed
        ? "complete"
        : "manual";

  const visibleDataset = useMemo(() => {
    const query = datasetSearch.trim().toLowerCase();
    if (!query) return manifest.entries;

    return manifest.entries.filter((entry) =>
      [
        entry.word,
        entry.slug,
        entry.route,
        entry.publicTitle,
        entry.publicSummary,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [datasetSearch, manifest.entries]);

  if (!isOpen) return null;

  async function runDryRun() {
    await Promise.all([
      onRefreshSettings?.(),
      onRefreshMedia?.(),
    ]);
    setRunRevision((current) => current + 1);
  }

  function exportManifest() {
    const date = generatedAt.slice(0, 10);
    downloadJson(`yerrr-public-dry-run-${date}-${manifest.fingerprint}.json`, {
      ...manifest,
      releaseChecklist: {
        automatic: automaticChecks,
        manual: MANUAL_CHECKLIST_ITEMS.map((item) => ({
          ...item,
          completed: manualChecklist[item.id],
        })),
        overallState,
      },
    });
  }

  return (
    <div className="fixed inset-0 z-[96] overflow-y-auto bg-black/90 p-3 backdrop-blur-sm sm:p-6">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-3xl border border-neutral-700 bg-neutral-950 shadow-2xl">
        <header className="border-b border-neutral-800 p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-fuchsia-300">
                No-write launch rehearsal
              </p>
              <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">
                Publishing Dry Run
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
                Build the exact public dataset Studio would hand to the YERRR app,
                validate routes, media coverage, and graph integrity, and finish the release checklist.
                This panel cannot publish, edit, delete, or change visibility.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void runDryRun()}
                disabled={graph.isLoading || isSettingsLoading || isMediaLoading}
                className="rounded-xl border border-fuchsia-300/35 bg-fuchsia-300/10 px-4 py-3 text-sm font-black text-fuchsia-100 transition hover:border-fuchsia-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {graph.isLoading || isSettingsLoading || isMediaLoading
                  ? "Running checks..."
                  : "Run full dry run"}
              </button>
              <button
                type="button"
                onClick={exportManifest}
                disabled={graph.isLoading}
                className="rounded-xl border border-neutral-700 px-4 py-3 text-sm font-black text-white transition hover:border-white disabled:opacity-50"
              >
                Export manifest
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

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryCard
              label="Launchable"
              value={manifest.summary.launchableEntries}
              detail={`${manifest.summary.readyEntries} ready · ${manifest.summary.liveEntries} live`}
            />
            <SummaryCard
              label="Blocked public"
              value={manifest.summary.blockedPublicEntries}
              detail={`${manifest.summary.blockerCount} blockers`}
            />
            <SummaryCard
              label="Private"
              value={manifest.summary.privateEntries}
              detail="Excluded from manifest"
            />
            <SummaryCard
              label="Featured"
              value={manifest.summary.featuredEntries}
              detail="Sorted first in preview"
            />
            <SummaryCard
              label="Fingerprint"
              value={manifest.fingerprint}
              detail={formatDate(manifest.generatedAt)}
              compact
            />
          </div>
        </header>

        <div className="p-5 sm:p-7">
          <StatusBanner state={overallState} manualCompleted={manualCompletedCount} />

          {graph.notices.length > 0 && (
            <div className="mt-4 space-y-2">
              {graph.notices.map((notice) => (
                <NoticeBox key={notice}>{notice}</NoticeBox>
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            {(
              [
                ["overview", "Overview"],
                ["dataset", `Dataset · ${manifest.entries.length}`],
                [
                  "checklist",
                  `Checklist · ${manualCompletedCount}/${MANUAL_CHECKLIST_ITEMS.length}`,
                ],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={`rounded-xl px-4 py-2 text-sm font-black transition ${
                  tab === value
                    ? "bg-white text-black"
                    : "border border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <div className="mt-6 space-y-5">
              <section className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-black text-white">
                      Automatic release checks
                    </h3>
                    <p className="mt-1 text-sm text-neutral-500">
                      These rerun from current Studio and Supabase data.
                    </p>
                  </div>
                  <span className="text-sm font-black text-neutral-300">
                    {automaticChecks.filter((item) => item.passed).length}/
                    {automaticChecks.length} passed
                  </span>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {automaticChecks.map((item) => (
                    <CheckCard
                      key={item.label}
                      status={item.status}
                      label={item.label}
                      detail={item.detail}
                    />
                  ))}
                </div>
              </section>

              {blockedPublicRows.length > 0 && (
                <section className="rounded-2xl border border-red-400/25 bg-red-400/5 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-lg font-black text-red-100">
                        Blocked public entries
                      </h3>
                      <p className="mt-1 text-sm text-red-100/60">
                        These are visible publicly but excluded from the simulated dataset.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onOpenLaunchGate}
                      className="rounded-xl bg-red-200 px-4 py-3 text-sm font-black text-red-950"
                    >
                      Open Launch Gate
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {blockedPublicRows.slice(0, 8).map((row) => (
                      <BlockedEntryCard
                        key={row.entry.id}
                        row={row}
                        onOpen={() => onOpenEntry(row.entry)}
                      />
                    ))}
                  </div>
                </section>
              )}

              <section className="rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-5">
                <h3 className="text-lg font-black text-cyan-100">
                  Media readiness is now included
                </h3>
                <p className="mt-2 text-sm leading-6 text-cyan-100/70">
                  The manifest now includes image and pronunciation-audio records. Featured public entries require an image, every public image requires alt text, and missing audio remains a launch warning rather than a blocker.
                </p>
              </section>
            </div>
          )}

          {tab === "dataset" && (
            <div className="mt-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-black text-white">
                    Simulated public dataset
                  </h3>
                  <p className="mt-1 text-sm text-neutral-500">
                    Only Ready and Live entries are included. Nothing is published.
                  </p>
                </div>
                <input
                  value={datasetSearch}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setDatasetSearch(event.target.value)
                  }
                  placeholder="Search manifest..."
                  className="rounded-xl border border-neutral-700 bg-black px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-fuchsia-300 sm:min-w-72"
                />
              </div>

              <div className="mt-4 space-y-3">
                {visibleDataset.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-neutral-700 p-10 text-center text-neutral-500">
                    No launchable records match this search.
                  </div>
                ) : (
                  visibleDataset.map((record) => {
                    const entry = entries.find(
                      (candidate) => String(candidate.id) === record.id,
                    );

                    return (
                      <article
                        key={record.id}
                        className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-lg font-black text-white">
                                {record.publicTitle}
                              </h4>
                              <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-black text-emerald-100">
                                {record.editorialStatus}
                              </span>
                              {record.featured && (
                                <span className="rounded-full border border-yellow-300/25 bg-yellow-300/10 px-3 py-1 text-xs font-black text-yellow-100">
                                  Featured
                                </span>
                              )}
                            </div>
                            <p className="mt-2 font-mono text-xs text-fuchsia-200">
                              {record.route}
                            </p>
                            <p className="mt-3 text-sm leading-6 text-neutral-300">
                              {record.publicSummary || "No public summary"}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-500">
                              <span>{record.meanings.length} meanings</span>
                              <span>·</span>
                              <span>{record.relationshipCount} relationships</span>
                              <span>·</span>
                              <span>{record.image ? "image ready" : "no image"}</span>
                              <span>·</span>
                              <span>{record.pronunciationAudio ? "audio ready" : "no audio"}</span>
                              <span>·</span>
                              <span>
                                order {record.displayOrder ?? "not set"}
                              </span>
                            </div>
                          </div>

                          {entry && (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => onOpenMediaManager(entry)}
                                className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-100 transition hover:border-cyan-300"
                              >
                                Media
                              </button>
                              <button
                                type="button"
                                onClick={() => onOpenEntry(entry)}
                                className="rounded-xl border border-neutral-700 px-4 py-3 text-sm font-black text-white transition hover:border-white"
                              >
                                Open entry
                              </button>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {tab === "checklist" && (
            <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_0.75fr]">
              <section className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5">
                <h3 className="text-lg font-black text-white">
                  Manual release checklist
                </h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Saved in this browser. Check an item only after you personally verify it.
                </p>

                <div className="mt-4 space-y-3">
                  {MANUAL_CHECKLIST_ITEMS.map((item) => (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-neutral-800 bg-black/30 p-4 transition hover:border-neutral-600"
                    >
                      <input
                        type="checkbox"
                        checked={manualChecklist[item.id]}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          setManualChecklist((current) => ({
                            ...current,
                            [item.id]: event.target.checked,
                          }))
                        }
                        className="mt-1 h-4 w-4 accent-fuchsia-300"
                      />
                      <span>
                        <span className="block text-sm font-black text-white">
                          {item.label}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-neutral-500">
                          {item.detail}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </section>

              <aside className="space-y-4">
                <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
                  <h3 className="font-black text-white">Dry-run record</h3>
                  <dl className="mt-4 space-y-3 text-sm">
                    <RecordRow label="Studio version" value={studioVersion} />
                    <RecordRow
                      label="Generated"
                      value={formatDate(manifest.generatedAt)}
                    />
                    <RecordRow label="Fingerprint" value={manifest.fingerprint} />
                    <RecordRow
                      label="Manifest entries"
                      value={String(manifest.entries.length)}
                    />
                    <RecordRow
                      label="Manual checks"
                      value={`${manualCompletedCount}/${MANUAL_CHECKLIST_ITEMS.length}`}
                    />
                  </dl>
                </section>

                <section className="rounded-2xl border border-violet-300/20 bg-violet-300/5 p-5">
                  <h3 className="font-black text-violet-100">Useful actions</h3>
                  <div className="mt-4 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={onOpenLaunchGate}
                      className="rounded-xl border border-violet-300/30 px-4 py-3 text-sm font-black text-violet-100 transition hover:border-violet-300"
                    >
                      Open Launch Gate
                    </button>
                    <button
                      type="button"
                      onClick={onOpenPublishingControls}
                      className="rounded-xl border border-violet-300/30 px-4 py-3 text-sm font-black text-violet-100 transition hover:border-violet-300"
                    >
                      Open Publishing Settings
                    </button>
                    <button
                      type="button"
                      onClick={exportManifest}
                      className="rounded-xl bg-violet-200 px-4 py-3 text-sm font-black text-violet-950"
                    >
                      Export dry-run manifest
                    </button>
                  </div>
                </section>
              </aside>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBanner({
  state,
  manualCompleted,
}: {
  state: "blocked" | "waiting" | "manual" | "complete";
  manualCompleted: number;
}) {
  if (state === "complete") {
    return (
      <div className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 p-5 text-emerald-100">
        <p className="font-black">Dry run complete</p>
        <p className="mt-1 text-sm text-emerald-100/70">
          Automatic checks and the manual checklist are complete. Studio is ready
          to move into Phase 6 Media—not yet the public-facing app.
        </p>
      </div>
    );
  }

  if (state === "waiting") {
    return (
      <div className="rounded-2xl border border-sky-300/30 bg-sky-300/10 p-5 text-sky-100">
        <p className="font-black">Dry run waiting for a launch set</p>
        <p className="mt-1 text-sm text-sky-100/70">
          The system checks are not reporting a data failure. Public settings
          must load, and at least one verified entry must be marked Public before
          routes and the public manifest can be generated.
        </p>
      </div>
    );
  }

  if (state === "manual") {
    return (
      <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-5 text-amber-100">
        <p className="font-black">Technical simulation passed</p>
        <p className="mt-1 text-sm text-amber-100/70">
          Finish the manual checklist before closing the publishing-system phase.
          {` ${manualCompleted}/${MANUAL_CHECKLIST_ITEMS.length} items are complete.`}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-5 text-red-100">
      <p className="font-black">Dry run blocked</p>
      <p className="mt-1 text-sm text-red-100/70">
        One or more automatic checks failed. Repair the launch data and run the
        rehearsal again before moving forward.
      </p>
    </div>
  );
}

function BlockedEntryCard({
  row,
  onOpen,
}: {
  row: PublishingReadinessRow;
  onOpen: () => void;
}) {
  return (
    <article className="rounded-xl border border-red-400/20 bg-black/25 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black text-white">{row.entry.word}</p>
          <p className="mt-1 text-xs text-red-100/60">
            {row.blockers.map((item) => item.label).join(" · ")}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="shrink-0 rounded-lg border border-red-300/30 px-3 py-2 text-xs font-black text-red-100"
        >
          Open
        </button>
      </div>
    </article>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  compact = false,
}: {
  label: string;
  value: number | string;
  detail: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
        {label}
      </p>
      <p
        className={`mt-2 font-black text-white ${compact ? "font-mono text-lg" : "text-3xl"}`}
      >
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-neutral-500" title={detail}>
        {detail}
      </p>
    </div>
  );
}

function CheckCard({
  status,
  label,
  detail,
}: {
  status: "pass" | "blocked" | "waiting";
  label: string;
  detail: string;
}) {
  const classes =
    status === "pass"
      ? "border-emerald-300/20 bg-emerald-300/5"
      : status === "waiting"
        ? "border-sky-300/20 bg-sky-300/5"
        : "border-red-400/20 bg-red-400/5";
  const labelClasses =
    status === "pass"
      ? "text-emerald-200"
      : status === "waiting"
        ? "text-sky-200"
        : "text-red-200";

  return (
    <div className={`rounded-xl border p-4 ${classes}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-white">{label}</p>
        <span className={`text-xs font-black ${labelClasses}`}>
          {status === "pass"
            ? "PASS"
            : status === "waiting"
              ? "WAITING"
              : "BLOCKED"}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-neutral-500">{detail}</p>
    </div>
  );
}

function RecordRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-neutral-800 pb-3 last:border-0 last:pb-0">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="break-all text-right font-black text-neutral-200">{value}</dd>
    </div>
  );
}

function NoticeBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-amber-300/25 bg-amber-300/5 px-4 py-3 text-sm text-amber-100">
      {children}
    </div>
  );
}

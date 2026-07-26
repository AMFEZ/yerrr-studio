"use client";

import { useEffect, useMemo, useState } from "react";
import type { Entry } from "@/types/entry";
import type { EntryMediaAssetsByEntryId } from "@/lib/mediaReadinessRules";
import type { PublicEntrySettingsLike } from "@/lib/publishingReadinessRules";
import {
  buildFinalStudioQASnapshot,
  type FinalStudioQACheck,
  type FinalStudioQACheckStatus,
} from "@/lib/finalStudioQA";

const STORAGE_KEY = "yerrr-studio-final-qa-checklist-v1";

const MANUAL_CHECKS = [
  {
    id: "production-build",
    label: "Production build passed",
    detail: "npm run build completed without TypeScript or Next.js errors.",
  },
  {
    id: "migrations",
    label: "Supabase migrations verified",
    detail: "Every Studio migration has been run in the production Supabase project.",
  },
  {
    id: "environment",
    label: "Production environment variables verified",
    detail: "Vercel and local server variables are configured without exposing secrets.",
  },
  {
    id: "mobile",
    label: "Mobile Studio workflow tested",
    detail: "Navigation, entry editing, saving, and major panels were tested on a phone-sized screen.",
  },
  {
    id: "offline",
    label: "Offline and reconnect sync tested",
    detail: "An offline edit was saved, reconnected, synchronized, and verified in Supabase.",
  },
  {
    id: "backup",
    label: "Database backup exported",
    detail: "A final pre-freeze database export has been saved outside the Studio project.",
  },
  {
    id: "media-audit",
    label: "Storage Audit completed",
    detail: "Media Storage Audit was run and all orphaned or broken records were reviewed.",
  },
  {
    id: "dry-run",
    label: "Publishing dry run passed",
    detail: "The final public manifest was exported after all automatic checks passed.",
  },
  {
    id: "dataset-freeze",
    label: "Launch dataset freeze approved",
    detail: "Every lexicon entry was reviewed and the launch dataset fingerprint was recorded.",
  },
] as const;

type ManualCheckId = (typeof MANUAL_CHECKS)[number]["id"];
type ManualChecklistState = Partial<Record<ManualCheckId, boolean>>;
type Tab = "overview" | "system" | "content" | "manual" | "report";

type FinalStudioQAPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  studioVersion: string;
  entries: Entry[];
  isEntriesLoading: boolean;
  isOnline: boolean;
  pendingSyncCount: number;
  isSyncingOffline: boolean;
  offlineSyncError?: string | null;
  settingsByEntryId: Record<string, PublicEntrySettingsLike | undefined>;
  isPublicSettingsLoading: boolean;
  publicSettingsError?: string | null;
  mediaAssetsByEntryId: EntryMediaAssetsByEntryId;
  isMediaLoading: boolean;
  mediaError?: string | null;
  onRefreshAll: () => void | Promise<void>;
  onOpenCompletion: () => void;
  onOpenStatusAudit: () => void;
  onOpenLaunchGate: () => void;
  onOpenDryRun: () => void;
  onOpenMedia: () => void;
  onSyncOffline: () => void | Promise<void>;
};

function statusClass(status: FinalStudioQACheckStatus) {
  if (status === "pass") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";
  }
  if (status === "blocked") {
    return "border-red-400/30 bg-red-400/10 text-red-100";
  }
  return "border-amber-400/30 bg-amber-400/10 text-amber-100";
}

function statusLabel(status: FinalStudioQACheckStatus) {
  if (status === "pass") return "PASS";
  if (status === "blocked") return "BLOCKED";
  return "REVIEW";
}

function CheckCard({
  check,
  onAction,
}: {
  check: FinalStudioQACheck;
  onAction?: (check: FinalStudioQACheck) => void;
}) {
  return (
    <article className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="font-black text-white">{check.label}</h3>
          <p className="mt-1 text-sm leading-6 text-neutral-400">{check.detail}</p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-black tracking-[0.16em] ${statusClass(check.status)}`}
        >
          {statusLabel(check.status)}
        </span>
      </div>
      {check.action && onAction && (
        <button
          type="button"
          onClick={() => onAction(check)}
          className="mt-4 rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-black text-white transition hover:border-cyan-300 hover:text-cyan-200"
        >
          Open related tool
        </button>
      )}
    </article>
  );
}

function Metric({ label, value, detail }: { label: string; value: number | string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
      <div className="text-2xl font-black text-white">{value}</div>
      <div className="mt-1 text-xs font-black uppercase tracking-[0.18em] text-neutral-400">
        {label}
      </div>
      {detail && <p className="mt-2 text-xs leading-5 text-neutral-500">{detail}</p>}
    </div>
  );
}

export function FinalStudioQAPanel({
  isOpen,
  onClose,
  studioVersion,
  entries,
  isEntriesLoading,
  isOnline,
  pendingSyncCount,
  isSyncingOffline,
  offlineSyncError,
  settingsByEntryId,
  isPublicSettingsLoading,
  publicSettingsError,
  mediaAssetsByEntryId,
  isMediaLoading,
  mediaError,
  onRefreshAll,
  onOpenCompletion,
  onOpenStatusAudit,
  onOpenLaunchGate,
  onOpenDryRun,
  onOpenMedia,
  onSyncOffline,
}: FinalStudioQAPanelProps) {
  const [tab, setTab] = useState<Tab>("overview");
  const [manualState, setManualState] = useState<ManualChecklistState>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setManualState(JSON.parse(stored) as ManualChecklistState);
    } catch {
      setManualState({});
    }
  }, [isOpen]);

  const snapshot = useMemo(
    () =>
      buildFinalStudioQASnapshot({
        studioVersion,
        entries,
        isEntriesLoading,
        isOnline,
        pendingSyncCount,
        isSyncingOffline,
        offlineSyncError,
        settingsByEntryId,
        isPublicSettingsLoading,
        publicSettingsError,
        mediaAssetsByEntryId,
        isMediaLoading,
        mediaError,
      }),
    [
      studioVersion,
      entries,
      isEntriesLoading,
      isOnline,
      pendingSyncCount,
      isSyncingOffline,
      offlineSyncError,
      settingsByEntryId,
      isPublicSettingsLoading,
      publicSettingsError,
      mediaAssetsByEntryId,
      isMediaLoading,
      mediaError,
    ],
  );

  if (!isOpen) return null;

  const manualCompleted = MANUAL_CHECKS.filter(
    (item) => manualState[item.id],
  ).length;
  const manualReady = manualCompleted === MANUAL_CHECKS.length;
  const releaseCandidateReady =
    snapshot.systemReady && snapshot.contentFrozen && manualReady;

  const persistManualState = (nextState: ManualChecklistState) => {
    setManualState(nextState);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    } catch {
      setNotice("Checklist progress could not be saved in this browser.");
    }
  };

  const handleToggleManual = (id: ManualCheckId) => {
    persistManualState({ ...manualState, [id]: !manualState[id] });
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setNotice("");
    try {
      await onRefreshAll();
      setNotice("Studio QA data refreshed.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Studio QA refresh failed.",
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAction = (check: FinalStudioQACheck) => {
    if (check.action === "completion") onOpenCompletion();
    if (check.action === "status-audit") onOpenStatusAudit();
    if (check.action === "launch-gate") onOpenLaunchGate();
    if (check.action === "dry-run") onOpenDryRun();
    if (check.action === "media") onOpenMedia();
    if (check.action === "sync") void onSyncOffline();
  };

  const handleExport = () => {
    const report = {
      app: "YERRR Studio",
      reportType: "Final Studio QA",
      studioVersion,
      generatedAt: new Date().toISOString(),
      releaseCandidateReady,
      snapshot,
      manualChecklist: MANUAL_CHECKS.map((item) => ({
        ...item,
        completed: Boolean(manualState[item.id]),
      })),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `yerrr-studio-final-qa-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice("Final QA report exported.");
  };

  const stageTitle = !snapshot.systemReady
    ? "Studio systems need attention"
    : !snapshot.contentFrozen
      ? "Studio code is ready — finish the lexicon"
      : !manualReady
        ? "Complete the final manual checks"
        : "Studio release candidate ready";

  const stageDetail = !snapshot.systemReady
    ? `${snapshot.systemBlockerCount} system blocker${snapshot.systemBlockerCount === 1 ? " remains" : "s remain"}.`
    : !snapshot.contentFrozen
      ? `${snapshot.summary.incompleteEntries} incomplete entries, ${snapshot.summary.statusMismatchCount} status mismatches, and ${snapshot.summary.publicEntries} public entries remain in the content-freeze gate.`
      : !manualReady
        ? `${MANUAL_CHECKS.length - manualCompleted} manual check${MANUAL_CHECKS.length - manualCompleted === 1 ? " remains" : "s remain"}.`
        : "All automatic and manual gates are complete. Record the exported report and dataset fingerprint before public-app development.";

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "system", label: `System · ${snapshot.systemBlockerCount}` },
    { id: "content", label: `Content Freeze · ${snapshot.contentBlockerCount}` },
    { id: "manual", label: `Manual · ${manualCompleted}/${MANUAL_CHECKS.length}` },
    { id: "report", label: "Report" },
  ];

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-black/90 p-3 backdrop-blur sm:p-6">
      <div className="mx-auto min-h-full max-w-6xl rounded-3xl border border-neutral-800 bg-neutral-950 shadow-2xl">
        <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/95 p-5 backdrop-blur sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">
                Alpha 6.1 · Final Studio QA
              </div>
              <h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">
                {stageTitle}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
                {stageDetail}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={isRefreshing}
                className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-100 transition hover:border-cyan-300 disabled:opacity-50"
              >
                {isRefreshing ? "Refreshing…" : "Refresh QA"}
              </button>
              <button
                type="button"
                onClick={handleExport}
                className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-black text-white transition hover:border-white"
              >
                Export report
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-black text-neutral-300 transition hover:border-red-300 hover:text-red-200"
              >
                Close
              </button>
            </div>
          </div>

          <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`whitespace-nowrap rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.12em] transition ${
                  tab === item.id
                    ? "border-cyan-300 bg-cyan-300/15 text-cyan-100"
                    : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-600 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>

        <main className="space-y-6 p-5 sm:p-7">
          {notice && (
            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm font-bold text-cyan-100">
              {notice}
            </div>
          )}

          {tab === "overview" && (
            <>
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric
                  label="System blockers"
                  value={snapshot.systemBlockerCount}
                  detail="Technical checks that must pass before dataset freeze."
                />
                <Metric
                  label="Incomplete entries"
                  value={snapshot.summary.incompleteEntries}
                  detail={`${snapshot.summary.requiredGapCount} required fields remain.`}
                />
                <Metric
                  label="Status mismatches"
                  value={snapshot.summary.statusMismatchCount}
                  detail={`${snapshot.summary.verifiedEntries}/${snapshot.summary.activeEntries} active entries are verification-ready.`}
                />
                <Metric
                  label="Public / launchable"
                  value={`${snapshot.summary.publicEntries} / ${snapshot.summary.launchableEntries}`}
                  detail={`${snapshot.summary.blockedPublicEntries} public entries are locally blocked.`}
                />
              </section>

              <section className="rounded-3xl border border-neutral-800 bg-neutral-900/50 p-5 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-xl font-black text-white">Release path</h2>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">
                      Studio coding stops after this build. The next milestone is content completion and dataset freeze—not the public app.
                    </p>
                  </div>
                  <div
                    className={`rounded-2xl border px-4 py-3 text-sm font-black ${
                      releaseCandidateReady
                        ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
                        : snapshot.systemReady
                          ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
                          : "border-red-300/30 bg-red-300/10 text-red-100"
                    }`}
                  >
                    {releaseCandidateReady
                      ? "Release candidate ready"
                      : snapshot.systemReady
                        ? "Code ready · content freeze pending"
                        : "System QA blocked"}
                  </div>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-neutral-800 bg-black/30 p-4">
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">1 · System QA</div>
                    <p className="mt-2 text-sm text-neutral-300">
                      {snapshot.systemReady ? "Passed" : `${snapshot.systemBlockerCount} blockers`}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-neutral-800 bg-black/30 p-4">
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-orange-300">2 · Lexicon freeze</div>
                    <p className="mt-2 text-sm text-neutral-300">
                      {snapshot.contentFrozen ? "Passed" : `${snapshot.contentBlockerCount} blockers`}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-neutral-800 bg-black/30 p-4">
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-fuchsia-300">3 · Manual release</div>
                    <p className="mt-2 text-sm text-neutral-300">
                      {manualCompleted}/{MANUAL_CHECKS.length} complete
                    </p>
                  </div>
                </div>
              </section>

              <section className="grid gap-3 lg:grid-cols-2">
                {[...snapshot.systemChecks, ...snapshot.contentChecks]
                  .filter((check) => check.status !== "pass")
                  .slice(0, 8)
                  .map((check) => (
                    <CheckCard key={check.id} check={check} onAction={handleAction} />
                  ))}
                {snapshot.checks.every((check) => check.status === "pass") && (
                  <div className="rounded-3xl border border-emerald-300/30 bg-emerald-300/10 p-6 text-emerald-100 lg:col-span-2">
                    <h2 className="text-xl font-black">Every automatic check passed</h2>
                    <p className="mt-2 text-sm leading-6 text-emerald-100/70">
                      Complete the manual checklist, export the report, and record the final dry-run fingerprint.
                    </p>
                  </div>
                )}
              </section>
            </>
          )}

          {tab === "system" && (
            <section className="grid gap-3 lg:grid-cols-2">
              {snapshot.systemChecks.map((check) => (
                <CheckCard key={check.id} check={check} onAction={handleAction} />
              ))}
            </section>
          )}

          {tab === "content" && (
            <>
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Active entries" value={snapshot.summary.activeEntries} />
                <Metric label="Required gaps" value={snapshot.summary.requiredGapCount} />
                <Metric label="Images / audio" value={`${snapshot.summary.mediaWithImage} / ${snapshot.summary.mediaWithAudio}`} />
                <Metric label="Both media" value={snapshot.summary.mediaComplete} />
              </section>
              <section className="grid gap-3 lg:grid-cols-2">
                {snapshot.contentChecks.map((check) => (
                  <CheckCard key={check.id} check={check} onAction={handleAction} />
                ))}
              </section>
            </>
          )}

          {tab === "manual" && (
            <section className="space-y-3">
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
                Check an item only after you personally verified it. These checks are stored in this browser and included in the exported QA report.
              </div>
              {MANUAL_CHECKS.map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer gap-4 rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4 transition hover:border-neutral-600"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(manualState[item.id])}
                    onChange={() => handleToggleManual(item.id)}
                    className="mt-1 h-5 w-5 accent-cyan-300"
                  />
                  <span>
                    <span className="block font-black text-white">{item.label}</span>
                    <span className="mt-1 block text-sm leading-6 text-neutral-400">{item.detail}</span>
                  </span>
                </label>
              ))}
              <button
                type="button"
                onClick={() => persistManualState({})}
                className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-black text-neutral-300 transition hover:border-red-300 hover:text-red-200"
              >
                Reset manual checklist
              </button>
            </section>
          )}

          {tab === "report" && (
            <section className="space-y-5">
              <div className="rounded-3xl border border-neutral-800 bg-neutral-950/70 p-5">
                <h2 className="text-xl font-black text-white">Final QA report</h2>
                <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div><dt className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">Studio version</dt><dd className="mt-1 font-bold text-white">{studioVersion}</dd></div>
                  <div><dt className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">Ruleset</dt><dd className="mt-1 font-bold text-white">{snapshot.rulesetVersion}</dd></div>
                  <div><dt className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">Generated</dt><dd className="mt-1 font-bold text-white">{new Date(snapshot.generatedAt).toLocaleString()}</dd></div>
                  <div><dt className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">System ready</dt><dd className="mt-1 font-bold text-white">{snapshot.systemReady ? "Yes" : "No"}</dd></div>
                  <div><dt className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">Content frozen</dt><dd className="mt-1 font-bold text-white">{snapshot.contentFrozen ? "Yes" : "No"}</dd></div>
                  <div><dt className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">Manual complete</dt><dd className="mt-1 font-bold text-white">{manualReady ? "Yes" : "No"}</dd></div>
                </dl>
              </div>
              <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-5">
                <h2 className="font-black text-cyan-100">What happens after Alpha 6.1</h2>
                <p className="mt-2 text-sm leading-6 text-cyan-100/75">
                  Stop adding Studio features. Use Completion Sprint, Status Audit, Launch Gate, Media Audit, and Dry Run until every lexicon entry is complete and the launch dataset is frozen. Only then begin the public-facing YERRR app.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExport}
                className="rounded-xl border border-cyan-300 bg-cyan-300 px-5 py-3 font-black text-black transition hover:bg-cyan-200"
              >
                Export final QA JSON
              </button>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

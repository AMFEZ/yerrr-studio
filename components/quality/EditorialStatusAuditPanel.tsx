"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import type { Entry } from "@/types/entry";
import {
  EDITORIAL_STATUS_RULESET_VERSION,
  applyEditorialStatusAlignment,
  countEditorialStatusMismatches,
  getEditorialStatusAlignment,
  type EditorialStatusAuditSeverity,
} from "@/lib/editorialStatusRules";

type AuditFilter = "all" | EditorialStatusAuditSeverity;

type EditorialStatusAuditPanelProps = {
  isOpen: boolean;
  entries: Entry[];
  onClose: () => void;
  onOpenEntry: (entry: Entry) => void;
  onApplyEntry: (entry: Entry) => Promise<void>;
};

function severityLabel(severity: EditorialStatusAuditSeverity) {
  if (severity === "critical") return "Critical mismatch";
  if (severity === "warning") return "Needs alignment";
  return "Aligned";
}

function severityClasses(severity: EditorialStatusAuditSeverity) {
  if (severity === "critical") return "border-red-400/35 bg-red-400/10 text-red-100";
  if (severity === "warning") return "border-amber-300/35 bg-amber-300/10 text-amber-100";
  return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
}

export function EditorialStatusAuditPanel({
  isOpen,
  entries,
  onClose,
  onOpenEntry,
  onApplyEntry,
}: EditorialStatusAuditPanelProps) {
  const [filter, setFilter] = useState<AuditFilter>("all");
  const [search, setSearch] = useState("");
  const [applyingEntryId, setApplyingEntryId] = useState<string | null>(null);
  const [isApplyingAll, setIsApplyingAll] = useState(false);
  const [notice, setNotice] = useState("");

  const rows = useMemo(
    () =>
      entries
        .map((entry) => ({ entry, alignment: getEditorialStatusAlignment(entry) }))
        .sort((left, right) => {
          const severityOrder = { critical: 0, warning: 1, healthy: 2 } as const;
          const severityDifference =
            severityOrder[left.alignment.severity] -
            severityOrder[right.alignment.severity];
          if (severityDifference !== 0) return severityDifference;
          return left.entry.word.localeCompare(right.entry.word);
        }),
    [entries],
  );

  const counts = useMemo(() => countEditorialStatusMismatches(entries), [entries]);

  const visibleRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return rows.filter(({ entry, alignment }) => {
      if (filter !== "all" && alignment.severity !== filter) return false;
      if (!normalizedSearch) return true;
      return (
        entry.word.toLowerCase().includes(normalizedSearch) ||
        entry.status.toLowerCase().includes(normalizedSearch) ||
        alignment.recommendedEntryStatus.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [filter, rows, search]);

  const repairableRows = rows.filter(({ alignment }) => alignment.hasMismatch);

  if (!isOpen) return null;

  async function applyOne(entry: Entry) {
    const updatedEntry = applyEditorialStatusAlignment(entry);
    if (updatedEntry === entry) return;

    setApplyingEntryId(String(entry.id));
    setNotice("");

    try {
      await onApplyEntry(updatedEntry);
      setNotice(`${entry.word} now follows the shared editorial status rules.`);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "The status repair could not be saved.",
      );
    } finally {
      setApplyingEntryId(null);
    }
  }

  async function applyAll() {
    if (repairableRows.length === 0 || isApplyingAll) return;

    const confirmed = window.confirm(
      `Apply ${repairableRows.length} editorial status repair${repairableRows.length === 1 ? "" : "s"}? This never publishes an entry; it only aligns entry and meaning statuses with the current rules.`,
    );

    if (!confirmed) return;

    setIsApplyingAll(true);
    setNotice("");
    let appliedCount = 0;

    try {
      for (const { entry } of repairableRows) {
        await onApplyEntry(applyEditorialStatusAlignment(entry));
        appliedCount += 1;
      }

      setNotice(`${appliedCount} status repair${appliedCount === 1 ? " was" : "s were"} applied.`);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? `${appliedCount} repairs saved before this error: ${error.message}`
          : `${appliedCount} repairs were saved before the process stopped.`,
      );
    } finally {
      setIsApplyingAll(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-black/85 p-3 backdrop-blur-sm sm:p-6">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-neutral-700 bg-neutral-950 shadow-2xl">
        <header className="border-b border-neutral-800 p-5 sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-sky-300">
                Ruleset {EDITORIAL_STATUS_RULESET_VERSION}
              </p>
              <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">
                Editorial Status Audit
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
                Draft, Review, Verified, and Published now follow one status contract. Completeness never grants verification by itself, and this audit never publishes entries automatically.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-neutral-700 px-4 py-3 text-sm font-black text-neutral-200 transition hover:border-white hover:text-white"
            >
              Close
            </button>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard label="Critical" value={counts.critical} detail="Verified or Published too early" />
            <SummaryCard label="Needs alignment" value={counts.warning} detail="Queue/status disagreement" />
            <SummaryCard label="Aligned" value={counts.healthy} detail="Follows current rules" />
            <SummaryCard label="Repairs" value={counts.total} detail="Explicit changes available" />
          </div>
        </header>

        <div className="p-5 sm:p-7">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {(["all", "critical", "warning", "healthy"] as const).map((value) => (
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
                  {value === "all" ? "All" : severityLabel(value)}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={search}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
                placeholder="Search entries or statuses..."
                className="rounded-xl border border-neutral-700 bg-black px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-sky-300"
              />
              <button
                type="button"
                onClick={() => void applyAll()}
                disabled={repairableRows.length === 0 || isApplyingAll || Boolean(applyingEntryId)}
                className="rounded-xl bg-sky-300 px-4 py-3 text-sm font-black text-black transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isApplyingAll ? "Applying repairs..." : `Apply safe repairs · ${repairableRows.length}`}
              </button>
            </div>
          </div>

          {notice && (
            <div className="mt-4 rounded-xl border border-sky-300/25 bg-sky-300/10 px-4 py-3 text-sm text-sky-100">
              {notice}
            </div>
          )}

          <div className="mt-6 space-y-3">
            {visibleRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-700 p-8 text-center text-neutral-500">
                No entries match this audit filter.
              </div>
            ) : (
              visibleRows.map(({ entry, alignment }) => (
                <article key={entry.id} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-black text-white">{entry.word}</h3>
                        <span className={`rounded-full border px-3 py-1 text-xs font-black ${severityClasses(alignment.severity)}`}>
                          {severityLabel(alignment.severity)}
                        </span>
                        {alignment.gapCount > 0 && (
                          <span className="rounded-full border border-neutral-700 bg-black/30 px-3 py-1 text-xs font-bold text-neutral-300">
                            {alignment.gapCount} required gap{alignment.gapCount === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <StatusBox label="Entry status" current={alignment.currentEntryStatus} recommended={alignment.recommendedEntryStatus} />
                        <div className="rounded-xl border border-neutral-800 bg-black/25 p-3">
                          <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">Meaning statuses</p>
                          <div className="mt-2 space-y-1 text-sm text-neutral-300">
                            {alignment.meaningRecommendations.length === 0 ? (
                              <p>No meanings yet.</p>
                            ) : (
                              alignment.meaningRecommendations.map((meaning) => (
                                <p key={meaning.meaningId}>
                                  Meaning {meaning.meaningIndex + 1}: <span className="font-black text-white">{meaning.currentStatus}</span>
                                  {meaning.changed && <span className="text-sky-300"> → {meaning.recommendedStatus}</span>}
                                  {meaning.gapCount > 0 && <span className="text-neutral-500"> · {meaning.gapCount} gaps</span>}
                                </p>
                              ))
                            )}
                          </div>
                        </div>
                      </div>

                      <p className="mt-3 text-sm leading-6 text-neutral-400">
                        {alignment.reasons.join(" ")}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
                      <button
                        type="button"
                        onClick={() => onOpenEntry(entry)}
                        className="rounded-xl border border-neutral-700 px-4 py-3 text-sm font-black text-white transition hover:border-white"
                      >
                        Open entry
                      </button>
                      <button
                        type="button"
                        onClick={() => void applyOne(entry)}
                        disabled={!alignment.hasMismatch || isApplyingAll || Boolean(applyingEntryId)}
                        className="rounded-xl bg-sky-300 px-4 py-3 text-sm font-black text-black transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {applyingEntryId === String(entry.id)
                          ? "Applying..."
                          : alignment.hasMismatch
                            ? "Apply status repair"
                            : "Already aligned"}
                      </button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">{label}</p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{detail}</p>
    </div>
  );
}

function StatusBox({ label, current, recommended }: { label: string; current: string; recommended: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-black/25 p-3">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">{label}</p>
      <p className="mt-2 text-sm text-neutral-300">
        <span className="font-black text-white">{current}</span>
        {current !== recommended && <span className="text-sky-300"> → {recommended}</span>}
      </p>
    </div>
  );
}

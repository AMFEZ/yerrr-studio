"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type { Entry } from "@/types/entry";
import type { PublicEntrySettingsMap } from "@/types/publicPublishing";

type ContentReadyDeclaration = {
  project: "YERRR Studio";
  milestone: "Studio v1.0 Content Ready";
  version: "YERRR Studio";
  declaredAt: string;
  entryCount: number;
  publishingSettingsCount: number;
  privateEntryCount: number;
  publicEntryCount: number;
  featuredEntryCount: number;
  releaseChecklistComplete: boolean;
};

type StudioContentReadyPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  entries?: Entry[];
  settingsByEntryId?: PublicEntrySettingsMap;
  onOpenReleaseDashboard?: () => void;
};

const RELEASE_CHECKLIST_STORAGE_KEY =
  "yerrr-studio-alpha-5-16-release-checklist";

const DECLARATION_STORAGE_KEY =
  "yerrr-studio-v1-content-ready-declaration";

const RELEASE_CHECK_IDS = [
  "production-build",
  "ai-launchers",
  "ai-no-auto-writes",
  "auth-workflow",
  "backup-export",
  "restore-plan",
  "mobile-layout",
  "production-deploy",
  "browser-console",
  "rls-review",
] as const;

function readStoredObject(
  key: string,
): Record<string, unknown> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const stored =
      window.localStorage.getItem(key);

    if (!stored) {
      return {};
    }

    const parsed: unknown =
      JSON.parse(stored);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {};
    }

    return parsed as Record<
      string,
      unknown
    >;
  } catch {
    return {};
  }
}

function readStoredDeclaration():
  ContentReadyDeclaration | null {
  const stored = readStoredObject(
    DECLARATION_STORAGE_KEY,
  );

  if (
    stored.project !== "YERRR Studio" ||
    stored.milestone !==
      "Studio v1.0 Content Ready" ||
    typeof stored.declaredAt !==
      "string"
  ) {
    return null;
  }

  return stored as unknown as ContentReadyDeclaration;
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle: "long",
      timeStyle: "short",
    },
  ).format(date);
}

export function StudioContentReadyPanel({
  isOpen,
  onClose,
  entries = [],
  settingsByEntryId = {},
  onOpenReleaseDashboard,
}: StudioContentReadyPanelProps) {
  const [
    releaseChecklistState,
    setReleaseChecklistState,
  ] = useState<
    Record<string, unknown>
  >({});

  const [
    declaration,
    setDeclaration,
  ] =
    useState<ContentReadyDeclaration | null>(
      null,
    );

  const [
    confirmedReleaseChecks,
    setConfirmedReleaseChecks,
  ] = useState(false);

  const [
    confirmedBackup,
    setConfirmedBackup,
  ] = useState(false);

  const [
    confirmedContentPhase,
    setConfirmedContentPhase,
  ] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setReleaseChecklistState(
      readStoredObject(
        RELEASE_CHECKLIST_STORAGE_KEY,
      ),
    );

    setDeclaration(
      readStoredDeclaration(),
    );
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

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
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [isOpen, onClose]);

  const releaseChecklistComplete =
    useMemo(
      () =>
        RELEASE_CHECK_IDS.every(
          (checkId) =>
            releaseChecklistState[
              checkId
            ] === true,
        ),
      [releaseChecklistState],
    );

  const releaseChecklistCount =
    useMemo(
      () =>
        RELEASE_CHECK_IDS.filter(
          (checkId) =>
            releaseChecklistState[
              checkId
            ] === true,
        ).length,
      [releaseChecklistState],
    );

  const publishingStats = useMemo(() => {
    const entryIds = new Set(
      entries.map((entry) =>
        String(entry.id),
      ),
    );

    const settings = Object.values(
      settingsByEntryId,
    ).filter((item) =>
      entryIds.has(item.entryId),
    );

    return {
      settingsCount: settings.length,

      privateCount: settings.filter(
        (item) =>
          item.visibility === "private",
      ).length,

      publicCount: settings.filter(
        (item) =>
          item.visibility === "public",
      ).length,

      featuredCount: settings.filter(
        (item) => item.isFeatured,
      ).length,
    };
  }, [
    entries,
    settingsByEntryId,
  ]);

  const publishingCoverageComplete =
    entries.length > 0 &&
    publishingStats.settingsCount ===
      entries.length;

  const confirmationsComplete =
    confirmedReleaseChecks &&
    confirmedBackup &&
    confirmedContentPhase;

  const canDeclare =
    releaseChecklistComplete &&
    publishingCoverageComplete &&
    confirmationsComplete;

  function declareContentReady() {
    if (!canDeclare) {
      return;
    }

    const nextDeclaration:
      ContentReadyDeclaration = {
      project: "YERRR Studio",
      milestone:
        "Studio v1.0 Content Ready",
      version: "YERRR Studio",
      declaredAt:
        new Date().toISOString(),
      entryCount: entries.length,
      publishingSettingsCount:
        publishingStats.settingsCount,
      privateEntryCount:
        publishingStats.privateCount,
      publicEntryCount:
        publishingStats.publicCount,
      featuredEntryCount:
        publishingStats.featuredCount,
      releaseChecklistComplete: true,
    };

    window.localStorage.setItem(
      DECLARATION_STORAGE_KEY,
      JSON.stringify(
        nextDeclaration,
      ),
    );

    setDeclaration(nextDeclaration);
  }

  function clearDeclaration() {
    const confirmed =
      window.confirm(
        "Remove the local Content Ready declaration?",
      );

    if (!confirmed) {
      return;
    }

    window.localStorage.removeItem(
      DECLARATION_STORAGE_KEY,
    );

    setDeclaration(null);
  }

  function downloadDeclaration() {
    if (!declaration) {
      return;
    }

    const blob = new Blob(
      [
        JSON.stringify(
          declaration,
          null,
          2,
        ),
      ],
      {
        type: "application/json",
      },
    );

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;
    link.download =
      "yerrr-studio-v1-content-ready.json";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close Content Ready Milestone"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="content-ready-title"
        className="absolute bottom-0 right-0 flex max-h-[96vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-neutral-800 bg-neutral-950 shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-h-none md:max-w-5xl md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0"
      >
        <header className="shrink-0 border-b border-neutral-800 bg-neutral-950/95 p-5 backdrop-blur sm:p-6">
          <div className="flex items-start justify-between gap-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
<span className="rounded-full border border-green-400/20 bg-green-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-green-200">
                  Final Studio Milestone
                </span>
              </div>

              <h2
                id="content-ready-title"
                className="mt-3 text-2xl font-black text-white sm:text-3xl"
              >
                Studio v1.0 Content Ready
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
                Complete the final release confirmation,
                freeze the internal CMS milestone, and
                begin filling the full YERRR lexicon.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 font-black text-neutral-300"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {declaration ? (
            <section className="rounded-3xl border border-green-400/30 bg-green-400/10 p-6">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-green-300">
                Milestone Declared
              </p>

              <h3 className="mt-3 text-3xl font-black text-white">
                YERRR Studio is Content Ready
              </h3>

              <p className="mt-3 leading-7 text-green-100/70">
                The internal CMS milestone was declared
                on {formatDate(declaration.declaredAt)}.
                The next phase is completing, reviewing,
                and publishing the lexicon content.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-2xl border border-green-400/20 bg-black/20 p-4">
                  <p className="text-xs font-black uppercase text-green-200/60">
                    Entries
                  </p>

                  <p className="mt-2 text-3xl font-black text-white">
                    {declaration.entryCount}
                  </p>
                </div>

                <div className="rounded-2xl border border-green-400/20 bg-black/20 p-4">
                  <p className="text-xs font-black uppercase text-green-200/60">
                    Private
                  </p>

                  <p className="mt-2 text-3xl font-black text-white">
                    {declaration.privateEntryCount}
                  </p>
                </div>

                <div className="rounded-2xl border border-green-400/20 bg-black/20 p-4">
                  <p className="text-xs font-black uppercase text-green-200/60">
                    Public
                  </p>

                  <p className="mt-2 text-3xl font-black text-white">
                    {declaration.publicEntryCount}
                  </p>
                </div>

                <div className="rounded-2xl border border-green-400/20 bg-black/20 p-4">
                  <p className="text-xs font-black uppercase text-green-200/60">
                    Featured
                  </p>

                  <p className="mt-2 text-3xl font-black text-white">
                    {declaration.featuredEntryCount}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={downloadDeclaration}
                  className="rounded-2xl bg-green-400 px-5 py-3 font-black text-black transition hover:bg-green-300"
                >
                  Download Milestone Record
                </button>

                <button
                  type="button"
                  onClick={clearDeclaration}
                  className="rounded-2xl border border-neutral-700 px-5 py-3 font-black text-neutral-300"
                >
                  Remove Local Declaration
                </button>
              </div>
            </section>
          ) : (
            <>
              <section className="grid gap-3 sm:grid-cols-3">
                <article
                  className={`rounded-3xl border p-5 ${
                    releaseChecklistComplete
                      ? "border-green-400/25 bg-green-400/10"
                      : "border-yellow-400/25 bg-yellow-400/10"
                  }`}
                >
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-400">
                    Release checklist
                  </p>

                  <p className="mt-3 text-3xl font-black text-white">
                    {releaseChecklistCount}/
                    {RELEASE_CHECK_IDS.length}
                  </p>

                  <p className="mt-2 text-sm text-neutral-400">
                    {releaseChecklistComplete
                      ? "All manual checks complete."
                      : "Finish the Release dashboard checklist."}
                  </p>
                </article>

                <article
                  className={`rounded-3xl border p-5 ${
                    publishingCoverageComplete
                      ? "border-green-400/25 bg-green-400/10"
                      : "border-red-400/25 bg-red-400/10"
                  }`}
                >
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-400">
                    Publishing coverage
                  </p>

                  <p className="mt-3 text-3xl font-black text-white">
                    {publishingStats.settingsCount}/
                    {entries.length}
                  </p>

                  <p className="mt-2 text-sm text-neutral-400">
                    {publishingCoverageComplete
                      ? "Every entry has publishing metadata."
                      : "Publishing settings are missing for one or more entries."}
                  </p>
                </article>

                <article className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                    Current visibility
                  </p>

                  <p className="mt-3 text-3xl font-black text-white">
                    {publishingStats.privateCount}
                  </p>

                  <p className="mt-2 text-sm text-neutral-500">
                    Private entries before the content
                    completion phase.
                  </p>
                </article>
              </section>

              {!releaseChecklistComplete && (
                <section className="mt-5 rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-5">
                  <p className="font-black text-yellow-100">
                    Release checklist is incomplete
                  </p>

                  <p className="mt-2 text-sm leading-6 text-yellow-100/70">
                    Return to the Release dashboard and
                    complete all ten manual QA checks
                    before declaring the milestone.
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenReleaseDashboard?.();
                    }}
                    disabled={!onOpenReleaseDashboard}
                    className="mt-4 rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-black text-black disabled:opacity-40"
                  >
                    Open Release Dashboard
                  </button>
                </section>
              )}

              <section className="mt-5 rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
                  Final confirmation
                </p>

                <div className="mt-4 space-y-3">
                  <label className="flex cursor-pointer items-start gap-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                    <input
                      type="checkbox"
                      checked={confirmedReleaseChecks}
                      onChange={(event) =>
                        setConfirmedReleaseChecks(
                          event.target.checked,
                        )
                      }
                      className="mt-1 h-5 w-5 accent-green-400"
                    />

                    <span>
                      <span className="font-black text-white">
                        Release dashboard reviewed
                      </span>

                      <span className="mt-1 block text-sm leading-6 text-neutral-500">
                        All required automatic checks pass
                        and the production build succeeds.
                      </span>
                    </span>
                  </label>

                  <label className="flex cursor-pointer items-start gap-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                    <input
                      type="checkbox"
                      checked={confirmedBackup}
                      onChange={(event) =>
                        setConfirmedBackup(
                          event.target.checked,
                        )
                      }
                      className="mt-1 h-5 w-5 accent-green-400"
                    />

                    <span>
                      <span className="font-black text-white">
                        Current backup secured
                      </span>

                      <span className="mt-1 block text-sm leading-6 text-neutral-500">
                        A current lexicon backup and release
                        report have been downloaded.
                      </span>
                    </span>
                  </label>

                  <label className="flex cursor-pointer items-start gap-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                    <input
                      type="checkbox"
                      checked={confirmedContentPhase}
                      onChange={(event) =>
                        setConfirmedContentPhase(
                          event.target.checked,
                        )
                      }
                      className="mt-1 h-5 w-5 accent-green-400"
                    />

                    <span>
                      <span className="font-black text-white">
                        Begin content completion phase
                      </span>

                      <span className="mt-1 block text-sm leading-6 text-neutral-500">
                        Studio feature development is frozen
                        until the lexicon entries and fields
                        are completed.
                      </span>
                    </span>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={declareContentReady}
                  disabled={!canDeclare}
                  className="mt-5 w-full rounded-2xl bg-green-400 px-5 py-4 font-black text-black transition hover:bg-green-300 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Declare Studio v1.0 Content Ready
                </button>

                {!canDeclare && (
                  <p className="mt-3 text-center text-xs text-neutral-600">
                    Complete the release checklist,
                    publishing coverage, and all three
                    confirmations.
                  </p>
                )}
              </section>
            </>
          )}
        </div>

        <footer className="shrink-0 border-t border-neutral-800 bg-neutral-950/95 p-4 text-xs text-neutral-500">
          Alpha 5.16B · Final Studio milestone ·
          Declaration is stored locally in this browser
        </footer>
      </aside>
    </div>
  );
}

export default StudioContentReadyPanel;
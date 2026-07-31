"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useStudioReleaseReadiness } from "@/hooks/useStudioReleaseReadiness";

import type { Entry } from "@/types/entry";

import type { PublicEntrySettingsMap } from "@/types/publicPublishing";

type CheckState =
  | "pass"
  | "warning"
  | "fail"
  | "pending";

type SystemCheck = {
  id: string;
  title: string;
  description: string;
  state: CheckState;
  blocking: boolean;
};

type ManualCheck = {
  id: string;
  title: string;
  description: string;
};

type StudioReleaseReadinessPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  entries?: Entry[];
  settingsByEntryId?: PublicEntrySettingsMap;
};

const STORAGE_KEY =
  "yerrr-studio-alpha-5-16-release-checklist";

const MANUAL_CHECKS: ManualCheck[] = [
  {
    id: "production-build",
    title: "Production build passes",
    description:
      "npm run build completes without compilation or TypeScript errors.",
  },
  {
    id: "ai-launchers",
    title: "All AI launchers tested",
    description:
      "Assistant, missing fields, batch triage, duplicates, and relationships open correctly.",
  },
  {
    id: "ai-no-auto-writes",
    title: "AI automatic writes ruled out",
    description:
      "Generating suggestions does not change Supabase until an explicit approval or save.",
  },
  {
    id: "auth-workflow",
    title: "Login and logout tested",
    description:
      "Protected Studio access, session restoration, logout, and login redirects work.",
  },
  {
    id: "backup-export",
    title: "Backup export tested",
    description:
      "A current backup downloads successfully and contains entries and meanings.",
  },
  {
    id: "restore-plan",
    title: "Restore process documented",
    description:
      "There is a clear recovery plan for restoring data after accidental loss.",
  },
  {
    id: "mobile-layout",
    title: "Mobile Studio tested",
    description:
      "Navigation, editor drawers, AI panels, and dashboards remain usable on a phone.",
  },
  {
    id: "production-deploy",
    title: "Production deployment tested",
    description:
      "The deployed Vercel version loads, authenticates, reads data, and opens the editor.",
  },
  {
    id: "browser-console",
    title: "Console and network reviewed",
    description:
      "No unexpected browser errors, failed API calls, or repeated requests remain.",
  },
  {
    id: "rls-review",
    title: "Supabase RLS reviewed",
    description:
      "Anonymous access remains blocked and authenticated Studio policies behave as expected.",
  },
];

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function hasValue(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some(hasValue);
  }

  if (value && typeof value === "object") {
    return Object.values(
      value as Record<string, unknown>,
    ).some(hasValue);
  }

  return false;
}

function readAlias(
  source: unknown,
  aliases: string[],
): unknown {
  if (!source || typeof source !== "object") {
    return undefined;
  }

  const wantedKeys = new Set(
    aliases.map(normalizeKey),
  );

  for (const [key, value] of Object.entries(
    source as Record<string, unknown>,
  )) {
    if (wantedKeys.has(normalizeKey(key))) {
      return value;
    }
  }

  return undefined;
}

function getMeanings(entry: Entry) {
  return Array.isArray(entry.meanings)
    ? entry.meanings
    : [];
}

function hasCompleteMeaning(
  meaning: unknown,
) {
  const definition = readAlias(
    meaning,
    [
      "definition",
      "meaning",
      "gloss",
    ],
  );

  const example = readAlias(
    meaning,
    [
      "exampleSentence",
      "example_sentence",
      "example",
      "usageExample",
      "usage_example",
    ],
  );

  const partOfSpeech = readAlias(
    meaning,
    [
      "partOfSpeech",
      "part_of_speech",
      "pos",
      "type",
      "grammar",
    ],
  );

  return (
    hasValue(definition) &&
    hasValue(example) &&
    hasValue(partOfSpeech)
  );
}

function isValidSlug(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
    value,
  );
}

function checkStateLabel(
  state: CheckState,
) {
  if (state === "pass") {
    return "Pass";
  }

  if (state === "warning") {
    return "Review";
  }

  if (state === "fail") {
    return "Fail";
  }

  return "Checking";
}

function checkStateClasses(
  state: CheckState,
) {
  if (state === "pass") {
    return "border-green-400/25 bg-green-400/10 text-green-100";
  }

  if (state === "warning") {
    return "border-yellow-400/25 bg-yellow-400/10 text-yellow-100";
  }

  if (state === "fail") {
    return "border-red-400/25 bg-red-400/10 text-red-100";
  }

  return "border-blue-400/25 bg-blue-400/10 text-blue-100";
}

function checkStateIcon(
  state: CheckState,
) {
  if (state === "pass") {
    return "✓";
  }

  if (state === "warning") {
    return "!";
  }

  if (state === "fail") {
    return "✕";
  }

  return "…";
}

function loadManualState() {
  if (typeof window === "undefined") {
    return {} as Record<
      string,
      boolean
    >;
  }

  try {
    const saved =
      window.localStorage.getItem(
        STORAGE_KEY,
      );

    if (!saved) {
      return {};
    }

    const parsed: unknown =
      JSON.parse(saved);

    if (
      !parsed ||
      typeof parsed !== "object"
    ) {
      return {};
    }

    return parsed as Record<
      string,
      boolean
    >;
  } catch {
    return {};
  }
}

export function StudioReleaseReadinessPanel({
  isOpen,
  onClose,
  entries = [],
  settingsByEntryId = {},
}: StudioReleaseReadinessPanelProps) {
  const {
    health,
    database,
    isLoading,
    error,
    refresh,
  } = useStudioReleaseReadiness();

  const [
    manualState,
    setManualState,
  ] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    setManualState(
      loadManualState(),
    );
  }, []);

  useEffect(() => {
    if (
      typeof window === "undefined"
    ) {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(manualState),
    );
  }, [manualState]);

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

  const contentSnapshot =
    useMemo(() => {
      const slugCounts =
        new Map<string, number>();

      let missingSlugCount = 0;
      let invalidSlugCount = 0;
      let noMeaningCount = 0;
      let completeCoreCount = 0;

      entries.forEach((entry) => {
        const slug = String(
          entry.slug ?? "",
        ).trim();

        if (!slug) {
          missingSlugCount += 1;
        } else {
          slugCounts.set(
            slug,
            (slugCounts.get(slug) ??
              0) + 1,
          );

          if (!isValidSlug(slug)) {
            invalidSlugCount += 1;
          }
        }

        const meanings =
          getMeanings(entry);

        if (meanings.length === 0) {
          noMeaningCount += 1;
        }

        const coreComplete =
          Boolean(
            String(
              entry.word ?? "",
            ).trim(),
          ) &&
          Boolean(slug) &&
          meanings.length > 0 &&
          meanings.every(
            hasCompleteMeaning,
          );

        if (coreComplete) {
          completeCoreCount += 1;
        }
      });

      const duplicateSlugCount =
        Array.from(
          slugCounts.values(),
        ).filter(
          (count) => count > 1,
        ).length;

      const settingsValues =
        Object.values(
          settingsByEntryId,
        );

      return {
        totalEntries: entries.length,
        coreCompleteCount: completeCoreCount,
        missingSlugCount,
        invalidSlugCount,
        duplicateSlugCount,
        noMeaningCount,

        publicCount:
          settingsValues.filter(
            (settings) =>
              settings.visibility ===
              "public",
          ).length,

        privateCount:
          settingsValues.filter(
            (settings) =>
              settings.visibility ===
              "private",
          ).length,

        featuredCount:
          settingsValues.filter(
            (settings) =>
              settings.isFeatured,
          ).length,

        localSettingsCount:
          settingsValues.length,
      };
    }, [
      entries,
      settingsByEntryId,
    ]);

  const systemChecks =
    useMemo<SystemCheck[]>(() => {
      const pending = isLoading;

      const healthAvailable =
        Boolean(health);

      const settingsCoverage =
        entries.length > 0 &&
        contentSnapshot.localSettingsCount ===
          entries.length;

      const databaseCountMatches =
        database.entryCount !== null &&
        database.entryCount ===
          entries.length;

      const publishingCountMatches =
        database.entryCount !== null &&
        database.publishingSettingsCount !==
          null &&
        database.entryCount ===
          database.publishingSettingsCount;

      const anonymousVisibility =
        health?.checks
          .publishingAnonVisible;

      return [
        {
          id: "health-route",
          title:
            "Studio health route responds",
          description:
            "The internal production-readiness API can run successfully.",
          state: pending
            ? "pending"
            : healthAvailable
              ? "pass"
              : "fail",
          blocking: true,
        },
        {
          id: "supabase-environment",
          title:
            "Supabase environment configured",
          description:
            "The public Supabase URL and anonymous browser key are present.",
          state: pending
            ? "pending"
            : health?.checks
                  .supabaseUrlConfigured &&
                health.checks
                  .supabaseAnonKeyConfigured
              ? "pass"
              : "fail",
          blocking: true,
        },
        {
          id: "openai-environment",
          title:
            "OpenAI API key configured",
          description:
            "Server-side AI routes have access to the OpenAI API key.",
          state: pending
            ? "pending"
            : health?.checks
                  .openAIKeyConfigured
              ? "pass"
              : "fail",
          blocking: true,
        },
        {
          id: "authenticated-session",
          title:
            "Authenticated Studio session",
          description:
            database.authenticatedUserEmail
              ? `Signed in as ${database.authenticatedUserEmail}.`
              : "No authenticated Studio user was detected.",
          state: pending
            ? "pending"
            : database.isAuthenticated
              ? "pass"
              : "fail",
          blocking: true,
        },
        {
          id: "entries-readable",
          title:
            "Entries table is readable",
          description:
            database.entryCount === null
              ? "Unable to count database entries."
              : `${database.entryCount} entries are readable through the authenticated session.`,
          state: pending
            ? "pending"
            : database.entriesReadable
              ? "pass"
              : "fail",
          blocking: true,
        },
        {
          id: "publishing-readable",
          title:
            "Publishing settings are readable",
          description:
            database.publishingSettingsCount ===
            null
              ? "Unable to count publishing settings."
              : `${database.publishingSettingsCount} publishing settings are readable.`,
          state: pending
            ? "pending"
            : database
                  .publishingSettingsReadable
              ? "pass"
              : "fail",
          blocking: true,
        },
        {
          id: "entry-count-sync",
          title:
            "Client and database entry counts match",
          description:
            database.entryCount === null
              ? "The database count is unavailable."
              : `Studio loaded ${entries.length}; Supabase reports ${database.entryCount}.`,
          state: pending
            ? "pending"
            : databaseCountMatches
              ? "pass"
              : "warning",
          blocking: false,
        },
        {
          id: "publishing-coverage",
          title:
            "Every entry has publishing metadata",
          description:
            `${contentSnapshot.localSettingsCount} settings loaded for ${entries.length} entries.`,
          state: pending
            ? "pending"
            : settingsCoverage &&
                publishingCountMatches
              ? "pass"
              : "fail",
          blocking: true,
        },
        {
          id: "anonymous-publishing-access",
          title:
            "Anonymous publishing access blocked",
          description:
            anonymousVisibility === false
              ? "The anonymous key could not read publishing rows."
              : anonymousVisibility === true
                ? "Publishing rows appear readable without authentication."
                : "Anonymous publishing access could not be conclusively tested.",
          state: pending
            ? "pending"
            : anonymousVisibility === false
              ? "pass"
              : anonymousVisibility === true
                ? "fail"
                : "warning",
          blocking: true,
        },
        {
          id: "runtime-environment",
          title:
            "Production runtime detected",
          description: health
            ? `Current runtime: ${health.environment}.`
            : "Runtime environment is unavailable.",
          state: pending
            ? "pending"
            : health?.environment ===
                "production"
              ? "pass"
              : "warning",
          blocking: false,
        },
        {
          id: "app-url",
          title:
            "Production app URL configured",
          description:
            "NEXT_PUBLIC_APP_URL or VERCEL_URL is available to the server.",
          state: pending
            ? "pending"
            : health?.checks
                  .appUrlConfigured
              ? "pass"
              : "warning",
          blocking: false,
        },
      ];
    }, [
      contentSnapshot
        .localSettingsCount,
      database,
      entries.length,
      health,
      isLoading,
    ]);

  const blockingSystemChecks =
    systemChecks.filter(
      (check) => check.blocking,
    );

  const blockingPassCount =
    blockingSystemChecks.filter(
      (check) =>
        check.state === "pass",
    ).length;

  const manualCompleteCount =
    MANUAL_CHECKS.filter(
      (check) =>
        manualState[check.id] === true,
    ).length;

  const totalReleaseChecks =
    blockingSystemChecks.length +
    MANUAL_CHECKS.length;

  const completedReleaseChecks =
    blockingPassCount +
    manualCompleteCount;

  const releaseScore =
    totalReleaseChecks > 0
      ? Math.round(
          (completedReleaseChecks /
            totalReleaseChecks) *
            100,
        )
      : 0;

  const blockingFailureCount =
    blockingSystemChecks.filter(
      (check) =>
        check.state === "fail",
    ).length;

  const manualRemaining =
    MANUAL_CHECKS.length -
    manualCompleteCount;

  const isReleaseReady =
    blockingFailureCount === 0 &&
    blockingPassCount ===
      blockingSystemChecks.length &&
    manualRemaining === 0;

  function toggleManualCheck(
    checkId: string,
  ) {
    setManualState(
      (currentState) => ({
        ...currentState,
        [checkId]:
          !currentState[checkId],
      }),
    );
  }

  function resetManualChecklist() {
    const confirmed =
      window.confirm(
        "Reset every manual Alpha 5.16 release check?",
      );

    if (!confirmed) {
      return;
    }

    setManualState({});
  }

  function downloadReport() {
    const report = {
      project: "YERRR Studio",
      version: "YERRR Studio",
      generatedAt:
        new Date().toISOString(),
      releaseScore,
      isReleaseReady,
      blockingFailureCount,
      manualRemaining,
      systemChecks,
      manualChecks:
        MANUAL_CHECKS.map(
          (check) => ({
            ...check,
            complete:
              manualState[
                check.id
              ] === true,
          }),
        ),
      contentSnapshot,
      health,
      database,
    };

    const blob = new Blob(
      [
        JSON.stringify(
          report,
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
      "yerrr-studio-alpha-5-16-release-report.json";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close Studio Release Readiness"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="release-readiness-title"
        className="absolute bottom-0 right-0 flex max-h-[96vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-neutral-800 bg-neutral-950 shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-h-none md:max-w-6xl md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0"
      >
        <header className="shrink-0 border-b border-neutral-800 bg-neutral-950/95 p-5 backdrop-blur sm:p-6">
          <div className="flex items-start justify-between gap-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
<span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-200">
                  Release Candidate
                </span>

                <span className="rounded-full border border-green-400/20 bg-green-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-green-200">
                  No database writes
                </span>
              </div>

              <h2
                id="release-readiness-title"
                className="mt-3 text-2xl font-black text-white sm:text-3xl"
              >
                Studio Release Readiness
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
                Verify the internal CMS, security,
                environment, publishing metadata,
                backup workflow, mobile experience,
                and final production QA.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-black text-neutral-300 transition hover:border-neutral-700 hover:text-white"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <section
            className={`rounded-3xl border p-5 sm:p-6 ${
              isReleaseReady
                ? "border-green-400/30 bg-green-400/10"
                : blockingFailureCount > 0
                  ? "border-red-400/30 bg-red-400/10"
                  : "border-yellow-400/30 bg-yellow-400/10"
            }`}
          >
            <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-400">
                  Release readiness
                </p>

                <div className="mt-3 flex items-end gap-3">
                  <p className="text-5xl font-black text-white">
                    {releaseScore}%
                  </p>

                  <p className="pb-1 text-sm text-neutral-400">
                    {completedReleaseChecks}/
                    {totalReleaseChecks} final
                    checks
                  </p>
                </div>

                <div className="mt-4 h-3 w-full max-w-xl overflow-hidden rounded-full bg-black/30">
                  <div
                    className="h-full rounded-full bg-yellow-400 transition-all"
                    style={{
                      width: `${releaseScore}%`,
                    }}
                  />
                </div>
              </div>

              <div className="xl:max-w-md">
                <p className="text-xl font-black text-white">
                  {isReleaseReady
                    ? "Studio is ready for the Content Ready milestone."
                    : blockingFailureCount >
                        0
                      ? `${blockingFailureCount} blocking system check${
                          blockingFailureCount ===
                          1
                            ? ""
                            : "s"
                        } must be fixed.`
                      : `${manualRemaining} manual QA check${
                          manualRemaining ===
                          1
                            ? ""
                            : "s"
                        } remain.`}
                </p>

                <p className="mt-2 text-sm leading-6 text-neutral-400">
                  Lexicon content completion is
                  tracked separately and does not
                  prevent the Studio CMS itself
                  from reaching v1.0 Content
                  Ready.
                </p>
              </div>
            </div>
          </section>

          {error && (
            <section className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm leading-6 text-red-100">
              {error}
            </section>
          )}

          <section className="mt-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
                  Automatic system checks
                </p>

                <h3 className="mt-2 text-xl font-black text-white">
                  Environment and database
                </h3>
              </div>

              <button
                type="button"
                onClick={() =>
                  void refresh()
                }
                disabled={isLoading}
                className="rounded-2xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-black text-neutral-300 transition hover:border-cyan-400 hover:text-cyan-200 disabled:opacity-40"
              >
                {isLoading
                  ? "Checking..."
                  : "↻ Run Checks Again"}
              </button>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {systemChecks.map(
                (check) => (
                  <article
                    key={check.id}
                    className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5"
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-lg font-black ${checkStateClasses(
                          check.state,
                        )}`}
                      >
                        {checkStateIcon(
                          check.state,
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black text-white">
                            {check.title}
                          </p>

                          <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${checkStateClasses(
                              check.state,
                            )}`}
                          >
                            {checkStateLabel(
                              check.state,
                            )}
                          </span>

                          {check.blocking && (
                            <span className="rounded-full border border-red-400/20 bg-red-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-red-200">
                              Required
                            </span>
                          )}
                        </div>

                        <p className="mt-2 text-sm leading-6 text-neutral-500">
                          {check.description}
                        </p>
                      </div>
                    </div>
                  </article>
                ),
              )}
            </div>
          </section>

          <section className="mt-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
                  Manual final QA
                </p>

                <h3 className="mt-2 text-xl font-black text-white">
                  {manualCompleteCount}/
                  {MANUAL_CHECKS.length} complete
                </h3>
              </div>

              <button
                type="button"
                onClick={resetManualChecklist}
                className="rounded-2xl border border-neutral-700 px-4 py-3 text-sm font-black text-neutral-400 transition hover:text-white"
              >
                Reset Checklist
              </button>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {MANUAL_CHECKS.map(
                (check) => {
                  const complete =
                    manualState[
                      check.id
                    ] === true;

                  return (
                    <label
                      key={check.id}
                      className={`flex cursor-pointer items-start gap-4 rounded-3xl border p-5 transition ${
                        complete
                          ? "border-green-400/25 bg-green-400/10"
                          : "border-neutral-800 bg-neutral-900 hover:border-neutral-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={complete}
                        onChange={() =>
                          toggleManualCheck(
                            check.id,
                          )
                        }
                        className="mt-1 h-5 w-5 accent-green-400"
                      />

                      <span>
                        <span className="font-black text-white">
                          {check.title}
                        </span>

                        <span className="mt-2 block text-sm leading-6 text-neutral-500">
                          {
                            check.description
                          }
                        </span>
                      </span>
                    </label>
                  );
                },
              )}
            </div>
          </section>

          <section className="mt-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
              Content snapshot
            </p>

            <h3 className="mt-2 text-xl font-black text-white">
              Lexicon progress after Studio
              release
            </h3>

            <p className="mt-2 text-sm leading-6 text-neutral-500">
              These numbers guide your entry-filling
              phase. They do not block the Studio
              Content Ready milestone.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-neutral-500">
                  Total entries
                </p>

                <p className="mt-2 text-3xl font-black text-white">
                  {
                    contentSnapshot.totalEntries
                  }
                </p>
              </div>

              <div className="rounded-2xl border border-green-400/20 bg-green-400/10 p-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-green-200/70">
                  Core complete
                </p>

                <p className="mt-2 text-3xl font-black text-green-100">
                  {
                    contentSnapshot.coreCompleteCount
                  }
                </p>
              </div>

              <div className="rounded-2xl border border-purple-400/20 bg-purple-400/10 p-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-purple-200/70">
                  Public
                </p>

                <p className="mt-2 text-3xl font-black text-purple-100">
                  {
                    contentSnapshot.publicCount
                  }
                </p>
              </div>

              <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-yellow-200/70">
                  Featured
                </p>

                <p className="mt-2 text-3xl font-black text-yellow-100">
                  {
                    contentSnapshot.featuredCount
                  }
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-neutral-500">
                  Missing slugs
                </p>

                <p className="mt-2 text-2xl font-black text-white">
                  {
                    contentSnapshot.missingSlugCount
                  }
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-neutral-500">
                  Invalid slugs
                </p>

                <p className="mt-2 text-2xl font-black text-white">
                  {
                    contentSnapshot.invalidSlugCount
                  }
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-neutral-500">
                  Duplicate slugs
                </p>

                <p className="mt-2 text-2xl font-black text-white">
                  {
                    contentSnapshot.duplicateSlugCount
                  }
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-neutral-500">
                  No meanings
                </p>

                <p className="mt-2 text-2xl font-black text-white">
                  {
                    contentSnapshot.noMeaningCount
                  }
                </p>
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-black text-white">
                  Release report
                </p>

                <p className="mt-1 text-sm leading-6 text-neutral-500">
                  Download the current automatic
                  results, manual checklist, and
                  content snapshot as JSON.
                </p>
              </div>

              <button
                type="button"
                onClick={downloadReport}
                className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-black text-black transition hover:bg-cyan-300"
              >
                Download Release Report
              </button>
            </div>
          </section>
        </div>

        <footer className="shrink-0 border-t border-neutral-800 bg-neutral-950/95 p-4 text-xs text-neutral-500 backdrop-blur sm:px-6">
          Alpha 5.16A · Studio Release
          Readiness · Checklist is stored locally
          in this browser
        </footer>
      </aside>
    </div>
  );
}

export default StudioReleaseReadinessPanel;
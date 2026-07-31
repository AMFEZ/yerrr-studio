"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type { Entry } from "@/types/entry";

import type {
  PublicEntrySettings,
  PublicEntrySettingsInput,
  PublicEntrySettingsMap,
  PublicVisibility,
} from "@/types/publicPublishing";

type PublishingFilter =
  | "all"
  | "private"
  | "public"
  | "featured"
  | "ordered"
  | "unordered";

type PublishingDraft = {
  visibility: PublicVisibility;
  isFeatured: boolean;
  displayOrder: string;
  publicTitle: string;
  publicSummary: string;
};

type PublicPublishingControlsPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  entries?: Entry[];
  settingsByEntryId?: PublicEntrySettingsMap;
  isLoading?: boolean;
  savingEntryId?: string | null;
  error?: string;
  onSaveSettings: (
    input: PublicEntrySettingsInput,
  ) => Promise<PublicEntrySettings>;
  onRefresh?: () => void | Promise<void>;
  onOpenEntry?: (entry: Entry) => void;
};

const FILTER_OPTIONS: Array<{
  value: PublishingFilter;
  label: string;
}> = [
  {
    value: "all",
    label: "All entries",
  },
  {
    value: "private",
    label: "Private",
  },
  {
    value: "public",
    label: "Public",
  },
  {
    value: "featured",
    label: "Featured",
  },
  {
    value: "ordered",
    label: "Display order assigned",
  },
  {
    value: "unordered",
    label: "No display order",
  },
];

function normalizeSearch(
  value: unknown,
) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createDefaultDraft():
  PublishingDraft {
  return {
    visibility: "private",
    isFeatured: false,
    displayOrder: "",
    publicTitle: "",
    publicSummary: "",
  };
}

function settingsToDraft(
  settings:
    | PublicEntrySettings
    | undefined,
): PublishingDraft {
  if (!settings) {
    return createDefaultDraft();
  }

  return {
    visibility:
      settings.visibility,
    isFeatured:
      settings.isFeatured,
    displayOrder:
      settings.displayOrder === null
        ? ""
        : String(
            settings.displayOrder,
          ),
    publicTitle:
      settings.publicTitle,
    publicSummary:
      settings.publicSummary,
  };
}

function matchesFilter(
  settings:
    | PublicEntrySettings
    | undefined,
  filter: PublishingFilter,
) {
  const visibility =
    settings?.visibility ??
    "private";

  if (filter === "all") {
    return true;
  }

  if (filter === "private") {
    return visibility === "private";
  }

  if (filter === "public") {
    return visibility === "public";
  }

  if (filter === "featured") {
    return settings?.isFeatured === true;
  }

  if (filter === "ordered") {
    return (
      typeof settings?.displayOrder ===
      "number"
    );
  }

  if (filter === "unordered") {
    return (
      settings?.displayOrder === null ||
      settings?.displayOrder ===
        undefined
    );
  }

  return true;
}

function formatDate(
  value: string | null,
) {
  if (!value) {
    return "Not published";
  }

  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
  ).format(date);
}

export function PublicPublishingControlsPanel({
  isOpen,
  onClose,
  entries = [],
  settingsByEntryId = {},
  isLoading = false,
  savingEntryId = null,
  error = "",
  onSaveSettings,
  onRefresh,
  onOpenEntry,
}: PublicPublishingControlsPanelProps) {
  const [query, setQuery] =
    useState("");

  const [filter, setFilter] =
    useState<PublishingFilter>(
      "all",
    );

  const [
    selectedEntryId,
    setSelectedEntryId,
  ] = useState("");

  const [draft, setDraft] =
    useState<PublishingDraft>(
      createDefaultDraft,
    );

  const [
    localError,
    setLocalError,
  ] = useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const visibleEntries =
    useMemo(() => {
      const normalizedQuery =
        normalizeSearch(query);

      return entries
        .filter((entry) => {
          const entryId = String(
            entry.id,
          );

          const settings =
            settingsByEntryId[
              entryId
            ];

          if (
            !matchesFilter(
              settings,
              filter,
            )
          ) {
            return false;
          }

          if (!normalizedQuery) {
            return true;
          }

          const searchable =
            normalizeSearch(
              [
                entry.word,
                entry.slug,
                entry.status,
                settings?.visibility,
                settings?.publicTitle,
                settings?.publicSummary,
              ].join(" "),
            );

          return searchable.includes(
            normalizedQuery,
          );
        })
        .sort((a, b) => {
          const aSettings =
            settingsByEntryId[
              String(a.id)
            ];

          const bSettings =
            settingsByEntryId[
              String(b.id)
            ];

          const aOrder =
            aSettings?.displayOrder;

          const bOrder =
            bSettings?.displayOrder;

          if (
            typeof aOrder ===
              "number" &&
            typeof bOrder ===
              "number" &&
            aOrder !== bOrder
          ) {
            return aOrder - bOrder;
          }

          if (
            typeof aOrder ===
              "number" &&
            typeof bOrder !==
              "number"
          ) {
            return -1;
          }

          if (
            typeof bOrder ===
              "number" &&
            typeof aOrder !==
              "number"
          ) {
            return 1;
          }

          return String(
            a.word,
          ).localeCompare(
            String(b.word),
          );
        });
    }, [
      entries,
      filter,
      query,
      settingsByEntryId,
    ]);

  const selectedEntry =
    useMemo(
      () =>
        entries.find(
          (entry) =>
            String(entry.id) ===
            selectedEntryId,
        ) ?? null,
      [entries, selectedEntryId],
    );

  const selectedSettings =
    selectedEntryId
      ? settingsByEntryId[
          selectedEntryId
        ]
      : undefined;

  const stats = useMemo(() => {
    const entryIds = entries.map(
      (entry) => String(entry.id),
    );

    return {
      total: entryIds.length,

      public: entryIds.filter(
        (entryId) =>
          settingsByEntryId[
            entryId
          ]?.visibility ===
          "public",
      ).length,

      private: entryIds.filter(
        (entryId) =>
          settingsByEntryId[
            entryId
          ]?.visibility !==
          "public",
      ).length,

      featured: entryIds.filter(
        (entryId) =>
          settingsByEntryId[
            entryId
          ]?.isFeatured === true,
      ).length,
    };
  }, [
    entries,
    settingsByEntryId,
  ]);

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

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const selectedStillExists =
      entries.some(
        (entry) =>
          String(entry.id) ===
          selectedEntryId,
      );

    if (
      selectedStillExists
    ) {
      return;
    }

    setSelectedEntryId(
      visibleEntries[0]
        ? String(
            visibleEntries[0].id,
          )
        : "",
    );
  }, [
    entries,
    isOpen,
    selectedEntryId,
    visibleEntries,
  ]);

  useEffect(() => {
    setDraft(
      settingsToDraft(
        selectedSettings,
      ),
    );

    setLocalError("");
    setSuccessMessage("");
  }, [
    selectedEntryId,
    selectedSettings,
  ]);

  async function save() {
    if (!selectedEntry) {
      return;
    }

    setLocalError("");
    setSuccessMessage("");

    let displayOrder:
      | number
      | null = null;

    if (
      draft.displayOrder.trim()
    ) {
      const parsedOrder =
        Number(
          draft.displayOrder,
        );

      if (
        !Number.isInteger(
          parsedOrder,
        ) ||
        parsedOrder < 0
      ) {
        setLocalError(
          "Display order must be a whole number of 0 or greater.",
        );

        return;
      }

      displayOrder =
        parsedOrder;
    }

    if (
      draft.visibility ===
        "public" &&
      selectedSettings
        ?.visibility !== "public"
    ) {
      const confirmed =
        window.confirm(
          `Make "${selectedEntry.word}" public?\n\nThis only changes its publishing metadata. The public-facing app and anonymous API are not active yet.`,
        );

      if (!confirmed) {
        return;
      }
    }

    try {
      await onSaveSettings({
        entryId: String(
          selectedEntry.id,
        ),
        visibility:
          draft.visibility,
        isFeatured:
          draft.isFeatured,
        displayOrder,
        publicTitle:
          draft.publicTitle,
        publicSummary:
          draft.publicSummary,
      });

      setSuccessMessage(
        `"${selectedEntry.word}" publishing settings were saved.`,
      );
    } catch (saveError) {
      setLocalError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save publishing settings.",
      );
    }
  }

  if (!isOpen) {
    return null;
  }

  const isSaving =
    savingEntryId ===
    selectedEntryId;

  return (
    <div className="fixed inset-0 z-[105] bg-black/80 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close Public Publishing Controls"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="publishing-controls-title"
        className="absolute bottom-0 right-0 flex max-h-[96vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-neutral-800 bg-neutral-950 shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-h-none md:max-w-6xl md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0"
      >
        <header className="shrink-0 border-b border-neutral-800 bg-neutral-950/95 p-5 backdrop-blur sm:p-6">
          <div className="flex items-start justify-between gap-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
<span className="rounded-full border border-purple-400/20 bg-purple-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-purple-200">
                  Publishing Controls
                </span>

                <span className="rounded-full border border-green-400/20 bg-green-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-green-200">
                  Explicit saves only
                </span>
              </div>

              <h2
                id="publishing-controls-title"
                className="mt-3 text-2xl font-black text-white sm:text-3xl"
              >
                Public Publishing Controls
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
                Decide which entries remain private,
                which are eligible for the future
                public app, and how public entries
                should be presented.
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

        <div className="flex-1 overflow-hidden p-4 sm:p-6">
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <button
              type="button"
              onClick={() =>
                setFilter("all")
              }
              className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-left"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                Total
              </p>

              <p className="mt-2 text-3xl font-black text-white">
                {stats.total}
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                setFilter("private")
              }
              className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-left transition hover:border-neutral-600"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                Private
              </p>

              <p className="mt-2 text-3xl font-black text-neutral-200">
                {stats.private}
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                setFilter("public")
              }
              className="rounded-2xl border border-green-400/20 bg-green-400/10 p-4 text-left transition hover:border-green-400/50"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-green-200/70">
                Public
              </p>

              <p className="mt-2 text-3xl font-black text-green-100">
                {stats.public}
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                setFilter("featured")
              }
              className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-left transition hover:border-yellow-400/50"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-yellow-200/70">
                Featured
              </p>

              <p className="mt-2 text-3xl font-black text-yellow-100">
                {stats.featured}
              </p>
            </button>
          </section>

          <section className="mt-4 flex h-[calc(100%-7.5rem)] min-h-0 flex-col overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900 lg:flex-row">
            <div className="flex min-h-0 flex-col border-b border-neutral-800 lg:w-[38%] lg:border-b-0 lg:border-r">
              <div className="space-y-3 border-b border-neutral-800 p-4">
                <input
                  value={query}
                  onChange={(event) =>
                    setQuery(
                      event.target.value,
                    )
                  }
                  placeholder="Search entries..."
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-purple-400"
                />

                <div className="flex gap-2">
                  <select
                    value={filter}
                    onChange={(event) =>
                      setFilter(
                        event.target
                          .value as PublishingFilter,
                      )
                    }
                    className="min-w-0 flex-1 rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-purple-400"
                  >
                    {FILTER_OPTIONS.map(
                      (option) => (
                        <option
                          key={
                            option.value
                          }
                          value={
                            option.value
                          }
                        >
                          {option.label}
                        </option>
                      ),
                    )}
                  </select>

                  <button
                    type="button"
                    onClick={() =>
                      void onRefresh?.()
                    }
                    disabled={isLoading}
                    className="rounded-2xl border border-neutral-700 bg-neutral-950 px-4 text-sm font-black text-neutral-300 disabled:opacity-40"
                  >
                    ↻
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {visibleEntries.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-neutral-700 p-6 text-center">
                    <p className="font-black text-white">
                      No entries found
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {visibleEntries.map(
                      (entry) => {
                        const entryId =
                          String(
                            entry.id,
                          );

                        const settings =
                          settingsByEntryId[
                            entryId
                          ];

                        const isSelected =
                          entryId ===
                          selectedEntryId;

                        return (
                          <button
                            key={entryId}
                            type="button"
                            onClick={() =>
                              setSelectedEntryId(
                                entryId,
                              )
                            }
                            className={`w-full rounded-2xl border p-4 text-left transition ${
                              isSelected
                                ? "border-purple-400 bg-purple-400/10"
                                : "border-neutral-800 bg-neutral-950 hover:border-neutral-700"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-black text-white">
                                  {entry.word}
                                </p>

                                <p className="mt-1 truncate font-mono text-xs text-neutral-500">
                                  /dictionary/
                                  {entry.slug}
                                </p>
                              </div>

                              <span
                                className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
                                  settings?.visibility ===
                                  "public"
                                    ? "border-green-400/20 bg-green-400/10 text-green-200"
                                    : "border-neutral-700 bg-neutral-900 text-neutral-400"
                                }`}
                              >
                                {settings?.visibility ??
                                  "private"}
                              </span>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              {settings?.isFeatured && (
                                <span className="rounded-full bg-yellow-400/10 px-2 py-1 text-[10px] font-black uppercase text-yellow-200">
                                  Featured
                                </span>
                              )}

                              {typeof settings?.displayOrder ===
                                "number" && (
                                <span className="rounded-full bg-blue-400/10 px-2 py-1 text-[10px] font-black uppercase text-blue-200">
                                  Order{" "}
                                  {
                                    settings.displayOrder
                                  }
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      },
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 sm:p-6">
              {!selectedEntry ? (
                <div className="rounded-3xl border border-dashed border-neutral-700 p-8 text-center">
                  <p className="font-black text-white">
                    Select an entry
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-purple-300">
                        Publishing settings
                      </p>

                      <h3 className="mt-2 text-2xl font-black text-white">
                        {
                          selectedEntry.word
                        }
                      </h3>

                      <p className="mt-1 font-mono text-sm text-neutral-500">
                        /dictionary/
                        {
                          selectedEntry.slug
                        }
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenEntry?.(
                          selectedEntry,
                        );
                      }}
                      disabled={!onOpenEntry}
                      className="rounded-2xl border border-neutral-700 px-4 py-3 text-sm font-black text-neutral-300 disabled:opacity-40"
                    >
                      Open Entry Editor
                    </button>
                  </div>

                  <div className="mt-5 rounded-3xl border border-neutral-800 bg-neutral-950 p-5">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                      Public visibility
                    </p>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() =>
                          setDraft(
                            (
                              current,
                            ) => ({
                              ...current,
                              visibility:
                                "private",
                            }),
                          )
                        }
                        className={`rounded-2xl border p-4 text-left transition ${
                          draft.visibility ===
                          "private"
                            ? "border-neutral-400 bg-neutral-800"
                            : "border-neutral-800 bg-neutral-900"
                        }`}
                      >
                        <p className="font-black text-white">
                          🔒 Private
                        </p>

                        <p className="mt-2 text-sm leading-6 text-neutral-500">
                          Keep this entry
                          inside Studio only.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setDraft(
                            (
                              current,
                            ) => ({
                              ...current,
                              visibility:
                                "public",
                            }),
                          )
                        }
                        className={`rounded-2xl border p-4 text-left transition ${
                          draft.visibility ===
                          "public"
                            ? "border-green-400 bg-green-400/10"
                            : "border-neutral-800 bg-neutral-900"
                        }`}
                      >
                        <p className="font-black text-white">
                          🌐 Public
                        </p>

                        <p className="mt-2 text-sm leading-6 text-neutral-500">
                          Allow the future
                          public app to
                          include this entry.
                        </p>
                      </button>
                    </div>
                  </div>

                  <label className="mt-4 flex cursor-pointer items-start gap-4 rounded-3xl border border-neutral-800 bg-neutral-950 p-5">
                    <input
                      type="checkbox"
                      checked={
                        draft.isFeatured
                      }
                      onChange={(event) =>
                        setDraft(
                          (current) => ({
                            ...current,
                            isFeatured:
                              event.target
                                .checked,
                          }),
                        )
                      }
                      className="mt-1 h-5 w-5 accent-yellow-400"
                    />

                    <span>
                      <span className="font-black text-white">
                        Featured entry
                      </span>

                      <span className="mt-1 block text-sm leading-6 text-neutral-500">
                        Make this entry
                        eligible for a
                        homepage or featured
                        collection.
                      </span>
                    </span>
                  </label>

                  <label className="mt-4 block">
                    <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                      Display order
                    </span>

                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={
                        draft.displayOrder
                      }
                      onChange={(event) =>
                        setDraft(
                          (current) => ({
                            ...current,
                            displayOrder:
                              event.target
                                .value,
                          }),
                        )
                      }
                      placeholder="Optional"
                      className="mt-2 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-purple-400"
                    />

                    <span className="mt-2 block text-xs text-neutral-600">
                      Lower numbers appear
                      first. Leave blank for
                      automatic ordering.
                    </span>
                  </label>

                  <label className="mt-4 block">
                    <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                      Public title override
                    </span>

                    <input
                      value={
                        draft.publicTitle
                      }
                      onChange={(event) =>
                        setDraft(
                          (current) => ({
                            ...current,
                            publicTitle:
                              event.target
                                .value,
                          }),
                        )
                      }
                      placeholder={`Leave blank to use "${selectedEntry.word}"`}
                      className="mt-2 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-purple-400"
                    />
                  </label>

                  <label className="mt-4 block">
                    <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                      Public summary
                    </span>

                    <textarea
                      rows={4}
                      value={
                        draft.publicSummary
                      }
                      onChange={(event) =>
                        setDraft(
                          (current) => ({
                            ...current,
                            publicSummary:
                              event.target
                                .value,
                          }),
                        )
                      }
                      placeholder="Optional short description for cards, search results, or featured placement."
                      className="mt-2 w-full resize-y rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-purple-400"
                    />
                  </label>

                  <div className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                      Publishing history
                    </p>

                    <p className="mt-2 text-sm text-neutral-300">
                      {formatDate(
                        selectedSettings?.publishedAt ??
                          null,
                      )}
                    </p>
                  </div>

                  {(localError ||
                    error) && (
                    <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm font-bold text-red-100">
                      {localError ||
                        error}
                    </div>
                  )}

                  {successMessage && (
                    <div className="mt-4 rounded-2xl border border-green-400/20 bg-green-400/10 p-4 text-sm font-bold text-green-100">
                      {successMessage}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      void save()
                    }
                    disabled={
                      isSaving ||
                      isLoading
                    }
                    className="mt-5 w-full rounded-2xl bg-purple-400 px-5 py-4 text-sm font-black text-black transition hover:bg-purple-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isSaving
                      ? "Saving publishing settings..."
                      : "Save Publishing Settings"}
                  </button>

                  <p className="mt-3 text-center text-xs text-neutral-600">
                    Nothing is written until
                    you press Save Publishing
                    Settings.
                  </p>
                </>
              )}
            </div>
          </section>
        </div>

        <footer className="shrink-0 border-t border-neutral-800 bg-neutral-950/95 p-4 text-xs text-neutral-500 backdrop-blur sm:px-6">
          Alpha 5.15B · Authenticated Studio
          controls · Anonymous access remains
          disabled
        </footer>
      </aside>
    </div>
  );
}

export default PublicPublishingControlsPanel;
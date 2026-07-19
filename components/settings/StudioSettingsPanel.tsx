"use client";

import { useEffect } from "react";
import { STUDIO_VERSION } from "@/lib/studioVersion";

type StudioSettingsPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string | null;
  activityCount: number;
  activeEntryCount: number;
  trashEntryCount: number;
  isOnline: boolean;
  pendingSyncCount: number;
  isSyncingOffline: boolean;
  offlineSyncError?: string;
  onOpenAccount: () => void;
  onOpenActivity: () => void;
  onOpenBackup: () => void;
  onSyncPendingChanges: () => void;
};

export function StudioSettingsPanel({
  isOpen,
  onClose,
  userEmail,
  activityCount,
  activeEntryCount,
  trashEntryCount,
  isOnline,
  pendingSyncCount,
  isSyncingOffline,
  offlineSyncError,
  onOpenAccount,
  onOpenActivity,
  onOpenBackup,
  onSyncPendingChanges,
}: StudioSettingsPanelProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const syncLabel = !isOnline
    ? "Offline"
    : isSyncingOffline
      ? "Syncing"
      : pendingSyncCount > 0
        ? `${pendingSyncCount} pending`
        : "Up to date";

  return (
    <div className="fixed inset-0 z-[125] bg-black/80 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close Studio Settings"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-settings-title"
        className="absolute bottom-0 right-0 flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-neutral-800 bg-neutral-950 shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-h-none md:max-w-2xl md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0"
      >
        <header className="shrink-0 border-b border-neutral-800 bg-neutral-950/95 p-5 backdrop-blur sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-yellow-400">
                {STUDIO_VERSION}
              </p>
              <h2
                id="studio-settings-title"
                className="mt-2 text-2xl font-black text-white sm:text-3xl"
              >
                Studio Settings
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-500">
                Account security, activity history, backups, and offline sync in
                one place.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 font-black text-neutral-300 hover:text-white"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <SettingsCard
              icon="🔐"
              title="Account"
              description="Change your password and review the signed-in account."
              meta={userEmail || "Authenticated Studio account"}
              actionLabel="Open Account Security"
              onAction={() => {
                onClose();
                onOpenAccount();
              }}
            />

            <SettingsCard
              icon="🧾"
              title="Activity"
              description="Review recent entry, workflow, export, and system actions."
              meta={`${activityCount} logged action${activityCount === 1 ? "" : "s"}`}
              actionLabel="Open Activity"
              onAction={() => {
                onClose();
                onOpenActivity();
              }}
            />

            <SettingsCard
              icon="💾"
              title="Backup & Data"
              description="Export Studio data and preview backup files safely."
              meta={`${activeEntryCount} active · ${trashEntryCount} trash`}
              actionLabel="Open Backup Tools"
              onAction={() => {
                onClose();
                onOpenBackup();
              }}
            />

            <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-neutral-800 text-xl">
                    {isOnline ? "☁️" : "📴"}
                  </div>

                  <div className="min-w-0">
                    <h3 className="font-black text-white">Offline Sync</h3>
                    <p className="mt-1 text-sm leading-6 text-neutral-500">
                      Locally saved edits upload automatically when your connection
                      returns.
                    </p>
                  </div>
                </div>

                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
                    !isOnline
                      ? "bg-yellow-400/10 text-yellow-200"
                      : offlineSyncError
                        ? "bg-red-400/10 text-red-200"
                        : pendingSyncCount > 0 || isSyncingOffline
                          ? "bg-sky-400/10 text-sky-200"
                          : "bg-green-400/10 text-green-200"
                  }`}
                >
                  {syncLabel}
                </span>
              </div>

              {offlineSyncError && (
                <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm leading-6 text-red-100">
                  {offlineSyncError}
                </p>
              )}

              <button
                type="button"
                onClick={onSyncPendingChanges}
                disabled={!isOnline || pendingSyncCount === 0 || isSyncingOffline}
                className="mt-5 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-black text-neutral-200 transition hover:border-sky-400 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSyncingOffline ? "Syncing…" : "Sync Pending Changes"}
              </button>
            </section>
          </div>

          <section className="mt-5 rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-5">
            <p className="font-black text-yellow-100">Settings consolidation</p>
            <p className="mt-2 text-sm leading-6 text-yellow-100/70">
              Account, Activity, and Backup no longer occupy separate dashboard or
              mobile-navigation buttons. Open them from this panel instead.
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}

function SettingsCard({
  icon,
  title,
  description,
  meta,
  actionLabel,
  onAction,
}: {
  icon: string;
  title: string;
  description: string;
  meta: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <section className="flex flex-col rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-neutral-800 text-xl">
          {icon}
        </div>

        <div className="min-w-0">
          <h3 className="font-black text-white">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-neutral-500">{description}</p>
        </div>
      </div>

      <p className="mt-4 break-words rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-bold text-neutral-400">
        {meta}
      </p>

      <button
        type="button"
        onClick={onAction}
        className="mt-4 w-full rounded-xl bg-neutral-800 px-4 py-3 text-sm font-black text-white transition hover:bg-neutral-700"
      >
        {actionLabel}
      </button>
    </section>
  );
}

export default StudioSettingsPanel;

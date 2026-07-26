"use client";

import { useState } from "react";

type DashboardWorkflowActionsProps = {
  disabled?: boolean;
  isSprintActive: boolean;
  sprintReviewedCount: number;
  statusIssueCount: number;
  launchBlockedCount: number;
  launchableCount: number;
  finalQAIssueCount: number;
  onOpenSprint: () => void;
  onCapture: () => void;
  onOpenAI: () => void;
  onOpenCompletion: () => void;
  onOpenQuality: () => void;
  onOpenStatusAudit: () => void;
  onOpenMedia: () => void;
  onOpenPublishing: () => void;
  onOpenLaunchGate: () => void;
  onOpenDryRun: () => void;
  onOpenFinalQA: () => void;
  onOpenPublicReady: () => void;
  onOpenRelease: () => void;
  onOpenContentReady: () => void;
  onOpenSettings: () => void;
};

type MenuKey = "build" | "review" | "release" | "more";

type MenuToggleProps = {
  menuKey: MenuKey;
  label: string;
  badge?: number;
  badgeTone?: "neutral" | "danger" | "warning" | "success";
  activeMenu: MenuKey | null;
  disabled: boolean;
  onToggle: (menu: MenuKey) => void;
};

type CompactActionProps = {
  label: string;
  description: string;
  onClick: () => void;
  disabled: boolean;
  badge?: string;
  badgeTone?: "neutral" | "danger" | "warning" | "success";
};

const badgeClasses = {
  neutral: "border-neutral-700 bg-neutral-800 text-neutral-300",
  danger: "border-red-400/30 bg-red-400/10 text-red-200",
  warning: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  success: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
};

function MenuToggle({
  menuKey,
  label,
  badge,
  badgeTone = "neutral",
  activeMenu,
  disabled,
  onToggle,
}: MenuToggleProps) {
  const isOpen = activeMenu === menuKey;

  return (
    <button
      type="button"
      aria-expanded={isOpen}
      aria-controls="dashboard-workflow-menu"
      onClick={() => onToggle(menuKey)}
      disabled={disabled}
      className={`flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
        isOpen
          ? "border-neutral-500 bg-neutral-800 text-white"
          : "border-neutral-800 bg-neutral-950 text-neutral-300 hover:border-neutral-600 hover:text-white"
      }`}
    >
      <span>{label}</span>

      {typeof badge === "number" && badge > 0 ? (
        <span
          className={`rounded-full border px-1.5 py-0.5 text-[10px] font-black ${badgeClasses[badgeTone]}`}
        >
          {badge}
        </span>
      ) : null}

      <span
        aria-hidden="true"
        className={`text-[10px] text-neutral-500 transition ${
          isOpen ? "rotate-180" : ""
        }`}
      >
        ▼
      </span>
    </button>
  );
}

function CompactAction({
  label,
  description,
  onClick,
  disabled,
  badge,
  badgeTone = "neutral",
}: CompactActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex min-h-[58px] w-full items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-left transition hover:border-neutral-600 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-black text-white group-hover:text-yellow-200">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-xs text-neutral-500">
          {description}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-2">
        {badge ? (
          <span
            className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wide ${badgeClasses[badgeTone]}`}
          >
            {badge}
          </span>
        ) : null}
        <span aria-hidden="true" className="text-neutral-600 group-hover:text-white">
          →
        </span>
      </span>
    </button>
  );
}

export function DashboardWorkflowActions({
  disabled = false,
  isSprintActive,
  sprintReviewedCount,
  statusIssueCount,
  launchBlockedCount,
  launchableCount,
  finalQAIssueCount,
  onOpenSprint,
  onCapture,
  onOpenAI,
  onOpenCompletion,
  onOpenQuality,
  onOpenStatusAudit,
  onOpenMedia,
  onOpenPublishing,
  onOpenLaunchGate,
  onOpenDryRun,
  onOpenFinalQA,
  onOpenPublicReady,
  onOpenRelease,
  onOpenContentReady,
  onOpenSettings,
}: DashboardWorkflowActionsProps) {
  const [activeMenu, setActiveMenu] = useState<MenuKey | null>(null);

  function toggleMenu(menu: MenuKey) {
    setActiveMenu((currentMenu) => (currentMenu === menu ? null : menu));
  }

  function runAction(action: () => void) {
    setActiveMenu(null);
    action();
  }

  return (
    <section
      aria-label="Editorial workflow"
      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/80 p-2 shadow-xl shadow-black/20 sm:p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onOpenSprint}
          disabled={disabled}
          className="min-h-10 flex-1 rounded-xl bg-yellow-400 px-4 py-2 text-sm font-black text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
        >
          {isSprintActive ? "Continue sprint" : "Start sprint"}
          {isSprintActive && sprintReviewedCount > 0
            ? ` · ${sprintReviewedCount}`
            : ""}
        </button>

        <button
          type="button"
          onClick={onCapture}
          disabled={disabled}
          className="min-h-10 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm font-black text-white transition hover:border-neutral-500 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Capture
        </button>

        <span className="mx-0.5 hidden h-7 w-px bg-neutral-800 sm:block" />

        <MenuToggle
          menuKey="build"
          label="Build"
          activeMenu={activeMenu}
          disabled={disabled}
          onToggle={toggleMenu}
        />
        <MenuToggle
          menuKey="review"
          label="Review"
          badge={statusIssueCount}
          badgeTone={statusIssueCount > 0 ? "danger" : "success"}
          activeMenu={activeMenu}
          disabled={disabled}
          onToggle={toggleMenu}
        />
        <MenuToggle
          menuKey="release"
          label="Release"
          badge={launchBlockedCount}
          badgeTone={launchBlockedCount > 0 ? "danger" : "success"}
          activeMenu={activeMenu}
          disabled={disabled}
          onToggle={toggleMenu}
        />
        <MenuToggle
          menuKey="more"
          label="More"
          activeMenu={activeMenu}
          disabled={disabled}
          onToggle={toggleMenu}
        />
      </div>

      {activeMenu ? (
        <div
          id="dashboard-workflow-menu"
          className="mt-2 border-t border-neutral-800 pt-2"
        >
          {activeMenu === "build" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <CompactAction
                label="AI Center"
                description="Fill fields and manage AI suggestions."
                onClick={() => runAction(onOpenAI)}
                disabled={disabled}
              />
              <CompactAction
                label="Completion"
                description="Find required fields still missing."
                onClick={() => runAction(onOpenCompletion)}
                disabled={disabled}
              />
            </div>
          ) : null}

          {activeMenu === "review" ? (
            <div className="grid gap-2 sm:grid-cols-3">
              <CompactAction
                label="Quality review"
                description="Inspect editorial quality and gaps."
                onClick={() => runAction(onOpenQuality)}
                disabled={disabled}
              />
              <CompactAction
                label="Status audit"
                description="Repair workflow status mismatches."
                onClick={() => runAction(onOpenStatusAudit)}
                disabled={disabled}
                badge={statusIssueCount > 0 ? `${statusIssueCount}` : "Clear"}
                badgeTone={statusIssueCount > 0 ? "danger" : "success"}
              />
              <CompactAction
                label="Media"
                description="Manage images, audio, and attribution."
                onClick={() => runAction(onOpenMedia)}
                disabled={disabled}
              />
            </div>
          ) : null}

          {activeMenu === "release" ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <CompactAction
                label="Publishing settings"
                description="Choose visibility and display order."
                onClick={() => runAction(onOpenPublishing)}
                disabled={disabled}
              />
              <CompactAction
                label="Launch Gate"
                description="Resolve public launch blockers."
                onClick={() => runAction(onOpenLaunchGate)}
                disabled={disabled}
                badge={launchBlockedCount > 0 ? `${launchBlockedCount}` : "Clear"}
                badgeTone={launchBlockedCount > 0 ? "danger" : "success"}
              />
              <CompactAction
                label="Publishing dry run"
                description="Rehearse routes and export the manifest."
                onClick={() => runAction(onOpenDryRun)}
                disabled={disabled}
                badge={launchableCount > 0 ? `${launchableCount} ready` : undefined}
                badgeTone="success"
              />
              <CompactAction
                label="Final QA"
                description="Complete the final Studio checklist."
                onClick={() => runAction(onOpenFinalQA)}
                disabled={disabled}
                badge={finalQAIssueCount > 0 ? `${finalQAIssueCount}` : "Ready"}
                badgeTone={finalQAIssueCount > 0 ? "warning" : "success"}
              />
            </div>
          ) : null}

          {activeMenu === "more" ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <CompactAction
                label="Public readiness"
                description="Review public-facing entry readiness."
                onClick={() => runAction(onOpenPublicReady)}
                disabled={disabled}
              />
              <CompactAction
                label="Release dashboard"
                description="Review Studio release progress."
                onClick={() => runAction(onOpenRelease)}
                disabled={disabled}
              />
              <CompactAction
                label="Content readiness"
                description="Review overall lexicon completion."
                onClick={() => runAction(onOpenContentReady)}
                disabled={disabled}
              />
              <CompactAction
                label="Studio settings"
                description="Open account and Studio settings."
                onClick={() => runAction(onOpenSettings)}
                disabled={disabled}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

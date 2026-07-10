"use client";

import { createClient } from "@/lib/supabase/client";

export function Sidebar() {
  const supabase = createClient();

  async function handleLogout() {
    const confirmed = window.confirm("Log out of YERRR Studio?");

    if (!confirmed) return;

    const { error } = await supabase.auth.signOut();

    if (error) {
      alert(error.message);
      return;
    }

    window.location.href = "/login";
  }

  return (
    <aside className="border-b border-neutral-800 bg-neutral-950 p-6 lg:min-h-screen lg:w-72 lg:border-b-0 lg:border-r">
      <div className="sticky top-6">
        <div className="mb-8">
          <p className="text-sm font-black uppercase tracking-[0.35em] text-yellow-400">
            YERRR
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight">
            Studio
          </h1>

          <p className="mt-3 text-sm leading-6 text-neutral-500">
            Your private command center for building the NYC slang lexicon.
          </p>
        </div>

        <nav className="space-y-2">
          <SidebarItem emoji="📚" label="Lexicon" active />
          <SidebarItem emoji="🧐" label="Review Queue" />
          <SidebarItem emoji="✍️" label="Drafts" />
          <SidebarItem emoji="🚀" label="Publishing" />
          <SidebarItem emoji="🧬" label="Duplicates" />
          <SidebarItem emoji="🗑️" label="Trash" />
        </nav>

        <div className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-sm font-black text-white">Current Phase</p>
          <p className="mt-1 text-sm text-neutral-500">
            Phase 2: CMS Workflow
          </p>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-800">
            <div className="h-full w-[92%] rounded-full bg-yellow-400" />
          </div>

          <p className="mt-2 text-xs font-bold text-neutral-500">
            Almost finished with Phase 2.
          </p>
        </div>

        <div className="mt-8 space-y-3">
          <button
            onClick={handleLogout}
            className="w-full rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-black text-red-300 hover:bg-red-500/20"
          >
            Log Out
          </button>

          <p className="text-xs leading-5 text-neutral-600">
            Logging out clears your Supabase session from this browser.
          </p>
        </div>
      </div>
    </aside>
  );
}

function SidebarItem({
  emoji,
  label,
  active = false,
}: {
  emoji: string;
  label: string;
  active?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-black ${
        active
          ? "bg-yellow-400 text-black"
          : "bg-neutral-900 text-neutral-400"
      }`}
    >
      <span>{emoji}</span>
      <span>{label}</span>
    </div>
  );
}
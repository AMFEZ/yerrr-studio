const navItems = [
  { label: "Dashboard", emoji: "🏠" },
  { label: "Entries", emoji: "📚" },
  { label: "Concepts", emoji: "🧠" },
  { label: "Relationships", emoji: "🔗" },
  { label: "Review Queue", emoji: "🧐" },
  { label: "AI Assistant", emoji: "🤖" },
  { label: "Settings", emoji: "⚙️" },
];

export function Sidebar() {
  return (
    <aside className="hidden min-h-screen w-72 border-r border-neutral-800 bg-neutral-950 p-6 lg:block">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.35em] text-yellow-400">
          YERRR!!
        </p>
        <h1 className="mt-2 text-2xl font-black text-white">Studio</h1>
        <p className="mt-2 text-sm text-neutral-500">
          NYC slang editorial system
        </p>
      </div>

      <nav className="mt-10 space-y-2">
        {navItems.map((item, index) => (
          <button
            key={item.label}
            className={`w-full rounded-xl px-4 py-3 text-left font-bold transition ${
              index === 0
                ? "bg-yellow-400 text-black"
                : "text-neutral-300 hover:bg-neutral-900 hover:text-white"
            }`}
          >
            <span className="mr-3">{item.emoji}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="mt-10 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <p className="text-sm font-bold text-white">Quick Capture</p>
        <p className="mt-1 text-xs text-neutral-500">
          Save slang fast. Define it later.
        </p>
      </div>
    </aside>
  );
}
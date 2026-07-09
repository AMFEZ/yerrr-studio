const stats = [
  { label: "Entries", value: "0", emoji: "📚" },
  { label: "Concepts", value: "0", emoji: "🧠" },
  { label: "Drafts", value: "0", emoji: "📝" },
  { label: "Needs Review", value: "0", emoji: "⚠️" },
];

const actions = [
  "New Entry",
  "Browse Lexicon",
  "Concept Explorer",
  "Review Queue",
  "Settings",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-10">
          <p className="mb-2 text-sm font-bold uppercase tracking-[0.3em] text-yellow-400">
            YERRR Studio
          </p>
          <h1 className="text-4xl font-black tracking-tight md:text-6xl">
            The NYC Slang Lexicon
          </h1>
          <p className="mt-4 max-w-2xl text-neutral-400">
            Your private workspace for building, editing, and preserving the
            living language of New York City.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5"
            >
              <div className="text-3xl">{stat.emoji}</div>
              <p className="mt-4 text-3xl font-black">{stat.value}</p>
              <p className="text-sm text-neutral-400">{stat.label}</p>
            </div>
          ))}
        </section>

        <section className="mt-10 grid gap-6 md:grid-cols-[1.5fr_1fr]">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
            <h2 className="mb-4 text-xl font-bold">Search Lexicon</h2>
            <input
              placeholder="Search deadass, brick, ocky..."
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400"
            />

            <div className="mt-8">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-neutral-500">
                Recent Activity
              </h3>
              <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-neutral-500">
                No activity yet. Your first entry is waiting.
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
            <h2 className="mb-4 text-xl font-bold">Quick Actions</h2>
            <div className="space-y-3">
              {actions.map((action, index) => (
                <button
                  key={action}
                  className={`w-full rounded-xl px-4 py-3 text-left font-bold transition hover:scale-[1.01] ${
                    index === 0
                      ? "bg-yellow-400 text-black hover:bg-yellow-300"
                      : "bg-neutral-800 text-white hover:bg-neutral-700"
                  }`}
                >
                  {index === 0 ? "➕ " : ""}
                  {action}
                </button>
              ))}
            </div>
          </div>
        </section>

        <footer className="mt-10 border-t border-neutral-800 pt-6 text-sm text-neutral-500">
          YERRR Studio Alpha · Sprint 1
        </footer>
      </div>
    </main>
  );
}
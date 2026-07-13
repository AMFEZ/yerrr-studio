export default function StudioLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-6 text-white">
      <section className="text-center">
        <div className="mx-auto flex h-16 w-16 animate-pulse items-center justify-center rounded-3xl border border-yellow-400/20 bg-yellow-400/10 text-2xl">
          Y
        </div>

        <p className="mt-5 text-xs font-black uppercase tracking-[0.24em] text-yellow-400">
          YERRR Studio
        </p>

        <h1 className="mt-3 text-2xl font-black">
          Loading workspace
        </h1>

        <p className="mt-2 text-sm text-neutral-500">
          Connecting to the lexicon and editorial tools…
        </p>
      </section>
    </main>
  );
}
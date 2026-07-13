import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-6 text-white">
      <section className="w-full max-w-lg rounded-3xl border border-neutral-800 bg-neutral-900 p-8 text-center">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-yellow-400">
          404
        </p>

        <h1 className="mt-3 text-3xl font-black">
          Studio page not found
        </h1>

        <p className="mt-3 leading-7 text-neutral-400">
          The requested Studio page or tool does not
          exist.
        </p>

        <Link
          href="/"
          className="mt-6 inline-flex rounded-2xl bg-yellow-400 px-5 py-3 font-black text-black transition hover:bg-yellow-300"
        >
          Return to Dashboard
        </Link>
      </section>
    </main>
  );
}
"use client";

type GlobalErrorProps = {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
};

export default function GlobalError({
  error,
  reset,
}: GlobalErrorProps) {
  return (
    <html lang="en">
      <body className="m-0 bg-neutral-950">
        <main className="flex min-h-screen items-center justify-center p-6 font-sans text-white">
          <section className="w-full max-w-xl rounded-3xl border border-red-400/20 bg-neutral-900 p-8 shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-red-300">
              Critical Studio Error
            </p>

            <h1 className="mt-3 text-3xl font-black">
              YERRR Studio could not load
            </h1>

            <p className="mt-3 leading-7 text-neutral-400">
              The application encountered a critical
              rendering problem. This screen does not
              perform any database writes.
            </p>

            {error.digest && (
              <p className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-950 p-4 font-mono text-sm text-neutral-400">
                Reference: {error.digest}
              </p>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={reset}
                className="rounded-2xl bg-yellow-400 px-5 py-3 font-black text-black"
              >
                Retry Studio
              </button>

              <button
                type="button"
                onClick={() => {
                  window.location.href = "/";
                }}
                className="rounded-2xl border border-neutral-700 px-5 py-3 font-black text-neutral-300"
              >
                Reload Dashboard
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
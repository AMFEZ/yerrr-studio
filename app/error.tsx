"use client";

type AppErrorProps = {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
};

export default function AppError({
  error,
  reset,
}: AppErrorProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-6 text-white">
      <section className="w-full max-w-xl rounded-3xl border border-red-400/20 bg-neutral-900 p-6 shadow-2xl sm:p-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-400/20 bg-red-400/10 text-2xl">
          ⚠️
        </div>

        <p className="mt-6 text-xs font-black uppercase tracking-[0.2em] text-red-300">
          YERRR Studio Error
        </p>

        <h1 className="mt-3 text-3xl font-black">
          Something interrupted Studio
        </h1>

        <p className="mt-3 leading-7 text-neutral-400">
          Your database records were not automatically changed. Try
          reloading this section or return to the dashboard.
        </p>

        {error.digest && (
          <div className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
              Error reference
            </p>

            <p className="mt-2 font-mono text-sm text-neutral-300">
              {error.digest}
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="rounded-2xl bg-yellow-400 px-5 py-3 font-black text-black transition hover:bg-yellow-300"
          >
            Try Again
          </button>

          <button
            type="button"
            onClick={() => {
              window.location.href = "/";
            }}
            className="rounded-2xl border border-neutral-700 bg-neutral-950 px-5 py-3 font-black text-neutral-300 transition hover:border-neutral-600 hover:text-white"
          >
            Return to Dashboard
          </button>
        </div>
      </section>
    </main>
  );
}
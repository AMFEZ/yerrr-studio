"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import Link from "next/link";

import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import { createClient } from "@/lib/supabase/client";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to sign in.";
}

function getSafeNextPath(
  value: string | null,
) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return "/";
  }

  return value;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams =
    useSearchParams();

  const supabase = useMemo(
    () => createClient(),
    [],
  );

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [error, setError] =
    useState("");

  const passwordChanged =
    searchParams.get(
      "passwordChanged",
    ) === "1";

  const recoveryError =
    searchParams.get("error");

  const nextPath = getSafeNextPath(
    searchParams.get("next"),
  );

  useEffect(() => {
    let isMounted = true;

    async function checkSession() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted || !user) {
        return;
      }

      router.replace(nextPath);
      router.refresh();
    }

    void checkSession();

    return () => {
      isMounted = false;
    };
  }, [
    nextPath,
    router,
    supabase,
  ]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setError("");

    try {
      setIsSubmitting(true);

      const { error: signInError } =
        await supabase.auth
          .signInWithPassword({
            email: email.trim(),
            password,
          });

      if (signInError) {
        throw signInError;
      }

      router.replace(nextPath);
      router.refresh();
    } catch (signInError) {
      setError(
        getErrorMessage(signInError),
      );

      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-5 text-white">
      <section className="w-full max-w-md rounded-3xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl sm:p-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-yellow-400/20 bg-yellow-400/10 text-2xl font-black text-yellow-300">
          Y
        </div>

        <p className="mt-6 text-xs font-black uppercase tracking-[0.25em] text-yellow-400">
          YERRR Studio
        </p>

        <h1 className="mt-3 text-3xl font-black">
          Welcome back
        </h1>

        <p className="mt-2 text-sm leading-6 text-neutral-500">
          Sign in to manage the NYC slang
          lexicon.
        </p>

        {passwordChanged && (
          <div className="mt-5 rounded-2xl border border-green-400/20 bg-green-400/10 p-4 text-sm font-bold leading-6 text-green-100">
            Your password was changed. Sign in
            using the new password.
          </div>
        )}

        {recoveryError && (
          <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm font-bold leading-6 text-red-100">
            The password recovery link could not
            be verified. Request a new link.
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="mt-6"
        >
          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
              Email
            </span>

            <input
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(
                  event.target.value,
                )
              }
              autoComplete="email"
              required
              disabled={isSubmitting}
              className="mt-2 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400 disabled:opacity-50"
              placeholder="you@example.com"
            />
          </label>

          <label className="mt-4 block">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                Password
              </span>

              <Link
                href="/forgot-password"
                className="text-xs font-black text-yellow-400 hover:text-yellow-300"
              >
                Forgot password?
              </Link>
            </div>

            <div className="mt-2 flex overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 focus-within:border-yellow-400">
              <input
                type={
                  showPassword
                    ? "text"
                    : "password"
                }
                value={password}
                onChange={(event) =>
                  setPassword(
                    event.target.value,
                  )
                }
                autoComplete="current-password"
                required
                disabled={isSubmitting}
                className="min-w-0 flex-1 bg-transparent px-4 py-3 text-white outline-none placeholder:text-neutral-600 disabled:opacity-50"
                placeholder="Enter your password"
              />

              <button
                type="button"
                onClick={() =>
                  setShowPassword(
                    (current) => !current,
                  )
                }
                className="border-l border-neutral-800 px-4 text-xs font-black text-neutral-400 hover:text-white"
              >
                {showPassword
                  ? "Hide"
                  : "Show"}
              </button>
            </div>
          </label>

          {error && (
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm font-bold leading-6 text-red-100">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={
              isSubmitting ||
              !email.trim() ||
              !password
            }
            className="mt-5 w-full rounded-2xl bg-yellow-400 px-5 py-4 font-black text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting
              ? "Signing in..."
              : "Sign In"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-neutral-600">
          YERRR Studio Alpha 5.16C ·
          Protected editorial workspace
        </p>
      </section>
    </main>
  );
}

export default LoginForm;
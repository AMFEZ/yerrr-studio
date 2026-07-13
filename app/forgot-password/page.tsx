"use client";

import {
  useMemo,
  useState,
  type FormEvent,
} from "react";

import Link from "next/link";

import { createClient } from "@/lib/supabase/client";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to send the recovery email.";
}

export default function ForgotPasswordPage() {
  const supabase = useMemo(
    () => createClient(),
    [],
  );

  const [email, setEmail] =
    useState("");

  const [isSending, setIsSending] =
    useState(false);

  const [error, setError] =
    useState("");

  const [emailSent, setEmailSent] =
    useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (isSending) {
      return;
    }

    setError("");
    setEmailSent(false);

    try {
      setIsSending(true);

      const redirectTo =
        `${window.location.origin}/auth/callback`;

      const { error: resetError } =
        await supabase.auth
          .resetPasswordForEmail(
            email.trim(),
            {
              redirectTo,
            },
          );

      if (resetError) {
        throw resetError;
      }

      setEmailSent(true);
    } catch (resetError) {
      setError(
        getErrorMessage(resetError),
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-5 text-white">
      <section className="w-full max-w-md rounded-3xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl sm:p-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-400/10 text-2xl">
          🔐
        </div>

        <p className="mt-6 text-xs font-black uppercase tracking-[0.25em] text-yellow-400">
          YERRR Studio
        </p>

        <h1 className="mt-3 text-3xl font-black">
          Reset your password
        </h1>

        <p className="mt-3 text-sm leading-6 text-neutral-500">
          Enter the email connected to your
          Studio login. Supabase will send a
          recovery link.
        </p>

        {emailSent ? (
          <section className="mt-6 rounded-3xl border border-green-400/20 bg-green-400/10 p-5">
            <p className="font-black text-green-100">
              Check your email
            </p>

            <p className="mt-2 text-sm leading-6 text-green-100/70">
              A recovery link was requested for{" "}
              <span className="font-bold">
                {email}
              </span>
              . Open the link in the same browser
              to choose a new password.
            </p>

            <button
              type="button"
              onClick={() =>
                setEmailSent(false)
              }
              className="mt-4 rounded-2xl border border-green-400/30 px-4 py-3 text-sm font-black text-green-100"
            >
              Send Again
            </button>
          </section>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-6"
          >
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                Login email
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
                disabled={isSending}
                className="mt-2 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400 disabled:opacity-50"
                placeholder="you@example.com"
              />
            </label>

            {error && (
              <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm font-bold leading-6 text-red-100">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={
                isSending ||
                !email.trim()
              }
              className="mt-5 w-full rounded-2xl bg-yellow-400 px-5 py-4 font-black text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSending
                ? "Sending recovery email..."
                : "Send Recovery Email"}
            </button>
          </form>
        )}

        <Link
          href="/login"
          className="mt-5 inline-flex text-sm font-black text-neutral-400 hover:text-white"
        >
          ← Return to login
        </Link>
      </section>
    </main>
  );
}
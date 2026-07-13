"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import Link from "next/link";

import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type RecoveryState =
  | "checking"
  | "ready"
  | "invalid"
  | "complete";

const MIN_PASSWORD_LENGTH = 12;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to update the password.";
}

function getPasswordChecks(password: string) {
  return {
    length:
      password.length >=
      MIN_PASSWORD_LENGTH,

    lowercase:
      /[a-z]/.test(password),

    uppercase:
      /[A-Z]/.test(password),

    number:
      /\d/.test(password),

    symbol:
      /[^A-Za-z0-9]/.test(password),
  };
}

export default function UpdatePasswordPage() {
  const router = useRouter();

  const supabase = useMemo(
    () => createClient(),
    [],
  );

  const [
    recoveryState,
    setRecoveryState,
  ] =
    useState<RecoveryState>(
      "checking",
    );

  const [newPassword, setNewPassword] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  const [
    showPassword,
    setShowPassword,
  ] = useState(false);

  const [isSaving, setIsSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const passwordChecks = useMemo(
    () =>
      getPasswordChecks(newPassword),
    [newPassword],
  );

  const passwordIsStrong =
    Object.values(
      passwordChecks,
    ).every(Boolean);

  const passwordsMatch =
    newPassword.length > 0 &&
    newPassword === confirmPassword;

  useEffect(() => {
    let isMounted = true;

    const query =
      new URLSearchParams(
        window.location.search,
      );

    if (
      query.get("error") ===
      "invalid_link"
    ) {
      setError(
        "This recovery link is invalid, expired, or has already been used.",
      );
    }

    async function verifyRecoverySession() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!isMounted) {
        return;
      }

      if (userError || !user) {
        setRecoveryState("invalid");
        return;
      }

      setRecoveryState("ready");
    }

    void verifyRecoverySession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) {
          return;
        }

        if (
          event === "PASSWORD_RECOVERY" ||
          event === "SIGNED_IN"
        ) {
          if (session?.user) {
            setRecoveryState("ready");
          }
        }
      },
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      recoveryState !== "ready" ||
      isSaving
    ) {
      return;
    }

    setError("");

    if (!passwordIsStrong) {
      setError(
        "The new password does not meet every security requirement.",
      );

      return;
    }

    if (!passwordsMatch) {
      setError(
        "The two password fields do not match.",
      );

      return;
    }

    try {
      setIsSaving(true);

      const { error: updateError } =
        await supabase.auth.updateUser({
          password: newPassword,
        });

      if (updateError) {
        throw updateError;
      }

      setRecoveryState("complete");

      window.setTimeout(() => {
        void supabase.auth
          .signOut()
          .finally(() => {
            router.replace(
              "/login?passwordChanged=1",
            );

            router.refresh();
          });
      }, 1600);
    } catch (updateError) {
      setError(
        getErrorMessage(updateError),
      );

      setIsSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-5 text-white">
      <section className="w-full max-w-md rounded-3xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl sm:p-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-green-400/20 bg-green-400/10 text-2xl">
          🔑
        </div>

        <p className="mt-6 text-xs font-black uppercase tracking-[0.25em] text-yellow-400">
          YERRR Studio
        </p>

        <h1 className="mt-3 text-3xl font-black">
          Choose a new password
        </h1>

        {recoveryState ===
          "checking" && (
          <div className="mt-6 rounded-3xl border border-blue-400/20 bg-blue-400/10 p-5">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-300 border-t-transparent" />

              <p className="font-bold text-blue-100">
                Verifying recovery link…
              </p>
            </div>
          </div>
        )}

        {recoveryState ===
          "invalid" && (
          <section className="mt-6 rounded-3xl border border-red-400/20 bg-red-400/10 p-5">
            <p className="font-black text-red-100">
              Recovery link unavailable
            </p>

            <p className="mt-2 text-sm leading-6 text-red-100/70">
              {error ||
                "This link is invalid, expired, or does not contain an active recovery session."}
            </p>

            <Link
              href="/forgot-password"
              className="mt-4 inline-flex rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-black text-black"
            >
              Request Another Link
            </Link>
          </section>
        )}

        {recoveryState ===
          "complete" && (
          <section className="mt-6 rounded-3xl border border-green-400/20 bg-green-400/10 p-5">
            <p className="font-black text-green-100">
              Password updated
            </p>

            <p className="mt-2 text-sm leading-6 text-green-100/70">
              Your password was changed.
              Redirecting you to the login page…
            </p>
          </section>
        )}

        {recoveryState === "ready" && (
          <form
            onSubmit={handleSubmit}
            className="mt-6"
          >
            <p className="text-sm leading-6 text-neutral-500">
              The recovery link was verified.
              Enter the new password below.
            </p>

            <label className="mt-5 block">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                New password
              </span>

              <div className="mt-2 flex overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 focus-within:border-yellow-400">
                <input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  value={newPassword}
                  onChange={(event) =>
                    setNewPassword(
                      event.target.value,
                    )
                  }
                  autoComplete="new-password"
                  className="min-w-0 flex-1 bg-transparent px-4 py-3 text-white outline-none placeholder:text-neutral-600"
                  placeholder="Enter a strong password"
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

            <label className="mt-4 block">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                Confirm password
              </span>

              <input
                type={
                  showPassword
                    ? "text"
                    : "password"
                }
                value={confirmPassword}
                onChange={(event) =>
                  setConfirmPassword(
                    event.target.value,
                  )
                }
                autoComplete="new-password"
                className="mt-2 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400"
                placeholder="Enter the password again"
              />
            </label>

            <section className="mt-5 rounded-3xl border border-neutral-800 bg-neutral-950 p-5">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <RecoveryCheck
                  complete={
                    passwordChecks.length
                  }
                  label={`${MIN_PASSWORD_LENGTH}+ characters`}
                />

                <RecoveryCheck
                  complete={
                    passwordChecks.lowercase
                  }
                  label="Lowercase letter"
                />

                <RecoveryCheck
                  complete={
                    passwordChecks.uppercase
                  }
                  label="Uppercase letter"
                />

                <RecoveryCheck
                  complete={
                    passwordChecks.number
                  }
                  label="Number"
                />

                <RecoveryCheck
                  complete={
                    passwordChecks.symbol
                  }
                  label="Symbol"
                />

                <RecoveryCheck
                  complete={passwordsMatch}
                  label="Passwords match"
                />
              </div>
            </section>

            {error && (
              <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm font-bold leading-6 text-red-100">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={
                isSaving ||
                !passwordIsStrong ||
                !passwordsMatch
              }
              className="mt-5 w-full rounded-2xl bg-yellow-400 px-5 py-4 font-black text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {isSaving
                ? "Updating password..."
                : "Save New Password"}
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

function RecoveryCheck({
  complete,
  label,
}: {
  complete: boolean;
  label: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 ${
        complete
          ? "text-green-300"
          : "text-neutral-500"
      }`}
    >
      <span>
        {complete ? "✓" : "·"}
      </span>

      <span>{label}</span>
    </div>
  );
}
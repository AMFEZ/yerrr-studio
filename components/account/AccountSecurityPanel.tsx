"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { createClient } from "@/lib/supabase/client";

type AccountSecurityPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string | null;
};

const MIN_PASSWORD_LENGTH = 12;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error
  ) {
    return String(
      (
        error as {
          message?: unknown;
        }
      ).message ?? "Unable to update password.",
    );
  }

  return "Unable to update password.";
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

export function AccountSecurityPanel({
  isOpen,
  onClose,
  userEmail,
}: AccountSecurityPanelProps) {
  const supabase = useMemo(
    () => createClient(),
    [],
  );

  const [newPassword, setNewPassword] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  const [
    showNewPassword,
    setShowNewPassword,
  ] = useState(false);

  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] = useState(false);

  const [isSaving, setIsSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
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
    if (!isOpen) {
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setError("");
    setSuccess("");
    setIsSaving(false);

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    function handleKeyDown(
      event: globalThis.KeyboardEvent,
    ) {
      if (
        event.key === "Escape" &&
        !isSaving
      ) {
        onClose();
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [isOpen, isSaving, onClose]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (isSaving) {
      return;
    }

    setError("");
    setSuccess("");

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

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error(
          "Your login session could not be verified. Sign in again before changing your password.",
        );
      }

      const { error: updateError } =
        await supabase.auth.updateUser({
          password: newPassword,
        });

      if (updateError) {
        throw updateError;
      }

      setSuccess(
        "Password changed successfully. YERRR Studio will sign you out so you can log in with the new password.",
      );

      setNewPassword("");
      setConfirmPassword("");

      window.setTimeout(() => {
        void supabase.auth
          .signOut()
          .finally(() => {
            window.location.assign(
              "/login?passwordChanged=1",
            );
          });
      }, 1600);
    } catch (updateError) {
      setError(
        getErrorMessage(updateError),
      );

      setIsSaving(false);
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close Account Security"
        onClick={() => {
          if (!isSaving) {
            onClose();
          }
        }}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-security-title"
        className="absolute bottom-0 right-0 flex max-h-[96vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-neutral-800 bg-neutral-950 shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-h-none md:max-w-xl md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0"
      >
        <header className="shrink-0 border-b border-neutral-800 bg-neutral-950/95 p-5 backdrop-blur sm:p-6">
          <div className="flex items-start justify-between gap-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
<span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-200">
                  Account Security
                </span>
              </div>

              <h2
                id="account-security-title"
                className="mt-3 text-2xl font-black text-white"
              >
                Change Password
              </h2>

              <p className="mt-2 text-sm leading-6 text-neutral-400">
                Update the password connected to
                your YERRR Studio login.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="shrink-0 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 font-black text-neutral-300 transition hover:text-white disabled:opacity-40"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
              Signed-in account
            </p>

            <p className="mt-2 break-all font-bold text-white">
              {userEmail ||
                "Authenticated Studio user"}
            </p>

            <p className="mt-3 text-sm leading-6 text-neutral-500">
              Changing the password will sign
              this browser out. Log in again
              using the new password.
            </p>
          </section>

          <form
            onSubmit={handleSubmit}
            className="mt-5"
          >
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                New password
              </span>

              <div className="mt-2 flex overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 focus-within:border-yellow-400">
                <input
                  type={
                    showNewPassword
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
                  disabled={isSaving}
                  className="min-w-0 flex-1 bg-transparent px-4 py-3 text-white outline-none placeholder:text-neutral-600 disabled:opacity-50"
                  placeholder="Enter a strong new password"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowNewPassword(
                      (current) => !current,
                    )
                  }
                  disabled={isSaving}
                  className="border-l border-neutral-800 px-4 text-xs font-black text-neutral-400 hover:text-white"
                >
                  {showNewPassword
                    ? "Hide"
                    : "Show"}
                </button>
              </div>
            </label>

            <label className="mt-4 block">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                Confirm new password
              </span>

              <div className="mt-2 flex overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 focus-within:border-yellow-400">
                <input
                  type={
                    showConfirmPassword
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
                  disabled={isSaving}
                  className="min-w-0 flex-1 bg-transparent px-4 py-3 text-white outline-none placeholder:text-neutral-600 disabled:opacity-50"
                  placeholder="Enter the password again"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowConfirmPassword(
                      (current) => !current,
                    )
                  }
                  disabled={isSaving}
                  className="border-l border-neutral-800 px-4 text-xs font-black text-neutral-400 hover:text-white"
                >
                  {showConfirmPassword
                    ? "Hide"
                    : "Show"}
                </button>
              </div>
            </label>

            <section className="mt-5 rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                Password requirements
              </p>

              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <PasswordCheck
                  complete={
                    passwordChecks.length
                  }
                  label={`${MIN_PASSWORD_LENGTH}+ characters`}
                />

                <PasswordCheck
                  complete={
                    passwordChecks.lowercase
                  }
                  label="Lowercase letter"
                />

                <PasswordCheck
                  complete={
                    passwordChecks.uppercase
                  }
                  label="Uppercase letter"
                />

                <PasswordCheck
                  complete={
                    passwordChecks.number
                  }
                  label="Number"
                />

                <PasswordCheck
                  complete={
                    passwordChecks.symbol
                  }
                  label="Symbol"
                />

                <PasswordCheck
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

            {success && (
              <div className="mt-4 rounded-2xl border border-green-400/20 bg-green-400/10 p-4 text-sm font-bold leading-6 text-green-100">
                {success}
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
                ? "Changing password..."
                : "Change Password"}
            </button>
          </form>

          <section className="mt-5 rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
            <p className="font-black text-white">
              Cannot access your account?
            </p>

            <p className="mt-2 text-sm leading-6 text-neutral-500">
              The recovery page sends a secure
              password-reset email to the login
              address.
            </p>

            <a
              href="/forgot-password"
              className="mt-4 inline-flex rounded-2xl border border-neutral-700 bg-neutral-950 px-5 py-3 text-sm font-black text-neutral-300 transition hover:border-yellow-400 hover:text-yellow-200"
            >
              Open Password Recovery
            </a>
          </section>
        </div>

        <footer className="shrink-0 border-t border-neutral-800 bg-neutral-950 p-4 text-xs text-neutral-500 sm:px-6">
          Passwords are handled by Supabase Auth
          and are never stored in YERRR Studio
          tables.
        </footer>
      </aside>
    </div>
  );
}

function PasswordCheck({
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
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-black ${
          complete
            ? "border-green-400/40 bg-green-400/10"
            : "border-neutral-700"
        }`}
      >
        {complete ? "✓" : "·"}
      </span>

      <span>{label}</span>
    </div>
  );
}

export default AccountSecurityPanel;
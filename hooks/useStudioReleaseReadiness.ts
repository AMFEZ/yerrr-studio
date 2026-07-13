"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { createClient } from "@/lib/supabase/client";

export type StudioHealthResponse = {
  ok: boolean;
  environment: string;
  generatedAt: string;

  checks: {
    supabaseUrlConfigured: boolean;
    supabaseAnonKeyConfigured: boolean;
    openAIKeyConfigured: boolean;
    appUrlConfigured: boolean;
    publishingAnonVisible:
      | boolean
      | null;
  };

  publishingProbe: {
    attempted: boolean;
    status: number | null;
    anonymousRowsVisible:
      | boolean
      | null;
    error: string | null;
  };
};

export type StudioDatabaseProbe = {
  isAuthenticated: boolean;
  authenticatedUserEmail: string;
  entryCount: number | null;
  publishingSettingsCount:
    | number
    | null;
  entriesReadable: boolean;
  publishingSettingsReadable: boolean;
  errors: string[];
};

function getErrorMessage(
  error: unknown,
): string {
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
      ).message ?? "Unknown error",
    );
  }

  return "Unknown release-readiness error.";
}

export function useStudioReleaseReadiness() {
  const supabase = useMemo(
    () => createClient(),
    [],
  );

  const [health, setHealth] =
    useState<StudioHealthResponse | null>(
      null,
    );

  const [database, setDatabase] =
    useState<StudioDatabaseProbe>({
      isAuthenticated: false,
      authenticatedUserEmail: "",
      entryCount: null,
      publishingSettingsCount: null,
      entriesReadable: false,
      publishingSettingsReadable: false,
      errors: [],
    });

  const [isLoading, setIsLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const refresh =
    useCallback(async () => {
      setIsLoading(true);
      setError("");

      const errors: string[] = [];

      let nextHealth:
        | StudioHealthResponse
        | null = null;

      let isAuthenticated = false;
      let authenticatedUserEmail = "";
      let entryCount: number | null =
        null;

      let publishingSettingsCount:
        | number
        | null = null;

      let entriesReadable = false;

      let publishingSettingsReadable =
        false;

      try {
        const response = await fetch(
          "/api/studio-health",
          {
            method: "GET",
            cache: "no-store",
          },
        );

        if (!response.ok) {
          throw new Error(
            `Studio health route returned HTTP ${response.status}.`,
          );
        }

        nextHealth =
          (await response.json()) as StudioHealthResponse;
      } catch (healthError) {
        errors.push(
          getErrorMessage(healthError),
        );
      }

      try {
        const {
          data,
          error: sessionError,
        } =
          await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        isAuthenticated =
          Boolean(data.session);

        authenticatedUserEmail =
          data.session?.user.email ?? "";
      } catch (sessionError) {
        errors.push(
          `Authentication: ${getErrorMessage(
            sessionError,
          )}`,
        );
      }

      try {
        const {
          count,
          error: entriesError,
        } = await supabase
          .from("entries")
          .select("*", {
            count: "exact",
            head: true,
          });

        if (entriesError) {
          throw entriesError;
        }

        entryCount = count ?? 0;
        entriesReadable = true;
      } catch (entriesError) {
        errors.push(
          `Entries table: ${getErrorMessage(
            entriesError,
          )}`,
        );
      }

      try {
        const {
          count,
          error:
            publishingSettingsError,
        } = await supabase
          .from(
            "public_entry_settings",
          )
          .select("*", {
            count: "exact",
            head: true,
          });

        if (
          publishingSettingsError
        ) {
          throw publishingSettingsError;
        }

        publishingSettingsCount =
          count ?? 0;

        publishingSettingsReadable =
          true;
      } catch (
        publishingSettingsError
      ) {
        errors.push(
          `Publishing settings: ${getErrorMessage(
            publishingSettingsError,
          )}`,
        );
      }

      setHealth(nextHealth);

      setDatabase({
        isAuthenticated,
        authenticatedUserEmail,
        entryCount,
        publishingSettingsCount,
        entriesReadable,
        publishingSettingsReadable,
        errors,
      });

      if (errors.length > 0) {
        setError(errors.join(" "));
      }

      setIsLoading(false);
    }, [supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    health,
    database,
    isLoading,
    error,
    refresh,
  };
}
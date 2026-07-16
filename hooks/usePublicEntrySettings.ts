"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { createClient } from "@/lib/supabase/client";

import type {
  PublicEntrySettings,
  PublicEntrySettingsInput,
  PublicEntrySettingsMap,
  PublicVisibility,
} from "@/types/publicPublishing";

type PublicEntrySettingsRow = {
  entry_id: string;
  visibility: string;
  is_featured: boolean;
  display_order: number | null;
  public_title: string | null;
  public_summary: string | null;
  published_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to load public publishing settings.";
}

function normalizeVisibility(
  value: unknown,
): PublicVisibility {
  return value === "public"
    ? "public"
    : "private";
}

function mapRow(
  row: PublicEntrySettingsRow,
): PublicEntrySettings {
  return {
    entryId: String(row.entry_id),
    visibility: normalizeVisibility(
      row.visibility,
    ),
    isFeatured:
      row.is_featured === true,
    displayOrder:
      typeof row.display_order === "number"
        ? row.display_order
        : null,
    publicTitle:
      row.public_title?.trim() ?? "",
    publicSummary:
      row.public_summary?.trim() ?? "",
    publishedAt:
      row.published_at ?? null,
    createdAt:
      row.created_at ?? null,
    updatedAt:
      row.updated_at ?? null,
  };
}

function rowsToMap(
  rows: PublicEntrySettingsRow[],
) {
  return rows.reduce<PublicEntrySettingsMap>(
    (map, row) => {
      const settings = mapRow(row);

      map[settings.entryId] =
        settings;

      return map;
    },
    {},
  );
}

export function usePublicEntrySettings() {
  const supabase = useMemo(
    () => createClient(),
    [],
  );

  const [
    settingsByEntryId,
    setSettingsByEntryId,
  ] =
    useState<PublicEntrySettingsMap>(
      {},
    );

  const [isLoading, setIsLoading] =
    useState(true);

  const [
    savingEntryId,
    setSavingEntryId,
  ] = useState<string | null>(null);

  const [error, setError] =
    useState("");

  const refresh =
    useCallback(async () => {
      setIsLoading(true);
      setError("");

      try {
        const {
          data,
          error: queryError,
        } = await supabase
          .from(
            "public_entry_settings",
          )
          .select("*");

        if (queryError) {
          throw queryError;
        }

        setSettingsByEntryId(
          rowsToMap(
            (data ??
              []) as PublicEntrySettingsRow[],
          ),
        );
      } catch (refreshError) {
        setError(
          getErrorMessage(refreshError),
        );
      } finally {
        setIsLoading(false);
      }
    }, [supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveSettings =
    useCallback(
      async (
        input: PublicEntrySettingsInput,
      ) => {
        const entryId =
          input.entryId.trim();

        if (!entryId) {
          throw new Error(
            "A valid entry ID is required.",
          );
        }

        setSavingEntryId(entryId);
        setError("");

        try {
          const payload = {
            entry_id: entryId,
            visibility:
              input.visibility,
            is_featured:
              input.isFeatured,
            display_order:
              input.displayOrder,
            public_title:
              input.publicTitle.trim(),
            public_summary:
              input.publicSummary.trim(),
          };

          const {
            data,
            error: saveError,
          } = await supabase
            .from(
              "public_entry_settings",
            )
            .upsert(payload, {
  onConflict: "entry_id",
})
            .select("*")
            .single();

          if (saveError) {
            throw saveError;
          }

          const settings = mapRow(
            data as PublicEntrySettingsRow,
          );

          setSettingsByEntryId(
            (currentSettings) => ({
              ...currentSettings,
              [settings.entryId]:
                settings,
            }),
          );

          return settings;
        } catch (saveError) {
          const message =
            getErrorMessage(saveError);

          setError(message);

          throw new Error(message);
        } finally {
          setSavingEntryId(null);
        }
      },
      [supabase],
    );

  const publicCount = useMemo(
    () =>
      Object.values(
        settingsByEntryId,
      ).filter(
        (settings) =>
          settings.visibility ===
          "public",
      ).length,
    [settingsByEntryId],
  );

  const privateCount = useMemo(
    () =>
      Object.values(
        settingsByEntryId,
      ).filter(
        (settings) =>
          settings.visibility ===
          "private",
      ).length,
    [settingsByEntryId],
  );

  const featuredCount = useMemo(
    () =>
      Object.values(
        settingsByEntryId,
      ).filter(
        (settings) =>
          settings.isFeatured,
      ).length,
    [settingsByEntryId],
  );

  return {
    settingsByEntryId,
    isLoading,
    savingEntryId,
    error,
    publicCount,
    privateCount,
    featuredCount,
    refresh,
    saveSettings,
  };
}
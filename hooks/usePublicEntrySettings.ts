"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PublicEntrySettingsInput } from "@/types/publicPublishing";

export type PublicEntryVisibility = "public" | "private";

export type PublicEntrySettings = {
  entryId: string;
  visibility: PublicEntryVisibility;
  isFeatured: boolean;
  displayOrder: number | null;
  publicTitle: string;
  publicSummary: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
};

type PublicEntrySettingsRow = {
  entry_id: string | number;
  visibility: string | null;
  is_featured: boolean | null;
  display_order: number | string | null;
  public_title: string | null;
  public_summary: string | null;
  published_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type SettingsInput = {
  visibility?: unknown;
  isFeatured?: unknown;
  is_featured?: unknown;
  displayOrder?: unknown;
  display_order?: unknown;
  publicTitle?: unknown;
  public_title?: unknown;
  publicSummary?: unknown;
  public_summary?: unknown;
  publishedAt?: unknown;
  published_at?: unknown;
};

const SETTINGS_TABLE = "entry_public_settings";

function normalizeText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}

function normalizeVisibility(value: unknown): PublicEntryVisibility {
  return normalizeText(value).toLowerCase() === "public" ? "public" : "private";
}

function normalizeDisplayOrder(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;

  return Math.max(0, Math.trunc(parsed));
}

function readInputValue(
  input: SettingsInput,
  camelKey: keyof SettingsInput,
  snakeKey: keyof SettingsInput,
) {
  return input[camelKey] !== undefined ? input[camelKey] : input[snakeKey];
}

function mapRow(row: PublicEntrySettingsRow): PublicEntrySettings {
  return {
    entryId: String(row.entry_id),
    visibility: normalizeVisibility(row.visibility),
    isFeatured: Boolean(row.is_featured),
    displayOrder: normalizeDisplayOrder(row.display_order),
    publicTitle: normalizeText(row.public_title),
    publicSummary: normalizeText(row.public_summary),
    publishedAt: normalizeText(row.published_at),
    createdAt: normalizeText(row.created_at),
    updatedAt: normalizeText(row.updated_at),
  };
}

function formatSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") {
    return "Public settings could not be loaded.";
  }

  const record = error as Record<string, unknown>;
  const message = normalizeText(record.message) || "Public settings could not be loaded.";
  const code = normalizeText(record.code);
  const details = normalizeText(record.details);
  const hint = normalizeText(record.hint);

  if (code === "42P01" || code === "PGRST205") {
    return [
      `Supabase table public.${SETTINGS_TABLE} is missing or unavailable.`,
      "Run the Alpha 5.20B1 public-settings migration, then refresh this check.",
      code ? `Code: ${code}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    message,
    code ? `Code: ${code}.` : "",
    details && details !== message ? details : "",
    hint ? `Hint: ${hint}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function parseSaveArguments(args: unknown[]) {
  const first = args[0];
  const second = args[1];

  if (typeof first === "string" || typeof first === "number") {
    return {
      entryId: String(first),
      input:
        second && typeof second === "object" && !Array.isArray(second)
          ? (second as SettingsInput)
          : {},
    };
  }

  if (first && typeof first === "object" && !Array.isArray(first)) {
    const record = first as Record<string, unknown>;
    const entryId = normalizeText(record.entryId ?? record.entry_id ?? record.id);

    return {
      entryId,
      input: record as SettingsInput,
    };
  }

  return { entryId: "", input: {} as SettingsInput };
}

export function usePublicEntrySettings() {
  const supabase = useMemo(() => createClient(), []);
  const [settingsByEntryId, setSettingsByEntryId] = useState<
    Record<string, PublicEntrySettings>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) {
        setSettingsByEntryId({});
        setError("Public settings require an authenticated Studio session.");
        return;
      }

      const { data, error: settingsError } = await supabase
        .from(SETTINGS_TABLE)
        .select(
          "entry_id, visibility, is_featured, display_order, public_title, public_summary, published_at, created_at, updated_at",
        )
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (settingsError) throw settingsError;

      const nextSettings = ((data ?? []) as PublicEntrySettingsRow[]).reduce<
        Record<string, PublicEntrySettings>
      >((result, row) => {
        const mapped = mapRow(row);
        result[mapped.entryId] = mapped;
        return result;
      }, {});

      setSettingsByEntryId(nextSettings);
    } catch (loadError) {
      setSettingsByEntryId({});
      setError(formatSupabaseError(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  const saveSettings = useCallback(
    async (saveInput: PublicEntrySettingsInput): Promise<PublicEntrySettings> => {
      const { entryId, input } = parseSaveArguments([saveInput]);

      if (!entryId) {
        throw new Error("An entry ID is required to save public settings.");
      }

      setSavingEntryId(entryId);
      setError(null);

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;
        if (!user) {
          throw new Error("Public settings require an authenticated Studio session.");
        }

        const visibility = normalizeVisibility(input.visibility);
        const publishedAtInput = readInputValue(input, "publishedAt", "published_at");
        const publishedAtText = normalizeText(publishedAtInput);

        const payload = {
          user_id: user.id,
          entry_id: entryId,
          visibility,
          is_featured: Boolean(
            readInputValue(input, "isFeatured", "is_featured"),
          ),
          display_order: normalizeDisplayOrder(
            readInputValue(input, "displayOrder", "display_order"),
          ),
          public_title: normalizeText(
            readInputValue(input, "publicTitle", "public_title"),
          ),
          public_summary: normalizeText(
            readInputValue(input, "publicSummary", "public_summary"),
          ),
          published_at: publishedAtText || null,
          updated_at: new Date().toISOString(),
        };

        const { data, error: saveError } = await supabase
          .from(SETTINGS_TABLE)
          .upsert(payload, { onConflict: "user_id,entry_id" })
          .select(
            "entry_id, visibility, is_featured, display_order, public_title, public_summary, published_at, created_at, updated_at",
          )
          .single();

        if (saveError) throw saveError;

        const mapped = mapRow(data as PublicEntrySettingsRow);
        setSettingsByEntryId((current) => ({
          ...current,
          [entryId]: mapped,
        }));

        return mapped;
      } catch (saveError) {
        const message = formatSupabaseError(saveError);
        setError(message);
        throw new Error(message);
      } finally {
        setSavingEntryId(null);
      }
    },
    [supabase],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    settingsByEntryId,
    isLoading,
    savingEntryId,
    error,
    refresh,
    saveSettings,
  };
}

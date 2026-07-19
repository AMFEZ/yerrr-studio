"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { categoryOptions, toneOptions } from "@/types/entry";
import type {
  EditorialTaxonomyKind,
  EditorialTaxonomyOption,
} from "@/types/editorialTaxonomy";

type EditorialTaxonomyRow = {
  id: string;
  user_id: string;
  kind: string;
  label: string;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error) {
    return String(
      (error as { message?: unknown }).message ?? fallback,
    );
  }

  return fallback;
}

function normalizeLabel(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function sortLabels(values: string[]) {
  const unique = new Map<string, string>();

  values.forEach((value) => {
    const cleanValue = normalizeLabel(value);

    if (!cleanValue) {
      return;
    }

    const key = cleanValue.toLocaleLowerCase();

    if (!unique.has(key)) {
      unique.set(key, cleanValue);
    }
  });

  return Array.from(unique.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

function mapRow(row: EditorialTaxonomyRow): EditorialTaxonomyOption {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind === "tone" ? "tone" : "category",
    label: row.label,
    isActive: row.is_active !== false,
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  };
}

export function useEditorialTaxonomy() {
  const supabase = useMemo(() => createClient(), []);

  const [customOptions, setCustomOptions] = useState<
    EditorialTaxonomyOption[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        setCustomOptions([]);
        return;
      }

      const { data, error: loadError } = await supabase
        .from("editorial_taxonomy_options")
        .select(
          "id, user_id, kind, label, is_active, created_at, updated_at",
        )
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("label", { ascending: true });

      if (loadError) {
        throw loadError;
      }

      setCustomOptions(
        ((data ?? []) as EditorialTaxonomyRow[]).map(mapRow),
      );
    } catch (loadError) {
      setCustomOptions([]);
      setError(
        getErrorMessage(
          loadError,
          "Unable to load custom categories and tones.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const categories = useMemo(
    () =>
      sortLabels([
        ...categoryOptions,
        ...customOptions
          .filter((option) => option.kind === "category")
          .map((option) => option.label),
      ]),
    [customOptions],
  );

  const tones = useMemo(
    () =>
      sortLabels([
        ...toneOptions,
        ...customOptions
          .filter((option) => option.kind === "tone")
          .map((option) => option.label),
      ]),
    [customOptions],
  );

  const addOption = useCallback(
    async (kind: EditorialTaxonomyKind, rawLabel: string) => {
      const label = normalizeLabel(rawLabel);

      if (!label) {
        throw new Error("Enter a category or tone name first.");
      }

      const existingLabels = kind === "category" ? categories : tones;

      if (
        existingLabels.some(
          (existingLabel) =>
            existingLabel.toLocaleLowerCase() ===
            label.toLocaleLowerCase(),
        )
      ) {
        throw new Error(`“${label}” already exists.`);
      }

      setIsSaving(true);
      setError("");

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        if (!user) {
          throw new Error("Sign in again before adding an option.");
        }

        const { data, error: insertError } = await supabase
          .from("editorial_taxonomy_options")
          .insert({
            user_id: user.id,
            kind,
            label,
            is_active: true,
          })
          .select(
            "id, user_id, kind, label, is_active, created_at, updated_at",
          )
          .single();

        if (insertError) {
          throw insertError;
        }

        setCustomOptions((currentOptions) =>
          [...currentOptions, mapRow(data as EditorialTaxonomyRow)].sort(
            (a, b) =>
              a.label.localeCompare(b.label, undefined, {
                sensitivity: "base",
              }),
          ),
        );
      } catch (saveError) {
        const message = getErrorMessage(
          saveError,
          "Unable to add the taxonomy option.",
        );

        setError(message);
        throw new Error(message);
      } finally {
        setIsSaving(false);
      }
    },
    [categories, supabase, tones],
  );

  const removeOption = useCallback(
    async (optionId: string) => {
      setIsSaving(true);
      setError("");

      try {
        const { error: deleteError } = await supabase
          .from("editorial_taxonomy_options")
          .delete()
          .eq("id", optionId);

        if (deleteError) {
          throw deleteError;
        }

        setCustomOptions((currentOptions) =>
          currentOptions.filter((option) => option.id !== optionId),
        );
      } catch (removeError) {
        const message = getErrorMessage(
          removeError,
          "Unable to remove the taxonomy option.",
        );

        setError(message);
        throw new Error(message);
      } finally {
        setIsSaving(false);
      }
    },
    [supabase],
  );

  return {
    categories,
    tones,
    customOptions,
    isLoading,
    isSaving,
    error,
    refresh,
    addOption,
    removeOption,
  };
}

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Concept, ConceptCategory, ConceptColor } from "@/types/concept";
import { conceptCategoryOptions, conceptColorOptions } from "@/types/concept";
import type { Entry } from "@/types/entry";

type ConceptRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  color: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type EntryConceptRow = {
  concept_id: string;
};

function toError(error: unknown, fallback: string): Error {
  if (error instanceof Error) {
    return error;
  }

  if (error && typeof error === "object") {
    const errorRecord = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };

    const parts = [
      errorRecord.message,
      errorRecord.details,
      errorRecord.hint,
      errorRecord.code ? `Code: ${String(errorRecord.code)}` : undefined,
    ]
      .filter((value) => value !== undefined && value !== null && String(value).trim())
      .map(String);

    if (parts.length > 0) {
      return new Error(parts.join(" · "));
    }
  }

  return new Error(fallback);
}

export type EntryCloudConceptState = {
  concepts: Concept[];
  assignedConceptIds: string[];
  assignedConceptNames: string[];
};

function normalizeConceptCategory(value: string | null): ConceptCategory {
  if (conceptCategoryOptions.includes(value as ConceptCategory)) {
    return value as ConceptCategory;
  }

  return "Meaning";
}

function normalizeConceptColor(value: string | null): ConceptColor {
  if (conceptColorOptions.includes(value as ConceptColor)) {
    return value as ConceptColor;
  }

  return "yellow";
}

function mapConceptRow(row: ConceptRow): Concept {
  return {
    id: String(row.id),
    name: row.name,
    slug: row.slug,
    description: row.description ?? "",
    category: normalizeConceptCategory(row.category),
    color: normalizeConceptColor(row.color),
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  };
}

export function slugifyConceptName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseConceptNames(value: string) {
  const namesBySlug = new Map<string, string>();

  value
    .split(/[,;\n]+/)
    .map((name) => name.trim())
    .filter(Boolean)
    .forEach((name) => {
      const slug = slugifyConceptName(name);

      if (slug && !namesBySlug.has(slug)) {
        namesBySlug.set(slug, name);
      }
    });

  return Array.from(namesBySlug.values());
}

export function formatConceptNames(names: string[]) {
  const namesBySlug = new Map<string, string>();

  names.forEach((name) => {
    const cleanName = name.trim();
    const slug = slugifyConceptName(cleanName);

    if (slug && !namesBySlug.has(slug)) {
      namesBySlug.set(slug, cleanName);
    }
  });

  return Array.from(namesBySlug.values()).join(", ");
}

function getEntryConceptNames(
  entry: Entry,
  preserveConceptNames: string[] = [],
) {
  return parseConceptNames(
    [
      ...entry.meanings.map((meaning) => meaning.conceptsText),
      preserveConceptNames.join(", "),
    ].join(", "),
  );
}

async function fetchAllConcepts(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("concepts")
    .select(
      `
      id,
      name,
      slug,
      description,
      category,
      color,
      created_at,
      updated_at
    `,
    )
    .order("name", { ascending: true });

  if (error) {
    throw toError(error, "Unable to load concepts from Supabase.");
  }

  return ((data ?? []) as ConceptRow[]).map(mapConceptRow);
}

export async function loadEntryCloudConceptState(
  supabase: SupabaseClient,
  entryId: string,
): Promise<EntryCloudConceptState> {
  const [concepts, assignmentResult] = await Promise.all([
    fetchAllConcepts(supabase),
    supabase
      .from("entry_concepts")
      .select("concept_id")
      .eq("entry_id", entryId),
  ]);

  if (assignmentResult.error) {
    throw toError(
      assignmentResult.error,
      "Unable to load entry concept assignments.",
    );
  }

  const assignedConceptIds = (
    (assignmentResult.data ?? []) as EntryConceptRow[]
  ).map((row) => String(row.concept_id));

  const assignedConceptIdSet = new Set(assignedConceptIds);

  const assignedConceptNames = concepts
    .filter((concept) => assignedConceptIdSet.has(String(concept.id)))
    .map((concept) => concept.name);

  return {
    concepts,
    assignedConceptIds,
    assignedConceptNames,
  };
}

export async function syncEntryCloudConcepts(
  supabase: SupabaseClient,
  entry: Entry,
  options?: {
    preserveConceptNames?: string[];
  },
): Promise<EntryCloudConceptState> {
  const desiredNames = getEntryConceptNames(
    entry,
    options?.preserveConceptNames ?? [],
  );

  const desiredNamesBySlug = new Map(
    desiredNames.map((name) => [slugifyConceptName(name), name]),
  );

  let concepts = await fetchAllConcepts(supabase);

  const existingSlugs = new Set(
    concepts.map((concept) => concept.slug.toLowerCase()),
  );

  const missingConceptRows = Array.from(desiredNamesBySlug.entries())
    .filter(([slug]) => !existingSlugs.has(slug))
    .map(([slug, name]) => ({
      name,
      slug,
      description: "Created automatically from the YERRR Studio Entry Editor.",
      category: "Meaning" as ConceptCategory,
      color: "yellow" as ConceptColor,
    }));

  if (missingConceptRows.length > 0) {
    for (const conceptRow of missingConceptRows) {
      const { error } = await supabase
        .from("concepts")
        .insert(conceptRow);

      if (error) {
        throw toError(error, "Unable to create a concept in Supabase.");
      }
    }

    concepts = await fetchAllConcepts(supabase);
  }

  const conceptIdBySlug = new Map(
    concepts.map((concept) => [concept.slug.toLowerCase(), String(concept.id)]),
  );

  const desiredConceptIds = Array.from(desiredNamesBySlug.keys())
    .map((slug) => conceptIdBySlug.get(slug))
    .filter((conceptId): conceptId is string => Boolean(conceptId));

  const { data: currentRows, error: currentError } = await supabase
    .from("entry_concepts")
    .select("concept_id")
    .eq("entry_id", entry.id);

  if (currentError) {
    throw toError(
      currentError,
      "Unable to load the current entry concept assignments.",
    );
  }

  const currentConceptIds = ((currentRows ?? []) as EntryConceptRow[]).map(
    (row) => String(row.concept_id),
  );

  const currentConceptIdSet = new Set(currentConceptIds);

  const desiredConceptIdSet = new Set(desiredConceptIds);

  const conceptIdsToAdd = desiredConceptIds.filter(
    (conceptId) => !currentConceptIdSet.has(conceptId),
  );

  const conceptIdsToRemove = currentConceptIds.filter(
    (conceptId) => !desiredConceptIdSet.has(conceptId),
  );

  if (conceptIdsToAdd.length > 0) {
    const { error } = await supabase.from("entry_concepts").insert(
      conceptIdsToAdd.map((conceptId) => ({
        entry_id: entry.id,
        concept_id: conceptId,
      })),
    );

    if (error) {
      throw toError(error, "Unable to add entry concept assignments.");
    }
  }

  if (conceptIdsToRemove.length > 0) {
    const { error } = await supabase
      .from("entry_concepts")
      .delete()
      .eq("entry_id", entry.id)
      .in("concept_id", conceptIdsToRemove);

    if (error) {
      throw toError(error, "Unable to remove entry concept assignments.");
    }
  }

  const assignedConceptIdSet = new Set(desiredConceptIds);

  return {
    concepts,
    assignedConceptIds: desiredConceptIds,
    assignedConceptNames: concepts
      .filter((concept) => assignedConceptIdSet.has(String(concept.id)))
      .map((concept) => concept.name),
  };
}
import { NextResponse } from "next/server";
import OpenAI from "openai";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import {
  EDITORIAL_RULESET_VERSION,
  getRecommendedEditorialStatuses,
  getRequiredEditorialGaps,
} from "@/lib/editorialCompletionRules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BatchTriageRequestBody = {
  entries?: unknown;
};

type TriagePriority = "high" | "medium" | "low";
type SafeEntryStatus = "Draft" | "Needs Review" | "Verified";
type SafeMeaningStatus = "Draft" | "Needs Review" | "Verified";

type CleanMeaning = {
  title: string;
  definition: string;
  example: string;
  category: string;
  tone: string;
  conceptsText: string;
  usageFrequency: string;
  editorialStatus: string;
};

type CleanEntry = {
  id: string;
  word: string;
  type: string;
  slug: string;
  pronunciation: string;
  partOfSpeech: string;
  status: string;
  meanings: CleanMeaning[];
  missingRequiredFields: string[];
};

type RawRecommendation = {
  entryId?: unknown;
  entryWord?: unknown;
  priority?: unknown;
  recommendedEntryStatus?: unknown;
  recommendedMeaningStatus?: unknown;
  reason?: unknown;
  nextAction?: unknown;
  requiresHumanReview?: unknown;
};

const MAX_BATCH_SIZE = 20;

const BATCH_TRIAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "recommendations"],
  properties: {
    summary: {
      type: "string",
    },
    recommendations: {
      type: "array",
      maxItems: MAX_BATCH_SIZE,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "entryId",
          "entryWord",
          "priority",
          "recommendedEntryStatus",
          "recommendedMeaningStatus",
          "reason",
          "nextAction",
          "requiresHumanReview",
        ],
        properties: {
          entryId: { type: "string" },
          entryWord: { type: "string" },
          priority: {
            type: "string",
            enum: ["high", "medium", "low"],
          },
          recommendedEntryStatus: {
            type: "string",
            enum: ["Draft", "Needs Review", "Verified"],
          },
          recommendedMeaningStatus: {
            type: "string",
            enum: ["Draft", "Needs Review", "Verified"],
          },
          reason: { type: "string" },
          nextAction: { type: "string" },
          requiresHumanReview: { type: "boolean" },
        },
      },
    },
  },
} as const;

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}

function cleanText(value: unknown, maxLength = 1_000) {
  if (typeof value === "string") {
    return value.trim().slice(0, maxLength);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).slice(0, maxLength);
  }

  return "";
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function readTextField(
  source: Record<string, unknown>,
  aliases: string[],
  maxLength = 1_000,
) {
  const aliasSet = new Set(aliases.map(normalizeKey));

  for (const [key, value] of Object.entries(source)) {
    if (aliasSet.has(normalizeKey(key))) {
      return cleanText(value, maxLength);
    }
  }

  return "";
}

function cleanMeaning(value: unknown): CleanMeaning {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    title: readTextField(record, ["title", "meaningTitle"], 300),
    definition: readTextField(record, ["definition", "meaning", "gloss"], 1_500),
    example: readTextField(
      record,
      ["example", "exampleSentence", "usageExample"],
      1_200,
    ),
    category: readTextField(record, ["category"], 200),
    tone: readTextField(record, ["tone"], 200),
    conceptsText: readTextField(
      record,
      ["conceptsText", "concepts_text", "concepts"],
      800,
    ),
    usageFrequency: readTextField(
      record,
      ["usageFrequency", "usage_frequency", "frequency"],
      200,
    ),
    editorialStatus: readTextField(
      record,
      ["editorialStatus", "editorial_status"],
      200,
    ),
  };
}

function cleanEntry(value: unknown): CleanEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = cleanText(record.id, 200);
  const word = cleanText(record.word, 300);

  if (!id || !word) {
    return null;
  }

  const meanings = Array.isArray(record.meanings)
    ? record.meanings.slice(0, 8).map(cleanMeaning)
    : [];

  const baseEntry = {
    id,
    word,
    type: cleanText(record.type, 200),
    slug: cleanText(record.slug, 300),
    pronunciation: cleanText(record.pronunciation, 500),
    partOfSpeech: readTextField(
      record,
      ["partOfSpeech", "part_of_speech", "pos", "grammar"],
      200,
    ),
    status: cleanText(record.status, 200),
    meanings,
  };

  return {
    ...baseEntry,
    missingRequiredFields: getRequiredEditorialGaps(baseEntry).map((gap) => gap.label),
  };
}

function safePriority(value: unknown, missingCount: number): TriagePriority {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }

  if (missingCount >= 5) return "high";
  if (missingCount > 0) return "medium";
  return "low";
}

function validateRecommendations(parsed: unknown, entries: CleanEntry[]) {
  const record =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};

  const rawRecommendations = Array.isArray(record.recommendations)
    ? record.recommendations
    : [];

  const rawById = new Map<string, RawRecommendation>();

  rawRecommendations.forEach((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;

    const recommendation = value as RawRecommendation;
    const entryId = cleanText(recommendation.entryId, 200);

    if (entryId) {
      rawById.set(entryId, recommendation);
    }
  });

  return entries.map((entry) => {
    const raw = rawById.get(entry.id) ?? {};
    const statuses = getRecommendedEditorialStatuses(entry);
    const missingCount = entry.missingRequiredFields.length;
    const defaultReason =
      missingCount > 0
        ? `${missingCount} required field${missingCount === 1 ? " is" : "s are"} still incomplete.`
        : "All currently required editorial fields are populated.";
    const defaultAction =
      missingCount > 0
        ? `Complete ${entry.missingRequiredFields.slice(0, 3).join(", ")}${
            missingCount > 3 ? ", and remaining gaps" : ""
          }.`
        : "Perform a final human review before publishing.";

    return {
      entryId: entry.id,
      entryWord: entry.word,
      currentEntryStatus: entry.status,
      currentMeaningStatuses: Array.from(
        new Set(entry.meanings.map((meaning) => meaning.editorialStatus).filter(Boolean)),
      ),
      priority: safePriority(raw.priority, missingCount),
      recommendedEntryStatus: statuses.entryStatus,
      recommendedMeaningStatus: statuses.meaningStatus,
      reason: cleanText(raw.reason, 900) || defaultReason,
      nextAction: cleanText(raw.nextAction, 900) || defaultAction,
      requiresHumanReview:
        raw.requiresHumanReview === false && missingCount > 0 ? true : true,
      missingRequiredFields: entry.missingRequiredFields,
    };
  });
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return noStoreJson(
        {
          error:
            "Your Supabase session could not be verified. Refresh the page or sign in again.",
        },
        401,
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return noStoreJson(
        { error: "OPENAI_API_KEY is not configured on the server." },
        503,
      );
    }

    const body = (await request.json()) as BatchTriageRequestBody;
    const entries = Array.isArray(body.entries)
      ? body.entries
          .slice(0, MAX_BATCH_SIZE)
          .map(cleanEntry)
          .filter((entry): entry is CleanEntry => Boolean(entry))
      : [];

    if (entries.length === 0) {
      return noStoreJson(
        { error: "Select at least one valid lexicon entry for batch triage." },
        400,
      );
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const model = process.env.OPENAI_MODEL ?? "gpt-5-mini";

    const response = await openai.responses.create({
      model,
      store: false,
      reasoning: {
        effort: "low",
      },
      max_output_tokens: 3_000,
      instructions: [
        "You are YERRR Studio AI, an internal editorial triage assistant for an NYC slang lexicon.",
        "Analyze only the supplied entries and return exactly one recommendation for every entry.",
        "Do not invent definitions, examples, origins, pronunciations, alternate spellings, sources, or cultural claims.",
        "Plain English Translation is not part of the active workflow and must never be required.",
        "Cultural Context is optional and must never lower completion or block progression.",
        "Part of Speech is an entry-level field named partOfSpeech, never a meaning-level field.",
        "Use missingRequiredFields as the source of truth for completeness.",
        `The active editorial ruleset is ${EDITORIAL_RULESET_VERSION}.`,
        "Prioritize entries with more serious or numerous gaps.",
        "The client will enforce safe status transitions, so focus on a concise reason and next editorial action.",
        "Every recommendation requires human review before publishing.",
      ].join(" "),
      text: {
        format: {
          type: "json_schema",
          name: "yerrr_batch_triage",
          strict: true,
          schema: BATCH_TRIAGE_SCHEMA,
        },
      },
      input: [
        "Triage these entries for the YERRR Studio editorial workflow.",
        "",
        "ENTRY DATA:",
        JSON.stringify(entries, null, 2),
        "",
        "Return one recommendation for every entry.",
      ].join("\n"),
    });

    const output = response.output_text.trim();

    if (!output) {
      return noStoreJson(
        { error: "The model returned an empty batch-triage response." },
        502,
      );
    }

    const parsed = JSON.parse(output) as Record<string, unknown>;
    const recommendations = validateRecommendations(parsed, entries);
    const summary =
      cleanText(parsed.summary, 1_000) ||
      `${recommendations.length} entries were triaged for editorial action.`;

    return noStoreJson({
      result: {
        summary,
        entryCount: recommendations.length,
        recommendations,
      },
      model,
    });
  } catch (error) {
    console.error("YERRR AI Batch Triage error:", error);

    return noStoreJson(
      {
        error:
          error instanceof Error
            ? error.message
            : "The AI batch-triage request failed.",
      },
      500,
    );
  }
}

import { NextResponse } from "next/server";
import OpenAI from "openai";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import {
  categoryOptions,
  partOfSpeechOptions,
  toneOptions,
  usageFrequencyOptions,
} from "@/types/entry";

import type {
  AIMissingFieldConfidence,
  AIMissingFieldSuggestion,
  AIMissingFieldsResult,
} from "@/types/aiMissingFields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FillMissingFieldsRequestBody = {
  entry?: unknown;
};

type CleanMeaning = {
  title: string;
  definition: string;
  example: string;
  category: string;
  tone: string;
  conceptsText: string;
  usageFrequency: string;
  culturalContext: string;
  source: string;
};

type CleanEntry = {
  id: string;
  word: string;
  type: string;
  slug: string;
  status: string;
  pronunciation: string;
  partOfSpeech: string;
  alternateSpellings: string;
  notes: string;
  meanings: CleanMeaning[];
};

type FieldRisk = "editorial" | "verify";

type MissingField = {
  id: string;
  fieldPath: string;
  fieldLabel: string;
  meaningIndex: number;
  currentValue: string;
  risk: FieldRisk;
  priority: number;
};

const MAX_MEANINGS = 8;
const MAX_MISSING_FIELDS = 12;

const FILL_MISSING_FIELDS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "entryId",
    "entryWord",
    "summary",
    "missingFieldCount",
    "suggestions",
    "verificationChecklist",
  ],
  properties: {
    entryId: {
      type: "string",
    },
    entryWord: {
      type: "string",
    },
    summary: {
      type: "string",
    },
    missingFieldCount: {
      type: "integer",
      minimum: 0,
      maximum: MAX_MISSING_FIELDS,
    },
    suggestions: {
      type: "array",
      maxItems: MAX_MISSING_FIELDS,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "fieldPath",
          "fieldLabel",
          "meaningIndex",
          "currentValue",
          "suggestedValue",
          "reason",
          "confidence",
          "requiresVerification",
          "verificationNote",
        ],
        properties: {
          id: {
            type: "string",
          },
          fieldPath: {
            type: "string",
          },
          fieldLabel: {
            type: "string",
          },
          meaningIndex: {
            type: "integer",
            minimum: -1,
            maximum: MAX_MEANINGS - 1,
          },
          currentValue: {
            type: "string",
          },
          suggestedValue: {
            type: "string",
          },
          reason: {
            type: "string",
          },
          confidence: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
          requiresVerification: {
            type: "boolean",
          },
          verificationNote: {
            type: "string",
          },
        },
      },
    },
    verificationChecklist: {
      type: "array",
      maxItems: 10,
      items: {
        type: "string",
      },
    },
  },
} as const;

function noStoreJson(
  body: Record<string, unknown>,
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}

function cleanText(
  value: unknown,
  maxLength = 1_000,
) {
  if (typeof value === "string") {
    return value.trim().slice(0, maxLength);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value).slice(0, maxLength);
  }

  return "";
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function readTextField(
  source: Record<string, unknown>,
  aliases: string[],
  maxLength = 1_000,
) {
  const aliasSet = new Set(
    aliases.map(normalizeKey),
  );

  for (const [key, value] of Object.entries(source)) {
    if (!aliasSet.has(normalizeKey(key))) {
      continue;
    }

    return cleanText(value, maxLength);
  }

  return "";
}

function cleanMeaning(
  value: unknown,
): CleanMeaning {
  const record =
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    title: readTextField(
      record,
      ["title", "meaningTitle", "meaning_title"],
      400,
    ),

    definition: readTextField(
      record,
      ["definition", "meaning", "gloss"],
      1_200,
    ),

    example: readTextField(
      record,
      [
        "example",
        "exampleSentence",
        "example_sentence",
        "usageExample",
        "usage_example",
      ],
      1_000,
    ),

    category: readTextField(
      record,
      ["category", "meaningCategory", "meaning_category"],
      300,
    ),

    tone: readTextField(
      record,
      ["tone", "tones"],
      300,
    ),

    conceptsText: readTextField(
      record,
      ["conceptsText", "concepts_text", "concepts"],
      800,
    ),

    usageFrequency: readTextField(
      record,
      ["usageFrequency", "usage_frequency", "frequency"],
      300,
    ),

    culturalContext: readTextField(
      record,
      ["culturalContext", "cultural_context", "context"],
      1_500,
    ),

    source: readTextField(
      record,
      ["source", "sources", "reference", "references"],
      1_000,
    ),
  };
}

function cleanEntry(
  value: unknown,
): CleanEntry | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  const record = value as Record<string, unknown>;

  const id = cleanText(record.id, 200);
  const word = cleanText(record.word, 200);

  if (!id || !word) {
    return null;
  }

  const meanings = Array.isArray(record.meanings)
    ? record.meanings
        .slice(0, MAX_MEANINGS)
        .map(cleanMeaning)
    : [];

  return {
    id,
    word,
    type: cleanText(record.type, 200),
    slug: cleanText(record.slug, 300),
    status: cleanText(record.status, 120),
    pronunciation: readTextField(
      record,
      ["pronunciation", "pronunciationGuide", "pronunciation_guide"],
      500,
    ),
    partOfSpeech: readTextField(
      record,
      ["partOfSpeech", "part_of_speech", "pos", "grammar"],
      200,
    ),
    alternateSpellings: readTextField(
      record,
      ["alternateSpellings", "alternate_spellings", "altSpellings"],
      700,
    ),
    notes: cleanText(record.notes, 1_500),
    meanings,
  };
}

function isEmpty(value: string) {
  return value.trim().length === 0;
}

function createMissingField(
  field: Omit<MissingField, "currentValue">,
): MissingField {
  return {
    ...field,
    currentValue: "",
  };
}

function detectMissingFields(
  entry: CleanEntry,
) {
  const missingFields: MissingField[] = [];

  if (isEmpty(entry.pronunciation)) {
    missingFields.push(
      createMissingField({
        id: "entry-pronunciation",
        fieldPath: "pronunciation",
        fieldLabel: "Pronunciation",
        meaningIndex: -1,
        risk: "verify",
        priority: 10,
      }),
    );
  }

  if (isEmpty(entry.partOfSpeech)) {
    missingFields.push(
      createMissingField({
        id: "entry-part-of-speech",
        fieldPath: "partOfSpeech",
        fieldLabel: "Part of Speech",
        meaningIndex: -1,
        risk: "verify",
        priority: 20,
      }),
    );
  }

  const meanings =
    entry.meanings.length > 0
      ? entry.meanings
      : [cleanMeaning({})];

  meanings.forEach((meaning, index) => {
    const meaningNumber = index + 1;
    const prefix = `meanings[${index}]`;

    if (isEmpty(meaning.title)) {
      missingFields.push(
        createMissingField({
          id: `meaning-${index}-title`,
          fieldPath: `${prefix}.title`,
          fieldLabel: `Meaning ${meaningNumber} · Meaning Title`,
          meaningIndex: index,
          risk: "editorial",
          priority: 30,
        }),
      );
    }

    if (isEmpty(meaning.definition)) {
      missingFields.push(
        createMissingField({
          id: `meaning-${index}-definition`,
          fieldPath: `${prefix}.definition`,
          fieldLabel: `Meaning ${meaningNumber} · Definition`,
          meaningIndex: index,
          risk: "editorial",
          priority: 40,
        }),
      );
    }

    if (isEmpty(meaning.example)) {
      missingFields.push(
        createMissingField({
          id: `meaning-${index}-example`,
          fieldPath: `${prefix}.example`,
          fieldLabel: `Meaning ${meaningNumber} · Example Sentence`,
          meaningIndex: index,
          risk: "editorial",
          priority: 50,
        }),
      );
    }

    if (isEmpty(meaning.category)) {
      missingFields.push(
        createMissingField({
          id: `meaning-${index}-category`,
          fieldPath: `${prefix}.category`,
          fieldLabel: `Meaning ${meaningNumber} · Category`,
          meaningIndex: index,
          risk: "editorial",
          priority: 60,
        }),
      );
    }

    if (isEmpty(meaning.tone)) {
      missingFields.push(
        createMissingField({
          id: `meaning-${index}-tone`,
          fieldPath: `${prefix}.tone`,
          fieldLabel: `Meaning ${meaningNumber} · Tone`,
          meaningIndex: index,
          risk: "verify",
          priority: 70,
        }),
      );
    }

    if (isEmpty(meaning.conceptsText)) {
      missingFields.push(
        createMissingField({
          id: `meaning-${index}-concepts`,
          fieldPath: `${prefix}.conceptsText`,
          fieldLabel: `Meaning ${meaningNumber} · Concepts`,
          meaningIndex: index,
          risk: "editorial",
          priority: 80,
        }),
      );
    }

    if (isEmpty(meaning.usageFrequency)) {
      missingFields.push(
        createMissingField({
          id: `meaning-${index}-usage-frequency`,
          fieldPath: `${prefix}.usageFrequency`,
          fieldLabel: `Meaning ${meaningNumber} · Usage Frequency`,
          meaningIndex: index,
          risk: "verify",
          priority: 90,
        }),
      );
    }
  });

  return missingFields
    .sort(
      (first, second) =>
        first.priority - second.priority,
    )
    .slice(0, MAX_MISSING_FIELDS);
}

function normalizeConfidence(
  value: unknown,
): AIMissingFieldConfidence {
  if (
    value === "high" ||
    value === "medium" ||
    value === "low"
  ) {
    return value;
  }

  return "low";
}

function cleanChecklist(
  value: unknown,
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => cleanText(item, 500))
    .filter(Boolean)
    .slice(0, 10);
}

function getDefaultVerificationNote(
  field: MissingField,
) {
  if (field.risk === "verify") {
    return "Confirm this suggestion against real NYC usage before publishing.";
  }

  return "";
}

function validateSuggestions(
  parsedValue: unknown,
  missingFields: MissingField[],
) {
  const parsedRecord =
    parsedValue &&
    typeof parsedValue === "object" &&
    !Array.isArray(parsedValue)
      ? (parsedValue as Record<string, unknown>)
      : {};

  const rawSuggestions =
    Array.isArray(parsedRecord.suggestions)
      ? parsedRecord.suggestions
      : [];

  const rawByPath = new Map<
    string,
    Record<string, unknown>
  >();

  rawSuggestions.forEach((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item)
    ) {
      return;
    }

    const record =
      item as Record<string, unknown>;

    const fieldPath = cleanText(
      record.fieldPath,
      300,
    );

    if (!fieldPath) {
      return;
    }

    rawByPath.set(fieldPath, record);
  });

  return missingFields.map(
    (
      field,
    ): AIMissingFieldSuggestion => {
      const raw =
        rawByPath.get(field.fieldPath) ?? {};

      const suggestedValue = cleanText(
        raw.suggestedValue,
        1_600,
      );

      const mustVerify =
        field.risk === "verify" ||
        raw.requiresVerification === true ||
        normalizeConfidence(raw.confidence) === "low" ||
        !suggestedValue;

      const defaultReason = suggestedValue
        ? "Drafted from the entry context and general editorial knowledge."
        : "There is not enough reliable context for a useful draft.";

      const verificationNote =
        cleanText(
          raw.verificationNote,
          700,
        ) ||
        getDefaultVerificationNote(field);

      return {
        id: field.id,
        fieldPath: field.fieldPath,
        fieldLabel: field.fieldLabel,
        meaningIndex: field.meaningIndex,
        currentValue: "",
        suggestedValue,
        reason:
          cleanText(
            raw.reason,
            900,
          ) || defaultReason,
        confidence:
          normalizeConfidence(
            raw.confidence,
          ),
        requiresVerification: mustVerify,
        verificationNote:
          verificationNote ||
          (mustVerify
            ? "Human verification is required."
            : ""),
      };
    },
  );
}

export async function POST(
  request: Request,
) {
  try {
    const supabase =
      await createSupabaseServerClient();

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
        {
          error:
            "OPENAI_API_KEY is not configured on the server.",
        },
        503,
      );
    }

    const body =
      (await request.json()) as FillMissingFieldsRequestBody;

    const entry = cleanEntry(body.entry);

    if (!entry) {
      return noStoreJson(
        {
          error:
            "A valid lexicon entry is required.",
        },
        400,
      );
    }

    const missingFields =
      detectMissingFields(entry);

    if (missingFields.length === 0) {
      const result: AIMissingFieldsResult = {
        entryId: entry.id,
        entryWord: entry.word,
        summary:
          "No supported required fields are missing.",
        missingFieldCount: 0,
        suggestions: [],
        verificationChecklist: [],
      };

      return noStoreJson({
        result,
      });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const model =
      process.env.OPENAI_MODEL ??
      "gpt-5-mini";

    const response =
      await openai.responses.create({
        model,
        store: false,

        reasoning: {
          effort: "low",
        },

        max_output_tokens: 2_600,

        instructions: [
          "You are YERRR Studio AI, an internal editorial assistant for an NYC slang lexicon.",
          "Return useful drafts only for the explicitly listed empty fields.",
          "Never rewrite an existing value.",
          "The fieldPath in every response must exactly match one of the supplied missing-field paths.",
          "You may use general knowledge of NYC and United States slang when the supplied entry is incomplete.",
          "Be conservative: do not invent an origin, etymology, date, source, community attribution, or popularity statistic.",
          "Definitions should be concise and dictionary-ready.",
          "Example sentences should sound natural but should not exaggerate stereotypes.",
          "Meaning titles should be short labels, not repeated definitions.",
          "Concepts should be a comma-separated list of two to five concise concepts.",
          `Part of Speech must use one of: ${partOfSpeechOptions.filter(Boolean).join(", ")}.`,
          `Category should use one of these built-in labels when possible: ${categoryOptions.filter(Boolean).join(", ")}.`,
          `Tone should use one of: ${toneOptions.filter(Boolean).join(", ")}.`,
          `Usage Frequency should use one of: ${usageFrequencyOptions.filter(Boolean).join(", ")}.`,
          "Pronunciation, Part of Speech, Tone, and Usage Frequency must be marked requiresVerification true.",
          "If you cannot produce a useful draft, use an empty suggestedValue and explain what is missing.",
          "Do not suggest Plain English, Cultural Context, Editorial Notes, Sources, or Verification Status.",
          "Do not claim that you changed the editor or database.",
          "Return exactly one suggestion for every listed missing field.",
        ].join(" "),

        text: {
          format: {
            type: "json_schema",
            name:
              "yerrr_fill_missing_fields",
            strict: true,
            schema:
              FILL_MISSING_FIELDS_SCHEMA,
          },
        },

        input: [
          "Draft values for the following empty lexicon fields.",
          "",
          "MISSING FIELD SPECIFICATIONS:",
          JSON.stringify(
            missingFields.map(
              ({
                priority: _priority,
                risk,
                ...field
              }) => ({
                ...field,
                requiresVerification:
                  risk === "verify",
              }),
            ),
            null,
            2,
          ),
          "",
          "ENTRY DATA:",
          JSON.stringify(entry, null, 2),
          "",
          "Return one structured suggestion per missing field.",
        ].join("\n"),
      });

    const output =
      response.output_text.trim();

    if (!output) {
      return noStoreJson(
        {
          error:
            "The model returned an empty missing-fields response.",
        },
        502,
      );
    }

    const parsed =
      JSON.parse(output) as Record<
        string,
        unknown
      >;

    const suggestions =
      validateSuggestions(
        parsed,
        missingFields,
      );

    const modelChecklist =
      cleanChecklist(
        parsed.verificationChecklist,
      );

    const suggestionChecklist =
      suggestions
        .filter(
          (suggestion) =>
            suggestion.requiresVerification,
        )
        .map((suggestion) =>
          suggestion.verificationNote
            ? `${suggestion.fieldLabel}: ${suggestion.verificationNote}`
            : `${suggestion.fieldLabel}: Human verification required.`,
        );

    const verificationChecklist =
      Array.from(
        new Set([
          ...modelChecklist,
          ...suggestionChecklist,
        ]),
      ).slice(0, 10);

    const summary =
      cleanText(parsed.summary, 1_000) ||
      `${missingFields.length} required empty fields were analyzed.`;

    const result: AIMissingFieldsResult = {
      entryId: entry.id,
      entryWord: entry.word,
      summary,
      missingFieldCount:
        missingFields.length,
      suggestions,
      verificationChecklist,
    };

    return noStoreJson({
      result,
      model,
    });
  } catch (error) {
    console.error(
      "YERRR AI Fill Missing Fields error:",
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : "The AI missing-fields request failed.";

    return noStoreJson(
      {
        error: message,
      },
      500,
    );
  }
}

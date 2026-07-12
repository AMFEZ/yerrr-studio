import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  createClient as createSupabaseServerClient,
} from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AssistantRole = "user" | "assistant";

type AssistantMessage = {
  role: AssistantRole;
  content: string;
};

type ContextMeaning = {
  partOfSpeech?: string;
  definition?: string;
  plainEnglish?: string;
  example?: string;
  culturalContext?: string;
  tone?: string;
  usageFrequency?: string;
};

type ContextEntry = {
  id: string;
  word: string;
  slug?: string;
  status?: string;
  pronunciation?: string;
  alternateSpellings?: string;
  meanings?: ContextMeaning[];
};

type AssistantRequestBody = {
  messages?: AssistantMessage[];
  contextEntries?: ContextEntry[];
};

const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 2_500;
const MAX_CONTEXT_ENTRIES = 20;
const MAX_MEANINGS_PER_ENTRY = 4;

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
  maxLength = MAX_MESSAGE_LENGTH,
) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function cleanMessages(
  value: unknown,
): AssistantMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(-MAX_MESSAGES)
    .map((message) => {
      if (
        !message ||
        typeof message !== "object"
      ) {
        return null;
      }

      const record = message as Record<
        string,
        unknown
      >;

      const role =
        record.role === "assistant"
          ? "assistant"
          : record.role === "user"
            ? "user"
            : null;

      const content = cleanText(record.content);

      if (!role || !content) {
        return null;
      }

      return {
        role,
        content,
      } satisfies AssistantMessage;
    })
    .filter(
      (
        message,
      ): message is AssistantMessage =>
        message !== null,
    );
}

function cleanMeaning(
  value: unknown,
): ContextMeaning | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<
    string,
    unknown
  >;

  const meaning: ContextMeaning = {
    partOfSpeech: cleanText(
      record.partOfSpeech,
      120,
    ),
    definition: cleanText(
      record.definition,
      800,
    ),
    plainEnglish: cleanText(
      record.plainEnglish,
      600,
    ),
    example: cleanText(record.example, 600),
    culturalContext: cleanText(
      record.culturalContext,
      800,
    ),
    tone: cleanText(record.tone, 200),
    usageFrequency: cleanText(
      record.usageFrequency,
      200,
    ),
  };

  const hasContent = Object.values(
    meaning,
  ).some(Boolean);

  return hasContent ? meaning : null;
}

function cleanContextEntries(
  value: unknown,
): ContextEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const contextEntries: ContextEntry[] = [];

  for (const entry of value.slice(
    0,
    MAX_CONTEXT_ENTRIES,
  )) {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry)
    ) {
      continue;
    }

    const record =
      entry as Record<string, unknown>;

    const id = cleanText(
      record.id,
      200,
    );

    const word = cleanText(
      record.word,
      200,
    );

    if (!id || !word) {
      continue;
    }

    const meanings: ContextMeaning[] =
      Array.isArray(record.meanings)
        ? record.meanings
            .slice(
              0,
              MAX_MEANINGS_PER_ENTRY,
            )
            .map(cleanMeaning)
            .filter(
              (
                meaning,
              ): meaning is ContextMeaning =>
                meaning !== null,
            )
        : [];

    const contextEntry: ContextEntry = {
      id,
      word,

      slug: cleanText(
        record.slug,
        200,
      ),

      status: cleanText(
        record.status,
        120,
      ),

      pronunciation: cleanText(
        record.pronunciation,
        300,
      ),

      alternateSpellings: cleanText(
        record.alternateSpellings,
        400,
      ),

      meanings,
    };

    contextEntries.push(contextEntry);
  }

  return contextEntries;
}

function buildConversationInput(
  messages: AssistantMessage[],
  contextEntries: ContextEntry[],
) {
  const transcript = messages
    .map(
      (message) =>
        `${message.role.toUpperCase()}:\n${message.content}`,
    )
    .join("\n\n");

  const context =
    contextEntries.length > 0
      ? JSON.stringify(contextEntries, null, 2)
      : "No matching lexicon entries were supplied.";

  return [
    "LEXICON CONTEXT:",
    context,
    "",
    "CONVERSATION:",
    transcript,
    "",
    "Answer the latest USER message.",
  ].join("\n");
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
      (await request.json()) as AssistantRequestBody;

    const messages = cleanMessages(
      body.messages,
    );

    const contextEntries =
      cleanContextEntries(
        body.contextEntries,
      );

    const latestMessage =
      messages.at(-1);

    if (
      !latestMessage ||
      latestMessage.role !== "user"
    ) {
      return noStoreJson(
        {
          error:
            "A user message is required.",
        },
        400,
      );
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const model =
      process.env.OPENAI_MODEL ??
      "gpt-5.6-luna";

    const response =
      await openai.responses.create({
        model,
        reasoning: {
          effort: "low",
        },
        max_output_tokens: 1_000,
        instructions: [
          "You are YERRR Studio AI, an internal editorial assistant for an NYC slang lexicon.",
          "Use the supplied lexicon context as your primary evidence.",
          "Never invent definitions, etymologies, cultural claims, citations, or relationships.",
          "Clearly separate facts present in the context from editorial suggestions.",
          "When the context is insufficient, say what is missing and recommend what an editor should verify.",
          "Do not claim that you changed the database. You may propose edits, but every write requires human review.",
          "Preserve NYC language and cultural nuance without stereotyping or flattening communities.",
          "Use readable plain text with compact headings when useful.",
        ].join(" "),
        input: buildConversationInput(
          messages,
          contextEntries,
        ),
      });

    const reply =
      response.output_text.trim();

    if (!reply) {
      return noStoreJson(
        {
          error:
            "The model returned an empty response.",
        },
        502,
      );
    }

    return noStoreJson({
      reply,
      model,
      contextEntryIds:
        contextEntries.map(
          (entry) => entry.id,
        ),
    });
  } catch (error) {
    console.error(
      "YERRR AI Assistant error:",
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : "The AI Assistant request failed.";

    return noStoreJson(
      {
        error: message,
      },
      500,
    );
  }
}
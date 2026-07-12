"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import type { Entry } from "@/types/entry";

type AIAssistantDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  entries?: Entry[];
  onOpenEntry?: (entry: Entry) => void;
};

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  contextEntryIds?: string[];
  isError?: boolean;
};

type CompactMeaning = {
  partOfSpeech?: string;
  definition?: string;
  plainEnglish?: string;
  example?: string;
  culturalContext?: string;
  tone?: string;
  usageFrequency?: string;
};

type CompactEntry = {
  id: string;
  word: string;
  slug?: string;
  status?: string;
  pronunciation?: string;
  alternateSpellings?: string;
  meanings?: CompactMeaning[];
};

type AssistantResponse = {
  reply?: string;
  model?: string;
  contextEntryIds?: string[];
  error?: string;
};

const MAX_CONTEXT_ENTRIES = 20;

const QUICK_PROMPTS = [
  "Explain the difference between two similar entries and note where the lexicon needs more evidence.",
  "Review an entry for unclear wording, missing cultural context, and weak examples.",
  "Suggest a cleaner plain-English definition without changing the slang meaning.",
];

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "what",
  "which",
  "with",
]);

function createId() {
  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectStrings(
  value: unknown,
  output: string[] = [],
  visited = new Set<object>(),
) {
  if (typeof value === "string") {
    if (value.trim()) {
      output.push(value.trim());
    }

    return output;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    output.push(String(value));
    return output;
  }

  if (!value || typeof value !== "object") {
    return output;
  }

  if (visited.has(value)) {
    return output;
  }

  visited.add(value);

  if (Array.isArray(value)) {
    value.forEach((item) =>
      collectStrings(item, output, visited),
    );

    return output;
  }

  Object.values(value).forEach((item) =>
    collectStrings(item, output, visited),
  );

  return output;
}

function readField(
  source: unknown,
  aliases: string[],
) {
  if (!source || typeof source !== "object") {
    return "";
  }

  const aliasSet = new Set(
    aliases.map((alias) =>
      alias
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ""),
    ),
  );

  for (const [key, value] of Object.entries(
    source as Record<string, unknown>,
  )) {
    const normalizedKey = key
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    if (
      aliasSet.has(normalizedKey) &&
      typeof value === "string"
    ) {
      return value.trim();
    }
  }

  return "";
}

function compactMeaning(
  meaning: unknown,
): CompactMeaning {
  return {
    partOfSpeech: readField(meaning, [
      "partOfSpeech",
      "part_of_speech",
      "pos",
      "grammar",
    ]),
    definition: readField(meaning, [
      "definition",
      "meaning",
      "gloss",
    ]),
    plainEnglish: readField(meaning, [
      "plainEnglish",
      "plain_english",
      "plainMeaning",
    ]),
    example: readField(meaning, [
      "exampleSentence",
      "example_sentence",
      "example",
      "usageExample",
    ]),
    culturalContext: readField(meaning, [
      "culturalContext",
      "cultural_context",
      "culture",
      "context",
    ]),
    tone: readField(meaning, [
      "tone",
      "tones",
    ]),
    usageFrequency: readField(meaning, [
      "usageFrequency",
      "usage_frequency",
      "frequency",
    ]),
  };
}

function compactEntry(
  entry: Entry,
): CompactEntry {
  const entryRecord =
    entry as unknown as Record<string, unknown>;

  const meanings = Array.isArray(
    entry.meanings,
  )
    ? entry.meanings
        .slice(0, 4)
        .map(compactMeaning)
    : [];

  return {
    id: String(entry.id),
    word: String(entry.word ?? ""),
    slug: String(entry.slug ?? ""),
    status: String(entry.status ?? ""),
    pronunciation: String(
      entry.pronunciation ?? "",
    ),
    alternateSpellings: String(
      entry.alternateSpellings ?? "",
    ),
    meanings,
    ...("concepts" in entryRecord
      ? {
          concepts: entryRecord.concepts,
        }
      : {}),
  } as CompactEntry;
}

function scoreEntry(
  entry: Entry,
  prompt: string,
) {
  const normalizedPrompt =
    normalize(prompt);

  const tokens = normalizedPrompt
    .split(" ")
    .filter(
      (token) =>
        token.length > 1 &&
        !STOP_WORDS.has(token),
    );

  const word = normalize(entry.word);
  const slug = normalize(entry.slug);
  const allText = normalize(
    collectStrings(entry).join(" "),
  );

  let score = 0;

  if (
    normalizedPrompt &&
    word === normalizedPrompt
  ) {
    score += 300;
  }

  if (
    normalizedPrompt &&
    normalizedPrompt.includes(word) &&
    word.length > 1
  ) {
    score += 120;
  }

  tokens.forEach((token) => {
    if (word === token) {
      score += 100;
    } else if (word.startsWith(token)) {
      score += 55;
    } else if (word.includes(token)) {
      score += 35;
    }

    if (slug.includes(token)) {
      score += 20;
    }

    if (allText.includes(token)) {
      score += 6;
    }
  });

  return score;
}

function selectContextEntries(
  entries: Entry[],
  prompt: string,
) {
  const ranked = entries
    .map((entry) => ({
      entry,
      score: scoreEntry(entry, prompt),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return String(
        a.entry.word,
      ).localeCompare(String(b.entry.word));
    });

  const positiveMatches = ranked.filter(
    (item) => item.score > 0,
  );

  const selected =
    positiveMatches.length > 0
      ? positiveMatches
      : ranked;

  return selected
    .slice(0, MAX_CONTEXT_ENTRIES)
    .map((item) => compactEntry(item.entry));
}

function getErrorMessage(
  value: unknown,
) {
  if (value instanceof Error) {
    return value.message;
  }

  return "The AI Assistant request failed.";
}

export function AIAssistantDrawer({
  isOpen,
  onClose,
  entries = [],
  onOpenEntry,
}: AIAssistantDrawerProps) {
  const [messages, setMessages] = useState<
    ChatMessage[]
  >([]);

  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] =
    useState(false);

  const [modelLabel, setModelLabel] =
    useState("");

  const textareaRef =
    useRef<HTMLTextAreaElement | null>(null);

  const scrollRef =
    useRef<HTMLDivElement | null>(null);

  const abortRef =
    useRef<AbortController | null>(null);

  const entryById = useMemo(() => {
    return new Map(
      entries.map((entry) => [
        String(entry.id),
        entry,
      ]),
    );
  }, [entries]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const focusFrame =
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });

    function handleEscape(
      event: globalThis.KeyboardEvent,
    ) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener(
      "keydown",
      handleEscape,
    );

    return () => {
      window.cancelAnimationFrame(
        focusFrame,
      );

      window.removeEventListener(
        "keydown",
        handleEscape,
      );

      document.body.style.overflow =
        previousOverflow;
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isSending]);

  async function sendMessage(
    promptOverride?: string,
  ) {
    const prompt = (
      promptOverride ?? draft
    ).trim();

    if (!prompt || isSending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: prompt,
    };

    const nextMessages = [
      ...messages,
      userMessage,
    ].slice(-12);

    const contextEntries =
      selectContextEntries(entries, prompt);

    setMessages(nextMessages);
    setDraft("");
    setIsSending(true);

    const controller =
      new AbortController();

    abortRef.current = controller;

    try {
      const response = await fetch(
        "/api/ai-assistant",
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            messages: nextMessages.map(
              (message) => ({
                role: message.role,
                content: message.content,
              }),
            ),
            contextEntries,
          }),
          signal: controller.signal,
        },
      );

      const data =
        (await response.json()) as AssistantResponse;

      if (!response.ok || !data.reply) {
        throw new Error(
          data.error ??
            "The AI Assistant returned an error.",
        );
      }

      setModelLabel(data.model ?? "");

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createId(),
          role: "assistant",
          content: data.reply ?? "",
          contextEntryIds:
            data.contextEntryIds ?? [],
        },
      ]);
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        return;
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createId(),
          role: "assistant",
          content: getErrorMessage(error),
          isError: true,
        },
      ]);
    } finally {
      abortRef.current = null;
      setIsSending(false);

      window.requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
  }

  function stopResponse() {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsSending(false);
  }

  function clearConversation() {
    stopResponse();
    setMessages([]);
    setDraft("");
    setModelLabel("");

    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }

  function handleComposerKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function openContextEntry(
    entryId: string,
  ) {
    const entry = entryById.get(entryId);

    if (!entry || !onOpenEntry) {
      return;
    }

    onClose();
    onOpenEntry(entry);
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close AI Assistant"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-assistant-title"
        className="absolute bottom-0 right-0 flex h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-neutral-800 bg-neutral-950 shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-w-2xl md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0"
      >
        <header className="flex items-start justify-between gap-4 border-b border-neutral-800 bg-neutral-950/95 p-5 backdrop-blur sm:p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-400">
              Phase 5 AI
            </p>

            <h2
              id="ai-assistant-title"
              className="mt-2 text-2xl font-black text-white"
            >
              YERRR Studio AI
            </h2>

            <p className="mt-2 text-sm leading-6 text-neutral-500">
              Grounded editorial help using
              matching lexicon entries. Suggestions
              never write to Supabase automatically.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-black text-neutral-300 hover:border-neutral-700 hover:text-white"
          >
            ✕
          </button>
        </header>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6"
        >
          {messages.length === 0 ? (
            <div className="space-y-5">
              <section className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-5">
                <p className="font-black text-yellow-100">
                  Alpha 5.0 foundation
                </p>

                <p className="mt-2 text-sm leading-6 text-yellow-100/70">
                  Ask about definitions, examples,
                  cultural context, editorial gaps,
                  tone, or differences between
                  entries. Name the relevant slang
                  terms for the strongest grounding.
                </p>
              </section>

              <section>
                <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-neutral-500">
                  Try a prompt
                </p>

                <div className="space-y-2">
                  {QUICK_PROMPTS.map(
                    (quickPrompt) => (
                      <button
                        key={quickPrompt}
                        type="button"
                        onClick={() =>
                          setDraft(quickPrompt)
                        }
                        className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-left text-sm font-bold leading-6 text-neutral-300 transition hover:border-yellow-400 hover:text-yellow-100"
                      >
                        {quickPrompt}
                      </button>
                    ),
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500">
                  Guardrails
                </p>

                <p className="mt-2 text-sm leading-6 text-neutral-400">
                  AI output is a draft. Verify
                  definitions, origins, cultural
                  claims, and source quality before
                  publishing.
                </p>
              </section>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`rounded-3xl border p-4 sm:p-5 ${
                    message.role === "user"
                      ? "ml-6 border-yellow-400/20 bg-yellow-400/10"
                      : message.isError
                        ? "mr-6 border-red-400/20 bg-red-400/10"
                        : "mr-6 border-neutral-800 bg-neutral-900"
                  }`}
                >
                  <p
                    className={`text-xs font-black uppercase tracking-[0.2em] ${
                      message.role === "user"
                        ? "text-yellow-300"
                        : message.isError
                          ? "text-red-300"
                          : "text-neutral-500"
                    }`}
                  >
                    {message.role === "user"
                      ? "You"
                      : message.isError
                        ? "Assistant error"
                        : "YERRR Studio AI"}
                  </p>

                  <div
                    className={`mt-3 whitespace-pre-wrap text-sm leading-7 ${
                      message.isError
                        ? "text-red-100"
                        : "text-neutral-200"
                    }`}
                  >
                    {message.content}
                  </div>

                  {message.contextEntryIds &&
                    message.contextEntryIds
                      .length > 0 && (
                      <div className="mt-4 border-t border-neutral-800 pt-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-600">
                          Context used
                        </p>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {message.contextEntryIds
                            .slice(0, 12)
                            .map((entryId) => {
                              const entry =
                                entryById.get(
                                  entryId,
                                );

                              if (!entry) {
                                return null;
                              }

                              return (
                                <button
                                  key={entryId}
                                  type="button"
                                  onClick={() =>
                                    openContextEntry(
                                      entryId,
                                    )
                                  }
                                  className="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs font-bold text-neutral-300 hover:border-yellow-400 hover:text-yellow-200"
                                >
                                  {entry.word}
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    )}
                </article>
              ))}

              {isSending && (
                <div className="mr-6 rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                  <div className="flex items-center gap-3">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-yellow-400 border-t-transparent" />

                    <p className="text-sm font-bold text-neutral-300">
                      Reviewing lexicon context...
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="border-t border-neutral-800 bg-neutral-950 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-green-400/20 bg-green-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-green-100">
                Server API
              </span>

              {modelLabel && (
                <span className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-[10px] font-black text-neutral-500">
                  {modelLabel}
                </span>
              )}
            </div>

            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearConversation}
                className="text-xs font-bold text-neutral-500 hover:text-white"
              >
                Clear conversation
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-2 focus-within:border-yellow-400">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) =>
                setDraft(event.target.value)
              }
              onKeyDown={
                handleComposerKeyDown
              }
              rows={3}
              maxLength={2_500}
              placeholder="Ask about an entry, compare terms, or request an editorial review..."
              className="min-h-24 w-full resize-none bg-transparent px-3 py-2 text-sm leading-6 text-white outline-none placeholder:text-neutral-600"
            />

            <div className="flex items-center justify-between gap-3 px-2 pb-1">
              <p className="text-[10px] text-neutral-600">
                Enter sends · Shift+Enter adds a
                line
              </p>

              {isSending ? (
                <button
                  type="button"
                  onClick={stopResponse}
                  className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2 text-xs font-black text-red-100 hover:bg-red-400/20"
                >
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    void sendMessage()
                  }
                  disabled={!draft.trim()}
                  className="rounded-xl bg-yellow-400 px-4 py-2 text-xs font-black text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Ask AI
                </button>
              )}
            </div>
          </div>
        </footer>
      </aside>
    </div>
  );
}

export default AIAssistantDrawer;
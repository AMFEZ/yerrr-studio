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

type AssistantMode = "chat" | "review";
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
  sources?: string;
  editorialNotes?: string;
  verificationStatus?: string;
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

type ReviewReadiness =
  | "not_ready"
  | "needs_editor_review"
  | "ready_after_verification";

type ReviewSeverity =
  | "low"
  | "medium"
  | "high";

type ReviewConfidence =
  | "low"
  | "medium"
  | "high";

type EntryReviewIssue = {
  category: string;
  severity: ReviewSeverity;
  finding: string;
  recommendation: string;
};

type EntryReviewSuggestion = {
  field: string;
  currentValue: string;
  suggestedValue: string;
  reason: string;
  confidence: ReviewConfidence;
};

type EntryReview = {
  entryId: string;
  entryWord: string;
  qualityScore: number;
  publishReadiness: ReviewReadiness;
  summary: string;
  strengths: string[];
  issues: EntryReviewIssue[];
  suggestedEdits: EntryReviewSuggestion[];
  verificationChecklist: string[];
};

type ReviewResponse = {
  review?: EntryReview;
  model?: string;
  error?: string;
};

type ReviewDecision =
  | "pending"
  | "approved"
  | "rejected";

type StoredEntryReview = {
  id: string;
  createdAt: string;
  model?: string;
  review: EntryReview;
  decisions?: Record<
    string,
    ReviewDecision
  >;
};

const MAX_CONTEXT_ENTRIES = 20;
const REVIEW_HISTORY_LIMIT = 30;
const REVIEW_HISTORY_STORAGE_KEY =
  "yerrr-studio-ai-review-history";

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
      "usage_example",
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
    sources: readField(meaning, [
      "sources",
      "source",
      "citations",
      "references",
    ]),
    editorialNotes: readField(meaning, [
      "editorialNotes",
      "editorial_notes",
      "notes",
    ]),
    verificationStatus: readField(meaning, [
      "verificationStatus",
      "verification_status",
      "verified",
    ]),
  };
}

function compactEntry(
  entry: Entry,
): CompactEntry {
  const meanings = Array.isArray(
    entry.meanings,
  )
    ? entry.meanings
        .slice(0, 8)
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
  };
}

function scoreEntry(
  entry: Entry,
  prompt: string,
) {
  const normalizedPrompt = normalize(prompt);

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

  return "The AI request failed.";
}

function titleCaseToken(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function readinessLabel(
  readiness: ReviewReadiness,
) {
  if (readiness === "not_ready") {
    return "Not ready";
  }

  if (
    readiness === "ready_after_verification"
  ) {
    return "Ready after verification";
  }

  return "Needs editor review";
}

function getSuggestionKey(
  edit: EntryReviewSuggestion,
  index: number,
) {
  return [
    index,
    normalize(edit.field),
    normalize(edit.suggestedValue).slice(
      0,
      80,
    ),
  ].join(":");
}

function createPendingDecisions(
  review: EntryReview,
) {
  return Object.fromEntries(
    review.suggestedEdits.map(
      (edit, index) => [
        getSuggestionKey(edit, index),
        "pending" as ReviewDecision,
      ],
    ),
  );
}

function formatApprovedEditsAsText(
  review: EntryReview,
  decisions: Record<
    string,
    ReviewDecision
  >,
) {
  const approvedEdits =
    review.suggestedEdits.filter(
      (edit, index) =>
        decisions[
          getSuggestionKey(edit, index)
        ] === "approved",
    );

  if (approvedEdits.length === 0) {
    return [
      `YERRR Studio approved AI edits: ${review.entryWord}`,
      "",
      "No suggestions have been approved yet.",
    ].join("\n");
  }

  return [
    `YERRR Studio approved AI edits: ${review.entryWord}`,
    `Approved changes: ${approvedEdits.length}`,
    "",
    ...approvedEdits.flatMap(
      (edit, index) => [
        `${index + 1}. ${titleCaseToken(edit.field)}`,
        `Current: ${edit.currentValue || "(empty)"}`,
        `Approved suggestion: ${edit.suggestedValue || "(no replacement text)"}`,
        `Reason: ${edit.reason}`,
        `Confidence: ${edit.confidence}`,
        "",
      ],
    ),
    "Human verification is still required before saving.",
  ].join("\n");
}

function formatReviewAsText(
  review: EntryReview,
) {
  const strengths = review.strengths
    .map((item) => `- ${item}`)
    .join("\n");

  const issues = review.issues
    .map(
      (issue, index) =>
        `${index + 1}. [${issue.severity.toUpperCase()}] ${titleCaseToken(issue.category)}\nFinding: ${issue.finding}\nRecommendation: ${issue.recommendation}`,
    )
    .join("\n\n");

  const edits = review.suggestedEdits
    .map(
      (edit, index) =>
        `${index + 1}. ${edit.field}\nCurrent: ${edit.currentValue || "(empty)"}\nSuggested: ${edit.suggestedValue || "(no replacement proposed)"}\nReason: ${edit.reason}\nConfidence: ${edit.confidence}`,
    )
    .join("\n\n");

  const checklist =
    review.verificationChecklist
      .map((item) => `- ${item}`)
      .join("\n");

  return [
    `YERRR Studio AI Entry Review: ${review.entryWord}`,
    `Quality score: ${review.qualityScore}/100`,
    `Publish readiness: ${readinessLabel(review.publishReadiness)}`,
    "",
    "Summary",
    review.summary,
    "",
    "Strengths",
    strengths || "- None identified",
    "",
    "Issues",
    issues || "No issues identified.",
    "",
    "Suggested edits",
    edits || "No direct edits proposed.",
    "",
    "Verification checklist",
    checklist || "- No additional checks listed",
  ].join("\n");
}

function formatReviewDate(
  value: string,
) {
  return new Intl.DateTimeFormat(
    undefined,
    {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
  ).format(new Date(value));
}

function downloadJsonFile(
  filename: string,
  value: unknown,
) {
  const blob = new Blob(
    [JSON.stringify(value, null, 2)],
    {
      type: "application/json",
    },
  );

  const url =
    URL.createObjectURL(blob);
  const link =
    document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function severityClasses(
  severity: ReviewSeverity,
) {
  if (severity === "high") {
    return "border-red-400/30 bg-red-400/10 text-red-100";
  }

  if (severity === "medium") {
    return "border-yellow-400/30 bg-yellow-400/10 text-yellow-100";
  }

  return "border-blue-400/20 bg-blue-400/10 text-blue-100";
}

export function AIAssistantDrawer({
  isOpen,
  onClose,
  entries = [],
  onOpenEntry,
}: AIAssistantDrawerProps) {
  const [mode, setMode] =
    useState<AssistantMode>("chat");

  const [messages, setMessages] = useState<
    ChatMessage[]
  >([]);

  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] =
    useState(false);
  const [modelLabel, setModelLabel] =
    useState("");

  const [reviewQuery, setReviewQuery] =
    useState("");
  const [selectedReviewEntryId, setSelectedReviewEntryId] =
    useState("");
  const [review, setReview] =
    useState<EntryReview | null>(null);
  const [reviewError, setReviewError] =
    useState("");
  const [isReviewing, setIsReviewing] =
    useState(false);
  const [reviewModelLabel, setReviewModelLabel] =
    useState("");
  const [copiedLabel, setCopiedLabel] =
    useState("");

  const [
    reviewHistory,
    setReviewHistory,
  ] = useState<StoredEntryReview[]>([]);
  const [
    isReviewHistoryHydrated,
    setIsReviewHistoryHydrated,
  ] = useState(false);
  const [historyQuery, setHistoryQuery] =
    useState("");

  const [
    activeReviewHistoryId,
    setActiveReviewHistoryId,
  ] = useState("");
  const [
    reviewDecisions,
    setReviewDecisions,
  ] = useState<
    Record<string, ReviewDecision>
  >({});

  const textareaRef =
    useRef<HTMLTextAreaElement | null>(null);
  const scrollRef =
    useRef<HTMLDivElement | null>(null);
  const chatAbortRef =
    useRef<AbortController | null>(null);
  const reviewAbortRef =
    useRef<AbortController | null>(null);

  const entryById = useMemo(() => {
    return new Map(
      entries.map((entry) => [
        String(entry.id),
        entry,
      ]),
    );
  }, [entries]);

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) =>
      String(a.word).localeCompare(
        String(b.word),
      ),
    );
  }, [entries]);

  const filteredReviewEntries = useMemo(() => {
    const query = normalize(reviewQuery);

    if (!query) {
      return sortedEntries;
    }

    return sortedEntries.filter((entry) => {
      return [
        entry.word,
        entry.slug,
        entry.alternateSpellings,
      ].some((value) =>
        normalize(value).includes(query),
      );
    });
  }, [reviewQuery, sortedEntries]);

  const selectedReviewEntry = useMemo(() => {
    return selectedReviewEntryId
      ? entryById.get(selectedReviewEntryId) ??
          null
      : null;
  }, [entryById, selectedReviewEntryId]);

  const filteredReviewHistory =
    useMemo(() => {
      const query =
        normalize(historyQuery);

      if (!query) {
        return reviewHistory;
      }

      return reviewHistory.filter(
        (item) => {
          const searchableText =
            normalize([
              item.review.entryWord,
              item.review.summary,
              item.review.publishReadiness,
              item.review.qualityScore,
            ].join(" "));

          return searchableText.includes(
            query,
          );
        },
      );
    }, [historyQuery, reviewHistory]);

  const reviewDecisionCounts =
    useMemo(() => {
      if (!review) {
        return {
          approved: 0,
          rejected: 0,
          pending: 0,
        };
      }

      return review.suggestedEdits.reduce(
        (counts, edit, index) => {
          const decision =
            reviewDecisions[
              getSuggestionKey(
                edit,
                index,
              )
            ] ?? "pending";

          counts[decision] += 1;
          return counts;
        },
        {
          approved: 0,
          rejected: 0,
          pending: 0,
        },
      );
    }, [review, reviewDecisions]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const focusFrame =
      window.requestAnimationFrame(() => {
        if (mode === "chat") {
          textareaRef.current?.focus();
        }
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
      chatAbortRef.current?.abort();
      reviewAbortRef.current?.abort();
    };
  }, [isOpen, mode, onClose]);

  useEffect(() => {
    if (mode !== "chat") return;

    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isSending, mode]);

  useEffect(() => {
    try {
      const rawHistory =
        window.localStorage.getItem(
          REVIEW_HISTORY_STORAGE_KEY,
        );

      if (!rawHistory) {
        setReviewHistory([]);
        return;
      }

      const parsedHistory =
        JSON.parse(rawHistory) as unknown;

      if (Array.isArray(parsedHistory)) {
        setReviewHistory(
          parsedHistory
            .filter(
              (
                item,
              ): item is StoredEntryReview =>
                Boolean(
                  item &&
                    typeof item ===
                      "object" &&
                    "id" in item &&
                    "createdAt" in item &&
                    "review" in item,
                ),
            )
            .slice(
              0,
              REVIEW_HISTORY_LIMIT,
            ),
        );
      }
    } catch {
      setReviewHistory([]);
    } finally {
      setIsReviewHistoryHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isReviewHistoryHydrated) {
      return;
    }

    window.localStorage.setItem(
      REVIEW_HISTORY_STORAGE_KEY,
      JSON.stringify(reviewHistory),
    );
  }, [
    isReviewHistoryHydrated,
    reviewHistory,
  ]);

  useEffect(() => {
    if (
      selectedReviewEntryId &&
      !entryById.has(selectedReviewEntryId)
    ) {
      setSelectedReviewEntryId("");
      setReview(null);
    }
  }, [entryById, selectedReviewEntryId]);

  useEffect(() => {
    setReview((currentReview) => {
      if (
        currentReview?.entryId ===
        selectedReviewEntryId
      ) {
        return currentReview;
      }

      return null;
    });

    setReviewError("");
    setCopiedLabel("");
  }, [selectedReviewEntryId]);

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

    chatAbortRef.current = controller;

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
      chatAbortRef.current = null;
      setIsSending(false);

      window.requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
  }

  function selectReviewEntry(
    entryId: string,
  ) {
    setSelectedReviewEntryId(entryId);
    setReview(null);
    setReviewError("");
    setReviewModelLabel("");
    setCopiedLabel("");
    setActiveReviewHistoryId("");
    setReviewDecisions({});
  }

  async function runEntryReview() {
    if (
      !selectedReviewEntry ||
      isReviewing
    ) {
      return;
    }

    setIsReviewing(true);
    setReviewError("");
    setReview(null);
    setCopiedLabel("");

    const controller =
      new AbortController();

    reviewAbortRef.current = controller;

    try {
      const response = await fetch(
        "/api/ai-entry-review",
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            entry: compactEntry(
              selectedReviewEntry,
            ),
          }),
          signal: controller.signal,
        },
      );

      const data =
        (await response.json()) as ReviewResponse;

      if (!response.ok || !data.review) {
        throw new Error(
          data.error ??
            "The AI entry review returned an error.",
        );
      }

      setReview(data.review);
      setReviewModelLabel(data.model ?? "");

      const initialDecisions =
        createPendingDecisions(
          data.review,
        );

      const storedReview: StoredEntryReview = {
        id: createId(),
        createdAt:
          new Date().toISOString(),
        model: data.model ?? "",
        review: data.review,
        decisions: initialDecisions,
      };

      setActiveReviewHistoryId(
        storedReview.id,
      );
      setReviewDecisions(
        initialDecisions,
      );

      setReviewHistory(
        (currentHistory) => [
          storedReview,
          ...currentHistory,
        ].slice(
          0,
          REVIEW_HISTORY_LIMIT,
        ),
      );
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        return;
      }

      setReviewError(getErrorMessage(error));
    } finally {
      reviewAbortRef.current = null;
      setIsReviewing(false);
    }
  }

  function stopResponse() {
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    setIsSending(false);
  }

  function stopReview() {
    reviewAbortRef.current?.abort();
    reviewAbortRef.current = null;
    setIsReviewing(false);
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

  function openEntry(entry: Entry) {
    if (!onOpenEntry) return;

    onClose();
    onOpenEntry(entry);
  }

  function openContextEntry(
    entryId: string,
  ) {
    const entry = entryById.get(entryId);

    if (!entry) return;
    openEntry(entry);
  }

  function viewStoredReview(
    item: StoredEntryReview,
  ) {
    setSelectedReviewEntryId(
      item.review.entryId,
    );
    setReview(item.review);
    setReviewModelLabel(
      item.model ?? "",
    );
    setActiveReviewHistoryId(item.id);
    setReviewDecisions(
      item.decisions ??
        createPendingDecisions(
          item.review,
        ),
    );
    setReviewError("");
    setCopiedLabel("");
  }

  function updateDecisionHistory(
    nextDecisions: Record<
      string,
      ReviewDecision
    >,
  ) {
    if (!activeReviewHistoryId) {
      return;
    }

    setReviewHistory(
      (currentHistory) =>
        currentHistory.map((item) =>
          item.id ===
          activeReviewHistoryId
            ? {
                ...item,
                decisions:
                  nextDecisions,
              }
            : item,
        ),
    );
  }

  function setSuggestionDecision(
    edit: EntryReviewSuggestion,
    index: number,
    decision: ReviewDecision,
  ) {
    const suggestionKey =
      getSuggestionKey(edit, index);

    setReviewDecisions(
      (currentDecisions) => {
        const nextDecisions = {
          ...currentDecisions,
          [suggestionKey]: decision,
        };

        updateDecisionHistory(
          nextDecisions,
        );

        return nextDecisions;
      },
    );
  }

  function approveHighConfidence() {
    if (!review) return;

    const nextDecisions = {
      ...reviewDecisions,
    };

    review.suggestedEdits.forEach(
      (edit, index) => {
        if (
          edit.confidence === "high" &&
          edit.suggestedValue.trim()
        ) {
          nextDecisions[
            getSuggestionKey(
              edit,
              index,
            )
          ] = "approved";
        }
      },
    );

    setReviewDecisions(nextDecisions);
    updateDecisionHistory(
      nextDecisions,
    );
  }

  function resetSuggestionDecisions() {
    if (!review) return;

    const nextDecisions =
      createPendingDecisions(review);

    setReviewDecisions(nextDecisions);
    updateDecisionHistory(
      nextDecisions,
    );
  }

  function exportApprovedPlan() {
    if (!review) return;

    const approvedEdits =
      review.suggestedEdits.filter(
        (edit, index) =>
          reviewDecisions[
            getSuggestionKey(
              edit,
              index,
            )
          ] === "approved",
      );

    const dateSlug =
      new Date()
        .toISOString()
        .replace(/[:.]/g, "-");

    downloadJsonFile(
      `yerrr-approved-ai-edits-${normalize(
        review.entryWord,
      ).replace(/\s+/g, "-")}-${dateSlug}.json`,
      {
        app: "YERRR Studio",
        version: "Alpha 5.3",
        exportType:
          "approved_ai_edit_plan",
        exportedAt:
          new Date().toISOString(),
        entryId: review.entryId,
        entryWord:
          review.entryWord,
        qualityScore:
          review.qualityScore,
        publishReadiness:
          review.publishReadiness,
        approvedEditCount:
          approvedEdits.length,
        approvedEdits,
        verificationChecklist:
          review.verificationChecklist,
        note:
          "This is an editorial approval plan. No Supabase changes were made.",
      },
    );
  }

  function deleteStoredReview(
    reviewId: string,
  ) {
    setReviewHistory(
      (currentHistory) =>
        currentHistory.filter(
          (item) =>
            item.id !== reviewId,
        ),
    );

    if (
      activeReviewHistoryId ===
      reviewId
    ) {
      setActiveReviewHistoryId("");
    }
  }

  function clearReviewHistory() {
    const confirmed = window.confirm(
      "Clear all locally saved AI entry reviews?",
    );

    if (!confirmed) return;

    setReviewHistory([]);
  }

  function exportReviewHistory() {
    const dateSlug =
      new Date()
        .toISOString()
        .replace(/[:.]/g, "-");

    downloadJsonFile(
      `yerrr-ai-review-history-${dateSlug}.json`,
      {
        app: "YERRR Studio",
        version: "Alpha 5.3",
        exportType:
          "ai_entry_review_history",
        exportedAt:
          new Date().toISOString(),
        reviewCount:
          reviewHistory.length,
        reviews: reviewHistory,
      },
    );
  }

  async function copyText(
    label: string,
    value: string,
  ) {
    try {
      await navigator.clipboard.writeText(
        value,
      );
      setCopiedLabel(label);

      window.setTimeout(() => {
        setCopiedLabel((current) =>
          current === label ? "" : current,
        );
      }, 1_800);
    } catch {
      setCopiedLabel("");
    }
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
        <header className="border-b border-neutral-800 bg-neutral-950/95 p-5 backdrop-blur sm:p-6">
          <div className="flex items-start justify-between gap-4">
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
                Chat with the lexicon or run a
                structured editorial review. AI
                suggestions never write to
                Supabase automatically.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-black text-neutral-300 hover:border-neutral-700 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 rounded-2xl border border-neutral-800 bg-neutral-900 p-1">
            <button
              type="button"
              onClick={() => setMode("chat")}
              className={`rounded-xl px-4 py-3 text-sm font-black transition ${
                mode === "chat"
                  ? "bg-yellow-400 text-black"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              💬 Lexicon Chat
            </button>

            <button
              type="button"
              onClick={() => setMode("review")}
              className={`rounded-xl px-4 py-3 text-sm font-black transition ${
                mode === "review"
                  ? "bg-yellow-400 text-black"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              ✨ Entry Review
            </button>
          </div>
        </header>

        {mode === "chat" ? (
          <>
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6"
            >
              {messages.length === 0 ? (
                <div className="space-y-5">
                  <section className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-5">
                    <p className="font-black text-yellow-100">
                      Alpha 5.3 lexicon chat
                    </p>

                    <p className="mt-2 text-sm leading-6 text-yellow-100/70">
                      Ask about definitions,
                      examples, cultural context,
                      editorial gaps, tone, or
                      differences between entries.
                      Name the relevant slang terms
                      for the strongest grounding.
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
                              setDraft(
                                quickPrompt,
                              )
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
                      definitions, origins,
                      cultural claims, and source
                      quality before publishing.
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
                                .map(
                                  (entryId) => {
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
                                  },
                                )}
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
                          Reviewing lexicon
                          context...
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
                  placeholder="Ask about an entry, compare terms, or request editorial help..."
                  className="min-h-24 w-full resize-none bg-transparent px-3 py-2 text-sm leading-6 text-white outline-none placeholder:text-neutral-600"
                />

                <div className="flex items-center justify-between gap-3 px-2 pb-1">
                  <p className="text-[10px] text-neutral-600">
                    Enter sends · Shift+Enter adds
                    a line
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
          </>
        ) : (
          <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
            <div className="space-y-5">
              <section className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-5">
                <p className="font-black text-yellow-100">
                  Alpha 5.3 structured entry
                  review
                </p>

                <p className="mt-2 text-sm leading-6 text-yellow-100/70">
                  Select one lexicon entry. The AI
                  will score editorial completeness,
                  identify issues, and propose careful
                  revisions. Approve or reject each
                  suggestion before handing the plan
                  to the Entry Editor. Nothing writes
                  to Supabase automatically.
                </p>
              </section>

              <details className="group rounded-3xl border border-neutral-800 bg-neutral-900">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500">
                      Local review history
                    </p>
                    <p className="mt-2 text-lg font-black text-white">
                      {reviewHistory.length} saved review{reviewHistory.length === 1 ? "" : "s"}
                    </p>
                    <p className="mt-1 text-sm text-neutral-500">
                      Successful reviews are saved in this browser only.
                    </p>
                  </div>

                  <span className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm font-black text-neutral-400 transition group-open:rotate-180">
                    ↓
                  </span>
                </summary>

                <div className="border-t border-neutral-800 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      value={historyQuery}
                      onChange={(event) =>
                        setHistoryQuery(
                          event.target.value,
                        )
                      }
                      placeholder="Search saved reviews..."
                      className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400"
                    />

                    <button
                      type="button"
                      onClick={exportReviewHistory}
                      disabled={reviewHistory.length === 0}
                      className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-black text-neutral-300 hover:border-yellow-400 hover:text-yellow-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Export JSON
                    </button>

                    <button
                      type="button"
                      onClick={clearReviewHistory}
                      disabled={reviewHistory.length === 0}
                      className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm font-black text-red-100 hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Clear
                    </button>
                  </div>

                  {filteredReviewHistory.length === 0 ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-neutral-700 p-5 text-sm text-neutral-500">
                      {reviewHistory.length === 0
                        ? "Run an entry review to create the first saved report."
                        : "No saved reviews match this search."}
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {filteredReviewHistory.map(
                        (item) => (
                          <article
                            key={item.id}
                            className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
                          >
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-lg font-black text-white">
                                  {item.review.entryWord}
                                </p>

                                <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-neutral-500">
                                  {item.review.qualityScore}/100 · {readinessLabel(item.review.publishReadiness)}
                                </p>

                                <p className="mt-2 text-xs text-neutral-600">
                                  {formatReviewDate(item.createdAt)}
                                </p>

                                {item.decisions && (
                                  <p className="mt-2 text-xs font-bold text-green-300">
                                    {
                                      Object.values(
                                        item.decisions,
                                      ).filter(
                                        (decision) =>
                                          decision ===
                                          "approved",
                                      ).length
                                    } approved change{
                                      Object.values(
                                        item.decisions,
                                      ).filter(
                                        (decision) =>
                                          decision ===
                                          "approved",
                                      ).length === 1
                                        ? ""
                                        : "s"
                                    }
                                  </p>
                                )}

                                <p className="mt-3 line-clamp-2 text-sm leading-6 text-neutral-400">
                                  {item.review.summary}
                                </p>
                              </div>

                              <div className="flex shrink-0 flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    viewStoredReview(
                                      item,
                                    )
                                  }
                                  className="rounded-xl bg-yellow-400 px-3 py-2 text-xs font-black text-black hover:bg-yellow-300"
                                >
                                  View
                                </button>

                                {entryById.has(
                                  item.review.entryId,
                                ) &&
                                  onOpenEntry && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const entry =
                                          entryById.get(
                                            item.review.entryId,
                                          );

                                        if (entry) {
                                          openEntry(
                                            entry,
                                          );
                                        }
                                      }}
                                      className="rounded-xl border border-neutral-700 px-3 py-2 text-xs font-black text-neutral-300 hover:border-yellow-400 hover:text-yellow-200"
                                    >
                                      Open entry
                                    </button>
                                  )}

                                <button
                                  type="button"
                                  onClick={() =>
                                    deleteStoredReview(
                                      item.id,
                                    )
                                  }
                                  className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs font-black text-red-100 hover:bg-red-400/20"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          </article>
                        ),
                      )}
                    </div>
                  )}
                </div>
              </details>

              <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                <label className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500">
                  Find an entry
                </label>

                <input
                  value={reviewQuery}
                  onChange={(event) =>
                    setReviewQuery(
                      event.target.value,
                    )
                  }
                  placeholder="Search brick, deadass, ocky..."
                  className="mt-3 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400"
                />

                <label className="mt-4 block text-xs font-black uppercase tracking-[0.2em] text-neutral-500">
                  Entry to review
                </label>

                <select
                  value={selectedReviewEntryId}
                  onChange={(event) =>
                    selectReviewEntry(
                      event.target.value,
                    )
                  }
                  className="mt-3 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-yellow-400"
                >
                  <option value="">
                    Select an entry...
                  </option>

                  {filteredReviewEntries.map(
                    (entry) => (
                      <option
                        key={String(entry.id)}
                        value={String(entry.id)}
                      >
                        {entry.word} · {entry.status}
                      </option>
                    ),
                  )}
                </select>

                <p className="mt-2 text-xs text-neutral-600">
                  {filteredReviewEntries.length} of {entries.length} entries shown
                </p>

                {selectedReviewEntry && (
                  <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xl font-black text-white">
                          {selectedReviewEntry.word}
                        </p>

                        <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
                          {selectedReviewEntry.status} · {selectedReviewEntry.meanings.length} meaning{selectedReviewEntry.meanings.length === 1 ? "" : "s"}
                        </p>
                      </div>

                      {onOpenEntry && (
                        <button
                          type="button"
                          onClick={() =>
                            openEntry(
                              selectedReviewEntry,
                            )
                          }
                          className="rounded-xl border border-neutral-700 px-3 py-2 text-xs font-black text-neutral-300 hover:border-yellow-400 hover:text-yellow-200"
                        >
                          Open entry
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex gap-3">
                  {isReviewing ? (
                    <button
                      type="button"
                      onClick={stopReview}
                      className="flex-1 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-black text-red-100 hover:bg-red-400/20"
                    >
                      Stop review
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        void runEntryReview()
                      }
                      disabled={!selectedReviewEntry}
                      className="flex-1 rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ✨ Review selected entry
                    </button>
                  )}
                </div>
              </section>

              {isReviewing && (
                <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                  <div className="flex items-center gap-3">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-yellow-400 border-t-transparent" />

                    <div>
                      <p className="font-black text-white">
                        Reviewing entry...
                      </p>
                      <p className="mt-1 text-sm text-neutral-500">
                        Checking clarity,
                        completeness, examples,
                        context, and verification
                        needs.
                      </p>
                    </div>
                  </div>
                </section>
              )}

              {reviewError && (
                <section className="rounded-3xl border border-red-400/20 bg-red-400/10 p-5">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-red-300">
                    Review error
                  </p>
                  <p className="mt-3 text-sm leading-6 text-red-100">
                    {reviewError}
                  </p>
                </section>
              )}

              {review && (
                <>
                  <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500">
                          AI editorial review
                        </p>
                        <h3 className="mt-2 text-2xl font-black text-white">
                          {review.entryWord}
                        </h3>
                        <p className="mt-3 max-w-xl text-sm leading-7 text-neutral-300">
                          {review.summary}
                        </p>
                      </div>

                      <div className="shrink-0 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 px-5 py-4 text-center">
                        <p className="text-3xl font-black text-yellow-300">
                          {review.qualityScore}
                        </p>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-yellow-100/60">
                          Quality score
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-neutral-800 pt-4">
                      <span className="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs font-black text-neutral-300">
                        {readinessLabel(
                          review.publishReadiness,
                        )}
                      </span>

                      {reviewModelLabel && (
                        <span className="rounded-full border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs font-bold text-neutral-600">
                          {reviewModelLabel}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          void copyText(
                            "full-review",
                            formatReviewAsText(
                              review,
                            ),
                          )
                        }
                        className="ml-auto rounded-xl border border-neutral-700 px-3 py-2 text-xs font-black text-neutral-300 hover:border-yellow-400 hover:text-yellow-200"
                      >
                        {copiedLabel ===
                        "full-review"
                          ? "Copied"
                          : "Copy full review"}
                      </button>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500">
                      Strengths
                    </p>

                    {review.strengths.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        {review.strengths.map(
                          (strength, index) => (
                            <div
                              key={`${strength}-${index}`}
                              className="flex gap-3 rounded-2xl border border-green-400/20 bg-green-400/10 p-4"
                            >
                              <span className="font-black text-green-300">
                                ✓
                              </span>
                              <p className="text-sm leading-6 text-green-50">
                                {strength}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-neutral-500">
                        No clear strengths were
                        identified yet.
                      </p>
                    )}
                  </section>

                  <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500">
                      Issues to address
                    </p>

                    {review.issues.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        {review.issues.map(
                          (issue, index) => (
                            <article
                              key={`${issue.category}-${index}`}
                              className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-neutral-700 px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-neutral-300">
                                  {titleCaseToken(
                                    issue.category,
                                  )}
                                </span>
                                <span
                                  className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] ${severityClasses(
                                    issue.severity,
                                  )}`}
                                >
                                  {issue.severity}
                                </span>
                              </div>

                              <p className="mt-4 text-sm font-bold leading-6 text-white">
                                {issue.finding}
                              </p>
                              <p className="mt-2 text-sm leading-6 text-neutral-400">
                                {issue.recommendation}
                              </p>
                            </article>
                          ),
                        )}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-neutral-500">
                        No major editorial issues
                        were identified.
                      </p>
                    )}
                  </section>

                  <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500">
                          Suggestion approval
                        </p>
                        <p className="mt-2 text-sm leading-6 text-neutral-400">
                          Review each proposed edit before creating an editorial handoff plan.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={approveHighConfidence}
                          disabled={
                            review.suggestedEdits.length === 0
                          }
                          className="rounded-xl border border-green-400/20 bg-green-400/10 px-3 py-2 text-xs font-black text-green-100 hover:bg-green-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Approve high confidence
                        </button>

                        <button
                          type="button"
                          onClick={resetSuggestionDecisions}
                          disabled={
                            review.suggestedEdits.length === 0
                          }
                          className="rounded-xl border border-neutral-700 px-3 py-2 text-xs font-black text-neutral-300 hover:border-yellow-400 hover:text-yellow-200 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Reset decisions
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-green-400/20 bg-green-400/10 p-3 text-center">
                        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-green-200/70">
                          Approved
                        </p>
                        <p className="mt-1 text-xl font-black text-green-100">
                          {reviewDecisionCounts.approved}
                        </p>
                      </div>

                      <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-center">
                        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-red-200/70">
                          Rejected
                        </p>
                        <p className="mt-1 text-xl font-black text-red-100">
                          {reviewDecisionCounts.rejected}
                        </p>
                      </div>

                      <div className="rounded-xl border border-neutral-700 bg-neutral-950 p-3 text-center">
                        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-neutral-500">
                          Pending
                        </p>
                        <p className="mt-1 text-xl font-black text-white">
                          {reviewDecisionCounts.pending}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() =>
                          void copyText(
                            "approved-plan",
                            formatApprovedEditsAsText(
                              review,
                              reviewDecisions,
                            ),
                          )
                        }
                        disabled={
                          reviewDecisionCounts.approved === 0
                        }
                        className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {copiedLabel ===
                        "approved-plan"
                          ? "Approved plan copied"
                          : "Copy approved plan"}
                      </button>

                      <button
                        type="button"
                        onClick={exportApprovedPlan}
                        disabled={
                          reviewDecisionCounts.approved === 0
                        }
                        className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-black text-neutral-300 hover:border-yellow-400 hover:text-yellow-200 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Export approved plan
                      </button>
                    </div>

                    {review.suggestedEdits.length > 0 ? (
                      <div className="mt-4 space-y-4">
                        {review.suggestedEdits.map(
                          (edit, index) => {
                            const copyKey =
                              `edit-${index}`;
                            const suggestionKey =
                              getSuggestionKey(
                                edit,
                                index,
                              );
                            const decision =
                              reviewDecisions[
                                suggestionKey
                              ] ?? "pending";

                            const decisionClasses =
                              decision ===
                              "approved"
                                ? "border-green-400/30 bg-green-400/5"
                                : decision ===
                                    "rejected"
                                  ? "border-red-400/20 bg-red-400/5 opacity-70"
                                  : "border-neutral-800 bg-neutral-950";

                            return (
                              <article
                                key={`${edit.field}-${index}`}
                                className={`rounded-2xl border p-4 ${decisionClasses}`}
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div>
                                    <p className="font-black text-white">
                                      {titleCaseToken(
                                        edit.field,
                                      )}
                                    </p>
                                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.15em] text-neutral-600">
                                      {edit.confidence} confidence
                                    </p>

                                    <span
                                      className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.15em] ${
                                        decision ===
                                        "approved"
                                          ? "border-green-400/30 bg-green-400/10 text-green-100"
                                          : decision ===
                                              "rejected"
                                            ? "border-red-400/30 bg-red-400/10 text-red-100"
                                            : "border-neutral-700 bg-neutral-900 text-neutral-400"
                                      }`}
                                    >
                                      {decision}
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      void copyText(
                                        copyKey,
                                        edit.suggestedValue,
                                      )
                                    }
                                    disabled={
                                      !edit.suggestedValue
                                    }
                                    className="rounded-xl border border-neutral-700 px-3 py-2 text-xs font-black text-neutral-300 hover:border-yellow-400 hover:text-yellow-200 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    {copiedLabel ===
                                    copyKey
                                      ? "Copied"
                                      : "Copy suggestion"}
                                  </button>
                                </div>

                                <div className="mt-4 grid gap-3">
                                  <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-600">
                                      Current
                                    </p>
                                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-400">
                                      {edit.currentValue ||
                                        "Empty"}
                                    </p>
                                  </div>

                                  <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-3">
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-100/60">
                                      Suggested
                                    </p>
                                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-yellow-50">
                                      {edit.suggestedValue ||
                                        "No replacement proposed; verify this field manually."}
                                    </p>
                                  </div>
                                </div>

                                <div className="mt-4 grid grid-cols-3 gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSuggestionDecision(
                                        edit,
                                        index,
                                        "approved",
                                      )
                                    }
                                    className={`rounded-xl border px-3 py-2 text-xs font-black ${
                                      decision ===
                                      "approved"
                                        ? "border-green-400 bg-green-400 text-black"
                                        : "border-green-400/20 bg-green-400/10 text-green-100 hover:bg-green-400/20"
                                    }`}
                                  >
                                    Approve
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSuggestionDecision(
                                        edit,
                                        index,
                                        "rejected",
                                      )
                                    }
                                    className={`rounded-xl border px-3 py-2 text-xs font-black ${
                                      decision ===
                                      "rejected"
                                        ? "border-red-400 bg-red-400 text-black"
                                        : "border-red-400/20 bg-red-400/10 text-red-100 hover:bg-red-400/20"
                                    }`}
                                  >
                                    Reject
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSuggestionDecision(
                                        edit,
                                        index,
                                        "pending",
                                      )
                                    }
                                    className={`rounded-xl border px-3 py-2 text-xs font-black ${
                                      decision ===
                                      "pending"
                                        ? "border-neutral-500 bg-neutral-700 text-white"
                                        : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:text-white"
                                    }`}
                                  >
                                    Pending
                                  </button>
                                </div>

                                <p className="mt-3 text-sm leading-6 text-neutral-500">
                                  {edit.reason}
                                </p>
                              </article>
                            );
                          },
                        )}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-neutral-500">
                        No direct text replacements
                        were proposed.
                      </p>
                    )}
                  </section>

                  <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500">
                      Verification checklist
                    </p>

                    {review.verificationChecklist.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        {review.verificationChecklist.map(
                          (item, index) => (
                            <div
                              key={`${item}-${index}`}
                              className="flex gap-3 rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
                            >
                              <span className="text-neutral-600">
                                □
                              </span>
                              <p className="text-sm leading-6 text-neutral-300">
                                {item}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-neutral-500">
                        No additional verification
                        steps were listed.
                      </p>
                    )}
                  </section>

                  <section className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
                    <p className="font-black text-yellow-100">
                      Human approval required
                    </p>
                    <p className="mt-2 text-sm leading-6 text-yellow-100/70">
                      Approval decisions and
                      exported plans are editorial
                      handoff tools only. They are
                      stored locally and never edit
                      Supabase. Open the Entry Editor,
                      verify every approved change,
                      then save manually.
                    </p>
                  </section>
                </>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

export default AIAssistantDrawer;
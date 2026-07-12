"use client";

import { useMemo, useState } from "react";

import type { Entry } from "@/types/entry";

type AdvancedSearchDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  entries?: Entry[];
  onOpenEntry?: (entry: Entry) => void;
};

type SearchScope =
  | "all"
  | "word"
  | "definition"
  | "example"
  | "culture";

type MatchMode = "all" | "any" | "phrase";

type SortMode =
  | "relevance"
  | "a-z"
  | "z-a"
  | "status";

type PresenceFilter = "all" | "with" | "without";

type SearchDocument = {
  entry: Entry;
  word: string;
  slug: string;
  pronunciation: string;
  alternateSpellings: string;
  definitions: string;
  plainEnglish: string;
  examples: string;
  culturalContext: string;
  tones: string;
  usageFrequency: string;
  partOfSpeech: string[];
  sources: string;
  editorialNotes: string;
  allText: string;
};

type RankedResult = SearchDocument & {
  score: number;
};

function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const DEFAULT_PART_OF_SPEECH_OPTIONS = [
  "Noun",
  "Verb",
  "Adjective",
  "Adverb",
  "Phrase",
  "Expression",
  "Interjection",
  "Pronoun",
  "Preposition",
  "Conjunction",
  "Determiner",
  "Other",
];

function normalizeFieldKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function collectStrings(
  value: unknown,
  output: string[] = [],
  seen = new Set<object>()
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

  if (seen.has(value)) {
    return output;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item) =>
      collectStrings(item, output, seen)
    );

    return output;
  }

  Object.values(value).forEach((item) =>
    collectStrings(item, output, seen)
  );

  return output;
}

function collectFieldValues(
  source: unknown,
  aliases: string[]
) {
  const wantedKeys = new Set(
    aliases.map(normalizeFieldKey)
  );

  const values: string[] = [];
  const visited = new Set<object>();

  function walk(value: unknown) {
    if (!value || typeof value !== "object") {
      return;
    }

    if (visited.has(value)) {
      return;
    }

    visited.add(value);

    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    Object.entries(
      value as Record<string, unknown>
    ).forEach(([key, childValue]) => {
      if (
        wantedKeys.has(normalizeFieldKey(key))
      ) {
        collectStrings(childValue, values);
      }

      walk(childValue);
    });
  }

  walk(source);

  return values;
}

function uniqueValues(values: string[]) {
  const valueMap = new Map<string, string>();

  values.forEach((value) => {
    const trimmed = value.trim();

    if (!trimmed) return;

    const normalized = normalizeSearchText(trimmed);

    if (!normalized) return;

    if (!valueMap.has(normalized)) {
      valueMap.set(normalized, trimmed);
    }
  });

  return Array.from(valueMap.values()).sort(
    (a, b) => a.localeCompare(b)
  );
}

function getFieldText(
  entry: Entry,
  aliases: string[]
) {
  return uniqueValues(
    collectFieldValues(entry, aliases)
  ).join(" ");
}

function getPartOfSpeechValues(entry: Entry) {
  const entryRecord =
    entry as unknown as Record<string, unknown>;

  const searchableSource = {
    meanings: Array.isArray(entry.meanings)
      ? entry.meanings
      : [],
    partOfSpeech: entryRecord.partOfSpeech,
    part_of_speech: entryRecord.part_of_speech,
    partsOfSpeech: entryRecord.partsOfSpeech,
    parts_of_speech: entryRecord.parts_of_speech,
    pos: entryRecord.pos,
    grammar: entryRecord.grammar,
  };

  return uniqueValues(
    collectFieldValues(searchableSource, [
      "partOfSpeech",
      "part_of_speech",
      "partsOfSpeech",
      "parts_of_speech",
      "pos",
      "grammar",
      "wordType",
      "word_type",
    ]).flatMap((value) =>
      value
        .split(/[,;|/\n]+/g)
        .map((part) => part.trim())
        .filter(Boolean)
    )
  );
}

function createSearchDocument(
  entry: Entry
): SearchDocument {
  const word = String(entry.word ?? "");
  const slug = String(entry.slug ?? "");
  const pronunciation = String(
    entry.pronunciation ?? ""
  );

  const alternateSpellings = String(
    entry.alternateSpellings ?? ""
  );

  const definitions = getFieldText(entry, [
    "definition",
    "definitions",
    "meaning",
    "gloss",
  ]);

  const plainEnglish = getFieldText(entry, [
    "plainEnglish",
    "plain_english",
    "plainMeaning",
    "plain_meaning",
  ]);

  const examples = getFieldText(entry, [
    "exampleSentence",
    "example_sentence",
    "example",
    "examples",
    "usageExample",
    "usage_example",
  ]);

  const culturalContext = getFieldText(entry, [
    "culturalContext",
    "cultural_context",
    "context",
    "culture",
  ]);

  const tones = getFieldText(entry, [
    "tone",
    "tones",
  ]);

  const usageFrequency = getFieldText(entry, [
    "usageFrequency",
    "usage_frequency",
    "frequency",
  ]);

  const partOfSpeech =
    getPartOfSpeechValues(entry);

  const sources = getFieldText(entry, [
    "sources",
    "source",
    "citations",
    "citation",
  ]);

  const editorialNotes = getFieldText(entry, [
    "editorialNotes",
    "editorial_notes",
    "notes",
  ]);

  const recursiveText = collectStrings(entry).join(
    " "
  );

  return {
    entry,
    word,
    slug,
    pronunciation,
    alternateSpellings,
    definitions,
    plainEnglish,
    examples,
    culturalContext,
    tones,
    usageFrequency,
    partOfSpeech,
    sources,
    editorialNotes,
    allText: [
      recursiveText,
      word,
      slug,
      pronunciation,
      alternateSpellings,
      definitions,
      plainEnglish,
      examples,
      culturalContext,
      tones,
      usageFrequency,
      partOfSpeech.join(" "),
      sources,
      editorialNotes,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

function matchesTokens(
  text: string,
  query: string,
  tokens: string[],
  mode: MatchMode
) {
  const normalizedText = normalizeSearchText(text);

  if (!query) {
    return true;
  }

  if (mode === "phrase") {
    return normalizedText.includes(query);
  }

  if (mode === "all") {
    return tokens.every((token) =>
      normalizedText.includes(token)
    );
  }

  return tokens.some((token) =>
    normalizedText.includes(token)
  );
}

function getScopeText(
  document: SearchDocument,
  scope: SearchScope
) {
  if (scope === "word") {
    return [
      document.word,
      document.slug,
      document.pronunciation,
      document.alternateSpellings,
    ].join(" ");
  }

  if (scope === "definition") {
    return [
      document.definitions,
      document.plainEnglish,
      document.editorialNotes,
    ].join(" ");
  }

  if (scope === "example") {
    return document.examples;
  }

  if (scope === "culture") {
    return [
      document.culturalContext,
      document.tones,
      document.usageFrequency,
    ].join(" ");
  }

  return document.allText;
}

function scoreDocument(
  document: SearchDocument,
  normalizedQuery: string,
  tokens: string[]
) {
  if (!normalizedQuery) {
    return 0;
  }

  const normalizedWord = normalizeSearchText(
    document.word
  );

  const normalizedSlug = normalizeSearchText(
    document.slug
  );

  const normalizedAlternate = normalizeSearchText(
    document.alternateSpellings
  );

  const normalizedDefinition = normalizeSearchText(
    [
      document.definitions,
      document.plainEnglish,
    ].join(" ")
  );

  const normalizedExamples = normalizeSearchText(
    document.examples
  );

  const normalizedCulture = normalizeSearchText(
    document.culturalContext
  );

  const normalizedAll = normalizeSearchText(
    document.allText
  );

  let score = 0;

  if (normalizedWord === normalizedQuery) {
    score += 200;
  } else if (
    normalizedWord.startsWith(normalizedQuery)
  ) {
    score += 120;
  } else if (
    normalizedWord.includes(normalizedQuery)
  ) {
    score += 90;
  }

  if (normalizedSlug === normalizedQuery) {
    score += 100;
  } else if (
    normalizedSlug.includes(normalizedQuery)
  ) {
    score += 50;
  }

  if (
    normalizedAlternate
      .split(" ")
      .includes(normalizedQuery)
  ) {
    score += 90;
  } else if (
    normalizedAlternate.includes(normalizedQuery)
  ) {
    score += 60;
  }

  if (
    normalizedDefinition.includes(normalizedQuery)
  ) {
    score += 45;
  }

  if (normalizedExamples.includes(normalizedQuery)) {
    score += 25;
  }

  if (normalizedCulture.includes(normalizedQuery)) {
    score += 20;
  }

  tokens.forEach((token) => {
    if (normalizedWord === token) score += 80;
    else if (normalizedWord.startsWith(token))
      score += 45;
    else if (normalizedWord.includes(token))
      score += 30;

    if (normalizedDefinition.includes(token))
      score += 12;

    if (normalizedExamples.includes(token))
      score += 6;

    if (normalizedCulture.includes(token))
      score += 5;

    if (normalizedAll.includes(token)) score += 2;
  });

  return score;
}

function getPreview(document: SearchDocument) {
  const preview =
    document.plainEnglish ||
    document.definitions ||
    document.culturalContext ||
    document.examples ||
    document.editorialNotes ||
    "No definition preview is available.";

  if (preview.length <= 220) {
    return preview;
  }

  return `${preview.slice(0, 217).trim()}...`;
}

function getScopeLabel(scope: SearchScope) {
  if (scope === "word") return "Words";
  if (scope === "definition") return "Definitions";
  if (scope === "example") return "Examples";
  if (scope === "culture") return "Culture";
  return "All Fields";
}

export function AdvancedSearchDrawer({
  isOpen,
  onClose,
  entries = [],
  onOpenEntry,
}: AdvancedSearchDrawerProps) {
  const [query, setQuery] = useState("");
  const [scope, setScope] =
    useState<SearchScope>("all");

  const [matchMode, setMatchMode] =
    useState<MatchMode>("all");

  const [statusFilter, setStatusFilter] =
    useState("all");

  const [
    partOfSpeechFilter,
    setPartOfSpeechFilter,
  ] = useState("all");

  const [
    pronunciationFilter,
    setPronunciationFilter,
  ] = useState<PresenceFilter>("all");

  const [sortMode, setSortMode] =
    useState<SortMode>("relevance");

  const documents = useMemo(
    () => entries.map(createSearchDocument),
    [entries]
  );

  const statusOptions = useMemo(
    () =>
      uniqueValues(
        entries.map((entry) =>
          String(entry.status ?? "")
        )
      ),
    [entries]
  );

  const partOfSpeechOptions = useMemo(() => {
    const detectedOptions = uniqueValues(
      documents.flatMap(
        (document) => document.partOfSpeech
      )
    );

    return detectedOptions.length > 0
      ? detectedOptions
      : DEFAULT_PART_OF_SPEECH_OPTIONS;
  }, [documents]);

  const normalizedQuery = useMemo(
    () => normalizeSearchText(query),
    [query]
  );

  const tokens = useMemo(
    () =>
      normalizedQuery
        .split(" ")
        .map((token) => token.trim())
        .filter(Boolean),
    [normalizedQuery]
  );

  const results = useMemo<RankedResult[]>(() => {
    const filtered = documents
      .filter((document) => {
        if (
          statusFilter !== "all" &&
          String(document.entry.status) !==
            statusFilter
        ) {
          return false;
        }

        if (partOfSpeechFilter !== "all") {
          const selectedPartOfSpeech =
            normalizeSearchText(
              partOfSpeechFilter
            );

          const hasMatchingPartOfSpeech =
            document.partOfSpeech.some(
              (partOfSpeech) =>
                normalizeSearchText(
                  partOfSpeech
                ) === selectedPartOfSpeech
            );

          if (!hasMatchingPartOfSpeech) {
            return false;
          }
        }

        const hasPronunciation =
          document.pronunciation.trim().length > 0;

        if (
          pronunciationFilter === "with" &&
          !hasPronunciation
        ) {
          return false;
        }

        if (
          pronunciationFilter === "without" &&
          hasPronunciation
        ) {
          return false;
        }

        return matchesTokens(
          getScopeText(document, scope),
          normalizedQuery,
          tokens,
          matchMode
        );
      })
      .map((document) => ({
        ...document,
        score: scoreDocument(
          document,
          normalizedQuery,
          tokens
        ),
      }));

    return filtered.sort((a, b) => {
      if (sortMode === "a-z") {
        return a.word.localeCompare(b.word);
      }

      if (sortMode === "z-a") {
        return b.word.localeCompare(a.word);
      }

      if (sortMode === "status") {
        const statusComparison =
          String(a.entry.status).localeCompare(
            String(b.entry.status)
          );

        if (statusComparison !== 0) {
          return statusComparison;
        }

        return a.word.localeCompare(b.word);
      }

      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return a.word.localeCompare(b.word);
    });
  }, [
    documents,
    matchMode,
    normalizedQuery,
    partOfSpeechFilter,
    pronunciationFilter,
    scope,
    sortMode,
    statusFilter,
    tokens,
  ]);

  const resultStats = useMemo(() => {
    const verified = results.filter(
      (result) =>
        String(result.entry.status).toLowerCase() ===
        "verified"
    ).length;

    const withPronunciation = results.filter(
      (result) =>
        result.pronunciation.trim().length > 0
    ).length;

    const withAlternateSpellings = results.filter(
      (result) =>
        result.alternateSpellings.trim().length > 0
    ).length;

    return {
      total: results.length,
      verified,
      withPronunciation,
      withAlternateSpellings,
    };
  }, [results]);

  const hasActiveFilters =
    query.trim().length > 0 ||
    scope !== "all" ||
    matchMode !== "all" ||
    statusFilter !== "all" ||
    partOfSpeechFilter !== "all" ||
    pronunciationFilter !== "all" ||
    sortMode !== "relevance";

  function clearSearch() {
    setQuery("");
    setScope("all");
    setMatchMode("all");
    setStatusFilter("all");
    setPartOfSpeechFilter("all");
    setPronunciationFilter("all");
    setSortMode("relevance");
  }

  function openEntry(entry: Entry) {
    if (!onOpenEntry) return;

    onClose();
    onOpenEntry(entry);
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
      <button
        aria-label="Close advanced search"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside className="absolute bottom-0 right-0 max-h-[94vh] w-full overflow-y-auto rounded-t-3xl border-t border-neutral-800 bg-neutral-950 p-5 shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-h-none md:max-w-6xl md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0 md:p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.25em] text-yellow-400">
              Phase 4 Search
            </p>

            <h2 className="mt-2 text-2xl font-black text-white">
              Advanced Lexicon Search
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500">
              Search words, alternate spellings,
              definitions, examples, pronunciation, and
              cultural context with ranked results and
              editorial filters.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-black text-neutral-300 hover:border-neutral-700 hover:text-white"
          >
            ✕
          </button>
        </div>

        <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600">
                🔎
              </span>

              <input
                value={query}
                onChange={(event) =>
                  setQuery(event.target.value)
                }
                placeholder="Search deadass, honesty, bodega culture..."
                autoFocus
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 py-4 pl-11 pr-4 text-base font-semibold text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400"
              />
            </div>

            <button
              onClick={clearSearch}
              disabled={!hasActiveFilters}
              className="rounded-2xl border border-neutral-700 bg-neutral-950 px-5 py-4 text-sm font-black text-white hover:border-yellow-400 hover:text-yellow-300 disabled:cursor-not-allowed disabled:opacity-35"
            >
              Clear Search
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
                Scope
              </span>

              <select
                value={scope}
                onChange={(event) =>
                  setScope(
                    event.target.value as SearchScope
                  )
                }
                className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm font-bold text-white outline-none focus:border-yellow-400"
              >
                <option value="all">All Fields</option>
                <option value="word">Words</option>
                <option value="definition">
                  Definitions
                </option>
                <option value="example">Examples</option>
                <option value="culture">Culture</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
                Match
              </span>

              <select
                value={matchMode}
                onChange={(event) =>
                  setMatchMode(
                    event.target.value as MatchMode
                  )
                }
                className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm font-bold text-white outline-none focus:border-yellow-400"
              >
                <option value="all">All Words</option>
                <option value="any">Any Word</option>
                <option value="phrase">
                  Exact Phrase
                </option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
                Status
              </span>

              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value)
                }
                className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm font-bold text-white outline-none focus:border-yellow-400"
              >
                <option value="all">
                  All Statuses
                </option>

                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
                Part of Speech
              </span>

              <select
                value={partOfSpeechFilter}
                onChange={(event) =>
                  setPartOfSpeechFilter(
                    event.target.value
                  )
                }
                className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm font-bold text-white outline-none focus:border-yellow-400"
              >
                <option value="all">All Types</option>

                {partOfSpeechOptions.map(
                  (partOfSpeech) => (
                    <option
                      key={partOfSpeech}
                      value={partOfSpeech}
                    >
                      {partOfSpeech}
                    </option>
                  )
                )}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
                Pronunciation
              </span>

              <select
                value={pronunciationFilter}
                onChange={(event) =>
                  setPronunciationFilter(
                    event.target
                      .value as PresenceFilter
                  )
                }
                className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm font-bold text-white outline-none focus:border-yellow-400"
              >
                <option value="all">Any</option>
                <option value="with">Has It</option>
                <option value="without">
                  Missing It
                </option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
                Sort
              </span>

              <select
                value={sortMode}
                onChange={(event) =>
                  setSortMode(
                    event.target.value as SortMode
                  )
                }
                className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm font-bold text-white outline-none focus:border-yellow-400"
              >
                <option value="relevance">
                  Relevance
                </option>
                <option value="a-z">A–Z</option>
                <option value="z-a">Z–A</option>
                <option value="status">Status</option>
              </select>
            </label>
          </div>
        </section>

        <section className="my-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
              Results
            </p>

            <p className="mt-2 text-2xl font-black text-white">
              {resultStats.total}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
              Verified
            </p>

            <p className="mt-2 text-2xl font-black text-white">
              {resultStats.verified}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
              Pronunciation
            </p>

            <p className="mt-2 text-2xl font-black text-white">
              {resultStats.withPronunciation}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
              Alternate Forms
            </p>

            <p className="mt-2 text-2xl font-black text-white">
              {resultStats.withAlternateSpellings}
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-4">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="font-black text-white">
                Search Results
              </h3>

              <p className="mt-1 text-sm text-neutral-500">
                Searching {getScopeLabel(scope)}
                {normalizedQuery
                  ? ` for “${query.trim()}”`
                  : ""}
                .
              </p>
            </div>

            <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-600">
              {sortMode === "relevance"
                ? "Ranked"
                : "Sorted"}{" "}
              · {results.length} shown
            </p>
          </div>

          {results.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-700 p-8 text-center">
              <p className="font-black text-white">
                No entries matched this search.
              </p>

              <p className="mt-2 text-sm text-neutral-500">
                Try Any Word, widen the scope, or clear one
                of the filters.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {results.map((result) => (
                <article
                  key={result.entry.id}
                  className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 transition hover:border-neutral-700"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-black text-white">
                        {result.word}
                      </p>

                      <p className="mt-1 text-xs text-neutral-500">
                        /{result.slug} ·{" "}
                        {result.entry.status}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {normalizedQuery &&
                        sortMode === "relevance" && (
                          <span className="rounded-full bg-neutral-800 px-2 py-1 text-[10px] font-black text-neutral-400">
                            {result.score} pts
                          </span>
                        )}

                      {onOpenEntry && (
                        <button
                          onClick={() =>
                            openEntry(result.entry)
                          }
                          className="rounded-xl bg-yellow-400 px-3 py-2 text-xs font-black text-black hover:bg-yellow-300"
                        >
                          Open
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-neutral-400">
                    {getPreview(result)}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {result.partOfSpeech.map(
                      (partOfSpeech) => (
                        <span
                          key={`${result.entry.id}-${partOfSpeech}`}
                          className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs font-bold text-neutral-300"
                        >
                          {partOfSpeech}
                        </span>
                      )
                    )}

                    {result.pronunciation && (
                      <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-bold text-sky-100">
                        🔊 {result.pronunciation}
                      </span>
                    )}

                    {result.alternateSpellings && (
                      <span className="rounded-full border border-purple-400/20 bg-purple-400/10 px-3 py-1 text-xs font-bold text-purple-100">
                        Alt:{" "}
                        {result.alternateSpellings}
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <div className="mt-6 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
  <p className="font-black text-yellow-100">
    Alpha 4.1 note
  </p>

  <p className="mt-2 text-sm leading-6 text-yellow-100/70">
    The Supabase full-text search index is installed and
    synchronized. This drawer still searches the entries
    loaded in Studio until Alpha 4.2 connects it to the
    ranked search RPC.
  </p>
</div>
      </aside>
    </div>
  );
}

export default AdvancedSearchDrawer;
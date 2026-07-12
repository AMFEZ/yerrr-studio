"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import { useRouter } from "next/navigation";
import type { Entry, EntryStatus } from "@/types/entry";
import { entryStatusOptions } from "@/types/entry";
import { useEntries } from "@/hooks/useEntries";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { StatCard } from "@/components/dashboard/StatCard";
import { EntryCard } from "@/components/entries/EntryCard";
import { CaptureModal } from "@/components/entries/CaptureModal";
import { EntryEditorModal } from "@/components/entries/EntryEditorModal";
import { AdvancedSearchDrawer } from "@/components/search/AdvancedSearchDrawer";
import { ConceptDrawer } from "@/components/concepts/ConceptDrawer";
import { GraphStatsDrawer } from "@/components/concepts/GraphStatsDrawer";
import { MergeConceptsDrawer } from "@/components/concepts/MergeConceptsDrawer";
import { RelationshipDrawer } from "@/components/relationships/RelationshipDrawer";
import { GraphExplorerDrawer } from "@/components/relationships/GraphExplorerDrawer";
import { GraphMigrationDrawer } from "@/components/concepts/GraphMigrationDrawer";
import { CloudGraphDrawer } from "@/components/concepts/CloudGraphDrawer";
import { CloudConceptEditorDrawer } from "@/components/concepts/CloudConceptEditorDrawer";
import { CloudRelationshipEditorDrawer } from "@/components/relationships/CloudRelationshipEditorDrawer";
import { AIAssistantDrawer } from "@/components/ai/AIAssistantDrawer";
import { AIEditorialHandoffPanel } from "@/components/ai/AIEditorialHandoffPanel";
import { AIMissingFieldsPanel } from "@/components/ai/AIMissingFieldsPanel";
import { AISemanticDuplicatePanel } from "@/components/ai/AISemanticDuplicatePanel";
import { AIBatchTriagePanel } from "@/components/ai/AIBatchTriagePanel";
import { AIRelationshipSuggestionsPanel } from "@/components/ai/AIRelationshipSuggestionsPanel";
import type { AIEditorialHandoff } from "@/types/aiEditorial";
import { createClient } from "@/lib/supabase/client";

type WorkspaceMode =
  | "all"
  | "review"
  | "draft"
  | "publish"
  | "duplicates"
  | "trash";

type ToastType = "success" | "error" | "info";

type AuthStatus =
  | "checking"
  | "authenticated"
  | "signed-out";

type ToastState = {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
} | null;

type ActivityType =
  | "create"
  | "update"
  | "status"
  | "delete"
  | "restore"
  | "bulk"
  | "export"
  | "system";

type ActivityItem = {
  id: string;
  type: ActivityType;
  title: string;
  detail?: string;
  createdAt: string;
};

type BackupImportPreview = {
  fileName: string;
  app?: string;
  version?: string;
  exportType?: string;
  exportedAt?: string;
  activeEntries: number;
  trashEntries: number;
  totalEntries: number;
  warnings: string[];
} | null;

const APP_VERSION = "Alpha 5.9";
const ACTIVITY_STORAGE_KEY = "yerrr-studio-activity-log";
const INITIAL_RENDER_LIMIT = 50;
const RENDER_INCREMENT = 50;

function normalizeDuplicateKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getDuplicateKeys(entry: Entry) {
  const keys = new Set<string>();

  const wordKey = normalizeDuplicateKey(entry.word);
  const slugKey = normalizeDuplicateKey(entry.slug.replace(/-/g, " "));
  const alternateKeys = entry.alternateSpellings
    .split(/[,;/\n]/g)
    .map((spelling) => normalizeDuplicateKey(spelling))
    .filter(Boolean);

  if (wordKey) keys.add(wordKey);
  if (slugKey) keys.add(slugKey);

  alternateKeys.forEach((key) => keys.add(key));

  return Array.from(keys);
}

function buildDuplicateMatches(entries: Entry[]) {
  const keyMap = new Map<string, Entry[]>();

  entries.forEach((entry) => {
    getDuplicateKeys(entry).forEach((key) => {
      const existing = keyMap.get(key) ?? [];
      keyMap.set(key, [...existing, entry]);
    });
  });

  const duplicateMatches = new Map<string, string[]>();

  keyMap.forEach((matchedEntries) => {
    if (matchedEntries.length <= 1) return;

    matchedEntries.forEach((entry) => {
      const otherWords = matchedEntries
        .filter((matchedEntry) => matchedEntry.id !== entry.id)
        .map((matchedEntry) => matchedEntry.word);

      const currentMatches = duplicateMatches.get(entry.id) ?? [];

      duplicateMatches.set(
        entry.id,
        Array.from(new Set([...currentMatches, ...otherWords]))
      );
    });
  });

  return duplicateMatches;
}

function isDraftQueueEntry(entry: Entry) {
  if (entry.status === "Draft") return true;

  return entry.meanings.some(
    (meaning) => meaning.editorialStatus === "Draft"
  );
}

function isPublishQueueEntry(entry: Entry) {
  return entry.status === "Verified";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

function getBackupDateSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function escapeCsvValue(value: unknown) {
  const stringValue = String(value ?? "");
  const escapedValue = stringValue.replace(/"/g, '""');

  return `"${escapedValue}"`;
}

function getStringField(
  object: Record<string, unknown> | undefined,
  keys: string[]
) {
  if (!object) return "";

  for (const key of keys) {
    const value = object[key];

    if (typeof value === "string") {
      return value;
    }
  }

  return "";
}

function entriesToCsv(entries: Entry[]) {
  const headers = [
    "id",
    "word",
    "slug",
    "status",
    "pronunciation",
    "alternateSpellings",
    "partOfSpeech",
    "definition",
    "example",
    "meaningCount",
  ];

  const rows = entries.map((entry) => {
    const firstMeaning = entry.meanings[0] as
      | Record<string, unknown>
      | undefined;

    return [
      entry.id,
      entry.word,
      entry.slug,
      entry.status,
      entry.pronunciation,
      entry.alternateSpellings,
      getStringField(firstMeaning, [
        "partOfSpeech",
        "part_of_speech",
        "pos",
        "type",
        "grammar",
      ]),
      getStringField(firstMeaning, ["definition", "meaning", "gloss"]),
      getStringField(firstMeaning, [
        "exampleSentence",
        "example_sentence",
        "example",
        "usageExample",
        "usage_example",
      ]),
      entry.meanings.length,
    ].map(escapeCsvValue);
  });

  return [
    headers.map(escapeCsvValue).join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");
}

function getActivityIcon(type: ActivityType) {
  if (type === "create") return "➕";
  if (type === "update") return "✏️";
  if (type === "status") return "🏷️";
  if (type === "delete") return "🗑️";
  if (type === "restore") return "♻️";
  if (type === "bulk") return "📦";
  if (type === "export") return "💾";
  return "⚙️";
}

function formatActivityTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getArrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

export default function Home() {
  const router = useRouter();

  const {
    entries,
    trashEntries,
    filteredEntries,
    filteredTrashEntries,
    filteredReviewQueueEntries,
    search,
    setSearch,
    addEntry,
    updateEntry,
    updateStatus,
    updateEntriesStatus,
    deleteEntry,
    deleteEntries,
    restoreEntry,
    restoreEntries,
    draftCount,
    reviewQueueCount,
    verifiedCount,
    publishedCount,
    trashCount,
    isLoading,
  } = useEntries();

  const [authStatus, setAuthStatus] =
    useState<AuthStatus>("checking");
  const [userEmail, setUserEmail] =
    useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] =
    useState(false);

  const [isCaptureOpen, setIsCaptureOpen] = useState(false);
  const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false);
  const [isBackupToolsOpen, setIsBackupToolsOpen] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [isConceptsOpen, setIsConceptsOpen] = useState(false);
  const [isGraphStatsOpen, setIsGraphStatsOpen] = useState(false);
  const [isMergeConceptsOpen, setIsMergeConceptsOpen] = useState(false);
  const [graphRevision, setGraphRevision] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("all");
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityItem[]>([]);
  const [renderLimit, setRenderLimit] = useState(INITIAL_RENDER_LIMIT);
  const [importPreview, setImportPreview] = useState<BackupImportPreview>(null);
  const [importError, setImportError] = useState("");
  const [toast, setToast] = useState<ToastState>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [workingLabel, setWorkingLabel] = useState("");
  const [isRelationshipsOpen, setIsRelationshipsOpen] = useState(false);
  const [isGraphExplorerOpen, setIsGraphExplorerOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isGraphMigrationOpen, setIsGraphMigrationOpen] = useState(false);
  const [isCloudGraphOpen, setIsCloudGraphOpen] = useState(false);
  const [isCloudConceptEditorOpen, setIsCloudConceptEditorOpen] = useState(false);
  const [isCloudRelationshipEditorOpen, setIsCloudRelationshipEditorOpen] = useState(false);
  const [isAIAssistantOpen, setIsAIAssistantOpen] =
    useState(false);
    
    const [
  isAISemanticDuplicatesOpen,
  setIsAISemanticDuplicatesOpen,
] = useState(false);

const [
  isAIBatchTriageOpen,
  setIsAIBatchTriageOpen,
] = useState(false);

const [
  isAIRelationshipSuggestionsOpen,
  setIsAIRelationshipSuggestionsOpen,
] = useState(false);

const [
  isAIMissingFieldsOpen,
  setIsAIMissingFieldsOpen,
] = useState(false);

  const [
    aiEditorialHandoff,
    setAIEditorialHandoff,
  ] = useState<AIEditorialHandoff | null>(
    null,
  );

useEffect(() => {
  setIsAIMissingFieldsOpen(false);
}, [selectedEntry?.id]);

  useEffect(() => {
    if (!aiEditorialHandoff) {
      return;
    }

    if (
      !selectedEntry ||
      String(selectedEntry.id) !==
        aiEditorialHandoff.entryId
    ) {
      setAIEditorialHandoff(null);
    }
  }, [
    aiEditorialHandoff,
    selectedEntry,
  ]);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    async function checkCurrentUser() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (error || !user) {
        setUserEmail(null);
        setAuthStatus("signed-out");
        router.replace("/login");
        return;
      }

      setUserEmail(user.email ?? null);
      setAuthStatus("authenticated");
    }

    void checkCurrentUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!isMounted) return;

        if (session?.user) {
          setUserEmail(
            session.user.email ?? null,
          );
          setAuthStatus("authenticated");
          return;
        }

        setUserEmail(null);
        setAuthStatus("signed-out");
        router.replace("/login");
      },
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    try {
      const storedActivity = window.localStorage.getItem(ACTIVITY_STORAGE_KEY);
      if (!storedActivity) return;

      const parsedActivity = JSON.parse(storedActivity) as ActivityItem[];

      if (Array.isArray(parsedActivity)) {
        setActivityLog(parsedActivity);
      }
    } catch {
      setActivityLog([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      ACTIVITY_STORAGE_KEY,
      JSON.stringify(activityLog)
    );
  }, [activityLog]);

  useEffect(() => {
    setRenderLimit(INITIAL_RENDER_LIMIT);
  }, [workspaceMode, search]);

  async function handleLogout() {
    if (isLoggingOut) return;

    const confirmed = window.confirm(
      "Log out of YERRR Studio?",
    );

    if (!confirmed) return;

    try {
      setIsLoggingOut(true);

      const supabase = createClient();
      const { error } =
        await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      setUserEmail(null);
      setAuthStatus("signed-out");

      router.replace("/login");
      router.refresh();
    } catch (error) {
      showToast(
        "error",
        "Logout failed",
        getErrorMessage(error),
      );

      setIsLoggingOut(false);
    }
  }

  function addActivity(type: ActivityType, title: string, detail?: string) {
    const activityItem: ActivityItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type,
      title,
      detail,
      createdAt: new Date().toISOString(),
    };

    setActivityLog((currentLog) => [activityItem, ...currentLog].slice(0, 100));
  }

  function clearActivityLog() {
    const confirmed = window.confirm("Clear the local activity log?");

    if (!confirmed) return;

    setActivityLog([]);
    showToast("success", "Activity log cleared", "Local activity was removed.");
  }

  function exportActivityLogJson() {
    const dateSlug = getBackupDateSlug();

    const backup = {
      app: "YERRR Studio",
      version: APP_VERSION,
      exportType: "activity_log",
      exportedAt: new Date().toISOString(),
      counts: {
        activityItems: activityLog.length,
      },
      activityLog,
    };

    downloadTextFile(
      `yerrr-activity-log-${dateSlug}.json`,
      JSON.stringify(backup, null, 2),
      "application/json"
    );

    addActivity(
      "export",
      "Activity log exported",
      `${activityLog.length} activity items were saved as JSON.`
    );

    showToast(
      "success",
      "Activity exported",
      `${activityLog.length} activity items were saved as JSON.`
    );
  }

  function showToast(type: ToastType, title: string, message?: string) {
    const id = Date.now();

    setToast({
      id,
      type,
      title,
      message,
    });

    window.setTimeout(() => {
      setToast((currentToast) => {
        if (currentToast?.id !== id) return currentToast;
        return null;
      });
    }, 3500);
  }

  async function runWithLoading<T>(
    label: string,
    action: () => Promise<T>,
    successTitle?: string,
    successMessage?: string
  ) {
    try {
      setIsWorking(true);
      setWorkingLabel(label);

      const result = await action();

      if (successTitle) {
        showToast("success", successTitle, successMessage);
      }

      return result;
    } catch (error) {
      showToast("error", "Action failed", getErrorMessage(error));
      throw error;
    } finally {
      setIsWorking(false);
      setWorkingLabel("");
    }
  }

  const duplicateMatchesByEntryId = useMemo(() => {
    return buildDuplicateMatches(entries);
  }, [entries]);

  const sidebarEntries = useMemo(() => {
    return [
      ...entries,
      ...trashEntries.map((entry) => ({
        ...entry,
        deleted_at: "trashed",
      })),
    ];
  }, [entries, trashEntries]);

  const sidebarActiveView =
    workspaceMode === "publish" ? "published" : workspaceMode;

  function handleWorkspaceModeChange(mode: string) {
    const nextMode: WorkspaceMode =
      mode === "published" ? "publish" : (mode as WorkspaceMode);

    setWorkspaceMode(nextMode);
    setSelectedEntryIds([]);
  }

  const filteredDraftQueueEntries = useMemo(() => {
    return filteredEntries.filter(isDraftQueueEntry);
  }, [filteredEntries]);

  const filteredPublishQueueEntries = useMemo(() => {
    return filteredEntries.filter(isPublishQueueEntry);
  }, [filteredEntries]);

  const filteredDuplicateEntries = useMemo(() => {
    return filteredEntries.filter((entry) =>
      duplicateMatchesByEntryId.has(entry.id)
    );
  }, [filteredEntries, duplicateMatchesByEntryId]);

  const visibleEntries = useMemo(() => {
    if (workspaceMode === "review") return filteredReviewQueueEntries;
    if (workspaceMode === "draft") return filteredDraftQueueEntries;
    if (workspaceMode === "publish") return filteredPublishQueueEntries;
    if (workspaceMode === "duplicates") return filteredDuplicateEntries;
    if (workspaceMode === "trash") return filteredTrashEntries;

    return filteredEntries;
  }, [
    workspaceMode,
    filteredReviewQueueEntries,
    filteredDraftQueueEntries,
    filteredPublishQueueEntries,
    filteredDuplicateEntries,
    filteredTrashEntries,
    filteredEntries,
  ]);

  const renderedEntries = useMemo(() => {
    return visibleEntries.slice(0, renderLimit);
  }, [visibleEntries, renderLimit]);

  const hasMoreEntries = renderedEntries.length < visibleEntries.length;
  const remainingEntriesCount = Math.max(
    visibleEntries.length - renderedEntries.length,
    0
  );

  const visibleTotal =
    workspaceMode === "trash" ? trashEntries.length : entries.length;

  const visibleEntryIds = useMemo(() => {
    return visibleEntries.map((entry) => entry.id);
  }, [visibleEntries]);

  const selectedVisibleEntryIds = useMemo(() => {
    return selectedEntryIds.filter((id) => visibleEntryIds.includes(id));
  }, [selectedEntryIds, visibleEntryIds]);

  const allVisibleSelected =
    visibleEntryIds.length > 0 &&
    visibleEntryIds.every((id) => selectedEntryIds.includes(id));

  function loadMoreEntries() {
    setRenderLimit((currentLimit) => currentLimit + RENDER_INCREMENT);
  }

  const handleCreateEntry = useCallback(
  async function handleCreateEntry(...addEntryArgs: Parameters<typeof addEntry>) {
    const possibleEntry = addEntryArgs[0] as unknown;

let createdWord = "New entry";

if (typeof possibleEntry === "string" && possibleEntry.trim()) {
  createdWord = possibleEntry;
}

if (typeof possibleEntry === "object" && possibleEntry !== null) {
  const possibleEntryRecord = possibleEntry as Record<string, unknown>;

  if (typeof possibleEntryRecord.word === "string") {
    createdWord = possibleEntryRecord.word;
  }
}

    await runWithLoading(
      "Saving new entry...",
      async () => {
        await addEntry(...addEntryArgs);
        setIsCaptureOpen(false);
        addActivity(
          "create",
          "Entry captured",
          `${createdWord} was added to the lexicon.`
        );
      },
      "Entry captured",
      `${createdWord} was added to the lexicon.`
    );
  },
  [addEntry]
);

  const handleSaveEntry = useCallback(
    async function handleSaveEntry(updatedEntry: Entry) {
      await runWithLoading(
        "Saving entry...",
        async () => {
          await updateEntry(updatedEntry);
          setSelectedEntry(null);
          addActivity(
            "update",
            "Entry saved",
            `${updatedEntry.word} was updated.`
          );
        },
        "Entry saved",
        `${updatedEntry.word} was updated successfully.`
      );
    },
    [updateEntry]
  );

  const handleAutoSaveEntry = useCallback(
    async function handleAutoSaveEntry(updatedEntry: Entry) {
      await updateEntry(updatedEntry);
    },
    [updateEntry]
  );

  const handleDeleteEntry = useCallback(
    async function handleDeleteEntry(id: string) {
      const entryToDelete =
        entries.find((entry) => entry.id === id) ??
        trashEntries.find((entry) => entry.id === id);

      await runWithLoading(
        "Moving entry to Trash...",
        async () => {
          await deleteEntry(id);
          setSelectedEntry(null);
          setSelectedEntryIds((currentIds) =>
            currentIds.filter((entryId) => entryId !== id)
          );
          addActivity(
            "delete",
            "Entry moved to Trash",
            entryToDelete
              ? `${entryToDelete.word} was moved to Trash.`
              : "One entry was moved to Trash."
          );
        },
        "Moved to Trash",
        "The entry can be restored from the Trash view."
      );
    },
    [deleteEntry, entries, trashEntries]
  );

  const handleRestoreEntry = useCallback(
    async function handleRestoreEntry(id: string) {
      const entryToRestore = trashEntries.find((entry) => entry.id === id);

      await runWithLoading(
        "Restoring entry...",
        async () => {
          await restoreEntry(id);
          setSelectedEntryIds((currentIds) =>
            currentIds.filter((entryId) => entryId !== id)
          );
          addActivity(
            "restore",
            "Entry restored",
            entryToRestore
              ? `${entryToRestore.word} was restored from Trash.`
              : "One entry was restored from Trash."
          );
        },
        "Entry restored",
        "The entry is back in the main CMS."
      );
    },
    [restoreEntry, trashEntries]
  );

  async function handleSingleStatusChange(id: string, status: EntryStatus) {
    const entryToUpdate = entries.find((entry) => entry.id === id);

    await runWithLoading(
      `Moving entry to ${status}...`,
      async () => {
        await updateStatus(id, status);
        addActivity(
          "status",
          "Status updated",
          entryToUpdate
            ? `${entryToUpdate.word} was moved to ${status}.`
            : `One entry was moved to ${status}.`
        );
      },
      "Status updated",
      `Entry moved to ${status}.`
    );
  }

  function toggleEntrySelection(id: string) {
    setSelectedEntryIds((currentIds) =>
      currentIds.includes(id)
        ? currentIds.filter((entryId) => entryId !== id)
        : [...currentIds, id]
    );
  }

  function selectAllVisibleEntries() {
    setSelectedEntryIds((currentIds) => {
      const mergedIds = new Set([...currentIds, ...visibleEntryIds]);
      return Array.from(mergedIds);
    });

    showToast(
      "info",
      "Visible entries selected",
      `${visibleEntryIds.length} entr${
        visibleEntryIds.length === 1 ? "y" : "ies"
      } selected in this view.`
    );
  }

  function deselectVisibleEntries() {
    setSelectedEntryIds((currentIds) =>
      currentIds.filter((id) => !visibleEntryIds.includes(id))
    );

    showToast("info", "Selection cleared", "Visible entries were deselected.");
  }

  function clearSelectedEntries() {
    setSelectedEntryIds([]);
    showToast("info", "Selection cleared", "All selected entries were cleared.");
  }

  async function handleBulkStatusChange(status: EntryStatus) {
    if (selectedVisibleEntryIds.length === 0) return;

    const selectedCount = selectedVisibleEntryIds.length;

    const confirmed = window.confirm(
      `Move ${selectedCount} selected entr${
        selectedCount === 1 ? "y" : "ies"
      } to ${status}?`
    );

    if (!confirmed) return;

    await runWithLoading(
      `Moving ${selectedCount} entries to ${status}...`,
      async () => {
        await updateEntriesStatus(selectedVisibleEntryIds, status);
        setSelectedEntryIds([]);
        addActivity(
          "bulk",
          "Bulk status updated",
          `${selectedCount} entr${
            selectedCount === 1 ? "y was" : "ies were"
          } moved to ${status}.`
        );
      },
      "Bulk status updated",
      `${selectedCount} entr${
        selectedCount === 1 ? "y was" : "ies were"
      } moved to ${status}.`
    );
  }

  async function handleBulkDelete() {
    if (selectedVisibleEntryIds.length === 0) return;

    const selectedCount = selectedVisibleEntryIds.length;

    const confirmed = window.confirm(
      `Move ${selectedCount} selected entr${
        selectedCount === 1 ? "y" : "ies"
      } to Trash? You can restore them later.`
    );

    if (!confirmed) return;

    await runWithLoading(
      `Moving ${selectedCount} entries to Trash...`,
      async () => {
        await deleteEntries(selectedVisibleEntryIds);
        setSelectedEntryIds([]);
        addActivity(
          "bulk",
          "Bulk delete",
          `${selectedCount} entr${
            selectedCount === 1 ? "y was" : "ies were"
          } moved to Trash.`
        );
      },
      "Moved to Trash",
      `${selectedCount} entr${
        selectedCount === 1 ? "y was" : "ies were"
      } moved to Trash.`
    );
  }

  async function handleBulkRestore() {
    if (selectedVisibleEntryIds.length === 0) return;

    const selectedCount = selectedVisibleEntryIds.length;

    const confirmed = window.confirm(
      `Restore ${selectedCount} selected entr${
        selectedCount === 1 ? "y" : "ies"
      } from Trash?`
    );

    if (!confirmed) return;

    await runWithLoading(
      `Restoring ${selectedCount} entries...`,
      async () => {
        await restoreEntries(selectedVisibleEntryIds);
        setSelectedEntryIds([]);
        addActivity(
          "bulk",
          "Bulk restore",
          `${selectedCount} entr${
            selectedCount === 1 ? "y was" : "ies were"
          } restored from Trash.`
        );
      },
      "Entries restored",
      `${selectedCount} entr${
        selectedCount === 1 ? "y was" : "ies were"
      } restored from Trash.`
    );
  }

  function exportActiveEntriesJson() {
    const dateSlug = getBackupDateSlug();

    const backup = {
      app: "YERRR Studio",
      version: APP_VERSION,
      exportType: "active_entries",
      exportedAt: new Date().toISOString(),
      counts: {
        activeEntries: entries.length,
        trashEntries: trashEntries.length,
      },
      entries,
    };

    downloadTextFile(
      `yerrr-active-entries-${dateSlug}.json`,
      JSON.stringify(backup, null, 2),
      "application/json"
    );

    addActivity(
      "export",
      "Active entries exported",
      `${entries.length} active entries were saved as JSON.`
    );

    showToast(
      "success",
      "Active entries exported",
      `${entries.length} active entries were saved as JSON.`
    );
  }

  function exportTrashEntriesJson() {
    const dateSlug = getBackupDateSlug();

    const backup = {
      app: "YERRR Studio",
      version: APP_VERSION,
      exportType: "trash_entries",
      exportedAt: new Date().toISOString(),
      counts: {
        activeEntries: entries.length,
        trashEntries: trashEntries.length,
      },
      trashEntries,
    };

    downloadTextFile(
      `yerrr-trash-entries-${dateSlug}.json`,
      JSON.stringify(backup, null, 2),
      "application/json"
    );

    addActivity(
      "export",
      "Trash exported",
      `${trashEntries.length} trash entries were saved as JSON.`
    );

    showToast(
      "success",
      "Trash exported",
      `${trashEntries.length} trash entries were saved as JSON.`
    );
  }

  function exportFullBackupJson() {
    const dateSlug = getBackupDateSlug();

    const backup = {
      app: "YERRR Studio",
      version: APP_VERSION,
      exportType: "full_backup",
      exportedAt: new Date().toISOString(),
      counts: {
        activeEntries: entries.length,
        trashEntries: trashEntries.length,
        visibleEntries: visibleEntries.length,
        reviewQueue: reviewQueueCount,
        drafts: draftCount,
        verified: verifiedCount,
        published: publishedCount,
        possibleDuplicates: duplicateMatchesByEntryId.size,
      },
      workspace: {
        currentMode: workspaceMode,
        search,
      },
      entries,
      trashEntries,
    };

    downloadTextFile(
      `yerrr-full-backup-${dateSlug}.json`,
      JSON.stringify(backup, null, 2),
      "application/json"
    );

    addActivity(
      "export",
      "Full backup exported",
      `${entries.length + trashEntries.length} total entries were saved.`
    );

    showToast(
      "success",
      "Full backup exported",
      `${entries.length + trashEntries.length} total entries were saved.`
    );
  }

  function exportVisibleEntriesCsv() {
    const dateSlug = getBackupDateSlug();
    const csv = entriesToCsv(visibleEntries);

    downloadTextFile(
      `yerrr-${workspaceMode}-visible-entries-${dateSlug}.csv`,
      csv,
      "text/csv"
    );

    addActivity(
      "export",
      "Visible CSV exported",
      `${visibleEntries.length} visible entries were saved as CSV.`
    );

    showToast(
      "success",
      "CSV exported",
      `${visibleEntries.length} visible entries were saved as CSV.`
    );
  }

  async function handleBackupImportPreview(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    setImportPreview(null);
    setImportError("");

    if (!file) return;

    try {
      const text = await file.text();
      const parsedBackup = JSON.parse(text) as Record<string, any>;

      const activeEntries = getArrayLength(parsedBackup.entries);
      const trashEntriesCount = getArrayLength(parsedBackup.trashEntries);
      const warnings: string[] = [];

      if (parsedBackup.app !== "YERRR Studio") {
        warnings.push("This file does not identify itself as a YERRR Studio backup.");
      }

      if (!Array.isArray(parsedBackup.entries)) {
        warnings.push("No active entries array was found.");
      }

      if (
        parsedBackup.exportType === "full_backup" &&
        !Array.isArray(parsedBackup.trashEntries)
      ) {
        warnings.push("This full backup does not include a trash entries array.");
      }

      if (activeEntries + trashEntriesCount === 0) {
        warnings.push("No entries were found in this file.");
      }

      setImportPreview({
        fileName: file.name,
        app: parsedBackup.app,
        version: parsedBackup.version,
        exportType: parsedBackup.exportType,
        exportedAt: parsedBackup.exportedAt,
        activeEntries,
        trashEntries: trashEntriesCount,
        totalEntries: activeEntries + trashEntriesCount,
        warnings,
      });

      addActivity(
        "system",
        "Backup preview loaded",
        `${file.name} was scanned without writing to Supabase.`
      );

      showToast(
        "success",
        "Backup preview ready",
        `${activeEntries + trashEntriesCount} entries found in ${file.name}.`
      );
    } catch {
      setImportError(
        "Could not read this file. Make sure it is a valid YERRR Studio JSON backup."
      );

      showToast(
        "error",
        "Preview failed",
        "The selected file could not be parsed as JSON."
      );
    } finally {
      event.target.value = "";
    }
  }

  function clearImportPreview() {
    setImportPreview(null);
    setImportError("");
  }

  const workspaceTitle =
    workspaceMode === "review"
      ? "Review Queue"
      : workspaceMode === "draft"
      ? "Draft Queue"
      : workspaceMode === "publish"
      ? "Publish Queue"
      : workspaceMode === "duplicates"
      ? "Duplicate Detection"
      : workspaceMode === "trash"
      ? "Trash / Undo Delete"
      : "Entry Workspace";

  const workspaceDescription =
    workspaceMode === "review"
      ? "Focus only on entries that need editorial work."
      : workspaceMode === "draft"
      ? "Focus only on unfinished draft entries before they move into review."
      : workspaceMode === "publish"
      ? "Focus only on verified entries that are ready to publish."
      : workspaceMode === "duplicates"
? "Find exact spelling matches and use AI to review possible semantic duplicates."
      : workspaceMode === "trash"
      ? "Restore entries that were deleted by mistake."
      : "Search, open, edit, autosave, verify, publish, and delete captured slang.";

  const workspaceTabs: Array<[WorkspaceMode, string]> = [
    ["all", "All Entries"],
    ["review", "Review Queue"],
    ["draft", "Draft Queue"],
    ["publish", "Publish Queue"],
    ["duplicates", "Duplicates"],
    ["trash", "Trash"],
  ];

  if (
    !isHydrated ||
    authStatus === "checking"
  ) {
    return (
      <main className="min-h-screen bg-neutral-950 text-white">
        <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6">
          <div className="rounded-3xl border border-neutral-800 bg-neutral-900 px-8 py-7 text-center shadow-2xl">
            <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-yellow-400 border-t-transparent" />

            <p className="mt-5 text-xs font-black uppercase tracking-[0.3em] text-yellow-400">
              YERRR Studio
            </p>

            <p className="mt-3 text-lg font-black text-white">
              Checking session...
            </p>

            <p className="mt-2 text-sm text-neutral-500">
              Verifying your Supabase login before loading the workspace.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (authStatus === "signed-out") {
    return (
      <main className="min-h-screen bg-neutral-950 text-white">
        <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6">
          <div className="max-w-md rounded-3xl border border-neutral-800 bg-neutral-900 px-8 py-7 text-center shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-yellow-400">
              YERRR Studio
            </p>

            <p className="mt-3 text-xl font-black text-white">
              Sign-in required
            </p>

            <p className="mt-2 text-sm leading-6 text-neutral-500">
              Redirecting to the login page. The empty dashboard will no longer appear while signed out.
            </p>

            <button
              type="button"
              onClick={() =>
                router.replace("/login")
              }
              className="mt-5 rounded-xl bg-yellow-400 px-5 py-3 text-sm font-black text-black hover:bg-yellow-300"
            >
              Go to Login
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
  <main className="min-h-screen bg-neutral-950 text-white lg:flex">
    <Sidebar
  entries={sidebarEntries}
  activeView={sidebarActiveView}
  setActiveView={handleWorkspaceModeChange}
  onCreateEntry={() => setIsCaptureOpen(true)}
  onOpenAdvancedSearch={() =>
    setIsAdvancedSearchOpen(true)
  }
  onOpenActivity={() => setIsActivityOpen(true)}
  onOpenBackup={() => setIsBackupToolsOpen(true)}
  onOpenConcepts={() => setIsConceptsOpen(true)}
  onOpenGraphStats={() => setIsGraphStatsOpen(true)}
  onOpenMergeConcepts={() =>
    setIsMergeConceptsOpen(true)
  }
  onOpenRelationships={() =>
    setIsRelationshipsOpen(true)
  }
  onOpenGraphExplorer={() =>
    setIsGraphExplorerOpen(true)
  }
  onOpenGraphMigration={() =>
    setIsGraphMigrationOpen(true)
  }
  onOpenCloudGraph={() =>
    setIsCloudGraphOpen(true)
  }
  onOpenCloudConceptEditor={() =>
    setIsCloudConceptEditorOpen(true)
  }
  onOpenCloudRelationshipEditor={() =>
    setIsCloudRelationshipEditorOpen(true)
  }
  onOpenAIAssistant={() =>
    setIsAIAssistantOpen(true)
  }
  userEmail={userEmail}
  onLogout={() => {
    void handleLogout();
  }}
/>

    <section className="flex-1">
        <div className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:py-10 lg:px-8">
          <header className="mb-8 flex flex-col gap-5 md:mb-10 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-yellow-400 sm:text-sm">
                Dashboard
              </p>
              <h1 className="text-4xl font-black tracking-tight sm:text-5xl md:text-6xl">
                The NYC Slang Lexicon
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-400 sm:text-base">
                Capture, review, verify, and publish the living language of New
                York City.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center">
              <button
                onClick={() => setIsActivityOpen(true)}
                className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-4 font-black text-white transition hover:border-yellow-400 hover:text-yellow-300"
              >
                🧾 Activity
              </button>

              <button
                onClick={() => setIsBackupToolsOpen(true)}
                disabled={isWorking || isLoading}
                className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-4 font-black text-white transition hover:border-yellow-400 hover:text-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                💾 Backup
              </button>

              <button
                onClick={() => setIsCaptureOpen(true)}
                disabled={isWorking}
                className="rounded-xl bg-yellow-400 px-4 py-4 font-black text-black transition hover:scale-[1.01] hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                ➕ Capture
              </button>
            </div>
          </header>

          {(isLoading || isWorking) && (
            <div className="mb-6 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-sm text-yellow-100">
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-yellow-400 border-t-transparent" />
                <div>
                  <p className="font-black">
                    {isLoading ? "Loading entries..." : workingLabel}
                  </p>
                  <p className="text-yellow-100/70">
                    YERRR Studio is syncing with Supabase.
                  </p>
                </div>
              </div>
            </div>
          )}

          <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            <StatCard emoji="✅" label="Verified / Ready" value={verifiedCount} />
            <StatCard
              emoji="🧬"
              label="Possible Duplicates"
              value={duplicateMatchesByEntryId.size}
            />
            <StatCard emoji="🗑️" label="Trash" value={trashCount} />
            <StatCard emoji="🚀" label="Published" value={publishedCount} />
          </section>

          <section className="mt-4 grid grid-cols-2 gap-3 md:hidden">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                Review
              </p>
              <p className="mt-2 text-2xl font-black text-white">
                {reviewQueueCount}
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                Drafts
              </p>
              <p className="mt-2 text-2xl font-black text-white">
                {draftCount}
              </p>
            </div>
          </section>

          <section
            id="entry-workspace"
            className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-6 md:mt-10"
          >
            <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
  <div>
    <h2 className="text-xl font-bold">
      {workspaceTitle}
    </h2>

    <p className="mt-1 text-sm leading-6 text-neutral-500">
      {workspaceDescription}
    </p>
  </div>

  <div className="flex w-full flex-col gap-3 md:max-w-sm">
    <input
      value={search}
      onChange={(event) =>
        setSearch(event.target.value)
      }
      placeholder="Search deadass, brick, ocky..."
      className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400 sm:text-base"
    />

    {workspaceMode === "review" &&
      !isAIBatchTriageOpen && (
        <button
          type="button"
          onClick={() =>
            setIsAIBatchTriageOpen(true)
          }
          className="w-full rounded-xl bg-fuchsia-300 px-4 py-3 text-sm font-black text-black shadow-lg transition hover:bg-fuchsia-200"
        >
          📋 AI batch triage
        </button>
      )}

{workspaceMode === "all" &&
  !isAIRelationshipSuggestionsOpen && (
    <button
      type="button"
      onClick={() =>
        setIsAIRelationshipSuggestionsOpen(
          true,
        )
      }
      className="w-full rounded-xl bg-emerald-300 px-4 py-3 text-sm font-black text-black shadow-lg transition hover:bg-emerald-200"
    >
      🕸️ AI relationship suggestions
    </button>
  )}

  </div>
</div>

            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="-mx-1 overflow-x-auto px-1 pb-1">
                <div className="flex min-w-max rounded-xl border border-neutral-800 bg-neutral-950 p-1">
                  {workspaceTabs.map(([mode, label]) => (
                    <button
                      key={mode}
                      onClick={() => handleWorkspaceModeChange(mode)}
                      disabled={isWorking}
                      className={`rounded-lg px-4 py-2 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50 ${
                        workspaceMode === mode
                          ? "bg-yellow-400 text-black"
                          : "text-neutral-400 hover:text-white"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-400">
                Showing{" "}
                <span className="font-black text-white">
                  {visibleEntries.length}
                </span>{" "}
                of{" "}
                <span className="font-black text-white">{visibleTotal}</span>{" "}
                entries
              </div>
            </div>

            <div className="mb-5 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="font-black text-white">Bulk Actions</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Selected in this view:{" "}
                    <span className="font-black text-yellow-400">
                      {selectedVisibleEntryIds.length}
                    </span>
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  <button
                    onClick={
                      allVisibleSelected
                        ? deselectVisibleEntries
                        : selectAllVisibleEntries
                    }
                    disabled={visibleEntries.length === 0 || isWorking}
                    className="rounded-xl bg-neutral-800 px-4 py-3 text-sm font-black text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {allVisibleSelected ? "Deselect" : "Select Visible"}
                  </button>

                  <button
                    onClick={clearSelectedEntries}
                    disabled={selectedEntryIds.length === 0 || isWorking}
                    className="rounded-xl bg-neutral-800 px-4 py-3 text-sm font-black text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {workspaceMode === "trash" ? (
                  <button
                    onClick={handleBulkRestore}
                    disabled={selectedVisibleEntryIds.length === 0 || isWorking}
                    className="col-span-2 rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40 sm:col-span-1"
                  >
                    Restore Selected
                  </button>
                ) : (
                  <>
                    {entryStatusOptions.map((status) => (
                      <button
                        key={status}
                        onClick={() => handleBulkStatusChange(status)}
                        disabled={
                          selectedVisibleEntryIds.length === 0 || isWorking
                        }
                        className="rounded-xl bg-yellow-400 px-3 py-3 text-xs font-black text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4 sm:text-sm"
                      >
                        Move to {status}
                      </button>
                    ))}

                    <button
                      onClick={handleBulkDelete}
                      disabled={selectedVisibleEntryIds.length === 0 || isWorking}
                      className="rounded-xl bg-red-600 px-3 py-3 text-xs font-black text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4 sm:text-sm"
                    >
                      Move to Trash
                    </button>
                  </>
                )}
              </div>
            </div>

            {workspaceMode === "trash" && (
              <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 p-4">
                <p className="font-black text-red-300">Trash Rules</p>
                <p className="mt-2 text-sm text-red-100/80">
                  Deleted entries appear here instead of being permanently
                  removed. Restore them to bring them back into the CMS.
                </p>
              </div>
            )}

            {isLoading ? (
              <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-neutral-500">
                Loading entries...
              </div>
            ) : visibleEntries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-neutral-500">
                {workspaceMode === "trash"
                  ? "Trash is empty."
                  : workspaceMode === "review"
                  ? "No review items. Everything in this view looks clean."
                  : workspaceMode === "draft"
                  ? "No draft items. Everything has moved beyond draft."
                  : workspaceMode === "publish"
                  ? "No verified entries ready to publish yet."
                  : workspaceMode === "duplicates"
                  ? "No potential duplicates found."
                  : entries.length === 0
                  ? "No entries yet. Capture your first word."
                  : "No matching entries found."}
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-400 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    Rendering{" "}
                    <span className="font-black text-white">
                      {renderedEntries.length}
                    </span>{" "}
                    of{" "}
                    <span className="font-black text-white">
                      {visibleEntries.length}
                    </span>{" "}
                    matching entries.
                  </div>

                  {hasMoreEntries && (
                    <button
                      onClick={loadMoreEntries}
                      className="rounded-xl bg-neutral-800 px-4 py-2 text-sm font-black text-white hover:bg-neutral-700"
                    >
                      Load {Math.min(RENDER_INCREMENT, remainingEntriesCount)} More
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {renderedEntries.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      onOpen={() => setSelectedEntry(entry)}
                      onStatusChange={(status) =>
                        handleSingleStatusChange(entry.id, status)
                      }
                      isSelected={selectedEntryIds.includes(entry.id)}
                      onToggleSelected={() => toggleEntrySelection(entry.id)}
                      duplicateMatches={
                        duplicateMatchesByEntryId.get(entry.id) ?? []
                      }
                      isDeleted={workspaceMode === "trash"}
                      onRestore={() => handleRestoreEntry(entry.id)}
                    />
                  ))}
                </div>

                {hasMoreEntries && (
                  <div className="mt-5 flex justify-center">
                    <button
                      onClick={loadMoreEntries}
                      className="rounded-xl border border-neutral-700 bg-neutral-900 px-5 py-3 text-sm font-black text-white hover:border-yellow-400 hover:text-yellow-300"
                    >
                      Load More Entries · {remainingEntriesCount} remaining
                    </button>
                  </div>
                )}
              </>
            )}
          </section>

          <footer className="mt-10 border-t border-neutral-800 pt-6 text-sm text-neutral-500">
            YERRR Studio {APP_VERSION} · Cloud Unified Graph Explorer
          </footer>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-800 bg-neutral-950/95 p-3 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-6xl grid-cols-4 gap-2">
          <button
            onClick={() => setIsCaptureOpen(true)}
            disabled={isWorking}
            className="rounded-xl bg-yellow-400 px-3 py-3 text-xs font-black text-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            ➕ Capture
          </button>

          <button
            onClick={() => setIsActivityOpen(true)}
            className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-xs font-black text-white"
          >
            🧾 Log
          </button>

          <button
            onClick={() => setIsBackupToolsOpen(true)}
            disabled={isWorking || isLoading}
            className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            💾 Backup
          </button>

          <a
            href="#entry-workspace"
            className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-center text-xs font-black text-white"
          >
            Work
          </a>
        </div>
      </div>

      {isBackupToolsOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
          <button
            aria-label="Close backup tools"
            onClick={() => setIsBackupToolsOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default"
          />

          <aside className="absolute bottom-0 right-0 max-h-[88vh] w-full overflow-y-auto rounded-t-3xl border-t border-neutral-800 bg-neutral-950 p-5 shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-h-none md:max-w-md md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0 md:p-6">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.25em] text-yellow-400">
                  Backup Tools
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">
                  Export / Preview Data
                </h2>
                <p className="mt-2 text-sm leading-6 text-neutral-500">
                  Export safe local backups or preview a backup file before any
                  future restore action.
                </p>
              </div>

              <button
                onClick={() => setIsBackupToolsOpen(false)}
                className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-black text-neutral-300 hover:border-neutral-700 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                  Active
                </p>
                <p className="mt-2 text-2xl font-black text-white">
                  {entries.length}
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                  Trash
                </p>
                <p className="mt-2 text-2xl font-black text-white">
                  {trashEntries.length}
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                  Visible
                </p>
                <p className="mt-2 text-2xl font-black text-white">
                  {visibleEntries.length}
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                  Version
                </p>
                <p className="mt-2 text-lg font-black text-white">
                  {APP_VERSION}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={exportFullBackupJson}
                disabled={isWorking || isLoading}
                className="w-full rounded-xl bg-yellow-400 px-4 py-4 text-sm font-black text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Export Full JSON
              </button>

              <button
                onClick={exportActiveEntriesJson}
                disabled={isWorking || isLoading}
                className="w-full rounded-xl bg-neutral-800 px-4 py-4 text-sm font-black text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Export Active JSON
              </button>

              <button
                onClick={exportTrashEntriesJson}
                disabled={isWorking || isLoading}
                className="w-full rounded-xl bg-neutral-800 px-4 py-4 text-sm font-black text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Export Trash JSON
              </button>

              <button
                onClick={exportVisibleEntriesCsv}
                disabled={isWorking || isLoading || visibleEntries.length === 0}
                className="w-full rounded-xl bg-neutral-800 px-4 py-4 text-sm font-black text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Export Visible CSV
              </button>
            </div>

            <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <p className="font-black text-white">Safe Import Preview</p>
              <p className="mt-2 text-sm leading-6 text-neutral-500">
                Choose a YERRR Studio JSON backup to inspect it. This preview
                does not create, update, delete, or restore any Supabase data.
              </p>

              <label className="mt-4 block cursor-pointer rounded-xl border border-dashed border-neutral-700 bg-neutral-950 px-4 py-4 text-center text-sm font-black text-neutral-300 hover:border-yellow-400 hover:text-yellow-300">
                Choose JSON Backup
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleBackupImportPreview}
                  className="hidden"
                />
              </label>

              {importError && (
                <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">
                  {importError}
                </div>
              )}

              {importPreview && (
                <div className="mt-4 rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-yellow-100">
                        Preview Loaded
                      </p>
                      <p className="mt-1 break-all text-sm text-yellow-100/70">
                        {importPreview.fileName}
                      </p>
                    </div>

                    <button
                      onClick={clearImportPreview}
                      className="rounded-lg bg-black/20 px-2 py-1 text-xs font-black text-yellow-100 hover:bg-black/30"
                    >
                      Clear
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-black/20 p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-yellow-100/50">
                        Active
                      </p>
                      <p className="mt-1 text-xl font-black text-yellow-100">
                        {importPreview.activeEntries}
                      </p>
                    </div>

                    <div className="rounded-xl bg-black/20 p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-yellow-100/50">
                        Trash
                      </p>
                      <p className="mt-1 text-xl font-black text-yellow-100">
                        {importPreview.trashEntries}
                      </p>
                    </div>

                    <div className="rounded-xl bg-black/20 p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-yellow-100/50">
                        Type
                      </p>
                      <p className="mt-1 text-sm font-black text-yellow-100">
                        {importPreview.exportType ?? "Unknown"}
                      </p>
                    </div>

                    <div className="rounded-xl bg-black/20 p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-yellow-100/50">
                        Version
                      </p>
                      <p className="mt-1 text-sm font-black text-yellow-100">
                        {importPreview.version ?? "Unknown"}
                      </p>
                    </div>
                  </div>

                  {importPreview.exportedAt && (
                    <p className="mt-3 text-xs text-yellow-100/60">
                      Exported at: {importPreview.exportedAt}
                    </p>
                  )}

                  {importPreview.warnings.length > 0 && (
                    <div className="mt-4 rounded-xl border border-yellow-300/20 bg-black/20 p-3">
                      <p className="text-sm font-black text-yellow-100">
                        Warnings
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-yellow-100/70">
                        {importPreview.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <button
                    disabled
                    className="mt-4 w-full cursor-not-allowed rounded-xl bg-neutral-800 px-4 py-3 text-sm font-black text-neutral-500"
                  >
                    Restore Coming Later
                  </button>
                </div>
              )}
            </div>

            <div className="mt-6 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
              <p className="font-black text-yellow-100">Backup note</p>
              <p className="mt-2 text-sm leading-6 text-yellow-100/70">
                Import is currently preview-only. Restore should be added
                carefully later so it does not overwrite your live Supabase data
                by accident.
              </p>
            </div>
          </aside>
        </div>
      )}

      {isActivityOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
          <button
            aria-label="Close activity log"
            onClick={() => setIsActivityOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default"
          />

          <aside className="absolute bottom-0 right-0 max-h-[88vh] w-full overflow-y-auto rounded-t-3xl border-t border-neutral-800 bg-neutral-950 p-5 shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-h-none md:max-w-md md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0 md:p-6">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.25em] text-yellow-400">
                  Activity Log
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">
                  Recent CMS Changes
                </h2>
                <p className="mt-2 text-sm leading-6 text-neutral-500">
                  Local changelog for this browser. It tracks recent actions
                  without changing your Supabase schema.
                </p>
              </div>

              <button
                onClick={() => setIsActivityOpen(false)}
                className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-black text-neutral-300 hover:border-neutral-700 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                  Logged
                </p>
                <p className="mt-2 text-2xl font-black text-white">
                  {activityLog.length}
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                  Storage
                </p>
                <p className="mt-2 text-lg font-black text-white">Local</p>
              </div>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-2">
              <button
                onClick={exportActivityLogJson}
                disabled={activityLog.length === 0}
                className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Export Log
              </button>

              <button
                onClick={clearActivityLog}
                disabled={activityLog.length === 0}
                className="rounded-xl bg-neutral-800 px-4 py-3 text-sm font-black text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Clear Log
              </button>
            </div>

            {activityLog.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
                No activity logged yet. Create, edit, export, delete, restore,
                or bulk update entries to start building a changelog.
              </div>
            ) : (
              <div className="space-y-3">
                {activityLog.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-800">
                        {getActivityIcon(item.type)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-black text-white">{item.title}</p>
                          <p className="shrink-0 text-xs text-neutral-500">
                            {formatActivityTime(item.createdAt)}
                          </p>
                        </div>

                        {item.detail && (
                          <p className="mt-1 text-sm leading-6 text-neutral-400">
                            {item.detail}
                          </p>
                        )}

                        <p className="mt-2 text-xs font-bold uppercase tracking-[0.2em] text-neutral-600">
                          {item.type}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
      <AdvancedSearchDrawer
        isOpen={isAdvancedSearchOpen}
        onClose={() => setIsAdvancedSearchOpen(false)}
        entries={entries}
        onOpenEntry={(entry) => {
          setIsAdvancedSearchOpen(false);
          setSelectedEntry(entry);
        }}
      />

      <MergeConceptsDrawer
  isOpen={isMergeConceptsOpen}
  onClose={() => setIsMergeConceptsOpen(false)}
  entries={entries}
  onMerged={() => {
    setGraphRevision((currentRevision) => currentRevision + 1);
  }}
/>

<AIAssistantDrawer
  isOpen={isAIAssistantOpen}
  onClose={() => setIsAIAssistantOpen(false)}
  entries={entries}
  onOpenEntry={(entry) => {
    setIsAIAssistantOpen(false);
    setAIEditorialHandoff(null);
    setSelectedEntry(entry);
  }}
  onSendApprovedPlan={(handoff) => {
    const entry = entries.find(
      (item) =>
        String(item.id) ===
        handoff.entryId
    );

    if (!entry) {
      showToast(
        "error",
        "Entry not found",
        "The approved AI plan no longer matches an active lexicon entry."
      );
      return;
    }

    setIsAIAssistantOpen(false);
    setAIEditorialHandoff(handoff);
    setSelectedEntry(entry);

    showToast(
      "success",
      "AI plan opened",
      `${handoff.approvedEdits.length} approved change${
        handoff.approvedEdits.length === 1
          ? ""
          : "s"
      } ready for manual verification.`
    );
  }}
/>

{isAIRelationshipSuggestionsOpen && (
  <AIRelationshipSuggestionsPanel
    entries={entries}
    onClose={() =>
      setIsAIRelationshipSuggestionsOpen(
        false,
      )
    }
    onOpenEntry={(entry) => {
      setIsAIRelationshipSuggestionsOpen(
        false,
      );

      setSelectedEntry(entry);
    }}
    onOpenRelationshipEditor={() => {
      setIsAIRelationshipSuggestionsOpen(
        false,
      );

      setIsCloudRelationshipEditorOpen(
        true,
      );
    }}
  />
)}

<CloudRelationshipEditorDrawer
  isOpen={isCloudRelationshipEditorOpen}
  onClose={() =>
    setIsCloudRelationshipEditorOpen(false)
  }
  entries={entries}
  onOpenEntry={(entry) => {
    setIsCloudRelationshipEditorOpen(false);
    setSelectedEntry(entry);
  }}
  onGraphChanged={() => {
    setGraphRevision(
      (currentRevision) => currentRevision + 1
    );
  }}
/>

<CloudConceptEditorDrawer
  isOpen={isCloudConceptEditorOpen}
  onClose={() => setIsCloudConceptEditorOpen(false)}
  entries={entries}
  onOpenEntry={(entry) => {
    setIsCloudConceptEditorOpen(false);
    setSelectedEntry(entry);
  }}
  onGraphChanged={() => {
    setGraphRevision(
      (currentRevision) => currentRevision + 1
    );
  }}
/>

<CloudGraphDrawer
  isOpen={isCloudGraphOpen}
  onClose={() => setIsCloudGraphOpen(false)}
  entries={entries}
  onOpenEntry={(entry) => {
    setIsCloudGraphOpen(false);
    setSelectedEntry(entry);
  }}
/>

<GraphMigrationDrawer
  isOpen={isGraphMigrationOpen}
  onClose={() => setIsGraphMigrationOpen(false)}
  entries={entries}
  onMigrated={() => {
    setGraphRevision((currentRevision) => currentRevision + 1);
  }}
/>

<GraphExplorerDrawer
  key={`graph-explorer-${graphRevision}`}
  isOpen={isGraphExplorerOpen}
  onClose={() => setIsGraphExplorerOpen(false)}
  entries={entries}
  onOpenEntry={(entry) => {
    setIsGraphExplorerOpen(false);
    setSelectedEntry(entry);
  }}
  onOpenCloudConcepts={() => {
    setIsGraphExplorerOpen(false);
    setIsCloudConceptEditorOpen(true);
  }}
  onOpenCloudRelationships={() => {
    setIsGraphExplorerOpen(false);
    setIsCloudRelationshipEditorOpen(true);
  }}
/>

<RelationshipDrawer
  isOpen={isRelationshipsOpen}
  onClose={() => setIsRelationshipsOpen(false)}
  entries={entries}
  onOpenEntry={(entry) => {
    setIsRelationshipsOpen(false);
    setSelectedEntry(entry);
  }}
/>

<GraphStatsDrawer
  key={`graph-stats-${graphRevision}`}
  isOpen={isGraphStatsOpen}
  onClose={() => setIsGraphStatsOpen(false)}
  entries={entries}
  onOpenConcepts={() => {
    setIsGraphStatsOpen(false);
    setIsCloudConceptEditorOpen(true);
  }}
  onOpenEntry={(entry) => {
    setIsGraphStatsOpen(false);
    setSelectedEntry(entry);
  }}
/>

<ConceptDrawer
  key={`concepts-${graphRevision}`}
  isOpen={isConceptsOpen}
  onClose={() => setIsConceptsOpen(false)}
  entries={entries}
  onOpenEntry={(entry) => setSelectedEntry(entry)}
/>

      {isCaptureOpen && (
        <CaptureModal
          onClose={() => setIsCaptureOpen(false)}
          onSave={handleCreateEntry}
        />
      )}

      {selectedEntry && (
  <EntryEditorModal
    entry={selectedEntry}
    onClose={() => {
      setIsAIMissingFieldsOpen(false);
      setSelectedEntry(null);
    }}
    onSave={handleSaveEntry}
    onAutoSave={handleAutoSaveEntry}
    onDelete={handleDeleteEntry}
  />
)}

{selectedEntry &&
  !isAIMissingFieldsOpen && (
    <button
      type="button"
      onClick={() =>
        setIsAIMissingFieldsOpen(true)
      }
      className="fixed bottom-24 left-4 z-[94] rounded-2xl border border-violet-300/30 bg-violet-400 px-4 py-3 text-sm font-black text-black shadow-2xl transition hover:scale-[1.02] hover:bg-violet-300 md:bottom-6 md:left-6"
    >
      ✨ Fill missing fields
    </button>
  )}

{selectedEntry &&
  isAIMissingFieldsOpen && (
    <AIMissingFieldsPanel
      key={`ai-missing-fields-${selectedEntry.id}`}
      entry={selectedEntry}
      onClose={() =>
        setIsAIMissingFieldsOpen(false)
      }
    />
  )}

      {selectedEntry &&
        aiEditorialHandoff &&
        String(selectedEntry.id) ===
          aiEditorialHandoff.entryId && (
          <AIEditorialHandoffPanel
            handoff={aiEditorialHandoff}
            onClose={() =>
              setAIEditorialHandoff(null)
            }
          />
        )}

      {toast && (
        <div className="fixed bottom-24 right-4 z-[60] w-[calc(100%-2rem)] max-w-sm md:bottom-5 md:right-5 md:w-[calc(100%-2.5rem)]">
          <div
            className={`rounded-2xl border p-4 shadow-2xl backdrop-blur ${
              toast.type === "success"
                ? "border-green-400/30 bg-green-950/90 text-green-50"
                : toast.type === "error"
                ? "border-red-400/30 bg-red-950/90 text-red-50"
                : "border-yellow-400/30 bg-neutral-950/90 text-yellow-50"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-black">{toast.title}</p>

                {toast.message && (
                  <p className="mt-1 text-sm opacity-80">{toast.message}</p>
                )}
              </div>

              <button
                onClick={() => setToast(null)}
                className="rounded-lg px-2 py-1 text-sm font-black opacity-70 hover:bg-white/10 hover:opacity-100"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      {workspaceMode === "duplicates" &&
  !isAISemanticDuplicatesOpen && (
    <button
      type="button"
      onClick={() =>
        setIsAISemanticDuplicatesOpen(
          true,
        )
      }
      className="fixed bottom-24 right-4 z-[65] rounded-2xl border border-cyan-200/30 bg-cyan-300 px-4 py-3 text-sm font-black text-black shadow-2xl transition hover:scale-[1.02] hover:bg-cyan-200 md:bottom-6 md:right-6"
    >
      🧠 AI duplicate review
    </button>
  )}

{isAISemanticDuplicatesOpen && (
  <AISemanticDuplicatePanel
    entries={entries}
    onClose={() =>
      setIsAISemanticDuplicatesOpen(false)
    }
    onOpenEntry={(entry) => {
      setIsAISemanticDuplicatesOpen(false);
      setSelectedEntry(entry);
    }}
  />
)}

{isAIBatchTriageOpen && (
  <AIBatchTriagePanel
    entries={entries}
    onClose={() =>
      setIsAIBatchTriageOpen(false)
    }
    onOpenEntry={(entry) => {
      setIsAIBatchTriageOpen(false);
      setSelectedEntry(entry);
    }}
  />
)}
    </main>
  );
}
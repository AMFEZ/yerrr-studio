"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Entry } from "@/types/entry";
import type {
  Concept,
  ConceptAssignment,
  ConceptCategory,
  ConceptColor,
} from "@/types/concept";
import type {
  EntryRelationship,
  EntryRelationshipType,
} from "@/types/relationship";
import { entryRelationshipTypeOptions } from "@/types/relationship";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

type GraphMigrationDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  entries?: Entry[];
  onMigrated?: () => void;
};

type CloudCounts = {
  concepts: number;
  assignments: number;
  relationships: number;
};

type MigrationResult = {
  conceptsInserted: number;
  conceptsUpdated: number;
  assignmentsInserted: number;
  assignmentsSkipped: number;
  relationshipsInserted: number;
  relationshipsSkipped: number;
  invalidConceptsSkipped: number;
  invalidAssignmentsSkipped: number;
  invalidRelationshipsSkipped: number;
  completedAt: string;
};

type RemoteConceptRow = {
  id: string;
  slug: string;
};

type RemoteAssignmentRow = {
  entry_id: string | number;
  concept_id: string;
};

type RemoteRelationshipRow = {
  id: string;
  source_entry_id: string | number;
  target_entry_id: string | number;
  relationship_type: EntryRelationshipType;
  is_bidirectional: boolean;
};

const CONCEPT_STORAGE_KEY = "yerrr-studio-concepts-alpha-3";
const ASSIGNMENT_STORAGE_KEY =
  "yerrr-studio-concept-assignments-alpha-3";
const RELATIONSHIP_STORAGE_KEY =
  "yerrr-studio-entry-relationships-alpha-3";
const MIGRATION_REPORT_STORAGE_KEY =
  "yerrr-studio-graph-migration-alpha-3-7";

const VALID_CATEGORIES = new Set<ConceptCategory>([
  "Meaning",
  "Culture",
  "Place",
  "Action",
  "Emotion",
  "Identity",
  "Food",
  "Sound",
  "Social",
  "Other",
]);

const VALID_COLORS = new Set<ConceptColor>([
  "yellow",
  "blue",
  "purple",
  "green",
  "red",
  "pink",
  "orange",
  "zinc",
]);

const VALID_RELATIONSHIP_TYPES = new Set<EntryRelationshipType>(
  entryRelationshipTypeOptions
);

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "An unknown error occurred.";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getDateSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string
) {
  const blob = new Blob([content], {
    type: mimeType,
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function relationshipKey(
  sourceEntryId: string,
  targetEntryId: string,
  type: EntryRelationshipType,
  isBidirectional: boolean
) {
  if (isBidirectional) {
    const [firstId, secondId] = [
      sourceEntryId,
      targetEntryId,
    ].sort();

    return `${firstId}|${secondId}|${type}|bidirectional`;
  }

  return `${sourceEntryId}|${targetEntryId}|${type}|directional`;
}

async function insertRowsInChunks(
  supabase: SupabaseClient,
  tableName: string,
  rows: Record<string, unknown>[],
  chunkSize = 250
) {
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);

    const { error } = await supabase
      .from(tableName)
      .insert(chunk);

    if (error) {
      throw error;
    }
  }
}

export function GraphMigrationDrawer({
  isOpen,
  onClose,
  entries = [],
  onMigrated,
}: GraphMigrationDrawerProps) {
  const [localConcepts, setLocalConcepts] = useState<Concept[]>([]);
  const [localAssignments, setLocalAssignments] = useState<
    ConceptAssignment[]
  >([]);
  const [localRelationships, setLocalRelationships] = useState<
    EntryRelationship[]
  >([]);

  const [cloudCounts, setCloudCounts] = useState<CloudCounts>({
    concepts: 0,
    assignments: 0,
    relationships: 0,
  });

  const [isScanning, setIsScanning] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [migrationResult, setMigrationResult] =
    useState<MigrationResult | null>(null);

  function loadLocalGraph() {
    try {
      const storedConcepts = window.localStorage.getItem(
        CONCEPT_STORAGE_KEY
      );

      const storedAssignments = window.localStorage.getItem(
        ASSIGNMENT_STORAGE_KEY
      );

      const storedRelationships = window.localStorage.getItem(
        RELATIONSHIP_STORAGE_KEY
      );

      const parsedConcepts = storedConcepts
        ? (JSON.parse(storedConcepts) as unknown)
        : [];

      const parsedAssignments = storedAssignments
        ? (JSON.parse(storedAssignments) as unknown)
        : [];

      const parsedRelationships = storedRelationships
        ? (JSON.parse(storedRelationships) as unknown)
        : [];

      setLocalConcepts(
        Array.isArray(parsedConcepts)
          ? (parsedConcepts as Concept[])
          : []
      );

      setLocalAssignments(
        Array.isArray(parsedAssignments)
          ? (parsedAssignments as ConceptAssignment[])
          : []
      );

      setLocalRelationships(
        Array.isArray(parsedRelationships)
          ? (parsedRelationships as EntryRelationship[])
          : []
      );
    } catch {
      setLocalConcepts([]);
      setLocalAssignments([]);
      setLocalRelationships([]);
      setErrorMessage("The local Knowledge Graph could not be read.");
    }
  }

  async function requireAuthenticatedClient() {
    const supabase = getSupabaseBrowserClient();

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      throw error;
    }

    if (!user) {
      throw new Error(
        "You must be logged into YERRR Studio before migrating graph data."
      );
    }

    return supabase;
  }

  async function scanCloud() {
    try {
      setIsScanning(true);
      setErrorMessage("");
      setStatusMessage("Checking Supabase graph tables...");

      const supabase = await requireAuthenticatedClient();

      const [
        conceptResponse,
        assignmentResponse,
        relationshipResponse,
      ] = await Promise.all([
        supabase
          .from("concepts")
          .select("id", {
            count: "exact",
            head: true,
          }),

        supabase
          .from("entry_concepts")
          .select("id", {
            count: "exact",
            head: true,
          }),

        supabase
          .from("entry_relationships")
          .select("id", {
            count: "exact",
            head: true,
          }),
      ]);

      if (conceptResponse.error) {
        throw conceptResponse.error;
      }

      if (assignmentResponse.error) {
        throw assignmentResponse.error;
      }

      if (relationshipResponse.error) {
        throw relationshipResponse.error;
      }

      setCloudCounts({
        concepts: conceptResponse.count ?? 0,
        assignments: assignmentResponse.count ?? 0,
        relationships: relationshipResponse.count ?? 0,
      });

      setStatusMessage("Supabase scan complete.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      setStatusMessage("");
    } finally {
      setIsScanning(false);
    }
  }

  useEffect(() => {
    if (!isOpen) return;

    loadLocalGraph();
    void scanCloud();
    setMigrationResult(null);
  }, [isOpen]);

  const localAnalysis = useMemo(() => {
    const entryIds = new Set(
      entries.map((entry) => String(entry.id))
    );

    const validConcepts = localConcepts.filter((concept) => {
      return Boolean(concept.name?.trim());
    });

    const validConceptIds = new Set(
      validConcepts.map((concept) => String(concept.id))
    );

    const invalidConcepts = localConcepts.filter((concept) => {
      return !concept.name?.trim();
    });

    let validAssignmentLinks = 0;
    let invalidAssignmentLinks = 0;

    localAssignments.forEach((assignment) => {
      const entryExists = entryIds.has(String(assignment.entryId));

      const conceptIds = Array.from(
        new Set(assignment.conceptIds.map(String))
      );

      conceptIds.forEach((conceptId) => {
        if (entryExists && validConceptIds.has(conceptId)) {
          validAssignmentLinks += 1;
        } else {
          invalidAssignmentLinks += 1;
        }
      });
    });

    const validRelationships = localRelationships.filter(
      (relationship) => {
        const sourceId = String(relationship.sourceEntryId);
        const targetId = String(relationship.targetEntryId);

        return (
          entryIds.has(sourceId) &&
          entryIds.has(targetId) &&
          sourceId !== targetId &&
          VALID_RELATIONSHIP_TYPES.has(relationship.type)
        );
      }
    );

    return {
      validConcepts,
      invalidConcepts,
      validAssignmentLinks,
      invalidAssignmentLinks,
      validRelationships,
      invalidRelationships:
        localRelationships.length - validRelationships.length,
    };
  }, [
    entries,
    localConcepts,
    localAssignments,
    localRelationships,
  ]);

  function downloadSafetyBackup() {
    const backup = {
      app: "YERRR Studio",
      version: "Alpha 3.7B",
      exportType: "pre_supabase_graph_migration",
      exportedAt: new Date().toISOString(),
      counts: {
        concepts: localConcepts.length,
        assignments: localAssignments.length,
        assignmentLinks: localAssignments.reduce(
          (total, assignment) =>
            total + assignment.conceptIds.length,
          0
        ),
        relationships: localRelationships.length,
      },
      concepts: localConcepts,
      assignments: localAssignments,
      relationships: localRelationships,
    };

    downloadTextFile(
      `yerrr-before-supabase-graph-migration-${getDateSlug()}.json`,
      JSON.stringify(backup, null, 2),
      "application/json"
    );

    setStatusMessage("Safety backup downloaded.");
  }

  async function migrateGraph() {
    if (
      localAnalysis.validConcepts.length === 0 &&
      localAnalysis.validAssignmentLinks === 0 &&
      localAnalysis.validRelationships.length === 0
    ) {
      setErrorMessage("There is no valid local graph data to migrate.");
      return;
    }

    const confirmed = window.confirm(
      "Copy the local Knowledge Graph into Supabase?\n\n" +
        "A safety backup will download first. Local browser data will not be deleted."
    );

    if (!confirmed) return;

    try {
      setIsMigrating(true);
      setErrorMessage("");
      setMigrationResult(null);

      downloadSafetyBackup();

      const supabase = await requireAuthenticatedClient();

      setStatusMessage("Loading existing Supabase concepts...");

      const {
        data: remoteConceptData,
        error: remoteConceptError,
      } = await supabase
        .from("concepts")
        .select("id, slug");

      if (remoteConceptError) {
        throw remoteConceptError;
      }

      const remoteConcepts =
        (remoteConceptData ?? []) as RemoteConceptRow[];

      const remoteConceptById = new Map(
        remoteConcepts.map((concept) => [
          String(concept.id),
          concept,
        ])
      );

      const remoteConceptBySlug = new Map(
        remoteConcepts.map((concept) => [
          concept.slug.toLowerCase(),
          concept,
        ])
      );

      const localToRemoteConceptId = new Map<string, string>();

      let conceptsInserted = 0;
      let conceptsUpdated = 0;
      let invalidConceptsSkipped = 0;

      for (const concept of localConcepts) {
        const localConceptId = String(concept.id);
        const name = concept.name?.trim();

        if (!name) {
          invalidConceptsSkipped += 1;
          continue;
        }

        const slug =
          slugify(concept.slug || name) ||
          `concept-${localConceptId.slice(0, 8)}`;

        const category = VALID_CATEGORIES.has(concept.category)
          ? concept.category
          : "Meaning";

        const color = VALID_COLORS.has(concept.color)
          ? concept.color
          : "yellow";

        const conceptPayload = {
          name,
          slug,
          description: concept.description?.trim() ?? "",
          category,
          color,
        };

        const existingConcept =
          remoteConceptById.get(localConceptId) ??
          remoteConceptBySlug.get(slug.toLowerCase());

        if (existingConcept) {
          const { error } = await supabase
            .from("concepts")
            .update(conceptPayload)
            .eq("id", existingConcept.id);

          if (error) {
            throw error;
          }

          localToRemoteConceptId.set(
            localConceptId,
            existingConcept.id
          );

          remoteConceptBySlug.set(slug.toLowerCase(), {
            id: existingConcept.id,
            slug,
          });

          conceptsUpdated += 1;
          continue;
        }

        const insertPayload = isUuid(localConceptId)
          ? {
              id: localConceptId,
              ...conceptPayload,
              created_at: concept.createdAt,
              updated_at: concept.updatedAt,
            }
          : {
              ...conceptPayload,
              created_at: concept.createdAt,
              updated_at: concept.updatedAt,
            };

        const {
          data: insertedConcept,
          error: insertError,
        } = await supabase
          .from("concepts")
          .insert(insertPayload)
          .select("id, slug")
          .single();

        if (insertError) {
          const {
            data: matchingConcept,
            error: matchingError,
          } = await supabase
            .from("concepts")
            .select("id, slug")
            .eq("slug", slug)
            .maybeSingle();

          if (matchingError || !matchingConcept) {
            throw insertError;
          }

          localToRemoteConceptId.set(
            localConceptId,
            matchingConcept.id
          );

          remoteConceptBySlug.set(
            matchingConcept.slug.toLowerCase(),
            matchingConcept
          );

          conceptsUpdated += 1;
          continue;
        }

        localToRemoteConceptId.set(
          localConceptId,
          insertedConcept.id
        );

        remoteConceptById.set(insertedConcept.id, insertedConcept);
        remoteConceptBySlug.set(
          insertedConcept.slug.toLowerCase(),
          insertedConcept
        );

        conceptsInserted += 1;
      }

      setStatusMessage("Migrating entry-to-concept links...");

      const {
        data: existingAssignmentData,
        error: existingAssignmentError,
      } = await supabase
        .from("entry_concepts")
        .select("entry_id, concept_id");

      if (existingAssignmentError) {
        throw existingAssignmentError;
      }

      const existingAssignments =
        (existingAssignmentData ?? []) as RemoteAssignmentRow[];

      const existingAssignmentKeys = new Set(
        existingAssignments.map(
          (assignment) =>
            `${String(assignment.entry_id)}|${assignment.concept_id}`
        )
      );

      const entryIds = new Set(
        entries.map((entry) => String(entry.id))
      );

      const assignmentRows: Record<string, unknown>[] = [];
      const pendingAssignmentKeys = new Set<string>();

      let assignmentsSkipped = 0;
      let invalidAssignmentsSkipped = 0;

      localAssignments.forEach((assignment) => {
        const entryId = String(assignment.entryId);

        const localConceptIds = Array.from(
          new Set(assignment.conceptIds.map(String))
        );

        localConceptIds.forEach((localConceptId) => {
          const remoteConceptId =
            localToRemoteConceptId.get(localConceptId);

          if (!entryIds.has(entryId) || !remoteConceptId) {
            invalidAssignmentsSkipped += 1;
            return;
          }

          const key = `${entryId}|${remoteConceptId}`;

          if (
            existingAssignmentKeys.has(key) ||
            pendingAssignmentKeys.has(key)
          ) {
            assignmentsSkipped += 1;
            return;
          }

          pendingAssignmentKeys.add(key);

          assignmentRows.push({
            entry_id: entryId,
            concept_id: remoteConceptId,
            created_at: assignment.updatedAt,
            updated_at: assignment.updatedAt,
          });
        });
      });

      await insertRowsInChunks(
        supabase,
        "entry_concepts",
        assignmentRows
      );

      setStatusMessage("Migrating entry relationships...");

      const {
        data: existingRelationshipData,
        error: existingRelationshipError,
      } = await supabase
        .from("entry_relationships")
        .select(
          "id, source_entry_id, target_entry_id, relationship_type, is_bidirectional"
        );

      if (existingRelationshipError) {
        throw existingRelationshipError;
      }

      const existingRelationships =
        (existingRelationshipData ?? []) as RemoteRelationshipRow[];

      const existingRelationshipKeys = new Set(
        existingRelationships.map((relationship) =>
          relationshipKey(
            String(relationship.source_entry_id),
            String(relationship.target_entry_id),
            relationship.relationship_type,
            relationship.is_bidirectional
          )
        )
      );

      const relationshipRows: Record<string, unknown>[] = [];
      const pendingRelationshipKeys = new Set<string>();

      let relationshipsSkipped = 0;
      let invalidRelationshipsSkipped = 0;

      localRelationships.forEach((relationship) => {
        const sourceEntryId = String(
          relationship.sourceEntryId
        );

        const targetEntryId = String(
          relationship.targetEntryId
        );

        if (
          !entryIds.has(sourceEntryId) ||
          !entryIds.has(targetEntryId) ||
          sourceEntryId === targetEntryId ||
          !VALID_RELATIONSHIP_TYPES.has(relationship.type)
        ) {
          invalidRelationshipsSkipped += 1;
          return;
        }

        const key = relationshipKey(
          sourceEntryId,
          targetEntryId,
          relationship.type,
          relationship.isBidirectional
        );

        if (
          existingRelationshipKeys.has(key) ||
          pendingRelationshipKeys.has(key)
        ) {
          relationshipsSkipped += 1;
          return;
        }

        pendingRelationshipKeys.add(key);

        relationshipRows.push({
          source_entry_id: sourceEntryId,
          target_entry_id: targetEntryId,
          relationship_type: relationship.type,
          note: relationship.note?.trim() ?? "",
          is_bidirectional: relationship.isBidirectional,
          created_at: relationship.createdAt,
          updated_at: relationship.updatedAt,
        });
      });

      await insertRowsInChunks(
        supabase,
        "entry_relationships",
        relationshipRows
      );

      const result: MigrationResult = {
        conceptsInserted,
        conceptsUpdated,
        assignmentsInserted: assignmentRows.length,
        assignmentsSkipped,
        relationshipsInserted: relationshipRows.length,
        relationshipsSkipped,
        invalidConceptsSkipped,
        invalidAssignmentsSkipped,
        invalidRelationshipsSkipped,
        completedAt: new Date().toISOString(),
      };

      window.localStorage.setItem(
        MIGRATION_REPORT_STORAGE_KEY,
        JSON.stringify(result)
      );

      setMigrationResult(result);
      setStatusMessage(
        "Migration complete. Local graph data was preserved."
      );

      await scanCloud();
      onMigrated?.();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      setStatusMessage("");
    } finally {
      setIsMigrating(false);
    }
  }

  if (!isOpen) return null;

  const hasLocalData =
    localConcepts.length > 0 ||
    localAssignments.length > 0 ||
    localRelationships.length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
      <button
        aria-label="Close graph migration"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside className="absolute bottom-0 right-0 max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border-t border-neutral-800 bg-neutral-950 p-5 shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-h-none md:max-w-5xl md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0 md:p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.25em] text-yellow-400">
              Knowledge Graph
            </p>

            <h2 className="mt-2 text-2xl font-black text-white">
              Supabase Migration
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500">
              Safely copy browser-based concepts, assignments, and
              relationships into the permanent Supabase graph tables.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-black text-neutral-300 hover:border-neutral-700 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mb-5 grid gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500">
              Local Browser Graph
            </p>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-neutral-950 p-3">
                <p className="text-xs text-neutral-500">Concepts</p>
                <p className="mt-2 text-2xl font-black text-white">
                  {localConcepts.length}
                </p>
              </div>

              <div className="rounded-xl bg-neutral-950 p-3">
                <p className="text-xs text-neutral-500">Links</p>
                <p className="mt-2 text-2xl font-black text-white">
                  {localAnalysis.validAssignmentLinks}
                </p>
              </div>

              <div className="rounded-xl bg-neutral-950 p-3">
                <p className="text-xs text-neutral-500">
                  Relationships
                </p>
                <p className="mt-2 text-2xl font-black text-white">
                  {localRelationships.length}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500">
              Supabase Graph
            </p>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-neutral-950 p-3">
                <p className="text-xs text-neutral-500">Concepts</p>
                <p className="mt-2 text-2xl font-black text-white">
                  {cloudCounts.concepts}
                </p>
              </div>

              <div className="rounded-xl bg-neutral-950 p-3">
                <p className="text-xs text-neutral-500">Links</p>
                <p className="mt-2 text-2xl font-black text-white">
                  {cloudCounts.assignments}
                </p>
              </div>

              <div className="rounded-xl bg-neutral-950 p-3">
                <p className="text-xs text-neutral-500">
                  Relationships
                </p>
                <p className="mt-2 text-2xl font-black text-white">
                  {cloudCounts.relationships}
                </p>
              </div>
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <h3 className="font-black text-white">Migration Preview</h3>

          <p className="mt-1 text-sm text-neutral-500">
            Invalid or orphaned local records will be skipped.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-green-400/20 bg-green-400/10 p-4">
              <p className="text-xs font-bold uppercase text-green-100/60">
                Valid Concepts
              </p>
              <p className="mt-2 text-2xl font-black text-green-100">
                {localAnalysis.validConcepts.length}
              </p>
            </div>

            <div className="rounded-xl border border-green-400/20 bg-green-400/10 p-4">
              <p className="text-xs font-bold uppercase text-green-100/60">
                Valid Links
              </p>
              <p className="mt-2 text-2xl font-black text-green-100">
                {localAnalysis.validAssignmentLinks}
              </p>
            </div>

            <div className="rounded-xl border border-green-400/20 bg-green-400/10 p-4">
              <p className="text-xs font-bold uppercase text-green-100/60">
                Valid Relationships
              </p>
              <p className="mt-2 text-2xl font-black text-green-100">
                {localAnalysis.validRelationships.length}
              </p>
            </div>

            <div className="rounded-xl border border-orange-400/20 bg-orange-400/10 p-4">
              <p className="text-xs font-bold uppercase text-orange-100/60">
                Invalid Concepts
              </p>
              <p className="mt-2 text-2xl font-black text-orange-100">
                {localAnalysis.invalidConcepts.length}
              </p>
            </div>

            <div className="rounded-xl border border-orange-400/20 bg-orange-400/10 p-4">
              <p className="text-xs font-bold uppercase text-orange-100/60">
                Invalid Links
              </p>
              <p className="mt-2 text-2xl font-black text-orange-100">
                {localAnalysis.invalidAssignmentLinks}
              </p>
            </div>

            <div className="rounded-xl border border-orange-400/20 bg-orange-400/10 p-4">
              <p className="text-xs font-bold uppercase text-orange-100/60">
                Invalid Relationships
              </p>
              <p className="mt-2 text-2xl font-black text-orange-100">
                {localAnalysis.invalidRelationships}
              </p>
            </div>
          </div>
        </section>

        {errorMessage && (
          <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm font-bold text-red-100">
            {errorMessage}
          </div>
        )}

        {statusMessage && (
          <div className="mt-5 rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-sm font-bold text-yellow-100">
            {statusMessage}
          </div>
        )}

        {migrationResult && (
          <section className="mt-5 rounded-2xl border border-green-400/20 bg-green-400/10 p-4">
            <h3 className="font-black text-green-100">
              Migration Complete
            </h3>

            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
              <p className="text-sm text-green-100/80">
                Concepts inserted:{" "}
                <strong>{migrationResult.conceptsInserted}</strong>
              </p>

              <p className="text-sm text-green-100/80">
                Concepts matched:{" "}
                <strong>{migrationResult.conceptsUpdated}</strong>
              </p>

              <p className="text-sm text-green-100/80">
                Links inserted:{" "}
                <strong>{migrationResult.assignmentsInserted}</strong>
              </p>

              <p className="text-sm text-green-100/80">
                Links skipped:{" "}
                <strong>{migrationResult.assignmentsSkipped}</strong>
              </p>

              <p className="text-sm text-green-100/80">
                Relationships inserted:{" "}
                <strong>
                  {migrationResult.relationshipsInserted}
                </strong>
              </p>

              <p className="text-sm text-green-100/80">
                Relationships skipped:{" "}
                <strong>
                  {migrationResult.relationshipsSkipped}
                </strong>
              </p>
            </div>
          </section>
        )}

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <button
            onClick={() => void scanCloud()}
            disabled={isScanning || isMigrating}
            className="rounded-xl bg-neutral-800 px-4 py-3 text-sm font-black text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isScanning ? "Scanning..." : "Refresh Scan"}
          </button>

          <button
            onClick={downloadSafetyBackup}
            disabled={!hasLocalData || isMigrating}
            className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-black text-white hover:border-yellow-400 hover:text-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Download Backup
          </button>

          <button
            onClick={() => void migrateGraph()}
            disabled={!hasLocalData || isMigrating || isScanning}
            className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isMigrating ? "Migrating..." : "Migrate to Supabase"}
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
          <p className="font-black text-yellow-100">
            Alpha 3.7B safety note
          </p>

          <p className="mt-2 text-sm leading-6 text-yellow-100/70">
            This tool only copies data into Supabase. It does not erase
            local concepts, assignments, or relationships. Alpha 3.7C
            will switch the graph editors to read and write Supabase
            directly.
          </p>
        </div>
      </aside>
    </div>
  );
}

export default GraphMigrationDrawer;
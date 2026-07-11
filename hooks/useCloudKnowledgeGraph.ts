"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

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

import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

type ConceptRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  color: string;
  created_at: string;
  updated_at: string;
};

type EntryConceptRow = {
  entry_id: string | number;
  concept_id: string;
  created_at: string;
  updated_at: string;
};

type EntryRelationshipRow = {
  id: string;
  source_entry_id: string | number;
  target_entry_id: string | number;
  relationship_type: string;
  note: string | null;
  is_bidirectional: boolean;
  created_at: string;
  updated_at: string;
};

type CloudGraphStats = {
  concepts: number;
  assignedEntries: number;
  conceptLinks: number;
  relationships: number;
  connectedEntries: number;
};

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

  return "An unknown Knowledge Graph error occurred.";
}

export function useCloudKnowledgeGraph(enabled = true) {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [assignments, setAssignments] = useState<
    ConceptAssignment[]
  >([]);
  const [relationships, setRelationships] = useState<
    EntryRelationship[]
  >([]);

  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!enabled) return;

    try {
      setIsLoading(true);
      setError("");

      const supabase = getSupabaseBrowserClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        throw new Error(
          "Auth session missing. Log out and log back into YERRR Studio."
        );
      }

      const [
        conceptResponse,
        assignmentResponse,
        relationshipResponse,
      ] = await Promise.all([
        supabase
          .from("concepts")
          .select(
            "id, name, slug, description, category, color, created_at, updated_at"
          )
          .order("name", {
            ascending: true,
          }),

        supabase
          .from("entry_concepts")
          .select(
            "entry_id, concept_id, created_at, updated_at"
          ),

        supabase
          .from("entry_relationships")
          .select(
            "id, source_entry_id, target_entry_id, relationship_type, note, is_bidirectional, created_at, updated_at"
          )
          .order("updated_at", {
            ascending: false,
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

      const conceptRows =
        (conceptResponse.data ?? []) as ConceptRow[];

      const assignmentRows =
        (assignmentResponse.data ?? []) as EntryConceptRow[];

      const relationshipRows =
        (relationshipResponse.data ??
          []) as EntryRelationshipRow[];

      const mappedConcepts: Concept[] = conceptRows.map(
        (row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          description: row.description ?? "",
          category: row.category as ConceptCategory,
          color: row.color as ConceptColor,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })
      );

      const assignmentMap = new Map<
        string,
        {
          conceptIds: Set<string>;
          updatedAt: string;
        }
      >();

      assignmentRows.forEach((row) => {
        const entryId = String(row.entry_id);

        const existingAssignment = assignmentMap.get(entryId);

        if (existingAssignment) {
          existingAssignment.conceptIds.add(row.concept_id);

          if (row.updated_at > existingAssignment.updatedAt) {
            existingAssignment.updatedAt = row.updated_at;
          }

          return;
        }

        assignmentMap.set(entryId, {
          conceptIds: new Set([row.concept_id]),
          updatedAt: row.updated_at,
        });
      });

      const mappedAssignments: ConceptAssignment[] =
        Array.from(assignmentMap.entries()).map(
          ([entryId, assignment]) => ({
            entryId,
            conceptIds: Array.from(assignment.conceptIds),
            updatedAt: assignment.updatedAt,
          })
        );

      const mappedRelationships: EntryRelationship[] =
        relationshipRows.map((row) => ({
          id: row.id,
          sourceEntryId: String(row.source_entry_id),
          targetEntryId: String(row.target_entry_id),
          type: row.relationship_type as EntryRelationshipType,
          note: row.note ?? "",
          isBidirectional: row.is_bidirectional,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));

      setConcepts(mappedConcepts);
      setAssignments(mappedAssignments);
      setRelationships(mappedRelationships);
      setHasLoaded(true);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
      setHasLoaded(true);
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    void refresh();
  }, [enabled, refresh]);

  const stats = useMemo<CloudGraphStats>(() => {
    const connectedEntryIds = new Set<string>();

    relationships.forEach((relationship) => {
      connectedEntryIds.add(
        String(relationship.sourceEntryId)
      );

      connectedEntryIds.add(
        String(relationship.targetEntryId)
      );
    });

    const conceptLinks = assignments.reduce(
      (total, assignment) =>
        total + assignment.conceptIds.length,
      0
    );

    return {
      concepts: concepts.length,
      assignedEntries: assignments.filter(
        (assignment) => assignment.conceptIds.length > 0
      ).length,
      conceptLinks,
      relationships: relationships.length,
      connectedEntries: connectedEntryIds.size,
    };
  }, [concepts, assignments, relationships]);

  return {
    concepts,
    assignments,
    relationships,
    stats,
    isLoading,
    hasLoaded,
    error,
    refresh,
  };
}

export default useCloudKnowledgeGraph;
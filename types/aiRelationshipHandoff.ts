import type {
  AIRelationshipSuggestion,
} from "@/types/aiRelationships";

export type AIRelationshipHandoff = {
  id: string;
  createdAt: string;

  sourceEntryId: string;
  sourceEntryWord: string;

  approvedRelationships:
    AIRelationshipSuggestion[];

  verificationChecklist: string[];
};
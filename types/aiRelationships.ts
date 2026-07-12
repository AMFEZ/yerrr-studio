export type AIRelationshipType =
  | "synonym"
  | "antonym"
  | "same_concept"
  | "related_to"
  | "contextual_pair"
  | "derived_form"
  | "phrase_component"
  | "contrast";

export type AIRelationshipDirection =
  | "bidirectional"
  | "source_to_target"
  | "target_to_source";

export type AIRelationshipConfidence =
  | "low"
  | "medium"
  | "high";

export type AIRelationshipDecision =
  | "pending"
  | "approved"
  | "rejected";

export type AIRelationshipSuggestion = {
  id: string;
  targetEntryId: string;
  targetWord: string;
  relationshipType: AIRelationshipType;
  direction: AIRelationshipDirection;
  confidence: AIRelationshipConfidence;
  relationshipScore: number;
  reasoning: string;
  sharedSignals: string[];
  differences: string[];
  requiresVerification: boolean;
  verificationNote: string;
};

export type AIRelationshipSuggestionResult = {
  sourceEntryId: string;
  sourceEntryWord: string;
  analyzedCandidateCount: number;
  summary: string;
  suggestions: AIRelationshipSuggestion[];
  verificationChecklist: string[];
};

export type AIRelationshipSuggestionResponse = {
  result?: AIRelationshipSuggestionResult;
  model?: string;
  error?: string;
};
export type AITriagePriority =
  | "urgent"
  | "high"
  | "medium"
  | "low";

export type AITriageNextAction =
  | "full_entry_review"
  | "fill_missing_fields"
  | "verify_sources"
  | "check_duplicates"
  | "manual_editor_review"
  | "ready_for_final_review";

export type AITriageItem = {
  entryId: string;
  entryWord: string;
  priority: AITriagePriority;
  readinessScore: number;
  primaryReason: string;
  issues: string[];
  reviewFocus: string[];
  recommendedNextAction: AITriageNextAction;
  requiresHumanVerification: boolean;
};

export type AIBatchTriageResult = {
  analyzedEntryCount: number;
  summary: string;
  items: AITriageItem[];
  queueNotes: string[];
};

export type AIBatchTriageResponse = {
  result?: AIBatchTriageResult;
  model?: string;
  error?: string;
};
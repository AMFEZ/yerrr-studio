export type AIMissingFieldConfidence =
  | "low"
  | "medium"
  | "high";

export type AIMissingFieldDecision =
  | "pending"
  | "approved"
  | "rejected";

export type AIMissingFieldSuggestion = {
  id: string;
  fieldPath: string;
  fieldLabel: string;
  meaningIndex: number;
  currentValue: string;
  suggestedValue: string;
  reason: string;
  confidence: AIMissingFieldConfidence;
  requiresVerification: boolean;
  verificationNote: string;
};

export type AIMissingFieldsResult = {
  entryId: string;
  entryWord: string;
  summary: string;
  missingFieldCount: number;
  suggestions: AIMissingFieldSuggestion[];
  verificationChecklist: string[];
};

export type AIMissingFieldsResponse = {
  result?: AIMissingFieldsResult;
  model?: string;
  error?: string;
};
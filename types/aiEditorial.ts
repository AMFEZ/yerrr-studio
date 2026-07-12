export type AIApprovedEdit = {
  field: string;
  currentValue: string;
  suggestedValue: string;
  reason: string;
  confidence: "low" | "medium" | "high";
};

export type AIEditorialHandoff = {
  id: string;
  createdAt: string;
  sourceReviewId?: string;
  entryId: string;
  entryWord: string;
  qualityScore: number;
  publishReadiness:
    | "not_ready"
    | "needs_editor_review"
    | "ready_after_verification";
  approvedEdits: AIApprovedEdit[];
  verificationChecklist: string[];
};
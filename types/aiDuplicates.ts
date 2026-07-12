export type AIDuplicateClassification =
  | "likely_duplicate"
  | "possible_duplicate"
  | "related_but_distinct";

export type AIDuplicateConfidence =
  | "low"
  | "medium"
  | "high";

export type AIDuplicateRecommendedAction =
  | "merge_review"
  | "keep_separate"
  | "editor_review";

export type AIDuplicateMatch = {
  candidateEntryId: string;
  candidateWord: string;
  classification: AIDuplicateClassification;
  confidence: AIDuplicateConfidence;
  similarityScore: number;
  sharedSignals: string[];
  differences: string[];
  reasoning: string;
  recommendedAction: AIDuplicateRecommendedAction;
  mergeWarning: string;
};

export type AIDuplicateReviewResult = {
  sourceEntryId: string;
  sourceEntryWord: string;
  analyzedCandidateCount: number;
  summary: string;
  matches: AIDuplicateMatch[];
  reviewChecklist: string[];
};

export type AIDuplicateReviewResponse = {
  result?: AIDuplicateReviewResult;
  model?: string;
  error?: string;
};
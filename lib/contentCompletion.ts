import type { Entry } from "@/types/entry";
import {
  getRequiredEditorialGapCount,
  getRequiredEditorialGaps,
  isEditorialContentComplete,
} from "@/lib/editorialCompletionRules";

export type CompletionGap = ReturnType<typeof getRequiredEditorialGaps>[number];

export function getRequiredCompletionGaps(entry: Entry) {
  return getRequiredEditorialGaps(entry);
}

export function getRequiredCompletionGapCount(entry: Entry) {
  return getRequiredEditorialGapCount(entry);
}

export function isEntryContentComplete(entry: Entry) {
  return isEditorialContentComplete(entry);
}

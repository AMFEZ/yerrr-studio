export type EntryRelationshipType =
  | "Related To"
  | "Synonym Of"
  | "Opposite Of"
  | "Stronger Than"
  | "Softer Than"
  | "Phrase Version Of"
  | "Regional Variant Of"
  | "Derived From"
  | "Used With";

export type EntryRelationship = {
  id: string;
  sourceEntryId: string;
  targetEntryId: string;
  type: EntryRelationshipType;
  note: string;
  isBidirectional: boolean;
  createdAt: string;
  updatedAt: string;
};

export const entryRelationshipTypeOptions: EntryRelationshipType[] = [
  "Related To",
  "Synonym Of",
  "Opposite Of",
  "Stronger Than",
  "Softer Than",
  "Phrase Version Of",
  "Regional Variant Of",
  "Derived From",
  "Used With",
];

export function getDefaultRelationshipDirection(
  type: EntryRelationshipType
) {
  return [
    "Related To",
    "Synonym Of",
    "Opposite Of",
    "Regional Variant Of",
    "Used With",
  ].includes(type);
}
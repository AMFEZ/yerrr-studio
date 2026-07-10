export type ConceptCategory =
  | "Meaning"
  | "Culture"
  | "Place"
  | "Action"
  | "Emotion"
  | "Identity"
  | "Food"
  | "Sound"
  | "Social"
  | "Other";

export type ConceptColor =
  | "yellow"
  | "blue"
  | "purple"
  | "green"
  | "red"
  | "pink"
  | "orange"
  | "zinc";

export type Concept = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: ConceptCategory;
  color: ConceptColor;
  createdAt: string;
  updatedAt: string;
};

export type ConceptAssignment = {
  entryId: string;
  conceptIds: string[];
  updatedAt: string;
};

export const conceptCategoryOptions: ConceptCategory[] = [
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
];

export const conceptColorOptions: ConceptColor[] = [
  "yellow",
  "blue",
  "purple",
  "green",
  "red",
  "pink",
  "orange",
  "zinc",
];
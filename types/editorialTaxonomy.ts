export type EditorialTaxonomyKind = "category" | "tone";

export type EditorialTaxonomyOption = {
  id: string;
  userId: string;
  kind: EditorialTaxonomyKind;
  label: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

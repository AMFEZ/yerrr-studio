export const publicVisibilityOptions = [
  "private",
  "public",
] as const;

export type PublicVisibility =
  (typeof publicVisibilityOptions)[number];

export type PublicEntrySettings = {
  entryId: string;
  visibility: PublicVisibility;
  isFeatured: boolean;
  displayOrder: number | null;
  publicTitle: string;
  publicSummary: string;
  publishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PublicEntrySettingsInput = {
  entryId: string;
  visibility: PublicVisibility;
  isFeatured: boolean;
  displayOrder: number | null;
  publicTitle: string;
  publicSummary: string;
};

export type PublicEntrySettingsMap = Record<
  string,
  PublicEntrySettings
>;
export type EntryStatus = "Draft" | "Published" | "Needs Review";

export type Meaning = {
  id: string;
  title: string;
  definition: string;
  example: string;
};

export type Entry = {
  id: string;
  word: string;
  type: string;
  status: EntryStatus;
  notes: string;
  meanings: Meaning[];
};

export const entryTypes = [
  "Word",
  "Phrase",
  "Expression",
  "Greeting",
  "Reaction",
  "Cultural Term",
] as const;
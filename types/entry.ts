export type EntryStatus =
  | "Draft"
  | "Needs Review"
  | "Verified"
  | "Published"
  | "Archived";

export type EditorialStatus =
  | "Draft"
  | "Needs Review"
  | "AI Suggested"
  | "Verified"
  | "Rejected";

export type Lifecycle = "Current" | "Old School" | "Fading" | "Rare" | "Retired";

export type Visibility = "Private" | "Public";

export type AiAddedStatus = "No" | "Yes" | "AI Suggested" | "Placeholder";

export type Meaning = {
  id: string;
  title: string;
  definition: string;
  example: string;
  plainEnglish: string;
  category: string;
  tone: string;
  conceptsText: string;
  usageFrequency: string;
  culturalContext: string;
  editorialStatus: EditorialStatus;
  aiAddedStatus: AiAddedStatus;
  verified: boolean;
  source: string;
};

export type Entry = {
  id: string;
  word: string;
  type: string;
  slug: string;
  pronunciation: string;
  partOfSpeech: string;
  alternateSpellings: string;
  status: EntryStatus;
  lifecycle: Lifecycle;
  visibility: Visibility;
  featured: boolean;
  aiAddedStatus: AiAddedStatus;
  audioFilename: string;
  illustrationFilename: string;
  illustrationNotes: string;
  notes: string;
  updatedAt: string;
  deletedAt: string;
  deletedPreviousStatus: EntryStatus | "";
  meanings: Meaning[];
};

export const entryTypes = [
  "Word",
  "Expression",
  "Phrase",
  "Greeting",
  "Reaction",
  "Cultural Term",
] as const;

export const partOfSpeechOptions = [
  "",
  "Noun",
  "Verb",
  "Adjective",
  "Adverb",
  "Interjection",
  "Phrase",
  "Expression",
] as const;

export const entryStatusOptions = [
  "Draft",
  "Needs Review",
  "Verified",
  "Published",
  "Archived",
] as const;

export const editorialStatusOptions = [
  "Draft",
  "Needs Review",
  "AI Suggested",
  "Verified",
  "Rejected",
] as const;

export const lifecycleOptions = [
  "Current",
  "Old School",
  "Fading",
  "Rare",
  "Retired",
] as const;

export const visibilityOptions = ["Private", "Public"] as const;

export const aiAddedStatusOptions = [
  "No",
  "Yes",
  "AI Suggested",
  "Placeholder",
] as const;

export const categoryOptions = [
  "",
  "Action/Behavior",
  "Agreement",
  "Appearance/Style",
  "Basketball/Sports",
  "Borough/Neighborhood",
  "Celebration",
  "Compliment",
  "Conflict",
  "Disagreement",
  "Emotion",
  "Everyday NYC",
  "Food/Bodega",
  "Greeting",
  "Humor/Jokes",
  "Insult",
  "Lifestyle",
  "Money",
  "Music/Entertainment",
  "People/Identity",
  "Police/Authority",
  "Reaction",
  "Relationships",
  "School",
  "Social Media/Internet",
  "Status/Reputation",
  "Subway/Transit",
  "Threat/Warning",
  "Time",
  "Weather",
  "Work/Hustle",
] as const;

export const toneOptions = [
  "",
  "Affectionate",
  "Aggressive",
  "Angry",
  "Casual",
  "Complimentary",
  "Confident",
  "Confrontational",
  "Direct",
  "Dismissive",
  "Disrespectful",
  "Dramatic",
  "Encouraging",
  "Friendly",
  "Funny",
  "Indirect",
  "Ironic",
  "Mocking",
  "Neutral",
  "Playful",
  "Respectful",
  "Sarcastic",
  "Serious",
  "Skeptical",
  "Surprised",
  "Teasing",
  "Threatening",
  "Warm",
] as const;

export const usageFrequencyOptions = [
  "",
  "Rare",
  "Uncommon",
  "Common",
  "Everyday",
  "Iconic",
] as const;
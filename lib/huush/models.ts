export type ReaderTheme = "system" | "light" | "dark" | "sepia";

export type ReaderFont = "serif" | "system";

export interface Article {
  id: string;
  url: string;
  normalizedUrl: string;
  title: string;
  source: string;
  byline?: string;
  excerpt?: string;
  content: string[];
  dateAdded: string;
  previewOnly: boolean;
  accessGated: boolean;
  collectionIds: string[];
}

export interface Collection {
  id: string;
  name: string;
  createdAt: string;
}

export interface ReaderSettings {
  theme: ReaderTheme;
  font: ReaderFont;
  fontSize: number;
}

export interface HuushSnapshot {
  articles: Article[];
  collections: Collection[];
  settings: ReaderSettings;
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: "system",
  font: "serif",
  fontSize: 19,
};

export function normalizeUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    url.hash = "";
    return url.toString();
  } catch {
    return value.trim();
  }
}

export function hostLabel(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
}

export function sourceName(value: string): string {
  const host = hostLabel(value).toLowerCase();
  const known: Record<string, string> = {
    "mybs.in": "Business Standard",
    "business-standard.com": "Business Standard",
    "livemint.com": "Live Mint",
    "thehindubusinessline.com": "BusinessLine",
    "economictimes.indiatimes.com": "Economic Times",
    "ideasforindia.in": "Ideas for India",
    "moneylife.in": "Moneylife",
  };
  return known[host] ?? hostLabel(value);
}

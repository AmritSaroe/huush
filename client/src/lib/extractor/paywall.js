export const PAYWALL_PHRASES = [
  "subscribe now",
  "subscription required",
  "please log in",
  "sign in to read",
  "premium content",
  "continue reading",
  "exclusive story",
  "limited access",
  "get full access",
  "sign up to read",
  "unlock this article",
  "subscribe to continue",
  "read this story with a subscription",
];

export function recordHasAccessGate(record) {
  if (!record || typeof record !== "object") return false;
  if (record.isAccessibleForFree === false || record.isPremium === true) return true;
  try {
    return /etprimeblocker|etprime-blocker|subscription required|isAccessibleForFree\s*[:=]\s*false/i.test(JSON.stringify(record));
  } catch {
    return false;
  }
}

export function htmlHasAccessGate(html = "") {
  // Only unambiguous page-level markers are trusted here. Generic words such as
  // “subscribe” often appear in harmless navigation chrome on free articles.
  return /etprimeblocker|etprime-blocker|subscription required|[\"']isAccessibleForFree[\"']\s*:\s*false/i.test(String(html || ""));
}

export function textHasAccessGate(text = "") {
  const lower = String(text || "").toLowerCase();
  return PAYWALL_PHRASES.some((phrase) => lower.includes(phrase));
}

export function hasAccessGate({ record = null, html = "", text = "" } = {}) {
  return recordHasAccessGate(record) || htmlHasAccessGate(html) || textHasAccessGate(text);
}

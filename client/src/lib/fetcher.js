import { extractArticle, fetchHtml } from "./extractor/index.js";

export { extractArticle, fetchHtml };

export function validateUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

const STORAGE_KEY = "whitemint:articles";

export function loadArticles() {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveArticles(articles) {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(articles) ? articles : []));
    return true;
  } catch {
    return false;
  }
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

import { DEFAULT_SETTINGS, normalizeUrl, type Article, type Collection, type HuushSnapshot, type ReaderSettings } from "./models";

const STORAGE_KEY = "huush.expo.snapshot.v1";

type ArticleDraft = Omit<Article, "id" | "normalizedUrl" | "dateAdded" | "collectionIds"> & {
  collectionIds?: string[];
};

type HuushContextValue = {
  hydrated: boolean;
  articles: Article[];
  collections: Collection[];
  settings: ReaderSettings;
  saveArticle: (draft: ArticleDraft) => Promise<Article>;
  openPreview: (draft: ArticleDraft) => Article;
  removeArticle: (id: string) => Promise<void>;
  assignArticleCollections: (id: string, collectionIds: string[]) => Promise<void>;
  updateSettings: (patch: Partial<ReaderSettings>) => Promise<void>;
  createCollection: (name: string) => Promise<void>;
  getArticle: (id: string) => Article | undefined;
};

const HuushContext = createContext<HuushContextValue | null>(null);

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptySnapshot(): HuushSnapshot {
  return { articles: [], collections: [], settings: DEFAULT_SETTINGS };
}

function parseSnapshot(raw: string | null): HuushSnapshot {
  if (!raw) return emptySnapshot();
  try {
    const parsed = JSON.parse(raw) as Partial<HuushSnapshot>;
    return {
      articles: Array.isArray(parsed.articles) ? parsed.articles : [],
      collections: Array.isArray(parsed.collections) ? parsed.collections : [],
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
    };
  } catch {
    return emptySnapshot();
  }
}

export function HuushProvider({ children }: PropsWithChildren) {
  const [snapshot, setSnapshot] = useState<HuushSnapshot>(emptySnapshot);
  const [previews, setPreviews] = useState<Article[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (active) setSnapshot(parseSnapshot(raw));
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const commit = useCallback((next: HuushSnapshot) => {
    setSnapshot(next);
    return AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const saveArticle = useCallback(async (draft: ArticleDraft) => {
    const normalizedUrl = normalizeUrl(draft.url);
    const nextArticle: Article = {
      ...draft,
      id: makeId(),
      normalizedUrl,
      dateAdded: new Date().toISOString(),
      collectionIds: draft.collectionIds ?? [],
    };
    let stored = nextArticle;
    setSnapshot((current) => {
      const existing = current.articles.find((article) => article.normalizedUrl === normalizedUrl);
      stored = existing
        ? { ...nextArticle, id: existing.id, dateAdded: existing.dateAdded, collectionIds: draft.collectionIds ?? existing.collectionIds }
        : nextArticle;
      const next = { ...current, articles: [stored, ...current.articles.filter((article) => article.id !== stored.id)] };
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    return stored;
  }, []);

  const openPreview = useCallback((draft: ArticleDraft) => {
    const preview: Article = {
      ...draft,
      id: `preview-${makeId()}`,
      normalizedUrl: normalizeUrl(draft.url),
      dateAdded: new Date().toISOString(),
      previewOnly: true,
      collectionIds: [],
    };
    setPreviews((current) => [preview, ...current.filter((article) => article.normalizedUrl !== preview.normalizedUrl)]);
    return preview;
  }, []);

  const removeArticle = useCallback(async (id: string) => {
    setPreviews((current) => current.filter((article) => article.id !== id));
    setSnapshot((current) => {
      const next = { ...current, articles: current.articles.filter((article) => article.id !== id) };
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const assignArticleCollections = useCallback(async (id: string, collectionIds: string[]) => {
    setSnapshot((current) => {
      const safeIds = [...new Set(collectionIds.filter((collectionId) => current.collections.some((collection) => collection.id === collectionId)))];
      const next = {
        ...current,
        articles: current.articles.map((article) => article.id === id ? { ...article, collectionIds: safeIds } : article),
      };
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const updateSettings = useCallback(async (patch: Partial<ReaderSettings>) => {
    setSnapshot((current) => {
      const next = { ...current, settings: { ...current.settings, ...patch } };
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const createCollection = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSnapshot((current) => {
      if (current.collections.some((collection) => collection.name.toLowerCase() === trimmed.toLowerCase())) return current;
      const next = {
        ...current,
        collections: [...current.collections, { id: makeId(), name: trimmed, createdAt: new Date().toISOString() }],
      };
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo<HuushContextValue>(() => ({
    hydrated,
    articles: snapshot.articles,
    collections: snapshot.collections,
    settings: snapshot.settings,
    saveArticle,
    openPreview,
    removeArticle,
    assignArticleCollections,
    updateSettings,
    createCollection,
    getArticle: (id) => snapshot.articles.find((article) => article.id === id) ?? previews.find((article) => article.id === id),
  }), [hydrated, snapshot, previews, saveArticle, openPreview, removeArticle, assignArticleCollections, updateSettings, createCollection]);

  return <HuushContext.Provider value={value}>{children}</HuushContext.Provider>;
}

export function useHuush(): HuushContextValue {
  const context = useContext(HuushContext);
  if (!context) throw new Error("useHuush must be used inside HuushProvider.");
  return context;
}

// lib/cache.ts — Lightweight in-memory stale-while-revalidate cache

import { useState, useRef, useCallback } from 'react';

// ─── Cache Store ────────────────────────────────────────────────────

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const store = new Map<string, CacheEntry>();

export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  return entry.data as T;
}

export function setCache<T>(key: string, data: T): void {
  store.set(key, { data, timestamp: Date.now() });
}

export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

// ─── Cache Key Builders ─────────────────────────────────────────────

export const CacheKeys = {
  todayTab: (uid: string, date: string) => `today:${uid}:${date}`,
  leaderboard: (uid: string) => `leaderboard:${uid}`,
  account: (uid: string) => `account:${uid}`,
  personalBests: (uid: string) => `account:bests:${uid}`,
  categoryHistory: (uid: string, cat: string) => `account:category:${uid}:${cat}`,
};

// ─── useCachedFetch Hook ────────────────────────────────────────────

interface CachedFetchResult<T> {
  data: T | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

export function useCachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
): CachedFetchResult<T> {
  const cached = getCached<T>(key);
  const [data, setData] = useState<T | null>(cached ?? null);
  const [loading, setLoading] = useState(cached === undefined);
  const versionRef = useRef(0);

  const refetch = useCallback(async () => {
    const version = ++versionRef.current;

    // Show cached data immediately (no skeleton)
    const existing = getCached<T>(key);
    if (existing !== undefined) {
      setData(existing);
      setLoading(false);
    }

    try {
      const fresh = await fetcher();
      // Discard stale responses from rapid tab switches
      if (version !== versionRef.current) return;
      setCache(key, fresh);
      setData(fresh);
    } catch (e) {
      console.log('[SNIPE] Cache fetch error:', e);
    }
    if (version === versionRef.current) {
      setLoading(false);
    }
  }, [key, fetcher]);

  return { data, loading, refetch };
}

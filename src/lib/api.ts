/**
 * Thin HTTP layer shared by all React Query hooks.
 */

import { queryOptions } from "@tanstack/react-query";

export class UnauthorizedError extends Error {
  constructor(message = "Authentication required.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Fetch JSON, translating 401s into UnauthorizedError (handled globally by
 * the query client, which re-checks auth) and non-OK responses into Errors
 * carrying the server-provided message.
 */
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (HTTP ${res.status}).`);
  }
  return res.json() as Promise<T>;
}

export function postJson<T>(url: string, body?: unknown): Promise<T> {
  return fetchJson<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export interface CategoryStat {
  category: string;
  channelCount: number;
}

export interface CategoriesResponse {
  categories: string[];
  stats: CategoryStat[];
}

/** Shared by the Dashboard filter dropdown and the Categories tab. */
export const categoriesQueryOptions = queryOptions({
  queryKey: ["categories"],
  queryFn: () => fetchJson<CategoriesResponse>("/api/categories"),
});

export interface SyncStatusResponse {
  count: number;
  lastSyncedAt: string | null;
}

export const syncStatusQueryOptions = queryOptions({
  queryKey: ["syncStatus"],
  queryFn: () => fetchJson<SyncStatusResponse>("/api/sync"),
});

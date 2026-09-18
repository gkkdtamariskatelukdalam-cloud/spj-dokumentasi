"use client";

/**
 * Client-side helpers for the SPJ year management APIs.
 *
 * Backend routes:
 *   GET    /api/years          — list all years
 *   POST   /api/years          — create year (admin)
 *   PUT    /api/years/[id]     — update year (admin)
 *   DELETE /api/years/[id]     — delete year (admin, blocked if has data)
 *   GET    /api/years/active   — get active year from cookie
 *   POST   /api/years/active   — set active year (body: { yearId: "all" | "specific-id" })
 */

export interface SpjYearInfo {
  id: string;
  year: number;
  isActive: boolean;
  label: string | null;
  orderCount: number;
}

export interface ActiveYear {
  id: string;
  year: number;
  label: string | null;
  isActive: boolean;
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const yearApi = {
  /** GET /api/years — list all years (newest first) */
  async list(): Promise<{ years: SpjYearInfo[] }> {
    return jsonFetch<{ years: SpjYearInfo[] }>("/api/years", {
      cache: "no-store",
    });
  },

  /** POST /api/years — create year (admin only) */
  async create(year: number, label?: string): Promise<SpjYearInfo> {
    const body: { year: number; label?: string } = { year };
    if (label && label.trim()) body.label = label.trim();
    const res = await jsonFetch<{ year: SpjYearInfo }>("/api/years", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.year;
  },

  /** PUT /api/years/[id] — update label/isActive (admin only) */
  async update(
    id: string,
    data: { label?: string | null; isActive?: boolean }
  ): Promise<{ success: boolean }> {
    await jsonFetch<{ year: SpjYearInfo }>(`/api/years/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return { success: true };
  },

  /** DELETE /api/years/[id] — delete year (admin only, blocked if has data) */
  async delete(id: string): Promise<{ success: boolean }> {
    return jsonFetch<{ success: boolean }>(`/api/years/${id}`, {
      method: "DELETE",
    });
  },

  /** GET /api/years/active — returns { year: ActiveYear | null } (null = "all years" mode) */
  async getActive(): Promise<{ year: ActiveYear | null }> {
    return jsonFetch<{ year: ActiveYear | null; mode?: string }>(
      "/api/years/active",
      { cache: "no-store" }
    );
  },

  /** POST /api/years/active — set active year (yearId = "all" or specific id) */
  async setActive(yearId: string): Promise<{ success: boolean }> {
    return jsonFetch<{ success: boolean }>("/api/years/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yearId }),
    });
  },
};

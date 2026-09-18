"use client";

import * as React from "react";

export interface AuthUser {
  id: string;
  username: string;
  role: string;
  isActive: boolean;
  displayName: string | null;
}

export interface AppSettings {
  appName: string;
  appDescription: string;
  logoUrl: string;
  faviconUrl: string;
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

export const authApi = {
  async login(username: string, password: string): Promise<{ success: boolean; user: AuthUser }> {
    return jsonFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
  },

  async logout(): Promise<{ success: boolean }> {
    return jsonFetch("/api/auth/logout", { method: "POST" });
  },

  async me(): Promise<{ user: AuthUser | null }> {
    return jsonFetch("/api/auth/me", { cache: "no-store" });
  },

  async listUsers(q?: string): Promise<{
    users: Array<{
      id: string;
      username: string;
      role: string;
      isActive: boolean;
      displayName: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
  }> {
    const qs = q ? `?q=${encodeURIComponent(q)}` : "";
    return jsonFetch(`/api/users${qs}`, { cache: "no-store" });
  },

  async createUser(data: {
    username: string;
    password: string;
    role: string;
    displayName?: string;
  }): Promise<{ id: string }> {
    return jsonFetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  async updateUser(id: string, data: {
    username?: string;
    password?: string;
    role?: string;
    isActive?: boolean;
    displayName?: string;
  }): Promise<{ success: boolean }> {
    return jsonFetch(`/api/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  async deleteUser(id: string): Promise<{ success: boolean }> {
    return jsonFetch(`/api/users/${id}`, { method: "DELETE" });
  },

  async getSettings(): Promise<{ settings: AppSettings }> {
    return jsonFetch("/api/settings", { cache: "no-store" });
  },

  async updateSettings(data: {
    appName?: string;
    appDescription?: string;
  }): Promise<{ settings: AppSettings }> {
    return jsonFetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  async uploadLogo(file: File): Promise<{ success: boolean; logoUrl: string }> {
    const fd = new FormData();
    fd.append("file", file);
    return jsonFetch("/api/settings/logo", { method: "POST", body: fd });
  },
};

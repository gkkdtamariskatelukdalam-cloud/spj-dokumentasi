import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "spj_session";

export interface SessionUser {
  id: string;
  username: string;
  role: string;
  isActive: boolean;
  displayName: string | null;
}

/**
 * Verify password against hash
 */
export function verifyPassword(password: string, hash: string): boolean {
  try {
    return bcrypt.compareSync(password, hash);
  } catch {
    return false;
  }
}

/**
 * Hash a password
 */
export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

/**
 * Create session: set cookie with user ID
 * Simple cookie-based session (for prototype/single-instance)
 */
export async function createSession(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

/**
 * Destroy session: delete cookie
 */
export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Get current session user from cookie
 * Returns null if not authenticated or user not found/inactive
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) return null;

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      isActive: user.isActive,
      displayName: user.displayName,
    };
  } catch {
    return null;
  }
}

/**
 * Require authentication — returns user or null
 * Use in API routes to check auth
 */
export async function requireAuth(): Promise<SessionUser | null> {
  return getSessionUser();
}

/**
 * Require admin role — returns user or null
 * Use in API routes to check admin access
 */
export async function requireAdmin(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

/**
 * Get app setting value by key
 */
export async function getAppSetting(key: string): Promise<string | null> {
  try {
    const setting = await db.appSetting.findUnique({ where: { key } });
    return setting?.value || null;
  } catch {
    return null;
  }
}

/**
 * Get all app settings as key-value map
 */
export async function getAllAppSettings(): Promise<Record<string, string>> {
  try {
    const settings = await db.appSetting.findMany();
    const map: Record<string, string> = {};
    for (const s of settings) {
      map[s.key] = s.value || "";
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * Set app setting value
 */
export async function setAppSetting(key: string, value: string): Promise<void> {
  await db.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

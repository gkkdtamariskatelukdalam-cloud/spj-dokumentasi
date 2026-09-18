import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  createSession,
  verifyPassword,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ===== Simple in-memory rate limiting (per IP) =====
// Allows 5 login attempts per 60 seconds per IP.
// In serverless (Vercel), this resets per instance — good enough for basic protection.
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 1000; // 1 minute

function checkRateLimit(ip: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count++;
  return { allowed: true, retryAfter: 0 };
}

function recordFailedAttempt(ip: string) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (entry && now <= entry.resetAt) {
    entry.count++;
  } else {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  }
}

function clearAttempts(ip: string) {
  loginAttempts.delete(ip);
}

/**
 * POST /api/auth/login
 * Body: { username, password }
 *
 * Verifies credentials, creates a session cookie, and returns the user.
 * Includes rate limiting: max 5 attempts per minute per IP.
 */
export async function POST(req: NextRequest) {
  try {
    // Get client IP (from Vercel headers or fallback)
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    // Check rate limit
    const { allowed, retryAfter } = checkRateLimit(ip);
    if (!allowed) {
      return NextResponse.json(
        {
          error: `Terlalu banyak percobaan login. Coba lagi dalam ${retryAfter} detik.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfter) },
        }
      );
    }

    const body = await req.json().catch(() => null);
    if (
      !body ||
      typeof body.username !== "string" ||
      typeof body.password !== "string"
    ) {
      return NextResponse.json(
        { error: "Username dan password wajib diisi" },
        { status: 400 }
      );
    }

    const { username, password } = body;

    const user = await db.user.findUnique({
      where: { username: username.trim() },
    });

    // Use the same generic error message to avoid user enumeration
    if (!user || !verifyPassword(password, user.password)) {
      recordFailedAttempt(ip);
      return NextResponse.json(
        { error: "Username atau password salah" },
        { status: 401 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: "Akun dinonaktifkan" },
        { status: 403 }
      );
    }

    // Success — clear rate limit attempts
    clearAttempts(ip);

    await createSession(user.id);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.displayName,
      },
    });
  } catch (err) {
    console.error("POST /api/auth/login error:", err);
    return NextResponse.json(
      { error: "Gagal melakukan login" },
      { status: 500 }
    );
  }
}

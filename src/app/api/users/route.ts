import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, hashPassword } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_ROLES = ["admin", "user"];

/**
 * Strip the password hash and sensitive fields from a user record.
 */
function publicUser(user: {
  id: string;
  username: string;
  role: string;
  isActive: boolean;
  displayName: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
    displayName: user.displayName,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * GET /api/users?q=<keyword>
 *
 * List all users (admin only). Supports `q` search by username.
 */
export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json(
        { error: "Akses ditolak" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() || "";

    const where = q ? { username: { contains: q } } : {};

    const users = await db.user.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        username: true,
        role: true,
        isActive: true,
        displayName: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ users: users.map(publicUser) });
  } catch (err) {
    console.error("GET /api/users error:", err);
    return NextResponse.json(
      { error: "Gagal memuat daftar user" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/users
 * Body: { username, password, role, displayName? }
 *
 * Create a new user (admin only).
 *  - username must be unique
 *  - password min 6 chars (hashed with bcrypt before storage)
 *  - role must be "admin" or "user"
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json(
        { error: "Akses ditolak" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { error: "Body request tidak valid" },
        { status: 400 }
      );
    }

    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const role = typeof body.role === "string" ? body.role : "";
    const displayName =
      typeof body.displayName === "string" && body.displayName.trim().length > 0
        ? body.displayName.trim()
        : null;

    if (!username) {
      return NextResponse.json(
        { error: "Username wajib diisi" },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password minimal 6 karakter" },
        { status: 400 }
      );
    }
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { error: "Role tidak valid (harus admin atau user)" },
        { status: 400 }
      );
    }

    // Check username uniqueness
    const existing = await db.user.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json(
        { error: "Username sudah digunakan" },
        { status: 400 }
      );
    }

    const hashed = hashPassword(password);

    const created = await db.user.create({
      data: {
        username,
        password: hashed,
        role,
        displayName,
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        role: true,
        isActive: true,
        displayName: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ user: publicUser(created) }, { status: 201 });
  } catch (err) {
    console.error("POST /api/users error:", err);
    return NextResponse.json(
      { error: "Gagal membuat user baru" },
      { status: 500 }
    );
  }
}

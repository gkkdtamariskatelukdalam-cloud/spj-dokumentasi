import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, hashPassword } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_ROLES = ["admin", "user"];

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
 * GET /api/users/[id]
 * Get a single user by id (admin only). Never returns the password hash.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json(
        { error: "Akses ditolak" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const user = await db.user.findUnique({
      where: { id },
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

    if (!user) {
      return NextResponse.json(
        { error: "User tidak ditemukan" },
        { status: 404 }
      );
    }

    return NextResponse.json({ user: publicUser(user) });
  } catch (err) {
    console.error("GET /api/users/[id] error:", err);
    return NextResponse.json(
      { error: "Gagal memuat data user" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/users/[id]
 * Body (any subset): { username?, password?, role?, isActive?, displayName? }
 *
 * Update only the provided fields. Password (if provided) is hashed before
 * storage. Username uniqueness is validated (excluding the current user).
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json(
        { error: "Akses ditolak" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "User tidak ditemukan" },
        { status: 404 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Body request tidak valid" },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};

    if (typeof body.username === "string") {
      const username = body.username.trim();
      if (!username) {
        return NextResponse.json(
          { error: "Username tidak boleh kosong" },
          { status: 400 }
        );
      }
      // uniqueness check, excluding current user
      const conflict = await db.user.findFirst({
        where: {
          username,
          NOT: { id },
        },
        select: { id: true },
      });
      if (conflict) {
        return NextResponse.json(
          { error: "Username sudah digunakan" },
          { status: 400 }
        );
      }
      data.username = username;
    }

    if (typeof body.password === "string" && body.password.length > 0) {
      if (body.password.length < 6) {
        return NextResponse.json(
          { error: "Password minimal 6 karakter" },
          { status: 400 }
        );
      }
      data.password = hashPassword(body.password);
    }

    if (typeof body.role === "string") {
      if (!VALID_ROLES.includes(body.role)) {
        return NextResponse.json(
          { error: "Role tidak valid (harus admin atau user)" },
          { status: 400 }
        );
      }
      data.role = body.role;
    }

    if (typeof body.isActive === "boolean") {
      data.isActive = body.isActive;
    }

    if (typeof body.displayName === "string") {
      const displayName = body.displayName.trim();
      data.displayName = displayName.length > 0 ? displayName : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "Tidak ada field yang diperbarui" },
        { status: 400 }
      );
    }

    const updated = await db.user.update({
      where: { id },
      data,
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

    return NextResponse.json({ user: publicUser(updated) });
  } catch (err) {
    console.error("PUT /api/users/[id] error:", err);
    return NextResponse.json(
      { error: "Gagal memperbarui user" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/users/[id]
 *
 * Delete a user (admin only). Refuses to delete if it would leave the
 * system with zero active admin accounts.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json(
        { error: "Akses ditolak" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const target = await db.user.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json(
        { error: "User tidak ditemukan" },
        { status: 404 }
      );
    }

    // If the target is an active admin, make sure at least one other active
    // admin would remain after deletion.
    if (target.role === "admin" && target.isActive) {
      const otherActiveAdmins = await db.user.count({
        where: {
          role: "admin",
          isActive: true,
          NOT: { id },
        },
      });

      if (otherActiveAdmins === 0) {
        return NextResponse.json(
          { error: "Tidak dapat menghapus admin terakhir" },
          { status: 400 }
        );
      }
    }

    await db.user.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/users/[id] error:", err);
    return NextResponse.json(
      { error: "Gagal menghapus user" },
      { status: 500 }
    );
  }
}

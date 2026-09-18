import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  requireAdmin,
  getAllAppSettings,
  setAppSetting,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Build the settings response object from the raw key-value map.
 * Always returns the same shape so the frontend can rely on it.
 */
function buildSettingsResponse(map: Record<string, string>) {
  return {
    appName: map.appName ?? "",
    appDescription: map.appDescription ?? "",
    logoUrl: map.logoUrl ?? "",
    faviconUrl: map.faviconUrl ?? "",
  };
}

/**
 * GET /api/settings
 *
 * Returns app settings. Any authenticated user can read these.
 */
export async function GET() {
  try {
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json(
        { error: "Akses ditolak" },
        { status: 401 }
      );
    }

    const map = await getAllAppSettings();
    return NextResponse.json({ settings: buildSettingsResponse(map) });
  } catch (err) {
    console.error("GET /api/settings error:", err);
    return NextResponse.json(
      { error: "Gagal memuat pengaturan" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings
 * Body (any subset): { appName?, appDescription? }
 *
 * Update app settings (admin only).
 */
export async function PUT(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json(
        { error: "Akses ditolak" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Body request tidak valid" },
        { status: 400 }
      );
    }

    if (typeof body.appName === "string") {
      await setAppSetting("appName", body.appName);
    }
    if (typeof body.appDescription === "string") {
      await setAppSetting("appDescription", body.appDescription);
    }

    const map = await getAllAppSettings();
    return NextResponse.json({ settings: buildSettingsResponse(map) });
  } catch (err) {
    console.error("PUT /api/settings error:", err);
    return NextResponse.json(
      { error: "Gagal memperbarui pengaturan" },
      { status: 500 }
    );
  }
}

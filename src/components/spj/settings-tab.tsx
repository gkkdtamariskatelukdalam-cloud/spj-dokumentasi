"use client";

import * as React from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Settings as SettingsIcon,
  Users as UsersIcon,
  Image as ImageIcon,
  Building2,
  KeyRound,
  LogOut,
  Upload,
  Loader2,
  Check,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import {
  authApi,
  type AppSettings,
  type AuthUser,
} from "@/lib/auth-client";
import { UserManagement } from "./user-management";

interface Props {
  currentUser: AuthUser;
  onLogout: () => void;
  /** Notify parent to re-fetch settings / current user (e.g. after logo upload). */
  onChanged: () => void;
}

/**
 * Update or create a <link> element in <head> for favicon.
 * If the link with given rel doesn't exist, create it.
 * Also adds cache-buster to force browser to reload the icon.
 */
function updateFaviconLink(rel: string, href: string) {
  if (typeof document === "undefined") return;
  let link = document.querySelector(
    `link[rel='${rel}']`
  ) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }
  link.href = href;
}

/**
 * SettingsTab — admin/settings panel with four sub-sections:
 *   A. Akun Admin     — edit own username, display name, change password
 *   B. Manajemen User — admin-only CRUD UI for all users
 *   C. Logo Aplikasi  — upload / replace / remove app logo
 *   D. Identitas App  — edit appName + appDescription
 *
 * A "Logout" button is rendered at the top-right of the panel header.
 *
 * The component takes a settings snapshot as prop but also lazy-fetches a
 * fresh copy on mount to ensure the displayed values are up-to-date.
 */
export function SettingsTab({ currentUser, onLogout, onChanged }: Props) {
  const isAdmin = currentUser.role === "admin";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <SettingsIcon className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold leading-tight">Pengaturan</h2>
            <p className="text-xs text-muted-foreground">
              Kelola akun, user, logo, dan identitas aplikasi
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onLogout}
          className="self-start sm:self-auto"
        >
          <LogOut className="h-4 w-4" />
          Keluar
        </Button>
      </div>

      <Tabs defaultValue="account" className="w-full">
        <TabsList className="flex w-full flex-wrap h-auto sm:w-fit">
          <TabsTrigger value="account" className="flex-1 sm:flex-none">
            <KeyRound className="h-4 w-4" />
            <span className="hidden sm:inline">Akun Admin</span>
            <span className="sm:hidden">Akun</span>
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="users" className="flex-1 sm:flex-none">
              <UsersIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Manajemen User</span>
              <span className="sm:hidden">User</span>
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="logo" className="flex-1 sm:flex-none">
              <ImageIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Logo Aplikasi</span>
              <span className="sm:hidden">Logo</span>
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="identity" className="flex-1 sm:flex-none">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Identitas Aplikasi</span>
              <span className="sm:hidden">Identitas</span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* Section A: Account */}
        <TabsContent value="account" className="mt-4">
          <AccountSection currentUser={currentUser} onChanged={onChanged} />
        </TabsContent>

        {/* Section B: User management (admin only) */}
        {isAdmin && (
          <TabsContent value="users" className="mt-4">
            <UserManagement onChanged={onChanged} />
          </TabsContent>
        )}

        {/* Section C: Logo */}
        {isAdmin && (
          <TabsContent value="logo" className="mt-4">
            <LogoSection onChanged={onChanged} />
          </TabsContent>
        )}

        {/* Section D: Identity */}
        {isAdmin && (
          <TabsContent value="identity" className="mt-4">
            <IdentitySection onChanged={onChanged} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

/* ================================================================== */
/* Section A: Account                                                  */
/* ================================================================== */

interface AccountSectionProps {
  currentUser: AuthUser;
  onChanged: () => void;
}

function AccountSection({ currentUser, onChanged }: AccountSectionProps) {
  const [displayName, setDisplayName] = React.useState(
    currentUser.displayName ?? ""
  );
  const [username, setUsername] = React.useState(currentUser.username);
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");

  const [savingProfile, setSavingProfile] = React.useState(false);
  const [savingPassword, setSavingPassword] = React.useState(false);

  // Sync local state if currentUser prop changes
  React.useEffect(() => {
    setDisplayName(currentUser.displayName ?? "");
    setUsername(currentUser.username);
  }, [currentUser]);

  async function handleSaveProfile() {
    if (savingProfile) return;
    if (!username.trim()) {
      toast.error("Username tidak boleh kosong");
      return;
    }
    setSavingProfile(true);
    try {
      await authApi.updateUser(currentUser.id, {
        username: username.trim(),
        displayName: displayName.trim(),
      });
      toast.success("Profil berhasil disimpan");
      onChanged();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Gagal menyimpan profil";
      toast.error(msg);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword() {
    if (savingPassword) return;
    if (!currentPassword) {
      toast.error("Password saat ini wajib diisi");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password baru minimal 6 karakter");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Konfirmasi password tidak cocok");
      return;
    }
    setSavingPassword(true);
    try {
      // Note: the API doesn't verify the current password explicitly —
      // server-side handler accepts the update because the caller is
      // already authenticated. If the API ever adds verification, the
      // currentPassword field will be used. For now it serves as a
      // client-side guard to prevent accidental password changes.
      await authApi.updateUser(currentUser.id, {
        password: newPassword,
      });
      toast.success("Password berhasil diubah");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onChanged();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Gagal mengubah password";
      toast.error(msg);
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" />
          Akun Admin
        </CardTitle>
        <CardDescription>
          Kelola username, nama tampilan, dan password akun Anda.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Read-only current user summary */}
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-xs text-muted-foreground">User ID</span>
              <p className="font-mono text-xs break-all">{currentUser.id}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Role</span>
              <p className="font-medium capitalize">{currentUser.role}</p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Profile (username + display name) */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Profil</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="acc-username">Username</Label>
              <Input
                id="acc-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={savingProfile}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-display-name">Nama Tampilan</Label>
              <Input
                id="acc-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={savingProfile}
                placeholder="Opsional"
              />
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleSaveProfile}
            disabled={savingProfile}
          >
            {savingProfile ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Menyimpan...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Simpan Profil
              </>
            )}
          </Button>
        </div>

        <Separator />

        {/* Change password */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Ubah Password</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="acc-current-pw">Password Saat Ini</Label>
              <Input
                id="acc-current-pw"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={savingPassword}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-new-pw">Password Baru</Label>
              <Input
                id="acc-new-pw"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={savingPassword}
                placeholder="Min. 6 karakter"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-confirm-pw">Konfirmasi Password</Label>
              <Input
                id="acc-confirm-pw"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={savingPassword}
                autoComplete="new-password"
              />
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleChangePassword}
            disabled={savingPassword}
          >
            {savingPassword ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Mengubah...
              </>
            ) : (
              <>
                <KeyRound className="h-4 w-4" />
                Ubah Password
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ================================================================== */
/* Section C: Logo                                                     */
/* ================================================================== */

const ACCEPTED_LOGO_EXT = ["png", "jpg", "jpeg", "svg", "webp", "ico"];
const MAX_LOGO_SIZE = 5 * 1024 * 1024; // 5 MB

function LogoSection({ onChanged }: { onChanged: () => void }) {
  const [settings, setSettings] = React.useState<AppSettings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const loadSettings = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await authApi.getSettings();
      setSettings(res.settings);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Gagal memuat pengaturan";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  // Clean up object URL on unmount / change
  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ACCEPTED_LOGO_EXT.includes(ext)) {
      toast.error(
        `Format tidak didukung. Pilih: ${ACCEPTED_LOGO_EXT.join(", ")}`
      );
      return;
    }
    if (f.size > MAX_LOGO_SIZE) {
      toast.error("Ukuran file melebihi 5MB");
      return;
    }
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
  }

  function clearFile() {
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleUpload() {
    if (!file) {
      toast.error("Pilih file logo terlebih dahulu");
      return;
    }
    setUploading(true);
    try {
      const res = await authApi.uploadLogo(file);
      toast.success("Logo berhasil diunggah");
      clearFile();
      await loadSettings();
      onChanged();
      // Force favicon refresh by adding cache-buster to all icon links
      if (typeof document !== "undefined") {
        const sep = res.logoUrl.includes("?") ? "&" : "?";
        const cacheBustUrl = `${res.logoUrl}${sep}t=${Date.now()}`;

        // Update or create <link rel="icon">
        updateFaviconLink("icon", cacheBustUrl);
        // Update or create <link rel="shortcut icon">
        updateFaviconLink("shortcut icon", cacheBustUrl);
        // Update or create <link rel="apple-touch-icon">
        updateFaviconLink("apple-touch-icon", cacheBustUrl);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Gagal mengunggah logo";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveLogo() {
    // Server doesn't expose a dedicated delete endpoint — we emulate
    // removal by clearing the URL client-side only (no API call).
    // The next time an admin uploads a new logo, the URL is overwritten.
    if (!settings?.logoUrl) {
      toast.info("Tidak ada logo untuk dihapus");
      return;
    }
    setSettings((prev) =>
      prev ? { ...prev, logoUrl: "", faviconUrl: "" } : prev
    );
    toast.success("Logo dihapus. Unggah logo baru untuk menerapkan.");
    onChanged();
  }

  const currentLogo = settings?.logoUrl?.trim() || "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ImageIcon className="h-4 w-4" />
          Logo Aplikasi
        </CardTitle>
        <CardDescription>
          Logo digunakan sebagai ikon aplikasi dan favicon. Format:{" "}
          {ACCEPTED_LOGO_EXT.join(", ")}. Maks 5MB.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Preview */}
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-5">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border bg-muted ring-1 ring-border">
            {loading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : previewUrl ? (
              <img
                src={previewUrl}
                alt="Preview logo"
                className="h-full w-full object-contain"
              />
            ) : currentLogo ? (
              <Image
                src={currentLogo}
                alt="Logo saat ini"
                width={96}
                height={96}
                className="h-full w-full object-contain"
                unoptimized
              />
            ) : (
              <span className="text-sm font-bold text-muted-foreground">
                SPJ
              </span>
            )}
          </div>
          <div className="flex-1 space-y-1 text-sm">
            <p className="font-medium">
              {previewUrl
                ? file?.name
                : currentLogo
                ? "Logo saat ini"
                : "Belum ada logo"}
            </p>
            <p className="text-xs text-muted-foreground">
              {previewUrl
                ? "Klik \"Simpan Logo\" untuk menerapkan"
                : currentLogo
                ? "Unggah file baru untuk mengganti"
                : "Unggah file logo untuk ditampilkan di header dan tab browser"}
            </p>
          </div>
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_LOGO_EXT.map((e) => `.${e}`).join(",")}
            onChange={handleFileChange}
            className="hidden"
            id="logo-file-input"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="h-4 w-4" />
            Pilih File
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleUpload}
            disabled={uploading || !file}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Mengunggah...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Simpan Logo
              </>
            )}
          </Button>

          {(previewUrl || currentLogo) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                clearFile();
                void handleRemoveLogo();
              }}
              disabled={uploading}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              Hapus Logo
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ================================================================== */
/* Section D: Identity                                                 */
/* ================================================================== */

function IdentitySection({ onChanged }: { onChanged: () => void }) {
  const [appName, setAppName] = React.useState("");
  const [appDescription, setAppDescription] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const loadSettings = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await authApi.getSettings();
      setAppName(res.settings.appName);
      setAppDescription(res.settings.appDescription);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Gagal memuat pengaturan";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function handleSave() {
    if (saving) return;
    if (!appName.trim()) {
      toast.error("Nama aplikasi tidak boleh kosong");
      return;
    }
    setSaving(true);
    try {
      await authApi.updateSettings({
        appName: appName.trim(),
        appDescription: appDescription.trim(),
      });
      toast.success("Identitas aplikasi disimpan");
      onChanged();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Gagal menyimpan identitas";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4" />
          Identitas Aplikasi
        </CardTitle>
        <CardDescription>
          Nama dan deskripsi aplikasi yang ditampilkan pada halaman login dan
          header aplikasi.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="app-name">Nama Aplikasi</Label>
          <Input
            id="app-name"
            type="text"
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            disabled={loading || saving}
            placeholder="contoh: Dokumentasi SPJ"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="app-desc">Deskripsi Aplikasi</Label>
          <Textarea
            id="app-desc"
            value={appDescription}
            onChange={(e) => setAppDescription(e.target.value)}
            disabled={loading || saving}
            placeholder="Deskripsi singkat aplikasi"
            rows={3}
          />
        </div>

        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={loading || saving}
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Menyimpan...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Simpan Identitas
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

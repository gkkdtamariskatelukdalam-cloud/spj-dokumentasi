"use client";

import * as React from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, LogIn, ShieldCheck } from "lucide-react";
import { authApi, type AppSettings, type AuthUser } from "@/lib/auth-client";

interface Props {
  /** Called with the logged-in user after a successful login. */
  onSuccess: (user: AuthUser) => void;
  /** Public app settings (used to render logo / app name / description). */
  settings: AppSettings | null;
}

/**
 * LoginForm — elegant centered card-style login.
 *
 * - Logo placeholder (circle with "SPJ") shown unless `settings.logoUrl` exists.
 * - App name + description from settings.
 * - Username + password (with show/hide toggle).
 * - Loading state on submit button, error message below form.
 * - Dark-mode aware via semantic tokens (bg-background, text-foreground, …).
 * - Responsive: max-width 400px, full-width on mobile.
 */
export function LoginForm({ onSuccess, settings }: Props) {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const appName = settings?.appName?.trim() || "Dokumentasi SPJ";
  const appDescription =
    settings?.appDescription?.trim() ||
    "Sistem dokumentasi laporan Surat Pertanggungjawaban";
  const logoUrl = settings?.logoUrl?.trim() || "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setError(null);

    // Basic client-side validation
    if (!username.trim()) {
      setError("Username wajib diisi");
      return;
    }
    if (!password) {
      setError("Password wajib diisi");
      return;
    }

    setLoading(true);
    try {
      const result = await authApi.login(username.trim(), password);
      toastLoginSuccess();
      onSuccess(result.user);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Gagal masuk. Silakan coba lagi.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-[400px]">
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
          {/* Header: logo + app name + description */}
          <div className="flex flex-col items-center gap-3 px-6 pt-8 pb-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border bg-muted ring-1 ring-border">
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt={appName}
                  width={64}
                  height={64}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              ) : (
                <span className="text-lg font-bold tracking-tight text-foreground">
                  SPJ
                </span>
              )}
            </div>
            <div className="space-y-1">
              <h1 className="text-xl font-semibold leading-tight text-foreground">
                {appName}
              </h1>
              <p className="text-sm text-muted-foreground">{appDescription}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 px-6 pb-6 pt-2">
            {/* Username */}
            <div className="space-y-2">
              <Label htmlFor="login-username" className="text-sm font-medium">
                Username
              </Label>
              <Input
                id="login-username"
                type="text"
                autoComplete="username"
                placeholder="Masukkan username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                autoFocus
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="login-password" className="text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Masukkan password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  disabled={loading}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  Masuk
                </>
              )}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} {appName}. Semua hak dilindungi.
        </p>
      </div>
    </div>
  );
}

/**
 * Lightweight success signal — kept separate so the component stays
 * free of extra UI dependencies. The parent can wire its own toast
 * if desired, but we keep a minimal console hint as a fallback.
 */
function toastLoginSuccess() {
  if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
    console.info("[auth] login success");
  }
}

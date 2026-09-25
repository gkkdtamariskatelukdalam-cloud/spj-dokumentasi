"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Moon, Sun, Loader2, Inbox, LayoutDashboard, Table2, Images, Settings, LogOut, Download } from "lucide-react";
import { useTheme } from "next-themes";
import { StatsCards } from "@/components/spj/stats-cards";
import { OrderTable } from "@/components/spj/order-table";
import { OrderDetailSheet } from "@/components/spj/order-detail-sheet";
import { ImportDialog } from "@/components/spj/import-dialog";
import { ReportDialog } from "@/components/spj/report-dialog";
import { DocumentationTab } from "@/components/spj/documentation-tab";
import { LoginForm } from "@/components/spj/login-form";
import { SettingsTab } from "@/components/spj/settings-tab";
import { YearSelector } from "@/components/spj/year-selector";
import { authApi, type AuthUser, type AppSettings } from "@/lib/auth-client";
import { yearApi, type ActiveYear } from "@/lib/year-client";
import {
  spjApi,
  type Stats,
  type OrderListItem,
  type OrderStatus,
} from "@/lib/spj-api";

type StatusFilter = OrderStatus | "all";

// Table rows are more compact than cards, so we show more per page.
const PAGE_SIZE = 25;

export default function HomePage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // ===== AUTH STATE =====
  const [authUser, setAuthUser] = React.useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = React.useState(true);
  const [appSettings, setAppSettings] = React.useState<AppSettings | null>(null);

  // Check auth on mount
  React.useEffect(() => {
    void (async () => {
      try {
        const { user } = await authApi.me();
        setAuthUser(user);
        if (user) {
          const { settings } = await authApi.getSettings();
          setAppSettings(settings);
          // Also load active year so the YearSelector has a value and all
          // data fetches can be scoped correctly from the first render.
          try {
            const { year } = await yearApi.getActive();
            setActiveYear(year);
          } catch {
            /* ignore — fall back to "all years" */
          }
        }
      } catch {
        // ignore
      } finally {
        setAuthLoading(false);
      }
    })();
  }, []);

  const refreshSettings = React.useCallback(async () => {
    try {
      const { settings } = await authApi.getSettings();
      setAppSettings(settings);
    } catch {
      /* ignore */
    }
  }, []);

  const handleLoginSuccess = React.useCallback((user: AuthUser) => {
    setAuthUser(user);
    void refreshSettings();
  }, [refreshSettings]);

  const handleLogout = React.useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* ignore */
    }
    setAuthUser(null);
    setActiveTab("data");
  }, []);

  // data state
  const [stats, setStats] = React.useState<Stats | undefined>();
  const [statsLoading, setStatsLoading] = React.useState(true);
  const [orders, setOrders] = React.useState<OrderListItem[]>([]);
  const [ordersLoading, setOrdersLoading] = React.useState(true);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);

  // active year state — null means "Semua Tahun" (all years)
  const [activeYear, setActiveYear] = React.useState<ActiveYear | null>(null);

  // filter state
  const [q, setQ] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [page, setPage] = React.useState(1);

  // detail sheet
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  // active tab: "data" (default) | "dashboard" | "documentation" | "settings"
  const [activeTab, setActiveTab] = React.useState<
    "data" | "dashboard" | "documentation" | "settings"
  >("data");

  // After hydration: read URL hash to restore last tab (no hydration mismatch)
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      if (window.location.hash === "#dashboard") setActiveTab("dashboard");
      else if (window.location.hash === "#documentation") setActiveTab("documentation");
      else if (window.location.hash === "#settings") setActiveTab("settings");
    }
  }, []);

  // Sync URL hash with active tab (after user clicks)
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const newHash =
        activeTab === "dashboard"
          ? "#dashboard"
          : activeTab === "documentation"
          ? "#documentation"
          : activeTab === "settings"
          ? "#settings"
          : "";
      if (window.location.hash !== newHash) {
        window.history.replaceState(null, "", window.location.pathname + newHash + window.location.search);
      }
    }
  }, [activeTab]);

  // debounce search
  const debouncedQ = React.useDeferredValue(q);

  // refetch helpers
  const refreshStats = React.useCallback(async () => {
    setStatsLoading(true);
    try {
      const s = await spjApi.getStats(activeYear?.id);
      setStats(s);
    } catch (e) {
      console.error(e);
    } finally {
      setStatsLoading(false);
    }
  }, [activeYear?.id]);

  const refreshOrders = React.useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res = await spjApi.listOrders({
        q: debouncedQ,
        status: statusFilter,
        page,
        pageSize: PAGE_SIZE,
        yearId: activeYear?.id,
      });
      // The API may return fewer items than expected when filtering by status.
      // We display whatever the API returns and let the user paginate normally.
      setOrders(res.orders);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (e) {
      console.error(e);
    } finally {
      setOrdersLoading(false);
    }
  }, [debouncedQ, statusFilter, page, activeYear?.id]);

  React.useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  React.useEffect(() => {
    // reset to page 1 when filter changes
    setPage(1);
  }, [debouncedQ, statusFilter]);

  React.useEffect(() => {
    void refreshOrders();
  }, [refreshOrders]);

  function handleCardClick(id: string) {
    setSelectedId(id);
    setSheetOpen(true);
  }

  const handleSheetChanged = React.useCallback(() => {
    void refreshStats();
    void refreshOrders();
  }, [refreshStats, refreshOrders]);

  /**
   * Called by YearSelector after the user picks a new active year. The server
   * has already set the cookie; here we refresh local state and let the
   * existing useEffects (which depend on activeYear?.id via refreshStats /
   * refreshOrders) re-fetch stats + orders automatically.
   */
  const handleYearChange = React.useCallback(async () => {
    try {
      const { year } = await yearApi.getActive();
      setActiveYear(year);
    } catch {
      /* ignore */
    }
  }, []);

  // ===== AUTH GATE: show login form if not authenticated =====
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authUser) {
    return <LoginForm onSuccess={handleLoginSuccess} settings={appSettings} />;
  }

  const isAdmin = authUser.role === "admin";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {appSettings?.logoUrl ? (
              <img
                src={appSettings.logoUrl}
                alt="Logo"
                className="h-9 w-9 rounded-md object-contain shrink-0"
              />
            ) : (
              <div className="h-9 w-9 rounded-md bg-primary text-primary-foreground grid place-items-center font-bold shrink-0">
                SPJ
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-semibold truncate">
                {appSettings?.appName || "Dokumentasi SPJ"}
              </h1>
              <p className="text-[11px] text-muted-foreground truncate">
                {authUser.displayName || authUser.username}
                <span className="ml-1 opacity-60">
                  ({authUser.role === "admin" ? "Admin" : "User"})
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <YearSelector
              activeYear={activeYear}
              onYearChange={handleYearChange}
            />
            <ReportDialog
              triggerVariant="default"
              triggerLabel="Cetak Laporan"
              triggerSize="sm"
              triggerIcon="printer"
              yearId={activeYear?.id}
            />
            <ImportDialog
              onImported={() => { void refreshStats(); void refreshOrders(); }}
              activeYearId={activeYear?.id}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const yid = activeYear?.id;
                const url =
                  yid && yid !== "all"
                    ? `/api/export?status=all&yearId=${encodeURIComponent(yid)}`
                    : `/api/export?status=all`;
                window.open(url, "_blank");
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Export Excel</span>
            </Button>
            {mounted && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                aria-label="Ganti tema"
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-muted-foreground hover:text-rose-600"
            >
              <LogOut className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Keluar</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Tab navigator — sticky below header so user can switch context easily.
          Using plain buttons instead of Radix Tabs for more reliable state control. */}
      <div className="sticky top-[57px] z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-7xl px-4">
          <div role="tablist" aria-label="Mode tampilan" className="flex gap-1 h-12 items-center">
            {/* Data Belanja — blue accent */}
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "data"}
              data-state={activeTab === "data" ? "active" : "inactive"}
              onClick={() => setActiveTab("data")}
              style={activeTab === "data" ? {
                backgroundColor: "oklch(0.94 0.04 255)",
                color: "oklch(0.40 0.18 255)",
              } : undefined}
              className={`flex items-center gap-1.5 rounded-md px-3 h-9 text-sm font-medium transition-colors ${
                activeTab === "data"
                  ? ""
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Table2 className="h-3.5 w-3.5" style={{ color: activeTab === "data" ? "oklch(0.45 0.18 255)" : undefined }} />
              Data Belanja
            </button>
            {/* Dashboard — purple accent */}
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "dashboard"}
              data-state={activeTab === "dashboard" ? "active" : "inactive"}
              onClick={() => setActiveTab("dashboard")}
              style={activeTab === "dashboard" ? {
                backgroundColor: "oklch(0.94 0.04 292)",
                color: "oklch(0.40 0.18 292)",
              } : undefined}
              className={`flex items-center gap-1.5 rounded-md px-3 h-9 text-sm font-medium transition-colors ${
                activeTab === "dashboard"
                  ? ""
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <LayoutDashboard className="h-3.5 w-3.5" style={{ color: activeTab === "dashboard" ? "oklch(0.45 0.18 292)" : undefined }} />
              Dashboard
            </button>
            {/* Dokumentasi — green accent */}
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "documentation"}
              data-state={activeTab === "documentation" ? "active" : "inactive"}
              onClick={() => setActiveTab("documentation")}
              style={activeTab === "documentation" ? {
                backgroundColor: "oklch(0.94 0.04 162)",
                color: "oklch(0.38 0.13 162)",
              } : undefined}
              className={`flex items-center gap-1.5 rounded-md px-3 h-9 text-sm font-medium transition-colors ${
                activeTab === "documentation"
                  ? ""
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Images className="h-3.5 w-3.5" style={{ color: activeTab === "documentation" ? "oklch(0.42 0.14 162)" : undefined }} />
              Dokumentasi
            </button>
            {/* Pengaturan — amber accent (admin only) */}
            {isAdmin && (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "settings"}
                data-state={activeTab === "settings" ? "active" : "inactive"}
                onClick={() => setActiveTab("settings")}
                style={activeTab === "settings" ? {
                  backgroundColor: "oklch(0.94 0.05 70)",
                  color: "oklch(0.45 0.15 70)",
                } : undefined}
                className={`flex items-center gap-1.5 rounded-md px-3 h-9 text-sm font-medium transition-colors ${
                  activeTab === "settings"
                    ? ""
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Settings className="h-3.5 w-3.5" style={{ color: activeTab === "settings" ? "oklch(0.50 0.16 70)" : undefined }} />
                Pengaturan
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-4 space-y-4">
        {activeTab === "settings" && authUser ? (
          // ===== SETTINGS TAB: account, user management, logo, app identity =====
          <SettingsTab
            currentUser={authUser}
            onLogout={handleLogout}
            onChanged={refreshSettings}
          />
        ) : activeTab === "documentation" ? (
          // ===== DOKUMENTASI TAB: photo library with many-to-many to orders =====
          <DocumentationTab
            onChanged={() => {
              void refreshStats();
              void refreshOrders();
            }}
            yearId={activeYear?.id}
          />
        ) : activeTab === "dashboard" ? (
          // ===== DASHBOARD TAB: hanya statistik + progress, tanpa tabel =====
          <>
            <StatsCards stats={stats} loading={statsLoading} />

            {/* Quick summary — count of orders needing attention */}
            {!statsLoading && stats && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="text-sm font-semibold mb-3">Ringkasan Status Dokumentasi</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">✅ Lengkap (≥2 foto)</span>
                    <strong className="text-emerald-600 dark:text-emerald-400 tabular-nums">{stats.completeOrders}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">⏳ Kurang (1 foto)</span>
                    <strong className="text-amber-600 dark:text-amber-400 tabular-nums">{stats.incompleteOrders}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">❌ Belum ada foto</span>
                    <strong className="text-rose-600 dark:text-rose-400 tabular-nums">{stats.emptyOrders}</strong>
                  </div>
                  <div className="border-t pt-2 flex items-center justify-between">
                    <span className="text-muted-foreground">Total No. Pesanan</span>
                    <strong className="tabular-nums">{stats.totalOrders}</strong>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 w-full"
                  onClick={() => setActiveTab("data")}
                >
                  <Table2 className="h-4 w-4 mr-2" />
                  Buka Data Belanja
                </Button>
              </div>
            )}
          </>
        ) : (
          // ===== DATA BELANJA TAB: hanya tabel + filter, tanpa statistik =====
          <>
            {/* Filter bar */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari No Pesanan, BKU, Nama Barang, Toko, Uraian..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as StatusFilter)}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Status dokumentasi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua status</SelectItem>
                  <SelectItem value="complete">✅ Lengkap (≥2 foto)</SelectItem>
                  <SelectItem value="incomplete">⏳ Kurang (1 foto)</SelectItem>
                  <SelectItem value="empty">❌ Belum ada foto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Result info */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {ordersLoading ? (
                  "Memuat..."
                ) : (
                  <>
                    Menampilkan <strong>{orders.length}</strong> dari{" "}
                    <strong>{total}</strong> No Pesanan
                    {debouncedQ && ` untuk "${debouncedQ}"`}
                  </>
                )}
              </span>
              {totalPages > 1 && (
                <span>
                  Hal. {page} / {totalPages}
                </span>
              )}
            </div>

            {/* Orders table (row-based, compact) */}
            {ordersLoading ? (
              <div className="rounded-lg border overflow-hidden bg-card">
                <div className="hidden md:block">
                  <Skeleton className="h-10 w-full rounded-none border-b" />
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-none border-b last:border-b-0" />
                  ))}
                </div>
                <div className="md:hidden divide-y">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-none" />
                  ))}
                </div>
              </div>
            ) : orders.length === 0 ? (
              <div className="rounded-lg border border-dashed py-16 text-center">
                <Inbox className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Tidak ada data yang cocok dengan filter.
                </p>
              </div>
            ) : (
              <OrderTable orders={orders} onClick={handleCardClick} />
            )}

            {/* Pagination */}
            {totalPages > 1 && !ordersLoading && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Sebelumnya
                </Button>
                <span className="text-sm text-muted-foreground px-2">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Berikutnya
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer (sticky bottom) */}
      <footer className="mt-auto border-t bg-background">
        <div className="mx-auto max-w-7xl px-4 py-3 text-center text-xs text-muted-foreground">
          <p>
            Dokumentasi SPJ • Upload foto dari laptop atau langsung foto dari
            Android •{" "}
            <span className="font-medium">
              Min. 2 foto per No Pesanan
            </span>
          </p>
        </div>
      </footer>

      {/* Detail sheet */}
      <OrderDetailSheet
        orderId={selectedId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onChanged={handleSheetChanged}
      />
    </div>
  );
}

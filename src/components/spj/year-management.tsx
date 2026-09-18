"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Loader2,
  Calendar,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { yearApi, type SpjYearInfo } from "@/lib/year-client";

interface Props {
  /** Notify parent to refresh cached data (e.g. the year selector list). */
  onChanged: () => void;
}

/**
 * YearManagement — admin-only CRUD UI for years.
 *
 * Layout (mirrors UserManagement):
 *   - Toolbar: search by year + "Tambah Tahun" button
 *   - Table: Tahun | Label | Status | Order Count | Aksi
 *
 * Actions:
 *   - Edit (Pencil) → dialog with label + isActive toggle
 *   - Toggle Aktif/Nonaktif (Switch, inline, optimistic)
 *   - Delete (Trash) → AlertDialog confirmation (blocked if orderCount > 0)
 *
 * Create dialog: year input (number, 2000-2100) + optional label
 */
export function YearManagement({ onChanged }: Props) {
  const [years, setYears] = React.useState<SpjYearInfo[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<SpjYearInfo | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<SpjYearInfo | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  // optimistic in-flight set (ids) for toggle
  const [toggling, setToggling] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadYears = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await yearApi.list();
      setYears(res.years);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Gagal memuat daftar tahun";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadYears();
  }, [loadYears]);

  // Client-side search by year number / label
  const filtered = React.useMemo(() => {
    if (!debouncedSearch) return years;
    const q = debouncedSearch.toLowerCase();
    return years.filter(
      (y) =>
        String(y.year).includes(q) ||
        (y.label ?? "").toLowerCase().includes(q)
    );
  }, [years, debouncedSearch]);

  function refresh() {
    void loadYears();
    onChanged();
  }

  async function handleToggleActive(year: SpjYearInfo) {
    // Optimistic update
    setYears((prev) =>
      prev.map((y) =>
        y.id === year.id ? { ...y, isActive: !y.isActive } : y
      )
    );
    setToggling((prev) => new Set(prev).add(year.id));
    try {
      await yearApi.update(year.id, { isActive: !year.isActive });
      toast.success(
        `Tahun ${year.year} ${!year.isActive ? "diaktifkan" : "dinonaktifkan"}`
      );
      onChanged();
    } catch (err) {
      // rollback
      setYears((prev) =>
        prev.map((y) =>
          y.id === year.id ? { ...y, isActive: year.isActive } : y
        )
      );
      const msg =
        err instanceof Error ? err.message : "Gagal mengubah status tahun";
      toast.error(msg);
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(year.id);
        return next;
      });
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await yearApi.delete(deleteTarget.id);
      toast.success(`Tahun ${deleteTarget.year} dihapus`);
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Gagal menghapus tahun";
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            inputMode="numeric"
            placeholder="Cari tahun (mis. 2026)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus className="h-4 w-4" />
          Tambah Tahun
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="min-w-[110px]">Tahun</TableHead>
              <TableHead className="min-w-[180px]">Label</TableHead>
              <TableHead className="min-w-[110px]">Status</TableHead>
              <TableHead className="min-w-[100px] text-right">Order</TableHead>
              <TableHead className="min-w-[170px] text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TableCell key={`s-${i}-${j}`}>
                      <Skeleton className="h-5 w-full max-w-[120px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Calendar className="h-6 w-6" />
                    <span className="text-sm">
                      {debouncedSearch
                        ? `Tidak ada tahun yang cocok dengan "${debouncedSearch}"`
                        : "Belum ada tahun. Klik \"Tambah Tahun\" untuk membuat."}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((y) => (
                <TableRow key={y.id}>
                  <TableCell>
                    <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
                      {y.year}
                    </span>
                  </TableCell>
                  <TableCell>
                    {y.label ? (
                      <span className="text-sm text-foreground/80">{y.label}</span>
                    ) : (
                      <span className="text-muted-foreground italic text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        y.isActive
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "border-muted-foreground/30 text-muted-foreground"
                      }
                    >
                      {y.isActive ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className="text-sm">{y.orderCount}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Switch
                        checked={y.isActive}
                        onCheckedChange={() => handleToggleActive(y)}
                        disabled={toggling.has(y.id)}
                        aria-label="Toggle aktif"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setEditTarget(y)}
                        aria-label="Edit tahun"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 disabled:opacity-40"
                        onClick={() => setDeleteTarget(y)}
                        disabled={y.orderCount > 0}
                        aria-label="Hapus tahun"
                        title={
                          y.orderCount > 0
                            ? `Tidak dapat dihapus — masih ada ${y.orderCount} order`
                            : "Hapus tahun"
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Helper note */}
      {!loading && years.length > 0 && (
        <p className="text-xs text-muted-foreground">
          💡 Tahun dengan <strong>order &gt; 0</strong> tidak dapat dihapus.
          Nonaktifkan tahun (toggle Aktif) untuk menyembunyikannya dari pilihan
          default, tanpa menghapus data.
        </p>
      )}

      {/* Create dialog */}
      <YearFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        onChanged={refresh}
      />

      {/* Edit dialog */}
      <YearFormDialog
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        mode="edit"
        existingYear={editTarget}
        onChanged={refresh}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus tahun {deleteTarget?.year}?</AlertDialogTitle>
            <AlertDialogDescription>
              Anda akan menghapus tahun{" "}
              <strong className="text-foreground">{deleteTarget?.year}</strong>
              {deleteTarget?.label ? ` (${deleteTarget.label})` : ""}. Tindakan
              ini tidak dapat dibatalkan. Tahun dengan data order tidak dapat
              dihapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Menghapus...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Hapus
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Year form dialog (create / edit)                                   */
/* ------------------------------------------------------------------ */

interface YearFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  existingYear?: SpjYearInfo | null;
  onChanged: () => void;
}

function YearFormDialog({
  open,
  onOpenChange,
  mode,
  existingYear,
  onChanged,
}: YearFormDialogProps) {
  const [yearInput, setYearInput] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  // Prime the form when dialog opens
  React.useEffect(() => {
    if (!open) return;
    if (mode === "edit" && existingYear) {
      setYearInput(String(existingYear.year));
      setLabel(existingYear.label ?? "");
      setIsActive(existingYear.isActive);
    } else {
      // Create mode — default to next year from current date
      setYearInput(String(new Date().getFullYear()));
      setLabel("");
      setIsActive(true);
    }
  }, [open, mode, existingYear]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    // Validate year
    const yearNum = parseInt(yearInput, 10);
    if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100) {
      toast.error("Tahun harus berupa integer antara 2000-2100");
      return;
    }

    setSaving(true);
    try {
      if (mode === "create") {
        await yearApi.create(yearNum, label || undefined);
        toast.success(`Tahun ${yearNum} dibuat`);
      } else if (existingYear) {
        await yearApi.update(existingYear.id, {
          label: label.trim() || null,
          isActive,
        });
        toast.success(`Tahun ${existingYear.year} diperbarui`);
      }
      onOpenChange(false);
      onChanged();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : mode === "create"
          ? "Gagal membuat tahun"
          : "Gagal memperbarui tahun";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  const isEdit = mode === "edit";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {isEdit ? "Edit Tahun" : "Tambah Tahun Baru"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Perbarui label atau status tahun. Tahun aktif akan tampil sebagai pilihan default."
              : "Tambahkan tahun baru untuk mengelompokkan data SPJ (mis. 2026, 2027)."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="year-input">Tahun</Label>
            <Input
              id="year-input"
              type="number"
              inputMode="numeric"
              min={2000}
              max={2100}
              step={1}
              value={yearInput}
              onChange={(e) => setYearInput(e.target.value)}
              disabled={saving || isEdit}
              placeholder="mis. 2026"
              autoFocus
            />
            {isEdit ? (
              <p className="text-[11px] text-muted-foreground">
                Tahun tidak dapat diubah setelah dibuat.
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Rentang yang diizinkan: 2000 – 2100.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="year-label">Label (opsional)</Label>
            <Input
              id="year-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={saving}
              placeholder="mis. Anggaran 2026 / Triwulan 1"
            />
          </div>

          {isEdit && (
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="pr-3">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  {isActive ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  Tahun Aktif
                </p>
                <p className="text-xs text-muted-foreground">
                  Tahun aktif tampil sebagai pilihan default di seluruh aplikasi.
                </p>
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={saving}
              />
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Batal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menyimpan...
                </>
              ) : isEdit ? (
                <>
                  <Pencil className="h-4 w-4" />
                  Simpan Perubahan
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Tambah Tahun
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

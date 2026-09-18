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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Loader2,
  UserCog,
  ShieldCheck,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { authApi } from "@/lib/auth-client";

interface Props {
  /** Notify parent to refresh any cached data (e.g. current user list). */
  onChanged: () => void;
}

interface UserRow {
  id: string;
  username: string;
  role: string;
  isActive: boolean;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * UserManagement — full CRUD UI for admin users.
 *
 * Features:
 *   - Search bar (search by username)
 *   - Table: username, role (badge), status (active/inactive badge),
 *     displayName, createdAt, actions (edit, toggle active, delete)
 *   - "Tambah User" button → create dialog (username, password, role, displayName)
 *   - Edit user → dialog with editable fields
 *   - Delete user → AlertDialog confirmation (last-admin guard handled server-side)
 *   - Toggle active/inactive with Switch (inline)
 *
 * The whole table is scrollable on small screens (overflow-x-auto).
 */
export function UserManagement({ onChanged }: Props) {
  // data
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");

  // dialog state
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<UserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<UserRow | null>(null);

  // optimistic toggle in-flight set (ids)
  const [toggling, setToggling] = React.useState<Set<string>>(new Set());

  // debounce search
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadUsers = React.useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const res = await authApi.listUsers(q);
      setUsers(res.users);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Gagal memuat daftar user";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadUsers(debouncedSearch || undefined);
  }, [debouncedSearch, loadUsers]);

  function refresh() {
    void loadUsers(debouncedSearch || undefined);
    onChanged();
  }

  async function handleToggleActive(user: UserRow) {
    // Optimistic update
    setUsers((prev) =>
      prev.map((u) =>
        u.id === user.id ? { ...u, isActive: !u.isActive } : u
      )
    );
    setToggling((prev) => new Set(prev).add(user.id));
    try {
      await authApi.updateUser(user.id, { isActive: !user.isActive });
      toast.success(
        `User "${user.username}" ${
          !user.isActive ? "diaktifkan" : "dinonaktifkan"
        }`
      );
      onChanged();
    } catch (err) {
      // rollback
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, isActive: user.isActive } : u
        )
      );
      const msg =
        err instanceof Error ? err.message : "Gagal mengubah status user";
      toast.error(msg);
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(user.id);
        return next;
      });
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await authApi.deleteUser(deleteTarget.id);
      toast.success(`User "${deleteTarget.username}" dihapus`);
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Gagal menghapus user";
      toast.error(msg);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: search + add button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Cari username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus className="h-4 w-4" />
          Tambah User
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="min-w-[140px]">Username</TableHead>
              <TableHead className="min-w-[110px]">Role</TableHead>
              <TableHead className="min-w-[120px]">Status</TableHead>
              <TableHead className="min-w-[160px]">Nama Tampilan</TableHead>
              <TableHead className="min-w-[140px]">Dibuat</TableHead>
              <TableHead className="min-w-[180px] text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={`s-${i}-${j}`}>
                      <Skeleton className="h-5 w-full max-w-[140px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <UserCog className="h-6 w-6" />
                    <span className="text-sm">
                      {debouncedSearch
                        ? `Tidak ada user yang cocok dengan "${debouncedSearch}"`
                        : "Belum ada user. Klik \"Tambah User\" untuk membuat."}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <span className="font-mono text-sm font-medium text-foreground">
                      {u.username}
                    </span>
                  </TableCell>
                  <TableCell>
                    {u.role === "admin" ? (
                      <Badge className="bg-primary/10 text-primary border-primary/20">
                        <ShieldCheck className="h-3 w-3" />
                        Admin
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <Shield className="h-3 w-3" />
                        User
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        u.isActive
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                      }
                    >
                      {u.isActive ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-foreground/80">
                      {u.displayName || (
                        <span className="text-muted-foreground italic">—</span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(u.createdAt)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Switch
                        checked={u.isActive}
                        onCheckedChange={() => handleToggleActive(u)}
                        disabled={toggling.has(u.id)}
                        aria-label="Toggle aktif"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setEditTarget(u)}
                        aria-label="Edit user"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteTarget(u)}
                        aria-label="Hapus user"
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

      {/* Create dialog */}
      <UserFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        onChanged={refresh}
      />

      {/* Edit dialog */}
      <UserFormDialog
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        mode="edit"
        existingUser={editTarget}
        onChanged={refresh}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus user?</AlertDialogTitle>
            <AlertDialogDescription>
              Anda akan menghapus user{" "}
              <strong className="text-foreground">
                {deleteTarget?.username}
              </strong>
              . Tindakan ini tidak dapat dibatalkan. Admin terakhir tidak dapat
              dihapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* User form dialog (create / edit)                                   */
/* ------------------------------------------------------------------ */

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  existingUser?: UserRow | null;
  onChanged: () => void;
}

function UserFormDialog({
  open,
  onOpenChange,
  mode,
  existingUser,
  onChanged,
}: UserFormDialogProps) {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState<"admin" | "user">("user");
  const [displayName, setDisplayName] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // Prime form when dialog opens
  React.useEffect(() => {
    if (!open) return;
    if (mode === "edit" && existingUser) {
      setUsername(existingUser.username);
      setPassword("");
      setRole(existingUser.role === "admin" ? "admin" : "user");
      setDisplayName(existingUser.displayName ?? "");
    } else {
      setUsername("");
      setPassword("");
      setRole("user");
      setDisplayName("");
    }
  }, [open, mode, existingUser]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    // Validation
    if (!username.trim()) {
      toast.error("Username wajib diisi");
      return;
    }
    if (mode === "create") {
      if (password.length < 6) {
        toast.error("Password minimal 6 karakter");
        return;
      }
    } else {
      // Edit mode: password optional, but if provided must be ≥6
      if (password && password.length < 6) {
        toast.error("Password baru minimal 6 karakter");
        return;
      }
    }

    setSaving(true);
    try {
      if (mode === "create") {
        await authApi.createUser({
          username: username.trim(),
          password,
          role,
          displayName: displayName.trim() || undefined,
        });
        toast.success(`User "${username.trim()}" dibuat`);
      } else if (existingUser) {
        const patch: {
          username?: string;
          password?: string;
          role?: string;
          displayName?: string;
        } = {
          username: username.trim(),
          role,
          displayName: displayName.trim() || "",
        };
        if (password) patch.password = password;
        await authApi.updateUser(existingUser.id, patch);
        toast.success(`User "${username.trim()}" diperbarui`);
      }
      onOpenChange(false);
      onChanged();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : mode === "create"
          ? "Gagal membuat user"
          : "Gagal memperbarui user";
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
            <UserCog className="h-4 w-4" />
            {isEdit ? "Edit User" : "Tambah User Baru"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Perbarui informasi user. Kosongkan password jika tidak ingin mengubahnya."
              : "Isi data user baru. Password minimal 6 karakter."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="user-username">Username</Label>
            <Input
              id="user-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={saving}
              placeholder="contoh: budi"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-password">
              {isEdit ? "Password Baru (opsional)" : "Password"}
            </Label>
            <Input
              id="user-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={saving}
              placeholder={
                isEdit ? "Kosongkan jika tidak diubah" : "Min. 6 karakter"
              }
              autoComplete={isEdit ? "new-password" : "new-password"}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-role">Role</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as "admin" | "user")}
              disabled={saving}
            >
              <SelectTrigger id="user-role" className="w-full">
                <SelectValue placeholder="Pilih role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-display-name">Nama Tampilan (opsional)</Label>
            <Input
              id="user-display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={saving}
              placeholder="contoh: Budi Santoso"
            />
          </div>

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
                  Tambah User
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

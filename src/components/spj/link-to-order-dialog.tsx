"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, Link2, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { spjApi, type OrderListItem } from "@/lib/spj-api";

interface Props {
  photoId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
  currentLinkedOrderIds: string[];
}

/**
 * Dialog for linking a documentation photo to one or more orders.
 *
 * Multi-select combobox using shadcn Command (cmdk). User can search by:
 *   - No Pesanan (e.g. "01", "45")  → startsWith
 *   - BKU (e.g. "BPU01", "BNU37")   → startsWith
 *   - Uraian / toko / kategori      → contains (only if query has letters)
 *
 * Currently linked orders are pre-checked when the dialog opens.
 * Clicking an item toggles its selection without closing the dialog.
 *
 * On confirm → spjApi.linkPhotoToOrders(photoId, selectedIds).
 */
export function LinkToOrderDialog({
  photoId,
  open,
  onOpenChange,
  onChanged,
  currentLinkedOrderIds,
}: Props) {
  const [orders, setOrders] = React.useState<OrderListItem[]>([]);
  const [ordersLoading, setOrdersLoading] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(
    new Set()
  );
  const [search, setSearch] = React.useState("");
  const [linking, setLinking] = React.useState(false);

  // Load all 208 orders. The /api/orders endpoint caps pageSize at 100,
  // so we loop through pages until we have everything.
  const loadOrders = React.useCallback(async () => {
    setOrdersLoading(true);
    try {
      const first = await spjApi.listOrders({
        status: "all",
        page: 1,
        pageSize: 100,
      });
      let all = first.orders;
      let nextPage = 2;
      while (all.length < first.total && nextPage <= first.totalPages) {
        const res = await spjApi.listOrders({
          status: "all",
          page: nextPage,
          pageSize: 100,
        });
        all = all.concat(res.orders);
        nextPage++;
      }
      setOrders(all);
    } catch (e) {
      console.error(e);
      toast.error("Gagal memuat daftar pesanan");
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  // Prime state when dialog opens
  React.useEffect(() => {
    if (open) {
      setSelectedIds(new Set(currentLinkedOrderIds));
      setSearch("");
      void loadOrders();
    }
  }, [open, currentLinkedOrderIds, loadOrders]);

  // Filter orders based on search query (same logic as report-dialog)
  const filtered = React.useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.toLowerCase().trim();
    const isNumericQuery = /^\d+$/.test(q);
    return orders.filter((o) => {
      const noP = o.noPesanan.toLowerCase();
      const bku = o.noBku.toLowerCase();
      if (noP.startsWith(q)) return true;
      if (bku.startsWith(q)) return true;
      if (!isNumericQuery) {
        const uraian = (o.uraianKegiatan ?? "").toLowerCase();
        const toko = (o.namaToko ?? "").toLowerCase();
        const kat = (o.kategoriBelanja ?? "").toLowerCase();
        if (uraian.includes(q)) return true;
        if (toko.includes(q)) return true;
        if (kat.includes(q)) return true;
      }
      return false;
    });
  }, [orders, search]);

  function toggleOrder(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleLink() {
    if (selectedIds.size === 0) {
      toast.error("Pilih minimal satu pesanan");
      return;
    }
    setLinking(true);
    try {
      const ids = Array.from(selectedIds);
      const result = await spjApi.linkPhotoToOrders(photoId, ids);
      toast.success(
        `Foto berhasil dihubungkan ke ${result.linked} pesanan${
          result.skipped > 0
            ? ` (${result.skipped} sudah terhubung sebelumnya)`
            : ""
        }`
      );
      onOpenChange(false);
      onChanged();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Gagal menghubungkan foto";
      toast.error(msg);
    } finally {
      setLinking(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Hubungkan Foto ke Pesanan
          </DialogTitle>
          <DialogDescription>
            Pilih satu atau beberapa No. Pesanan. Foto akan tampil di laporan
            semua pesanan yang dipilih. Pesanan yang sudah terhubung ditandai
            dengan tanda centang.
          </DialogDescription>
        </DialogHeader>

        {/* Selected count + clear button */}
        <div className="flex items-center justify-between gap-2">
          <Badge variant={selectedIds.size > 0 ? "default" : "secondary"}>
            {selectedIds.size} pesanan dipilih
          </Badge>
          {selectedIds.size > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={clearSelection}
              disabled={linking}
            >
              Kosongkan pilihan
            </Button>
          )}
        </div>

        {/* Command: searchable multi-select */}
        <Command
          shouldFilter={false}
          className="rounded-md border"
        >
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandInput
              placeholder="Ketik: 01, BPU01, atau nama kegiatan..."
              className="h-9 flex-1 bg-transparent outline-none placeholder:text-muted-foreground text-sm"
              value={search}
              onValueChange={setSearch}
            />
          </div>
          <CommandList
            className="scrollbar-thin"
            style={{
              maxHeight: "300px",
              overflowY: "auto",
              overscrollBehavior: "contain",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <CommandEmpty>
              {ordersLoading
                ? "Memuat data pesanan..."
                : search.trim()
                ? `Tidak ada hasil untuk "${search}"`
                : "Mulai ketik untuk mencari..."}
            </CommandEmpty>
            <CommandGroup>
              {filtered.map((o) => {
                const checked = selectedIds.has(o.id);
                return (
                  <CommandItem
                    key={o.id}
                    value={o.id}
                    onSelect={() => toggleOrder(o.id)}
                    className="flex items-start gap-2 py-2"
                  >
                    <div
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${
                        checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input opacity-70"
                      }`}
                    >
                      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-primary text-sm">
                          #{o.noPesanan}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          BKU: {o.noBku}
                        </span>
                        {o.photoCount > 0 && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                            {o.photoCount} foto
                          </span>
                        )}
                      </div>
                      {o.uraianKegiatan && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {o.uraianKegiatan}
                        </p>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={linking}
          >
            Batal
          </Button>
          <Button
            onClick={handleLink}
            disabled={linking || selectedIds.size === 0}
          >
            {linking ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Menghubungkan...
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4 mr-2" />
                {selectedIds.size > 0
                  ? `Hubungkan ke ${selectedIds.size} Pesanan`
                  : "Hubungkan"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

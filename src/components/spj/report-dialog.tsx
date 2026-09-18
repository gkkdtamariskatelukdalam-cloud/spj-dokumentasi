"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Card, CardContent } from "@/components/ui/card";
import {
  Printer,
  FileText,
  Loader2,
  FileStack,
  Hash,
  Building2,
  Image as ImageIcon,
  Check,
  ChevronsUpDown,
  Search,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { spjApi, type OrderListItem } from "@/lib/spj-api";

type ReportMode = "all" | "order" | "bku";
type ReportFormat = "full" | "lampiran";

interface Props {
  /** When provided, dialog opens with this order pre-selected in "order" mode */
  defaultOrderId?: string;
  /** Trigger button variant */
  triggerVariant?: "default" | "outline" | "ghost" | "secondary" | "destructive";
  triggerLabel?: string;
  triggerSize?: "default" | "sm" | "lg" | "icon";
  triggerIcon?: "printer" | "stack";
  /**
   * Active year filter for the report. Pass a specific year id to scope the
   * report to that year, or undefined/"all" to include all years.
   */
  yearId?: string;
}

export function ReportDialog({
  defaultOrderId,
  triggerVariant = "outline",
  triggerLabel = "Cetak Laporan",
  triggerSize = "sm",
  triggerIcon = "printer",
  yearId,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<ReportMode>("all");
  // Default format = "lampiran" (Lampiran Gambar BAST) sesuai permintaan user.
  // Format "full" (Laporan SPJ lengkap) tersedia sebagai opsi alternatif.
  const [format, setFormat] = React.useState<ReportFormat>("lampiran");
  const [orders, setOrders] = React.useState<OrderListItem[]>([]);
  const [ordersLoading, setOrdersLoading] = React.useState(false);
  const [selectedOrderId, setSelectedOrderId] = React.useState<string>("");
  const [bkuSearch, setBkuSearch] = React.useState<string>("");
  const [includePhotos, setIncludePhotos] = React.useState(true);
  const [includeItems, setIncludeItems] = React.useState(true);
  const [generating, setGenerating] = React.useState(false);
  // Date range filter (for mode=all)
  const [startDate, setStartDate] = React.useState<string>("");
  const [endDate, setEndDate] = React.useState<string>("");

  // Load all orders for the searchable dropdown (mode=order)
  // Fetch all 208 orders so user can search any of them.
  const loadOrders = React.useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res = await spjApi.listOrders({
        status: "all",
        page: 1,
        pageSize: 100,
      });
      setOrders(res.orders);
    } catch (e) {
      console.error(e);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  // When dialog opens
  React.useEffect(() => {
    if (open) {
      void loadOrders();
      if (defaultOrderId) {
        setMode("order");
        setSelectedOrderId(defaultOrderId);
      }
    }
  }, [open, loadOrders, defaultOrderId]);

  function handleGenerate() {
    // Validate
    if (mode === "order" && !selectedOrderId) {
      toast.error("Pilih No. Pesanan terlebih dahulu");
      return;
    }
    if (mode === "bku" && !bkuSearch.trim()) {
      toast.error("Masukkan kode BKU (BPU/BNU) terlebih dahulu");
      return;
    }

    // Check if selected order has photos (for lampiran format)
    if (format === "lampiran" && mode === "order" && selectedOrderId) {
      const selectedOrder = orders.find((o) => o.id === selectedOrderId);
      if (selectedOrder && selectedOrder.photoCount === 0) {
        toast.error(
          `Order #${selectedOrder.noPesanan} belum punya foto. Upload foto dulu sebelum cetak lampiran BAST.`,
          { duration: 6000 }
        );
        return;
      }
    }

    // Build URL
    const params = new URLSearchParams();
    params.set("mode", mode);
    params.set("format", format);
    if (mode === "order") {
      params.set("orderId", selectedOrderId);
    } else if (mode === "bku") {
      params.set("bku", bkuSearch.trim());
    }
    // Date range filter (optional, for mode=all)
    if (mode === "all" && startDate) params.set("startDate", startDate);
    if (mode === "all" && endDate) params.set("endDate", endDate);
    // For lampiran format, photos are always included (it's photo-only);
    // items toggle is ignored. For full format, respect toggles.
    if (format === "full") {
      params.set("includePhotos", includePhotos ? "1" : "0");
      params.set("includeItems", includeItems ? "1" : "0");
    }
    // Scope report to active year (when in "specific year" mode)
    if (yearId && yearId !== "all") params.set("yearId", yearId);

    const url = `/api/report?${params.toString()}`;
    setGenerating(true);

    // Open in new tab/window — the report HTML auto-triggers print()
    const win = window.open(url, "_blank");
    if (!win) {
      toast.error(
        "Popup diblokir browser. Izinkan popup untuk situs ini lalu coba lagi."
      );
      setGenerating(false);
      return;
    }

    // Show success toast. Capture the toast ID so we can manually dismiss it.
    // Why manual dismiss: when window.open() steals focus to the new tab,
    // the parent window blurs and Sonner PAUSES its auto-dismiss timer.
    // Without manual dismiss, the toast would stay forever until the user
    // comes back. setTimeout keeps running (throttled, but still fires)
    // even when the tab is hidden, so this guarantees dismissal after 4s.
    const toastId = toast.success(
      "Laporan dibuka di tab baru. Gunakan dialog cetak browser."
    );
    if (typeof toastId === "string" || typeof toastId === "number") {
      window.setTimeout(() => {
        try {
          toast.dismiss(toastId);
        } catch {
          /* ignore */
        }
      }, 4000);
    }

    setOpen(false);
    setGenerating(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize}>
          {triggerIcon === "stack" ? (
            <FileStack className="h-4 w-4 mr-2" />
          ) : (
            <Printer className="h-4 w-4 mr-2" />
          )}
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cetak / Download PDF Laporan SPJ</DialogTitle>
          <DialogDescription>
            Pilih mode laporan. Hasil akan dibuka di tab baru dan otomatis
            menampilkan dialog cetak browser — pilih <strong>"Save as PDF"</strong>{" "}
            untuk download, atau pilih printer untuk cetak langsung.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto scrollbar-thin">
          {/* Format selection */}
          <div className="space-y-2">
            <Label>Format Laporan</Label>
            <div className="grid grid-cols-2 gap-2">
              <FormatCard
                active={format === "full"}
                onClick={() => setFormat("full")}
                icon={FileText}
                label="Laporan Lengkap"
                desc="Data + tabel + foto"
              />
              <FormatCard
                active={format === "lampiran"}
                onClick={() => setFormat("lampiran")}
                icon={ImageIcon}
                label="Lampiran Gambar BAST"
                desc="Hanya foto (sesuai format BAST)"
              />
            </div>
          </div>

          {/* Mode selection */}
          <div className="space-y-2">
            <Label>Mode Laporan</Label>
            <div className="grid grid-cols-3 gap-2">
              <ModeCard
                active={mode === "all"}
                onClick={() => setMode("all")}
                icon={FileStack}
                label="Semua"
                desc="Semua No Pesanan"
              />
              <ModeCard
                active={mode === "order"}
                onClick={() => setMode("order")}
                icon={Hash}
                label="Per Pesanan"
                desc="Pilih nomor"
              />
              <ModeCard
                active={mode === "bku"}
                onClick={() => setMode("bku")}
                icon={Building2}
                label="Per BKU"
                desc="BPU/BNU"
              />
            </div>
          </div>

          {/* Mode-specific input */}
          {mode === "order" && (
            <div className="space-y-2">
              <Label>Cari & Pilih No. Pesanan</Label>
              <ComboboxOrderPicker
                orders={orders}
                loading={ordersLoading}
                value={selectedOrderId}
                onChange={setSelectedOrderId}
              />
              <p className="text-xs text-muted-foreground">
                💡 Ketik untuk mencari — bisa by No Pesanan (01, 02), BKU (BPU01, BNU37), atau uraian kegiatan.
              </p>
            </div>
          )}

          {mode === "bku" && (
            <div className="space-y-2">
              <Label htmlFor="bku-input">Kode BKU (BPU/BNU)</Label>
              <Input
                id="bku-input"
                placeholder="Contoh: BPU04, BNU37, atau ketik 'BPU' untuk semua BPU"
                value={bkuSearch}
                onChange={(e) => setBkuSearch(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Pencarian bersifat <strong>contains</strong> — ketik{" "}
                <code className="bg-muted px-1 rounded">BPU</code> untuk semua
                BPU, atau <code className="bg-muted px-1 rounded">BNU</code>{" "}
                untuk semua BNU.
              </p>
            </div>
          )}

          {mode === "all" && (
            <div className="space-y-3">
              <Card className="bg-muted/40">
                <CardContent className="p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">
                    📄 Laporan Lengkap
                  </p>
                  Akan mencetak <strong>208 No. Pesanan</strong> dengan cover
                  page, daftar isi, dan halaman terpisah per order. Estimasi{" "}
                  <strong>200+ halaman</strong> jika semua foto disertakan.
                </CardContent>
              </Card>
              {/* Date range filter */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="start-date" className="text-xs text-muted-foreground">
                    Dari Tanggal Pesanan
                  </Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="end-date" className="text-xs text-muted-foreground">
                    Sampai Tanggal Pesanan
                  </Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>
              {(startDate || endDate) && (
                <p className="text-xs text-muted-foreground">
                  📅 Filter aktif: {startDate || "awal"} → {endDate || "akhir"}
                  {" "}
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => { setStartDate(""); setEndDate(""); }}
                  >
                    Hapus filter
                  </button>
                </p>
              )}
            </div>
          )}

          {/* Options — only relevant for full format */}
          {format === "full" && (
          <div className="space-y-3 pt-2 border-t">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Konten Laporan
            </Label>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="pr-3">
                <p className="text-sm font-medium">Sertakan Foto Dokumentasi</p>
                <p className="text-xs text-muted-foreground">
                  Tampilkan foto di setiap halaman order (mempengaruhi ukuran
                  PDF)
                </p>
              </div>
              <Switch
                checked={includePhotos}
                onCheckedChange={setIncludePhotos}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="pr-3">
                <p className="text-sm font-medium">Sertakan Daftar Barang</p>
                <p className="text-xs text-muted-foreground">
                  Tampilkan tabel item dengan harga dan jumlah
                </p>
              </div>
              <Switch
                checked={includeItems}
                onCheckedChange={setIncludeItems}
              />
            </div>
          </div>
          )}
        </div>

        <DialogFooter>
          {/* Info: show photo count for selected order (lampiran format) */}
          {format === "lampiran" && mode === "order" && selectedOrderId && (() => {
            const o = orders.find((x) => x.id === selectedOrderId);
            if (!o) return null;
            return (
              <div className={`text-xs flex items-center gap-1.5 mr-auto ${o.photoCount === 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                {o.photoCount === 0 ? (
                  <>
                    <AlertCircle className="h-3.5 w-3.5" />
                    Belum ada foto — upload dulu
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {o.photoCount} foto siap dicetak
                  </>
                )}
              </div>
            );
          })()}
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={generating}
          >
            Batal
          </Button>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Menyiapkan...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 mr-2" />
                Generate &amp; Cetak
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormatCard({
  active,
  onClick,
  icon: Icon,
  label,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-2 rounded-md border p-3 text-left transition-all ${
        active
          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
          : "border-border hover:border-primary/40 hover:bg-muted/50"
      }`}
    >
      <Icon
        className={`h-5 w-5 shrink-0 mt-0.5 ${active ? "text-primary" : "text-muted-foreground"}`}
      />
      <div className="min-w-0">
        <p className={`text-xs font-medium ${active ? "text-primary" : ""}`}>{label}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </button>
  );
}

function ModeCard({
  active,
  onClick,
  icon: Icon,
  label,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-md border p-3 text-center transition-all ${
        active
          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
          : "border-border hover:border-primary/40 hover:bg-muted/50"
      }`}
    >
      <Icon
        className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`}
      />
      <span className="text-xs font-medium">{label}</span>
      <span className="text-[10px] text-muted-foreground">{desc}</span>
    </button>
  );
}

/**
 * Searchable combobox for picking an order.
 * User can type to search by:
 *   - No Pesanan (e.g. "01", "45", "101")
 *   - BKU (e.g. "BPU01", "BNU37")
 *   - Uraian kegiatan (e.g. "Air Mineral", "Plastik")
 *
 * Uses shadcn Command (cmdk) + Popover pattern.
 */
function ComboboxOrderPicker({
  orders,
  loading,
  value,
  onChange,
}: {
  orders: OrderListItem[];
  loading: boolean;
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const selectedOrder = orders.find((o) => o.id === value);

  // Filter orders based on search query (case-insensitive)
  // Search logic:
  //   - If query is all digits (e.g. "01", "45"): ONLY search noPesanan & noBku
  //     with startsWith — so "01" only matches #01, not #101 or #34 (which
  //     happens to have "01" in its uraian text like a NIK number).
  //   - If query contains letters (e.g. "BPU01", "Air Mineral"): search all
  //     fields — noPesanan/noBku with startsWith, uraian/toko/kategori with includes.
  const filtered = React.useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.toLowerCase().trim();
    const isNumericQuery = /^\d+$/.test(q);
    return orders.filter((o) => {
      const noP = o.noPesanan.toLowerCase();
      const bku = o.noBku.toLowerCase();
      // Code fields: always use startsWith (prefix match)
      if (noP.startsWith(q)) return true;
      if (bku.startsWith(q)) return true;
      // Text fields: only search if query contains letters
      // (prevents "01" from matching NIK numbers in uraian like "1558776677230122")
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

  // Track trigger width so popover matches it (CSS var doesn't work in portal)
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [triggerWidth, setTriggerWidth] = React.useState<number>(0);
  React.useLayoutEffect(() => {
    if (open && triggerRef.current) {
      setTriggerWidth(triggerRef.current.offsetWidth);
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Memuat data...
            </>
          ) : selectedOrder ? (
            <span className="truncate">
              <span className="font-mono font-semibold text-primary">
                #{selectedOrder.noPesanan}
              </span>
              <span className="text-muted-foreground ml-2">
                BKU: {selectedOrder.noBku}
              </span>
              {selectedOrder.uraianKegiatan && (
                <span className="text-muted-foreground ml-2 truncate">
                  — {selectedOrder.uraianKegiatan.substring(0, 40)}
                  {selectedOrder.uraianKegiatan.length > 40 ? "..." : ""}
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">
              Cari No Pesanan, BKU, atau uraian...
            </span>
          )}
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        align="start"
        style={{
          width: triggerWidth > 0 ? `${triggerWidth}px` : "100%",
          maxWidth: "500px",
        }}
      >
        <Command shouldFilter={false} className="w-full">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandInput
              placeholder="Ketik: 01, BPU01, atau nama kegiatan..."
              className="h-9 flex-1 bg-transparent outline-none placeholder:text-muted-foreground text-sm"
              value={search}
              onValueChange={setSearch}
            />
          </div>
          {/* CommandList with explicit scroll styles — ensure mouse wheel works.
              Use inline style for overflowY to override any parent constraints.
              overscroll-behavior: contain prevents scroll from propagating to body. */}
          <CommandList
            className="scrollbar-thin"
            style={{
              maxHeight: "280px",
              overflowY: "auto",
              overscrollBehavior: "contain",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <CommandEmpty>
              {search.trim()
                ? `Tidak ada hasil untuk "${search}"`
                : "Mulai ketik untuk mencari..."}
            </CommandEmpty>
            <CommandGroup>
              {filtered.map((o) => (
                <CommandItem
                  key={o.id}
                  value={o.id}
                  onSelect={() => {
                    onChange(o.id);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="flex items-start gap-2 py-2"
                >
                  <Check
                    className={`h-4 w-4 shrink-0 mt-0.5 ${
                      value === o.id ? "opacity-100" : "opacity-0"
                    }`}
                  />
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
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

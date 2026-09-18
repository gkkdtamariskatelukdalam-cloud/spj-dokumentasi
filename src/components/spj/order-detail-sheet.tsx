"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Store,
  MapPin,
  Phone,
  Calendar,
  FileText,
  Tag,
  Hash,
  Camera,
  Package,
  Loader2,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import {
  spjApi,
  formatRupiah,
  formatDate,
  type OrderDetail,
} from "@/lib/spj-api";
import { PhotoUpload } from "./photo-upload";
import { PhotoGrid } from "./photo-grid";
import { ReportDialog } from "./report-dialog";

interface Props {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void; // notify parent to refresh list/stats
}

export function OrderDetailSheet({
  orderId,
  open,
  onOpenChange,
  onChanged,
}: Props) {
  const [order, setOrder] = React.useState<OrderDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  // Track whether any photos were uploaded/deleted during this sheet session.
  // When the sheet closes, if dirty, we notify the parent to refresh dashboard.
  const dirtyRef = React.useRef(false);

  const load = React.useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const res = await spjApi.getOrder(orderId);
      setOrder(res.order);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  React.useEffect(() => {
    if (open && orderId) {
      dirtyRef.current = false; // reset dirty flag on open
      void load();
    } else if (!open) {
      // When closing: if photos changed during this session, refresh dashboard.
      if (dirtyRef.current) {
        onChanged();
      }
      dirtyRef.current = false;
      setOrder(null);
    }
  }, [open, orderId, load, onChanged]);

  function handlePhotoChanged() {
    dirtyRef.current = true;
    void load();
    onChanged(); // live-refresh dashboard behind the sheet
  }

  const statusBadge = order
    ? order.status === "complete"
      ? { label: "Lengkap", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" }
      : order.status === "incomplete"
      ? { label: "Kurang (1 foto)", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800" }
      : { label: "Belum ada foto", cls: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800" }
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl md:max-w-3xl p-0 gap-0 flex flex-col"
      >
        <SheetHeader className="p-4 border-b space-y-2">
          {/* Always render SheetTitle for accessibility, even during loading */}
          <SheetTitle className="sr-only">
            Detail Pesanan {order?.noPesanan ?? ""}
          </SheetTitle>
          {loading || !order ? (
            <>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-60" />
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="text-left">
                  <span className="font-mono text-primary font-semibold">
                    #{order.noPesanan}
                  </span>
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    BKU: <span className="font-mono">{order.noBku}</span>
                  </span>
                </div>
                {statusBadge && (
                  <Badge variant="outline" className={statusBadge.cls}>
                    {statusBadge.label}
                  </Badge>
                )}
              </div>
              <SheetDescription className="text-left line-clamp-2">
                {order.uraianKegiatan ?? "(tanpa uraian)"}
              </SheetDescription>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
                <span className="inline-flex items-center gap-1">
                  <Package className="h-3.5 w-3.5" />
                  {order.items.length} barang
                </span>
                <span className="inline-flex items-center gap-1">
                  <Camera className="h-3.5 w-3.5" />
                  {order.photos.length} foto
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => {
                    dirtyRef.current = true;
                    void load();
                    onChanged();
                  }}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Refresh
                </Button>
              </div>
            </>
          )}
        </SheetHeader>

        {/* flex-1 + min-h-0 = the KEY to making native overflow scroll work inside flex column */}
        <div className="flex-1 min-h-0 flex flex-col">
          {loading || !order ? (
            <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Tabs defaultValue="photos" className="flex-1 min-h-0 flex flex-col">
              <div className="px-4 pt-3 pb-2 border-b shrink-0">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="photos">
                    <Camera className="h-4 w-4 mr-1.5" />
                    Foto ({order.photos.length})
                  </TabsTrigger>
                  <TabsTrigger value="details">
                    <FileText className="h-4 w-4 mr-1.5" />
                    Detail
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Scrollable tab content. Native overflow is more reliable than radix ScrollArea inside flex. */}
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
                <TabsContent value="photos" className="p-4 m-0 space-y-4 mt-0">
                  {/* upload section */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold">
                        Upload / Ambil Foto
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        Min. 2 foto
                      </span>
                    </div>
                    <PhotoUpload
                      orderId={order.id}
                      onUploaded={handlePhotoChanged}
                      photoCount={order.photos.length}
                    />
                  </div>

                  <Separator />

                  {/* existing photos */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2">
                      Foto Dokumentasi ({order.photos.length})
                    </h3>
                    <PhotoGrid
                      photos={order.photos}
                      onChanged={handlePhotoChanged}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="details" className="p-4 m-0 space-y-4 mt-0">
                  {/* meta info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InfoRow
                      icon={Calendar}
                      label="Tgl Pesanan"
                      value={formatDate(order.tanggalPesanan)}
                    />
                    <InfoRow
                      icon={Calendar}
                      label="Tgl BAST"
                      value={formatDate(order.tanggalBast)}
                    />
                    <InfoRow
                      icon={Calendar}
                      label="Tgl Bayar"
                      value={formatDate(order.tanggalBayar)}
                    />
                    <InfoRow
                      icon={Tag}
                      label="Kategori"
                      value={order.kategoriBelanja}
                    />
                    <InfoRow
                      icon={Hash}
                      label="Kode Program"
                      value={order.kodeProgram}
                    />
                    <InfoRow
                      icon={Hash}
                      label="Kode Rekening"
                      value={order.kodeRekening}
                    />
                    <InfoRow
                      icon={Store}
                      label="Nama Toko"
                      value={order.namaToko}
                    />
                    <InfoRow
                      icon={Phone}
                      label="No HP"
                      value={order.noHp}
                    />
                  </div>

                  {order.alamatToko && (
                    <InfoRow
                      icon={MapPin}
                      label="Alamat Toko"
                      value={order.alamatToko}
                      full
                    />
                  )}
                  {order.direkturToko && (
                    <InfoRow
                      icon={Store}
                      label="Direktur Toko"
                      value={order.direkturToko}
                      full
                    />
                  )}

                  <Separator />

                  {/* items list — inner table scrolls horizontally; vertical scroll follows the outer pane */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2">
                      Daftar Barang ({order.items.length})
                    </h3>
                    <div className="rounded-md border overflow-hidden">
                      <div className="overflow-x-auto scrollbar-thin-2">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/50 sticky top-0 z-[1]">
                            <tr>
                              <th className="text-left p-2 font-medium">No</th>
                              <th className="text-left p-2 font-medium min-w-[180px]">
                                Nama Barang
                              </th>
                              <th className="text-right p-2 font-medium">Vol</th>
                              <th className="text-left p-2 font-medium">Sat</th>
                              <th className="text-right p-2 font-medium">
                                Harga
                              </th>
                              <th className="text-right p-2 font-medium">
                                Jumlah
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {order.items.map((it, idx) => (
                              <tr
                                key={it.id}
                                className="border-t hover:bg-muted/30"
                              >
                                <td className="p-2 text-muted-foreground">
                                  {idx + 1}
                                </td>
                                <td className="p-2 align-top">
                                  <div className="font-medium">
                                    {it.namaBarang}
                                  </div>
                                  {it.spesifikasi && (
                                    <div className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
                                      {it.spesifikasi}
                                    </div>
                                  )}
                                </td>
                                <td className="p-2 text-right tabular-nums">
                                  {it.volume ?? "-"}
                                </td>
                                <td className="p-2">{it.satuan ?? "-"}</td>
                                <td className="p-2 text-right tabular-nums whitespace-nowrap">
                                  {formatRupiah(it.hargaSatuan)}
                                </td>
                                <td className="p-2 text-right tabular-nums whitespace-nowrap font-medium">
                                  {formatRupiah(it.jumlah)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          )}
        </div>

        <SheetFooter className="border-t p-3 gap-2 shrink-0">
          <div className="flex items-center justify-between gap-2 w-full">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Tutup
            </Button>
            <div className="flex items-center gap-2">
              {order && order.photos.length > 0 && (
                <Button
                  variant="default"
                  onClick={() => onOpenChange(false)}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  Selesai ({order.photos.length} foto tersimpan)
                </Button>
              )}
              {order && (
                <ReportDialog
                  defaultOrderId={order.id}
                  triggerVariant={order.photos.length > 0 ? "outline" : "default"}
                  triggerLabel="Cetak Pesanan Ini"
                  triggerSize="sm"
                  triggerIcon="printer"
                />
              )}
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  full,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null | undefined;
  full?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-2 rounded-md border p-2.5 ${
        full ? "col-span-full" : ""
      }`}
    >
      <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-sm break-words">{value || "-"}</p>
      </div>
    </div>
  );
}

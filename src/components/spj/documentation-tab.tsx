"use client";

import * as React from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Camera,
  UploadCloud,
  Loader2,
  Search,
  Trash2,
  Link2,
  ImagePlus,
  CheckCircle2,
  AlertCircle,
  Inbox,
} from "lucide-react";
import { toast } from "sonner";
import {
  spjApi,
  formatFileSize,
  type DocumentationPhoto,
} from "@/lib/spj-api";
import { useDevice } from "@/hooks/use-device";
import { LinkToOrderDialog } from "./link-to-order-dialog";

const PAGE_SIZE = 24;
type StatusFilter = "all" | "used" | "unused";

interface Props {
  /** Optional callback to refresh parent stats/orders after upload/link/unlink/delete */
  onChanged?: () => void;
  /**
   * Optional active year filter. Pass the active year id (specific year) to
   * scope list + uploads to that year. Pass undefined or "all" for all years.
   */
  yearId?: string;
}

/**
 * DocumentationTab — photo library with many-to-many relationship to orders.
 *
 * Layout:
 *   - Upload area (device-aware: drag&drop on desktop, camera+gallery on mobile)
 *   - Search bar + status filter dropdown
 *   - Photo gallery grid (responsive 2/3/4 cols)
 *   - Pagination
 *
 * Each photo card:
 *   - Thumbnail (square, object-cover)
 *   - Status badge (rose: "Belum digunakan" / emerald: "Digunakan untuk #X, #Y")
 *   - fileName + size + date
 *   - Hover action buttons: "Hubungkan ke Pesanan" + "Hapus"
 *
 * Clicking the card opens LinkToOrderDialog.
 * Delete uses AlertDialog confirmation.
 */
export function DocumentationTab({ onChanged, yearId }: Props) {
  const { device, isMobile, mounted } = useDevice();

  // file inputs (laptop drag&drop, mobile camera, mobile gallery)
  const laptopInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const galleryInputRef = React.useRef<HTMLInputElement>(null);

  // data
  const [photos, setPhotos] = React.useState<DocumentationPhoto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);

  // filter state
  const [q, setQ] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [page, setPage] = React.useState(1);

  // upload state
  const [uploading, setUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<{ current: number; total: number } | null>(null);
  const [dragging, setDragging] = React.useState(false);

  // dialog state
  const [linkDialogPhoto, setLinkDialogPhoto] =
    React.useState<DocumentationPhoto | null>(null);
  const [toDelete, setToDelete] = React.useState<DocumentationPhoto | null>(
    null
  );
  const [deleting, setDeleting] = React.useState(false);

  const debouncedQ = React.useDeferredValue(q);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await spjApi.listDocumentation({
        q: debouncedQ,
        status: statusFilter,
        page,
        pageSize: PAGE_SIZE,
        yearId,
      });
      setPhotos(res.photos);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (e) {
      console.error(e);
      toast.error("Gagal memuat foto dokumentasi");
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, statusFilter, page, yearId]);

  // reset to page 1 when filters change (including yearId)
  React.useEffect(() => {
    setPage(1);
  }, [debouncedQ, statusFilter, yearId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  function notifyParent() {
    if (onChanged) onChanged();
  }

  async function doUpload(
    files: FileList | File[],
    opts?: { deviceType: string; source?: string }
  ) {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setUploading(true);
    setUploadProgress({ current: 0, total: arr.length });

    // Chunked upload: Vercel payload limit is 4.5MB total.
    // Upload 5 photos per batch to stay under the limit.
    // Each photo max 4MB → 5 photos = max 20MB... but compressed photos are ~200KB
    // so 5 photos = ~1MB per batch — well within Vercel's 4.5MB limit.
    // For 100+ photos: 20 batches × ~1MB each = sequential upload, no payload issue.
    const BATCH_SIZE = 5;
    let totalUploaded = 0;
    let totalErrors: string[] = [];

    try {
      for (let i = 0; i < arr.length; i += BATCH_SIZE) {
        const batch = arr.slice(i, i + BATCH_SIZE);
        setUploadProgress({ current: i, total: arr.length });

        try {
          const result = await spjApi.uploadDocumentation(batch, {
            deviceType: opts?.deviceType ?? "upload",
            source: opts?.source ?? device,
            yearId,
          });
          totalUploaded += result.count;
          totalErrors = totalErrors.concat(result.errors);
        } catch (batchErr) {
          // If batch fails (e.g., payload too large), try 1-by-1
          for (const f of batch) {
            try {
              const result = await spjApi.uploadDocumentation([f], {
                deviceType: opts?.deviceType ?? "upload",
                source: opts?.source ?? device,
                yearId,
              });
              totalUploaded += result.count;
              totalErrors = totalErrors.concat(result.errors);
            } catch (singleErr) {
              totalErrors.push(`${f.name}: ${singleErr instanceof Error ? singleErr.message : "gagal"}`);
            }
          }
        }
      }

      setUploadProgress({ current: arr.length, total: arr.length });

      if (totalUploaded > 0) {
        toast.success(`${totalUploaded} foto berhasil diunggah`);
      }
      if (totalErrors.length > 0) {
        toast.error(`${totalErrors.length} file gagal: ${totalErrors[0]}`);
      }
      setPage(1);
      void refresh();
      notifyParent();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal upload foto";
      toast.error(msg);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  // Laptop handlers
  function handleLaptopChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      void doUpload(e.target.files, {
        deviceType: "upload",
        source: "laptop",
      });
      e.target.value = "";
    }
  }
  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      void doUpload(files, { deviceType: "upload", source: "laptop" });
    }
  }

  // Mobile handlers
  function handleCameraChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      void doUpload(e.target.files, { deviceType: "camera", source: device });
      e.target.value = "";
    }
  }
  function handleGalleryChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      void doUpload(e.target.files, { deviceType: "upload", source: device });
      e.target.value = "";
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await spjApi.deleteDocumentation(toDelete.id);
      toast.success("Foto dihapus");
      setToDelete(null);
      void refresh();
      notifyParent();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal menghapus";
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  }

  function handleLinkDialogChanged() {
    void refresh();
    notifyParent();
  }

  // Hidden file inputs (rendered both in mobile and desktop modes)
  const hiddenInputs = (
    <>
      <input
        ref={laptopInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleLaptopChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={handleCameraChange}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleGalleryChange}
      />
    </>
  );

  return (
    <div className="space-y-4">
      {/* ===== Upload area ===== */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        {!mounted ? (
          // SSR placeholder — avoid hydration mismatch from useDevice
          <div className="h-24" />
        ) : isMobile ? (
          <>
            {hiddenInputs}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                type="button"
                size="lg"
                className="h-20 flex-col gap-1 text-base"
                disabled={uploading}
                onClick={() => cameraInputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <Camera className="h-6 w-6" />
                )}
                <span>Ambil Foto</span>
                <span className="text-[11px] font-normal opacity-80">
                  Buka kamera
                </span>
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="h-20 flex-col gap-1 text-base"
                disabled={uploading}
                onClick={() => galleryInputRef.current?.click()}
              >
                <ImagePlus className="h-6 w-6" />
                <span>Pilih dari Galeri</span>
                <span className="text-[11px] font-normal opacity-80">
                  Multi-select
                </span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {device === "android"
                ? "Android terdeteksi — gunakan tombol di atas."
                : device === "ios"
                ? "iOS terdeteksi — gunakan tombol di atas."
                : "Perangkat mobile terdeteksi."}
            </p>
          </>
        ) : (
          <>
            {hiddenInputs}
            <div
              role="button"
              tabIndex={0}
              onClick={() => laptopInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  laptopInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
              }`}
            >
              {uploading ? (
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              ) : (
                <UploadCloud className="h-8 w-8 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-medium">
                  {uploading
                    ? uploadProgress
                      ? `Mengunggah ${uploadProgress.current}/${uploadProgress.total} foto...`
                      : "Sedang mengunggah..."
                    : "Klik atau drag & drop foto dokumentasi"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  JPG, PNG, WebP, HEIC — maks 4 MB per file — bisa banyak file
                  sekaligus (100+ foto OK)
                </p>
                {uploading && uploadProgress && (
                  <div className="mt-2 w-full max-w-xs">
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{
                          width: `${uploadProgress.total > 0 ? (uploadProgress.current / uploadProgress.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={uploading}
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera className="h-4 w-4 mr-2" />
                Atau ambil foto dari webcam
              </Button>
            </div>
          </>
        )}
      </div>

      {/* ===== Filter bar ===== */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari nama file atau caption..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
        >
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder="Status penggunaan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua foto</SelectItem>
            <SelectItem value="used">Sudah digunakan</SelectItem>
            <SelectItem value="unused">Belum digunakan</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ===== Result info ===== */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {loading ? (
            "Memuat..."
          ) : (
            <>
              Menampilkan <strong>{photos.length}</strong> dari{" "}
              <strong>{total}</strong> foto
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

      {/* ===== Photo grid ===== */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-md" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Belum ada foto dokumentasi yang cocok. Upload foto di atas untuk
            mulai.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {photos.map((p) => (
            <PhotoCard
              key={p.id}
              photo={p}
              onLink={() => setLinkDialogPhoto(p)}
              onDelete={() => setToDelete(p)}
            />
          ))}
        </div>
      )}

      {/* ===== Pagination ===== */}
      {totalPages > 1 && !loading && (
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

      {/* ===== Link dialog ===== */}
      <LinkToOrderDialog
        photoId={linkDialogPhoto?.id ?? ""}
        open={!!linkDialogPhoto}
        onOpenChange={(o) => !o && setLinkDialogPhoto(null)}
        onChanged={handleLinkDialogChanged}
        currentLinkedOrderIds={
          linkDialogPhoto?.links.map((l) => l.orderId) ?? []
        }
      />

      {/* ===== Delete confirmation ===== */}
      <AlertDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus foto ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Foto akan dihapus permanen dan semua koneksi ke pesanan akan
              dihapus juga. Tindakan ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-600"
            >
              {deleting ? "Menghapus..." : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Single photo card in the documentation gallery.
 *
 * Clicking the card opens the LinkToOrderDialog.
 * Action buttons (Hubungkan / Hapus) appear on hover (desktop) or always
 * (mobile). They call e.stopPropagation() so the card click handler doesn't
 * also fire.
 */
function PhotoCard({
  photo,
  onLink,
  onDelete,
}: {
  photo: DocumentationPhoto;
  onLink: () => void;
  onDelete: () => void;
}) {
  // Build the "Digunakan untuk #10, #01" label
  const linkedNos = photo.links.map((l) => `#${l.noPesanan}`).join(", ");
  const formattedDate = new Date(photo.createdAt).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div
      className="group relative aspect-square overflow-hidden rounded-md border bg-muted cursor-pointer"
      onClick={onLink}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onLink();
        }
      }}
      aria-label={`Hubungkan foto ${photo.fileName} ke pesanan`}
    >
      <Image
        src={photo.url}
        alt={photo.fileName}
        fill
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        className="object-cover transition-transform group-hover:scale-105 pointer-events-none"
        unoptimized
      />

      {/* top gradient — helps badge legibility */}
      <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />

      {/* Status badge — top-left, leaves room for action buttons at top-right */}
      <div className="absolute top-1.5 left-1.5 max-w-[calc(100%-3rem)] pointer-events-none">
        {photo.linkedCount === 0 ? (
          <Badge className="bg-rose-600/90 text-white border-0 backdrop-blur-sm text-[10px] h-5">
            <AlertCircle className="h-3 w-3 mr-0.5" />
            Belum digunakan
          </Badge>
        ) : (
          <Badge
            className="bg-emerald-600/90 text-white border-0 backdrop-blur-sm text-[10px] h-5 max-w-full"
            title={`Digunakan untuk ${linkedNos}`}
          >
            <CheckCircle2 className="h-3 w-3 mr-0.5 shrink-0" />
            <span className="truncate">Digunakan untuk {linkedNos}</span>
          </Badge>
        )}
      </div>

      {/* Action buttons — top-right, hover on desktop, always on mobile */}
      <div className="absolute top-1.5 right-1.5 flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <Button
          size="icon"
          variant="secondary"
          className="h-7 w-7 bg-black/60 text-white hover:bg-black/80 border-0"
          onClick={(e) => {
            e.stopPropagation();
            onLink();
          }}
          aria-label="Hubungkan ke pesanan"
        >
          <Link2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          className="h-7 w-7 bg-rose-600/90 hover:bg-rose-600 text-white border-0"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label="Hapus foto"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Bottom info — fileName + size + date, always visible */}
      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
        <p
          className="text-[10px] text-white/95 truncate font-medium"
          title={photo.fileName}
        >
          {photo.fileName}
        </p>
        <p className="text-[10px] text-white/60">
          {formatFileSize(photo.fileSize)} • {formattedDate}
        </p>
      </div>
    </div>
  );
}

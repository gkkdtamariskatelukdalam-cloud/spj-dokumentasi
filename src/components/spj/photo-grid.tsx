"use client";

import * as React from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trash2, Camera, Upload, Smartphone, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { spjApi, formatFileSize, type SpjPhoto } from "@/lib/spj-api";

interface Props {
  photos: SpjPhoto[];
  onChanged: () => void;
  canDelete?: boolean;
}

export function PhotoGrid({ photos, onChanged, canDelete = true }: Props) {
  const [preview, setPreview] = React.useState<SpjPhoto | null>(null);
  const [toDelete, setToDelete] = React.useState<SpjPhoto | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await spjApi.deletePhoto(toDelete.id);
      toast.success("Foto dihapus");
      setToDelete(null);
      onChanged();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal menghapus";
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  }

  if (photos.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Belum ada foto dokumentasi. Upload minimal 2 foto untuk No Pesanan ini.
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {photos.map((p) => {
          const isCamera = p.deviceType === "camera";
          const DeviceIcon =
            p.source === "android" || p.source === "ios"
              ? Smartphone
              : isCamera
              ? Camera
              : Upload;
          return (
            <div
              key={p.id}
              className="group relative aspect-square overflow-hidden rounded-md border bg-muted cursor-pointer"
              onClick={() => setPreview(p)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setPreview(p);
                }
              }}
              aria-label={`Lihat foto ${p.fileName}`}
            >
              <Image
                src={p.url}
                alt={p.fileName}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                className="object-cover transition-transform group-hover:scale-105 pointer-events-none"
                unoptimized
              />
              {/* overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none" />

              {/* top badges */}
              <div className="absolute top-1.5 left-1.5 flex gap-1 pointer-events-none">
                <Badge
                  variant="secondary"
                  className="bg-black/60 text-white border-0 backdrop-blur-sm h-6 px-1.5 text-[10px]"
                >
                  <DeviceIcon className="h-3 w-3 mr-1" />
                  {isCamera ? "Kamera" : "Upload"}
                </Badge>
              </div>

              {/* top right zoom */}
              <Button
                size="icon"
                variant="secondary"
                className="absolute top-1.5 right-1.5 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white hover:bg-black/80 border-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreview(p);
                }}
                aria-label="Lihat foto"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>

              {/* bottom info */}
              <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none">
                <p className="text-[10px] text-white/90 truncate" title={p.fileName}>
                  {p.fileName}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/70">
                    {formatFileSize(p.fileSize)}
                  </span>
                </div>
              </div>

              {/* Delete button — always visible on mobile, hover on desktop.
                  pointer-events-auto so it stays clickable above the card click handler. */}
              {canDelete && (
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute bottom-1.5 right-1.5 h-7 w-7 bg-rose-600/90 hover:bg-rose-600 text-white border-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity pointer-events-auto"
                  onClick={(e) => {
                    e.stopPropagation();
                    setToDelete(p);
                  }}
                  aria-label="Hapus foto"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Lightbox / preview dialog — scrollable for tall portrait photos */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent
          className="max-w-4xl p-0 bg-black/95 border-0 gap-0 flex flex-col max-h-[95vh]"
        >
          <DialogTitle className="sr-only">Preview foto</DialogTitle>
          {preview && (
            <>
              {/* Scrollable image area — works for both landscape (fit) and tall portrait (scroll) */}
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin flex items-start justify-center p-2">
                <Image
                  src={preview.url}
                  alt={preview.fileName}
                  width={1600}
                  height={1200}
                  className="max-w-full h-auto max-h-[80vh] w-auto object-contain rounded"
                  unoptimized
                  sizes="100vw"
                />
              </div>
              {/* Caption footer — sticky at bottom */}
              <div className="shrink-0 bg-gradient-to-t from-black/90 to-black/60 p-4 text-white">
                <p className="text-sm font-medium truncate">{preview.fileName}</p>
                <p className="text-xs text-white/70">
                  {formatFileSize(preview.fileSize)} • {preview.source} •{" "}
                  {preview.deviceType === "camera" ? "Kamera" : "Upload"}
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus foto ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Foto akan dihapus permanen dan tidak bisa dikembalikan. Pastikan
              Anda tetap memiliki minimal 2 foto dokumentasi untuk No Pesanan
              ini.
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
    </>
  );
}

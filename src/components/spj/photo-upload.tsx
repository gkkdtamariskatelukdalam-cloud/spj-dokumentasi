"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, UploadCloud, Loader2, ImagePlus, CheckCircle2, Info } from "lucide-react";
import { toast } from "sonner";
import { spjApi, type SpjPhoto } from "@/lib/spj-api";
import { useDevice } from "@/hooks/use-device";

interface Props {
  orderId: string;
  onUploaded: () => void;
  /** Current photo count — shown in the auto-save banner */
  photoCount?: number;
}

export function PhotoUpload({ orderId, onUploaded, photoCount = 0 }: Props) {
  const { device, isMobile, mounted } = useDevice();

  // Laptop: hidden multi-file input (no capture)
  const laptopInputRef = React.useRef<HTMLInputElement>(null);
  // Mobile: hidden camera input (capture=environment)
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  // Gallery (mobile): hidden multi-file input (accept image, no capture)
  const galleryInputRef = React.useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);

  async function doUpload(files: FileList | File[], opts?: { deviceType: string; source?: string }) {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setUploading(true);

    // Chunked upload: 5 photos per batch to stay under Vercel 4.5MB payload limit
    // For 100+ photos: sequential batches, no payload issue
    const BATCH_SIZE = 5;
    let totalUploaded = 0;
    let totalErrors: string[] = [];

    try {
      for (let i = 0; i < arr.length; i += BATCH_SIZE) {
        const batch = arr.slice(i, i + BATCH_SIZE);
        try {
          const result = await spjApi.uploadPhotos(orderId, batch, {
            deviceType: opts?.deviceType ?? "upload",
            source: opts?.source ?? device,
          });
          totalUploaded += result.count;
          totalErrors = totalErrors.concat(result.errors);
        } catch (batchErr) {
          // If batch fails, try 1-by-1
          for (const f of batch) {
            try {
              const result = await spjApi.uploadPhotos(orderId, [f], {
                deviceType: opts?.deviceType ?? "upload",
                source: opts?.source ?? device,
              });
              totalUploaded += result.count;
              totalErrors = totalErrors.concat(result.errors);
            } catch (singleErr) {
              totalErrors.push(`${f.name}: ${singleErr instanceof Error ? singleErr.message : "gagal"}`);
            }
          }
        }
      }

      if (totalUploaded > 0) {
        toast.success(`${totalUploaded} foto berhasil diunggah`);
      }
      if (totalErrors.length > 0) {
        toast.error(`${totalErrors.length} file gagal: ${totalErrors[0]}`);
      }
      onUploaded();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal upload foto";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  }

  // Laptop handlers
  function handleLaptopChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      void doUpload(e.target.files, { deviceType: "upload", source: "laptop" });
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

  // Hidden inputs (always rendered, both modes can use both)
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

  if (!mounted) {
    // SSR placeholder to avoid hydration mismatch
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-24" />
        </CardContent>
      </Card>
    );
  }

  // Auto-save info banner — foto langsung tersimpan saat diupload, tidak perlu tombol simpan
  const autoSaveBanner = (
    <div
      className={`flex items-center gap-2 rounded-md border p-2.5 text-xs ${
        photoCount > 0
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
      }`}
    >
      {photoCount > 0 ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" />
      ) : (
        <Info className="h-4 w-4 shrink-0" />
      )}
      <span>
        {photoCount > 0 ? (
          <>
            <strong>{photoCount} foto tersimpan otomatis</strong> — foto langsung
            tersimpan ke server saat diupload, tidak perlu tombol simpan.
          </>
        ) : (
          <>
            <strong>Foto tersimpan otomatis</strong> saat diupload — tidak perlu
            tombol simpan. Cukup pilih/ambil foto, sistem akan menyimpannya langsung.
          </>
        )}
      </span>
    </div>
  );

  // ============ MOBILE / ANDROID MODE ============
  if (isMobile) {
    return (
      <div className="space-y-3">
        {autoSaveBanner}
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
              Buka kamera belakang
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
        <p className="mt-2 text-xs text-muted-foreground text-center">
          {device === "android"
            ? "Android terdeteksi — gunakan tombol di atas."
            : device === "ios"
            ? "iOS terdeteksi — gunakan tombol di atas."
            : "Perangkat mobile terdeteksi."}
        </p>
      </div>
    );
  }

  // ============ LAPTOP / DESKTOP MODE ============
  return (
    <div className="space-y-3">
      {autoSaveBanner}
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
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
          dragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
        }`}
      >
        {uploading ? (
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        ) : (
          <UploadCloud className="h-10 w-10 text-muted-foreground" />
        )}
        <div>
          <p className="text-sm font-medium">
            {uploading
              ? "Sedang mengunggah..."
              : "Klik untuk memilih file atau drag & drop"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            JPG, PNG, WebP, HEIC — maks 4 MB per file — bisa banyak file
            sekaligus
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-center">
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
    </div>
  );
}

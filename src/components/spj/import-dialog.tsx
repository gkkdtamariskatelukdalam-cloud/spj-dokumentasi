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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileSpreadsheet, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { spjApi } from "@/lib/spj-api";

interface Props {
  onImported: () => void;
}

export function ImportDialog({ onImported }: Props) {
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [loading, setLoading] = React.useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/\.(xlsx|xls)$/i.test(f.name)) {
      toast.error("File harus berformat .xlsx atau .xls");
      return;
    }
    setFile(f);
  }

  async function handleImport() {
    if (!file) {
      toast.error("Pilih file Excel terlebih dahulu");
      return;
    }
    setLoading(true);
    try {
      const result = await spjApi.importExcel(file);
      toast.success(result.message);
      setOpen(false);
      setFile(null);
      onImported();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal import";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Import Ulang Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Data Excel SPJ</DialogTitle>
          <DialogDescription>
            Upload file Excel untuk memperbarui seluruh data No Pesanan, BKU,
            dan item barang. <strong>Semua foto dokumentasi yang sudah diupload tidak akan terhapus.</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="excel-file">File Excel (.xlsx / .xls)</Label>
            <Input
              id="excel-file"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                Terpilih: <strong>{file.name}</strong> (
                {(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <strong>Perhatian:</strong> Import ulang akan menghapus seluruh
              data order &amp; item barang, lalu menggantinya dengan data Excel
              baru. Foto yang sudah diupload akan tetap aman selama No Pesanan
              &amp; BKU masih cocok (dihubungkan via ID order lama — jika ada
              perubahan No Pesanan, foto bisa yatim).
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            Batal
          </Button>
          <Button onClick={handleImport} disabled={loading || !file}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Mengimpor...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Import Sekarang
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

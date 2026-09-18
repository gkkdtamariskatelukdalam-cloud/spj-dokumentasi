// Shared types & fetch helpers for SPJ app

export type OrderStatus = "complete" | "incomplete" | "empty";

export interface OrderListItem {
  id: string;
  noPesanan: string;
  noBku: string;
  uraianKegiatan: string | null;
  kategoriBelanja: string | null;
  namaToko: string | null;
  tanggalPesanan: string | null;
  tanggalBayar: string | null;
  photoCount: number;
  itemCount: number;
  status: OrderStatus;
}

export interface OrderListResponse {
  orders: OrderListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SpjItem {
  id: string;
  namaBarang: string;
  volume: string | null;
  satuan: string | null;
  hargaSatuan: string | null;
  jumlah: string | null;
  spesifikasi: string | null;
  kategori: string | null;
  uraian: string | null;
}

export interface SpjPhoto {
  id: string;
  url: string;
  fileName: string;
  fileSize: number;
  deviceType: string;
  source: string;
  caption: string | null;
  createdAt: string;
}

export interface OrderDetail {
  id: string;
  noPesanan: string;
  noBku: string;
  kodeProgram: string | null;
  kodeRekening: string | null;
  tanggalPesanan: string | null;
  tanggalBast: string | null;
  tanggalBayar: string | null;
  uraianKegiatan: string | null;
  kategoriBelanja: string | null;
  namaToko: string | null;
  alamatToko: string | null;
  direkturToko: string | null;
  noHp: string | null;
  items: SpjItem[];
  photos: SpjPhoto[];
  status: OrderStatus;
}

export interface Stats {
  totalOrders: number;
  totalItems: number;
  totalPhotos: number;
  completeOrders: number;
  incompleteOrders: number;
  emptyOrders: number;
  progress: number;
}

export interface ImportResult {
  success: boolean;
  totalOrders: number;
  totalItems: number;
  skippedRows: number;
  message: string;
}

export interface UploadResult {
  success: boolean;
  saved: Array<{
    id: string;
    url: string;
    fileName: string;
    fileSize: number;
    deviceType: string;
    source: string;
  }>;
  errors: string[];
  count: number;
}

// ===== Documentation Photo Types =====

export interface DocPhotoLink {
  orderId: string;
  noPesanan: string;
  noBku: string;
  uraianKegiatan: string | null;
}

export interface DocumentationPhoto {
  id: string;
  fileName: string;
  filePath: string;
  url: string;
  fileSize: number;
  mimeType: string;
  deviceType: string;
  source: string;
  caption: string | null;
  links: DocPhotoLink[];
  linkedCount: number;
  createdAt: string;
}

export interface DocumentationListResponse {
  photos: DocumentationPhoto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const spjApi = {
  async getStats(): Promise<Stats> {
    return jsonFetch<Stats>("/api/stats", { cache: "no-store" });
  },

  async listOrders(params: {
    q?: string;
    status?: OrderStatus | "all";
    page?: number;
    pageSize?: number;
  }): Promise<OrderListResponse> {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.status) qs.set("status", params.status);
    if (params.page) qs.set("page", String(params.page));
    if (params.pageSize) qs.set("pageSize", String(params.pageSize));
    return jsonFetch<OrderListResponse>(
      `/api/orders?${qs.toString()}`,
      { cache: "no-store" }
    );
  },

  async getOrder(id: string): Promise<{ order: OrderDetail }> {
    return jsonFetch<{ order: OrderDetail }>(`/api/orders/${id}`, {
      cache: "no-store",
    });
  },

  async importExcel(file: File): Promise<ImportResult> {
    const fd = new FormData();
    fd.append("file", file);
    return jsonFetch<ImportResult>("/api/import", {
      method: "POST",
      body: fd,
    });
  },

  async uploadPhotos(
    orderId: string,
    files: File[],
    opts?: { deviceType?: string; source?: string }
  ): Promise<UploadResult> {
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    if (opts?.deviceType) fd.append("deviceType", opts.deviceType);
    if (opts?.source) fd.append("source", opts.source);
    return jsonFetch<UploadResult>(`/api/orders/${orderId}/photos`, {
      method: "POST",
      body: fd,
    });
  },

  async deletePhoto(photoId: string): Promise<{ success: boolean }> {
    return jsonFetch<{ success: boolean }>(`/api/photos/${photoId}`, {
      method: "DELETE",
    });
  },

  // ===== Documentation Photo APIs (many-to-many dengan pesanan) =====

  async listDocumentation(params: {
    q?: string;
    status?: "used" | "unused" | "all";
    page?: number;
    pageSize?: number;
  }): Promise<DocumentationListResponse> {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.status) qs.set("status", params.status);
    if (params.page) qs.set("page", String(params.page));
    if (params.pageSize) qs.set("pageSize", String(params.pageSize));
    return jsonFetch<DocumentationListResponse>(
      `/api/documentation?${qs.toString()}`,
      { cache: "no-store" }
    );
  },

  async uploadDocumentation(
    files: File[],
    opts?: { deviceType?: string; source?: string }
  ): Promise<UploadResult> {
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    if (opts?.deviceType) fd.append("deviceType", opts.deviceType);
    if (opts?.source) fd.append("source", opts.source);
    return jsonFetch<UploadResult>(`/api/documentation`, {
      method: "POST",
      body: fd,
    });
  },

  async deleteDocumentation(photoId: string): Promise<{ success: boolean }> {
    return jsonFetch<{ success: boolean }>(`/api/documentation/${photoId}`, {
      method: "DELETE",
    });
  },

  async linkPhotoToOrders(
    photoId: string,
    orderIds: string[]
  ): Promise<{
    success: boolean;
    linked: number;
    skipped: number;
    errors: string[];
  }> {
    return jsonFetch(`/api/documentation/${photoId}/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderIds }),
    });
  },

  async unlinkPhotoFromOrder(
    photoId: string,
    orderId: string
  ): Promise<{ success: boolean }> {
    return jsonFetch(`/api/documentation/${photoId}/unlink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
  },

  async getPhotoLinks(photoId: string): Promise<{
    orders: Array<{
      id: string;
      noPesanan: string;
      noBku: string;
      uraianKegiatan: string | null;
    }>;
  }> {
    return jsonFetch(`/api/documentation/${photoId}/link`, { cache: "no-store" });
  },
};

// Format helpers
export function formatRupiah(val: string | null | undefined): string {
  if (!val) return "-";
  const n = Number(String(val).replace(/[^\d.-]/g, ""));
  if (Number.isNaN(n)) return val;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDate(val: string | null | undefined): string {
  if (!val) return "-";
  return val;
}

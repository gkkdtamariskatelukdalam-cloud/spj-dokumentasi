"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Package,
  Camera,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import type { OrderListItem } from "@/lib/spj-api";

interface Props {
  orders: OrderListItem[];
  onClick: (id: string) => void;
}

/**
 * Row-based (table) layout for SPJ orders.
 * Each row = one No. Pesanan. Click row → open detail sheet.
 * Compact, spreadsheet-like — replaces the old card grid.
 */
export function OrderTable({ orders, onClick }: Props) {
  return (
    <div className="rounded-lg border overflow-hidden bg-card">
      {/* Desktop table (md+) */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr className="text-left">
              <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground w-[80px]">
                No. Pesanan
              </th>
              <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground w-[90px]">
                BKU
              </th>
              <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">
                Uraian / Kegiatan
              </th>
              <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground w-[160px]">
                Toko
              </th>
              <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground w-[90px] text-right">
                Barang
              </th>
              <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground w-[80px] text-right">
                Foto
              </th>
              <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground w-[110px]">
                Status
              </th>
              <th className="px-3 py-2.5 w-[32px]"></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <OrderRow key={o.id} order={o} onClick={onClick} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile list (below md) — compact card-like rows */}
      <div className="md:hidden divide-y">
        {orders.map((o) => (
          <MobileOrderRow key={o.id} order={o} onClick={onClick} />
        ))}
      </div>
    </div>
  );
}

function OrderRow({
  order,
  onClick,
}: {
  order: OrderListItem;
  onClick: (id: string) => void;
}) {
  const statusConfig = getStatusConfig(order.status);

  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={() => onClick(order.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(order.id);
        }
      }}
      className="group border-b last:border-b-0 cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <td className="px-3 py-2.5 align-middle">
        <span className="font-mono font-semibold text-primary">
          #{order.noPesanan}
        </span>
      </td>
      <td className="px-3 py-2.5 align-middle">
        <span className="font-mono text-xs text-muted-foreground">
          {order.noBku}
        </span>
      </td>
      <td className="px-3 py-2.5 align-middle max-w-[320px]">
        <p
          className="text-sm truncate text-foreground/90"
          title={order.uraianKegiatan ?? ""}
        >
          {order.uraianKegiatan ?? "(tanpa uraian)"}
        </p>
      </td>
      <td className="px-3 py-2.5 align-middle">
        <p
          className="text-xs text-muted-foreground truncate max-w-[140px]"
          title={order.namaToko ?? ""}
        >
          {order.namaToko ?? "-"}
        </p>
      </td>
      <td className="px-3 py-2.5 align-middle text-right">
        <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
          <Package className="h-3 w-3" />
          {order.itemCount}
        </span>
      </td>
      <td className="px-3 py-2.5 align-middle text-right">
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs tabular-nums font-medium",
            order.photoCount >= 2
              ? "text-emerald-600 dark:text-emerald-400"
              : order.photoCount === 1
              ? "text-amber-600 dark:text-amber-400"
              : "text-rose-600 dark:text-rose-400"
          )}
        >
          <Camera className="h-3 w-3" />
          {order.photoCount}
        </span>
      </td>
      <td className="px-3 py-2.5 align-middle">
        <Badge variant="outline" className={cn("text-[10px] py-0.5 px-1.5", statusConfig.cls)}>
          <statusConfig.icon className="h-2.5 w-2.5 mr-1" />
          {statusConfig.label}
        </Badge>
      </td>
      <td className="px-2 py-2.5 align-middle">
        <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
      </td>
    </tr>
  );
}

function MobileOrderRow({
  order,
  onClick,
}: {
  order: OrderListItem;
  onClick: (id: string) => void;
}) {
  const statusConfig = getStatusConfig(order.status);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(order.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(order.id);
        }
      }}
      className="flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:bg-muted/40 active:bg-muted/60"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-mono font-semibold text-sm text-primary">
            #{order.noPesanan}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {order.noBku}
          </span>
          <Badge variant="outline" className={cn("text-[9px] py-0 px-1.5 ml-auto", statusConfig.cls)}>
            <statusConfig.icon className="h-2.5 w-2.5 mr-0.5" />
            {statusConfig.shortLabel}
          </Badge>
        </div>
        <p
          className="text-xs text-foreground/80 line-clamp-1 mb-1"
          title={order.uraianKegiatan ?? ""}
        >
          {order.uraianKegiatan ?? "(tanpa uraian)"}
        </p>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-0.5">
            <Package className="h-3 w-3" />
            {order.itemCount} barang
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              order.photoCount >= 2
                ? "text-emerald-600 dark:text-emerald-400"
                : order.photoCount === 1
                ? "text-amber-600 dark:text-amber-400"
                : "text-rose-600 dark:text-rose-400"
            )}
          >
            <Camera className="h-3 w-3" />
            {order.photoCount} foto
          </span>
          {order.namaToko && (
            <span className="truncate max-w-[100px]">{order.namaToko}</span>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
    </div>
  );
}

function getStatusConfig(status: OrderListItem["status"]) {
  switch (status) {
    case "complete":
      return {
        label: "Lengkap",
        shortLabel: "Lengkap",
        icon: CheckCircle2,
        cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
      };
    case "incomplete":
      return {
        label: "Kurang",
        shortLabel: "Kurang",
        icon: Clock,
        cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800",
      };
    case "empty":
    default:
      return {
        label: "Belum Ada",
        shortLabel: "Belum",
        icon: AlertCircle,
        cls: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800",
      };
  }
}

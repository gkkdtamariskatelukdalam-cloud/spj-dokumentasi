"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Package, Store, Calendar } from "lucide-react";
import type { OrderListItem } from "@/lib/spj-api";

interface Props {
  order: OrderListItem;
  onClick: (id: string) => void;
}

export function OrderCard({ order, onClick }: Props) {
  const statusConfig = {
    complete: {
      label: "Lengkap",
      variant: "default" as const,
      className:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    },
    incomplete: {
      label: "Kurang",
      variant: "default" as const,
      className:
        "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    },
    empty: {
      label: "Belum Ada",
      variant: "default" as const,
      className:
        "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800",
    },
  };
  const s = statusConfig[order.status];

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onClick(order.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(order.id);
        }
      }}
      className="group cursor-pointer transition-all hover:shadow-md hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold text-primary">
                #{order.noPesanan}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                BKU: {order.noBku}
              </span>
            </div>
            <p
              className="mt-1 text-sm line-clamp-2 text-foreground/80"
              title={order.uraianKegiatan ?? ""}
            >
              {order.uraianKegiatan ?? "(tanpa uraian)"}
            </p>
          </div>
          <Badge variant="outline" className={`shrink-0 ${s.className}`}>
            {s.label}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Package className="h-3.5 w-3.5" />
            {order.itemCount} barang
          </span>
          <span className="inline-flex items-center gap-1">
            <Camera className="h-3.5 w-3.5" />
            <span
              className={
                order.photoCount >= 2
                  ? "font-medium text-emerald-600 dark:text-emerald-400"
                  : order.photoCount === 1
                  ? "font-medium text-amber-600 dark:text-amber-400"
                  : "font-medium text-rose-600 dark:text-rose-400"
              }
            >
              {order.photoCount} foto
            </span>
          </span>
          {order.namaToko && (
            <span className="inline-flex items-center gap-1 min-w-0">
              <Store className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate max-w-[140px]" title={order.namaToko}>
                {order.namaToko}
              </span>
            </span>
          )}
          {order.tanggalPesanan && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {order.tanggalPesanan}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

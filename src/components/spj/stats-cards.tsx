"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClipboardList,
  Package,
  Camera,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import type { Stats } from "@/lib/spj-api";

interface Props {
  stats: Stats | undefined;
  loading: boolean;
}

export function StatsCards({ stats, loading }: Props) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: "Total Pesanan",
      value: stats.totalOrders,
      icon: ClipboardList,
      iconColor: "oklch(0.50 0.18 255)",
      bg: "oklch(0.94 0.04 255)",
      border: "oklch(0.88 0.06 255)",
    },
    {
      title: "Total Barang",
      value: stats.totalItems,
      icon: Package,
      iconColor: "oklch(0.50 0.15 190)",
      bg: "oklch(0.94 0.04 190)",
      border: "oklch(0.88 0.05 190)",
    },
    {
      title: "Total Foto",
      value: stats.totalPhotos,
      icon: Camera,
      iconColor: "oklch(0.48 0.14 292)",
      bg: "oklch(0.94 0.04 292)",
      border: "oklch(0.88 0.05 292)",
    },
    {
      title: "Lengkap (≥2)",
      value: stats.completeOrders,
      icon: CheckCircle2,
      iconColor: "oklch(0.45 0.15 162)",
      bg: "oklch(0.94 0.05 162)",
      border: "oklch(0.88 0.06 162)",
    },
    {
      title: "Kurang (1)",
      value: stats.incompleteOrders,
      icon: Clock,
      iconColor: "oklch(0.55 0.16 70)",
      bg: "oklch(0.94 0.05 70)",
      border: "oklch(0.88 0.06 70)",
    },
    {
      title: "Belum Ada",
      value: stats.emptyOrders,
      icon: AlertCircle,
      iconColor: "oklch(0.52 0.20 27)",
      bg: "oklch(0.94 0.05 27)",
      border: "oklch(0.88 0.06 27)",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((c) => (
          <Card
            key={c.title}
            className="overflow-hidden transition-shadow hover:shadow-md"
            style={{ borderColor: c.border }}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription className="text-xs">
                  {c.title}
                </CardDescription>
                <span
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md"
                  style={{ backgroundColor: c.bg, color: c.iconColor }}
                >
                  <c.icon className="h-4 w-4" />
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <CardTitle className="text-2xl tabular-nums">
                {c.value.toLocaleString("id-ID")}
              </CardTitle>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Progress bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Progress Dokumentasi</p>
              <p className="text-xs text-muted-foreground">
                {stats.completeOrders} dari {stats.totalOrders} No Pesanan
                memiliki minimal 2 foto
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold tabular-nums">
                {stats.progress}%
              </span>
            </div>
          </div>
          <Progress value={stats.progress} className="mt-3 h-2" />
        </CardContent>
      </Card>
    </div>
  );
}

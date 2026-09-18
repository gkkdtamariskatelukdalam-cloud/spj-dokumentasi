"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Check, Calendar, ChevronsUpDown, Loader2, Layers } from "lucide-react";
import { toast } from "sonner";
import { yearApi, type ActiveYear, type SpjYearInfo } from "@/lib/year-client";

interface Props {
  /** Currently active year (null = "Semua Tahun" mode). */
  activeYear: ActiveYear | null;
  /** Notify parent that the active year was changed (so it can re-fetch data). */
  onYearChange: () => void;
}

/**
 * YearSelector — compact dropdown shown in the app header.
 *
 * Trigger shows:
 *   "📅 Semua Tahun ▼"   — when activeYear is null (all years mode)
 *   "📅 Tahun 2026 ▼"   — when a specific year is active (shows label if present)
 *
 * Dropdown (cmdk via Popover + Command):
 *   - List of years (newest first), each row shows year + label + order count
 *   - Separator
 *   - "Semua Tahun" option at the bottom (with Layers icon)
 *
 * On select:
 *   1. Optimistically close popover + show loading
 *   2. yearApi.setActive(yearId)
 *   3. Call onYearChange() so parent re-fetches stats/orders/etc
 *   4. Re-fetch local list so check mark reflects new selection
 */
export function YearSelector({ activeYear, onYearChange }: Props) {
  const [open, setOpen] = React.useState(false);
  const [years, setYears] = React.useState<SpjYearInfo[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [switching, setSwitching] = React.useState(false);

  // Track trigger width so the popover content matches it (cmdk inside portal)
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [triggerWidth, setTriggerWidth] = React.useState<number>(0);
  React.useLayoutEffect(() => {
    if (open && triggerRef.current) {
      setTriggerWidth(triggerRef.current.offsetWidth);
    }
  }, [open]);

  const loadYears = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await yearApi.list();
      setYears(res.years);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Gagal memuat daftar tahun";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load years when the popover opens
  React.useEffect(() => {
    if (open) {
      void loadYears();
    }
  }, [open, loadYears]);

  // The active id — "all" if no specific year is active
  const activeId = activeYear?.id ?? "all";

  async function handleSelect(yearId: string) {
    if (yearId === activeId) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    try {
      await yearApi.setActive(yearId);
      setOpen(false);
      toast.success(
        yearId === "all"
          ? "Menampilkan semua tahun"
          : `Tahun aktif: ${getLabelForId(yearId)}`
      );
      // Notify parent — they will re-fetch activeYear + stats + orders
      onYearChange();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Gagal mengubah tahun aktif";
      toast.error(msg);
    } finally {
      setSwitching(false);
    }
  }

  function getLabelForId(id: string): string {
    if (id === "all") return "Semua Tahun";
    const y = years.find((y) => y.id === id);
    return y ? `Tahun ${y.year}` : "Tahun";
  }

  // Trigger label
  const triggerLabel = activeYear
    ? `Tahun ${activeYear.year}`
    : "Semua Tahun";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label="Pilih tahun aktif"
          className="gap-1.5 font-medium h-9"
          // amber/orange accent — matches the "Manajemen Tahun" tab color
          style={
            activeYear
              ? {
                  backgroundColor: "oklch(0.94 0.05 70)",
                  borderColor: "oklch(0.80 0.10 70)",
                  color: "oklch(0.45 0.15 70)",
                }
              : undefined
          }
        >
          <Calendar className="h-3.5 w-3.5" />
          <span className="truncate max-w-[120px]">{triggerLabel}</span>
          {switching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin ml-0.5" />
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-60 ml-0.5" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        align="end"
        sideOffset={4}
        style={{
          width: triggerWidth > 0 ? `${triggerWidth}px` : "240px",
          minWidth: "220px",
          maxWidth: "320px",
        }}
      >
        <Command shouldFilter={false} className="w-full">
          <CommandList
            className="scrollbar-thin"
            style={{
              maxHeight: "320px",
              overflowY: "auto",
              overscrollBehavior: "contain",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {loading && years.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Memuat...
              </div>
            ) : years.length === 0 ? (
              <CommandEmpty>
                Belum ada tahun. Tambahkan di Pengaturan.
              </CommandEmpty>
            ) : (
              <CommandGroup heading="Tahun">
                {years.map((y) => (
                  <CommandItem
                    key={y.id}
                    value={y.id}
                    onSelect={() => void handleSelect(y.id)}
                    className="flex items-center gap-2 py-2"
                  >
                    <Check
                      className={`h-4 w-4 shrink-0 ${
                        activeId === y.id ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium tabular-nums">
                          {y.year}
                        </span>
                        {y.isActive && (
                          <Badge
                            variant="outline"
                            className="h-4 px-1 text-[9px] py-0 border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                          >
                            AKTIF
                          </Badge>
                        )}
                      </div>
                      {y.label && (
                        <p className="text-[11px] text-muted-foreground truncate">
                          {y.label}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                      {y.orderCount} order
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            <CommandSeparator />

            <CommandGroup>
              <CommandItem
                value="all"
                onSelect={() => void handleSelect("all")}
                className="flex items-center gap-2 py-2"
              >
                <Check
                  className={`h-4 w-4 shrink-0 ${
                    activeId === "all" ? "opacity-100" : "opacity-0"
                  }`}
                />
                <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="text-sm font-medium">Semua Tahun</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  gabung
                </span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

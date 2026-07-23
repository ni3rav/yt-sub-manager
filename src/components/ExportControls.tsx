import { useState } from "react";
import { Download, FileSpreadsheet, FileJson, Filter, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExportControlsProps {
  searchQuery?: string;
  tagQuery?: string;
  category?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

function ToggleOption({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export function ExportControls({
  searchQuery = "",
  tagQuery = "",
  category = "",
  sortBy = "title",
  sortDir = "asc",
}: ExportControlsProps) {
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [scope, setScope] = useState<"filtered" | "all">("filtered");

  const hasActiveFilter = Boolean(searchQuery.trim() || tagQuery.trim() || category.trim());

  const handleExport = () => {
    const params = new URLSearchParams();
    params.set("format", format);
    params.set("scope", scope);

    if (scope === "filtered") {
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      if (tagQuery.trim()) params.set("tag", tagQuery.trim());
      if (category.trim()) params.set("category", category.trim());
      if (sortBy) params.set("sortBy", sortBy);
      if (sortDir) params.set("sortDir", sortDir);
    }

    const exportUrl = `/api/export?${params.toString()}`;
    window.location.href = exportUrl;
  };

  return (
    <div className="space-y-4 rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-2">
          <Download className="size-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Export subscriptions</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Download your subscription library including category and tag metadata.
        </p>
      </div>

      <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Format Selector Toggle */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">Format</label>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            <ToggleOption active={format === "csv"} onClick={() => setFormat("csv")}>
              <FileSpreadsheet className="size-4" />
              CSV
            </ToggleOption>
            <ToggleOption active={format === "json"} onClick={() => setFormat("json")}>
              <FileJson className="size-4" />
              JSON
            </ToggleOption>
          </div>
        </div>

        {/* Scope Selector Toggle */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">Scope</label>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            <ToggleOption active={scope === "filtered"} onClick={() => setScope("filtered")}>
              <Filter className="size-4" />
              Filtered
            </ToggleOption>
            <ToggleOption active={scope === "all"} onClick={() => setScope("all")}>
              <Globe className="size-4" />
              All library
            </ToggleOption>
          </div>
        </div>

        {/* Action Button */}
        <Button onClick={handleExport} className="w-full sm:col-span-2 lg:col-span-1">
          <Download />
          Download {format.toUpperCase()}
        </Button>
      </div>

      {scope === "filtered" && hasActiveFilter && (
        <p className="rounded-lg bg-muted px-3 py-1.5 text-sm text-muted-foreground">
          Filter active: the export will only include channels matching the current search, category, and tag filters.
        </p>
      )}
    </div>
  );
}

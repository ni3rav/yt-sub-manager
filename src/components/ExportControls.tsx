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
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-blue-400" />
          <h3 className="font-semibold text-slate-100 text-sm">Export Subscriptions</h3>
        </div>
        <p className="text-xs text-slate-400">
          Download your subscription library including category and tag metadata.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-center">
        {/* Format Selector Toggle */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400">Export Format</label>
          <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setFormat("csv")}
              className={`flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
                format === "csv"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={() => setFormat("json")}
              className={`flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
                format === "json"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <FileJson className="w-4 h-4" />
              <span>JSON</span>
            </button>
          </div>
        </div>

        {/* Scope Selector Toggle */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400">Export Scope</label>
          <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setScope("filtered")}
              className={`flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
                scope === "filtered"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filtered</span>
            </button>
            <button
              type="button"
              onClick={() => setScope("all")}
              className={`flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
                scope === "all"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>All Library</span>
            </button>
          </div>
        </div>

        {/* Action Button */}
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-1 flex flex-col justify-end">
          <span className="hidden lg:block text-xs font-medium text-transparent opacity-0">Action</span>
          <Button
            onClick={handleExport}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center justify-center gap-2 h-[38px] rounded-xl shadow-md shadow-blue-600/20"
          >
            <Download className="w-4 h-4" />
            <span>Download {format.toUpperCase()}</span>
          </Button>
        </div>
      </div>

      {scope === "filtered" && hasActiveFilter && (
        <p className="text-[11px] font-mono text-blue-400 bg-blue-950/40 border border-blue-500/20 px-3 py-1.5 rounded-lg">
          Filter active: export will include channels matching current search/category/tag filters.
        </p>
      )}
    </div>
  );
}

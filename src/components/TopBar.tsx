import { Search, RefreshCw, LogOut, CheckCircle2, PlaySquare, ArrowUpDown, Filter, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TopBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  tag: string;
  onTagChange: (tag: string) => void;
  sortBy: string;
  onSortByChange: (sortBy: string) => void;
  sortDir: "asc" | "desc";
  onSortDirToggle: () => void;
  category: string;
  onCategoryChange: (cat: string) => void;
  categories: string[];
  lastSyncedAt: string | null;
  isSyncing: boolean;
  onSync: () => void;
  onDisconnect: () => void;
  disconnecting: boolean;
}

export function TopBar({
  searchQuery,
  onSearchChange,
  tag,
  onTagChange,
  sortBy,
  onSortByChange,
  sortDir,
  onSortDirToggle,
  category,
  onCategoryChange,
  categories,
  lastSyncedAt,
  isSyncing,
  onSync,
  onDisconnect,
  disconnecting,
}: TopBarProps) {
  const formatTimestamp = (isoString: string | null) => {
    if (!isoString) return "Never synced";
    try {
      const d = new Date(isoString);
      return d.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 space-y-4">
      {/* Upper Bar */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-600/10 border border-red-500/20 rounded-xl text-red-500 shadow-sm shadow-red-500/10">
            <PlaySquare className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              YouTube Subscription Manager
            </h1>
            <p className="text-xs text-slate-400">Authenticated &amp; Ready</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Last Synced Badge */}
          <div className="flex items-center gap-2 text-xs font-mono bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-300">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Last synced: {formatTimestamp(lastSyncedAt)}</span>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs font-mono bg-emerald-950/40 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Connected</span>
          </div>

          <Button
            onClick={onSync}
            disabled={isSyncing || disconnecting}
            variant="default"
            size="sm"
            className="bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-2 font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
            <span>{isSyncing ? "Syncing..." : "Sync now"}</span>
          </Button>

          <Button
            onClick={onDisconnect}
            disabled={disconnecting || isSyncing}
            variant="outline"
            size="sm"
            className="border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white flex items-center gap-2"
          >
            <LogOut className="w-4 h-4 text-red-400" />
            <span>{disconnecting ? "Disconnecting..." : "Disconnect"}</span>
          </Button>
        </div>
      </div>

      {/* Control Bar: Search & Filter Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-2">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search channels..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Tag Filter Input */}
        <div className="relative">
          <Tag className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Filter by tag..."
            value={tag}
            onChange={(e) => onTagChange(e.target.value)}
            className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Category Filter */}
        <div className="relative">
          <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors appearance-none cursor-pointer"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Sort By Dropdown */}
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value)}
            className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors appearance-none cursor-pointer"
          >
            <option value="title">Sort by Title</option>
            <option value="subscribed_at">Sort by Subscribed Date</option>
            <option value="video_count">Sort by Video Count</option>
            <option value="subscriber_count">Sort by Subscriber Count</option>
          </select>
        </div>

        {/* Sort Direction Toggle */}
        <Button
          onClick={onSortDirToggle}
          variant="outline"
          className="border-slate-800 bg-slate-950/80 hover:bg-slate-800 text-slate-300 flex items-center justify-center gap-2 text-sm"
        >
          <ArrowUpDown className="w-4 h-4 text-blue-400" />
          <span>{sortDir === "asc" ? "Ascending (A-Z)" : "Descending (Z-A)"}</span>
        </Button>
      </div>
    </header>
  );
}

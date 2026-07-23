import { Search, RefreshCw, LogOut, PlaySquare, ArrowUpDown, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

const selectClassName =
  "h-9 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50";

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
    <header className="sticky top-0 z-40 space-y-4 border-b bg-background px-4 py-4 sm:px-6">
      {/* Upper Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-destructive/10 p-2 text-destructive">
            <PlaySquare className="size-6" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight tracking-tight">YouTube Subscription Manager</h1>
            <p className="text-sm text-muted-foreground">Last synced: {formatTimestamp(lastSyncedAt)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onSync} disabled={isSyncing || disconnecting} size="sm">
            <RefreshCw className={isSyncing ? "animate-spin" : ""} />
            {isSyncing ? "Syncing..." : "Sync now"}
          </Button>

          <Button onClick={onDisconnect} disabled={disconnecting || isSyncing} variant="outline" size="sm">
            <LogOut />
            {disconnecting ? "Disconnecting..." : "Disconnect"}
          </Button>
        </div>
      </div>

      {/* Control Bar: Search & Filter Controls */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-5">
        {/* Search Input */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search channels..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Tag Filter Input */}
        <div className="relative">
          <Tag className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Filter by tag..."
            value={tag}
            onChange={(e) => onTagChange(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Category Filter */}
        <select value={category} onChange={(e) => onCategoryChange(e.target.value)} className={selectClassName}>
          <option value="">All categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        {/* Sort By Dropdown */}
        <select value={sortBy} onChange={(e) => onSortByChange(e.target.value)} className={selectClassName}>
          <option value="title">Sort by title</option>
          <option value="subscribed_at">Sort by subscribed date</option>
          <option value="video_count">Sort by video count</option>
          <option value="subscriber_count">Sort by subscriber count</option>
        </select>

        {/* Sort Direction Toggle */}
        <Button onClick={onSortDirToggle} variant="outline">
          <ArrowUpDown />
          {sortDir === "asc" ? "Ascending" : "Descending"}
        </Button>
      </div>
    </header>
  );
}

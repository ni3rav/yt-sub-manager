import { Search, ArrowUpDown, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ChannelFiltersProps {
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
}

const selectClassName =
  "h-9 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50";

export function ChannelFilters({
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
}: ChannelFiltersProps) {
  return (
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
  );
}

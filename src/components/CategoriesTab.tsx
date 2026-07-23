import { useEffect, useState } from "react";
import { FolderOpen, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface CategoryStat {
  category: string;
  channelCount: number;
}

interface CategoriesTabProps {
  /** Bumped by the parent whenever channel data changes, to trigger a refetch. */
  refreshKey: number;
  onBrowse: (category: string) => void;
  onUnsubscribeCategory: (category: string) => Promise<void>;
}

export function CategoriesTab({ refreshKey, onBrowse, onUnsubscribeCategory }: CategoriesTabProps) {
  const [stats, setStats] = useState<CategoryStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [preparingCategory, setPreparingCategory] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetch("/api/categories")
      .then((res) => (res.ok ? res.json() : { stats: [] }))
      .then((data) => {
        if (!cancelled) setStats(data.stats || []);
      })
      .catch((err) => console.error("Failed to fetch category stats:", err))
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const handleUnsubscribe = async (category: string) => {
    setPreparingCategory(category);
    try {
      await onUnsubscribeCategory(category);
    } finally {
      setPreparingCategory(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border bg-card p-12 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading categories...
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className="space-y-3 rounded-xl border bg-card p-12 text-center">
        <FolderOpen className="mx-auto size-12 text-muted-foreground" />
        <h3 className="text-lg font-semibold">No categories yet</h3>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          Select channels in the Channels tab and assign them a category. Categories can then be browsed or
          unsubscribed in one go from here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Categories ({stats.length})
      </div>
      <ul className="divide-y">
        {stats.map(({ category, channelCount }) => (
          <li key={category} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3">
              <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
              <span className="font-medium">{category}</span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                {channelCount} channel{channelCount === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => onBrowse(category)} variant="outline" size="sm">
                Browse
              </Button>
              <Button
                onClick={() => handleUnsubscribe(category)}
                disabled={preparingCategory !== null}
                variant="destructive"
                size="sm"
              >
                {preparingCategory === category ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Unsubscribe all
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

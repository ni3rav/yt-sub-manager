import { useState, useEffect, useCallback } from "react";
import type { ChannelRecord } from "@/lib/db";
import { TopBar } from "./TopBar";
import { ChannelTable } from "./ChannelTable";
import { BulkActionBar } from "./BulkActionBar";
import { ExportControls } from "./ExportControls";
import { UnsubscribeConfirmModal } from "./UnsubscribeConfirmModal";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DashboardProps {
  onDisconnect: () => void;
}

export function Dashboard({ onDisconnect }: DashboardProps) {
  const [disconnecting, setDisconnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [quotaError, setQuotaError] = useState<{ message: string; count: number } | null>(null);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState<string | null>(null);

  // Filter & Sort State
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [debouncedTag, setDebouncedTag] = useState("");
  const [sortBy, setSortBy] = useState("title");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);

  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalChannels, setTotalChannels] = useState(0);

  // Channels & Selection State
  const [channels, setChannels] = useState<ChannelRecord[]>([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(new Set());
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);

  // Debounce search inputs
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTag(tagQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [tagQuery]);

  // Fetch Categories on mount
  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/categories");
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error("Failed to fetch categories:", err);
    }
  }, []);

  // Fetch Channels
  const fetchChannels = useCallback(async () => {
    setIsLoadingChannels(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (debouncedTag) params.set("tag", debouncedTag);
      if (sortBy) params.set("sortBy", sortBy);
      if (sortDir) params.set("sortDir", sortDir);
      if (category) params.set("category", category);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const res = await fetch(`/api/channels?${params.toString()}`);
      if (res.status === 401) {
        onDisconnect();
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);
        setTotalChannels(data.total || 0);
      }
    } catch (err) {
      console.error("Failed to fetch channels:", err);
    } finally {
      setIsLoadingChannels(false);
    }
  }, [debouncedSearch, debouncedTag, sortBy, sortDir, category, page, pageSize, onDisconnect]);

  // Fetch Sync Status
  const fetchSyncStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/sync");
      if (res.ok) {
        const data = await res.json();
        setLastSyncedAt(data.lastSyncedAt || null);
      }
    } catch (err) {
      console.error("Failed to fetch sync status:", err);
    }
  }, []);

  useEffect(() => {
    fetchSyncStatus();
    fetchCategories();
  }, [fetchSyncStatus, fetchCategories]);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  // Sync Action
  const handleSync = async () => {
    setIsSyncing(true);
    setQuotaError(null);
    setSyncSuccessMessage(null);

    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();

      if (res.status === 401) {
        onDisconnect();
        return;
      }

      if (res.ok) {
        if (data.lastSyncedAt) {
          setLastSyncedAt(data.lastSyncedAt);
        }

        const quotaErr = data.errors?.find((e: any) => e.reason === "quotaExceeded");
        if (quotaErr) {
          setQuotaError({
            message: quotaErr.message || "YouTube API daily quota exceeded.",
            count: data.count ?? 0,
          });
        } else {
          setSyncSuccessMessage(`Successfully synced ${data.count} channel${data.count === 1 ? "" : "s"}.`);
        }

        fetchCategories();
        fetchChannels();
      }
    } catch (err) {
      console.error("Failed to sync:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/auth/disconnect", { method: "POST" });
      if (res.ok) {
        onDisconnect();
      } else {
        console.error("Failed to disconnect");
      }
    } catch (err) {
      console.error("Disconnect error:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Selection Logic
  const handleToggleSelectChannel = (channelId: string) => {
    setSelectedChannelIds((prev) => {
      const next = new Set(prev);
      if (next.has(channelId)) {
        next.delete(channelId);
      } else {
        next.add(channelId);
      }
      return next;
    });
  };

  const handleToggleSelectAll = async () => {
    const isAllSelected = totalChannels > 0 && selectedChannelIds.size === totalChannels;

    if (isAllSelected) {
      // Clear all
      setSelectedChannelIds(new Set());
    } else {
      // Fetch all matching channel IDs for current filter
      try {
        const params = new URLSearchParams();
        if (debouncedSearch) params.set("q", debouncedSearch);
        if (debouncedTag) params.set("tag", debouncedTag);
        if (category) params.set("category", category);
        params.set("allIdsOnly", "true");

        const res = await fetch(`/api/channels?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setSelectedChannelIds(new Set(data.channelIds || []));
        } else {
          // Fallback to selecting current page channels
          setSelectedChannelIds(new Set(channels.map((c) => c.channel_id)));
        }
      } catch {
        setSelectedChannelIds(new Set(channels.map((c) => c.channel_id)));
      }
    }
  };

  const handleBulkTagCategory = async (categoryToApply?: string, tagsToApply?: string[]) => {
    if (selectedChannelIds.size === 0) return;

    try {
      const res = await fetch("/api/channels/tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelIds: Array.from(selectedChannelIds),
          category: categoryToApply,
          tags: tagsToApply,
        }),
      });

      if (res.status === 401) {
        onDisconnect();
        return;
      }

      if (res.ok) {
        setSelectedChannelIds(new Set());
        await fetchCategories();
        await fetchChannels();
      }
    } catch (err) {
      console.error("Bulk tag/category error:", err);
    }
  };

  // Unsubscribe Modal State
  const [isUnsubscribeModalOpen, setIsUnsubscribeModalOpen] = useState(false);
  const [isUnsubscribing, setIsUnsubscribing] = useState(false);

  const handleBulkUnsubscribeConfirm = async () => {
    if (selectedChannelIds.size === 0) return;

    setIsUnsubscribing(true);
    setQuotaError(null);
    setSyncSuccessMessage(null);

    try {
      const res = await fetch("/api/channels/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelIds: Array.from(selectedChannelIds) }),
      });

      if (res.status === 401) {
        onDisconnect();
        return;
      }

      if (res.ok) {
        const data = await res.json();
        const succeededCount = data.succeeded?.length || 0;
        const quotaStopped = Boolean(data.quotaStopped);

        if (quotaStopped) {
          const remainingCount = selectedChannelIds.size - succeededCount;
          setQuotaError({
            message: `YouTube API quota limit reached. Unsubscribed ${succeededCount} channel${
              succeededCount === 1 ? "" : "s"
            }. ${remainingCount} channel${remainingCount === 1 ? "" : "s"} could not be unsubscribed today.`,
            count: succeededCount,
          });
        } else if (succeededCount > 0) {
          setSyncSuccessMessage(`Successfully unsubscribed from ${succeededCount} channel${succeededCount === 1 ? "" : "s"}.`);
        }

        setSelectedChannelIds(new Set());
        setIsUnsubscribeModalOpen(false);
        await fetchCategories();
        await fetchChannels();
      }
    } catch (err) {
      console.error("Bulk unsubscribe failed:", err);
    } finally {
      setIsUnsubscribing(false);
    }
  };

  const selectedChannelsList = channels.filter((c) => selectedChannelIds.has(c.channel_id));
  const isAllSelected = totalChannels > 0 && selectedChannelIds.size === totalChannels;
  const totalPages = Math.ceil(totalChannels / pageSize) || 1;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-red-500 selection:text-white">
      {/* TopBar Component */}
      <TopBar
        searchQuery={searchQuery}
        onSearchChange={(q) => {
          setSearchQuery(q);
          setPage(1);
        }}
        tag={tagQuery}
        onTagChange={(t) => {
          setTagQuery(t);
          setPage(1);
        }}
        sortBy={sortBy}
        onSortByChange={(sb) => {
          setSortBy(sb);
          setPage(1);
        }}
        sortDir={sortDir}
        onSortDirToggle={() => setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))}
        category={category}
        onCategoryChange={(cat) => {
          setCategory(cat);
          setPage(1);
        }}
        categories={categories}
        lastSyncedAt={lastSyncedAt}
        isSyncing={isSyncing}
        onSync={handleSync}
        onDisconnect={handleDisconnect}
        disconnecting={disconnecting}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 md:p-8 space-y-6 pb-28">
        {/* Quota Exceeded Warning Banner */}
        {quotaError && (
          <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 flex items-start gap-3 shadow-lg">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm">
              <h4 className="font-semibold text-amber-300">YouTube API Quota Reached</h4>
              <p className="text-slate-300 text-xs leading-relaxed">
                {quotaError.message} You can retry tomorrow when Google resets daily quota (~10,000 quota units / ~200 deletes per day).
              </p>
            </div>
          </div>
        )}

        {/* Sync Success Message */}
        {syncSuccessMessage && !quotaError && (
          <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-200 flex items-center gap-3 shadow-md">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <p className="text-sm font-medium">{syncSuccessMessage}</p>
          </div>
        )}

        {/* Channel Table & Controls */}
        <div className="space-y-4">
          <ChannelTable
            channels={channels}
            selectedChannelIds={selectedChannelIds}
            onToggleSelectChannel={handleToggleSelectChannel}
            onToggleSelectAll={handleToggleSelectAll}
            isAllSelected={isAllSelected}
            totalChannels={totalChannels}
          />

          {/* Pagination Controls */}
          {totalChannels > 0 && (
            <div className="flex items-center justify-between flex-wrap gap-4 px-2 py-2 text-xs text-slate-400 font-mono">
              <div className="flex items-center gap-2">
                <span>Show</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>per page (Showing {channels.length} of {totalChannels})</span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || isLoadingChannels}
                  variant="outline"
                  size="sm"
                  className="border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 h-8 px-2.5"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>

                <span>
                  Page {page} of {totalPages}
                </span>

                <Button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || isLoadingChannels}
                  variant="outline"
                  size="sm"
                  className="border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 h-8 px-2.5"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Export Controls Section */}
        <ExportControls
          searchQuery={debouncedSearch}
          tagQuery={debouncedTag}
          category={category}
          sortBy={sortBy}
          sortDir={sortDir}
        />
      </main>

      {/* Floating Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedChannelIds.size}
        categories={categories}
        onApply={handleBulkTagCategory}
        onUnsubscribe={() => setIsUnsubscribeModalOpen(true)}
        onClearSelection={() => setSelectedChannelIds(new Set())}
      />

      {/* Unsubscribe Confirmation Modal */}
      <UnsubscribeConfirmModal
        isOpen={isUnsubscribeModalOpen}
        selectedChannels={selectedChannelsList}
        totalSelectedCount={selectedChannelIds.size}
        onConfirm={handleBulkUnsubscribeConfirm}
        onCancel={() => setIsUnsubscribeModalOpen(false)}
        isUnsubscribing={isUnsubscribing}
      />
    </div>
  );
}

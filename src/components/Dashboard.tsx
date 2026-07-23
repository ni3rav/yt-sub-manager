import { useState, useEffect, useCallback } from "react";
import type { ChannelRecord } from "@/lib/db";
import { TopBar } from "./TopBar";
import { ChannelFilters } from "./ChannelFilters";
import { ChannelTable } from "./ChannelTable";
import { BulkActionBar } from "./BulkActionBar";
import { CategoriesTab } from "./CategoriesTab";
import { ActivityTab } from "./ActivityTab";
import { ExportControls } from "./ExportControls";
import { UnsubscribeConfirmModal } from "./UnsubscribeConfirmModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { readActionStream, type StreamProgress } from "@/lib/actionStream";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderOpen,
  History,
  ListVideo,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface DashboardProps {
  onDisconnect: () => void;
}

export type UnsubscribeProgress = StreamProgress;

interface UnsubscribeTarget {
  channelIds: string[];
  preview: { channel_id: string; title: string }[];
  /** Human-readable description of the target, e.g. `category "Tech"`. */
  label?: string;
}

export function Dashboard({ onDisconnect }: DashboardProps) {
  const [disconnecting, setDisconnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [quotaError, setQuotaError] = useState<{ message: string; count: number } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Tab State
  const [activeTab, setActiveTab] = useState("channels");

  // Bumped whenever channel data changes so dependent tabs refetch.
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshKey((n) => n + 1), []);

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

  // Fetch Categories
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
  }, [fetchSyncStatus]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories, refreshKey]);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels, refreshKey]);

  // Sync Action
  const handleSync = async () => {
    setIsSyncing(true);
    setQuotaError(null);
    setActionError(null);
    setSuccessMessage(null);

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
          setSuccessMessage(`Successfully synced ${data.count} channel${data.count === 1 ? "" : "s"}.`);
        }

        bumpRefresh();
      }
    } catch (err) {
      console.error("Failed to sync:", err);
      setActionError("Sync failed. Check your connection and try again.");
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
      setDisconnecting(false);
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
        bumpRefresh();
      }
    } catch (err) {
      console.error("Bulk tag/category error:", err);
    }
  };

  // Unsubscribe State (driven by a target: current selection or a whole category)
  const [unsubscribeTarget, setUnsubscribeTarget] = useState<UnsubscribeTarget | null>(null);
  const [isUnsubscribing, setIsUnsubscribing] = useState(false);
  const [unsubscribeProgress, setUnsubscribeProgress] = useState<StreamProgress | null>(null);

  const handleOpenSelectionUnsubscribe = () => {
    const preview = channels
      .filter((c) => selectedChannelIds.has(c.channel_id))
      .map((c) => ({ channel_id: c.channel_id, title: c.title }));
    setUnsubscribeTarget({ channelIds: Array.from(selectedChannelIds), preview });
  };

  const handleOpenCategoryUnsubscribe = async (cat: string) => {
    try {
      const idsRes = await fetch(`/api/channels?category=${encodeURIComponent(cat)}&allIdsOnly=true`);
      const previewRes = await fetch(`/api/channels?category=${encodeURIComponent(cat)}&page=1&pageSize=50`);
      if (!idsRes.ok || !previewRes.ok) throw new Error("Failed to load channels for category.");

      const idsData = await idsRes.json();
      const previewData = await previewRes.json();
      const channelIds: string[] = idsData.channelIds || [];
      if (channelIds.length === 0) return;

      setUnsubscribeTarget({
        channelIds,
        preview: (previewData.channels || []).map((c: ChannelRecord) => ({
          channel_id: c.channel_id,
          title: c.title,
        })),
        label: `category "${cat}"`,
      });
    } catch (err) {
      console.error("Failed to prepare category unsubscribe:", err);
      setActionError("Could not load the channels for that category. Try again.");
    }
  };

  const handleUnsubscribeConfirm = async () => {
    const target = unsubscribeTarget;
    if (!target || target.channelIds.length === 0) return;

    setIsUnsubscribing(true);
    setUnsubscribeProgress({ processed: 0, total: target.channelIds.length });
    setQuotaError(null);
    setActionError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch("/api/channels/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelIds: target.channelIds }),
      });

      if (res.status === 401) {
        onDisconnect();
        return;
      }

      const { succeeded, failed, quotaStopped } = await readActionStream(res, setUnsubscribeProgress);

      if (quotaStopped) {
        const remaining = target.channelIds.length - succeeded.length - failed.length;
        setQuotaError({
          message: `YouTube API quota limit reached. Unsubscribed ${succeeded.length} channel${
            succeeded.length === 1 ? "" : "s"
          }; ${remaining} channel${remaining === 1 ? "" : "s"} not attempted. You can redo this action from the Activity tab tomorrow.`,
          count: succeeded.length,
        });
      } else if (failed.length > 0) {
        const firstReason = failed[0]?.reason ? ` First error: ${failed[0].reason}` : "";
        setActionError(
          `${failed.length} channel${failed.length === 1 ? "" : "s"} could not be unsubscribed (${succeeded.length} succeeded).${firstReason} You can redo this action from the Activity tab.`
        );
      } else if (succeeded.length > 0) {
        setSuccessMessage(`Successfully unsubscribed from ${succeeded.length} channel${succeeded.length === 1 ? "" : "s"}.`);
      }
    } catch (err: any) {
      console.error("Bulk unsubscribe failed:", err);
      setActionError(
        `${err?.message || "Bulk unsubscribe failed."} Progress up to the interruption was saved; check the Activity tab to redo the remainder.`
      );
    } finally {
      setIsUnsubscribing(false);
      setUnsubscribeProgress(null);
      setUnsubscribeTarget(null);
      setSelectedChannelIds(new Set());
      // Always refresh: the server removes rows as it goes, so even an
      // interrupted batch changed local state.
      bumpRefresh();
    }
  };

  const isAllSelected = totalChannels > 0 && selectedChannelIds.size === totalChannels;
  const totalPages = Math.ceil(totalChannels / pageSize) || 1;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar
        lastSyncedAt={lastSyncedAt}
        isSyncing={isSyncing}
        onSync={handleSync}
        onDisconnect={handleDisconnect}
        disconnecting={disconnecting}
      />

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-4 p-4 pb-32 sm:p-6">
        {/* Quota Exceeded Warning Banner */}
        {quotaError && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div className="space-y-1 text-sm">
              <h4 className="font-semibold text-destructive">YouTube API quota reached</h4>
              <p className="text-sm text-muted-foreground">
                {quotaError.message} Google resets the daily quota (~10,000 units / ~200 deletes) every 24 hours.
              </p>
            </div>
          </div>
        )}

        {/* Action Error Banner */}
        {actionError && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">{actionError}</p>
          </div>
        )}

        {/* Success Message */}
        {successMessage && !quotaError && !actionError && (
          <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
            <CheckCircle2 className="size-5 shrink-0 text-chart-2" />
            <p className="text-sm font-medium text-card-foreground">{successMessage}</p>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
          <TabsList>
            <TabsTrigger value="channels">
              <ListVideo />
              Channels
            </TabsTrigger>
            <TabsTrigger value="categories">
              <FolderOpen />
              Categories
            </TabsTrigger>
            <TabsTrigger value="activity">
              <History />
              Activity
            </TabsTrigger>
            <TabsTrigger value="export">
              <Download />
              Export
            </TabsTrigger>
          </TabsList>

          <TabsContent value="channels" className="space-y-4">
            <ChannelFilters
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
            />

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
              <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span>Show</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span>
                    per page &middot; showing {channels.length} of {totalChannels}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || isLoadingChannels}
                    variant="outline"
                    size="icon-sm"
                    aria-label="Previous page"
                  >
                    <ChevronLeft />
                  </Button>

                  <span className="tabular-nums">
                    Page {page} of {totalPages}
                  </span>

                  <Button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || isLoadingChannels}
                    variant="outline"
                    size="icon-sm"
                    aria-label="Next page"
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="categories">
            <CategoriesTab
              refreshKey={refreshKey}
              onBrowse={(cat) => {
                setCategory(cat);
                setPage(1);
                setActiveTab("channels");
              }}
              onUnsubscribeCategory={handleOpenCategoryUnsubscribe}
            />
          </TabsContent>

          <TabsContent value="activity">
            <ActivityTab
              refreshKey={refreshKey}
              onDataChanged={() => {
                // A redo may have resolved whatever an earlier banner reported.
                setQuotaError(null);
                setActionError(null);
                setSuccessMessage(null);
                bumpRefresh();
              }}
            />
          </TabsContent>

          <TabsContent value="export">
            <ExportControls
              searchQuery={debouncedSearch}
              tagQuery={debouncedTag}
              category={category}
              sortBy={sortBy}
              sortDir={sortDir}
            />
          </TabsContent>
        </Tabs>
      </main>

      {/* Floating Bulk Action Bar (only relevant while browsing channels) */}
      {activeTab === "channels" && (
        <BulkActionBar
          selectedCount={selectedChannelIds.size}
          categories={categories}
          onApply={handleBulkTagCategory}
          onUnsubscribe={handleOpenSelectionUnsubscribe}
          onClearSelection={() => setSelectedChannelIds(new Set())}
        />
      )}

      {/* Unsubscribe Confirmation Modal */}
      <UnsubscribeConfirmModal
        isOpen={unsubscribeTarget !== null}
        selectedChannels={unsubscribeTarget?.preview ?? []}
        totalSelectedCount={unsubscribeTarget?.channelIds.length ?? 0}
        targetLabel={unsubscribeTarget?.label}
        onConfirm={handleUnsubscribeConfirm}
        onCancel={() => {
          if (!isUnsubscribing) setUnsubscribeTarget(null);
        }}
        isUnsubscribing={isUnsubscribing}
        progress={unsubscribeProgress}
      />
    </div>
  );
}

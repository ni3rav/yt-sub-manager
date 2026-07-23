import { useState, useEffect } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { readActionStream, type StreamProgress, type StreamSummary } from "@/lib/actionStream";
import { fetchJson, postJson, categoriesQueryOptions, syncStatusQueryOptions, UnauthorizedError } from "@/lib/api";
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

interface ChannelsResponse {
  channels: ChannelRecord[];
  total: number;
  page: number;
  pageSize: number;
}

interface SyncResponse {
  count: number;
  errors?: { reason: string; message: string }[];
  lastSyncedAt?: string;
}

export function Dashboard({ onDisconnect }: DashboardProps) {
  const queryClient = useQueryClient();

  const [quotaError, setQuotaError] = useState<{ message: string; count: number } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const clearBanners = () => {
    setQuotaError(null);
    setActionError(null);
    setSuccessMessage(null);
  };

  // Tab State
  const [activeTab, setActiveTab] = useState("channels");

  // Filter & Sort State
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [debouncedTag, setDebouncedTag] = useState("");
  const [sortBy, setSortBy] = useState("title");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [category, setCategory] = useState("");

  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Selection State
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(new Set());

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

  // Queries
  const channelsQuery = useQuery({
    queryKey: ["channels", { q: debouncedSearch, tag: debouncedTag, sortBy, sortDir, category, page, pageSize }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (debouncedTag) params.set("tag", debouncedTag);
      if (sortBy) params.set("sortBy", sortBy);
      if (sortDir) params.set("sortDir", sortDir);
      if (category) params.set("category", category);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      return fetchJson<ChannelsResponse>(`/api/channels?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
  });
  const channels = channelsQuery.data?.channels ?? [];
  const totalChannels = channelsQuery.data?.total ?? 0;

  const categoriesQuery = useQuery(categoriesQueryOptions);
  const categories = categoriesQuery.data?.categories ?? [];

  const syncStatusQuery = useQuery(syncStatusQueryOptions);
  const lastSyncedAt = syncStatusQuery.data?.lastSyncedAt ?? null;

  const invalidateChannelData = () => {
    queryClient.invalidateQueries({ queryKey: ["channels"] });
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    queryClient.invalidateQueries({ queryKey: ["actions"] });
  };

  // Mutations
  const syncMutation = useMutation({
    mutationFn: () => postJson<SyncResponse>("/api/sync"),
    onMutate: clearBanners,
    onSuccess: (data) => {
      const quotaErr = data.errors?.find((e) => e.reason === "quotaExceeded");
      if (quotaErr) {
        setQuotaError({
          message: quotaErr.message || "YouTube API daily quota exceeded.",
          count: data.count ?? 0,
        });
      } else {
        setSuccessMessage(`Successfully synced ${data.count} channel${data.count === 1 ? "" : "s"}.`);
      }
      queryClient.invalidateQueries({ queryKey: ["syncStatus"] });
      invalidateChannelData();
    },
    onError: (err) => {
      if (err instanceof UnauthorizedError) return;
      console.error("Failed to sync:", err);
      setActionError(err.message || "Sync failed. Check your connection and try again.");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => postJson("/api/auth/disconnect"),
    onSuccess: onDisconnect,
    onError: (err) => {
      console.error("Disconnect error:", err);
      setActionError("Failed to disconnect. Try again.");
    },
  });

  const tagMutation = useMutation({
    mutationFn: (input: { channelIds: string[]; category?: string; tags?: string[] }) =>
      postJson<{ updatedCount: number }>("/api/channels/tag", input),
    onSuccess: () => {
      setSelectedChannelIds(new Set());
      invalidateChannelData();
    },
    onError: (err) => {
      if (err instanceof UnauthorizedError) return;
      console.error("Bulk tag/category error:", err);
      setActionError(err.message || "Failed to apply category/tags.");
    },
  });

  const handleBulkTagCategory = async (categoryToApply?: string, tagsToApply?: string[]) => {
    if (selectedChannelIds.size === 0) return;
    await tagMutation
      .mutateAsync({
        channelIds: Array.from(selectedChannelIds),
        category: categoryToApply,
        tags: tagsToApply,
      })
      .catch(() => {
        // Errors are surfaced via the mutation's onError banner.
      });
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

        const data = await fetchJson<{ channelIds: string[] }>(`/api/channels?${params.toString()}`);
        setSelectedChannelIds(new Set(data.channelIds || []));
      } catch {
        // Fallback to selecting current page channels
        setSelectedChannelIds(new Set(channels.map((c) => c.channel_id)));
      }
    }
  };

  // Unsubscribe State (driven by a target: current selection or a whole category)
  const [unsubscribeTarget, setUnsubscribeTarget] = useState<UnsubscribeTarget | null>(null);
  const [unsubscribeProgress, setUnsubscribeProgress] = useState<StreamProgress | null>(null);

  const unsubscribeMutation = useMutation({
    mutationFn: async (channelIds: string[]): Promise<StreamSummary> => {
      const res = await fetch("/api/channels/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelIds }),
      });
      if (res.status === 401) throw new UnauthorizedError();
      return readActionStream(res, setUnsubscribeProgress);
    },
    onMutate: (channelIds) => {
      clearBanners();
      setUnsubscribeProgress({ processed: 0, total: channelIds.length });
    },
    onSuccess: ({ succeeded, failed, quotaStopped }, channelIds) => {
      if (quotaStopped) {
        const remaining = channelIds.length - succeeded.length - failed.length;
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
    },
    onError: (err) => {
      if (err instanceof UnauthorizedError) return;
      console.error("Bulk unsubscribe failed:", err);
      setActionError(
        `${err.message || "Bulk unsubscribe failed."} Progress up to the interruption was saved; check the Activity tab to redo the remainder.`
      );
    },
    onSettled: () => {
      setUnsubscribeProgress(null);
      setUnsubscribeTarget(null);
      setSelectedChannelIds(new Set());
      // Always refresh: the server removes rows as it goes, so even an
      // interrupted batch changed local state.
      invalidateChannelData();
    },
  });

  const handleOpenSelectionUnsubscribe = () => {
    const preview = channels
      .filter((c) => selectedChannelIds.has(c.channel_id))
      .map((c) => ({ channel_id: c.channel_id, title: c.title }));
    setUnsubscribeTarget({ channelIds: Array.from(selectedChannelIds), preview });
  };

  const handleOpenCategoryUnsubscribe = async (cat: string) => {
    try {
      const [idsData, previewData] = await Promise.all([
        fetchJson<{ channelIds: string[] }>(`/api/channels?category=${encodeURIComponent(cat)}&allIdsOnly=true`),
        fetchJson<ChannelsResponse>(`/api/channels?category=${encodeURIComponent(cat)}&page=1&pageSize=50`),
      ]);

      const channelIds = idsData.channelIds || [];
      if (channelIds.length === 0) return;

      setUnsubscribeTarget({
        channelIds,
        preview: (previewData.channels || []).map((c) => ({ channel_id: c.channel_id, title: c.title })),
        label: `category "${cat}"`,
      });
    } catch (err) {
      if (err instanceof UnauthorizedError) return;
      console.error("Failed to prepare category unsubscribe:", err);
      setActionError("Could not load the channels for that category. Try again.");
    }
  };

  const handleUnsubscribeConfirm = () => {
    const target = unsubscribeTarget;
    if (!target || target.channelIds.length === 0 || unsubscribeMutation.isPending) return;
    unsubscribeMutation.mutate(target.channelIds);
  };

  const isAllSelected = totalChannels > 0 && selectedChannelIds.size === totalChannels;
  const totalPages = Math.ceil(totalChannels / pageSize) || 1;
  const isSyncing = syncMutation.isPending;
  const disconnecting = disconnectMutation.isPending;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar
        lastSyncedAt={lastSyncedAt}
        isSyncing={isSyncing}
        onSync={() => syncMutation.mutate()}
        onDisconnect={() => disconnectMutation.mutate()}
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
                    disabled={page <= 1 || channelsQuery.isFetching}
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
                    disabled={page >= totalPages || channelsQuery.isFetching}
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
              onDataChanged={() => {
                // A redo may have resolved whatever an earlier banner reported.
                clearBanners();
                invalidateChannelData();
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
          if (!unsubscribeMutation.isPending) setUnsubscribeTarget(null);
        }}
        isUnsubscribing={unsubscribeMutation.isPending}
        progress={unsubscribeProgress}
      />
    </div>
  );
}

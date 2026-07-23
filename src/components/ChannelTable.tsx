import { useId } from "react";
import type { ChannelRecord } from "@/lib/db";
import { PlaySquare } from "lucide-react";

interface ChannelTableProps {
  channels: ChannelRecord[];
  selectedChannelIds: Set<string>;
  onToggleSelectChannel: (channelId: string) => void;
  onToggleSelectPage: () => void;
  onToggleSelectAllMatching: () => void;
  isPageSelected: boolean;
  isAllMatchingSelected: boolean;
  totalChannels: number;
}

const checkboxClassName = "size-4 cursor-pointer rounded border-input accent-primary";

export function ChannelTable({
  channels,
  selectedChannelIds,
  onToggleSelectChannel,
  onToggleSelectPage,
  onToggleSelectAllMatching,
  isPageSelected,
  isAllMatchingSelected,
  totalChannels,
}: ChannelTableProps) {
  const selectAllMatchingId = useId();

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const formatNumber = (num: number | null) => {
    if (num === null || num === undefined) return "N/A";
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(num);
  };

  const parseTags = (tagsJson: string): string[] => {
    try {
      const parsed = JSON.parse(tagsJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  if (channels.length === 0) {
    return (
      <div className="space-y-3 rounded-xl border bg-card p-12 text-center">
        <PlaySquare className="mx-auto size-12 text-muted-foreground" />
        <h3 className="text-lg font-semibold">No channels found</h3>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          No subscriptions match your search or filter criteria. Try clearing filters or syncing your subscriptions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Selection summary / select-all-matching */}
      <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-2 text-sm">
        <label htmlFor={selectAllMatchingId} className="flex cursor-pointer select-none items-center gap-2 font-medium">
          <input
            id={selectAllMatchingId}
            type="checkbox"
            checked={isAllMatchingSelected}
            onChange={onToggleSelectAllMatching}
            className={checkboxClassName}
          />
          <span>Select all matching ({totalChannels})</span>
        </label>
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
          {selectedChannelIds.size} selected
        </span>
      </div>

      {/* Table Container */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-12 px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={isPageSelected}
                    onChange={onToggleSelectPage}
                    aria-label="Select all channels on this page"
                    className={checkboxClassName}
                  />
                </th>
                <th className="px-4 py-3 font-medium">Channel</th>
                <th className="px-4 py-3 font-medium">Category / Tags</th>
                <th className="px-4 py-3 text-right font-medium">Videos</th>
                <th className="px-4 py-3 text-right font-medium">Subscribers</th>
                <th className="px-4 py-3 text-right font-medium">Subscribed</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {channels.map((channel) => {
                const isSelected = selectedChannelIds.has(channel.channel_id);
                const tags = parseTags(channel.tags);

                return (
                  <tr
                    key={channel.channel_id}
                    className={`transition-colors hover:bg-muted/50 ${isSelected ? "bg-muted/50" : ""}`}
                  >
                    {/* Checkbox */}
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelectChannel(channel.channel_id)}
                        aria-label={`Select ${channel.title}`}
                        className={checkboxClassName}
                      />
                    </td>

                    {/* Thumbnail & Title */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {channel.thumbnail_url ? (
                          <img
                            src={channel.thumbnail_url}
                            alt=""
                            width={40}
                            height={40}
                            loading="lazy"
                            decoding="async"
                            className="size-10 shrink-0 rounded-full border object-cover"
                          />
                        ) : (
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-full border bg-muted text-muted-foreground">
                            <PlaySquare className="size-5" />
                          </div>
                        )}
                        <div className="min-w-0 space-y-0.5">
                          <h4 className="line-clamp-1 font-medium">{channel.title}</h4>
                          {channel.description && (
                            <p className="line-clamp-1 max-w-md text-xs text-muted-foreground">
                              {channel.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Category & Tags */}
                    <td className="px-4 py-3">
                      <div className="space-y-1.5">
                        {channel.category ? (
                          <span className="inline-block rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                            {channel.category}
                          </span>
                        ) : (
                          <span className="text-xs italic text-muted-foreground">Uncategorised</span>
                        )}

                        {tags.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1">
                            {tags.map((t, idx) => (
                              <span key={idx} className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Video Count */}
                    <td className="px-4 py-3 text-right tabular-nums">{formatNumber(channel.video_count)}</td>

                    {/* Subscriber Count */}
                    <td className="px-4 py-3 text-right tabular-nums">{formatNumber(channel.subscriber_count)}</td>

                    {/* Subscribed Date */}
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                      {formatDate(channel.subscribed_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

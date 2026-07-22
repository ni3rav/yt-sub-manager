import { useState, useId } from "react";
import type { ChannelRecord } from "@/lib/db";
import { PlaySquare, Calendar, Tv, Users, Tag } from "lucide-react";

interface ChannelTableProps {
  channels: ChannelRecord[];
  selectedChannelIds: Set<string>;
  onToggleSelectChannel: (channelId: string) => void;
  onToggleSelectAll: () => void;
  isAllSelected: boolean;
  totalChannels: number;
}

export function ChannelTable({
  channels,
  selectedChannelIds,
  onToggleSelectChannel,
  onToggleSelectAll,
  isAllSelected,
  totalChannels,
}: ChannelTableProps) {
  const selectAllId = useId();

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
      <div className="p-12 text-center border border-slate-800 rounded-xl bg-slate-900/40 text-slate-400 space-y-3">
        <PlaySquare className="w-12 h-12 text-slate-600 mx-auto" />
        <h3 className="text-lg font-semibold text-slate-300">No channels found</h3>
        <p className="text-sm text-slate-500 max-w-sm mx-auto">
          No subscriptions match your search or filter criteria. Try clearing filters or syncing your subscriptions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Table Selection Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/60 border border-slate-800 rounded-lg text-xs font-mono text-slate-400">
        <div className="flex items-center gap-3">
          <label htmlFor={selectAllId} className="flex items-center gap-2 cursor-pointer select-none font-medium text-slate-300">
            <input
              id={selectAllId}
              type="checkbox"
              checked={isAllSelected}
              onChange={onToggleSelectAll}
              className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span>Select all matching ({totalChannels})</span>
          </label>
        </div>
        <div>
          <span className="px-2.5 py-1 bg-blue-950/60 border border-blue-500/30 text-blue-300 rounded-full font-semibold">
            {selectedChannelIds.size} selected
          </span>
        </div>
      </div>

      {/* Table Container */}
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/60 backdrop-blur-sm shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/80 text-xs uppercase font-semibold text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={onToggleSelectAll}
                    aria-label="Select all channels"
                    className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="py-3.5 px-4">Channel</th>
                <th className="py-3.5 px-4">Category / Tags</th>
                <th className="py-3.5 px-4 text-right">Videos</th>
                <th className="py-3.5 px-4 text-right">Subscribers</th>
                <th className="py-3.5 px-4 text-right">Subscribed Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {channels.map((channel) => {
                const isSelected = selectedChannelIds.has(channel.channel_id);
                const tags = parseTags(channel.tags);

                return (
                  <tr
                    key={channel.channel_id}
                    className={`hover:bg-slate-800/40 transition-colors ${
                      isSelected ? "bg-blue-950/20" : ""
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="py-3.5 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelectChannel(channel.channel_id)}
                        className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>

                    {/* Thumbnail & Title */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        {channel.thumbnail_url ? (
                          <img
                            src={channel.thumbnail_url}
                            alt={channel.title}
                            className="w-10 h-10 rounded-full object-cover border border-slate-700/60 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700/60 flex items-center justify-center shrink-0 text-slate-400">
                            <PlaySquare className="w-5 h-5" />
                          </div>
                        )}
                        <div className="space-y-0.5">
                          <h4 className="font-semibold text-slate-100 line-clamp-1 hover:text-white">
                            {channel.title}
                          </h4>
                          {channel.description && (
                            <p className="text-xs text-slate-400 line-clamp-1 max-w-md">
                              {channel.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Category & Tags */}
                    <td className="py-3.5 px-4">
                      <div className="space-y-1.5">
                        {channel.category ? (
                          <span className="inline-block px-2.5 py-0.5 text-xs font-medium bg-purple-950/60 border border-purple-500/30 text-purple-300 rounded-md">
                            {channel.category}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500 italic">Uncategorised</span>
                        )}

                        {tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 items-center">
                            <Tag className="w-3 h-3 text-slate-500" />
                            {tags.map((t, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 text-[10px] bg-slate-800 border border-slate-700/60 text-slate-300 rounded"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Video Count */}
                    <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                      <div className="flex items-center justify-end gap-1.5">
                        <Tv className="w-3.5 h-3.5 text-slate-500" />
                        <span>{formatNumber(channel.video_count)}</span>
                      </div>
                    </td>

                    {/* Subscriber Count */}
                    <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                      <div className="flex items-center justify-end gap-1.5">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        <span>{formatNumber(channel.subscriber_count)}</span>
                      </div>
                    </td>

                    {/* Subscribed Date */}
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-400">
                      <div className="flex items-center justify-end gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        <span>{formatDate(channel.subscribed_at)}</span>
                      </div>
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

import React from "react";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UnsubscribeConfirmModalProps {
  isOpen: boolean;
  selectedChannels: { channel_id: string; title: string }[];
  totalSelectedCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  isUnsubscribing: boolean;
}

export function UnsubscribeConfirmModal({
  isOpen,
  selectedChannels,
  totalSelectedCount,
  onConfirm,
  onCancel,
  isUnsubscribing,
}: UnsubscribeConfirmModalProps) {
  if (!isOpen) return null;

  const count = totalSelectedCount || selectedChannels.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-6 text-slate-100 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100">Confirm Bulk Unsubscribe</h3>
              <p className="text-xs text-slate-400">
                You are about to unsubscribe from {count} YouTube channel{count === 1 ? "" : "s"}.
              </p>
            </div>
          </div>
          {!isUnsubscribing && (
            <button
              onClick={onCancel}
              className="text-slate-400 hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Warning Banner */}
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-red-200 flex items-start gap-3 text-xs leading-relaxed">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-red-300">This action cannot be undone.</span>
            <p className="mt-1 text-slate-300">
              This will send deletion requests directly to YouTube and remove these subscriptions from your YouTube account and local database.
            </p>
          </div>
        </div>

        {/* Channel Preview List */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-slate-400 font-mono">
            <span>Selected channels ({count})</span>
          </div>
          <div className="max-h-48 overflow-y-auto bg-slate-950 border border-slate-800/80 rounded-xl p-3 space-y-1 text-xs text-slate-300 divide-y divide-slate-800/40">
            {selectedChannels.slice(0, 50).map((ch) => (
              <div key={ch.channel_id} className="pt-1.5 first:pt-0 font-medium truncate">
                {ch.title}
              </div>
            ))}
            {count > 50 && (
              <div className="pt-2 text-slate-400 italic text-center text-xs">
                ...and {count - 50} more channel{count - 50 === 1 ? "" : "s"}
              </div>
            )}
          </div>
        </div>

        {/* Progress or Actions */}
        {isUnsubscribing ? (
          <div className="py-2 text-center space-y-2">
            <div className="flex items-center justify-center gap-2 text-sm font-medium text-red-400">
              <Loader2 className="w-5 h-5 animate-spin text-red-500" />
              <span>Unsubscribing channel by channel...</span>
            </div>
            <p className="text-xs text-slate-400">
              Please wait while YouTube API processes your requests.
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              onClick={onCancel}
              variant="outline"
              className="border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs h-9 px-4"
            >
              Cancel
            </Button>
            <Button
              onClick={onConfirm}
              className="bg-red-600 hover:bg-red-500 text-white font-medium text-xs h-9 px-4 shadow-lg shadow-red-600/20"
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Unsubscribe {count} Channel{count === 1 ? "" : "s"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

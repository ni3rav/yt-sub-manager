import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UnsubscribeProgress } from "./Dashboard";

interface UnsubscribeConfirmModalProps {
  isOpen: boolean;
  selectedChannels: { channel_id: string; title: string }[];
  totalSelectedCount: number;
  /** Optional description of the target, e.g. `category "Tech"`. */
  targetLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isUnsubscribing: boolean;
  progress: UnsubscribeProgress | null;
}

export function UnsubscribeConfirmModal({
  isOpen,
  selectedChannels,
  totalSelectedCount,
  targetLabel,
  onConfirm,
  onCancel,
  isUnsubscribing,
  progress,
}: UnsubscribeConfirmModalProps) {
  if (!isOpen) return null;

  const count = totalSelectedCount || selectedChannels.length;
  const percent = progress && progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm bulk unsubscribe"
    >
      <div className="w-full max-w-lg space-y-5 rounded-xl border bg-card p-6 text-card-foreground shadow-lg">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Trash2 className="size-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Confirm bulk unsubscribe</h3>
              <p className="text-sm text-muted-foreground">
                You are about to unsubscribe from {count} YouTube channel{count === 1 ? "" : "s"}
                {targetLabel ? ` in ${targetLabel}` : ""}.
              </p>
            </div>
          </div>
          {!isUnsubscribing && (
            <Button onClick={onCancel} variant="ghost" size="icon-sm" aria-label="Close">
              <X />
            </Button>
          )}
        </div>

        {/* Warning Banner */}
        <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div>
            <span className="font-semibold text-destructive">This action cannot be undone.</span>
            <p className="mt-1 text-muted-foreground">
              This sends deletion requests directly to YouTube and removes these subscriptions from your YouTube
              account and the local database.
            </p>
          </div>
        </div>

        {/* Channel Preview List */}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Selected channels ({count})</p>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border bg-muted/50 p-3 text-sm">
            {selectedChannels.slice(0, 50).map((ch) => (
              <div key={ch.channel_id} className="truncate font-medium">
                {ch.title}
              </div>
            ))}
            {count > 50 && (
              <div className="pt-1 text-center text-muted-foreground">
                &hellip;and {count - 50} more channel{count - 50 === 1 ? "" : "s"}
              </div>
            )}
          </div>
        </div>

        {/* Progress or Actions */}
        {isUnsubscribing ? (
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-center gap-2 text-sm font-medium">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
              <span>
                Unsubscribed {progress?.processed ?? 0} of {progress?.total ?? count}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Requests are sent one at a time to respect YouTube API limits. Keep this window open.
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button onClick={onCancel} variant="outline">
              Cancel
            </Button>
            <Button onClick={onConfirm} variant="destructive">
              <Trash2 />
              Unsubscribe {count} channel{count === 1 ? "" : "s"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

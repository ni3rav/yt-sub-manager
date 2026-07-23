import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { History, Loader2, RotateCcw, Tag, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readActionStream, type StreamProgress, type StreamSummary } from "@/lib/actionStream";
import { fetchJson, UnauthorizedError } from "@/lib/api";

export interface ActionEntry {
  id: number;
  type: "unsubscribe" | "tag";
  payload: {
    channelIds?: string[];
    titles?: Record<string, string>;
    category?: string;
    tags?: string[];
    redoOf?: number;
  };
  total: number;
  succeededCount: number;
  failedCount: number;
  quotaStopped: boolean;
  createdAt: string;
}

interface ActivityTabProps {
  /** Called after a redo completes so the parent can refresh channel data. */
  onDataChanged: () => void;
}

function describeAction(action: ActionEntry): string {
  if (action.type === "unsubscribe") {
    return `Unsubscribed ${action.succeededCount} of ${action.total} channel${action.total === 1 ? "" : "s"}`;
  }
  const parts: string[] = [];
  if (action.payload.category) parts.push(`category "${action.payload.category}"`);
  if (action.payload.tags && action.payload.tags.length > 0) {
    parts.push(`tag${action.payload.tags.length === 1 ? "" : "s"} ${action.payload.tags.map((t) => `"${t}"`).join(", ")}`);
  }
  const what = parts.length > 0 ? parts.join(" and ") : "tags";
  return `Applied ${what} to ${action.total} channel${action.total === 1 ? "" : "s"}`;
}

function previewTitles(action: ActionEntry): string {
  const titles = Object.values(action.payload.titles ?? {});
  if (titles.length === 0) return "";
  const shown = titles.slice(0, 3).join(", ");
  const rest = titles.length - 3;
  return rest > 0 ? `${shown} and ${rest} more` : shown;
}

function formatTimestamp(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return isoString;
  }
}

function summarizeRedo(summary: StreamSummary): string {
  const bits: string[] = [];
  if (summary.succeeded.length > 0) bits.push(`${summary.succeeded.length} succeeded`);
  if (summary.skipped.length > 0) bits.push(`${summary.skipped.length} already done`);
  if (summary.failed.length > 0) bits.push(`${summary.failed.length} failed`);
  if (summary.quotaStopped) bits.push("stopped by quota");
  return `Redo complete: ${bits.length > 0 ? bits.join(", ") : "nothing left to do"}.`;
}

export function ActivityTab({ onDataChanged }: ActivityTabProps) {
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [redoProgress, setRedoProgress] = useState<StreamProgress | null>(null);
  const [redoResult, setRedoResult] = useState<{ id: number; message: string; isError: boolean } | null>(null);

  const actionsQuery = useQuery({
    queryKey: ["actions"],
    queryFn: () => fetchJson<{ actions: ActionEntry[] }>("/api/actions"),
  });
  const actions = actionsQuery.data?.actions ?? [];

  const redoMutation = useMutation({
    mutationFn: async (action: ActionEntry): Promise<StreamSummary> => {
      const res = await fetch(`/api/actions/${action.id}/redo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.status === 401) throw new UnauthorizedError();
      return readActionStream(res, setRedoProgress);
    },
    onMutate: () => {
      setConfirmingId(null);
      setRedoProgress(null);
      setRedoResult(null);
    },
    onSuccess: (summary, action) => {
      setRedoResult({
        id: action.id,
        message: summarizeRedo(summary),
        isError: summary.failed.length > 0 || summary.quotaStopped,
      });
    },
    onError: (err, action) => {
      if (err instanceof UnauthorizedError) return;
      console.error("Redo failed:", err);
      setRedoResult({ id: action.id, message: err.message || "Redo failed.", isError: true });
    },
    onSettled: () => {
      setRedoProgress(null);
      onDataChanged();
    },
  });

  const redoingId = redoMutation.isPending ? redoMutation.variables?.id : null;

  if (actionsQuery.isPending) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border bg-card p-12 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading activity...
      </div>
    );
  }

  if (actions.length === 0) {
    return (
      <div className="space-y-3 rounded-xl border bg-card p-12 text-center">
        <History className="mx-auto size-12 text-muted-foreground" />
        <h3 className="text-lg font-semibold">No activity yet</h3>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          Bulk unsubscribes and tag/category changes will show up here, and any of them can be redone later.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Recent actions ({actions.length})
      </div>
      <ul className="divide-y">
        {actions.map((action) => {
          const isRedoing = redoingId === action.id;
          const isConfirming = confirmingId === action.id;
          const result = redoResult?.id === action.id ? redoResult : null;
          const titles = previewTitles(action);
          const percent =
            isRedoing && redoProgress && redoProgress.total > 0
              ? Math.round((redoProgress.processed / redoProgress.total) * 100)
              : 0;

          return (
            <li key={action.id} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div
                    className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${
                      action.type === "unsubscribe"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {action.type === "unsubscribe" ? <Trash2 className="size-4" /> : <Tag className="size-4" />}
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium">{describeAction(action)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatTimestamp(action.createdAt)}
                      {titles ? ` \u00b7 ${titles}` : ""}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {action.failedCount > 0 && (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                          {action.failedCount} failed
                        </span>
                      )}
                      {action.quotaStopped && (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                          stopped by quota
                        </span>
                      )}
                      {action.payload.redoOf !== undefined && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                          redo of #{action.payload.redoOf}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isConfirming ? (
                    <>
                      <Button onClick={() => redoMutation.mutate(action)} variant="destructive" size="sm">
                        <RotateCcw />
                        Confirm redo
                      </Button>
                      <Button onClick={() => setConfirmingId(null)} variant="ghost" size="icon-sm" aria-label="Cancel redo">
                        <X />
                      </Button>
                    </>
                  ) : (
                    <Button
                      onClick={() =>
                        action.type === "unsubscribe" ? setConfirmingId(action.id) : redoMutation.mutate(action)
                      }
                      disabled={redoMutation.isPending}
                      variant="outline"
                      size="sm"
                    >
                      {isRedoing ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                      Redo
                    </Button>
                  )}
                </div>
              </div>

              {isRedoing && (
                <div className="space-y-1 pl-11">
                  <p className="text-xs text-muted-foreground">
                    Redoing&hellip; {redoProgress ? `${redoProgress.processed} of ${redoProgress.total}` : "starting"}
                  </p>
                  <div className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
                  </div>
                </div>
              )}

              {result && (
                <p className={`pl-11 text-xs ${result.isError ? "text-destructive" : "text-muted-foreground"}`}>
                  {result.message}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

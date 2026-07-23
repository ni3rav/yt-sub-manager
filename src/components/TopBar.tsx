import { RefreshCw, LogOut, PlaySquare } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TopBarProps {
  lastSyncedAt: string | null;
  isSyncing: boolean;
  onSync: () => void;
  onDisconnect: () => void;
  disconnecting: boolean;
}

export function TopBar({ lastSyncedAt, isSyncing, onSync, onDisconnect, disconnecting }: TopBarProps) {
  const formatTimestamp = (isoString: string | null) => {
    if (!isoString) return "Never synced";
    try {
      const d = new Date(isoString);
      return d.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-background px-4 py-4 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-destructive/10 p-2 text-destructive">
            <PlaySquare className="size-6" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight tracking-tight">YouTube Subscription Manager</h1>
            <p className="text-sm text-muted-foreground">Last synced: {formatTimestamp(lastSyncedAt)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onSync} disabled={isSyncing || disconnecting} size="sm">
            <RefreshCw className={isSyncing ? "animate-spin" : ""} />
            {isSyncing ? "Syncing..." : "Sync now"}
          </Button>

          <Button onClick={onDisconnect} disabled={disconnecting || isSyncing} variant="outline" size="sm">
            <LogOut />
            {disconnecting ? "Disconnecting..." : "Disconnect"}
          </Button>
        </div>
      </div>
    </header>
  );
}

import { useState, useEffect } from "react";
import { PlaySquare, LogOut, CheckCircle2, RefreshCw, Layers, Search, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface DashboardProps {
  onDisconnect: () => void;
}

export function Dashboard({ onDisconnect }: DashboardProps) {
  const [disconnecting, setDisconnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [channelCount, setChannelCount] = useState<number>(0);
  const [quotaError, setQuotaError] = useState<{ message: string; count: number } | null>(null);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchSyncStatus();
  }, []);

  const fetchSyncStatus = async () => {
    try {
      const res = await fetch("/api/sync");
      if (res.ok) {
        const data = await res.json();
        setLastSyncedAt(data.lastSyncedAt || null);
        setChannelCount(data.count || 0);
      }
    } catch (err) {
      console.error("Failed to fetch sync status:", err);
    }
  };

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
        setChannelCount(data.count ?? 0);
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
      } else {
        console.error("Sync error:", data.error);
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
      console.error("Disconnect request error:", err);
    } finally {
      setDisconnecting(false);
    }
  };

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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-red-500 selection:text-white">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-600/10 border border-red-500/20 rounded-xl text-red-500 shadow-sm shadow-red-500/10">
            <PlaySquare className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              YouTube Subscription Manager
            </h1>
            <p className="text-xs text-slate-400">Authenticated &amp; Ready</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Last Synced Badge */}
          <div className="flex items-center gap-2 text-xs font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-300">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Last synced: {formatTimestamp(lastSyncedAt)}</span>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs font-mono bg-emerald-950/40 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Connected</span>
          </div>

          <Button
            onClick={handleSync}
            disabled={isSyncing || disconnecting}
            variant="default"
            size="sm"
            className="bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-2 font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
            <span>{isSyncing ? "Syncing..." : "Sync now"}</span>
          </Button>

          <Button
            onClick={handleDisconnect}
            disabled={disconnecting || isSyncing}
            variant="outline"
            size="sm"
            className="border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white flex items-center gap-2"
          >
            <LogOut className="w-4 h-4 text-red-400" />
            <span>{disconnecting ? "Disconnecting..." : "Disconnect"}</span>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 md:p-10 space-y-6">
        {/* Quota Exceeded Warning Banner */}
        {quotaError && (
          <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 flex items-start gap-3 shadow-lg">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm">
              <h4 className="font-semibold text-amber-300">YouTube API Quota Reached</h4>
              <p className="text-slate-300 text-xs leading-relaxed">
                {quotaError.message} Sync stopped after fetching {quotaError.count} channel
                {quotaError.count === 1 ? "" : "s"}. You can retry syncing tomorrow when Google resets daily quota.
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

        <Card className="bg-slate-900/80 border-slate-800 text-slate-100 shadow-xl">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
              <CheckCircle2 className="w-4 h-4" />
              <span>Google OAuth Session Active</span>
            </div>
            <CardTitle className="text-2xl font-bold text-white">Subscription Management Dashboard</CardTitle>
            <CardDescription className="text-slate-400 text-sm">
              {channelCount > 0
                ? `${channelCount} channels stored in your local SQLite database.`
                : "Your Google OAuth credentials are securely stored and encrypted locally. Click 'Sync now' to fetch your subscriptions."}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
                    <RefreshCw className="w-4 h-4 text-blue-400" />
                    Subscription Sync
                  </div>
                  <span className="text-xs font-mono px-2 py-0.5 bg-blue-950/60 border border-blue-500/30 text-blue-300 rounded">
                    {channelCount} channels
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Paginates through YouTube subscriptions and upserts into local SQLite database safely.
                </p>
                <div className="pt-2">
                  <Button
                    onClick={handleSync}
                    disabled={isSyncing || disconnecting}
                    size="sm"
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center gap-2"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                    <span>{isSyncing ? "Syncing subscriptions..." : "Sync now"}</span>
                  </Button>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
                  <Search className="w-4 h-4 text-amber-400" />
                  Live Search &amp; Filter
                </div>
                <p className="text-xs text-slate-400">
                  Instant search, category tagging, and subscriber count sorting ready to mount.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
                  <Layers className="w-4 h-4 text-purple-400" />
                  Bulk Operations
                </div>
                <p className="text-xs text-slate-400">
                  Bulk tag, categorise, or unsubscribe with quota-aware rate limits.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

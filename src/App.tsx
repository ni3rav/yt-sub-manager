import { useEffect, useState } from "react";
import { Key, ShieldCheck, Server, Lock, ExternalLink, PlaySquare } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import "./index.css";

interface AuthStatus {
  authenticated: boolean;
  setupRequired: boolean;
}

export function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/status")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.json();
      })
      .then((data: AuthStatus) => {
        setAuthStatus(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to check auth status:", err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-red-500 selection:text-white">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-600/10 border border-red-500/20 rounded-xl text-red-500 shadow-sm shadow-red-500/10">
            <PlaySquare className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              YouTube Subscription Manager
            </h1>
            <p className="text-xs text-slate-400">Local-first desktop dashboard</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-400">
          <Server className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          <span>Local Server Active</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-10 space-y-8">
        {/* Banner / Status Card */}
        <Card className="bg-slate-900/80 border-slate-800 backdrop-blur-sm text-slate-100 shadow-xl overflow-hidden relative">
          <div className="absolute top-0 right-0 w-96 h-96 bg-red-600/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
          <CardHeader className="space-y-2 relative z-10">
            <div className="flex items-center gap-2 text-red-400 text-sm font-semibold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" />
              <span>Foundation Setup Complete</span>
            </div>
            <CardTitle className="text-2xl md:text-3xl font-bold tracking-tight text-white">
              Welcome to YT Subscription Manager
            </CardTitle>
            <CardDescription className="text-slate-400 text-sm">
              Your local-only companion for bulk managing, categorizing, and exporting YouTube channel subscriptions securely.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 relative z-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-start gap-3">
                <Lock className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-slate-200">Encrypted Local Store</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Master key generated in OS app data directory with 0600 permissions.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-start gap-3">
                <Key className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-slate-200">Auth Status Endpoint</h4>
                  <p className="text-xs text-slate-400 mt-1 font-mono">
                    {loading ? (
                      "Checking /api/auth/status..."
                    ) : error ? (
                      <span className="text-red-400">Error: {error}</span>
                    ) : (
                      `Authenticated: ${authStatus?.authenticated} | SetupRequired: ${authStatus?.setupRequired}`
                    )}
                  </p>
                </div>
              </div>
            </div>

            {authStatus?.setupRequired && (
              <div className="p-4 rounded-xl bg-red-950/20 border border-red-500/20 text-red-200 text-sm flex items-center justify-between flex-wrap gap-4">
                <span>Google OAuth setup is required to start syncing subscriptions.</span>
                <Button size="sm" variant="outline" className="border-red-500/30 hover:bg-red-500/10 text-red-300">
                  Setup OAuth Client <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <footer className="border-t border-slate-800/60 py-4 text-center text-xs text-slate-500">
        YT Subscription Manager &bull; Local-only &bull; Bun runtime
      </footer>
    </div>
  );
}

export default App;

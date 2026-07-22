import { useState, type FormEvent } from "react";
import { PlaySquare, ExternalLink, Key, Shield, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SetupScreenProps {
  initialError?: string | null;
  onSetupSuccess: (authUrl: string) => void;
}

export function SetupScreen({ initialError, onSetupSuccess }: SetupScreenProps) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError || null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clientId.trim() || !clientSecret.trim()) {
      setError("Please fill out both Client ID and Client Secret.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to initiate OAuth setup.");
      }

      if (data.authUrl) {
        onSetupSuccess(data.authUrl);
      } else {
        throw new Error("No authorization URL returned from server.");
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-red-500 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-600/10 border border-red-500/20 rounded-xl text-red-500 shadow-sm shadow-red-500/10">
            <PlaySquare className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              YouTube Subscription Manager
            </h1>
            <p className="text-xs text-slate-400">First-time Google OAuth Setup</p>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-10 space-y-8">
        {error && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-red-200 flex items-start gap-3 text-sm shadow-lg">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-300">Authentication Error</p>
              <p className="text-red-200/90 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Step-by-Step Instructions Card */}
        <Card className="bg-slate-900/80 border-slate-800 backdrop-blur-sm text-slate-100 shadow-xl overflow-hidden">
          <CardHeader className="space-y-2 border-b border-slate-800/80 bg-slate-900/40 pb-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-red-400 text-xs font-semibold uppercase tracking-wider">
                <Shield className="w-4 h-4" />
                <span>One-Time Setup Instructions</span>
              </div>
              <a
                href="https://console.cloud.google.com/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
              >
                Open Google Cloud Console <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-white">
              Connect your YouTube Account
            </CardTitle>
            <CardDescription className="text-slate-400 text-sm">
              Your credentials remain local-only on your machine, encrypted using AES-256-GCM. Follow these 4 steps to create your Desktop app OAuth Client:
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
                  <span className="w-6 h-6 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center text-xs">
                    1
                  </span>
                  Create a Google Cloud Project
                </div>
                <p className="text-xs text-slate-400 pl-8">
                  Go to Google Cloud Console and create a new project (e.g., "YT Subscription Manager").
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
                  <span className="w-6 h-6 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center text-xs">
                    2
                  </span>
                  Enable YouTube Data API v3
                </div>
                <p className="text-xs text-slate-400 pl-8">
                  Navigate to "APIs & Services" &gt; "Library", search for "YouTube Data API v3", and click Enable.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
                  <span className="w-6 h-6 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center text-xs">
                    3
                  </span>
                  Create Desktop OAuth Credentials
                </div>
                <p className="text-xs text-slate-400 pl-8">
                  Under "Credentials", click "Create Credentials" &gt; "OAuth client ID". Select Application type: <strong className="text-slate-200">Desktop app</strong>.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
                  <span className="w-6 h-6 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center text-xs">
                    4
                  </span>
                  Copy Client ID &amp; Secret
                </div>
                <p className="text-xs text-slate-400 pl-8">
                  Copy the generated Client ID and Client Secret into the credentials form below.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Credentials Form Card */}
        <Card className="bg-slate-900/80 border-slate-800 backdrop-blur-sm text-slate-100 shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
              <Key className="w-5 h-5 text-amber-400" />
              OAuth Credentials
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">
              Enter your Desktop OAuth Client ID and Secret below to connect.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="clientId" className="text-slate-200 text-xs font-semibold">
                  OAuth Client ID
                </Label>
                <Input
                  id="clientId"
                  type="text"
                  placeholder="e.g. 1234567890-xxx.apps.googleusercontent.com"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  disabled={loading}
                  className="bg-slate-950/80 border-slate-800 text-slate-100 placeholder:text-slate-600 focus:border-red-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientSecret" className="text-slate-200 text-xs font-semibold">
                  OAuth Client Secret
                </Label>
                <Input
                  id="clientSecret"
                  type="password"
                  placeholder="e.g. GOCSPX-xxxxxxxxxxxxxxxx"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  disabled={loading}
                  className="bg-slate-950/80 border-slate-800 text-slate-100 placeholder:text-slate-600 focus:border-red-500 font-mono"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-red-600 hover:bg-red-500 text-white font-semibold py-2.5 rounded-xl shadow-lg shadow-red-600/20 transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  "Generating Google Login URL..."
                ) : (
                  <>
                    Connect with Google OAuth <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

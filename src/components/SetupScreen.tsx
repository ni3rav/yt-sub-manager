import { useState, type FormEvent } from "react";
import { PlaySquare, ExternalLink, Key, ArrowRight, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SetupScreenProps {
  initialError?: string | null;
  onSetupSuccess: (authUrl: string) => void;
}

const SETUP_STEPS = [
  {
    title: "Create a Google Cloud project",
    description: 'Go to Google Cloud Console and create a new project (e.g., "YT Subscription Manager").',
  },
  {
    title: "Enable YouTube Data API v3",
    description: 'Navigate to "APIs & Services" > "Library", search for "YouTube Data API v3", and click Enable.',
  },
  {
    title: "Create Desktop OAuth credentials",
    description:
      'Under "Credentials", click "Create Credentials" > "OAuth client ID" and select application type "Desktop app".',
  },
  {
    title: "Copy Client ID & Secret",
    description: "Copy the generated Client ID and Client Secret into the credentials form below.",
  },
];

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
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Top Header */}
      <header className="flex items-center justify-between border-b px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-destructive/10 p-2 text-destructive">
            <PlaySquare className="size-6" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight tracking-tight">YouTube Subscription Manager</h1>
            <p className="text-sm text-muted-foreground">First-time Google OAuth setup</p>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 p-4 sm:p-8">
        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">Authentication error</p>
              <p className="mt-0.5 text-muted-foreground">{error}</p>
            </div>
          </div>
        )}

        {/* Step-by-Step Instructions Card */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-xl tracking-tight">Connect your YouTube account</CardTitle>
              <Button asChild variant="outline" size="sm">
                <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">
                  Open Google Cloud Console <ExternalLink />
                </a>
              </Button>
            </div>
            <CardDescription>
              Your credentials remain local-only on your machine, encrypted using AES-256-GCM. Follow these 4 steps to
              create your Desktop app OAuth client:
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {SETUP_STEPS.map((step, idx) => (
                <div key={step.title} className="space-y-1 rounded-lg border bg-muted/50 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                      {idx + 1}
                    </span>
                    {step.title}
                  </div>
                  <p className="pl-8 text-sm text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Credentials Form Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Key className="size-5 text-muted-foreground" />
              OAuth credentials
            </CardTitle>
            <CardDescription>Enter your Desktop OAuth Client ID and Secret below to connect.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="clientId">OAuth Client ID</Label>
                <Input
                  id="clientId"
                  type="text"
                  placeholder="e.g. 1234567890-xxx.apps.googleusercontent.com"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientSecret">OAuth Client Secret</Label>
                <Input
                  id="clientSecret"
                  type="password"
                  placeholder="e.g. GOCSPX-xxxxxxxxxxxxxxxx"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  disabled={loading}
                  className="font-mono"
                />
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? (
                  "Generating Google login URL..."
                ) : (
                  <>
                    Connect with Google OAuth <ArrowRight />
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

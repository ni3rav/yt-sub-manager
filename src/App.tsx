import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SetupScreen } from "@/components/SetupScreen";
import { Dashboard } from "@/components/Dashboard";
import "./index.css";

interface AuthStatus {
  authenticated: boolean;
  setupRequired?: boolean;
  revokedMessage?: string;
}

// Custom fetch instead of fetchJson: a 401 here is a normal outcome (setup
// required / access revoked), not an error to bubble to the global handler.
async function fetchAuthStatus(): Promise<AuthStatus> {
  const res = await fetch("/api/auth/status");
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data.reason === "auth_revoked") {
    return {
      authenticated: false,
      setupRequired: true,
      revokedMessage: "Your Google access was revoked. Please reconnect.",
    };
  }
  if (res.status === 401) {
    return { authenticated: false, setupRequired: true };
  }
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return data;
}

export function App() {
  const queryClient = useQueryClient();
  const [urlError, setUrlError] = useState<string | null>(null);

  const authQuery = useQuery({
    queryKey: ["auth"],
    queryFn: fetchAuthStatus,
  });

  useEffect(() => {
    // Check if redirect brought back an error query parameter
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      setUrlError(err);
      // Clean query parameter from URL without reload
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleAuthChanged = () => {
    // Drop cached data from the previous session, then re-check auth.
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
    queryClient.invalidateQueries({ queryKey: ["auth"] });
  };

  const handleSetupSuccess = (authUrl: string) => {
    window.location.href = authUrl;
  };

  if (authQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Checking authentication status...
        </div>
      </div>
    );
  }

  if (authQuery.data?.authenticated) {
    return <Dashboard onDisconnect={handleAuthChanged} />;
  }

  return <SetupScreen initialError={urlError || authQuery.data?.revokedMessage || null} onSetupSuccess={handleSetupSuccess} />;
}

export default App;

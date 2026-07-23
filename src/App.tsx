import { useEffect, useState } from "react";
import { SetupScreen } from "@/components/SetupScreen";
import { Dashboard } from "@/components/Dashboard";
import "./index.css";

interface AuthStatus {
  authenticated: boolean;
  setupRequired?: boolean;
}

export function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [urlError, setUrlError] = useState<string | null>(null);

  const checkAuth = () => {
    setLoading(true);
    fetch("/api/auth/status")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401 && data.reason === "auth_revoked") {
          setUrlError("Your Google access was revoked. Please reconnect.");
          setAuthStatus({ authenticated: false, setupRequired: true });
          return;
        }
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        setAuthStatus(data);
      })
      .catch((err) => {
        console.error("Failed to check auth status:", err);
        setAuthStatus({ authenticated: false, setupRequired: true });
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    // Check if redirect brought back an error query parameter
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      setUrlError(err);
      // Clean query parameter from URL without reload
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    checkAuth();
  }, []);

  const handleSetupSuccess = (authUrl: string) => {
    window.location.href = authUrl;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Checking authentication status...
        </div>
      </div>
    );
  }

  if (authStatus?.authenticated) {
    return <Dashboard onDisconnect={checkAuth} />;
  }

  return <SetupScreen initialError={urlError} onSetupSuccess={handleSetupSuccess} />;
}

export default App;

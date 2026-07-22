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
        setAuthStatus({ authenticated: false, setupRequired: true });
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
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center font-sans">
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <div className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
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

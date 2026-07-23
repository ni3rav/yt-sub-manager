import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { UnauthorizedError } from "./api";

// Any 401 from any query or mutation means the stored tokens are gone or
// revoked: re-check auth so the app falls back to the setup screen.
function handleUnauthorized(error: unknown) {
  if (error instanceof UnauthorizedError) {
    queryClient.invalidateQueries({ queryKey: ["auth"] });
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleUnauthorized }),
  mutationCache: new MutationCache({ onError: handleUnauthorized }),
  defaultOptions: {
    queries: {
      // Local single-user server: failures are not transient network blips
      // worth retrying, and focus refetches just cause churn.
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

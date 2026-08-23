import { QueryClient } from "@tanstack/react-query";

// Server responses are deliberately kept separate from playback, radio timing,
// and UI preference state. Those values remain owned by Prism's existing React
// state because they change locally and are not cacheable API resources.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

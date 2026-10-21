import { QueryClient } from "@tanstack/react-query";

/** Query keys, so the dashboard and anything that invalidates them agree. */
export const LISTS_QUERY_KEY = ["lists"] as const;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // One quick retry covers a blip; the default (3 retries with backoff) would
      // leave the user waiting several seconds before an error shows.
      retry: 1,
    },
  },
});

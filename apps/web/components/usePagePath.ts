"use client";
import { usePathname } from "next/navigation";
import { pagePath } from "@/lib/env";

/**
 * usePathname(), except on the status host (WO-62b), where the browser shows `/` for the page prerendered as /status. The window
 * host is read during render on purpose: the server (prerender, no window) already sees /status, and the client's first render must
 * match it, so a useEffect would be too late.
 */
export function usePagePath(): string {
  const pathname = usePathname() ?? "/";
  return pagePath(pathname, typeof window === "undefined" ? null : window.location.host);
}

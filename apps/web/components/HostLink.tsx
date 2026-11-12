"use client";
import Link from "next/link";
import { usePagePath } from "./usePagePath";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { hostTarget } from "@/lib/env";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string; children: ReactNode };

/**
 * A link that never prefetches across hosts (WO-34f). Same host: next/link with prefetch. Other host (SITE ↔ APP), docs origin,
 * external URL: a plain <a> to the absolute URL, so no RSC prefetch is sent to an origin that would answer with a CORS error.
 */
export function HostLink({ href, children, ...rest }: Props) {
  const t = hostTarget(href, usePagePath());
  if (t.cross)
    return (
      <a href={t.href} {...rest}>
        {children}
      </a>
    );
  return (
    <Link href={t.href} {...rest}>
      {children}
    </Link>
  );
}

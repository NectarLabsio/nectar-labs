"use client";
import type { ReactNode } from "react";
import type { FeatureName } from "@nectar/sdk";
import { useChain } from "./AppProvider";

// Landing module gates. They read the flags from the app context (config.yaml `features:`, plus the localhost-only E2E override)
// rather than from the server render, so the page and its E2E specs agree on one source of flag state.

function firstOn(features: Record<FeatureName, boolean>, names: FeatureName | FeatureName[]): FeatureName | null {
  for (const n of Array.isArray(names) ? names : [names]) if (features[n]) return n;
  return null;
}

/** A landing section that renders only when one of its flags is on; tagged data-feature="<first flag on>". */
export function Module({ name, children, className = "sec", id }: { name: FeatureName | FeatureName[]; children: ReactNode; className?: string; id?: string }) {
  const on = firstOn(useChain().config.features, name);
  if (!on) return null;
  return (
    <section className={className} id={id} data-feature={on}>
      {children}
    </section>
  );
}

/** A block inside a section that renders only when its flag is on. */
export function On({ name, children }: { name: FeatureName; children: ReactNode }) {
  return useChain().config.features[name] ? <div data-feature={name}>{children}</div> : null;
}

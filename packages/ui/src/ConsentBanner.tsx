"use client";
import { useEffect, useState } from "react";
import { Button } from "./primitives";

export const CONSENT_KEY = "nectar-consent";
export const CONSENT_OPEN_EVENT = "nectar:consent-open";
export const CONSENT_CHANGED_EVENT = "nectar:consent-changed";
const MAX_AGE_MS = 180 * 864e5;

export interface Consent { v: 1; analytics: boolean; at: number }

export function readConsent(): Consent | null {
  try {
    const c = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? "null") as Consent | null;
    if (!c || c.v !== 1 || Date.now() - c.at > MAX_AGE_MS) return null;
    return c;
  } catch {
    return null;
  }
}

/** True only after an explicit "Accept analytics". Default off. */
export function analyticsAllowed(): boolean {
  return readConsent()?.analytics === true;
}

export function openConsent() {
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}

/** Overlays the banner steps aside for: any open modal dialog. Apps append third-party overlays such as a wallet selector. */
export const CONSENT_YIELD_TO = '[aria-modal="true"]';

function overlayShown(selector: string): boolean {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    if (typeof el.checkVisibility === "function" ? el.checkVisibility() : getComputedStyle(el).display !== "none") return true;
  }
  return false;
}

/**
 * True while an element matching `selector` is shown. Watches inserts and removals under <body> and the style, class and
 * hidden attributes of each match (some overlays stay mounted and toggle `display`).
 */
function useOverlayShown(selector: string): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!selector || typeof MutationObserver === "undefined") return;
    const watched = new WeakSet<Element>();
    const attrs = new MutationObserver(() => setShown(overlayShown(selector)));
    const sync = () => {
      for (const el of document.querySelectorAll(selector)) {
        if (watched.has(el)) continue;
        watched.add(el);
        attrs.observe(el, { attributes: true, attributeFilter: ["style", "class", "hidden"] });
      }
      setShown(overlayShown(selector));
    };
    const tree = new MutationObserver(sync);
    tree.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => {
      tree.disconnect();
      attrs.disconnect();
    };
  }, [selector]);
  return shown;
}

/** `yieldTo`: CSS selector; while a match is shown the banner is hidden so it never sits under or over it, then it comes back. */
/** `analytics`: whether this build has an analytics id configured; the copy says so (WO-34b §9). */
export function ConsentBanner({ yieldTo = CONSENT_YIELD_TO, analytics = false }: { yieldTo?: string; analytics?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const covered = useOverlayShown(open ? yieldTo : "");
  useEffect(() => {
    if (!readConsent()) setOpen(true);
    const onOpen = () => setOpen(true);
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
  }, []);
  const choose = (analytics: boolean) => {
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ v: 1, analytics, at: Date.now() } satisfies Consent));
    } catch {
      /* storage blocked: treat as declined */
    }
    window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT));
    setOpen(false);
  };
  if (!open || covered) return null;
  return (
    <div className="consent" role="dialog" aria-label="Cookie preferences" data-testid="consent">
      <strong className="heading-text">Cookies and storage</strong>
      <span>
        This site keeps your theme, this choice and a wallet-session flag in your browser&apos;s local storage; the wallet connector keeps its own session
        there too. No cookies are set.{" "}
        {analytics ? "Analytics load only if you accept." : "No analytics are configured in this build, so nothing loads if you accept."} We never join wallet
        addresses to IP addresses in logs we control. Your browser talks directly to the NEAR and Solana RPC providers, which see your IP and the accounts you query.
      </span>
      <div className="acts">
        <Button variant="primary" size="sm" onClick={() => choose(true)}>
          Accept analytics
        </Button>
        <Button size="sm" onClick={() => choose(false)} data-testid="consent-decline">
          Decline
        </Button>
      </div>
    </div>
  );
}

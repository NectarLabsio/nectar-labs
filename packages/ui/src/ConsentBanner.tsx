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

export function ConsentBanner() {
  const [open, setOpen] = useState(false);
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
  if (!open) return null;
  return (
    <div className="consent" role="dialog" aria-label="Cookie preferences" data-testid="consent">
      <strong className="heading-text">Cookies and storage</strong>
      <span>
        This site stores your theme, this choice and your wallet session in your browser. Analytics load only if you accept, and only on the production site. Wallet
        addresses are never joined to IPs.
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

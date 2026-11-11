import React, { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from '@docusaurus/Link';
import { useLocation } from '@docusaurus/router';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

// Consent gate (D-006). Default: no analytics script is ever requested.
// Storage: localStorage `nectar-consent` = {v, analytics, at}; 180-day expiry; version bump re-asks.
// Analytics are injected only when (a) the build is production with DOCS_ANALYTICS set (H4) and
// (b) the stored choice is "accept". Declining stores the decline and loads nothing.
const CONSENT_KEY = 'nectar-consent';
const VERSION = 1;
const DAYS = 180;
const SETTINGS_HASH = '#cookie-settings';

type Consent = { v: number; analytics: boolean; at: number };
type Fields = { analytics?: string; ga4Id?: string; plausibleDomain?: string };
type Gtag = (...args: unknown[]) => void;
declare global { interface Window { dataLayer?: unknown[]; gtag?: Gtag } }

function readConsent(): Consent | null {
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<Consent>;
    if (c.v !== VERSION || typeof c.at !== 'number' || typeof c.analytics !== 'boolean') return null;
    if (Date.now() - c.at > DAYS * 86_400_000) return null;
    return c as Consent;
  } catch {
    return null;
  }
}

function writeConsent(analytics: boolean): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify({ v: VERSION, analytics, at: Date.now() }));
  } catch {
    /* storage blocked: the banner simply shows again next visit */
  }
}

function addScript(attrs: Record<string, string>, inline?: string): void {
  const s = document.createElement('script');
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
  if (inline) s.text = inline;
  document.head.appendChild(s);
}

let loaded = false;
function loadAnalytics(f: Fields): void {
  if (loaded || typeof window === 'undefined') return;
  if (f.analytics === 'ga4' && f.ga4Id) {
    // Same loader URL as @docusaurus/plugin-google-gtag 3.10.2, but only after consent. No `anonymize_ip`: a Universal Analytics
    // parameter that GA4 does not use (review 2, C14).
    addScript({ async: '', src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(f.ga4Id)}` });
    window.dataLayer = window.dataLayer ?? [];
    const gtag: Gtag = (...args) => { window.dataLayer?.push(args); };
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', f.ga4Id);
    loaded = true;
  } else if (f.analytics === 'plausible' && f.plausibleDomain) {
    addScript({ defer: '', 'data-domain': f.plausibleDomain, src: 'https://plausible.io/js/script.js' });
    loaded = true;
  }
}

export default function Root({ children }: { children: ReactNode }): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  const fields = siteConfig.customFields as Fields;
  const location = useLocation();
  const [show, setShow] = useState(false);
  const [current, setCurrent] = useState<Consent | null>(null);

  useEffect(() => {
    const c = readConsent();
    setCurrent(c);
    if (!c) setShow(true);
    else if (c.analytics) loadAnalytics(fields);
  }, [fields]);

  useEffect(() => {
    if (location.hash === SETTINGS_HASH) setShow(true);
    if (loaded && window.gtag && fields.analytics === 'ga4') {
      window.gtag('event', 'page_view', { page_path: location.pathname });
    }
  }, [location, fields.analytics]);

  const decide = useCallback((accept: boolean) => {
    writeConsent(accept);
    setCurrent(readConsent());
    if (accept) loadAnalytics(fields);
    else if (loaded && window.gtag) window.gtag('consent', 'update', { analytics_storage: 'denied' });
    setShow(false);
  }, [fields]);

  const vendor = fields.analytics === 'off' || !fields.analytics ? 'none configured on this build' : fields.analytics;
  return (
    <>
      {children}
      {show && (
        <div className="nectar-consent" role="dialog" aria-modal="false" aria-labelledby="nectar-consent-title">
          <p id="nectar-consent-title" className="nectar-consent__title">Cookie and storage preferences</p>
          <p className="nectar-consent__body">
            This site keeps your theme and this choice in your browser. Analytics ({vendor}) load only if you
            accept. <Link to="/legal/cookies">Cookie policy</Link>
            {current ? ` · current choice: ${current.analytics ? 'accepted' : 'declined'}` : ''}
          </p>
          <div className="nectar-consent__actions">
            <button id="consent-accept" type="button" className="button button--primary button--sm" onClick={() => decide(true)}>Accept analytics</button>
            <button id="consent-decline" type="button" className="button button--secondary button--sm" onClick={() => decide(false)}>Decline</button>
          </div>
        </div>
      )}
    </>
  );
}

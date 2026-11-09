import React, { useEffect, useState } from 'react';
// Consent gate: nothing analytics-related runs until the visitor accepts. Stored per browser only.
const KEY = 'nectar-consent'; const VERSION = 1; const DAYS = 180;
type Consent = { v: number; analytics: boolean; at: number };
function read(): Consent | null { try { const r = localStorage.getItem(KEY); if (!r) return null; const c = JSON.parse(r) as Consent; if (c.v !== VERSION || Date.now() - c.at > DAYS * 864e5) return null; return c; } catch { return null; } }
function write(analytics: boolean) { try { localStorage.setItem(KEY, JSON.stringify({ v: VERSION, analytics, at: Date.now() })); } catch {} }
declare global { interface Window { gtag?: (...a: unknown[]) => void; plausible?: unknown } }
export default function Root({ children }: { children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const c = read();
    if (!c) { setShow(true); if (window.gtag) window.gtag('consent', 'default', { analytics_storage: 'denied' }); return; }
    if (window.gtag) window.gtag('consent', 'update', { analytics_storage: c.analytics ? 'granted' : 'denied' });
  }, []);
  const decide = (ok: boolean) => { write(ok); if (window.gtag) window.gtag('consent', 'update', { analytics_storage: ok ? 'granted' : 'denied' }); setShow(false); };
  return (<>
    {children}
    {show && (
      <div role="dialog" aria-label="Cookie preferences" style={{ position: 'fixed', insetInline: 16, bottom: 16, maxWidth: 560, margin: '0 auto', padding: 16, borderRadius: 12, background: 'var(--ifm-background-surface-color)', border: '1px solid var(--ifm-color-emphasis-300)', zIndex: 50 }}>
        <p style={{ margin: 0 }}>This site stores your theme and this choice in your browser. Analytics load only if you accept. <a href="/legal/cookies">Cookie policy</a></p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button id="consent-accept" className="button button--primary button--sm" onClick={() => decide(true)}>Accept analytics</button>
          <button id="consent-decline" className="button button--secondary button--sm" onClick={() => decide(false)}>Decline</button>
        </div>
      </div>)}
  </>);
}

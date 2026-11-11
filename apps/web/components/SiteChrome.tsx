"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CONSENT_CHANGED_EVENT, CONSENT_YIELD_TO, ChainMark, Chip, ConsentBanner, Footer, Nav, SessionChip, analyticsAllowed, type LinkLike, type NavLink } from "@nectar/ui";
import { sessionHeadline, sessionReasonText, sessionStatus, type ExitCapacity } from "@nectar/sdk";
import { LandingNav } from "./landing/LandingNav";
import { GA_ID, docsHref, repoHref } from "@/lib/env";
import { HostLink } from "./HostLink";
import { NEAR_CONNECT_POPUP } from "@/lib/wallet/near-connect";
import { useChain, useFeature, useView, useWallet } from "./AppProvider";

/** API routes (footer "Status" → /api/health) are plain anchors: the client router must never RSC-prefetch a JSON route (GATE_FAIL_G3B_R2).
 *  Cross-host links (SITE ↔ APP, docs) are plain anchors too (HostLink, WO-34f); same-host links keep next/link prefetch. */
const NextLink: LinkLike = ({ href, children, ...rest }) =>
  href.startsWith("/api/") ? (
    <a href={href} {...rest}>
      {children}
    </a>
  ) : (
    <HostLink href={href} {...rest}>
      {children}
    </HostLink>
  );

function WalletButton() {
  const w = useWallet();
  if (w.accountId)
    return (
      <button type="button" className="nx-wallet" onClick={w.disconnect} title={`Connected as ${w.accountId}. Click to disconnect.`} data-testid="wallet-button">
        <span className="acct wallet-btn">{w.accountId}</span>
        <span className="nx-avatar" aria-hidden="true" />
      </button>
    );
  return (
    <button type="button" className="nx-wallet connect" onClick={w.connect} disabled={w.connecting} aria-busy={w.connecting || undefined} data-testid="wallet-button">
      {w.connecting ? "Connecting…" : "Connect wallet"}
    </button>
  );
}

/** Session chip from get_exit_capacity (mint open, amber weekend parameters, grey while unknown). */
function NavSession() {
  const { deployed, config } = useChain();
  const sym = config.collaterals[0]?.symbol ?? "NVDAx";
  const cap = useView<ExitCapacity>((v) => v.getExitCapacity(sym), [sym]);
  if (!deployed) return null;
  if (!cap.data) return <SessionChip tone="off" label={cap.error ? "Session unavailable" : "Reading session"} short={cap.error ? "n/a" : "…"} />;
  const st = sessionStatus(cap.data, config.v7.session_stale_s);
  return <SessionChip tone={st.open ? "open" : "weekend"} label={sessionHeadline(st)} short={st.open ? "Open" : "Weekend"} title={sessionReasonText(st)} />;
}

export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  if (pathname === "/") return <LandingNav />;
  const links: NavLink[] = [
    { href: "/feed", label: "Markets", match: ["/feed"] },
    { href: "/borrow", label: "Borrow", match: ["/borrow", "/shield"] },
    { href: "/quote", label: "Earn", match: ["/quote", "/reserve"] },
    // /notes is the Portfolio: loans and deposits work with Position Notes off; only its Notes tab depends on the flag.
    { href: "/notes", label: "Portfolio", match: ["/notes", "/note", "/position"] },
    { href: "/agents", label: "Agents" },
    { href: "/console", label: "Curator", match: ["/console", "/keepers"] },
  ];
  return (
    <Nav
      links={links}
      pathname={pathname}
      Link={NextLink}
      session={<NavSession />}
      network={
        <Chip title="NEAR testnet, mock collateral">
          <ChainMark chain="near" />
          Testnet
        </Chip>
      }
      actions={<WalletButton />}
    />
  );
}

export function SiteFooter({ contact }: { contact: string | null }) {
  const docs = docsHref();
  const repo = repoHref();
  const pathname = usePathname() ?? "/";
  const shieldsOn = useFeature("shields");
  const reserveOn = useFeature("reserve");
  const notesOn = useFeature("notes");
  return (
    <Footer
      giant={pathname === "/"}
      Link={NextLink}
      email={contact}
      columns={[
        {
          title: "Products",
          links: [
            { href: "/", label: "Nectar Labs" },
            { href: "/feed", label: "Nectar Feed" },
            ...(shieldsOn ? [{ href: "/shield", label: "Shields" }] : []),
            ...(reserveOn ? [{ href: "/reserve", label: "Reserve" }] : []),
            ...(notesOn ? [{ href: "/notes", label: "Position Notes" }] : []),
            { href: "/keepers", label: "Keepers" },
            { href: "/quote/new", label: "Post a quote" },
          ],
        },
        {
          title: "Protocols",
          links: [
            { href: "https://near.org", label: "NEAR", external: true },
            { href: "https://solana.com", label: "Solana", external: true },
            { href: "https://docs.near.org/chain-abstraction/chain-signatures", label: "Chain Signatures", external: true },
            { href: "https://outlayer.ai", label: "OutLayer", external: true },
            { href: "https://near-intents.org", label: "NEAR Intents", external: true },
          ],
        },
        { title: "Build", links: [{ href: docs, label: "Docs" }, { href: docsHref("integrate/sdk"), label: "SDK" }, { href: docsHref("integrate/feed-mcp"), label: "Feed MCP" }, { href: "/status", label: "Status" }, { href: "/changelog", label: "Changelog" }, ...(repo ? [{ href: repo, label: "Source", external: true }] : [])] },
        { title: "Resources", links: [{ href: "/security", label: "Security" }, { href: "/brand", label: "Brand assets" }, { href: docsHref("project/evidence"), label: "Evidence" }] },
        { title: "Company", links: [{ href: "/about", label: "About" }, { href: "/talk", label: "Talk to us" }, ...(contact ? [{ href: `mailto:${contact}`, label: contact }] : [])] },
        { title: "Legal", links: [{ href: "/legal/privacy", label: "Privacy" }, { href: "/legal/cookies", label: "Cookies" }, { href: "/legal/terms", label: "Terms" }, { href: "/legal/disclaimers", label: "Disclaimers" }] },
      ]}
    />
  );
}

/** gtag loads only after an explicit "Accept analytics", and only when a GA id is configured (TODO-H4). */
function Analytics() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const check = () => setOn(Boolean(GA_ID) && analyticsAllowed());
    check();
    window.addEventListener(CONSENT_CHANGED_EVENT, check);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, check);
  }, []);
  useEffect(() => {
    if (!on || document.getElementById("ga-src")) return;
    const s = document.createElement("script");
    s.id = "ga-src";
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
    document.head.appendChild(s);
    const w = window as unknown as { dataLayer: unknown[]; gtag: (...a: unknown[]) => void };
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag(...a: unknown[]) {
      w.dataLayer.push(a);
    };
    w.gtag("js", new Date());
    w.gtag("config", GA_ID);
  }, [on]);
  return null;
}

/** The cookie banner steps aside while any modal or the near-connect wallet selector is open, then comes back (WO-51). */
const CONSENT_YIELD = `${CONSENT_YIELD_TO}, ${NEAR_CONNECT_POPUP}`;

export function SiteOverlays() {
  return (
    <>
      <ConsentBanner yieldTo={CONSENT_YIELD} analytics={Boolean(GA_ID)} />
      <Analytics />
    </>
  );
}

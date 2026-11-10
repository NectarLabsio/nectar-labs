"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, CONSENT_CHANGED_EVENT, ConsentBanner, Footer, Nav, analyticsAllowed, type LinkLike } from "@nectar/ui";
import { CONTACT_EMAIL, GA_ID, docsHref } from "@/lib/env";
import { useWallet } from "./AppProvider";

const NextLink: LinkLike = ({ href, children, ...rest }) => (
  <Link href={href} {...rest}>
    {children}
  </Link>
);

const NAV = [
  { href: "/feed", label: "Feed" },
  { href: "/borrow", label: "Borrow" },
  { href: "/quote/new", label: "Post a quote" },
  { href: "/console", label: "Console" },
  { href: "/agents", label: "Agents" },
  { href: "/keepers", label: "Keepers" },
];

function WalletButton() {
  const w = useWallet();
  if (w.accountId)
    return (
      <Button size="sm" onClick={w.disconnect} title={`Connected as ${w.accountId}. Click to disconnect.`} data-testid="wallet-button">
        <span className="wallet-btn">{w.accountId}</span>
      </Button>
    );
  return (
    <Button variant="primary" size="sm" onClick={w.connect} loading={w.connecting} data-testid="wallet-button">
      Connect wallet
    </Button>
  );
}

export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  return (
    <>
      <div className="ribbon" role="note">
        Testnet demo · mock collateral (NVDAx) · unaudited
      </div>
      <Nav links={NAV} pathname={pathname} Link={NextLink} actions={<WalletButton />} />
    </>
  );
}

export function SiteFooter() {
  const docs = docsHref();
  return (
    <Footer
      Link={NextLink}
      email={CONTACT_EMAIL}
      columns={[
        { title: "Products", links: [{ href: "/", label: "Nectar Labs" }, { href: "/feed", label: "Nectar Feed" }, { href: "/keepers", label: "Keepers" }, { href: "/quote/new", label: "Post a quote" }] },
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
        { title: "Build", links: [{ href: docs, label: "Docs" }, { href: docsHref("integrate/sdk"), label: "SDK" }, { href: docsHref("integrate/feed-mcp"), label: "Feed MCP" }, { href: "/api/health", label: "Status" }] },
        { title: "Resources", links: [{ href: docsHref("concepts/whitepaper"), label: "Whitepaper" }, { href: "/security", label: "Security" }, { href: docsHref("project/brand"), label: "Brand assets" }, { href: docsHref("project/evidence"), label: "Evidence" }] },
        { title: "Company", links: [{ href: "/talk", label: "Talk to us" }, { href: `mailto:${CONTACT_EMAIL}`, label: CONTACT_EMAIL }] },
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
    w.gtag("config", GA_ID, { anonymize_ip: true });
  }, [on]);
  return null;
}

export function SiteOverlays() {
  return (
    <>
      <ConsentBanner />
      <Analytics />
    </>
  );
}

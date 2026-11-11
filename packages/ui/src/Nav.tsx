"use client";
import type { ComponentType, ReactNode } from "react";
import { useState } from "react";
import { ThemeToggle } from "./theme";
import { openConsent } from "./ConsentBanner";

export interface LinkLikeProps {
  href: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  "aria-current"?: "page" | undefined;
}
export type LinkLike = ComponentType<LinkLikeProps>;
const A: LinkLike = ({ children, ...p }) => <a {...p}>{children}</a>;

/** Mark + "nectar" wordmark only ("labs" is never appended, DESIGN_SYSTEM §4). Files served from `base`. */
export function Lockup({ base = "/brand", size = "nav", Link = A, href = "/" }: { base?: string; size?: "nav" | "footer"; Link?: LinkLike; href?: string | null }) {
  const m = size === "nav" ? 34 : 30;
  const h = size === "nav" ? 17 : 15;
  const inner = (
    <>
      <img className="mark" src={`${base}/mark-flat-96.png`} alt="" width={m} height={m} />
      <img className="wm only-dark" src={`${base}/wordmark-muted-100.png`} alt="nectar" height={h} width={Math.round((h * 392) / 100)} />
      <img className="wm only-light" src={`${base}/wordmark-dark-100.png`} alt="nectar" height={h} width={Math.round((h * 392) / 100)} />
    </>
  );
  if (href === null) return <span className="lockup">{inner}</span>;
  return (
    <Link className="lockup" href={href}>
      {inner}
      <span className="sr-only">Nectar Labs home</span>
    </Link>
  );
}

export interface NavLink {
  href: string;
  label: string;
  /** Path prefixes that mark this task current (default: href). Borrow covers /shield, Earn covers /reserve, and so on. */
  match?: string[];
}

export interface NavProps {
  links: NavLink[];
  pathname: string;
  Link?: LinkLike;
  /** Session chip (SessionChip from ./app). */
  session?: ReactNode;
  /** Network chip, e.g. "Testnet". Hidden at phone width. */
  network?: ReactNode;
  /** Wallet button. */
  actions?: ReactNode;
  brandBase?: string;
}

function isCurrent(l: NavLink, pathname: string) {
  const ms = l.match ?? [l.href];
  return ms.some((m) => (m === "/" ? pathname === "/" : pathname === m || pathname.startsWith(m + "/")));
}

/**
 * App top bar v2 (DESIGN_SYSTEM §3c): logo, tasks with a mint underline, session chip, network chip, wallet.
 * At phone width the tasks move to a second row that scrolls inside itself, so the page never scrolls sideways.
 */
export function Nav({ links, pathname, Link = A, session, network, actions, brandBase }: NavProps) {
  return (
    <header className="nx-nav">
      <div className="nx-nav-in">
        <Lockup base={brandBase} Link={Link} />
        <nav className="nx-nav-links" aria-label="Main">
          {links.map((l) => {
            const current = isCurrent(l, pathname);
            return (
              <Link key={l.href} href={l.href} className={current ? "on" : undefined} aria-current={current ? "page" : undefined}>
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="nx-nav-right">
          {session}
          {network ? <span className="nx-hide-s">{network}</span> : null}
          {actions}
        </div>
      </div>
    </header>
  );
}

export interface FooterLink { href: string; label: string; external?: boolean }
export interface FooterProps {
  columns: Array<{ title: string; links: FooterLink[] }>;
  Link?: LinkLike;
  brandBase?: string;
  /** Contact address for mailto links (config.yaml site.contact); null hides nothing but the copy behaviour. */
  email?: string | null;
  /** Giant wordmark fading into the page under the bottom bar (landing). */
  giant?: boolean;
}

export function Footer({ columns, Link = A, brandBase = "/brand", email, giant }: FooterProps) {
  const [copied, setCopied] = useState(false);
  return (
    <footer className="site">
      <div className="wrap">
        <nav className="fgrid" aria-label="Footer">
          <div className="brand">
            <Lockup base={brandBase} size="footer" Link={Link} />
            <p>Committed liquidity, verifiable settlement.</p>
            <p>A Nectar Network product · testnet · mock collateral</p>
          </div>
          {columns.map((c) => (
            <div className="fcol" key={c.title}>
              <h2>{c.title}</h2>
              {c.links.map((l) =>
                l.href.startsWith("mailto:") && email ? (
                  <a
                    key={l.label}
                    href={l.href}
                    onClick={(e) => {
                      if (navigator.clipboard?.writeText) {
                        e.preventDefault();
                        navigator.clipboard.writeText(email).then(
                          () => {
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1600);
                          },
                          () => {
                            window.location.href = l.href;
                          },
                        );
                      }
                    }}
                  >
                    {copied ? `copied: ${email}` : l.label}
                  </a>
                ) : l.external ? (
                  <a key={l.label} href={l.href} target="_blank" rel="noreferrer noopener">
                    {l.label}
                  </a>
                ) : (
                  <Link key={l.label} href={l.href}>
                    {l.label}
                  </Link>
                ),
              )}
            </div>
          ))}
        </nav>
        <div className="fbar">
          <span>© 2026 Nectar Network · MIT License · Unaudited testnet software</span>
          <span className="r">
            <button type="button" className="ghost" onClick={openConsent}>
              Cookie settings
            </button>
            <ThemeToggle />
          </span>
        </div>
      </div>
      {giant ? <div className="nx-giant" aria-hidden="true" style={{ WebkitMaskImage: `url(${brandBase}/wordmark-giant.png)`, maskImage: `url(${brandBase}/wordmark-giant.png)` }} /> : null}
    </footer>
  );
}

"use client";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useState } from "react";
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

export interface NavProps {
  links: Array<{ href: string; label: string }>;
  pathname: string;
  Link?: LinkLike;
  actions?: ReactNode;
  brandBase?: string;
}

export function Nav({ links, pathname, Link = A, actions, brandBase }: NavProps) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  return (
    <nav className="top" aria-label="Main">
      <div className="wrap">
        <Lockup base={brandBase} Link={Link} />
        <div className={`links ${open ? "open" : ""}`} id="nav-links">
          {links.map((l) => {
            const current = l.href === "/" ? pathname === "/" : pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link key={l.href} href={l.href} aria-current={current ? "page" : undefined} onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            );
          })}
        </div>
        <div className="navbtns">
          <ThemeToggle className="hide-sm" />
          {actions}
          <button type="button" className="btn sm menu" aria-expanded={open} aria-controls="nav-links" onClick={() => setOpen((o) => !o)}>
            Menu
          </button>
        </div>
      </div>
    </nav>
  );
}

export interface FooterLink { href: string; label: string; external?: boolean }
export interface FooterProps {
  columns: Array<{ title: string; links: FooterLink[] }>;
  Link?: LinkLike;
  brandBase?: string;
  email: string;
}

export function Footer({ columns, Link = A, brandBase, email }: FooterProps) {
  const [copied, setCopied] = useState(false);
  return (
    <footer className="site">
      <div className="wrap">
        <div className="fgrid">
          <div className="brand">
            <Lockup base={brandBase} size="footer" Link={Link} />
            <p>Committed liquidity, verifiable settlement.</p>
            <p>A Nectar Network product · testnet · mock collateral</p>
          </div>
          {columns.map((c) => (
            <div className="fcol" key={c.title}>
              <h2>{c.title}</h2>
              {c.links.map((l) =>
                l.href.startsWith("mailto:") ? (
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
        </div>
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
    </footer>
  );
}

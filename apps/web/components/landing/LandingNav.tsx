"use client";
import { HostLink as Link } from "../HostLink";
import { useEffect, useState } from "react";
import { currentTheme, setTheme } from "@nectar/ui";
import { docsHref } from "@/lib/env";
import { useChain } from "../AppProvider";
import s from "./landing.module.css";

/** Landing top bar (landing/index.html): section anchors in a glass pill, theme, menu, "Try on testnet" into the app. */
export function LandingNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // WO-35i: the same config flags as the landing sections (Module / On), so the anchors match the server HTML before and after hydration.
  const { features } = useChain().config;
  const shields = features.shields === true;
  const reserve = features.reserve === true;
  const sol = features.solana_remote === true;
  const base = features.base === true;
  const chains = sol || base;
  useEffect(() => {
    const on = () => setScrolled(scrollY > 8);
    on();
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);
  const links: Array<[string, string]> = [
    ["#how", "How it works"],
    ...(shields ? ([["#borrow", "Borrowers"]] as Array<[string, string]>) : []),
    ["#makers", "Market makers"],
    ...(reserve ? ([["#reserve", "Reserve"]] as Array<[string, string]>) : []),
    ...(chains ? ([["#chains", "Chains"]] as Array<[string, string]>) : []),
    ["#faq", "FAQ"],
  ];
  return (
    <nav className={`${s.top} ${scrolled ? s.scrolled : ""}`} id="nav" aria-label="Main">
      <div className={s.wrap}>
        <Link className={s.lockup} href="/" aria-label="Nectar Labs home">
          <img className={s.mark} src="/brand/mark-flat-96.png" alt="" width={34} height={34} />
          <img className={`${s.wm} only-dark`} src="/brand/wordmark-muted-100.png" alt="nectar" height={17} width={67} />
          <img className={`${s.wm} only-light`} src="/brand/wordmark-dark-100.png" alt="nectar" height={17} width={67} />
        </Link>
        <div className={s.pill}>
          <div className={`${s.links} ${open ? s.open : ""}`} id="links" onClick={(e) => (e.target as HTMLElement).tagName === "A" && setOpen(false)}>
            {links.map(([h, l]) => (
              <a key={h} href={h}>
                {l}
              </a>
            ))}
            <a href={docsHref()}>Docs</a>
          </div>
          <button className={`${s.iconbtn} ${s.navTheme}`} id="theme" type="button" aria-label="Switch colour theme" onClick={() => setTheme(currentTheme() === "dark" ? "light" : "dark")}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <circle cx="10" cy="10" r="7" />
              <path d="M10 3a7 7 0 0 0 0 14z" fill="currentColor" />
            </svg>
          </button>
          <button className={`${s.iconbtn} ${s.menuBtn}`} id="menu" type="button" aria-expanded={open} aria-controls="links" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M3 7h14M3 13h14" />
            </svg>
          </button>
          <Link className={s.navcta} href="/feed">
            Try on testnet
          </Link>
        </div>
      </div>
    </nav>
  );
}

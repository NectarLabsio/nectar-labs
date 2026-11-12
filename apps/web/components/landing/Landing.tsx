"use client";
// Landing v2: landing/index.html ported to React (WO-33a). Element ids from the page script are kept. Module sections render only
// when config.yaml `features.<name>` is on (Module / On, data-feature tags). Hero and chamber numbers are the PRD §4 example
// position and say so; real figures come from nectar-core views in the "Read it from the contract" section.
// Copy rules: never "insurance", never "without liquidations"; testnet and mock collateral disclosed.
import { HostLink as Link } from "../HostLink";
import { useEffect, useRef, useState } from "react";
import hero from "@nectar/ui/3d/hero.webp";
import tokA from "@nectar/ui/3d/tokA.webp";
import tokB from "@nectar/ui/3d/tokB.webp";
import tokC from "@nectar/ui/3d/tokC.webp";
import tokD from "@nectar/ui/3d/tokD.webp";
import { docsHref, hostHref } from "@/lib/env";
import { CopyContact } from "../CopyContact";
import { useChain, useView } from "../AppProvider";
import { formatNoticePeriod, formatUsdE6, type ExitCapacity, type FeatureName, type ReserveView } from "@nectar/sdk";
import { Module, On } from "../FeatureGate";
import { LandingStats, LiveLimitCard } from "../LandingLive";
import { ART } from "./art";
import { HeroLines, HeroMark, Roll, useReducedMotion } from "./motion";
import s from "./landing.module.css";

const c = (...xs: Array<string | undefined | false | null>) => xs.filter(Boolean).join(" ");
const Arrow = () => (
  <svg className={s.ln} viewBox="0 0 46 8" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 4h44M40 1l4 3-4 3" fill="none" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);
const Pill = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a className={s.pillbtn} href={hostHref(href)}>
    {children}
    <i>
      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M2 6h8M7 3l3 3-3 3" />
      </svg>
    </i>
  </a>
);
const Art = ({ k }: { k: keyof typeof ART }) => <div className={s.tile} dangerouslySetInnerHTML={{ __html: ART[k] }} />;

// Chamber: one position, four states (PRD §4.2 example: 300 mock NVDAx at $185, $28,000 drawn). Q and D are example figures; LTV and
// haircuts are the deployed parameters (config.yaml collaterals[0]: base_ltv_bps, max_nectar_ltv_bps, base/weekend_haircut_bps, equal to
// get_collateral on nectar-core-v2, evidence/claims/deployed-params-20261112T192755Z.json) and R is the Nectar Reserve read from
// get_exit_capacity (r_usd_e6), never a hard-coded figure (WO-35w, WO-62a B2/B3). The copy says which figure is which.
const EX = { v: 55_500, debt: 28_000, q: 80_000, d: 12_000 } as const;
export interface ExParams { base: number; max: number; h: number; hw: number }
type Ex = ReturnType<typeof example>;
const pctOf = (x: number) => `${Number(((x / EX.v) * 100).toFixed(1))}%`;
const bp = (b: number) => `${Number((b / 100).toFixed(2))}%`;
function example(p: ExParams, rLive: number | null) {
  const r = rLive ?? 0;
  const byLtv = Math.round((EX.v * p.max) / 10_000);
  const stat = Math.round((EX.v * p.base) / 10_000);
  const exitS = Math.round(((10_000 - p.h) * (EX.q + r + EX.d)) / 10_000) - EX.debt;
  const exitW = Math.round(((10_000 - p.hw) * (EX.q + r)) / 10_000) - EX.debt;
  const sess = Math.max(0, Math.min(byLtv, exitS)), wk = Math.max(0, Math.min(byLtv, exitW));
  const rT = rLive === null ? "R" : usd(r);
  const pc = (x: number) => Number(((x / EX.v) * 100).toFixed(1));
  const states = [
    { badge: "Static lender", big: usd(stat), pct: pctOf(stat), fill: pc(stat), sub: "Borrow limit with DEX exit only", q: 0, r: 0, d: EX.d, h: 0, hl: "n/a", tone: "var(--ch-static)", m: 0, glow: 0, form: <><em>{bp(p.base)}</em> static LTV × {usd(EX.v)} = <em>{usd(stat)}</em></> },
    { badge: "In session", big: usd(sess), pct: pctOf(sess), fill: pc(sess), sub: "Borrow limit with committed quotes, Reserve and DEX depth", q: EX.q, r, d: EX.d, h: p.h / 100, hl: bp(p.h), tone: "var(--ch-accent)", m: 1, glow: 0.7, form: <>min({bp(p.max)} × {usd(EX.v)}, (1 − <em>{bp(p.h)}</em>) × ({usd(EX.q)} + {rT} + {usd(EX.d)}) − {usd(EX.debt)}) = min({usd(byLtv)}, {usd(exitS)}) = <em>{usd(sess)}</em></> },
    { badge: "Weekend parameters", big: usd(wk), pct: pctOf(wk), fill: pc(wk), sub: `Market closed: DEX depth counts as zero, haircut ${bp(p.hw)}`, q: EX.q, r, d: 0, h: p.hw / 100, hl: bp(p.hw), tone: "var(--ch-warn)", m: 2, glow: 0.45, form: <>min({usd(byLtv)}, (1 − <em>{bp(p.hw)}</em>) × ({usd(EX.q)} + {rT} + $0) − {usd(EX.debt)}) = <em>{usd(wk)}</em></> },
    { badge: "Health below 1", big: usd(wk), pct: pctOf(wk), fill: pc(wk), sub: "Collateral goes to committed quotes first", q: EX.q, r, d: 0, h: p.hw / 100, hl: bp(p.hw), tone: "var(--ch-danger)", m: 2, glow: 1, form: null },
  ];
  // WO-62a B2: say what is example data (Q, D) and what is deployed (the Reserve, read from the chain; the LTV cap, from config = chain).
  const reserveNow = rLive === null ? "an amount read from the contract" : usd(r);
  const reach = sess >= byLtv ? `reach the deployed ${bp(p.max)} cap` : `support ${pctOf(sess)}, under the deployed ${bp(p.max)} cap`;
  const phases = [
    [`A static lender stops at ${bp(p.base)}.`, "A tokenized stock can trade at fair value all week and have no buyer on Saturday night. Lenders price that exit, so the limit stays low."],
    ["Committed quotes raise the ceiling.", `Market makers escrow USDC behind quotes that can't leave without notice. In this example (quotes ${usd(EX.q)} and DEX depth ${usd(EX.d)} are example figures; the Reserve as deployed holds ${reserveNow}), the same 300 shares ${reach}.`],
    ["The weekend guard tightens it on its own.", `When the market closes or the price is older than 15 minutes, DEX depth drops to zero and the haircut widens to ${bp(p.hw)}. Nothing outside the contract can switch the session back on.`],
    ["A bad loan sells to a buyer who already committed.", "If health falls below 1, collateral goes to a committed quote at no more than its stated discount. The Reserve fills only after every quote is used."],
  ] as const;
  const marks: Array<[number, string, number]> = [[pc(stat), pctOf(stat), 0], [pc(wk), pctOf(wk), 2], [pc(sess), pctOf(sess), 1]];
  return { states, phases, marks, rLabel: rLive === null ? "reading…" : usd(r), wkPct: pctOf(wk) };
}
const MAX = 90000;
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

function Chamber({ ex }: { ex: Ex }) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState(0);
  const [scrolly, setScrolly] = useState(false);
  const cs = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const decide = () => {
      setScrolly(reduce === false && innerWidth >= 900 && innerHeight >= 620);
      document.documentElement.style.setProperty("--vh", `${innerHeight / 100}px`);
    };
    decide();
    addEventListener("resize", decide);
    return () => removeEventListener("resize", decide);
  }, [reduce]);
  useEffect(() => {
    if (!scrolly) return;
    let tick = false;
    const on = () => {
      tick = false;
      const r = cs.current?.getBoundingClientRect();
      if (!r) return;
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)));
      setPhase(Math.min(3, Math.floor(p * 4)));
    };
    const sc = () => {
      if (!tick) {
        tick = true;
        requestAnimationFrame(on);
      }
    };
    addEventListener("scroll", sc, { passive: true });
    on();
    return () => removeEventListener("scroll", sc);
  }, [scrolly]);
  const P = ex.states;
  const st = P[phase]!;
  const back = st.q + st.r + st.d, hc = (back * st.h) / 100;
  const pick = (k: number) => {
    const el = cs.current;
    if (scrolly && el) {
      const top = el.getBoundingClientRect().top + scrollY, span = el.offsetHeight - innerHeight;
      scrollTo({ top: top + span * ((k + 0.5) / 4), behavior: reduce ? "auto" : "smooth" });
    } else setPhase(k);
  };
  return (
    <div className={c(s.chscroll, scrolly && s.scrolly)} id="chscroll" ref={cs}>
      <div className={s.wrap}>
        <div className={c(s.chamber, s.grain, scrolly && s.scrolly)} id="chamber" style={{ "--tone": st.tone, "--glow": st.glow } as React.CSSProperties}>
          <ol className={s["steps-list"]} id="phases">
            {ex.phases.map(([h, p], k) => (
              <li key={k} className={c(s.ph, k === phase && s.on)}>
                <button type="button" data-ph={k} aria-pressed={k === phase} onClick={() => pick(k)}>
                  <span className={s.k}>0{k + 1}</span>
                  <h3>{h}</h3>
                </button>
                <p>{p}</p>
              </li>
            ))}
          </ol>
          <div className={s.inst} id="inst" aria-live="polite">
            <div className={s.hd}>
              <span>Example: 300 NVDAx at $185 = $55,500</span>
              <span className={s.badge} id="ibadge">{st.badge}</span>
            </div>
            <div className={s.readout}>
              <Roll value={st.big} className={c(s.big, s.num)} id="ibig" />
              <span className={c(s.pct, s.num)} id="ipct">{st.pct}</span>
              <span className={s.sub} id="isub">{st.sub}</span>
            </div>
            <div className={s.ruler} aria-hidden="true">
              {ex.marks.map(([l, t, m]) => (
                <span key={String(t)} className={c(s.mk, m === st.m && s.on)} style={{ left: `${l}%` }}>{t}</span>
              ))}
              <div className={s.rt}><div className={s.fill} id="ifill" style={{ "--fill": st.fill } as React.CSSProperties} /></div>
              <div className={s.ticks} />
              <div className={s.scale}><span>0%</span><span>LTV</span><span>100%</span></div>
            </div>
            <div className={s.stack}>
              <div className={s.lab}><span>Exit backing</span><span id="iback">{usd(back)}</span></div>
              <div className={s.bars} aria-hidden="true">
                <i className={s.q} id="bq" style={{ flexBasis: `${(st.q / MAX) * 100}%` }} />
                <i className={s.r} id="br" style={{ flexBasis: `${(st.r / MAX) * 100}%` }} />
                <i className={s.d} id="bd" style={{ flexBasis: `${(st.d / MAX) * 100}%` }} />
                <i className={s.h} id="bh" style={{ flexBasis: `${(hc / MAX) * 100}%` }} />
              </div>
              <div className={s.legend}>
                <span style={{ "--c": "var(--ch-accent)" } as React.CSSProperties}>Quotes Q <b id="lq">{usd(st.q)}</b></span>
                <span style={{ "--c": "var(--ch-teal)" } as React.CSSProperties}>Reserve R, deployed <b id="lr">{st.q === 0 ? usd(0) : ex.rLabel}</b></span>
                <span style={{ "--c": "var(--ch-sky)" } as React.CSSProperties}>DEX depth D <b id="ld">{usd(st.d)}</b></span>
                <span style={{ "--c": "var(--ch-warn)" } as React.CSSProperties}>Haircut h <b id="lh">{st.hl}</b></span>
              </div>
            </div>
            <div className={s.slot}>
              <p className={c(s.formula, !st.form && s.off)} id="iform">{st.form ?? P[2]!.form}</p>
              <div className={c(s.route, st.form && s.off)} id="iroute">
                <span>Collateral</span><i /><span className={s.go}>Committed quotes</span><i /><span>Reserve</span><span className={s.no}>Order book</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CodeTabs({ agent, p }: { agent: boolean; p: ExParams }) {
  const tabs = [
    { id: "a", label: "limit.rs" },
    ...(agent ? [{ id: "b", label: "agent call" }] : []),
    { id: "c", label: "weekend guard" },
  ];
  const [sel, setSel] = useState("a");
  const L = ({ children }: { children?: React.ReactNode }) => <span className={s.l}>{children}</span>;
  const K = ({ children }: { children: React.ReactNode }) => <span className={s.tk}>{children}</span>;
  const C = ({ children }: { children: React.ReactNode }) => <span className={s.tc}>{children}</span>;
  const N = ({ children }: { children: React.ReactNode }) => <span className={s.tn}>{children}</span>;
  const S = ({ children }: { children: React.ReactNode }) => <span className={s.ts}>{children}</span>;
  const key = (i: number) => (e: React.KeyboardEvent) => {
    const j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
    if (j === null) return;
    const t = tabs[(j + tabs.length) % tabs.length]!;
    setSel(t.id);
    document.getElementById(`tab-${t.id}`)?.focus();
    e.preventDefault();
  };
  return (
    <div className={s.ide}>
      <div className={s.tabs} role="tablist" aria-label="Code examples">
        {tabs.map((t, i) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={sel === t.id} aria-controls={`pan-${t.id}`} tabIndex={sel === t.id ? 0 : -1} onClick={() => setSel(t.id)} onKeyDown={key(i)}>
            {t.label}
          </button>
        ))}
      </div>
      <pre role="tabpanel" id="pan-a" aria-labelledby="tab-a" tabIndex={0} hidden={sel !== "a"}>
        <L><C>{"// Borrow limit for one asset (spec §4.2). Integers only: _e6 USD, bps."}</C></L>
        <L><K>pub fn</K> borrow_limit_e6(<K>&amp;self</K>, a: <K>&amp;</K>Asset) -&gt; <K>u128</K> {"{"}</L>
        <L>{"    "}<K>let</K> weekend = !<K>self</K>.guard.session_open(a);</L>
        <L>{"    "}<K>let</K> h_bps = <K>if</K> weekend {"{"} a.h_weekend_bps {"}"} <K>else</K> {"{"} a.h_session_bps {"}"}; <C>{`// ${p.hw} / ${p.h} on testnet`}</C></L>
        <L>{"    "}<K>let</K> d = <K>if</K> weekend {"{"} <N>0</N> {"}"} <K>else</K> {"{"} a.dex_depth_e6 {"}"};</L>
        <L />
        <L>{"    "}<K>let</K> backing = a.quotes_e6 + a.reserve_e6 + d;{"           "}<C>{"// Q + R + D"}</C></L>
        <L>{"    "}<K>let</K> by_exit = backing * (<N>10_000</N> - h_bps) / <N>10_000</N>;</L>
        <L>{"    "}<K>let</K> by_ltv{"  "}= a.value_e6() * a.ltv_max_bps / <N>10_000</N>;{"  "}<C>{`// ${bp(p.max)} on testnet`}</C></L>
        <L />
        <L>{"    "}<C>{"// the exit term is shared by every loan in the asset"}</C></L>
        <L>{"    "}by_ltv.min(by_exit.saturating_sub(a.total_debt_e6))</L>
        <L>{"}"}</L>
      </pre>
      {agent ? (
        <pre role="tabpanel" id="pan-b" aria-labelledby="tab-b" tabIndex={0} hidden={sel !== "b"}>
          <L><C>{"// Nectar Feed MCP tool"}</C></L>
          <L>open_protected_stock_loan({"{"}</L>
          <L>{"  "}account_id: <S>&quot;agent1.testnet&quot;</S>,</L>
          <L>{"  "}collateral: <S>&quot;NVDAx&quot;</S>, units: <N>50</N>,</L>
          <L>{"  "}borrow_usd: <N>4000</N>, shield: <S>&quot;weekend&quot;</S>,</L>
          <L>{"  "}referrer: <S>&quot;agent1.testnet&quot;</S></L>
          <L>{"})"}</L>
          <L><C>{"// returns an unsigned ft_transfer_call and a preview:"}</C></L>
          <L><C>{"//   limits, fees, health at -5%, -10%, -20%"}</C></L>
        </pre>
      ) : null}
      <pre role="tabpanel" id="pan-c" aria-labelledby="tab-c" tabIndex={0} hidden={sel !== "c"}>
        <L><C>{"// Weekend guard: fails closed, reopens only on its own calendar"}</C></L>
        <L><K>fn</K> session_open(<K>&amp;self</K>, a: <K>&amp;</K>Asset) -&gt; <K>bool</K> {"{"}</L>
        <L>{"    "}<K>let</K> now = env::block_timestamp_ms();</L>
        <L>{"    "}<K>let</K> fresh = now - a.price_ts_ms &lt;= <N>15</N> * <N>60_000</N>;{"    "}<C>{"// 15 minutes"}</C></L>
        <L>{"    "}<K>self</K>.nyse.is_open(now) &amp;&amp; fresh &amp;&amp; a.conf_ok()</L>
        <L>{"}"}</L>
        <L><C>{"// No method lets a keeper or owner force a session open."}</C></L>
      </pre>
      <div className={s.foot}><span>Simplified from the specification, PRD §4.2 and §8</span><span>Source opens with the release, MIT</span></div>
    </div>
  );
}

function NoteObject() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const n = ref.current;
    if (reduce !== false || !n || !matchMedia("(pointer:fine)").matches) return;
    const move = (e: PointerEvent) => {
      const r = n.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      n.classList.add(s.live!);
      n.style.setProperty("--ry", `${(x - 0.5) * 22}deg`);
      n.style.setProperty("--rx", `${(0.5 - y) * 16}deg`);
      n.style.setProperty("--mx", `${x * 100}%`);
      n.style.setProperty("--my", `${y * 100}%`);
    };
    const leave = () => {
      n.classList.remove(s.live!);
      n.style.removeProperty("--ry");
      n.style.removeProperty("--rx");
    };
    n.addEventListener("pointermove", move);
    n.addEventListener("pointerleave", leave);
    return () => {
      n.removeEventListener("pointermove", move);
      n.removeEventListener("pointerleave", leave);
    };
  }, [reduce]);
  const hexes = ["42.0,20.5 50.2,25.2 50.2,34.8 42.0,39.5 33.8,34.8 33.8,25.2", "33.0,36.5 41.2,41.2 41.2,50.8 33.0,55.5 24.8,50.8 24.8,41.2", "51.0,36.5 59.2,41.2 59.2,50.8 51.0,55.5 42.8,50.8 42.8,41.2"];
  return (
    <div className={s["note-stage"]}>
      <div className={s["note-card"]} id="note" ref={ref}>
        <svg viewBox="0 0 600 360" fontFamily="DM Mono, monospace" role="img" aria-label="Example loan Note p-1: LTV 50.5%, health 1.59, debt $28,000, committed quotes $80,000">
          <rect width="600" height="360" rx="24" className="n-bg" />
          <rect x="0.5" y="0.5" width="599" height="359" rx="23.5" className="n-line" />
          <g className="n-acc">{hexes.map((p) => <polygon key={p} points={p} />)}</g>
          <text x="70" y="47" fontFamily="Syne, sans-serif" fontSize="24" fontWeight="700" className="n-head">nectar</text>
          <text x="560" y="44" textAnchor="end" fontSize="13" letterSpacing="2" className="n-dim">LOAN NOTE · p-1</text>
          <text x="40" y="104" fontSize="13" letterSpacing="1.5" className="n-dim">NVDAx · MOCK COLLATERAL · EXAMPLE</text>
          <text x="40" y="146" fontSize="12" letterSpacing="1.5" className="n-dim">LTV</text>
          <text x="40" y="182" fontFamily="Syne, sans-serif" fontSize="30" fontWeight="700" className="n-head">50.5%</text>
          <text x="320" y="146" fontSize="12" letterSpacing="1.5" className="n-dim">HEALTH</text>
          <text x="320" y="182" fontFamily="Syne, sans-serif" fontSize="30" fontWeight="700" className="n-head">1.59</text>
          <text x="40" y="226" fontSize="12" letterSpacing="1.5" className="n-dim">DEBT</text>
          <text x="40" y="258" fontSize="20" className="n-head">$28,000</text>
          <text x="320" y="226" fontSize="12" letterSpacing="1.5" className="n-dim">COMMITTED Q</text>
          <text x="320" y="258" fontSize="20" className="n-head">$80,000</text>
          <rect x="40" y="286" width="520" height="8" rx="4" className="n-track" />
          <rect x="40" y="286" width="262.6" height="8" rx="4" className="n-acc" />
          <text x="40" y="330" fontSize="12" letterSpacing="1.5" className="n-acc">OPEN · IN SESSION</text>
          <text x="560" y="330" textAnchor="end" fontSize="11" className="n-dim">testnet · nectar-core (example)</text>
        </svg>
      </div>
      <div className={s["note-shadow"]} aria-hidden="true" />
      <p className={s.fn}>Example Note drawn from the on-chain template, not read from the chain.</p>
    </div>
  );
}

/** WO-62a B2: the Reserve as deployed, from get_reserve (never hard-coded). Placeholders until the read answers. */
function ReserveSpec({ symbol }: { symbol: string }) {
  const { deployed } = useChain();
  const r = useView<ReserveView>((v) => v.getReserve(symbol), [symbol]);
  const d = r.data;
  const wait = !deployed ? "read after deployment" : r.error ? "RPC error, retry later" : "reading…";
  const fills = !d ? wait : d.discount_bps === 0 ? "Disabled (discount 0 bps)" : `After all quotes, at ${d.discount_bps} bps`;
  return (
    <dl className={s.spec} data-testid="landing-reserve" aria-live="polite">
      <div><dt>Holds now, on testnet</dt><dd className={s.num} data-testid="landing-reserve-r">{d ? formatUsdE6(d.r_usd_e6) : wait}</dd></div>
      <div><dt>Fills</dt><dd data-testid="landing-reserve-discount">{fills}</dd></div>
      <div><dt>Minimum deposit</dt><dd className={s.num} data-testid="landing-reserve-min">{d ? `${formatUsdE6(d.min_deposit_usd_e6, 0)} USDC` : wait}</dd></div>
      <div><dt>Notice to exit</dt><dd data-testid="landing-reserve-notice">{d ? formatNoticePeriod(d.notice_period_ns) : wait}</dd></div>
    </dl>
  );
}

/** Solid connectors from the hub to each spoke node (redrawn on resize). */
function HubLinks({ hub }: { hub: React.RefObject<HTMLDivElement | null> }) {
  const [paths, setPaths] = useState<string[]>([]);
  useEffect(() => {
    const h = hub.current;
    if (!h) return;
    const draw = () => {
      const hb = h.getBoundingClientRect(), core = document.getElementById("ncore")?.getBoundingClientRect();
      if (!core) return;
      setPaths(
        ["nsol", "nbase"].flatMap((id) => {
          const n = document.getElementById(id)?.getBoundingClientRect();
          if (!n) return [];
          const x1 = core.left + core.width / 2 - hb.left, y1 = core.bottom - hb.top, x2 = n.left + n.width / 2 - hb.left, y2 = n.top - hb.top, my = (y1 + y2) / 2;
          return [`M${x1} ${y1} C${x1} ${my} ${x2} ${my} ${x2} ${y2}`];
        }),
      );
    };
    const ro = new ResizeObserver(draw);
    ro.observe(h);
    draw();
    return () => ro.disconnect();
  }, [hub]);
  return (
    <svg className={s.links3} id="hublinks" aria-hidden="true">
      {paths.map((d, i) => <path key={`l${i}`} id={`hl${i + 1}`} d={d} />)}
      {paths.map((d, i) => <path key={`f${i}`} className={s.flow} id={`hf${i + 1}`} d={d} />)}
    </svg>
  );
}

/** `contact`: config.yaml site.contact. `solanaLive`: docs/EVIDENCE.md shows the G7 Solana gate PASS (read on the server at build). */
export function Landing({ contact, solanaLive }: { contact: string | null; solanaLive: boolean }) {
  // WO-35i: landing copy reads config.yaml `features` straight from the server-rendered config, like Module / On. `useFeature` also
  // waits for the RPC read of contract_version, so the server HTML and the hydrated page made different claims ("A Base local fork
  // holds the stock." → "Solana holds the stock."). Config flags are fixed at build, so the hydrated text equals the server text.
  const { config } = useChain();
  const flag = (name: FeatureName) => config.features[name] === true;
  const shields = flag("shields");
  const reserve = flag("reserve");
  const profitLock = flag("profit_lock");
  const sol = flag("solana_remote");
  const base = flag("base");
  const agent = flag("agent_skill");
  const x402 = flag("x402");
  const reduce = useReducedMotion();
  const frame = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const hub = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const cta = shields ? { href: "/shield", label: "Open a weekend shield" } : { href: "/borrow", label: "Preview a borrow" };
  const col = config.collaterals[0];
  const capR = useView<ExitCapacity>((v) => v.getExitCapacity(col?.symbol ?? "NVDAx"), [col?.symbol]);
  // Deployed parameters from config.yaml collaterals[0] (server-rendered, so the server HTML and the hydrated page agree).
  const params: ExParams = { base: col?.base_ltv_bps ?? 0, max: col?.max_nectar_ltv_bps ?? 0, h: col?.base_haircut_bps ?? 0, hw: col?.weekend_haircut_bps ?? 0 };
  const ex = example(params, capR.data ? Number(BigInt(capR.data.r_usd_e6) / 1_000_000n) : null);

  // Scroll engine: --p on [data-sp] (finale parallax), settlement line progress, hero progress for the 3D mark.
  useEffect(() => {
    let tick = false;
    const on = () => {
      tick = false;
      const vh = innerHeight;
      const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
      if (!reduce) root.current?.querySelectorAll<HTMLElement>("[data-sp]").forEach((el) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--p", clamp((vh - r.top) / (vh + r.height)).toFixed(4));
      });
      const fr = frame.current?.getBoundingClientRect();
      if (fr) (window as unknown as { __heroP: number }).__heroP = clamp(-fr.top / Math.max(1, fr.height));
      const seq = document.getElementById("settle");
      if (seq) {
        const sr = seq.getBoundingClientRect();
        seq.style.setProperty("--sp", reduce ? "1" : clamp((vh * 0.85 - sr.top) / (sr.height + vh * 0.3)).toFixed(3));
      }
    };
    const sc = () => {
      if (!tick) {
        tick = true;
        requestAnimationFrame(on);
      }
    };
    addEventListener("scroll", sc, { passive: true });
    addEventListener("resize", on);
    on();
    return () => {
      removeEventListener("scroll", sc);
      removeEventListener("resize", on);
    };
  }, [reduce]);
  useEffect(() => () => document.documentElement.classList.remove("intro"), []);

  const words = "Borrow against stocks without fire-sales.".split(" ");
  const chips: Array<[string, string]> = [
    ["NEAR", "hub, testnet"],
    ["Chain Signatures", "MPC signing"],
    ["OutLayer", "verifiable TEE pricing"],
    ["NEAR Intents", "1Click quotes, dry run"],
    ["Pyth", "price feed"],
    ...(sol ? ([["Solana", solanaLive ? "spoke, devnet" : "spoke, not live yet"]] as Array<[string, string]>) : []),
    ...(base ? ([["Base", "local fork of Base Sepolia"]] as Array<[string, string]>) : []),
    ...(x402 ? ([["x402", "paid API calls"]] as Array<[string, string]>) : []),
    ["NEAR AI Cloud", "copilot"],
  ];

  return (
    <div className={s.lp} ref={root}>
      {/* Before paint: the load sequence runs only when motion is allowed (reduced motion keeps everything at rest). */}
      <script dangerouslySetInnerHTML={{ __html: "try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('intro')}catch(e){}" }} />
      <header className={s.hero} id="top">
        <div className={s.wrap}>
          <div className={s.frame} id="frame" ref={frame}>
            <HeroLines frame={frame} stage={stage} />
            <span className={c(s.cross, s.tl)} /><span className={c(s.cross, s.tr)} /><span className={c(s.cross, s.bl)} /><span className={c(s.cross, s.br)} />
            <div className={s["hero-in"]}>
              <div className={s["hero-copy"]}>
                <h1 id="h1">
                  {words.map((w, i) => (
                    <span key={i}>
                      <span className={s.w}><i style={{ "--i": i } as React.CSSProperties}>{w}</i></span>
                      {i < words.length - 1 ? " " : null}
                    </span>
                  ))}
                </h1>
                <p className={s.lead}>
                  Market makers escrow USDC behind time-committed quotes on NEAR. Your limit follows that commitment and holds up over the weekend. If a loan goes bad, the
                  collateral goes to a committed buyer at a bounded discount.
                </p>
                <div className={s.cta}>
                  <Link className={c(s.btn, "ink")} href={cta.href}>{cta.label} <Arrow /></Link>
                  <a className={c(s.btn, s.line)} href="#how">See how limits move</a>
                </div>
                <p className={s.fine}><b />Testnet only, with mock collateral. Unaudited software.</p>
              </div>
              <div className={s.stagewrap}>
                <div className={s["mark-stage"]} id="stage" ref={stage}>
                  <img src={hero.src} alt="The Nectar mark: three mint hexagons" width={960} height={960} />
                  <HeroMark stage={stage} />
                </div>
              </div>
            </div>
            <div className={s.counters}>
              <div className={s.counter}><span>Committed quotes</span><Roll value={usd(EX.q)} className={s.num} intro /></div>
              <div className={s.counter}><span>Weekend limit</span><Roll value={ex.wkPct} className={s.num} intro /></div>
              <small><b>Example</b> position on testnet: 300 mock NVDAx</small>
            </div>
          </div>
        </div>
      </header>

      <div className={s.builton}>
        <div className={s.wrap}>
          <p className={s.lab}>Runs on these networks and services</p>
          <div className={s.marquee}>
            <div className={s.track} id="track">
              {chips.map(([n, t]) => <span key={n} className={s.chip}>{n}<small>{t}</small></span>)}
              {reduce === false ? chips.map(([n, t]) => <span key={`d${n}`} className={s.chip} aria-hidden="true">{n}<small>{t}</small></span>) : null}
            </div>
          </div>
        </div>
      </div>

      <div className={s.chwrap} id="how">
        <div className={s.wrap}>
          <div className={s["sec-head"]}>
            <h2>Lenders price the exit, not the asset.</h2>
            <p><strong>Example.</strong> Follow one position through four states. The numbers are the example from the hero: 300 mock NVDAx at $185, with $28,000 already drawn against the asset. Quotes and DEX depth are example figures; the LTV limits, the haircuts and the Reserve are the deployed testnet values.</p>
          </div>
        </div>
        <Chamber ex={ex} />
      </div>

      <section id="testnet">
        <div className={c(s.wrap, s.testnet)}>
          <div className={s["sec-head"]} style={{ margin: 0 }}>
            <span className={s.tag}><b />nectar-core on NEAR testnet</span>
            <h2>Read it from the contract.</h2>
            <p>The same rule, with today&apos;s numbers for the first collateral. Every figure here comes from a view call; nothing is cached or estimated.</p>
            <LandingStats />
          </div>
          <LiveLimitCard />
        </div>
      </section>

      <section id="roles">
        <div className={c(s.wrap, s.roles)}>
          <Module name="shields" className={s.role} id="borrow">
            <Art k="borrow" />
            <div className={s.copy}>
              <span className={s.tag}><b />For borrowers</span>
              <h2>Borrow for the weekend at a limit that won&apos;t move.</h2>
              <p>A Shield opens your loan at the weekend limit for a fixed window, so the limit can&apos;t be cut halfway through Saturday. If the price gaps, committed buyers take collateral at their stated discount.</p>
              <dl className={s.spec}>
                <div><dt>Weekend Gap Shield</dt><dd>15 bps flat, from $5</dd></div>
                <div><dt>Window</dt><dd className={s.num}>Fri 16:00 to Mon 09:30 ET</dd></div>
                <div><dt>Event Shield</dt><dd>25 bps flat, up to 72 h</dd></div>
                <div><dt>Zap and borrow</dt><dd>From $10, testnet faucet</dd></div>
              </dl>
              <p className={s.note}>A Shield is a weekend-safe limit with committed buyers behind it.</p>
              <div><Pill href="/shield">Open a Shield</Pill></div>
            </div>
          </Module>
          <div className={c(s.role, s.flip)} id="makers">
            <Art k="makers" />
            <div className={s.copy}>
              <span className={s.tag}><b />For market makers</span>
              <h2>Get paid to stand behind a price.</h2>
              <p>Escrow USDC behind a quote with a discount ceiling, a size and a notice period. Borrowers&apos; limit premiums fund your commitment fees. The OutLayer TEE makes the discount computation verifiable: a pinned, attested program, clamped on-chain. In this testnet build it prices with operator-set demo parameters (published in the docs), and each settlement&apos;s discount reveals their product.</p>
              <dl className={s.spec}>
                <div><dt>Escrow</dt><dd>USDC, held by nectar-core</dd></div>
                <div><dt>Exit</dt><dd>After the notice period</dd></div>
                <div><dt>Paid from</dt><dd>Borrower limit premiums</dd></div>
                <div><dt>Your quote</dt><dd>A transferable Note</dd></div>
              </dl>
              <div><Pill href={sol || base ? "#settle" : "/quote/new"}>{sol || base ? "How a fill settles" : "Post a quote"}</Pill></div>
            </div>
          </div>
          <Module name="reserve" className={s.role} id="reserve">
            <Art k="reserve" />
            <div className={s.copy}>
              <span className={s.tag}><b />For the Reserve</span>
              <h2>Stand behind every loan in the asset.</h2>
              <p>Pool USDC per asset. The Reserve earns a share of every borrower premium and buys collateral at the Reserve discount only after every committed quote is used. Your deposit is a Note you can hold or transfer. It is deployed on testnet and still small: the figures below are read from the contract.</p>
              <ReserveSpec symbol={col?.symbol ?? "NVDAx"} />
              <div><Pill href="/reserve">Deposit to the Reserve</Pill></div>
            </div>
          </Module>
        </div>
      </section>

      <Module name={["pay_to", "profit_lock"]} className={s.alt} id="spend">
        <div className={s.wrap}>
          <div className={s["sec-head"]}><h2>Use the loan and keep the stock.</h2></div>
          <div className={s.pair}>
            <On name="pay_to">
              <div className={s.card}>
                <span className={s.ic}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="2.5" y="5" width="15" height="10" rx="2" /><path d="M2.5 8.5h15M6 12h3" /></svg></span>
                <h3>Spend without selling</h3>
                <p>Send the borrowed USDC straight to a merchant account in the same transaction. If the transfer fails, the money waits for you to claim.</p>
                <pre className={s.code}>{`LockCollateralAndBorrow {
  borrow_usd_e6: "5000000000",
  pay_to: { receiver_id: "merchant.testnet",
            memo: "invoice 1042" }
}`}</pre>
                <On name="x402"><p>Paid data with stock-backed credit: the Feed export is an x402 route priced in mock USDC on testnet.</p></On>
              </div>
            </On>
            <On name="profit_lock">
              <div className={s.card}>
                <span className={s.ic}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 15l5-5 3 3 6-7" /><path d="M13 6h4v4" /></svg></span>
                <h3>Profit-Lock</h3>
                <p>Stock rallied? Sell just enough collateral to committed buyers who opted in, at their discount, clear the debt, and keep the rest debt-free. Example:</p>
                <table className={c(s.calc, s.num)}>
                  <tbody>
                    <tr><td>Debt</td><td>$28,000</td></tr>
                    <tr><td>NVDAx after a 25% rally</td><td>$231.00</td></tr>
                    <tr><td>Buyer discount plus fee</td><td>1.8% + 0.5%</td></tr>
                    <tr><td>Units sold</td><td>124.05</td></tr>
                    <tr><td>Units kept, debt-free</td><td>175.95, about $40,644</td></tr>
                  </tbody>
                </table>
              </div>
            </On>
          </div>
        </div>
      </Module>

      <Module name="notes" id="notes" className="">
        <div className={c(s.wrap, s.notes)}>
          <NoteObject />
          <div className={s["sec-head"]} style={{ margin: 0 }}>
            <span className={s.tag}><b />Position Notes, NEP-171</span>
            <h2>Transfer the note, transfer the position.</h2>
            <ul>
              <li>Every quote, loan and Reserve deposit is a Note on NEAR. Its owner is the one who can withdraw, claim fees or receive leftover collateral.</li>
              <li>The contract draws the picture from its own state: LTV, health, backing, multiplier.</li>
              <li>Transfers are blocked while a position is settling, so a payout can&apos;t be redirected mid-flight.</li>
              <li>Share a Note to X from its page. Nothing posts without you.</li>
            </ul>
            <div><Pill href="/notes">See the notes</Pill></div>
          </div>
        </div>
      </Module>

      <Module name={["solana_remote", "base"]} className={s.alt} id="chains">
        <div className={s.wrap}>
          <div className={s["sec-head"]} style={{ marginInline: "auto", textAlign: "center", justifyItems: "center" }}>
            <h2>NEAR holds the book. {sol && base ? "Solana and a local fork of Base Sepolia hold" : sol ? "Solana holds" : "A local fork of Base Sepolia holds"} the stock.</h2>
            <p>A remote loan pays out only after an attested read proves the collateral sits in the vault under the key NEAR derives for that position. Base settlement ran on a local fork of Base Sepolia, not on Base Sepolia.</p>
          </div>
          <div className={s.hub} id="hub" ref={hub}>
            <HubLinks hub={hub} />
            <div className={c(s.node, s.core)} id="ncore">
              <div className={s.art} dangerouslySetInnerHTML={{ __html: ART.core }} />
              <div className={s.body}><h3>NEAR testnet, the hub</h3><span className={s.t}>nectar-core</span>
                <ul><li>Quotes, Reserve, loans and Notes</li><li>Limits, weekend guard, multiplier</li><li>Builds every message it asks the MPC to sign</li></ul></div>
            </div>
            <On name="solana_remote">
              <div className={s.node} id="nsol">
                <div className={s.art} dangerouslySetInnerHTML={{ __html: ART.sol }} />
                <div className={s.body}><h3>Solana devnet</h3><span className={s.t}>xStocks-style mock collateral, Ed25519 · {solanaLive ? "devnet, round trip verified" : "Not live yet"}</span>
                  <ul><li>nectar_vault program</li><li>Verifies the signature through the Instructions sysvar</li></ul></div>
              </div>
            </On>
            <On name="base">
              <div className={s.node} id="nbase">
                <div className={s.art} dangerouslySetInnerHTML={{ __html: ART.base }} />
                <div className={s.body}><h3>Base, on a local fork of Base Sepolia</h3><span className={s.t}>B20-style mock collateral, secp256k1 · Base settlement ran on a local fork of Base Sepolia, not on Base Sepolia</span>
                  <ul><li>NectarVaultBase with EIP-712, on the local fork of Base Sepolia</li><li>Checks the issuer&apos;s transfer policy first</li></ul></div>
              </div>
            </On>
          </div>
          <p className={s.hubcap}>Each link carries a message nectar-core built and NEAR Chain Signatures signed: a settlement to a buyer, or a release back to the borrower.</p>
          <div className={s.seq} id="settle">
            <div><span className={s.k}>01 Flag</span><h3>Health falls below 1</h3><p>Any keeper calls <code>trigger_preliquidation(position_id)</code> with a function-call key. No deposit, no price, no hash.</p><span className={s.who}>nectar-core on NEAR testnet</span></div>
            <div><span className={s.k}>02 Price</span><h3>A TEE computes the discount, verifiably</h3><p>A pinned, attested OutLayer program returns <code>disc_bps</code>, so the computation can be verified, and the contract clamps it to the quote&apos;s ceiling. In this testnet build it prices with operator-set demo parameters (published in the docs); each settlement&apos;s discount reveals their product.</p><span className={s.who}>OutLayer, attested</span></div>
            <div><span className={s.k}>03 Sign</span><h3>Chain Signatures signs</h3><p>The contract builds the settlement message and asks the MPC signer for Ed25519 (Solana) or secp256k1 (Base, on a local fork of Base Sepolia, not on Base Sepolia). The keeper never holds a key.</p><span className={s.who}>v1.signer-prod.testnet</span></div>
            <div><span className={s.k}>04 Settle</span><h3>The vault verifies, then pays</h3><p>Solana checks the Ed25519 instruction before <code>settle</code>. Base settlement ran on a local fork of Base Sepolia, not on Base Sepolia: there NectarVaultBase checks EIP-712 with <code>ecrecover</code>. Then the buyer is paid and the result is relayed home.</p><span className={s.who}>nectar_vault, NectarVaultBase</span></div>
          </div>
        </div>
      </Module>

      <section id="code">
        <div className={c(s.wrap, s.codegrid)}>
          <div className={s["sec-head"]} style={{ margin: 0 }}>
            <span className={s.tag}><b />Open by default</span>
            <h2>Anyone can recompute a limit.</h2>
            <p>The rule is short enough to read in one sitting.</p>
            <On name="agent_skill"><p>Agents get the same surface: the Feed MCP server returns the exact transaction to sign, and an agent that refers a borrower earns half of the 0.3% origination fee.</p></On>
            <div><Pill href={agent ? "/agents" : docsHref()}>{agent ? "Agent quick start" : "Read the docs"}</Pill></div>
          </div>
          <CodeTabs agent={agent} p={params} />
        </div>
      </section>

      <section className={s.alt} id="trust">
        <div className={s.wrap}>
          <div className={s["sec-head"]}><h2>What you don&apos;t have to trust</h2></div>
          <div className={s.pillars}>
            <div><svg className={s.glyph} viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><circle cx="16" cy="22" r="7" /><path d="M23 22h16M33 22v6M38 22v4" /></svg><h3>The keeper</h3><p>A function-call key limited to a few methods. It cannot attach deposits, choose prices or supply hashes, and it holds no remote-chain authority.</p></div>
            <div><svg className={s.glyph} viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M6 32l9-10 7 6 10-14 6 6" /><path d="M6 38h32" strokeDasharray="2 3" /></svg><h3>The price</h3><p>Stale or wide prices are rejected and the weekend guard fails closed. TEE output is verifiable: accepted only from a pinned, attested program and clamped on-chain.</p></div>
            {sol || base ? (
              <div><svg className={s.glyph} viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M22 6l13 7.5v15L22 36 9 28.5v-15z" /><path d="M16 22l4 4 8-8" /></svg><h3>Remote deposits</h3><p>No remote loan pays out until an attested read of the vault matches the key NEAR derived for that position.</p></div>
            ) : (
              <div><svg className={s.glyph} viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M22 6l13 7.5v15L22 36 9 28.5v-15z" /><path d="M16 22l4 4 8-8" /></svg><h3>Your data</h3><p>Analytics load only after consent. We never join wallet addresses to IP addresses in logs we control. Your browser talks directly to the NEAR and Solana RPC providers, which see your IP and the accounts you query.</p></div>
            )}
          </div>
          <p className={s.trustnote}>Every deployment and test run is recorded with commands, outputs and explorer links on the <a href={docsHref("project/evidence")}>Evidence</a> page.</p>
        </div>
      </section>

      <section id="faq">
        <div className={c(s.wrap, s.faqgrid)}>
          <div className={s["sec-head"]} style={{ margin: 0 }}><h2>Questions market makers and borrowers ask</h2><p>Can&apos;t find yours? Write to the address below.</p></div>
          <div className={s.faq}>
            <details><summary>Is any of this on mainnet?</summary><p>No. NEAR testnet{sol ? " and Solana devnet" : ""}, with mock tokens.{base ? " Base settlement ran on a local fork of Base Sepolia, not on Base Sepolia." : ""} Mainnet needs an audit, a DAO owner with a timelock, and issuer approval for real tokenized stocks.</p></details>
            <details><summary>Why mock collateral?</summary><p>No tokenized equity exists on NEAR testnet. The mock token has the same interface (NEP-141, 6 decimals), and every page says &quot;mock&quot; where you would first meet it.</p></details>
            {shields ? <details><summary>What does a Shield guarantee?</summary><p>It opens your loan at the weekend limit for a fixed window so the limit can&apos;t be cut mid-weekend. If the price gaps, committed buyers take collateral at no more than their stated discount. It does not cover a fall in the stock&apos;s price.</p></details> : null}
            <details><summary>What happens on weekends and holidays?</summary><p>When the market is closed or the price is older than 15 minutes, the contract sets DEX depth to zero and widens the haircut on its own. It reopens only with a fresh price inside its own NYSE calendar.</p></details>
            {profitLock ? <details><summary>Who buys my shares in a Profit-Lock?</summary><p>Committed buyers who opted into voluntary fills, at their discount, under a daily cap. You see the units sold and kept before you sign.</p></details> : null}
            {reserve ? <details><summary>How does the Reserve earn?</summary><p>A share of borrower premiums. The Reserve page shows realised trailing APR and never promises a rate; exiting takes 7 days&apos; notice.</p></details> : null}
            <details><summary>What if the verifiable TEE pricing or the oracle is down?</summary><p>Settlement prices at the quote&apos;s ceiling and says so. The oracle falls back to an owner price with a visible badge. Both paths are tested and disclosed.</p></details>
            <details><summary>Can the keeper steal anything?</summary><p>No. It cannot attach deposits or pass prices or hashes, and holds no remote-chain authority. The contract builds every message and re-checks the trigger against its own oracle state.</p></details>
            <details><summary>Where is the code?</summary><p>Open source under MIT once released. <code>pnpm demo:testnet</code> reads the testnet contract without any keys, and the docs cover the contract, the Feed REST and MCP endpoints and the runbook.</p></details>
          </div>
        </div>
      </section>

      <div className={s.wrap}>
        <div className={c(s.finale, s.grain)} id="finale" data-sp="">
          <span className={c(s.tok, s.t4)}><img src={tokD.src} alt="" width={560} height={560} /></span>
          <span className={c(s.tok, s.t2)}><img src={tokC.src} alt="" width={560} height={560} /></span>
          <span className={c(s.tok, s.t1)}><img src={tokA.src} alt="" width={560} height={560} /></span>
          <span className={c(s.tok, s.t5)}><img src={tokB.src} alt="" width={560} height={560} /></span>
          <span className={c(s.tok, s.t3)}><img src={tokC.src} alt="" width={560} height={560} /></span>
          <div className={s.txt}>
            <h2>Keep the shares. Use what they&apos;re worth.</h2>
            <p>{shields ? "Open a weekend shield on testnet with demo NVDAx and watch the limit hold through Saturday." : "Preview a borrow on testnet with demo NVDAx and see both limits before you sign."}</p>
            <div className={s.cta}>
              <Link className={c(s.btn, "ink")} href={cta.href}>{cta.label} <Arrow /></Link>
              <a className={c(s.btn, s.line)} href={docsHref()}>Read the docs</a>
            </div>
          </div>
        </div>
      </div>

      <div className={c(s.wrap, s.talk)} id="talk">
        <h2>Market maker, curator or issuer? Talk to us.</h2>
        <CopyContact contact={contact} className={s.addr} testId="landing-contact" />
      </div>
    </div>
  );
}

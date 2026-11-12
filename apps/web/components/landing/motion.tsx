"use client";
// Landing behaviours ported from the landing/index.html page script: rolling digits, hero string art, live 3D mark.
// Reduced motion: no intro, no loops, hero.webp stays as the single frame (three.js is never loaded).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import s from "./landing.module.css";

const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** null until known on the client; true when the OS asks for reduced motion. */
export function useReducedMotion(): boolean | null {
  const [r, setR] = useState<boolean | null>(null);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setR(m.matches);
    const on = () => setR(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return r;
}

/** Digits roll on reels; text for assistive tech stays the plain value. `intro` rolls up from zero once on load.
 * The reel digits are CSS generated content (landing.module.css `.reel::before`), not DOM text, so crawlers and the page text see only
 * the value; every glyph column is aria-hidden and the wrapper carries the value as an aria-label plus sr-only text (WO-35w). */
export function Roll({ value, className, id, intro }: { value: string; className?: string; id?: string; intro?: boolean }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const [instant, setInstant] = useState(false);
  const first = useRef(true);
  useIso(() => {
    if (reduce === null) return;
    if (first.current && intro && !reduce) {
      first.current = false;
      setInstant(true);
      setShown(value.replace(/\d/g, "0"));
      const t = setTimeout(() => {
        setInstant(false);
        setShown(value);
      }, 450);
      return () => clearTimeout(t);
    }
    first.current = false;
    setShown(value);
  }, [value, reduce, intro]);
  const chars = shown.length === value.length ? shown : value;
  return (
    <strong className={`${className ?? ""} ${s.roll}`} id={id} data-roll={value}>
      <span className={s.srOnly}>{value}</span>
      {Array.from(value).map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={i} className={s.dg} aria-hidden="true">
            <span className={s.reel} style={{ transform: `translateY(-${Number(chars[i] ?? ch) * 1.1}em)`, transitionDelay: `${i * 55}ms`, ...(instant ? { transition: "none" } : {}) }}>
            </span>
          </span>
        ) : (
          <span key={i} className={s.ch} aria-hidden="true">
            {ch}
          </span>
        ),
      )}
    </strong>
  );
}

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Converging quote lines, commitment rings and the ticking accent arc behind the mark (2D canvas). */
export function HeroLines({ frame, stage }: { frame: React.RefObject<HTMLDivElement | null>; stage: React.RefObject<HTMLDivElement | null> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const cv = ref.current;
    const fr = frame.current;
    const st = stage.current;
    const ctx = cv?.getContext("2d");
    if (reduce === null || !cv || !fr || !st || !ctx) return;
    let W = 0, H = 0, cx = 0, cy = 0, S = 0, raf = 0, visible = true;
    const t0 = performance.now();
    const col = { line: "", acc: "", dim: "" };
    let lines: Array<{ xt: number; ph: number; a: number }> = [];
    let parts: Array<{ l: number; t: number; v: number; top: boolean }> = [];
    const readCol = () => {
      col.line = cssVar("--hero-line");
      col.acc = cssVar("--accent");
      col.dim = cssVar("--dim");
    };
    const spawn = (t: number) => ({ l: Math.floor(Math.random() * Math.max(1, lines.length)), t, v: 0.06 + Math.random() * 0.09, top: Math.random() < 0.5 });
    const layout = () => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      W = fr.clientWidth;
      H = fr.clientHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const f = fr.getBoundingClientRect(), sr = st.getBoundingClientRect();
      cx = sr.left - f.left + sr.width / 2;
      cy = sr.top - f.top + sr.height / 2;
      S = sr.width;
      const N = W < 700 ? 30 : 46, spread = Math.min(W * 0.46, 620);
      lines = Array.from({ length: N }, (_, i) => {
        const u = i / (N - 1);
        return { xt: cx + (u - 0.5) * 2 * spread, ph: i * 1.7, a: 0.35 + 0.65 * (1 - Math.abs(u - 0.5) * 2) };
      });
      parts = Array.from({ length: W < 700 ? 18 : 34 }, () => spawn(Math.random()));
    };
    const ends = (L: { xt: number; ph: number }, time: number) => {
      const xt = L.xt + Math.sin(time * 0.25 + L.ph) * 4;
      const k = H / Math.max(1, cy);
      return [xt, 0, xt + (cx - xt) * k, H] as const;
    };
    const draw = (now: number) => {
      const time = Math.max(0, (now - t0) / 1000), intro = reduce ? 1 : Math.min(1, time / 1.6), e = 1 - Math.pow(1 - intro, 3);
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = col.line;
      for (const L of lines) {
        const p = ends(L, reduce ? 0 : time);
        ctx.globalAlpha = L.a;
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(p[0] + (cx - p[0]) * e, p[1] + (cy - p[1]) * e);
        ctx.moveTo(p[2], p[3]);
        ctx.lineTo(p[2] + (cx - p[2]) * e, p[3] + (cy - p[3]) * e);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (const R of [0.5, 0.62, 0.74]) {
        ctx.beginPath();
        ctx.arc(cx, cy, S * R * e, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalAlpha = 0.9;
      for (let k = 0; k < 60; k++) {
        const ang = (k / 60) * Math.PI * 2, r1 = S * 0.62, len = k % 5 === 0 ? 7 : 3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
        ctx.lineTo(Math.cos(ang) * (r1 + len), Math.sin(ang) * (r1 + len));
        ctx.stroke();
      }
      ctx.restore();
      if (!reduce) {
        const a0 = time * 0.22 - Math.PI / 2, ro = S * 0.74;
        ctx.strokeStyle = col.acc;
        ctx.fillStyle = col.acc;
        ctx.lineWidth = 1.6;
        ctx.globalAlpha = e;
        ctx.beginPath();
        ctx.arc(cx, cy, ro, a0, a0 + 0.95);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a0 + 0.95) * ro, cy + Math.sin(a0 + 0.95) * ro, 3, 0, Math.PI * 2);
        ctx.fill();
        parts = parts.map((q) => {
          q.t += q.v / 60;
          if (q.t >= 1) return spawn(0);
          const L = lines[q.l];
          if (!L) return q;
          const Lp = ends(L, time), sx = q.top ? Lp[0] : Lp[2], sy = q.top ? Lp[1] : Lp[3];
          ctx.globalAlpha = Math.min(1, q.t * 4) * Math.min(1, (1 - q.t) * 5) * e;
          ctx.beginPath();
          ctx.arc(sx + (cx - sx) * q.t, sy + (cy - sy) * q.t, 1.5, 0, Math.PI * 2);
          ctx.fill();
          return q;
        });
        ctx.globalAlpha = 1;
      }
    };
    const loop = (now: number) => {
      draw(now);
      if (visible && !reduce) raf = requestAnimationFrame(loop);
    };
    readCol();
    layout();
    if (reduce) draw(performance.now());
    else raf = requestAnimationFrame(loop);
    const mo = new MutationObserver(() => {
      readCol();
      if (reduce) draw(performance.now());
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const onResize = () => {
      layout();
      if (reduce) draw(performance.now());
    };
    addEventListener("resize", onResize);
    const io = new IntersectionObserver((en) => {
      const v = Boolean(en[0]?.isIntersecting);
      if (v && !visible && !reduce) raf = requestAnimationFrame(loop);
      visible = v;
    });
    io.observe(fr);
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      io.disconnect();
      removeEventListener("resize", onResize);
    };
  }, [reduce, frame, stage]);
  return <canvas ref={ref} id="lines" className={s.lines} aria-hidden="true" />;
}

/** The mark in 3D (three@0.160.0, packages/ui/3d/nectar3d.js). Loaded only when motion is allowed; hero.webp is the first frame. */
export function HeroMark({ stage }: { stage: React.RefObject<HTMLDivElement | null> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const st = stage.current;
    const cv = ref.current;
    if (reduce !== false || !st || !cv) return;
    let disposed = false, running = true, raf = 0;
    let cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
      const { buildMark } = await import("@nectar/ui/3d/nectar3d.js");
      if (disposed) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: "low-power" });
      } catch {
        return; // no WebGL: hero.webp stays
      }
      renderer.setClearColor(0x000000, 0);
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      const pm = new THREE.PMREMGenerator(renderer);
      scene.environment = pm.fromScene(new RoomEnvironment(renderer), 0.04).texture;
      const key = new THREE.DirectionalLight(new THREE.Color(cssVar("--glass-white") || "white"), 1.1);
      key.position.set(-3, 4, 5);
      scene.add(key);
      const rim = new THREE.DirectionalLight(new THREE.Color(cssVar("--mark-3d-rim")), 1.6);
      rim.position.set(4, -2, -3);
      scene.add(rim);
      const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
      cam.position.set(0, 0, 9);
      const mat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(cssVar("--mark-3d")), roughness: 0.22, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 });
      const mark = buildMark(THREE, mat);
      scene.add(mark);
      const cells = (mark.userData as { cells: Array<InstanceType<typeof THREE.Mesh> & { userData: { home: InstanceType<typeof THREE.Vector3> } }> }).cells;
      let px = 0, py = 0, tx = 0, ty = 0, sp = 0, first = true;
      const t0 = performance.now();
      const size = () => {
        const w = st.clientWidth || 1;
        renderer.setPixelRatio(Math.min(1.75, devicePixelRatio || 1));
        renderer.setSize(w, w, false);
      };
      size();
      const ro = new ResizeObserver(size);
      ro.observe(st);
      const onMove = (e: PointerEvent) => {
        tx = (e.clientX / innerWidth - 0.5) * 2;
        ty = (e.clientY / innerHeight - 0.5) * 2;
      };
      if (matchMedia("(pointer:fine)").matches) addEventListener("pointermove", onMove, { passive: true });
      const frameFn = (now: number) => {
        const t = (now - t0) / 1000;
        const e = 1 - Math.pow(1 - Math.min(1, Math.max(0, (t - 0.15) / 1.9)), 4);
        px += (tx - px) * 0.05;
        py += (ty - py) * 0.05;
        sp += (((window as unknown as { __heroP?: number }).__heroP ?? 0) - sp) * 0.12;
        const breath = 0.03 + 0.025 * Math.sin(t * 0.9);
        cells.forEach((c, i) => {
          const k = 1 + breath + (1 - e) * 1.6 + sp * 0.5;
          c.position.set(c.userData.home.x * k, c.userData.home.y * k, (1 - e) * (i - 1) * 2.4 + sp * (i - 1) * 0.8);
          c.rotation.set((1 - e) * (i === 0 ? 1.1 : -0.7), (1 - e) * (i === 2 ? 1.3 : -0.9) + Math.sin(t * 0.6 + i * 2) * 0.05, (1 - e) * 0.6 * (i - 1));
        });
        mark.rotation.y = 0.45 + Math.sin(t * 0.32) * 0.32 + px * 0.3 + sp * 1.3 + (1 - e) * -1.2;
        mark.rotation.x = -0.3 + Math.sin(t * 0.24) * 0.07 + py * 0.18 - sp * 0.35;
        mark.rotation.z = 0.04;
        const sc = 1 - sp * 0.18;
        mark.scale.set(sc, sc, sc);
        renderer.render(scene, cam);
        if (first) {
          first = false;
          st.classList.add(s["gl-on"]!);
        }
      };
      const loop = (now: number) => {
        if (!running || disposed) return;
        frameFn(now);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      const io = new IntersectionObserver((en) => {
        const v = Boolean(en[0]?.isIntersecting);
        if (v && !running) {
          running = true;
          raf = requestAnimationFrame(loop);
        }
        running = v;
      });
      io.observe(st);
      const lost = (e: Event) => {
        e.preventDefault();
        running = false;
        st.classList.remove(s["gl-on"]!);
      };
      cv.addEventListener("webglcontextlost", lost);
      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        removeEventListener("pointermove", onMove);
        cv.removeEventListener("webglcontextlost", lost);
        renderer.dispose();
        st.classList.remove(s["gl-on"]!);
      };
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [reduce, stage]);
  return <canvas ref={ref} id="gl" aria-hidden="true" />;
}

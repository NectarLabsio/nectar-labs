"use client";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

export interface ToastInput {
  title: string;
  body?: ReactNode;
  tone?: "default" | "error" | "warn";
  /** ms; 0 keeps it until dismissed */
  timeout?: number;
}
interface ToastItem extends ToastInput { id: number }
interface ToastCtx { push: (t: ToastInput) => void }

const Ctx = createContext<ToastCtx>({ push: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (t: ToastInput) => {
      const id = Date.now() + Math.random();
      setItems((xs) => [...xs.slice(-3), { ...t, id }]);
      const ms = t.timeout ?? 8000;
      if (ms > 0) setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ push }), [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone && t.tone !== "default" ? t.tone : ""}`} role={t.tone === "error" ? "alert" : "status"}>
            <div className="row between">
              <span className="t-title">{t.title}</span>
              <button className="ghost" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
                Dismiss
              </button>
            </div>
            {t.body ? <div>{t.body}</div> : null}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

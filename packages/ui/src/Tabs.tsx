"use client";
import type { ReactNode } from "react";
import { useId, useState } from "react";

export function Tabs({ tabs, initial }: { tabs: Array<{ id: string; label: string; content: ReactNode }>; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id ?? "");
  const base = useId();
  const idx = tabs.findIndex((t) => t.id === active);
  return (
    <div className="stack">
      <div
        className="tabs"
        role="tablist"
        onKeyDown={(e) => {
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          const next = tabs[(idx + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
          if (next) {
            setActive(next.id);
            document.getElementById(`${base}-tab-${next.id}`)?.focus();
          }
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`${base}-tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={t.id === active}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={t.id === active ? 0 : -1}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} id={`${base}-panel-${t.id}`} role="tabpanel" aria-labelledby={`${base}-tab-${t.id}`} hidden={t.id !== active}>
          {t.content}
        </div>
      ))}
    </div>
  );
}

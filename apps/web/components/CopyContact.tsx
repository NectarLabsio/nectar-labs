"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@nectar/ui";

/**
 * config.yaml `site.contact` with a copy button (WO-34b §5). The button keeps one accessible name; the result is announced in a
 * polite live region. If the clipboard is refused, the address is selected so the user can copy it by hand. null: local-only text.
 */
export function CopyContact({ contact, className, testId = "contact" }: { contact: string | null; className?: string; testId?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [said, setSaid] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!contact) return <p className={className} data-testid={`${testId}-missing`}>Contact not configured in this build</p>;
  const announce = (t: string) => {
    setSaid(t);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaid(""), 2500);
  };
  const select = () => {
    const r = document.createRange();
    if (ref.current) r.selectNodeContents(ref.current);
    const g = getSelection();
    g?.removeAllRanges();
    g?.addRange(r);
    announce("Address selected. Press Ctrl+C or Cmd+C to copy.");
  };
  const copy = () => {
    if (!navigator.clipboard?.writeText) return select();
    navigator.clipboard.writeText(contact).then(() => announce(`Copied ${contact} to the clipboard.`), select);
  };
  return (
    <div className={className} data-testid={testId}>
      <span ref={ref} data-testid={`${testId}-address`}>{contact}</span>{" "}
      <Button size="sm" onClick={copy} aria-label={`Copy contact address ${contact}`} data-testid={`${testId}-copy`}>
        Copy
      </Button>
      <span role="status" aria-live="polite" className="caption" data-testid={`${testId}-status`}>
        {said}
      </span>
    </div>
  );
}

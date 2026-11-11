"use client";
import { BorrowComposer } from "@/components/borrow/BorrowComposer";
import { CopilotPanel } from "@/components/CopilotPanel";

/** /borrow (WO-33b, Borrow artboard): composer + live outcome, review drawer, sign modal, toast with the next step. */
export default function BorrowPage() {
  return (
    <>
      <BorrowComposer title="Borrow USDC" crumb="Borrow" lede="Lock mock collateral and borrow USDC up to the limit committed buyers support. Every fee is listed before your wallet opens. NEAR testnet." />
      <div className="wrap">
        <CopilotPanel />
      </div>
    </>
  );
}

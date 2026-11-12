import type { ReactNode } from "react";

/** The Cramér limit exactly as PRD §4.2 / D-009 states it. */
export function CramerFormula(): ReactNode {
  return (
    <>
      B<sub>c</sub> = min( LTV<sub>c</sub> · V<sub>c</sub> , (1 − h<sub>c</sub>) · (Q<sub>c</sub> + R<sub>c</sub> + D<sub>c</sub>) )
    </>
  );
}

/** PRD §4.2 aggregate rule (v7): the asset's total debt shares one capacity. */
export function AggregateRule(): ReactNode {
  return (
    <>
      total debt<sub>c</sub> + borrow ≤ (1 − h<sub>c</sub>) · (Q<sub>c</sub> + R<sub>c</sub> + D<sub>c</sub>)
    </>
  );
}

// Labels are canonical (C-107/C-108, interface-v7 §A1): R_c is the Nectar Reserve, D_c is verified DEX depth.
export const FORMULA_TERMS: Array<[ReactNode, string]> = [
  [<>V<sub>c</sub></>, "collateral units × oracle price (× multiplier on v2)"],
  [<>LTV<sub>c</sub></>, "max_nectar_ltv_bps (owner-set ceiling)"],
  [<>Q<sub>c</sub></>, "committed quotes: live Pappus quote remainders for the asset"],
  [<>R<sub>c</sub></>, "Nectar Reserve: pooled USDC per asset, deployed on nectar-core-v2; the value is read from get_exit_capacity (r_usd_e6)"],
  [<>D<sub>c</sub></>, "verified DEX depth; 0 outside the market session"],
  [<>h<sub>c</sub></>, "base haircut in session, weekend haircut otherwise"],
];

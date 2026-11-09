import type { ReactNode } from "react";

/** The Cramér limit exactly as PRD §4.2 / D-009 states it. */
export function CramerFormula(): ReactNode {
  return (
    <>
      B<sub>c</sub> = min( LTV<sub>c</sub> · V<sub>c</sub> , (1 − h<sub>c</sub>) · (Q<sub>c</sub> + R<sub>c</sub> + D<sub>c</sub>) )
    </>
  );
}

export const FORMULA_TERMS: Array<[ReactNode, string]> = [
  [<>V<sub>c</sub></>, "collateral units × oracle price"],
  [<>LTV<sub>c</sub></>, "max_nectar_ltv_bps (owner-set ceiling)"],
  [<>Q<sub>c</sub></>, "live Pappus quote remainders for the asset"],
  [<>R<sub>c</sub></>, "Nectar reserve (0 on testnet; PROD)"],
  [<>D<sub>c</sub></>, "verified DEX depth; forced to 0 when the market session is closed"],
  [<>h<sub>c</sub></>, "base haircut in session, weekend haircut when closed"],
];

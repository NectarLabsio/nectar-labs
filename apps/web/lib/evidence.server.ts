import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseEvidenceRows, type EvidenceRow } from "@nectar/sdk";

const GATES = [
  { label: "Contract tests", gate: "G11 v7 contract" },
  { label: "Testnet deploy", gate: "G2b testnet deploy v2" },
  { label: "OutLayer pricing", gate: "G4 OutLayer" },
  { label: "Solana settlement", gate: "G7 Solana" },
  { label: "Base settlement", gate: "G13 Base round trip" },
] as const;

/** docs/EVIDENCE.md, read on the server. A build without the file shows every gate as pending, never as passed. */
export function getEvidenceRows(): EvidenceRow[] {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const p = join(dir, "docs/EVIDENCE.md");
    if (existsSync(p)) return parseEvidenceRows(readFileSync(p, "utf8"), GATES);
    dir = dirname(dir);
  }
  return parseEvidenceRows("", GATES);
}

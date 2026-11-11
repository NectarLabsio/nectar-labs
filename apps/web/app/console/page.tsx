import { ConsoleClient } from "@/components/console/ConsoleClient";
import { getEvidenceRows } from "@/lib/evidence.server";

export const metadata = { title: "Curator" };

export default function ConsolePage() {
  return <ConsoleClient evidence={getEvidenceRows()} />;
}

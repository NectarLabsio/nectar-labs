import { Earn } from "@/components/earn/Earn";

export const metadata = { title: "Nectar Reserve" };

/** /reserve (PRD §4.8, §12.1): the retail buyer pool behind every quote. The return shown is realised (D-024), never a promised rate. */
export default function ReservePage() {
  return <Earn initial="reserve" />;
}

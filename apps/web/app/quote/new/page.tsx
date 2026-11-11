import { Earn } from "@/components/earn/Earn";

export const metadata = { title: "Commit a quote" };

/** Kept as the address "Post a quote" links use; the form is the Earn composer. */
export default function NewQuotePage() {
  return <Earn initial="quote" />;
}

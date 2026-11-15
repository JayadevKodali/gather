import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";

export const metadata: Metadata = { title: "Page not found" };

/** Same two-part layout as the account pages (fix 5): the message in a card, a venue photo beside it. */
export default function NotFound() {
  return (
    <AuthShell photo="glasshouse">
      <section className="panel">
        <h1>We couldn’t find that page</h1>
        <p className="lead">The link may be mistyped, or the page may belong to another account.</p>
        <p className="mb-0"><Link className="btn" href="/">Go to Gather</Link></p>
      </section>
    </AuthShell>
  );
}

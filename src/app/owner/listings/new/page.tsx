import type { Metadata } from "next";
import Link from "next/link";
import { ListingForm } from "@/components/ListingForm";
import { Notices } from "@/components/Notice";
import { requirePageRole } from "@/lib/auth/session";
import { createListingAction } from "../../../actions/owner";
import { SetupSteps } from "@/components/SetupSteps";
import { StatusPill } from "@/components/StatusPill";
import { SETUP_STEPS } from "@/lib/listing-setup";

export const metadata: Metadata = { title: "Add a listing" };

export default async function NewListingPage({ searchParams }: PageProps<"/owner/listings/new">) {
  await requirePageRole("owner");
  const params = await searchParams;
  return (
    <div className="wrap edit-listing setup" style={{ maxWidth: 920 }}>
      <p className="back-link"><Link href="/owner"><span aria-hidden="true">←</span> Manage listings</Link></p>
      <div className="page-head">
        <div className="page-head-text">
          <h1>Add a listing</h1>
          <p className="page-summary">One listing is one bookable space. Five short steps; you can save a draft and come back at any point. Planners can’t see it until you publish.</p>
        </div>
        <div className="page-head-actions"><StatusPill tone="amber">Draft</StatusPill></div>
      </div>
      <SetupSteps steps={SETUP_STEPS.map((x) => ({ ...x, done: false }))} current="details" linkable={false} />
      <Notices params={params} />
      <h2 className="setup-title">Step 1 of {SETUP_STEPS.length}: {SETUP_STEPS[0].label}</h2>
      <ListingForm action={createListingAction} submitLabel="Save draft" next={{ key: "facilities", label: "Facilities and extras" }} hint="Planners can’t see a draft." />
    </div>
  );
}

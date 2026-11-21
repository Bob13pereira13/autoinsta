import { redirect } from "next/navigation";

// The list moved to /automations (tabs by channel). Old links keep working.
export default function CampaignsRedirectPage() {
  redirect("/automations");
}

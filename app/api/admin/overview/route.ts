import { adminOverview } from "@/lib/admin/clients";
import { withAdmin } from "@/lib/admin/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return withAdmin(() => adminOverview());
}

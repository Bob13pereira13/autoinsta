import { NextRequest } from "next/server";
import { AdminError, getPlatformPriceCents, setPlatformPrice } from "@/lib/admin/clients";
import { withAdmin } from "@/lib/admin/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return withAdmin(async () => ({ pricePerAccountCents: await getPlatformPriceCents() }));
}

/** { pricePerAccountCents } — only used for the estimated revenue. */
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return withAdmin(async (admin) => {
    const cents = Number(body.pricePerAccountCents);
    if (!Number.isFinite(cents)) throw new AdminError("Enter a valid price");
    const settings = await setPlatformPrice(admin, Math.round(cents));
    return { pricePerAccountCents: settings.pricePerAccountCents };
  });
}

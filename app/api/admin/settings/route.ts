import { NextRequest } from "next/server";
import { AdminError, getPlatformPriceCents, setDefaultAccountLimit, setPlatformPrice } from "@/lib/admin/clients";
import { getDefaultAccountLimit } from "@/lib/account-limit";
import { withAdmin } from "@/lib/admin/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return withAdmin(async () => ({
    pricePerAccountCents: await getPlatformPriceCents(),
    defaultInstagramAccountLimit: await getDefaultAccountLimit(),
  }));
}

/**
 * { pricePerAccountCents?, defaultInstagramAccountLimit? } — the price is only
 * used for the estimated revenue; the default limit (null = no limit) applies
 * to clients that follow it.
 */
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return withAdmin(async (admin) => {
    if (body.pricePerAccountCents === undefined && body.defaultInstagramAccountLimit === undefined) {
      throw new AdminError("Invalid input");
    }
    if (body.pricePerAccountCents !== undefined) {
      const cents = Number(body.pricePerAccountCents);
      if (!Number.isFinite(cents)) throw new AdminError("Enter a valid price");
      await setPlatformPrice(admin, Math.round(cents));
    }
    if (body.defaultInstagramAccountLimit !== undefined) {
      await setDefaultAccountLimit(admin, body.defaultInstagramAccountLimit);
    }
    return {
      pricePerAccountCents: await getPlatformPriceCents(),
      defaultInstagramAccountLimit: await getDefaultAccountLimit(),
    };
  });
}

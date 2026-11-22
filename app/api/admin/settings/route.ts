import { NextRequest } from "next/server";
import {
  AdminError,
  getPlatformPriceCents,
  setDefaultAccountLimit,
  setPlatformPrice,
  setRequireSignupApproval,
} from "@/lib/admin/clients";
import { getDefaultAccountLimit } from "@/lib/account-limit";
import { withAdmin } from "@/lib/admin/http";
import { getRequireSignupApproval } from "@/lib/signup-approval";

export const dynamic = "force-dynamic";

async function currentSettings() {
  return {
    pricePerAccountCents: await getPlatformPriceCents(),
    defaultInstagramAccountLimit: await getDefaultAccountLimit(),
    requireSignupApproval: await getRequireSignupApproval(),
  };
}

export async function GET() {
  return withAdmin(currentSettings);
}

/**
 * { pricePerAccountCents?, defaultInstagramAccountLimit?, requireSignupApproval? }
 * — the price is only used for the estimated revenue; the default limit
 * (null = no limit) applies to clients that follow it; requireSignupApproval
 * (boolean) decides whether new sign-ups wait for an admin. Every change is
 * audited.
 */
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return withAdmin(async (admin) => {
    if (
      body.pricePerAccountCents === undefined &&
      body.defaultInstagramAccountLimit === undefined &&
      body.requireSignupApproval === undefined
    ) {
      throw new AdminError("Invalid input");
    }
    // Validate everything before writing anything.
    if (body.requireSignupApproval !== undefined && typeof body.requireSignupApproval !== "boolean") {
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
    if (body.requireSignupApproval !== undefined) {
      await setRequireSignupApproval(admin, body.requireSignupApproval);
    }
    return currentSettings();
  });
}

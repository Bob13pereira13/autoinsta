import { NextRequest } from "next/server";
import { AdminError, adminRemoveAccount, adminSetAccountEnabled } from "@/lib/admin/clients";
import { withAdmin } from "@/lib/admin/http";

type Params = { params: Promise<{ id: string; accountId: string }> };

/** { automationsEnabled } — the client's own Active/Off switch, set by the admin. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id, accountId } = await params;
  const body = await request.json().catch(() => ({}));
  return withAdmin(async (admin) => {
    if (typeof body.automationsEnabled !== "boolean") throw new AdminError("Invalid input");
    return adminSetAccountEnabled(admin, id, accountId, body.automationsEnabled);
  });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id, accountId } = await params;
  return withAdmin(async (admin) => {
    await adminRemoveAccount(admin, id, accountId);
    return { removed: true };
  });
}

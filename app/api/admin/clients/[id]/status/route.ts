import { NextRequest } from "next/server";
import { AdminError, setClientStatus, type StatusAction } from "@/lib/admin/clients";
import { withAdmin } from "@/lib/admin/http";

const ACTIONS: StatusAction[] = ["approve", "reject", "activate", "deactivate"];

/** { action: approve | reject | activate | deactivate, reason? } */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return withAdmin(async (admin) => {
    if (!ACTIONS.includes(body.action)) throw new AdminError("Unknown action");
    const updated = await setClientStatus(admin, id, body.action, typeof body.reason === "string" ? body.reason : null);
    return { id: updated.id, status: updated.status };
  });
}

import { NextRequest } from "next/server";
import { AdminError, getClientDetail, updateClient } from "@/lib/admin/clients";
import { withAdmin } from "@/lib/admin/http";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAdmin(async () => {
    const detail = await getClientDetail(id);
    if (!detail) throw new AdminError("Client not found", 404);
    return detail;
  });
}

/** Change the Instagram account limit (a number, or null = follow the default) and/or the notes. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return withAdmin((admin) =>
    updateClient(admin, id, {
      ...(body.instagramAccountLimit !== undefined ? { instagramAccountLimit: body.instagramAccountLimit } : {}),
      ...(body.internalNotes !== undefined ? { internalNotes: body.internalNotes === null ? null : String(body.internalNotes) } : {}),
    })
  );
}

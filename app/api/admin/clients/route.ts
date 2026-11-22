import { NextRequest } from "next/server";
import { createClient, listClients } from "@/lib/admin/clients";
import { withAdmin } from "@/lib/admin/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return withAdmin(() =>
    listClients({ q: params.get("q"), status: params.get("status"), page: Number(params.get("page")) || 1 })
  );
}

/** Create a client by hand: ACTIVE at once, with an e-mailed invitation to set the password. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return withAdmin((admin) =>
    createClient(admin, {
      name: String(body.name ?? ""),
      email: String(body.email ?? ""),
      companyName: String(body.companyName ?? ""),
      phone: body.phone ? String(body.phone) : null,
      document: body.document ? String(body.document) : null,
      // Empty or null = follow the platform default.
      instagramAccountLimit: body.instagramAccountLimit ?? null,
    })
  );
}

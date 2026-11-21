import { z } from "zod";
import { authenticateService } from "@/lib/integrations/auth";
import { CAMPAIGN_TYPES, getCampaign, getCampaignStats, listCampaigns } from "@/lib/integrations/campaigns";
import { apiError, ApiError, checkOrigin } from "@/lib/integrations/http";

export async function GET(request: Request) {
  try {
    checkOrigin(request);
    const context = await authenticateService(request);
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (id !== null && !z.string().min(1).max(100).safeParse(id).success) throw new ApiError("Invalid campaign id");
    if (url.searchParams.has("stats") && !id) throw new ApiError("Campaign id required for stats");
    // Optional ?type=COMMENTS|STORIES|DIRECT filter on the list.
    const type = url.searchParams.get("type");
    const parsedType = type === null ? undefined : z.enum(CAMPAIGN_TYPES).safeParse(type.toUpperCase());
    if (parsedType && !parsedType.success) throw new ApiError("Invalid campaign type");
    const data = id
      ? url.searchParams.has("stats") ? await getCampaignStats(context, id) : await getCampaign(context, id)
      : await listCampaigns(context, { type: parsedType?.data });
    return Response.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}

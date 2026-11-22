import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import { getAllUserMedia, getUserMedia, getUserMediaPage } from "@/lib/instagram/provider";
import { createInstagramContext } from "@/lib/instagram/provider";

export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const account = await getWorkspaceInstagramAccount(
    workspaceId,
    request.nextUrl.searchParams.get("instagramAccountId")
  );

  if (!account) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Instagram account not connected. Please connect your account first.",
      },
      { status: 400 }
    );
  }

  try {
    const accessToken = await createInstagramContext(account);

    // `paged=1` returns one page plus `nextCursor` (post grid, infinite
    // scroll; pass it back as `after`). `all=true` paginates the full library;
    // otherwise a single recent page.
    const params = request.nextUrl.searchParams;
    if (params.get("paged") === "1") {
      const parsedLimit = Number.parseInt(params.get("limit") ?? "24", 10);
      const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 24;
      const after = params.get("after");
      if (after && !/^[A-Za-z0-9_=-]{1,512}$/.test(after)) {
        return NextResponse.json({ success: false, error: "Invalid cursor" }, { status: 400 });
      }
      const page = await getUserMediaPage({ context: accessToken, limit, after });
      return NextResponse.json({ success: true, data: page.data, nextCursor: page.nextCursor });
    }
    const loadAll = params.get("all") === "true";
    let posts;
    if (loadAll) {
      posts = await getAllUserMedia({ context: accessToken, max: 300 });
    } else {
      const limitParam = request.nextUrl.searchParams.get("limit");
      const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : 25;
      const limit = Number.isFinite(parsedLimit)
        ? Math.min(Math.max(parsedLimit, 1), 50)
        : 25;
      posts = await getUserMedia({ context: accessToken, limit: limit });
    }

    return NextResponse.json({
      success: true,
      data: posts,
      provider: account.provider,
      limitations:
        account.provider === "ZERNIO"
          ? ["Zernio returns the 25 most recent Instagram posts."]
          : [],
    });
  } catch (err) {
    console.error("[Instagram Posts] Error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch Instagram posts" },
      { status: 500 }
    );
  }
}

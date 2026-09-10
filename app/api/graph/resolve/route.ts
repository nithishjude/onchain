/**
 * app/api/graph/resolve/route.ts
 * Microservice: Graph data layer — isolated from other sponsors.
 * Called directly by the dashboard or by the main /api/onchain route.
 */

import { NextRequest } from "next/server";
import { resolveRiskRank, resolveTopMarkets } from "@/lib/graph/resolve";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const action = searchParams.get("action") ?? "risk_rank";
  const wallet = searchParams.get("wallet");

  try {
    if (action === "markets") {
      const data = await resolveTopMarkets();
      return Response.json({ ok: true, action, data });
    }

    if (!wallet) {
      return Response.json(
        { error: "Missing ?wallet= parameter" },
        { status: 400 }
      );
    }

    const data = await resolveRiskRank(wallet);
    return Response.json({ ok: true, action, data });
  } catch (err) {
    console.error("[api/graph/resolve]", err);
    return Response.json({ error: String(err) }, { status: 502 });
  }
}

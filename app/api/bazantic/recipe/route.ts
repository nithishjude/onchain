/**
 * app/api/bazantic/recipe/route.ts
 * Microservice: Bazantic agent-facing exposure layer.
 * Phase 4 — isolated stub with correct structure.
 * The rank-and-route recipe logic lives in lib/bazantic/recipe.ts.
 */

import { NextRequest } from "next/server";
import { resolveRiskRank } from "@/lib/graph/resolve";

const BAZANTIC_API_KEY = process.env.BAZANTIC_API_KEY!;

/**
 * POST /api/bazantic/recipe
 * Body: { wallet: string, recipe: "rank-and-route" }
 * Returns: riskiest position + swap route (Phase 4 wires 1inch)
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { wallet: string; recipe?: string };

    if (!body.wallet) {
      return Response.json({ error: "Missing wallet in body" }, { status: 400 });
    }

    if (!BAZANTIC_API_KEY) {
      return Response.json({ error: "Bazantic not configured" }, { status: 503 });
    }

    // Step 1: Graph-derived risk ranking (real data, not mock)
    const riskData = await resolveRiskRank(body.wallet);

    if (riskData.positions.length === 0) {
      return Response.json({
        ok: true,
        recipe: "rank-and-route",
        result: {
          flagged: null,
          message: "No open positions found for this wallet",
          suggestedExit: null,
        },
      });
    }

    // Riskiest = first borrow position (sorted by balanceUSD desc in resolver)
    const riskiest = riskData.positions.find((p) => p.side === "BORROWER") ?? riskData.positions[0];

    // Step 2: TODO Phase 4 — call 1inch with derived params:
    // const route = await fetch(`https://api.1inch.dev/swap/v6.0/1/quote?...`, {
    //   headers: { Authorization: `Bearer ${process.env.ONEINCH_API_KEY}` }
    // });

    return Response.json({
      ok: true,
      recipe: "rank-and-route",
      step1_graphResult: {
        wallet: riskData.wallet,
        overallHealthFactor: riskData.overallHealthFactor,
        totalCollateralUSD: riskData.totalCollateralUSD,
        totalDebtUSD: riskData.totalDebtUSD,
      },
      step2_derivedParams: {
        // These params will drive the 1inch call in Phase 4
        riskiestPosition: riskiest.market,
        token: riskiest.token,
        debtUSD: riskiest.balanceUSD,
        side: riskiest.side,
        note: "1inch swap route wired in Phase 4",
      },
      dataSource: riskData.dataSource,
    });
  } catch (err) {
    console.error("[api/bazantic/recipe]", err);
    return Response.json({ error: String(err) }, { status: 502 });
  }
}

export async function GET() {
  return Response.json({
    ok: true,
    recipes: [
      {
        name: "rank-and-route",
        description:
          "Ranks a wallet's onchain positions by risk using The Graph, then fetches a live exit swap route for the riskiest position via 1inch.",
        inputs: [{ name: "wallet", type: "address", required: true }],
        status: "step1_live_step2_phase4",
      },
    ],
  });
}

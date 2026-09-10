/**
 * app/api/onchain/[metric]/route.ts
 * Main entrypoint called by Google Sheets via UrlFetchApp.
 * One route handles all metrics — dispatches to the correct microservice.
 *
 * Supported metrics (Phase 1):
 *   risk_rank      — wallet risk ranking across positions
 *   health_factor  — overall health factor
 *   markets        — top Aave markets by TVL
 */

import { NextRequest } from "next/server";
import { resolveRiskRank, resolveTopMarkets } from "@/lib/graph/resolve";

const SUPPORTED_METRICS = ["risk_rank", "health_factor", "markets"] as const;
type Metric = (typeof SUPPORTED_METRICS)[number];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ metric: string }> }
) {
  const { metric } = await params;
  const { searchParams } = request.nextUrl;
  const wallet = searchParams.get("wallet");

  // ── Validate metric ───────────────────────────────────────────────────────
  if (!SUPPORTED_METRICS.includes(metric as Metric)) {
    return Response.json(
      {
        error: `#ONCHAIN_UNKNOWN_METRIC`,
        message: `Unknown metric "${metric}". Supported: ${SUPPORTED_METRICS.join(", ")}`,
      },
      { status: 400 }
    );
  }

  // ── Markets doesn't need a wallet ─────────────────────────────────────────
  if (metric === "markets") {
    try {
      const data = await resolveTopMarkets();
      return Response.json({ ok: true, metric, data });
    } catch (err) {
      return Response.json(
        { error: "#ONCHAIN_STALE", message: String(err) },
        { status: 502 }
      );
    }
  }

  // ── All other metrics require a wallet ───────────────────────────────────
  if (!wallet) {
    return Response.json(
      { error: "#ONCHAIN_NO_WALLET", message: "Missing ?wallet= parameter" },
      { status: 400 }
    );
  }

  // Basic address validation
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return Response.json(
      { error: "#ONCHAIN_BAD_WALLET", message: `"${wallet}" is not a valid Ethereum address` },
      { status: 400 }
    );
  }

  try {
    const riskData = await resolveRiskRank(wallet);

    if (metric === "health_factor") {
      return Response.json({
        ok: true,
        metric,
        wallet,
        data: {
          healthFactor: riskData.overallHealthFactor,
          totalCollateralUSD: riskData.totalCollateralUSD,
          totalDebtUSD: riskData.totalDebtUSD,
          dataSource: riskData.dataSource,
          timestamp: riskData.timestamp,
        },
      });
    }

    // risk_rank — full ranked positions
    return Response.json({
      ok: true,
      metric,
      wallet,
      data: riskData,
    });
  } catch (err) {
    console.error(`[onchain/${metric}]`, err);
    return Response.json(
      { error: "#ONCHAIN_STALE", message: String(err) },
      { status: 502 }
    );
  }
}

// Allow CORS so Google Sheets (UrlFetchApp) can call this
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

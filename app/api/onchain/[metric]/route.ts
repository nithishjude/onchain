/**
 * app/api/onchain/[metric]/route.ts
 * Main entrypoint called by Google Sheets via UrlFetchApp.
 * One route handles all metrics — dispatches to the correct microservice.
 *
 * Supported metrics:
 *   risk_rank      — wallet risk ranking across Aave V3 positions
 *   health_factor  — overall health factor (Aave V3)
 *   lp_positions   — cross-protocol LP/lending positions (Compound V3 + Uniswap V3)
 *   markets        — top Aave markets by TVL
 */

import { NextRequest } from "next/server";
import { resolveRiskRank, resolveTopMarkets } from "@/lib/graph/resolve";
import { resolveLPPositions } from "@/lib/graph/compound";

const SUPPORTED_METRICS = ["risk_rank", "health_factor", "lp_positions", "markets"] as const;
type Metric = (typeof SUPPORTED_METRICS)[number];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // ── Markets doesn't need a wallet ─────────────────────────────────────────
  if (metric === "markets") {
    try {
      const data = await resolveTopMarkets();
      return Response.json({ ok: true, metric, data }, { headers: CORS_HEADERS });
    } catch (err) {
      return Response.json(
        { error: "#ONCHAIN_STALE", message: String(err) },
        { status: 502, headers: CORS_HEADERS }
      );
    }
  }

  // ── All other metrics require a wallet ───────────────────────────────────
  if (!wallet) {
    return Response.json(
      { error: "#ONCHAIN_NO_WALLET", message: "Missing ?wallet= parameter" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Basic address validation
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return Response.json(
      { error: "#ONCHAIN_BAD_WALLET", message: `"${wallet}" is not a valid Ethereum address` },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    // ── lp_positions — cross-protocol composability (Compound V3 + Uniswap V3) ──
    if (metric === "lp_positions") {
      const data = await resolveLPPositions(wallet);
      return Response.json(
        {
          ok: true,
          metric,
          wallet,
          data,
          protocols: ["Compound V3", "Uniswap V3"],
          dataSource: "The Graph — Messari Standardized Subgraphs (multi-protocol)",
        },
        { headers: CORS_HEADERS }
      );
    }

    // ── risk_rank + health_factor — Aave V3 ───────────────────────────────────
    const riskData = await resolveRiskRank(wallet);

    if (metric === "health_factor") {
      return Response.json(
        {
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
        },
        { headers: CORS_HEADERS }
      );
    }

    // risk_rank — full ranked positions
    return Response.json(
      { ok: true, metric, wallet, data: riskData },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error(`[onchain/${metric}]`, err);
    return Response.json(
      { error: "#ONCHAIN_STALE", message: String(err) },
      { status: 502, headers: CORS_HEADERS }
    );
  }
}

// Allow CORS so Google Sheets (UrlFetchApp) can call this
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

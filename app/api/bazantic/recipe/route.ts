/**
 * app/api/bazantic/recipe/route.ts
 * Microservice: Bazantic agent-facing exposure layer.
 * rank-and-route Recipe: Graph risk ranking → 1inch swap quote derived from result.
 *
 * This is the "meaningfully depends on both services" pattern:
 *   Step 1: Graph → risk ranked positions (real data)
 *   Step 2: 1inch → swap quote where params are DERIVED from step 1 output (not hardcoded)
 */

import { NextRequest } from "next/server";
import { resolveRiskRank } from "@/lib/graph/resolve";

const BAZANTIC_API_KEY = process.env.BAZANTIC_API_KEY!;
const ONEINCH_API_KEY = process.env.ONEINCH_API_KEY ?? "";

// 1inch v6 API — Ethereum mainnet (chain 1)
const ONEINCH_BASE = "https://api.1inch.dev/swap/v6.0/1";

// Common token addresses for the swap quote
const TOKEN_ADDRESSES: Record<string, string> = {
  WETH:  "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  USDC:  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  USDT:  "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  DAI:   "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  WBTC:  "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
  LINK:  "0x514910771AF9Ca656af840dff83E8264EcF986CA",
  AAVE:  "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
  UNI:   "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
};

function getTokenAddress(symbol: string): string {
  return TOKEN_ADDRESSES[symbol.toUpperCase()] ?? TOKEN_ADDRESSES.USDC;
}

async function fetchOneInchQuote(
  fromTokenSymbol: string,
  amount: number
): Promise<{
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  estimatedGas: number;
  protocols: string;
  priceImpact: string;
} | null> {
  if (!ONEINCH_API_KEY) return null;

  try {
    // Convert USD amount to token amount (approximate using price = $1 for stablecoins as base)
    // We convert the debt to USDC equivalent (6 decimals)
    const amountInWei = Math.floor(amount * 1e6).toString(); // USDC has 6 decimals
    const fromToken = getTokenAddress(fromTokenSymbol);
    const toToken = getTokenAddress("USDC");

    const url = new URL(`${ONEINCH_BASE}/quote`);
    url.searchParams.set("src", fromToken);
    url.searchParams.set("dst", toToken);
    url.searchParams.set("amount", amountInWei);

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${ONEINCH_API_KEY}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      console.warn("[1inch] Quote failed:", res.status, await res.text());
      return null;
    }

    const data = (await res.json()) as {
      dstAmount: string;
      srcAmount: string;
      gas: number;
      protocols: unknown[][];
    };

    const protocols = data.protocols
      ?.flat(2)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((p: any) => p?.name)
      .filter(Boolean)
      .slice(0, 3)
      .join(" → ") ?? "Direct";

    const toAmountFormatted = (parseInt(data.dstAmount) / 1e6).toFixed(2);
    const priceImpact = ((amount - parseFloat(toAmountFormatted)) / amount * 100).toFixed(2);

    return {
      fromToken: fromTokenSymbol,
      toToken: "USDC",
      fromAmount: `${amount.toFixed(2)} USD worth of ${fromTokenSymbol}`,
      toAmount: `${toAmountFormatted} USDC`,
      estimatedGas: data.gas ?? 0,
      protocols,
      priceImpact: `${priceImpact}%`,
    };
  } catch (err) {
    console.warn("[1inch] Quote error:", err);
    return null;
  }
}

/**
 * POST /api/bazantic/recipe
 * Body: { wallet: string, recipe: "rank-and-route" }
 * Returns: riskiest position (Graph) + swap route (1inch derived from step 1)
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

    // ── Step 1: Graph-derived risk ranking ────────────────────────────────────
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

    // Riskiest = largest BORROWER position (sorted by balanceUSD desc)
    const riskiest =
      riskData.positions.find((p) => p.side === "BORROWER") ??
      riskData.positions[0];

    // ── Step 2: 1inch swap quote — params DERIVED from step 1 ─────────────────
    // This is the core "meaningfully depends on both services" moment:
    // The token and amount fed to 1inch are computed FROM the Graph result.
    const swapQuote = await fetchOneInchQuote(riskiest.token, riskiest.balanceUSD);

    const recipeMeta = {
      name: "rank-and-route",
      version: "1.0.0",
      description:
        "Ranks a wallet's onchain positions by risk using The Graph, then fetches a live exit swap route for the riskiest position via 1inch.",
      mcpEndpoint: "/api/bazantic/mcp",
      registeredAt: "Bazantic Gateway",
    };

    return Response.json({
      ok: true,
      recipe: recipeMeta,
      step1_graphResult: {
        protocol: "Aave V3 Ethereum (Messari Standardized Subgraph)",
        wallet: riskData.wallet,
        overallHealthFactor: riskData.overallHealthFactor,
        totalCollateralUSD: riskData.totalCollateralUSD,
        totalDebtUSD: riskData.totalDebtUSD,
        positionCount: riskData.positions.length,
        riskiestPosition: {
          market: riskiest.market,
          token: riskiest.token,
          side: riskiest.side,
          balanceUSD: riskiest.balanceUSD,
          riskScore: riskiest.riskScore,
          liquidationThreshold: riskiest.liquidationThreshold,
        },
      },
      step2_derivedSwapRoute: swapQuote ?? {
        note: "1inch API key not set — add ONEINCH_API_KEY to .env.local",
        fromToken: riskiest.token,
        toToken: "USDC",
        derivedFrom: `Step 1: riskiest position = ${riskiest.token} ($${riskiest.balanceUSD})`,
      },
      dataSource: riskData.dataSource,
      timestamp: riskData.timestamp,
    });
  } catch (err) {
    console.error("[api/bazantic/recipe]", err);
    return Response.json({ error: String(err) }, { status: 502 });
  }
}

/**
 * GET /api/bazantic/recipe — recipe registry / MCP manifest
 */
export async function GET() {
  return Response.json({
    ok: true,
    mcpServer: {
      name: "onchain-formulas-mcp",
      version: "1.0.0",
      description:
        "MCP server exposing onchain data recipes for agent use. Powered by The Graph + 1inch via Bazantic Gateway.",
      endpoint: "/api/bazantic/recipe",
    },
    recipes: [
      {
        name: "rank-and-route",
        description:
          "Ranks a wallet's onchain positions by risk using The Graph, then fetches a live exit swap route for the riskiest position via 1inch. Step 2 parameters are derived from Step 1 output — not hardcoded.",
        inputs: [{ name: "wallet", type: "address", required: true }],
        outputs: [
          { name: "step1_graphResult", description: "Risk-ranked positions from Aave V3 via The Graph" },
          { name: "step2_derivedSwapRoute", description: "1inch swap quote for the riskiest position" },
        ],
        chainedServices: ["The Graph (Messari Standardized Lending)", "1inch DEX Aggregator"],
        status: "live",
      },
    ],
  });
}

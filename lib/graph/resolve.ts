/**
 * lib/graph/resolve.ts
 * Core reasoning layer — queries the Messari Standardized Lending Subgraph
 * (Aave V3 Ethereum) and computes a risk ranking server-side.
 *
 * This is Phase 1 + Phase 2 logic:
 *   - Real positions from The Graph (no mock data)
 *   - Risk score computed here, not returned raw from subgraph
 *   - Designed to fan-out to multiple subgraphs in Phase 2
 */

import { graphQuery } from "./client";

// ── Types matching the Messari Standardized Lending schema ──────────────────

interface RawToken {
  symbol: string;
  decimals: number;
}

interface RawMarket {
  id: string;
  name: string;
  inputToken: RawToken;
  inputTokenPriceUSD: string;
  totalValueLockedUSD: string;
  liquidationThreshold: string;
  maximumLTV: string;
}

interface RawPosition {
  id: string;
  side: "COLLATERAL" | "BORROWER";
  balance: string;
  isCollateral: boolean;
  market: RawMarket;
}

interface RawAccount {
  id: string;
  positionCount: number;
  openPositionCount: number;
  positions: RawPosition[];
}

interface AccountQueryResult {
  accounts: RawAccount[];
}

// ── Public types returned to the API route ───────────────────────────────────

export interface Position {
  protocol: string;       // e.g. "Aave Ethereum"
  market: string;         // e.g. "Aave Ethereum WETH"
  token: string;          // e.g. "WETH"
  side: "COLLATERAL" | "BORROWER";
  balanceRaw: string;
  balanceUSD: number;
  riskScore: number;      // debtUSD / collateralUSD per market pair — 0 for pure collateral
  liquidationThreshold: number;
  healthFactor: number | null;
}

export interface RiskRankResult {
  wallet: string;
  totalCollateralUSD: number;
  totalDebtUSD: number;
  overallHealthFactor: number | null;
  positions: Position[];
  dataSource: string;
  timestamp: number;
}

// ── Query ────────────────────────────────────────────────────────────────────

const POSITIONS_QUERY = `
  query WalletPositions($wallet: String!) {
    accounts(where: { id: $wallet }) {
      id
      positionCount
      openPositionCount
      positions(where: { balance_gt: "0" }, first: 100) {
        id
        side
        balance
        isCollateral
        market {
          id
          name
          inputToken { symbol decimals }
          inputTokenPriceUSD
          totalValueLockedUSD
          liquidationThreshold
          maximumLTV
        }
      }
    }
  }
`;

// ── Resolver ─────────────────────────────────────────────────────────────────

export async function resolveRiskRank(wallet: string): Promise<RiskRankResult> {
  const walletLower = wallet.toLowerCase();

  const data = await graphQuery<AccountQueryResult>(POSITIONS_QUERY, {
    wallet: walletLower,
  });

  const account = data.accounts[0];

  if (!account || account.openPositionCount === 0) {
    return {
      wallet,
      totalCollateralUSD: 0,
      totalDebtUSD: 0,
      overallHealthFactor: null,
      positions: [],
      dataSource: "Aave V3 Ethereum (Messari Standardized Subgraph)",
      timestamp: Date.now(),
    };
  }

  let totalCollateralUSD = 0;
  let totalDebtUSD = 0;

  const positions: Position[] = account.positions.map((pos) => {
    const decimals = pos.market.inputToken.decimals;
    const priceUSD = parseFloat(pos.market.inputTokenPriceUSD);
    const balanceHuman = Number(BigInt(pos.balance)) / Math.pow(10, decimals);
    const balanceUSD = balanceHuman * priceUSD;
    const liquidationThreshold = parseFloat(pos.market.liquidationThreshold ?? "0");

    if (pos.side === "COLLATERAL" && pos.isCollateral) {
      totalCollateralUSD += balanceUSD * liquidationThreshold;
    } else if (pos.side === "BORROWER") {
      totalDebtUSD += balanceUSD;
    }

    // Per-position risk score: only meaningful for borrow positions
    const riskScore = pos.side === "BORROWER" && balanceUSD > 0
      ? balanceUSD / Math.max(totalCollateralUSD, 1)
      : 0;

    return {
      protocol: "Aave V3",
      market: pos.market.name,
      token: pos.market.inputToken.symbol,
      side: pos.side,
      balanceRaw: pos.balance,
      balanceUSD: Math.round(balanceUSD * 100) / 100,
      riskScore: Math.round(riskScore * 10000) / 10000,
      liquidationThreshold,
      healthFactor: null, // computed at portfolio level below
    };
  });

  // Overall health factor: weighted collateral / total debt
  const overallHealthFactor =
    totalDebtUSD > 0
      ? Math.round((totalCollateralUSD / totalDebtUSD) * 100) / 100
      : null;

  // Rank borrow positions by USD size descending (riskiest first)
  positions.sort((a, b) => b.balanceUSD - a.balanceUSD);

  return {
    wallet,
    totalCollateralUSD: Math.round(totalCollateralUSD * 100) / 100,
    totalDebtUSD: Math.round(totalDebtUSD * 100) / 100,
    overallHealthFactor,
    positions,
    dataSource: "Aave V3 Ethereum (Messari Standardized Subgraph)",
    timestamp: Date.now(),
  };
}

// ── Simple market lookup ─────────────────────────────────────────────────────

const MARKETS_QUERY = `
  query {
    markets(first: 20, orderBy: totalValueLockedUSD, orderDirection: desc) {
      id
      name
      inputToken { symbol }
      totalValueLockedUSD
      totalBorrowBalanceUSD
    }
  }
`;

export interface MarketSummary {
  id: string;
  name: string;
  token: string;
  tvlUSD: number;
  borrowUSD: number;
}

export async function resolveTopMarkets(): Promise<MarketSummary[]> {
  const data = await graphQuery<{ markets: { id: string; name: string; inputToken: { symbol: string }; totalValueLockedUSD: string; totalBorrowBalanceUSD: string }[] }>(MARKETS_QUERY);

  return data.markets.map((m) => ({
    id: m.id,
    name: m.name,
    token: m.inputToken.symbol,
    tvlUSD: Math.round(parseFloat(m.totalValueLockedUSD) * 100) / 100,
    borrowUSD: Math.round(parseFloat(m.totalBorrowBalanceUSD) * 100) / 100,
  }));
}

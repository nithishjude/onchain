/**
 * lib/graph/compound.ts
 * Compound V3 (Comet) positions via Messari Standardized Lending Subgraph.
 * This is the SECOND protocol — composability across Aave + Compound
 * behind a single =ONCHAIN(wallet, "lp_positions") function call.
 *
 * Subgraph ID: Compound V3 Mainnet (Messari)
 * Schema: identical lending-v1 shape → same query, different endpoint.
 */

// Compound V3 Messari subgraph (separate endpoint from Aave)
const COMPOUND_SUBGRAPH_URL = `https://gateway.thegraph.com/api/${process.env.GRAPH_API_KEY}/subgraphs/id/${process.env.GRAPH_COMPOUND_SUBGRAPH_ID ?? "HNzdKhEHPHbsHvpQPdwdmAz9mPCHnHCeUSpMBKoKSbv"}`;

interface CompoundRawPosition {
  id: string;
  side: "COLLATERAL" | "BORROWER";
  balance: string;
  isCollateral: boolean;
  market: {
    id: string;
    name: string;
    inputToken: { symbol: string; decimals: number };
    inputTokenPriceUSD: string;
    totalValueLockedUSD: string;
    liquidationThreshold: string;
  };
}

interface CompoundQueryResult {
  accounts: {
    id: string;
    positions: CompoundRawPosition[];
  }[];
}

const COMPOUND_POSITIONS_QUERY = `
  query CompoundPositions($wallet: String!) {
    accounts(where: { id: $wallet }) {
      id
      positions(where: { balance_gt: "0" }, first: 50) {
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
        }
      }
    }
  }
`;

export interface CompoundPosition {
  protocol: string;
  market: string;
  token: string;
  side: "COLLATERAL" | "BORROWER";
  balanceUSD: number;
  liquidationThreshold: number;
}

export async function resolveCompoundPositions(wallet: string): Promise<CompoundPosition[]> {
  try {
    const res = await fetch(COMPOUND_SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: COMPOUND_POSITIONS_QUERY,
        variables: { wallet: wallet.toLowerCase() },
      }),
      next: { revalidate: 60 },
    });

    if (!res.ok) return [];

    const json = (await res.json()) as { data?: CompoundQueryResult; errors?: unknown[] };
    if (json.errors || !json.data) return [];

    const account = json.data.accounts[0];
    if (!account) return [];

    return account.positions.map((pos) => {
      const decimals = pos.market.inputToken.decimals;
      const price = parseFloat(pos.market.inputTokenPriceUSD);
      const balance = Number(BigInt(pos.balance)) / Math.pow(10, decimals);
      const balanceUSD = Math.round(balance * price * 100) / 100;
      return {
        protocol: "Compound V3",
        market: pos.market.name,
        token: pos.market.inputToken.symbol,
        side: pos.side,
        balanceUSD,
        liquidationThreshold: parseFloat(pos.market.liquidationThreshold ?? "0"),
      };
    });
  } catch {
    return [];
  }
}

// ── Simple LP positions from Uniswap V3 ──────────────────────────────────────
// Uses Uniswap V3 subgraph for LP positions (real data, same Graph gateway)

const UNISWAP_SUBGRAPH_URL = `https://gateway.thegraph.com/api/${process.env.GRAPH_API_KEY}/subgraphs/id/${process.env.GRAPH_UNISWAP_SUBGRAPH_ID ?? "5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV"}`;

interface UniswapRawPosition {
  id: string;
  liquidity: string;
  pool: {
    token0: { symbol: string };
    token1: { symbol: string };
    feeTier: string;
    totalValueLockedUSD: string;
  };
  depositedToken0: string;
  depositedToken1: string;
  withdrawnToken0: string;
  withdrawnToken1: string;
}

const UNISWAP_POSITIONS_QUERY = `
  query UniswapPositions($owner: String!) {
    positions(where: { owner: $owner, liquidity_gt: "0" }, first: 20) {
      id
      liquidity
      pool {
        token0 { symbol }
        token1 { symbol }
        feeTier
        totalValueLockedUSD
      }
      depositedToken0
      depositedToken1
      withdrawnToken0
      withdrawnToken1
    }
  }
`;

export interface LPPosition {
  protocol: "Uniswap V3" | "Compound V3";
  positionId?: string;
  token0?: string;
  token1?: string;
  market?: string;
  token?: string;
  feeTier?: string;
  depositedToken0?: number;
  depositedToken1?: number;
  estimatedValueUSD?: number;
  side?: string;
  balanceUSD?: number;
}

export async function resolveLPPositions(wallet: string): Promise<LPPosition[]> {
  const lowerWallet = wallet.toLowerCase();

  const [compoundPositions, uniswapRes] = await Promise.allSettled([
    resolveCompoundPositions(lowerWallet),
    fetch(UNISWAP_SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: UNISWAP_POSITIONS_QUERY,
        variables: { owner: lowerWallet },
      }),
      next: { revalidate: 60 },
    })
      .then((r) => r.json() as Promise<{ data?: { positions: UniswapRawPosition[] }; errors?: unknown[] }>)
      .catch(() => ({ data: undefined })),
  ]);

  const results: LPPosition[] = [];

  // Compound positions
  if (compoundPositions.status === "fulfilled") {
    for (const pos of compoundPositions.value) {
      results.push({
        protocol: "Compound V3",
        market: pos.market,
        token: pos.token,
        side: pos.side,
        balanceUSD: pos.balanceUSD,
      });
    }
  }

  // Uniswap positions
  if (uniswapRes.status === "fulfilled" && uniswapRes.value.data?.positions) {
    for (const pos of uniswapRes.value.data.positions) {
      const dep0 = parseFloat(pos.depositedToken0) - parseFloat(pos.withdrawnToken0);
      const dep1 = parseFloat(pos.depositedToken1) - parseFloat(pos.withdrawnToken1);
      results.push({
        protocol: "Uniswap V3",
        positionId: pos.id,
        token0: pos.pool.token0.symbol,
        token1: pos.pool.token1.symbol,
        feeTier: `${parseInt(pos.pool.feeTier) / 10000}%`,
        depositedToken0: Math.round(dep0 * 1e4) / 1e4,
        depositedToken1: Math.round(dep1 * 1e4) / 1e4,
        estimatedValueUSD: Math.round(parseFloat(pos.pool.totalValueLockedUSD) * (parseInt(pos.liquidity) / 1e18) * 100) / 100,
      });
    }
  }

  return results;
}

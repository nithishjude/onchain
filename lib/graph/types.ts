/**
 * lib/graph/types.ts
 * Shared TypeScript types for the Graph microservice layer.
 */

export interface Token {
  symbol: string;
  decimals: number;
}

export interface Market {
  id: string;
  name: string;
  inputToken: Token;
  inputTokenPriceUSD: string;
  totalValueLockedUSD: string;
  totalBorrowBalanceUSD: string;
  liquidationThreshold: string;
  maximumLTV: string;
}

export interface Position {
  id: string;
  side: "COLLATERAL" | "BORROWER";
  balance: string;
  isCollateral: boolean;
  market: Market;
}

export interface Account {
  id: string;
  positionCount: number;
  openPositionCount: number;
  positions: Position[];
}

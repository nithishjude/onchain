# Onchain Formulas
### *"Every cell, a node. Every sheet, a full node's worth of truth."*

**One-line pitch:** A Google Sheets function that turns any spreadsheet into a live, composable, permissioned window into onchain data — and the same reasoning engine doubles as a paid, agent-callable service.

---

## 1. Problem Statement

Web3's growth bottleneck isn't infrastructure — it's distribution. Asking users to adopt a new dApp, a new wallet UX, or a new dashboard is high-friction, and onboarding numbers reflect it. Meanwhile, hundreds of millions of people already do financial reasoning inside a tool they've used for a decade: **the spreadsheet**.

Onchain Formulas puts live, composed, standardized blockchain data one keystroke away from anyone who already knows `=SUM()` — no wallet install, no new tab, no learning curve. The web3-native complexity (identity, permissions, composable data, agent-callable services) lives entirely in the backend, invisible to the end user but load-bearing for everything the product does.

---

## 2. Product Overview

| | |
|---|---|
| **Core surface** | Google Sheets custom function: `=ONCHAIN(wallet, metric, [protocol])` |
| **Backend** | Next.js API routes acting as independent microservices, one per sponsor integration |
| **Data brain** | The Graph — Standardized Subgraphs + Subgraph MCP for cross-protocol reasoning |
| **Identity & permission layer** | ENSv2 — Permissioned Registry/Resolver + Enhanced Access Control |
| **Agent-facing exposure** | Bazantic — x402/MPP Gateway + MCP Server + Recipes |
| **Companion UI** | Next.js dashboard for setup, permission management, and recipe/agent testing — the "control plane" for the spreadsheet's onchain brain |

---

## 3. UX Philosophy: Flexible by Default

The core design bet is that **the spreadsheet is the primary UI, and the Next.js app is the configuration/observability layer behind it** — not a competing surface. This split is deliberate:

- **Spreadsheet UX** — must feel like a native Sheets function: autocomplete-friendly argument names, graceful error strings (`#ONCHAIN_STALE`, `#ONCHAIN_NOPERM`) instead of raw stack traces, and cell values that refresh like any live formula (stock ticker, currency conversion) so it fits existing spreadsheet mental models.
- **Flexibility principle:** the same function signature should compose — `=ONCHAIN(wallet, "risk_rank")`, `=ONCHAIN(wallet, "lp_positions", "uniswap")`, `=ONCHAIN(wallet, "health_factor", "aave")` — one shared function surface, many resolvable metrics, mirroring exactly how The Graph's Standardized Subgraphs let one query shape span many protocols. The UX metaphor and the technical architecture reinforce each other: **standardization at the data layer becomes simplicity at the user layer.**
- **Next.js dashboard UX** — three tabs, no more: **Connect** (link wallets/sheets, see ENS subname status), **Permissions** (visual grant/revoke of Enhanced Access Control roles — this is the screen the ENS demo video centers on), and **Agent Console** (test Bazantic recipes live, side-by-side "raw API vs. Recipe" comparison — this is the screen the Bazantic demo video centers on).
- Every screen is built to **film well** — because every sponsor's qualification checklist explicitly requires a demo video showing the *specific* mechanic (composability, permission gating, recipe improvement) working live, not hardcoded. The UI is designed backward from those checklists, not decorated afterward.

---

## 4. System Architecture

```
┌─────────────────────────┐
│   Google Sheets Client   │
│  =ONCHAIN(wallet,metric) │
└────────────┬─────────────┘
             │ UrlFetchApp (HTTPS)
             ▼
┌─────────────────────────────────────────────────────────────┐
│                Next.js App (single deploy)                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  /pages/api/onchain/[metric].ts   ← Sheets entrypoint  │  │
│  └───────────────────────────────────────────────────────┘  │
│         │                    │                    │          │
│         ▼                    ▼                    ▼          │
│  ┌────────────┐      ┌───────────────┐    ┌──────────────┐  │
│  │ /api/graph │      │  /api/ens     │    │ /api/bazantic│  │
│  │ (microsvc) │      │  (microsvc)   │    │  (microsvc)  │  │
│  └─────┬──────┘      └───────┬───────┘    └──────┬───────┘  │
│        │                     │                     │          │
│  ┌────────────────────────────────────────────────────────┐  │
│  │        Next.js Dashboard (Connect / Permissions /       │  │
│  │        Agent Console) — reads the same 3 microservices  │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │                     │                     │
         ▼                     ▼                     ▼
┌────────────────┐   ┌──────────────────┐  ┌────────────────────┐
│  Subgraph MCP   │   │  ENSv2 (Sepolia) │  │  Bazantic Gateway   │
│  + Standardized │   │  Permissioned    │  │  + MCP Server       │
│  Subgraphs      │   │  Registry/       │  │  + Recipes          │
│  (Messari)      │   │  Resolver +      │  │                     │
│                 │   │  Enhanced Access │  │  chains to:         │
│                 │   │  Control         │  │  1inch / Uniswap    │
└────────────────┘   └──────────────────┘  └────────────────────┘
```

Each `/api/*` route is deliberately isolated as its own microservice-style module — separate client instantiation, separate error boundary, separate types — so a judge (or you, at 3am) can point at one file and see exactly where one sponsor's technology lives, with no cross-contamination. This is the "microservices inside a monolith deploy" pattern: operational simplicity of one Next.js deploy, architectural clarity of separated services.

---

## 5. Sponsor Integration Deep-Dive

### 5.1 The Graph — the reasoning layer

**Why this satisfies "composable, not just one Subgraph query":** the Graph explicitly disqualifies single-Subgraph lookups from their top track. Onchain Formulas' entire premise is standardization: one function resolves the same metric name across multiple protocols by querying a **Messari Standardized Subgraph schema**, then layering the **Subgraph MCP** on top so protocol selection and cross-protocol comparison happen via natural-language-shaped queries rather than hardcoded per-protocol branches.

`/api/graph/resolve.ts`:
```typescript
import { SubgraphMCPClient } from "@graphprotocol/subgraph-mcp";

const mcp = new SubgraphMCPClient({ apiKey: process.env.GRAPH_API_KEY });

// Standardized schema means ONE query shape works for Aave, Compound, etc.
const STANDARD_QUERY = `
  query HealthFactor($wallet: String!) {
    positions(where: { account: $wallet }) {
      protocol { name }
      healthFactor
      collateralUSD
      debtUSD
    }
  }
`;

export async function resolveHealthFactor(wallet: string) {
  // MCP resolves which Standardized Subgraph endpoint(s) apply —
  // composability happens here, not in per-protocol if/else branches.
  const results = await mcp.queryStandardized({
    schema: "lending-v1", // Messari standardized lending schema
    query: STANDARD_QUERY,
    variables: { wallet },
  });

  // Meaningful reasoning step (not a raw pass-through):
  return results.positions
    .map((p) => ({
      protocol: p.protocol.name,
      riskScore: p.debtUSD / p.collateralUSD, // computed, not queried
      healthFactor: p.healthFactor,
    }))
    .sort((a, b) => b.riskScore - a.riskScore); // ranked, so =ONCHAIN(wallet,"risk_rank") is a real reasoning product
}
```

**Newer Graph technology we're leaning into deliberately** (the stuff they're actively pushing right now, not legacy Subgraph-only integration):
- **Subgraph MCP** — natural-language-shaped cross-protocol querying, their current flagship AI-tooling surface.
- **Substreams**, as a stretch goal for a real-time Sheets refresh trigger (rather than poll-on-demand), since it's explicitly called out as a featured challenge track this cycle.

---

### 5.2 ENSv2 — the identity and permission layer

**Why this satisfies "central, not cosmetic":** the ENS criteria explicitly require the demo to show a functional permission difference, not a decorative subname. Onchain Formulas gives **every connected spreadsheet its own ENSv2 subname**, and uses **Enhanced Access Control** to enforce a real, filmable permission split: the sheet *owner* can edit which wallets are tracked; the backend *service account* can only write telemetry fields; neither can touch the other's fields.

`/api/ens/permissions.ts`:
```typescript
import { PermissionedRegistry, PermissionedResolver } from "@ensdomains/ensv2-sdk";

// Each spreadsheet gets its own subname under the project's parent name
export async function provisionSheetIdentity(sheetId: string) {
  const subname = `${sheetId}.onchainformulas.eth`;

  const registry = new PermissionedRegistry({ network: "sepolia" });
  await registry.createSubname(subname, {
    parent: "onchainformulas.eth",
  });

  const resolver = new PermissionedResolver({ subname });

  // Enhanced Access Control: two distinct roles, two distinct write scopes
  await resolver.grantRole({
    role: "sheet-owner",
    address: /* owner's connected wallet */ ownerAddress,
    permittedFields: ["tracked_wallets", "alert_threshold"],
  });

  await resolver.grantRole({
    role: "backend-service",
    address: process.env.SERVICE_ACCOUNT_ADDRESS,
    permittedFields: ["last_queried_at", "cache_status"],
  });

  return { subname, resolverAddress: resolver.address };
}

// The filmable moment: prove the owner CANNOT write telemetry fields,
// and the service account CANNOT write tracked_wallets.
export async function attemptWrite(subname: string, field: string, caller: string) {
  const resolver = new PermissionedResolver({ subname });
  return resolver.setText(field, caller); // reverts on-chain if role lacks permission — not app-layer faked
}
```

**Newer ENS technology we're leaning into deliberately:** ENSv2 is in Sepolia beta right now — this is explicitly the freshest surface area ENS wants hackathon teams stress-testing. We use the **new hierarchical registry** (subname-per-sheet, tokenized under our own rules) plus **Enhanced Access Control** as the shared role system across both the registry and resolver layers — the two mechanics ENS's own docs frame as the beta's headline features.

---

### 5.3 Bazantic — the agent-facing exposure layer

**Why this satisfies "meaningfully depends on both services":** the recipe doesn't just call two APIs in sequence for show — the second call's *parameters* are derived from the first call's *output*. If the risk-rank result changes, the swap-quote request changes with it.

`/api/bazantic/recipe.ts`:
```typescript
import { BazanticGateway, Recipe } from "@bazantic/sdk";

const gateway = new BazanticGateway({ project: "onchain-formulas" });

export const riskExitRecipe = new Recipe({
  name: "rank-and-route",
  description:
    "Ranks a wallet's onchain positions by risk using The Graph, " +
    "then fetches a live exit swap route for the riskiest position via 1inch.",
  async run({ wallet }) {
    // Step 1: Graph-derived reasoning (not decorative — drives step 2's inputs)
    const ranked = await resolveHealthFactor(wallet);
    const riskiest = ranked[0];

    // Step 2: swap params are DERIVED from step 1's result, not hardcoded
    const route = await gateway.call("1inch.getSwapQuote", {
      fromToken: riskiest.debtToken,
      toToken: riskiest.collateralToken,
      amount: riskiest.debtUSD,
    });

    return {
      flagged: riskiest,
      suggestedExit: route, // final result depends meaningfully on BOTH services
    };
  },
});

gateway.registerRecipe(riskExitRecipe);
gateway.deployMCPServer(); // exposes this recipe to any MCP-capable agent
```

**Newer Bazantic technology we're leaning into deliberately:** the **x402/MPP Gateway + Recipe** pattern is Bazantic's core differentiator right now — pre-wiring an API into an agent-legible, paid, reusable tool call rather than a one-off integration. We build this as a genuinely reusable Recipe (documented, callable by any other hackathon team's agent), not a demo-only script, which is explicitly what they say separates the top submissions.

---

## 6. Qualification Checklist (self-graded against each sponsor's stated criteria)

| Sponsor | Requirement | How this PRD satisfies it |
|---|---|---|
| **The Graph** | Live data, not mocked | All queries hit Subgraph Studio endpoints directly |
| | Composable/standardized, not single-Subgraph | Messari Standardized Subgraph schema spans ≥2 protocols behind one function |
| | Meaningful reasoning, not raw pass-through | Risk-ranking computation happens server-side before returning to Sheets |
| **ENSv2** | Central, not cosmetic | Enhanced Access Control gates real field-level writes, provably on-chain |
| | Functional demo, no hardcoded values | `attemptWrite()` reverts on-chain for unauthorized roles — filmable live |
| **Bazantic** | Result meaningfully depends on both services | Swap route parameters are computed from Graph output, not static |
| | Reusable Recipe, not one-off | Recipe is documented and registered on an MCP server other teams can call |

---

## 7. Demo Video Plan (map directly to what's being judged)

1. **Cold open:** type `=ONCHAIN(wallet, "risk_rank")` into a fresh Google Sheet, live data populates.
2. **Graph moment:** show the same function resolving across two different protocols with no code change — proves standardization.
3. **ENS moment:** switch between owner account and service account in the dashboard's Permissions tab, attempt the *other* role's write, show the on-chain revert.
4. **Bazantic moment:** Agent Console side-by-side — call the raw API, then call the Recipe, show the improved/derived result, and show the same Recipe being invoked from an external MCP client.

---

## 8. Tech Stack Summary

- **Frontend + API:** Next.js (App Router), TypeScript
- **Sheets integration:** Google Apps Script custom function → HTTPS call into Next.js API route
- **Data:** The Graph — Subgraph MCP, Standardized (Messari) Subgraphs, optional Substreams stretch goal
- **Identity/Permissions:** ENSv2 (Sepolia) — Permissioned Registry, Permissioned Resolver, Enhanced Access Control
- **Agent exposure:** Bazantic — x402/MPP Gateway, MCP Server, Recipes
- **Chained sponsor API:** 1inch (swap quote) or Uniswap, invoked from within the Bazantic Recipe

---

## 9. Open Questions / Assumptions to Validate Before Building

- Confirm which lending/DEX protocols currently have a Messari Standardized Subgraph live and query-able, so the composability demo isn't blocked mid-hackathon.
- Confirm ENSv2 Sepolia testnet stability close to submission time — beta networks can have downtime.
- Decide whether Substreams (stretch goal) is worth the build time versus polishing the three core-track requirements above.

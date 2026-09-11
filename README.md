# ⬡ Onchain Formulas

*"Every cell, a node. Every sheet, a full node's worth of truth."*

**Onchain Formulas** is a Google Sheets custom function that turns any spreadsheet into a live, composable, permissioned window into onchain data. It bypasses the friction of traditional web3 onboarding by putting live blockchain data right where millions of people already do financial reasoning: inside a spreadsheet.

The reasoning engine that powers the spreadsheet doubles as a paid, agent-callable service.

## 🌟 Key Features

1. **Native Spreadsheet UX:** Use `=ONCHAIN(wallet, metric)` directly in Google Sheets. No wallets to connect, no new tabs, no learning curve.
2. **Cross-Protocol Composability:** A single function seamlessly queries multiple protocols (Aave V3, Compound V3, Uniswap V3) using **The Graph's** Messari Standardized Subgraphs.
3. **Identity & Permissions:** Powered by **ENSv2** on Sepolia. Every connected spreadsheet provisions its own subname (e.g., `1BxiMVs...onchainformulas.eth`) with Enhanced Access Control enforcing distinct write scopes for owners vs. service accounts.
4. **Agent-Ready Recipes:** Leverages **Bazantic** to expose a `rank-and-route` recipe. It uses The Graph to risk-rank a wallet's positions and chains that output into a 1inch swap quote for the riskiest position.
5. **Premium Control Plane:** A stunning Next.js dashboard provides observability, subname provisioning, and side-by-side recipe testing.

## 🏗️ Architecture

The project is structured as a "monolith of microservices" in a single Next.js App Router deployment:

- **Google Sheets Client (`sheets/onchain.gs`):** A custom Google Apps Script that uses `UrlFetchApp` to query the Next.js API.
- **The Graph Microservice (`/api/graph/*`):** Queries Messari Standardized Subgraphs for lending and LP positions and computes risk scores server-side.
- **ENSv2 Microservice (`/api/ens/*`):** Uses `ethers.js` to read from the live Sepolia testnet registry and resolver.
- **Bazantic Microservice (`/api/bazantic/*`):** Exposes an MCP server and recipes for agents to consume.
- **Next.js Dashboard (`app/page.tsx`):** The React frontend for configuration and testing.

## 🚀 Getting Started

### 1. Local Development Setup

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables. Copy `.env.local.example` (if present) or create `.env.local`:
   ```env
   # The Graph
   GRAPH_API_KEY=your_graph_api_key
   GRAPH_SUBGRAPH_ID=JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk
   GRAPH_COMPOUND_SUBGRAPH_ID=HNzdKhEHPHbsHvpQPdwdmAz9mPCHnHCeUSpMBKoKSbv
   GRAPH_UNISWAP_SUBGRAPH_ID=5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV

   # ENS Config
   ENS_OWNER_ADDRESS=your_eth_address
   ENS_SERVICE_ACCOUNT_ADDRESS=your_service_account_address
   ENS_PARENT_NAME=onchainformulas.eth
   ENS_NETWORK=sepolia
   SEPOLIA_RPC_URL=https://rpc.sepolia.org

   # Bazantic & 1inch
   BAZANTIC_API_KEY=your_bazantic_key
   ONEINCH_API_KEY=your_1inch_key

   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

### 2. Google Sheets Integration

1. Open a new or existing Google Sheet.
2. Navigate to **Extensions → Apps Script**.
3. Replace the contents of `Code.gs` with the code found in [`sheets/onchain.gs`](sheets/onchain.gs).
4. Update the `APP_URL` variable at the top of the script to your deployed URL (or keep it as `http://localhost:3000` if testing locally with a tunnel like ngrok).
5. Click **Save**.
6. Back in your spreadsheet, you can now use formulas like:
   - `=ONCHAIN("0xYourWallet", "risk_rank")`
   - `=ONCHAIN("0xYourWallet", "health_factor")`
   - `=ONCHAIN("0xYourWallet", "lp_positions")`
   - `=ONCHAIN("", "markets")`

## 🛠️ Hackathon Sponsor Tracks

### ◆ The Graph
- **Usage:** Standardized, cross-protocol data fetching.
- **Implementation:** Queries Messari Standardized Subgraphs for Aave V3, Compound V3, and Uniswap V3. Computes a meaningful `risk_rank` score rather than just passing through raw data.

### ⬡ ENSv2
- **Usage:** Identity and permission layer.
- **Implementation:** Provisions a subname for each sheet. Utilizes **Enhanced Access Control** on Sepolia to prove distinct, on-chain field-level write permissions for the sheet owner vs. the backend service account.

### ⚡ Bazantic
- **Usage:** Agent-facing exposure and chained tool calling.
- **Implementation:** The `rank-and-route` recipe demonstrates true dependency between services: The parameters for the 1inch swap quote (Step 2) are derived dynamically from the risk-ranked output of The Graph (Step 1).

## 📄 License
MIT

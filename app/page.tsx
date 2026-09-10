"use client";

import { useState } from "react";
import styles from "./page.module.css";

type Tab = "connect" | "permissions" | "agent";

// ── Types ────────────────────────────────────────────────────────────────────
interface Position {
  protocol: string;
  market: string;
  token: string;
  side: "COLLATERAL" | "BORROWER";
  balanceUSD: number;
  riskScore: number;
  liquidationThreshold: number;
  healthFactor: number | null;
}

interface RiskRankData {
  wallet: string;
  totalCollateralUSD: number;
  totalDebtUSD: number;
  overallHealthFactor: number | null;
  positions: Position[];
  dataSource: string;
  timestamp: number;
}

interface GenericData {
  [key: string]: unknown;
}

// ── Health Factor Gauge ──────────────────────────────────────────────────────
function HealthGauge({ value }: { value: number | null }) {
  const pct = value ? Math.min(value / 3, 1) : 0;
  const r = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  const color = !value ? "#3d4366"
    : value >= 2 ? "#34d399"
    : value >= 1.2 ? "#f0a842"
    : "#f87171";
  const cls = !value ? styles.gaugeValue + " " + styles.none
    : value >= 2 ? styles.gaugeValue + " " + styles.safe
    : value >= 1.2 ? styles.gaugeValue + " " + styles.warn
    : styles.gaugeValue + " " + styles.danger;

  return (
    <div className={styles.gaugeWrap}>
      <div className={styles.gaugeSvgWrap}>
        <svg width="90" height="90" viewBox="0 0 90 90">
          <circle cx="45" cy="45" r={r} fill="none" strokeWidth="7" stroke="rgba(255,255,255,0.05)" />
          <circle
            cx="45" cy="45" r={r} fill="none" strokeWidth="7"
            stroke={color}
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 45 45)"
            style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(.16,1,.3,1), stroke 0.4s" }}
          />
          <text x="45" y="50" textAnchor="middle" fill={color} fontSize="13" fontFamily="Space Grotesk, sans-serif" fontWeight="700">
            {value ? value.toFixed(2) : "—"}
          </text>
        </svg>
      </div>
      <div className={styles.gaugeInfo}>
        <div className={styles.gaugeTitle}>Overall Health Factor</div>
        <div className={cls}>{value ? value.toFixed(2) : "No open debt"}</div>
        <div className={styles.gaugeSub}>
          {!value ? "No borrow positions found"
            : value >= 2 ? "✅ Healthy — low liquidation risk"
            : value >= 1.2 ? "⚠️ Caution — monitor closely"
            : "🔴 At risk — consider reducing debt"}
        </div>
      </div>
    </div>
  );
}

// ── Positions Table ──────────────────────────────────────────────────────────
function PositionsTable({ data }: { data: RiskRankData }) {
  if (!data.positions.length) {
    return <div className={styles.panelDesc} style={{ textAlign: "center", padding: "24px 0" }}>No open positions found for this wallet.</div>;
  }

  return (
    <div style={{ overflowX: "auto", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
        <thead>
          <tr style={{ background: "var(--bg-4)", borderBottom: "1px solid var(--border-mid)" }}>
            {["Market", "Token", "Side", "Balance USD", "Liq. Threshold"].map(h => (
              <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.positions.map((p, i) => {
            const isBorrow = p.side === "BORROWER";
            return (
              <tr key={i} style={{ borderBottom: "1px solid var(--border)", transition: "background 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <td style={{ padding: "10px 14px", color: "var(--text-soft)", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.market}</td>
                <td style={{ padding: "10px 14px" }}>
                  <span style={{ background: "var(--bg-4)", border: "1px solid var(--border-mid)", borderRadius: 4, padding: "2px 8px", fontFamily: "var(--font-mono)", fontSize: "0.78rem", color: "var(--text-soft)" }}>{p.token}</span>
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <span style={{
                    padding: "2px 9px", borderRadius: "100px", fontSize: "0.7rem", fontWeight: 700,
                    background: isBorrow ? "rgba(248,113,113,0.1)" : "rgba(52,211,153,0.1)",
                    color: isBorrow ? "var(--red)" : "var(--green)",
                    border: `1px solid ${isBorrow ? "rgba(248,113,113,0.25)" : "rgba(52,211,153,0.25)"}`,
                  }}>{p.side}</span>
                </td>
                <td style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", color: "var(--text-soft)" }}>
                  ${p.balanceUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                  {(p.liquidationThreshold * 100).toFixed(0)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function Home() {
  const [tab, setTab] = useState<Tab>("connect");
  const [wallet, setWallet] = useState("");
  const [sheetId, setSheetId] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [riskData, setRiskData] = useState<RiskRankData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetState() {
    setResult(null);
    setRiskData(null);
    setError(null);
  }

  async function fetchMetric(metric: string) {
    if (!wallet && metric !== "markets") {
      setError("Enter a wallet address first");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setRiskData(null);
    try {
      const params = wallet ? `?wallet=${wallet}` : "";
      const res = await fetch(`/api/onchain/${metric}${params}`);
      const json = await res.json() as { ok: boolean; error?: string; data?: unknown };
      if (!res.ok || json.error) throw new Error(json.error || "Request failed");
      if (metric === "risk_rank" && json.data) {
        setRiskData(json.data as RiskRankData);
      } else {
        setResult(json.data);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function provisionSheet() {
    if (!sheetId || !wallet) {
      setError("Enter both Sheet ID and wallet address");
      return;
    }
    setLoading(true);
    setError(null);
    resetState();
    try {
      const res = await fetch("/api/ens/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId, ownerAddress: wallet }),
      });
      const json = await res.json() as GenericData;
      setResult(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function checkPermissions() {
    if (!sheetId) {
      setError("Enter a Sheet ID");
      return;
    }
    setLoading(true);
    setError(null);
    resetState();
    try {
      const res = await fetch(`/api/ens/permissions?sheetId=${sheetId}`);
      const json = await res.json() as GenericData;
      setResult(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function runRecipe() {
    if (!wallet) {
      setError("Enter a wallet address first");
      return;
    }
    setLoading(true);
    setError(null);
    resetState();
    try {
      const res = await fetch("/api/bazantic/recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, recipe: "rank-and-route" }),
      });
      const json = await res.json() as GenericData;
      if (!res.ok || json.error) throw new Error(json.error as string);
      setResult(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function getRecipeManifest() {
    setLoading(true);
    setError(null);
    resetState();
    try {
      const res = await fetch("/api/bazantic/recipe");
      const json = await res.json() as GenericData;
      setResult(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const subname = sheetId
    ? `${sheetId}.onchainformulas.eth`
    : "<sheetId>.onchainformulas.eth";

  return (
    <div className={styles.root}>
      {/* Animated background */}
      <div className={styles.gridBg} />
      <div className={`${styles.orb} ${styles.orb1}`} />
      <div className={`${styles.orb} ${styles.orb2}`} />
      <div className={`${styles.orb} ${styles.orb3}`} />

      <main className={styles.main}>
        {/* ── Header ── */}
        <header className={styles.header}>
          <div className={styles.badge}>
            <span className={styles.badgeDot} />
            Live on Sepolia &amp; Ethereum Mainnet
          </div>
          <div className={styles.logo}>
            <div className={styles.logoHex}>
              <span className={styles.logoHexInner}>⬡</span>
            </div>
            <span className={styles.logoText}>Onchain Formulas</span>
          </div>
          <p className={styles.tagline}>
            &ldquo;Every cell, a node. Every sheet, a full node&apos;s worth of truth.&rdquo;
          </p>
          <div className={styles.sponsorRow}>
            <span className={`${styles.sponsorChip} ${styles.graph}`}>
              ◆ The Graph
            </span>
            <span style={{ color: "var(--text-dim)", fontSize: "0.7rem" }}>+</span>
            <span className={`${styles.sponsorChip} ${styles.ens}`}>
              ⬡ ENSv2
            </span>
            <span style={{ color: "var(--text-dim)", fontSize: "0.7rem" }}>+</span>
            <span className={`${styles.sponsorChip} ${styles.baz}`}>
              ⚡ Bazantic
            </span>
          </div>
        </header>

        {/* ── Wallet Input ── */}
        <div className={styles.walletSection}>
          <div className={styles.walletLabel}>Wallet Address</div>
          <div className={styles.walletInputWrap}>
            <span className={styles.walletPrefix}>0x</span>
            <input
              id="wallet-input"
              className={styles.walletInput}
              type="text"
              placeholder="Enter any Ethereum wallet address…"
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
            />
          </div>
        </div>

        {/* ── Tabs ── */}
        <nav className={styles.tabs}>
          {(["connect", "permissions", "agent"] as Tab[]).map((t) => (
            <button
              key={t}
              id={`tab-${t}`}
              className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`}
              onClick={() => { setTab(t); resetState(); }}
            >
              <span className={styles.tabIcon}>
                {t === "connect" && "🔗"}
                {t === "permissions" && "🔐"}
                {t === "agent" && "🤖"}
              </span>
              <span className={styles.tabLabel}>
                {t === "connect" && "Connect"}
                {t === "permissions" && "Permissions"}
                {t === "agent" && "Agent Console"}
              </span>
            </button>
          ))}
        </nav>

        {/* ══════════════════ Tab: Connect ══════════════════ */}
        {tab === "connect" && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div className={`${styles.panelIconWrap} ${styles.violet}`}>🔗</div>
              <div className={styles.panelTitleGroup}>
                <h2 className={styles.panelTitle}>Connect a Spreadsheet</h2>
                <p className={styles.panelDesc}>
                  Query live DeFi data via <code>=ONCHAIN(wallet, metric)</code>. Powered by The Graph — Messari Standardized Subgraphs spanning Aave V3, Compound V3, and Uniswap V3.
                </p>
              </div>
            </div>

            <div className={styles.divider} />

            <div className={styles.metricGrid}>
              <button id="btn-risk-rank" className={styles.metricChip} onClick={() => fetchMetric("risk_rank")} disabled={loading}>
                <div className={styles.metricChipIcon}>🎯</div>
                <div className={styles.metricChipName}>risk_rank</div>
                <div className={styles.metricChipDesc}>Ranked positions by risk score (Aave V3)</div>
              </button>
              <button id="btn-health-factor" className={styles.metricChip} onClick={() => fetchMetric("health_factor")} disabled={loading}>
                <div className={styles.metricChipIcon}>💊</div>
                <div className={styles.metricChipName}>health_factor</div>
                <div className={styles.metricChipDesc}>Overall liquidation health factor</div>
              </button>
              <button id="btn-lp-positions" className={styles.metricChip} onClick={() => fetchMetric("lp_positions")} disabled={loading}>
                <div className={styles.metricChipIcon}>🌐</div>
                <div className={styles.metricChipName}>lp_positions</div>
                <div className={styles.metricChipDesc}>Cross-protocol LP data: Compound + Uniswap</div>
              </button>
              <button id="btn-markets" className={styles.metricChip} onClick={() => fetchMetric("markets")} disabled={loading}>
                <div className={styles.metricChipIcon}>📊</div>
                <div className={styles.metricChipName}>markets</div>
                <div className={styles.metricChipDesc}>Top Aave V3 markets by TVL</div>
              </button>
            </div>

            {riskData && (
              <>
                <HealthGauge value={riskData.overallHealthFactor} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                  <div style={{ background: "var(--bg-4)", border: "1px solid var(--border-mid)", borderRadius: "var(--radius-sm)", padding: "14px 16px" }}>
                    <div style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dim)", marginBottom: 4 }}>Total Collateral</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.1rem", fontWeight: 700, color: "var(--green)" }}>${riskData.totalCollateralUSD.toLocaleString()}</div>
                  </div>
                  <div style={{ background: "var(--bg-4)", border: "1px solid var(--border-mid)", borderRadius: "var(--radius-sm)", padding: "14px 16px" }}>
                    <div style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dim)", marginBottom: 4 }}>Total Debt</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.1rem", fontWeight: 700, color: "var(--red)" }}>${riskData.totalDebtUSD.toLocaleString()}</div>
                  </div>
                </div>
                <PositionsTable data={riskData} />
                <div style={{ marginTop: 10, fontSize: "0.7rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                  Source: {riskData.dataSource} · {new Date(riskData.timestamp).toLocaleTimeString()}
                </div>
              </>
            )}

            <div className={styles.formulaCard} style={{ marginTop: 20 }}>
              <div className={styles.formulaLabel}>Sheets formula</div>
              <code className={styles.formulaCode}>=ONCHAIN(&quot;{wallet || "0x..."}&quot;, &quot;risk_rank&quot;)</code>
              <code className={styles.formulaCode}>=ONCHAIN(&quot;{wallet || "0x..."}&quot;, &quot;health_factor&quot;)</code>
              <code className={styles.formulaCode}>=ONCHAIN(&quot;{wallet || "0x..."}&quot;, &quot;lp_positions&quot;)</code>
            </div>
          </section>
        )}

        {/* ══════════════════ Tab: Permissions ══════════════════ */}
        {tab === "permissions" && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div className={`${styles.panelIconWrap} ${styles.cyan}`}>🔐</div>
              <div className={styles.panelTitleGroup}>
                <h2 className={styles.panelTitle}>ENSv2 Permissions</h2>
                <p className={styles.panelDesc}>
                  Each spreadsheet gets its own ENSv2 subname under <code>onchainformulas.eth</code>.
                  Enhanced Access Control enforces field-level role separation — proven on-chain, not app-layer faked.
                </p>
              </div>
            </div>

            <div className={styles.divider} />

            <div className={styles.inputGroup}>
              <label className={styles.inputLabel}>Google Sheet ID</label>
              <input
                id="sheet-id-perm-input"
                className={styles.input}
                type="text"
                placeholder="Paste from your sheet URL (e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms)"
                value={sheetId}
                onChange={(e) => setSheetId(e.target.value)}
              />
            </div>

            <div className={styles.ensPreview}>
              <span className={styles.ensPreviewIcon}>⬡</span>
              <div>
                <div style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dim)", marginBottom: 3 }}>Subname</div>
                <div className={styles.ensSubname}>
                  {sheetId ? <><span>{sheetId}</span>.onchainformulas.eth</> : subname}
                </div>
              </div>
            </div>

            <div className={styles.rolesGrid}>
              <div className={`${styles.roleCard} ${styles.owner}`}>
                <div className={styles.roleTop}>
                  <div className={`${styles.roleIcon} ${styles.owner}`}>👤</div>
                  <div>
                    <div className={styles.roleName}>sheet-owner</div>
                    <span className={`${styles.roleBadge} ${styles.owner}`}>Full Control</span>
                  </div>
                </div>
                <div className={styles.roleFieldsLabel}>Permitted Fields</div>
                <div className={styles.roleFields}>
                  <span className={styles.roleField}>tracked_wallets</span>
                  <span className={styles.roleField}>alert_threshold</span>
                </div>
              </div>
              <div className={`${styles.roleCard} ${styles.service}`}>
                <div className={styles.roleTop}>
                  <div className={`${styles.roleIcon} ${styles.service}`}>⚙️</div>
                  <div>
                    <div className={styles.roleName}>backend-service</div>
                    <span className={`${styles.roleBadge} ${styles.service}`}>Telemetry Only</span>
                  </div>
                </div>
                <div className={styles.roleFieldsLabel}>Permitted Fields</div>
                <div className={styles.roleFields}>
                  <span className={styles.roleField}>last_queried_at</span>
                  <span className={styles.roleField}>cache_status</span>
                </div>
              </div>
            </div>

            <div className={styles.buttonRow}>
              <button id="btn-provision" className={styles.btn} onClick={provisionSheet} disabled={loading}>
                {loading ? <><span className={styles.spinner} /> Provisioning…</> : "⬡ Provision Subname"}
              </button>
              <button id="btn-check-permissions" className={styles.btnSecondary} onClick={checkPermissions} disabled={loading}>
                {loading ? <><span className={styles.spinner} /> Checking…</> : "Check Permissions"}
              </button>
            </div>

            <div className={styles.formulaCard} style={{ marginTop: 8 }}>
              <div className={styles.formulaLabel}>On-chain proof — Enhanced Access Control</div>
              <code className={styles.formulaCode}>sheet-owner  → can write: tracked_wallets, alert_threshold</code>
              <code className={styles.formulaCode}>backend-service → can write: last_queried_at, cache_status</code>
              <code className={styles.formulaCode} style={{ color: "var(--red)", marginTop: 4 }}>// Cross-role writes revert on-chain (ENSv2 Sepolia)</code>
            </div>
          </section>
        )}

        {/* ══════════════════ Tab: Agent Console ══════════════════ */}
        {tab === "agent" && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div className={`${styles.panelIconWrap} ${styles.pink}`}>🤖</div>
              <div className={styles.panelTitleGroup}>
                <h2 className={styles.panelTitle}>Agent Console — rank-and-route Recipe</h2>
                <p className={styles.panelDesc}>
                  The Bazantic Recipe chains two services: The Graph provides risk ranking, and 1inch swap parameters are <em>derived from</em> that output — not hardcoded. Registered as a reusable MCP Server endpoint.
                </p>
              </div>
            </div>

            <div className={styles.divider} />

            <div className={styles.agentGrid}>
              <div className={styles.agentColumn}>
                <div className={styles.agentColHeader}>
                  <span className={`${styles.agentColBadge} ${styles.raw}`}>Raw API</span>
                  <span className={styles.agentColTitle}>Graph only</span>
                </div>
                <div className={styles.agentDesc}>
                  Direct query to The Graph — returns raw position data. No chaining, no derivation.
                </div>
                <div className={styles.recipeSteps} style={{ marginTop: 12 }}>
                  <div className={styles.recipeStep}>
                    <span className={styles.stepNum}>1</span>
                    <span className={styles.stepText}><strong>Graph query</strong> → positions</span>
                  </div>
                </div>
                <button id="btn-raw-graph" className={styles.btnGhost} onClick={() => fetchMetric("risk_rank")} disabled={loading} style={{ width: "100%", justifyContent: "center", marginTop: 12 }}>
                  {loading ? <><span className={styles.spinner} /> Loading…</> : "▶ Raw Graph API"}
                </button>
              </div>

              <div className={styles.agentColumn} style={{ borderColor: "rgba(124,109,250,0.2)" }}>
                <div className={styles.agentColHeader}>
                  <span className={`${styles.agentColBadge} ${styles.recipe}`}>✦ Recipe</span>
                  <span className={styles.agentColTitle}>rank-and-route</span>
                </div>
                <div className={styles.agentDesc}>
                  Chained recipe: Graph output <em>drives</em> the 1inch call parameters.
                </div>
                <div className={styles.recipeSteps} style={{ marginTop: 12 }}>
                  <div className={styles.recipeStep}>
                    <span className={styles.stepNum}>1</span>
                    <span className={styles.stepText}><strong>The Graph</strong> → risk-ranked positions</span>
                  </div>
                  <div className={styles.stepArrow}>↓ riskiestPosition.token + balanceUSD</div>
                  <div className={styles.recipeStep}>
                    <span className={styles.stepNum}>2</span>
                    <span className={styles.stepText}><strong>1inch</strong> → swap quote derived from step 1</span>
                  </div>
                </div>
                <button id="btn-run-recipe" className={styles.btn} onClick={runRecipe} disabled={loading} style={{ width: "100%", justifyContent: "center", marginTop: 12 }}>
                  {loading ? <><span className={styles.spinner} /> Running…</> : "▶ Run Recipe"}
                </button>
              </div>
            </div>

            <div className={styles.buttonRow}>
              <button id="btn-recipe-manifest" className={styles.btnSecondary} onClick={getRecipeManifest} disabled={loading}>
                📋 MCP Manifest
              </button>
            </div>

            <div className={styles.mcpHint}>
              <span style={{ fontSize: "0.8rem" }}>🔌</span>
              <code>mcp invoke rank-and-route --wallet {wallet || "0x..."}</code>
            </div>
          </section>
        )}

        {/* ── Error ── */}
        {error && (
          <div id="error-box" className={styles.errorBox}>
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* ── Result ── */}
        {!!result && !riskData && (
          <div id="result-box" className={styles.resultBox}>
            <div className={styles.resultHeader}>
              <span className={styles.resultDot} />
              <span className={styles.resultLabel}>Live Data</span>
              <span className={styles.resultSource}>
                {new Date().toLocaleTimeString()}
              </span>
            </div>
            <pre className={styles.resultPre}>{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}

        {/* ── Footer ── */}
        <footer className={styles.footer}>
          <div className={styles.footerText}>
            Powered by{" "}
            <a href="https://thegraph.com" target="_blank" rel="noopener noreferrer">The Graph</a>
            {" · "}
            <a href="https://ens.domains" target="_blank" rel="noopener noreferrer">ENSv2</a>
            {" · "}
            <a href="https://bazantic.com" target="_blank" rel="noopener noreferrer">Bazantic</a>
            {" · "}
            <a href="https://1inch.io" target="_blank" rel="noopener noreferrer">1inch</a>
            <br />
            Messari Standardized Subgraphs · Aave V3 · Compound V3 · Uniswap V3
          </div>
        </footer>
      </main>
    </div>
  );
}

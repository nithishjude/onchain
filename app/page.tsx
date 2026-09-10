"use client";

import { useState } from "react";
import styles from "./page.module.css";

type Tab = "connect" | "permissions" | "agent";

export default function Home() {
  const [tab, setTab] = useState<Tab>("connect");
  const [wallet, setWallet] = useState("");
  const [sheetId, setSheetId] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchMetric(metric: string) {
    if (!wallet && metric !== "markets") {
      setError("Enter a wallet address first");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const params = wallet ? `?wallet=${wallet}` : "";
      const res = await fetch(`/api/onchain/${metric}${params}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || json.message);
      setResult(json.data);
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
    try {
      const res = await fetch("/api/ens/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId, ownerAddress: wallet }),
      });
      const json = await res.json();
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
    setResult(null);
    try {
      const res = await fetch("/api/bazantic/recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, recipe: "rank-and-route" }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error);
      setResult(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.main}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>⬡</span>
          <span className={styles.logoText}>Onchain Formulas</span>
        </div>
        <p className={styles.tagline}>Every cell, a node. Every sheet, a full node&apos;s worth of truth.</p>
      </header>

      {/* Tabs */}
      <nav className={styles.tabs}>
        {(["connect", "permissions", "agent"] as Tab[]).map((t) => (
          <button
            key={t}
            id={`tab-${t}`}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`}
            onClick={() => { setTab(t); setResult(null); setError(null); }}
          >
            {t === "connect" && "🔗 Connect"}
            {t === "permissions" && "🔐 Permissions"}
            {t === "agent" && "🤖 Agent Console"}
          </button>
        ))}
      </nav>

      {/* Shared wallet input */}
      <section className={styles.inputRow}>
        <input
          id="wallet-input"
          className={styles.input}
          type="text"
          placeholder="Wallet address (0x...)"
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
        />
      </section>

      {/* Tab: Connect */}
      {tab === "connect" && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Connect a Spreadsheet</h2>
          <p className={styles.panelDesc}>
            Enter your Google Sheet ID to provision an ENSv2 subname and start querying live data.
          </p>
          <input
            id="sheet-id-input"
            className={styles.input}
            type="text"
            placeholder="Google Sheet ID (from URL)"
            value={sheetId}
            onChange={(e) => setSheetId(e.target.value)}
          />
          <div className={styles.buttonRow}>
            <button id="btn-health-factor" className={styles.btn} onClick={() => fetchMetric("health_factor")} disabled={loading}>
              {loading ? "Loading…" : "Get Health Factor"}
            </button>
            <button id="btn-risk-rank" className={styles.btnSecondary} onClick={() => fetchMetric("risk_rank")} disabled={loading}>
              {loading ? "Loading…" : "Get Risk Rank"}
            </button>
            <button id="btn-markets" className={styles.btnGhost} onClick={() => fetchMetric("markets")} disabled={loading}>
              {loading ? "Loading…" : "Top Markets"}
            </button>
          </div>
          <div className={styles.sheetSnippet}>
            <span className={styles.snippetLabel}>Sheets formula:</span>
            <code className={styles.snippetCode}>
              =ONCHAIN(&quot;{wallet || "0x..."}&quot;, &quot;risk_rank&quot;)
            </code>
          </div>
        </section>
      )}

      {/* Tab: Permissions */}
      {tab === "permissions" && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>ENSv2 Permissions</h2>
          <p className={styles.panelDesc}>
            Each spreadsheet gets its own ENSv2 subname under <code>onchainformulas.eth</code>.
            Enhanced Access Control enforces field-level role separation on-chain.
          </p>
          <input
            id="sheet-id-perm-input"
            className={styles.input}
            type="text"
            placeholder="Google Sheet ID"
            value={sheetId}
            onChange={(e) => setSheetId(e.target.value)}
          />
          <div className={styles.rolesGrid}>
            <div className={styles.roleCard}>
              <span className={styles.roleIcon}>👤</span>
              <div>
                <div className={styles.roleName}>sheet-owner</div>
                <div className={styles.roleFields}>tracked_wallets · alert_threshold</div>
              </div>
            </div>
            <div className={styles.roleCard}>
              <span className={styles.roleIcon}>⚙️</span>
              <div>
                <div className={styles.roleName}>backend-service</div>
                <div className={styles.roleFields}>last_queried_at · cache_status</div>
              </div>
            </div>
          </div>
          <button id="btn-provision" className={styles.btn} onClick={provisionSheet} disabled={loading}>
            {loading ? "Provisioning…" : "Provision Subname"}
          </button>
          <button id="btn-check-permissions" className={styles.btnSecondary} onClick={() => {
            if (!sheetId) { setError("Enter Sheet ID"); return; }
            fetch(`/api/ens/permissions?sheetId=${sheetId}`).then(r => r.json()).then(setResult).catch(e => setError(String(e)));
          }} disabled={loading}>
            Check Permissions
          </button>
        </section>
      )}

      {/* Tab: Agent Console */}
      {tab === "agent" && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Agent Console — rank-and-route Recipe</h2>
          <p className={styles.panelDesc}>
            Step 1: Graph risk ranking → Step 2: 1inch swap quote derived from step 1 output.
            The recipe is registered on Bazantic&apos;s MCP server.
          </p>
          <div className={styles.buttonRow}>
            <button id="btn-run-recipe" className={styles.btn} onClick={runRecipe} disabled={loading}>
              {loading ? "Running…" : "▶ Run rank-and-route Recipe"}
            </button>
            <button id="btn-raw-graph" className={styles.btnSecondary} onClick={() => fetchMetric("risk_rank")} disabled={loading}>
              Raw Graph API
            </button>
          </div>
          <div className={styles.mcpHint}>
            <code>mcp invoke rank-and-route --wallet {wallet || "0x..."}</code>
          </div>
        </section>
      )}

      {/* Error */}
      {error && (
        <div id="error-box" className={styles.errorBox}>
          ⚠️ {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div id="result-box" className={styles.resultBox}>
          <div className={styles.resultHeader}>Live Data ✓</div>
          <pre className={styles.resultPre}>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}

      <footer className={styles.footer}>
        Powered by <strong>The Graph</strong> · <strong>ENSv2</strong> · <strong>Bazantic</strong>
      </footer>
    </main>
  );
}

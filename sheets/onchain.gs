/**
 * OnchainFormulas.gs — Google Apps Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Setup instructions:
 *   1. Open your Google Sheet
 *   2. Go to Extensions → Apps Script
 *   3. Paste this entire file, replacing any existing code
 *   4. Update APP_URL to your deployed Vercel URL (or keep localhost for testing)
 *   5. Click Save, then run ONCHAIN_SETUP() once to verify the connection
 *
 * Usage in Sheets:
 *   =ONCHAIN("0xWALLET", "health_factor")         → health factor number
 *   =ONCHAIN("0xWALLET", "risk_rank")              → 2D positions table
 *   =ONCHAIN("0xWALLET", "lp_positions")           → Cross-protocol LP table (Compound + Uniswap)
 *   =ONCHAIN("", "markets")                        → Top Aave V3 markets by TVL
 *   =ONCHAIN("0xWALLET", "health_factor", "aave")  → protocol param (future use)
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── CONFIG ───────────────────────────────────────────────────────────────────

/** @type {string} Replace with your deployed Vercel URL after deployment */
var APP_URL = "http://localhost:3000"; // e.g. "https://your-app.vercel.app"

/** Cache TTL in seconds — prevents hammering the API on every recalc */
var CACHE_TTL = 60;

// ── Main Custom Function ──────────────────────────────────────────────────────

/**
 * Fetch live onchain data into a Google Sheet cell.
 *
 * @customfunction
 * @param {string} wallet  Ethereum wallet address (0x...) — use "" for market-wide queries
 * @param {string} metric  One of: health_factor | risk_rank | lp_positions | markets
 * @param {string} [protocol]  Optional protocol filter (reserved for future multi-protocol routing)
 * @return {string|number|Array} Live onchain data, or an error string starting with #ONCHAIN_
 */
function ONCHAIN(wallet, metric, protocol) {
  if (!metric) return "#ONCHAIN_NO_METRIC";

  // Build cache key
  var cacheKey = "onchain_" + metric + "_" + (wallet || "global") + (protocol ? "_" + protocol : "");

  // Check cache
  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (e) {
    // Cache miss or parse error — continue to live fetch
  }

  try {
    var url = APP_URL + "/api/onchain/" + encodeURIComponent(metric);
    var params = [];

    if (wallet && wallet !== "") {
      params.push("wallet=" + encodeURIComponent(wallet));
    }
    if (protocol) {
      params.push("protocol=" + encodeURIComponent(protocol));
    }
    if (params.length > 0) {
      url += "?" + params.join("&");
    }

    var options = {
      method: "get",
      muteHttpExceptions: true,
      headers: { "Accept": "application/json" },
      followRedirects: true,
    };

    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    var text = response.getContentText();

    // Handle HTTP errors
    if (code >= 500) return "#ONCHAIN_STALE: Server error " + code;
    if (code === 400) return "#ONCHAIN_BAD_REQUEST";
    if (code !== 200) return "#ONCHAIN_ERROR: HTTP " + code;

    var json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      return "#ONCHAIN_PARSE_ERROR";
    }

    if (json.error) return json.error;

    var formatted = formatForSheets(metric, json.data);

    // Cache the result
    try {
      cache.put(cacheKey, JSON.stringify(formatted), CACHE_TTL);
    } catch (e) {
      // Cache write failed — non-fatal
    }

    return formatted;
  } catch (e) {
    return "#ONCHAIN_STALE: " + e.message;
  }
}

// ── Format Response for Sheets Output ────────────────────────────────────────

/**
 * Transforms API response data into a Sheets-friendly format.
 * Returning a 2D array causes Sheets to automatically spill the data.
 */
function formatForSheets(metric, data) {
  if (data === null || data === undefined) return "#ONCHAIN_EMPTY";

  switch (metric) {

    case "health_factor":
      if (data.healthFactor === null) return "No debt positions";
      return data.healthFactor;

    case "risk_rank":
      if (!data.positions || data.positions.length === 0) {
        return "No open positions";
      }
      var rows = [["Market", "Token", "Side", "Balance USD", "Health Factor", "Liq. Threshold"]];
      for (var i = 0; i < data.positions.length; i++) {
        var p = data.positions[i];
        rows.push([
          p.market,
          p.token,
          p.side,
          p.balanceUSD,
          data.overallHealthFactor || "N/A",
          p.liquidationThreshold ? (p.liquidationThreshold * 100).toFixed(0) + "%" : "N/A",
        ]);
      }
      return rows;

    case "lp_positions":
      if (!data || data.length === 0) return "No LP positions found";
      // Uniswap + Compound mixed format
      var lpRows = [["Protocol", "Market / Pool", "Token(s)", "Side / Fee Tier", "Balance / Deposited USD"]];
      for (var j = 0; j < data.length; j++) {
        var lp = data[j];
        if (lp.protocol === "Uniswap V3") {
          lpRows.push([
            "Uniswap V3",
            lp.token0 + "/" + lp.token1,
            lp.token0 + " + " + lp.token1,
            lp.feeTier || "N/A",
            lp.estimatedValueUSD || "N/A",
          ]);
        } else {
          lpRows.push([
            lp.protocol || "Compound V3",
            lp.market || "N/A",
            lp.token || "N/A",
            lp.side || "N/A",
            lp.balanceUSD || "N/A",
          ]);
        }
      }
      return lpRows;

    case "markets":
      if (!data || data.length === 0) return "No market data";
      var mrows = [["Market", "Token", "TVL (USD)", "Total Borrow (USD)"]];
      for (var k = 0; k < data.length; k++) {
        var m = data[k];
        mrows.push([m.name, m.token, m.tvlUSD, m.borrowUSD]);
      }
      return mrows;

    default:
      return JSON.stringify(data);
  }
}

// ── Custom Menu ───────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("⬡ Onchain Formulas")
    .addItem("Open Dashboard", "openDashboard")
    .addItem("Refresh All Formulas", "refreshAll")
    .addSeparator()
    .addItem("Test Connection", "ONCHAIN_SETUP")
    .addItem("About", "showAbout")
    .addToUi();
}

function openDashboard() {
  var html = HtmlService.createHtmlOutput(
    '<script>window.open("' + APP_URL + '"); google.script.host.close();</script>'
  ).setWidth(1).setHeight(1);
  SpreadsheetApp.getUi().showModalDialog(html, "Opening Dashboard…");
}

function refreshAll() {
  // Invalidate cache and trigger recalculation via a timestamp cell
  try {
    var cache = CacheService.getScriptCache();
    cache.removeAll([]); // Clear all cached values
  } catch (e) {}
  var trigger = SpreadsheetApp.getActiveSheet().getRange("ZZ1");
  trigger.setValue(new Date().toISOString());
  SpreadsheetApp.flush();
  trigger.clearContent();
  SpreadsheetApp.getUi().alert("✓ Cache cleared. All formulas will refresh on next calculation.");
}

function showAbout() {
  SpreadsheetApp.getUi().alert(
    "⬡ Onchain Formulas\n\n" +
    "Every cell, a node. Every sheet, a full node's worth of truth.\n\n" +
    "Available metrics:\n" +
    "  =ONCHAIN(\"0xWALLET\", \"health_factor\")   → Aave V3 health factor\n" +
    "  =ONCHAIN(\"0xWALLET\", \"risk_rank\")        → Risk-ranked positions\n" +
    "  =ONCHAIN(\"0xWALLET\", \"lp_positions\")     → Compound V3 + Uniswap V3\n" +
    "  =ONCHAIN(\"\", \"markets\")                  → Top Aave markets\n\n" +
    "Powered by: The Graph · ENSv2 · Bazantic · 1inch\n\n" +
    "Dashboard: " + APP_URL
  );
}

// ── Setup / Connection Test ───────────────────────────────────────────────────

/**
 * Run this once from the Apps Script editor to verify the connection.
 * Go to Run → Run function → ONCHAIN_SETUP
 */
function ONCHAIN_SETUP() {
  var testResult = ONCHAIN("", "markets");
  Logger.log("Connection test (markets): " + JSON.stringify(testResult));

  var msg = "Connection test complete!\n\n";
  if (typeof testResult === "string" && testResult.startsWith("#ONCHAIN")) {
    msg += "⚠️ Error: " + testResult + "\n\nCheck that APP_URL is correct:\n" + APP_URL;
  } else if (Array.isArray(testResult)) {
    msg += "✅ Success! Fetched " + (testResult.length - 1) + " markets from Aave V3 via The Graph.\n\nAPI URL: " + APP_URL;
  } else {
    msg += "Response: " + JSON.stringify(testResult) + "\nAPI URL: " + APP_URL;
  }

  SpreadsheetApp.getUi().alert(msg);
}

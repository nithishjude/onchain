/**
 * onchain.gs — Google Apps Script
 * Paste this into: Extensions → Apps Script → paste → Save → Run ONCHAIN_SETUP once
 *
 * Usage in Sheets:
 *   =ONCHAIN("0xWALLET", "health_factor")
 *   =ONCHAIN("0xWALLET", "risk_rank")
 *   =ONCHAIN("", "markets")
 */

// ── CONFIG — update APP_URL after deploying to Vercel ───────────────────────
var APP_URL = "http://localhost:3000"; // Replace with your deployed URL

// ── Main custom function ─────────────────────────────────────────────────────

/**
 * @customfunction
 * @param {string} wallet  Ethereum wallet address (0x...) or "" for market queries
 * @param {string} metric  One of: health_factor | risk_rank | markets
 * @param {string} [protocol]  Optional: protocol filter (reserved for Phase 2)
 * @return {string|number|Array} Live onchain data
 */
function ONCHAIN(wallet, metric, protocol) {
  if (!metric) return "#ONCHAIN_NO_METRIC";

  try {
    var url = APP_URL + "/api/onchain/" + metric;
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
    };

    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    var text = response.getContentText();
    var json = JSON.parse(text);

    if (code !== 200 || json.error) {
      return json.error || "#ONCHAIN_ERROR";
    }

    return formatForSheets(metric, json.data);
  } catch (e) {
    return "#ONCHAIN_STALE: " + e.message;
  }
}

// ── Format response for Sheets output ───────────────────────────────────────

function formatForSheets(metric, data) {
  if (!data) return "#ONCHAIN_EMPTY";

  switch (metric) {
    case "health_factor":
      return data.healthFactor !== null
        ? data.healthFactor
        : "No debt positions";

    case "risk_rank":
      if (!data.positions || data.positions.length === 0) {
        return "No open positions";
      }
      // Return 2D array: Sheets will spill into range automatically
      var rows = [["Market", "Token", "Side", "Balance USD", "Health Factor"]];
      var positions = data.positions;
      for (var i = 0; i < positions.length; i++) {
        var p = positions[i];
        rows.push([
          p.market,
          p.token,
          p.side,
          p.balanceUSD,
          data.overallHealthFactor || "N/A",
        ]);
      }
      return rows;

    case "markets":
      if (!data || data.length === 0) return "No market data";
      var mrows = [["Market", "Token", "TVL (USD)", "Borrow (USD)"]];
      for (var j = 0; j < data.length; j++) {
        var m = data[j];
        mrows.push([m.name, m.token, m.tvlUSD, m.borrowUSD]);
      }
      return mrows;

    default:
      return JSON.stringify(data);
  }
}

// ── One-time setup: add custom menu ─────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Onchain Formulas")
    .addItem("Open Dashboard", "openDashboard")
    .addItem("Refresh All Cells", "refreshAll")
    .addItem("About", "showAbout")
    .addToUi();
}

function openDashboard() {
  var url = APP_URL;
  var html = HtmlService.createHtmlOutput(
    '<script>window.open("' + url + '"); google.script.host.close();</script>'
  ).setWidth(1).setHeight(1);
  SpreadsheetApp.getUi().showModalDialog(html, "Opening Dashboard...");
}

function refreshAll() {
  // Force recalculation by temporarily changing a trigger cell
  var sheet = SpreadsheetApp.getActiveSheet();
  var cell = sheet.getRange("A1");
  var trigger = sheet.getRange("Z1");
  trigger.setValue(new Date().toISOString());
  SpreadsheetApp.flush();
}

function showAbout() {
  SpreadsheetApp.getUi().alert(
    "Onchain Formulas\n\n" +
    "Every cell, a node. Every sheet, a full node's worth of truth.\n\n" +
    "Usage:\n" +
    "  =ONCHAIN(\"0xWALLET\", \"health_factor\")\n" +
    "  =ONCHAIN(\"0xWALLET\", \"risk_rank\")\n" +
    "  =ONCHAIN(\"\", \"markets\")\n\n" +
    "Dashboard: " + APP_URL
  );
}

// ── Test function — run from Apps Script editor to verify connection ─────────

function ONCHAIN_SETUP() {
  var testResult = ONCHAIN("", "markets");
  Logger.log("Connection test result: " + JSON.stringify(testResult));
  SpreadsheetApp.getUi().alert(
    "Connection test complete!\n\n" +
    "Check View → Logs for result.\n\n" +
    "API URL: " + APP_URL
  );
}

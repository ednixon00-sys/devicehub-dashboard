// server.js — Read-only Dashboard (separate URL)
// Shows Installed / Active / Offline / Deleted with 5s auto-refresh
// PROXIES to your main app's /stats?token=... so your secret never hits the browser.

const express = require("express");

const PORT = process.env.PORT || 8080;

// Point this to your MAIN app (the one that has /stats?token=...)
// Example: https://seashell-app-naq42.ondigitalocean.app
const API_BASE = process.env.API_BASE || "";

// MUST match STATS_TOKEN configured in your MAIN app
const STATS_TOKEN = process.env.STATS_TOKEN || "";

if (!API_BASE) {
  console.warn("[dashboard] API_BASE env is empty. Set it to your main app URL.");
}
if (!STATS_TOKEN) {
  console.warn("[dashboard] STATS_TOKEN env is empty. Set it to the same token used by your main app.");
}

const app = express();

// Tiny HTML dashboard at /
app.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(`<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>DeviceHub — Live Stats</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  :root{color-scheme:dark light}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;
       margin:24px;background:#0b0f14;color:#e6edf3}
  h1{margin:0 0 16px 0}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
  .card{background:#0f1720;border:1px solid #1f2a37;border-radius:12px;padding:16px}
  .num{font-size:36px;font-weight:700;margin-top:8px}
  .muted{color:#9fb2c8;font-size:13px}
  .topbar{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-bottom:16px}
  .link{color:#93c5fd;text-decoration:none}
  .err{color:#ef4444}
</style>
</head>
<body>
  <div class="topbar">
    <h1>DeviceHub — Live Stats</h1>
    <div class="muted">Auto-refreshing every 5s</div>
  </div>

  <div id="error" class="err" style="display:none"></div>

  <div class="grid">
    <div class="card">
      <div class="muted">Installed (ever seen)</div>
      <div id="installed" class="num">—</div>
    </div>
    <div class="card">
      <div class="muted">Active (online)</div>
      <div id="active" class="num">—</div>
    </div>
    <div class="card">
      <div class="muted">Offline</div>
      <div id="offline" class="num">—</div>
    </div>
    <div class="card">
      <div class="muted">Deleted</div>
      <div id="deleted" class="num">—</div>
    </div>
  </div>

  <div class="card" style="margin-top:16px">
    <div class="muted">Last Updated</div>
    <div id="updated" style="margin-top:4px">—</div>
  </div>

<script>
async function load(){
  try{
    const r = await fetch('/stats');
    const j = await r.json();
    if(!r.ok){ throw new Error(j && j.error || r.status); }
    const $ = (id)=>document.getElementById(id);
    $('installed').textContent = j.installed ?? '0';
    $('active').textContent    = j.active ?? '0';
    $('offline').textContent   = j.offline ?? '0';
    $('deleted').textContent   = j.deleted ?? '0';
    $('updated').textContent   = new Date(j.ts).toLocaleString();
    const err = document.getElementById('error');
    err.style.display = 'none';
    err.textContent = '';
  }catch(e){
    const err = document.getElementById('error');
    err.style.display = 'block';
    err.textContent = 'Failed to load stats: ' + (e.message||e);
  }
}
load();
setInterval(load, 5000);
</script>
</body>
</html>`);
});

// Server-side proxy so the browser never sees your secret token
app.get("/stats", async (_req, res) => {
  try {
    if (!API_BASE || !STATS_TOKEN) {
      return res.status(500).json({ error: "dashboard_not_configured" });
    }
    const url = `${API_BASE.replace(/\\/$/,'')}/stats?token=${encodeURIComponent(STATS_TOKEN)}`;
    const r = await fetch(url, { headers: { "Accept": "application/json" } });
    const j = await r.json();
    res.setHeader("Cache-Control", "no-store");
    res.status(r.status).json(j);
  } catch (e) {
    res.status(500).json({ error: "dashboard_fetch_failed", detail: String(e) });
  }
});

// Health
app.get("/healthz", (_req, res) => res.send("OK"));

app.listen(PORT, () => {
  console.log("Dashboard listening on :" + PORT);
});

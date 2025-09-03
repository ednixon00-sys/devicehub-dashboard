import express from "express";
import fetch from "node-fetch";

const PORT = process.env.PORT || 8080;
// Point this at your existing app (keep https)
const API_BASE = process.env.API_BASE || "https://seashell-app-naq42.ondigitalocean.app";
// This token must match STATS_TOKEN in the main app
const STATS_TOKEN = process.env.STATS_TOKEN;

if (!STATS_TOKEN) {
  console.warn("[warn] STATS_TOKEN env not set — set it in DO to enable /stats calls");
}

const app = express();

// Minimal HTML dashboard at /
app.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(`<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>DeviceHub Dashboard</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  :root{color-scheme:dark light}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;margin:24px;background:#0b0f14;color:#e6edf3}
  h1{margin:0 0 16px 0}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
  .card{background:#0f1720;border:1px solid #1f2a37;border-radius:12px;padding:16px}
  .num{font-size:36px;font-weight:700;margin-top:8px}
  .muted{color:#9fb2c8;font-size:13px}
  .topbar{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-bottom:16px}
  .link{color:#93c5fd;text-decoration:none}
</style>
</head>
<body>
  <div class="topbar">
    <h1>DeviceHub Dashboard</h1>
    <div><a class="link" href="${API_BASE}/admin" target="_blank">Open Admin</a></div>
  </div>
  <div class="grid">
    <div class="card"><div class="muted">Installed (ever seen)</div><div id="installed" class="num">—</div></div>
    <div class="card"><div class="muted">Active (online)</div><div id="active" class="num">—</div></div>
    <div class="card"><div class="muted">Offline</div><div id="offline" class="num">—</div></div>
    <div class="card"><div class="muted">Deleted</div><div id="deleted" class="num">—</div></div>
  </div>
  <div class="card" style="margin-top:16px">
    <div class="muted">Last Updated</div>
    <div id="updated" style="margin-top:4px">—</div>
  </div>
<script>
async function load(){
  const r = await fetch('/stats');
  if(!r.ok){ console.error('stats error', r.status); return; }
  const s = await r.json();
  const $ = (id) => document.getElementById(id);
  $('installed').textContent = s.installed ?? '0';
  $('active').textContent = s.active ?? '0';
  $('offline').textContent = s.offline ?? '0';
  $('deleted').textContent = s.deleted ?? '0';
  $('updated').textContent = new Date(s.ts).toLocaleString();
}
load();
setInterval(load, 5000);
</script>
</body>
</html>`);
});

// Server-side proxy so token never reaches the browser
app.get("/stats", async (_req, res) => {
  try {
    const r = await fetch(`${API_BASE}/api/stats-public`, {
      headers: { "x-stats-token": STATS_TOKEN }
    });
    const j = await r.json();
    res.setHeader("Cache-Control", "no-store");
    res.status(r.status).json(j);
  } catch (e) {
    res.status(500).json({ error: "dashboard_fetch_failed", detail: String(e) });
  }
});

app.listen(PORT, () => {
  console.log("Dashboard listening on :" + PORT);
});

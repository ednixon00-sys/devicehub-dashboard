// server.js — Read-only dashboard with NO external deps
// Requires env vars: API_BASE, STATS_TOKEN
// URL: https://lobster-app-krgqy.ondigitalocean.app/

const http = require("http");
const { URL } = require("url");

const PORT = process.env.PORT || 8080;
const API_BASE = process.env.API_BASE || "";
const STATS_TOKEN = process.env.STATS_TOKEN || "";

const html = `<!doctype html>
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
  try{
    const r = await fetch('/stats');
    const j = await r.json();
    if(!r.ok){ throw new Error(j && j.error || r.status); }
    const $ = id => document.getElementById(id);
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
</html>`;

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(body);
}
function sendJSON(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  try{
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/") return send(res, 200, html);
    if (url.pathname === "/healthz") return send(res, 200, "OK", { "Content-Type": "text/plain" });

    if (url.pathname === "/stats") {
      if (!API_BASE || !STATS_TOKEN) {
        return sendJSON(res, 500, { error: "dashboard_not_configured" });
      }
      const apiUrl = API_BASE.replace(/\/$/, "") + "/stats?token=" + encodeURIComponent(STATS_TOKEN);
      try {
        const r = await fetch(apiUrl, { headers: { "Accept": "application/json" } });
        const j = await r.json();
        res.writeHead(r.status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        return res.end(JSON.stringify(j));
      } catch (e) {
        return sendJSON(res, 500, { error: "dashboard_fetch_failed", detail: String(e) });
      }
    }

    send(res, 404, "Not found", { "Content-Type": "text/plain" });
  }catch(err){
    sendJSON(res, 500, { error: "server_error", detail: String(err) });
  }
});

server.listen(PORT, () => console.log("Dashboard listening on :" + PORT));

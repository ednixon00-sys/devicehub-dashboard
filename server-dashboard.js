// Lobster Dashboard server (no links to admin UI)
// - Pulls summary from seashell /stats (token-protected)
// - Optionally pulls device list from seashell /api/devices using ADMIN_TOKEN (server-side only)
// - Geo-resolves device IPs via ipapi.co (cached in-memory)
// - Hides IP addresses from the UI/JSON; adds a Country column
// - Serves a live dashboard at "/" and JSON at "/data"

import express from "express";

const PORT = process.env.PORT || 8080;

// Required: base URL of your seashell app, e.g. https://seashell-app-naq42.ondigitalocean.app
const API_BASE = (process.env.API_BASE || "").replace(/\/+$/, "");

// Required: token protecting /stats on seashell
const STATS_TOKEN = (process.env.STATS_TOKEN || "").trim();

// Optional: ADMIN_TOKEN to read /api/devices (server-side only, never sent to browser)
const ADMIN_TOKEN = (process.env.ADMIN_TOKEN || "").trim();

if (!API_BASE || !STATS_TOKEN) {
  console.error("ERROR: Missing API_BASE and/or STATS_TOKEN env vars.");
  console.error("Set API_BASE=https://seashell-app-... and STATS_TOKEN=...");
  process.exit(1);
}

const app = express();

// --- Health check
app.get("/healthz", (_req, res) => res.status(200).send("OK"));

// --- In-memory cache for Geo lookups to avoid rate limits
// ip -> { city, country, latitude, longitude, ts }
const geoCache = new Map();

// Simple IPv4 regex
const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

// Lookup IP via ipapi.co (no key; subject to rate limit)
// Returns { city, country, latitude, longitude } or null
async function lookupGeo(ip) {
  try {
    if (!ipv4.test(ip)) return null; // skip IPv6 / non-IPv4 for now

    // cached?
    const cached = geoCache.get(ip);
    if (cached && Date.now() - cached.ts < 7 * 24 * 3600 * 1000) {
      return { city: cached.city, country: cached.country, latitude: cached.latitude, longitude: cached.longitude };
    }

    const r = await fetch(`https://ipapi.co/${ip}/json/`, { timeout: 6000 });
    if (!r.ok) return null;
    const j = await r.json();

    const geo = {
      city: j.city || "",
      country: j.country_name || j.country || "",
      latitude: typeof j.latitude === "number" ? j.latitude : (j.latitude ? Number(j.latitude) : null),
      longitude: typeof j.longitude === "number" ? j.longitude : (j.longitude ? Number(j.longitude) : null),
    };
    geoCache.set(ip, { ...geo, ts: Date.now() });
    return geo;
  } catch {
    return null;
  }
}

// Pull counts from /stats
async function fetchStats() {
  const url = `${API_BASE}/stats?token=${encodeURIComponent(STATS_TOKEN)}`;
  const r = await fetch(url, { timeout: 8000 });
  if (!r.ok) throw new Error(`stats ${r.status}`);
  return r.json();
}

// Optionally pull devices from /api/devices (server-side; secures ADMIN_TOKEN)
async function fetchDevices() {
  if (!ADMIN_TOKEN) return [];
  const r = await fetch(`${API_BASE}/api/devices`, {
    headers: { "x-admin-token": ADMIN_TOKEN },
    timeout: 10000,
  });
  if (!r.ok) throw new Error(`devices ${r.status}`);
  const j = await r.json();
  return Array.isArray(j.devices) ? j.devices : [];
}

// GET /data → JSON used by dashboard (polled by client)
// Result: { ts, installed, active, offline, deleted, devices: [{id, country, city, os, username, hostname, lastSeen, online}] }
// NOTE: IPs are intentionally omitted from the response for privacy.
app.get("/data", async (_req, res) => {
  try {
    const [stats, devices] = await Promise.all([
      fetchStats().catch(() => null),
      fetchDevices().catch(() => []),
    ]);

    // Enrich devices with geo (server-side) to keep tokens private.
    // Resolve up to 10 IPs per request to avoid external API rate limits.
    const geoTargets = devices
      .filter(d => d?.ip && ipv4.test(d.ip))
      .slice(0, 10);

    await Promise.all(geoTargets.map(async (d) => {
      const geo = await lookupGeo(d.ip);
      d.geo = geo || null;
    }));

    // Strip IP before sending to the browser; include country/city only.
    const publicDevices = devices.map(d => ({
      id: d.id || "",
      // Do NOT expose IP:
      country: d.geo?.country || "",
      city: d.geo?.city || "",
      os: d.os || "",
      username: d.username || "",
      hostname: d.hostname || "",
      lastSeen: d.lastSeen || 0,
      online: !!d.online,
    }));

    res.json({
      ts: Date.now(),
      installed: stats?.installed ?? null,
      active: stats?.active ?? null,
      offline: stats?.offline ?? null,
      deleted: stats?.deleted ?? null,
      devices: publicDevices,
    });
  } catch (e) {
    console.error("ERROR /data:", e.message);
    res.status(500).json({ error: "unavailable" });
  }
});

// --- UI: live dashboard (no admin links, no IPs shown)
app.get("/", (_req, res) => {
  res.status(200).send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>DeviceHub Dashboard</title>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    :root{color-scheme:dark light}
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;margin:24px;background:#0b0f14;color:#e6edf3}
    h1{margin:0 0 16px 0}
    .grid{display:grid;grid-template-columns:repeat(4,minmax(180px,1fr));gap:12px}
    .card{background:#0f1720;border:1px solid #1f2a37;border-radius:12px;padding:16px}
    .muted{color:#9fb2c8}
    .big{font-size:32px;font-weight:700}
    .ok{color:#16a34a}
    .bad{color:#ef4444}
    .warn{color:#eab308}
    table{width:100%;border-collapse:collapse;margin-top:12px}
    th,td{padding:8px;border-bottom:1px solid #1f2a37;text-align:left}
    .pill{display:inline-block;padding:3px 8px;border-radius:999px;border:1px solid #1f2a37;background:#0b1220}
    .right{float:right}
    .caps{letter-spacing:.06em;text-transform:uppercase;font-size:12px;color:#9fb2c8}
    .row{display:flex;gap:12px;flex-wrap:wrap;align-items:stretch}
    canvas{width:100%;height:80px;background:#0b1220;border:1px solid #1f2a37;border-radius:8px}
  </style>
</head>
<body>
  <h1>DeviceHub Dashboard</h1>
  <div class="muted" id="updated"></div>

  <div class="grid" style="margin-top:12px">
    <div class="card"><div class="caps">Installed</div><div class="big" id="installed">—</div></div>
    <div class="card"><div class="caps">Active</div><div class="big ok" id="active">—</div></div>
    <div class="card"><div class="caps">Offline</div><div class="big bad" id="offline">—</div></div>
    <div class="card"><div class="caps">Deleted</div><div class="big warn" id="deleted">—</div></div>
  </div>

  <div class="row" style="margin-top:12px">
    <div class="card" style="flex:1 1 420px">
      <div class="caps">Active Trend (last few minutes)</div>
      <canvas id="spark" width="600" height="100"></canvas>
    </div>
    <div class="card" style="flex:1 1 420px">
      <div class="caps">Top Locations (by city/country)</div>
      <div id="locs" class="muted">No data yet</div>
    </div>
  </div>

  <div class="card" style="margin-top:12px">
    <div class="caps">Devices</div>
    <table>
      <thead>
        <tr>
          <th>Device ID</th>
          <th>Country</th>
          <th>City</th>
          <th>OS</th>
          <th>Username</th>
          <th>Hostname</th>
          <th>Status</th>
          <th>Last Seen</th>
        </tr>
      </thead>
      <tbody id="tbody"></tbody>
    </table>
  </div>

<script>
const hist = []; // {ts, active}
const MAX_POINTS = 120; // ~10 minutes if polling every 5s

function drawSpark(){
  const c = document.getElementById('spark');
  const ctx = c.getContext('2d');
  ctx.clearRect(0,0,c.width,c.height);

  if(hist.length < 2) return;
  const min = 0;
  const max = Math.max(...hist.map(p => p.active), 1);
  const pad = 8;
  const W = c.width - pad*2;
  const H = c.height - pad*2;

  ctx.strokeStyle = '#60a5fa';
  ctx.lineWidth = 2;
  ctx.beginPath();
  hist.forEach((p, i) => {
    const x = pad + i * (W / (hist.length - 1));
    const y = pad + H - (p.active - min) / (max - min) * H;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();

  ctx.fillStyle='#9fb2c8';
  ctx.font='12px system-ui';
  ctx.fillText('Active: ' + hist[hist.length-1].active, pad+6, pad+14);
}

function groupLocations(devices){
  const map = new Map();
  for(const d of devices){
    const key = (d.city ? d.city + ', ' : '') + (d.country || '');
    if(!key.trim()) continue;
    map.set(key, (map.get(key)||0)+1);
  }
  const arr = [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8);
  if(!arr.length) return 'No data';
  return arr.map(([k,v]) => \`<div><span class="pill">\${k}</span> <span class="right">\${v}</span></div>\`).join('');
}

function fmt(ts){
  if(!ts) return '';
  try { return new Date(ts).toLocaleString(); } catch { return '';}
}

async function pull(){
  const r = await fetch('/data');
  const j = await r.json();

  document.getElementById('updated').innerText = 'Updated: ' + new Date(j.ts).toLocaleString();
  document.getElementById('installed').innerText = j.installed ?? '—';
  document.getElementById('active').innerText = j.active ?? '—';
  document.getElementById('offline').innerText = j.offline ?? '—';
  document.getElementById('deleted').innerText = j.deleted ?? '—';

  // trend
  hist.push({ ts: j.ts, active: j.active ?? 0 });
  if(hist.length > MAX_POINTS) hist.shift();
  drawSpark();

  // locations
  document.getElementById('locs').innerHTML = groupLocations(j.devices||[]);

  // table (no IPs)
  const rows = (j.devices||[]).map(d => {
    const status = d.online ? '<span class="ok">ONLINE</span>' : '<span class="bad">OFFLINE</span>';
    return \`
      <tr>
        <td>\${d.id}</td>
        <td>\${d.country}</td>
        <td>\${d.city}</td>
        <td>\${d.os}</td>
        <td>\${d.username}</td>
        <td>\${d.hostname}</td>
        <td>\${status}</td>
        <td>\${fmt(d.lastSeen)}</td>
      </tr>\`;
  }).join('');
  document.getElementById('tbody').innerHTML = rows || '<tr><td colspan="8" class="muted">No devices</td></tr>';
}

setInterval(pull, 5000);
pull();
</script>
</body>
</html>`);
});

// --- start
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Lobster dashboard listening on :${PORT}`);
});

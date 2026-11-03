// Desafío de las Esferas del Dragón - Cumple de Arian
// Servidor Node.js sin dependencias (Node 18+).
//
//   npm start                 -> puerto 3000 (o el que indique la variable PORT)
//
// Variables de entorno (configurarlas en el hosting):
//   PORT           puerto (el hosting lo pone solo)
//   ADMIN_KEY      clave para entrar a /qr y reiniciar el juego   (OBLIGATORIA en público)
//   SECRET         clave para generar los códigos de las esferas.
//                  Con SECRET fijo, los QR impresos siguen sirviendo aunque el
//                  servidor se reinicie o se borre datos.json.
//   DATA_FILE      dónde guardar el progreso (por defecto ./datos.json)

"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, "public");
const DATOS = process.env.DATA_FILE || path.join(__dirname, "datos.json");
const ADMIN_KEY = process.env.ADMIN_KEY || "";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".ico": "image/x-icon",
};

// ---------------- estado ----------------
function cargar() {
  let d = {};
  try { d = JSON.parse(fs.readFileSync(DATOS, "utf8")); } catch { /* primera vez */ }
  d.esferas = d.esferas || {};
  d.ultimo = d.ultimo || null;
  if (process.env.SECRET) {
    d.tokens = {};
    for (let n = 1; n <= 7; n++) {
      d.tokens[n] = crypto.createHmac("sha256", process.env.SECRET).update("esfera-" + n).digest("base64url").slice(0, 10);
    }
  } else if (!d.tokens) {
    d.tokens = {};
    for (let n = 1; n <= 7; n++) d.tokens[n] = crypto.randomBytes(6).toString("base64url");
  }
  return d;
}

const ESTADO = cargar();
guardar();

function guardar() {
  try {
    const tmp = DATOS + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(ESTADO, null, 2));
    fs.renameSync(tmp, DATOS);
  } catch (e) {
    console.error("No se pudo guardar", DATOS, e.message);
  }
}

const estadoPublico = () => ({
  esferas: ESTADO.esferas,
  ultimo: ESTADO.ultimo,
  completo: Object.keys(ESTADO.esferas).length === 7,
});

// ---------------- utilidades ----------------
const SEGURIDAD = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "SAMEORIGIN",
};

function enviarJSON(res, obj, code = 200) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, { ...SEGURIDAD, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Content-Length": body.length });
  res.end(body);
}

function noEncontrado(res) {
  const body = Buffer.from("<!doctype html><meta charset=utf-8><h1 style='font-family:sans-serif;text-align:center;margin-top:20vh'>Esta esfera no existe 🐉</h1>");
  res.writeHead(404, { ...SEGURIDAD, "Content-Type": "text/html; charset=utf-8", "Content-Length": body.length });
  res.end(body);
}

function archivo(req, res, rel) {
  const ruta = path.normalize(path.join(PUBLIC, rel));
  if (!ruta.startsWith(PUBLIC + path.sep)) return noEncontrado(res);
  fs.stat(ruta, (err, st) => {
    if (err || !st.isFile()) return noEncontrado(res);
    const ext = path.extname(ruta).toLowerCase();
    const esHTML = ext === ".html";
    const etag = `"${st.size.toString(36)}-${st.mtimeMs.toString(36)}"`;
    const headers = {
      ...SEGURIDAD,
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": esHTML ? "no-cache" : "public, max-age=3600",
      ETag: etag,
    };
    if (req.headers["if-none-match"] === etag) { res.writeHead(304, headers); return res.end(); }
    headers["Accept-Ranges"] = "bytes";
    // Pedidos parciales (los usa el navegador para el audio)
    const rango = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (rango && (rango[1] || rango[2])) {
      let ini = rango[1] ? parseInt(rango[1], 10) : st.size - parseInt(rango[2], 10);
      let fin = rango[1] && rango[2] ? parseInt(rango[2], 10) : st.size - 1;
      ini = Math.max(0, ini); fin = Math.min(fin, st.size - 1);
      if (ini > fin) {
        res.writeHead(416, { ...SEGURIDAD, "Content-Range": `bytes */${st.size}` });
        return res.end();
      }
      headers["Content-Range"] = `bytes ${ini}-${fin}/${st.size}`;
      headers["Content-Length"] = fin - ini + 1;
      res.writeHead(206, headers);
      if (req.method === "HEAD") return res.end();
      return fs.createReadStream(ruta, { start: ini, end: fin }).pipe(res);
    }
    headers["Content-Length"] = st.size;
    res.writeHead(200, headers);
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(ruta).pipe(res);
  });
}

function leerJSON(req) {
  return new Promise((ok) => {
    let datos = "";
    let largo = 0;
    req.on("data", (c) => {
      largo += c.length;
      if (largo > 4096) { ok(null); req.destroy(); return; }
      datos += c;
    });
    req.on("end", () => { try { ok(JSON.parse(datos)); } catch { ok(null); } });
    req.on("error", () => ok(null));
  });
}

function esAdmin(req, url) {
  const k = req.headers["x-admin-key"] || url.searchParams.get("key") || "";
  if (!ADMIN_KEY) {
    // Sin ADMIN_KEY solo se permite desde la misma PC (modo prueba local)
    const ip = req.socket.remoteAddress || "";
    return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  }
  const a = Buffer.from(String(k));
  const b = Buffer.from(ADMIN_KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function baseURL(req) {
  const proto = (req.headers["x-forwarded-proto"] || (req.socket.encrypted ? "https" : "http")).split(",")[0].trim();
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "localhost:" + PORT).split(",")[0].trim();
  return `${proto}://${host}`;
}

// límite simple de intentos por IP para no permitir adivinar códigos
const intentos = new Map();
function limitar(req) {
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const ahora = Date.now();
  const r = intentos.get(ip) || { n: 0, t: ahora };
  if (ahora - r.t > 60_000) { r.n = 0; r.t = ahora; }
  r.n++;
  intentos.set(ip, r);
  if (intentos.size > 5000) intentos.clear();
  return r.n > 30;
}

// ---------------- rutas ----------------
const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, "http://x"); } catch { return noEncontrado(res); }
  const p = url.pathname;

  if (req.method === "GET" || req.method === "HEAD") {
    if (p === "/" || p === "/index.html") return archivo(req, res, "index.html");

    if (p === "/qr" || p === "/qr/") return archivo(req, res, "qr.html");

    const m = p.match(/^\/e\/([1-7])\/([\w-]+)\/?$/);
    if (m) {
      if (ESTADO.tokens[m[1]] !== m[2]) return noEncontrado(res);
      return archivo(req, res, "esfera.html");
    }

    if (p === "/api/estado") return enviarJSON(res, estadoPublico());

    if (p === "/api/info") {
      if (!esAdmin(req, url)) return enviarJSON(res, { error: "Clave incorrecta" }, 403);
      return enviarJSON(res, { base: baseURL(req), tokens: ESTADO.tokens });
    }

    if (/^\/(js|img|audio|mp3|css)\//.test(p)) return archivo(req, res, decodeURIComponent(p));

    return noEncontrado(res);
  }

  if (req.method === "POST") {
    if (p === "/api/esfera") {
      if (limitar(req)) return enviarJSON(res, { error: "Demasiados intentos, esperá un minuto" }, 429);
      const d = (await leerJSON(req)) || {};
      const n = String(d.n ?? "");
      const token = String(d.token ?? "");
      const nombre = String(d.nombre ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 24);
      if (!ESTADO.tokens[n] || ESTADO.tokens[n] !== token) return enviarJSON(res, { error: "Esfera inválida" }, 404);
      if (!nombre) return enviarJSON(res, { error: "Escribí tu nombre" }, 400);
      if (ESTADO.esferas[n]) return enviarJSON(res, { error: "ya", nombre: ESTADO.esferas[n].nombre }, 409);
      ESTADO.esferas[n] = { nombre, hora: Date.now() / 1000 };
      if (Object.keys(ESTADO.esferas).length === 7) ESTADO.ultimo = nombre;
      guardar();
      console.log(`★ ${nombre} entregó la esfera de ${n} estrella(s) (${Object.keys(ESTADO.esferas).length}/7)`);
      return enviarJSON(res, { ok: true, total: Object.keys(ESTADO.esferas).length, ...estadoPublico() });
    }

    if (p === "/api/reset") {
      if (!esAdmin(req, url)) return enviarJSON(res, { error: "Clave incorrecta" }, 403);
      ESTADO.esferas = {};
      ESTADO.ultimo = null;
      guardar();
      console.log("↺ Juego reiniciado");
      return enviarJSON(res, { ok: true });
    }
  }

  return enviarJSON(res, { error: "no existe" }, 404);
});

server.listen(PORT, () => {
  console.log("=".repeat(56));
  console.log("  🐉  DESAFÍO DE LAS ESFERAS DEL DRAGÓN - CUMPLE DE ARIAN");
  console.log("=".repeat(56));
  console.log(`  Pantalla grande : http://localhost:${PORT}/`);
  console.log(`  Códigos QR      : http://localhost:${PORT}/qr`);
  if (!ADMIN_KEY) console.log("  ⚠ Sin ADMIN_KEY: /qr solo funciona desde esta PC.");
  if (!process.env.SECRET) console.log("  ⚠ Sin SECRET: los códigos QR dependen de datos.json (no lo borres).");
  console.log("=".repeat(56));
});

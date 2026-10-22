// Local preview of site/ the way GitHub Pages serves it: under /openpaper/, 404.html for a miss. `npm run site`, then open
// http://127.0.0.1:4870/openpaper/ (a file:// page has a null origin, which the public quote APIs refuse).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = fileURLToPath(new URL("../site/", import.meta.url));
const BASE = "/openpaper/";
const PORT = Number(process.env.PORT ?? 4870);
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".ico": "image/x-icon" };

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (!url.pathname.startsWith(BASE)) {
    res.writeHead(302, { location: BASE });
    return res.end();
  }
  let rel = decodeURIComponent(url.pathname.slice(BASE.length));
  if (rel === "" || rel.endsWith("/")) rel += "index.html";
  const file = normalize(join(SITE, rel));
  if (!file.startsWith(SITE)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    const body = await readFile(join(SITE, "404.html")).catch(() => "Not found");
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end(body);
  }
});
server.listen(PORT, "127.0.0.1", () => console.log(`site preview  http://127.0.0.1:${PORT}${BASE}`));

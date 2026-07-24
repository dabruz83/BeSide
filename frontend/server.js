const fs = require("fs");
const http = require("http");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_BUILD_DIRECTORY = path.join(__dirname, "build");
const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

const getBackendOrigin = () => {
  try {
    return new URL(process.env.REACT_APP_BACKEND_URL || "").origin;
  } catch (_error) {
    return "";
  }
};

const inlineScriptHashes = (buildDirectory) => {
  try {
    const html = fs.readFileSync(path.join(buildDirectory, "index.html"), "utf8");
    return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
      .map((match) => `'sha256-${crypto.createHash("sha256").update(match[1]).digest("base64")}'`);
  } catch (_error) {
    return [];
  }
};

const securityHeaders = (buildDirectory) => {
  const connectSources = ["'self'", "https://*.posthog.com", "https://*.i.posthog.com"];
  const backendOrigin = getBackendOrigin();
  if (backendOrigin) connectSources.push(backendOrigin);
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      "base-uri 'self'",
      `connect-src ${connectSources.join(" ")}`,
      "font-src 'self' https://fonts.gstatic.com data:",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob: https:",
      "object-src 'none'",
      `script-src 'self' https://*.i.posthog.com ${inlineScriptHashes(buildDirectory).join(" ")}`.trim(),
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "upgrade-insecure-requests",
    ].join("; "),
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
};

const sendFile = (request, response, filePath, headers) => {
  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    if (!response.headersSent) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    }
    response.end("Internal server error");
  });

  const mustRevalidate = ["index.html", "manifest.json", "service-worker.js"].includes(
    path.basename(filePath),
  );
  response.writeHead(200, {
    ...headers,
    "Content-Type": CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "Cache-Control": mustRevalidate ? "no-cache" : "public, max-age=31536000, immutable",
  });

  if (request.method === "HEAD") {
    stream.destroy();
    response.end();
    return;
  }

  stream.pipe(response);
};

const createStaticServer = (buildDirectory = DEFAULT_BUILD_DIRECTORY) => {
  const headers = securityHeaders(buildDirectory);
  return http.createServer((request, response) => {
    if (!request.url || !["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405, { ...headers, "Content-Type": "text/plain; charset=utf-8" });
      response.end("Method not allowed");
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    } catch (_error) {
      response.writeHead(400, { ...headers, "Content-Type": "text/plain; charset=utf-8" });
      response.end("Bad request");
      return;
    }
    if (pathname.includes("\0")) {
      response.writeHead(400, { ...headers, "Content-Type": "text/plain; charset=utf-8" });
      response.end("Bad request");
      return;
    }
    if (pathname === "/health") {
      response.writeHead(200, { ...headers, "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ status: "healthy", service: "frontend" }));
      return;
    }

    const relativePath = pathname.replace(/^\/+/, "");
    const requestedPath = path.resolve(buildDirectory, relativePath || "index.html");
    const buildPrefix = `${path.resolve(buildDirectory)}${path.sep}`;
    if (requestedPath !== path.resolve(buildDirectory) && !requestedPath.startsWith(buildPrefix)) {
      response.writeHead(403, { ...headers, "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    fs.stat(requestedPath, (error, stats) => {
      if (!error && stats.isFile()) {
        sendFile(request, response, requestedPath, headers);
        return;
      }

      sendFile(request, response, path.join(buildDirectory, "index.html"), headers);
    });
  });
};

if (require.main === module) {
  const port = Number.parseInt(process.env.PORT || "3000", 10);
  const server = createStaticServer();
  server.listen(port, "0.0.0.0", () => {
    console.log(`BESIDE frontend listening on port ${port}`);
  });
}

module.exports = { createStaticServer };

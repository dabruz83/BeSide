const fs = require("fs");
const http = require("http");
const path = require("path");

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

const sendFile = (request, response, filePath) => {
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

const createStaticServer = (buildDirectory = DEFAULT_BUILD_DIRECTORY) => http.createServer(
  (request, response) => {
    if (!request.url || !["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Method not allowed");
      return;
    }

    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (pathname === "/health") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ status: "healthy", service: "frontend" }));
      return;
    }

    const relativePath = pathname.replace(/^\/+/, "");
    const requestedPath = path.resolve(buildDirectory, relativePath || "index.html");
    const buildPrefix = `${path.resolve(buildDirectory)}${path.sep}`;
    if (requestedPath !== path.resolve(buildDirectory) && !requestedPath.startsWith(buildPrefix)) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    fs.stat(requestedPath, (error, stats) => {
      if (!error && stats.isFile()) {
        sendFile(request, response, requestedPath);
        return;
      }

      sendFile(request, response, path.join(buildDirectory, "index.html"));
    });
  },
);

if (require.main === module) {
  const port = Number.parseInt(process.env.PORT || "3000", 10);
  const server = createStaticServer();
  server.listen(port, "0.0.0.0", () => {
    console.log(`BESIDE frontend listening on port ${port}`);
  });
}

module.exports = { createStaticServer };

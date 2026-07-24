const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { createStaticServer } = require("./server");

const buildDirectory = path.join(__dirname, "build");

const startServer = async () => {
  const server = createStaticServer(buildDirectory);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
};

test("serves the Railway frontend health check", async (context) => {
  const { server, baseUrl } = await startServer();
  context.after(() => server.close());

  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "healthy", service: "frontend" });
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  const contentSecurityPolicy = response.headers.get("content-security-policy");
  assert.match(contentSecurityPolicy, /frame-ancestors 'none'/);
  assert.match(contentSecurityPolicy, /script-src 'self'.*'sha256-/);
  assert.doesNotMatch(contentSecurityPolicy, /script-src[^;]*'unsafe-inline'/);
});

test("falls back to index.html for React routes", async (context) => {
  const { server, baseUrl } = await startServer();
  context.after(() => server.close());

  const response = await fetch(`${baseUrl}/dashboard`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<div id="root"><\/div>/);
});

test("rejects malformed encoded paths without terminating the server", async (context) => {
  const { server, baseUrl } = await startServer();
  context.after(() => server.close());

  const response = await fetch(`${baseUrl}/%E0%A4%A`);
  assert.equal(response.status, 400);

  const healthResponse = await fetch(`${baseUrl}/health`);
  assert.equal(healthResponse.status, 200);
});

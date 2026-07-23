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
});

test("falls back to index.html for React routes", async (context) => {
  const { server, baseUrl } = await startServer();
  context.after(() => server.close());

  const response = await fetch(`${baseUrl}/dashboard`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<div id="root"><\/div>/);
});

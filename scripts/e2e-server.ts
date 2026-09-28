import { config } from "dotenv";
import { mkdirSync, readFileSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:https";
import { request } from "node:http";
config({ path: ".env.test", quiet: true });
if (
  !new URL(
    process.env.DATABASE_URL ?? "postgresql://localhost/missing",
  ).pathname.endsWith("_test")
)
  throw new Error("E2E requires a dedicated _test database");
mkdirSync(".local/e2e", { recursive: true, mode: 0o700 });
execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    ".local/e2e/key.pem",
    "-out",
    ".local/e2e/cert.pem",
    "-days",
    "1",
    "-subj",
    "/CN=localhost",
  ],
  { stdio: "ignore" },
);
const child = spawn(process.execPath, [".next/standalone/server.js"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    HOSTNAME: "127.0.0.1",
    PORT: "3100",
    APP_ORIGIN: "https://127.0.0.1:3443",
    // SimpleFIN needs no server secret, so bank sync renders as in production.
  },
  stdio: "inherit",
});
const server = createServer(
  {
    key: readFileSync(".local/e2e/key.pem"),
    cert: readFileSync(".local/e2e/cert.pem"),
  },
  (req, res) => {
    const upstream = request(
      {
        host: "127.0.0.1",
        port: 3100,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          "x-forwarded-proto": "https",
          "x-forwarded-host": "127.0.0.1:3443",
        },
      },
      (incoming) => {
        res.writeHead(incoming.statusCode ?? 502, incoming.headers);
        incoming.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(503);
      res.end("Starting");
    });
    req.pipe(upstream);
  },
);
server.listen(3443, "127.0.0.1");
function stop() {
  server.close();
  child.kill("SIGTERM");
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
child.on("exit", (code) => {
  server.close();
  process.exitCode = code ?? 0;
});

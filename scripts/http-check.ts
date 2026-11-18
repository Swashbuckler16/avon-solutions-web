import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openDatabase } from "../lib/db.ts";
import { seed } from "../lib/seed.ts";

const directory = mkdtempSync(join(tmpdir(), "avon-http-"));
const path = join(directory, "test.sqlite");
const db = openDatabase(path);
const accounts = await seed(db);
db.close();
const origin = "http://127.0.0.1:3011";
const server = spawn(
  process.execPath,
  [
    resolve("node_modules/next/dist/bin/next"),
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3011",
  ],
  {
    env: { ...process.env, AVON_DB_PATH: path, AVON_ORIGIN: origin },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);
let logs = "";
server.stdout.on("data", (data) => {
  logs += data;
});
server.stderr.on("data", (data) => {
  logs += data;
});
const request = (route: string, options: RequestInit = {}) =>
  fetch(origin + route, {
    ...options,
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
  });
const post = (
  route: string,
  body: Record<string, string>,
  cookie = "",
  source = origin,
) =>
  request(route, {
    method: "POST",
    headers: { Origin: source, Cookie: cookie },
    body: new URLSearchParams(body),
  });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null)
      throw new Error("Test server exited: " + logs);
    try {
      if ((await request("/login")).status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, "Test server did not become ready: " + logs);
  assert.equal((await request("/dashboard")).status, 307);
  assert.equal((await request("/api/admin/users")).status, 401);
  assert.equal(
    (await post("/api/profile", { name: "No Session" })).status,
    401,
  );
  assert.equal(
    (await post("/api/login", accounts[0], "", "https://foreign.example"))
      .status,
    403,
  );
  const failed = await post("/api/login", {
    email: accounts[0].email,
    password: "incorrect",
  });
  assert.match(failed.headers.get("location") || "", /error=credentials/);
  for (const account of accounts) {
    const login = await post("/api/login", account);
    assert.equal(login.status, 303);
    const cookieHeader = login.headers.get("set-cookie") || "";
    assert.match(cookieHeader, /HttpOnly/i);
    assert.match(cookieHeader, /SameSite=strict/i);
    const cookie = cookieHeader.split(";")[0];
    const get = (route: string) =>
      request(route, { headers: { Cookie: cookie } });
    const dashboard = await get("/dashboard");
    assert.equal(dashboard.status, 200);
    assert.match(await dashboard.text(), /Your day, in perspective/);
    assert.equal(
      (await get("/api/admin/users")).status,
      account.role === "admin" ? 200 : 403,
    );
    assert.equal(
      (
        await post(
          "/api/profile",
          { name: "Blocked" },
          cookie,
          "https://foreign.example",
        )
      ).status,
      403,
    );
    assert.match(
      (await post("/api/profile", { name: "x" }, cookie)).headers.get(
        "location",
      ) || "",
      /error=name/,
    );
    assert.equal(
      (
        await post(
          "/api/profile",
          { name: "Verified " + account.role, role: "admin" },
          cookie,
        )
      ).status,
      303,
    );
    assert.match(
      await (await get("/settings")).text(),
      new RegExp("Verified " + account.role),
    );
    assert.equal(
      (await get("/api/admin/users")).status,
      account.role === "admin" ? 200 : 403,
    );
    assert.match(await (await get("/orders")).text(), /PLANNED FOR STAGE/);
    const noResults = await get("/dashboard?q=nonexistent-query");
    assert.match(await noResults.text(), /No activity found/);
    assert.equal((await post("/api/logout", {}, cookie)).status, 303);
    assert.equal((await get("/api/admin/users")).status, 401);
    assert.equal((await get("/dashboard")).status, 307);
    console.log(
      `PASS ${account.role}: sign-in, authorization, profile persistence, origin checks, navigation, search and logout`,
    );
  }
  console.log(
    "PASS unauthenticated and invalid-credential checks. All HTTP checks passed.",
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  server.kill();
  if (server.exitCode === null && server.signalCode === null)
    await new Promise<void>((resolve) => server.once("exit", () => resolve()));
  // Generated test directory is the sole cleanup target; never the workspace database.
  rmSync(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}

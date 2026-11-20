import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { openDatabase } from "../lib/db.ts";
import { createSession, type User } from "../lib/auth-core.ts";
import { listOrders } from "../lib/orders.ts";
import { listShipments } from "../lib/shipping.ts";
import { reportRows } from "../lib/reports.ts";
import { overview } from "../lib/overview.ts";

const directory = mkdtempSync(join(tmpdir(), "avon-performance-"));
const path = join(directory, "benchmark.sqlite"),
  db = openDatabase(path);
const users: User[] = [],
  cookies: string[] = [];
let server: ReturnType<typeof spawn> | undefined;
try {
  db.exec("BEGIN IMMEDIATE");
  db.exec(
    "INSERT INTO warehouses(id,name,city,code) VALUES ('w','Test pickup','Chennai','TEST')",
  );
  for (let i = 0; i < 5; i++) {
    const id = `c${i}`;
    db.prepare(
      "INSERT INTO customers(id,name,email,phone,address,city,state,pincode) VALUES (?,?,'test@example.test','9999999999','Test Road','Chennai','Tamil Nadu','600001')",
    ).run(id, `Customer ${i}`);
    db.prepare(
      "INSERT INTO users(id,email,name,role,password_hash,created_at,customer_id) VALUES (?,?,?,'operator','unused',0,?)",
    ).run(id, `${id}@example.test`, `Customer ${i}`, id);
    users.push({
      id,
      email: `${id}@example.test`,
      name: `Customer ${i}`,
      role: "operator",
      customer_id: id,
    });
    cookies.push("avon_session=" + createSession(db, id));
  }
  const order = db.prepare(
    "INSERT INTO orders(id,reference,customer,destination,warehouse_id,status,payment_mode,amount_paise,created_date,customer_id) VALUES (?,?,?,'Chennai','w','shipped','prepaid',10000,?,?)",
  );
  const shipment = db.prepare(
    "INSERT INTO shipments(id,order_id,status,carrier,created_date,mode,direction,parent_id,awb,created_at) VALUES (?,?,?,'Blue Dart',?,'simulator',?,?,?,?)",
  );
  const event = db.prepare(
    "INSERT INTO tracking_events(shipment_id,event_key,status,location,note,occurred_at,received_at,applied,disposition,raw) VALUES (?,?,'in_transit','Test','Synthetic benchmark',?,?,1,'applied','{}')",
  );
  const now = Date.now();
  for (let i = 0; i < 10000; i++) {
    const id = `o${i}`,
      customer = `c${i % 5}`,
      date = new Date(now - (i % 30) * 86400000).toISOString().slice(0, 10);
    order.run(id, `PERF-${i}`, `Customer ${i % 5}`, date, customer);
    for (const direction of ["forward", "reverse"]) {
      const sid = `${id}-${direction}`;
      shipment.run(
        sid,
        id,
        direction === "forward" ? "delivered" : "in_transit",
        date,
        direction,
        direction === "forward" ? null : `${id}-forward`,
        `SIM-${sid}`,
        now - 86400000,
      );
      for (let j = 0; j < 5; j++) event.run(sid, `e${j}`, now + j, now + j);
    }
  }
  db.exec("COMMIT; ANALYZE");
  const measurements: Record<string, number> = {};
  const staff: User = {
    id: "staff",
    email: "staff@example.test",
    name: "Staff",
    role: "admin",
  };
  db.prepare(
    "INSERT INTO users(id,email,name,role,password_hash,created_at) VALUES (?,?,?,'admin','unused',0)",
  ).run(staff.id, staff.email, staff.name);
  const staffCookie = "avon_session=" + createSession(db, staff.id);
  for (const [name, action] of Object.entries({
    orders: () => listOrders(db, staff, new URLSearchParams()),
    shipments: () => listShipments(db, staff, new URLSearchParams()),
    overview: () => overview(db, 30),
    insights: () => reportRows(db, staff, { mode: "simulator" }, ""),
    customerReport: () => reportRows(db, users[0], { mode: "simulator" }),
  })) {
    action();
    const samples = Array.from({ length: 10 }, () => {
      const start = performance.now();
      action();
      return performance.now() - start;
    }).sort((a, b) => a - b);
    measurements[name + "MedianMs"] = Math.round(samples[5] * 10) / 10;
    measurements[name + "MaxMs"] = Math.round(samples[9] * 10) / 10;
    assert.ok(
      samples[9] < 500,
      `${name} exceeded the 500 ms warm-query budget`,
    );
  }
  assert.equal(
    reportRows(db, staff, { mode: "simulator" }, "PERF-9999").length,
    2,
  );
  assert.equal(
    reportRows(db, users[0], { mode: "simulator" }, "PERF-9999").length,
    0,
  );
  const origin = "http://127.0.0.1:3012";
  server = spawn(
    process.execPath,
    [
      resolve("node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3012",
    ],
    {
      env: { ...process.env, AVON_DB_PATH: path, AVON_ORIGIN: origin },
      stdio: "pipe",
      windowsHide: true,
    },
  );
  let logs = "";
  server.stdout?.on("data", (d) => {
    logs += d;
  });
  server.stderr?.on("data", (d) => {
    logs += d;
  });
  const get = (route: string, cookie = "") =>
    fetch(origin + route, {
      headers: { Cookie: cookie },
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(logs);
    try {
      if ((await get("/login")).status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready, "Benchmark server did not start: " + logs);
  const broadReport = await (await get("/analytics", staffCookie)).text();
  assert.match(broadReport, /Report exceeds 5,000/);
  assert.match(broadReport, /Apply filters/);
  assert.match(broadReport, /My saved reports/);
  for (const route of [
    "/dashboard",
    "/orders",
    "/shipments",
    "/insights",
    "/analytics",
  ]) {
    await (await get(route, cookies[0])).text();
    const samples = await Promise.all(
      cookies.map(async (cookie) => {
        const start = performance.now(),
          response = await get(route, cookie),
          html = await response.text();
        assert.equal(response.status, 200);
        assert.ok(
          !html.includes("Something didn’t load"),
          route + " rendered an error boundary",
        );
        return performance.now() - start;
      }),
    );
    measurements[route.slice(1) + "FiveUserMaxMs"] = Math.round(
      Math.max(...samples),
    );
    assert.ok(
      Math.max(...samples) < 2000,
      `${route} exceeded the 2 second five-user HTTP budget`,
    );
  }
  const result = {
    node: process.version,
    measuredAt: new Date().toISOString(),
    orders: 10000,
    shipments: 20000,
    trackingEvents: 100000,
    concurrentUsers: 5,
    measurements,
  };
  mkdirSync(".local", { recursive: true });
  writeFileSync(
    ".local/stage-5-performance.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (server && server.exitCode === null) {
    const ended = once(server, "exit");
    server.kill();
    await ended;
  }
  db.close();
  rmSync(directory, { recursive: true, force: true });
}

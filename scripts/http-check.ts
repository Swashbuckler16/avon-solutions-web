import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openDatabase } from "../lib/db.ts";
import { seed } from "../lib/seed.ts";
import sharp from "sharp";

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
    assert.match(
      await (await get("/orders")).text(),
      /Every order, in one place/,
    );
    const op = (
      action: string,
      data: unknown,
      session = cookie,
      id?: string,
      source = origin,
    ) =>
      request("/api/operations", {
        method: "POST",
        headers: {
          Cookie: session,
          Origin: source,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, data, id }),
      });
    assert.equal(
      (await op("customer", {}, cookie, undefined, "https://foreign.example"))
        .status,
      403,
    );
    if (account.role === "viewer")
      assert.equal((await op("customer", {})).status, 403);
    if (account.role === "admin") {
      const contact = {
        name: "HTTP Shop A",
        phone: "9999999999",
        address: "1 Synthetic Street",
        city: "Chennai",
        state: "Tamil Nadu",
        pincode: "600001",
      };
      const customerResponse = await op("customer", {
        ...contact,
        email: "shop-a@example.test",
      });
      assert.equal(customerResponse.status, 200);
      const a = (await customerResponse.json()).id;
      const b = (
        await (
          await op("customer", {
            ...contact,
            name: "HTTP Shop B",
            email: "shop-b@example.test",
          })
        ).json()
      ).id;
      const warehouseResponse = await op("warehouse", {
        ...contact,
        code: "HTTP-A",
        customer_id: a,
      });
      assert.equal(warehouseResponse.status, 200);
      const warehouse = (await warehouseResponse.json()).id;
      const accountA = await (
        await op("account", {
          customer_id: a,
          email: "customer-a@example.test",
          name: "Customer A",
        })
      ).json();
      const accountB = await (
        await op("account", {
          customer_id: b,
          email: "customer-b@example.test",
          name: "Customer B",
        })
      ).json();
      const ca = (await post("/api/login", accountA)).headers
        .get("set-cookie")!
        .split(";")[0];
      const cb = (await post("/api/login", accountB)).headers
        .get("set-cookie")!
        .split(";")[0];
      const data = {
        reference: "HTTP-CUSTOMER-ORDER",
        customer_id: a,
        warehouse_id: warehouse,
        recipient: { ...contact, name: "Sample Recipient" },
        payment_mode: "cod",
        invoice_number: "HTTP-INV",
        invoice_date: "2026-11-19",
        carrier: "Delhivery",
        items: [
          {
            name: "Sample product",
            quantity: 2,
            price: "12.34",
            sku: "SKU-HTTP",
            hsn: "6109",
          },
        ],
        packages: [{ weight: "1", length: "20", width: "10", height: "5" }],
        notes: "",
      };
      const created = await op("order", data, ca);
      assert.equal(created.status, 200);
      const id = (await created.json()).id;
      const customerGet = (route: string, session: string) =>
        request(route, { headers: { Cookie: session } });
      assert.equal((await customerGet("/orders/" + id, ca)).status, 200);
      // Next may stream the shell with HTTP 200 before rendering notFound().
      const deniedDetail = await (
        await customerGet("/orders/" + id, cb)
      ).text();
      assert.match(deniedDetail, /That page/);
      assert.ok(!deniedDetail.includes("HTTP-CUSTOMER-ORDER"));
      assert.equal(
        (await op("order", { ...data, revision: 1 }, cb, id)).status,
        404,
      );
      assert.equal(
        (
          await op(
            "account",
            { customer_id: a, email: "e@example.test", name: "Escalation" },
            ca,
          )
        ).status,
        403,
      );
      assert.equal((await customerGet("/api/admin/users", ca)).status, 403);
      for (const route of [
        "/orders",
        "/dashboard",
        "/settings",
        "/warehouses",
        "/customers",
        "/api/orders/export",
      ]) {
        const response = await customerGet(route, cb);
        assert.equal(response.status, 200);
        const html = await response.text();
        assert.ok(
          !html.includes("HTTP-CUSTOMER-ORDER"),
          route + " leaked order",
        );
        assert.ok(!html.includes("HTTP Shop A"), route + " leaked customer");
      }
      assert.match(
        await (await customerGet("/api/orders/export", ca)).text(),
        /HTTP-CUSTOMER-ORDER/,
      );
      assert.equal(
        (
          await op(
            "order",
            { ...data, revision: 1, notes: "Persisted edit" },
            ca,
            id,
          )
        ).status,
        200,
      );
      assert.equal(
        (await op("order", { ...data, revision: 1 }, ca, id)).status,
        409,
      );
      assert.match(
        await (await customerGet("/orders/" + id, ca)).text(),
        /Persisted edit/,
      );
      const bulk = await op(
        "bulk",
        {
          action: "cancel",
          note: "Test cancellation",
          orders: [
            { id, revision: 2 },
            { id: "sample-1", revision: 1 },
          ],
        },
        ca,
      );
      assert.equal(bulk.status, 200);
      assert.deepEqual(
        (await bulk.json()).map((r: { status: string }) => r.status),
        ["saved", "error"],
      );
      assert.equal(
        (await op("order", { ...data, revision: 3 }, ca, id)).status,
        409,
      );
      // Exercise the actual shipping endpoints with two isolated customer sessions.
      const shippingOrderResponse = await op(
        "order",
        { ...data, reference: "HTTP-SHIPPING-ORDER" },
        ca,
      );
      assert.equal(shippingOrderResponse.status, 200);
      const shippingOrder = (await shippingOrderResponse.json()).id;
      assert.equal(
        (await op("shipping_quote", { order_id: shippingOrder }, cb)).status,
        404,
      );
      const quoted = await op(
        "shipping_quote",
        { order_id: shippingOrder },
        ca,
      );
      assert.equal(quoted.status, 200);
      const quote = (await quoted.json()).quotes[0];
      const bookingRequest = {
        quote_id: quote.id,
        request_key: "http-shipping-001",
        scenario: "timeout_after_booking",
      };
      assert.equal(
        (await (await op("shipping_book", bookingRequest, ca)).json()).state,
        "unknown",
      );
      const booked = await (
        await op("shipping_book", bookingRequest, ca)
      ).json();
      assert.equal(booked.state, "booked");
      const sid = booked.id;
      const exceptionResponse = await op("exception_open", {
        shipment_id: sid,
        kind: "npr",
        reason: "HTTP pickup exception",
      });
      assert.equal(exceptionResponse.status, 200);
      const caseId = (await exceptionResponse.json()).id;
      assert.equal(
        (
          await op(
            "exception_action",
            {
              cases: [{ id: caseId, revision: 1 }],
              action: "reattempt",
              note: "Try again",
            },
            cb,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await (
            await op(
              "exception_action",
              {
                cases: [{ id: caseId, revision: 1 }],
                action: "reattempt",
                note: "Try again",
              },
              ca,
            )
          ).json()
        ).results[0].status,
        "saved",
      );
      assert.equal(
        (await (await op("shipping_reconcile", bookingRequest, ca)).json()).id,
        sid,
      );
      const ownDetail = await (
        await customerGet("/shipments/" + sid, ca)
      ).text();
      assert.match(ownDetail, /SIM-/);
      assert.ok(
        !(await (await customerGet("/shipments/" + sid, cb)).text()).includes(
          "HTTP-SHIPPING-ORDER",
        ),
      );
      const printDocument = await (
        await customerGet("/shipments/" + sid + "/documents?type=label", ca)
      ).text();
      assert.match(printDocument, /NOT VALID FOR CARRIER HANDOVER/);
      assert.ok(
        !(
          await (
            await customerGet(
              "/shipments/" + sid + "/documents?type=invoice",
              cb,
            )
          ).text()
        ).includes("HTTP-SHIPPING-ORDER"),
      );
      const event = {
        id: sid,
        event_key: "http-delivery",
        status: "delivered",
        occurred_at: new Date(Date.now() + 1000).toISOString(),
        location: "Test destination",
        note: "Synthetic delivery scan",
      };
      assert.equal((await op("tracking_replay", event, ca)).status, 403);
      assert.equal((await op("tracking_replay", event)).status, 200);
      assert.equal(
        (await (await op("tracking_replay", event)).json()).disposition,
        "duplicate",
      );
      const proofImage = await sharp({
        create: { width: 4, height: 4, channels: 3, background: "#ffffff" },
      })
        .png()
        .toBuffer();
      const proofResponse = await op(
        "pod_upload",
        {
          id: sid,
          filename: "http-proof.png",
          content: proofImage.toString("base64"),
        },
        ca,
      );
      assert.equal(proofResponse.status, 200);
      const proofId = (await proofResponse.json()).id;
      assert.equal((await request("/api/proofs/" + proofId)).status, 401);
      assert.equal(
        (await customerGet("/api/proofs/" + proofId, cb)).status,
        404,
      );
      const ownProof = await customerGet("/api/proofs/" + proofId, ca);
      assert.equal(ownProof.status, 200);
      assert.equal(ownProof.headers.get("content-type"), "image/png");
      assert.match(ownProof.headers.get("cache-control") || "", /no-store/);
      assert.equal(
        (
          await op(
            "pod_review",
            {
              id: proofId,
              revision: 1,
              decision: "verified",
              note: "Manual test check",
            },
            ca,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await op("pod_review", {
            id: proofId,
            revision: 1,
            decision: "verified",
            note: "Manual test check",
          })
        ).status,
        200,
      );
      const returnQuote = (
        await (
          await op(
            "shipping_quote",
            { order_id: shippingOrder, parent_id: sid },
            ca,
          )
        ).json()
      ).quotes[0];
      const reverse = (
        await (
          await op(
            "shipping_book",
            {
              quote_id: returnQuote.id,
              request_key: "http-reverse-001",
              scenario: "success",
            },
            ca,
          )
        ).json()
      ).id;
      assert.ok(reverse);
      assert.equal(
        (
          await op("tracking_replay", {
            id: reverse,
            event_key: "http-return-received",
            status: "delivered",
            occurred_at: new Date(Date.now() + 2000).toISOString(),
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await op("return_qa", {
            id: reverse,
            revision: 2,
            decision: "accepted",
            note: "Synthetic parcel intact",
          })
        ).status,
        200,
      );
      for (const route of ["/shipments", "/returns", "/pod"])
        assert.ok(
          !(await (await customerGet(route, cb)).text()).includes(
            "HTTP-SHIPPING-ORDER",
          ),
          route + " leaked shipping data",
        );
      console.log(
        "PASS shipping quote/booking recovery, private labels/POD, tracking deduplication, reverse delivery, QA and cross-customer access",
      );
      const ruleData = {
        customer_id: a,
        name: "HTTP Rule A",
        priority: 10,
        active: 1,
        pin: "600",
        payment: "any",
        max_kg: 100,
        carrier: "Blue Dart",
      };
      assert.equal((await op("rule_save", ruleData, ca)).status, 403);
      assert.equal((await op("rule_save", ruleData)).status, 200);
      const channelResponse = await op("channel_save", {
        customer_id: a,
        name: "HTTP Channel A",
        active: 1,
        callbacks: 1,
      });
      assert.equal(channelResponse.status, 200);
      const channelId = (await channelResponse.json()).id;
      const sync = {
        channel_id: channelId,
        events: [
          {
            event_key: "http-channel-1",
            order: { ...data, reference: "HTTP-CHANNEL-ORDER" },
          },
        ],
      };
      assert.equal((await op("channel_sync", sync, cb)).status, 404);
      const imported = await (await op("channel_sync", sync, ca)).json();
      assert.equal(imported.results[0].status, "imported");
      assert.equal(
        (await (await op("channel_sync", sync, ca)).json()).results[0].status,
        "duplicate",
      );
      assert.equal(
        (
          await op(
            "rule_apply",
            { order_id: imported.results[0].order_id, revision: 1 },
            ca,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await op(
            "feedback_save",
            { shipment_id: sid, score: 10, note: "HTTP good", revision: 0 },
            ca,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await op(
            "feedback_save",
            { shipment_id: sid, score: 1, revision: 0 },
            cb,
          )
        ).status,
        404,
      );
      const freight = {
        shipment_id: sid,
        quoted: "100",
        invoiced: "110",
        invoice_ref: "HTTP-COST",
        revision: 0,
      };
      assert.equal((await op("freight_save", freight, ca)).status, 403);
      assert.equal((await op("freight_save", freight)).status, 200);
      const reportResponse = await op(
        "report_save",
        {
          name: "HTTP private report",
          filters: { mode: "simulator" },
          interval_hours: 1,
        },
        ca,
      );
      assert.equal(reportResponse.status, 200);
      const reportId = (await reportResponse.json()).id;
      assert.equal((await op("report_run", { id: reportId }, cb)).status, 404);
      const run = await (await op("report_run", { id: reportId }, ca)).json();
      assert.equal(
        (await customerGet("/api/reports?run=" + run.id, cb)).status,
        404,
      );
      assert.match(
        await (await customerGet("/api/reports?run=" + run.id, ca)).text(),
        /HTTP-SHIPPING-ORDER/,
      );
      assert.equal((await request("/api/reports")).status, 401);
      assert.ok(
        !(await (await customerGet("/api/reports", cb)).text()).includes(
          "HTTP-SHIPPING-ORDER",
        ),
      );
      for (const route of [
        "/exceptions",
        "/automation",
        "/integrations",
        "/analytics",
        "/insights",
        "/insights?q=HTTP-SHIPPING&q=ignored",
        "/dispatch",
      ]) {
        const own = await customerGet(route, ca);
        assert.equal(own.status, 200);
        const pageBody = await own.text();
        assert.ok(
          !pageBody.includes("Application error") &&
            !pageBody.includes("Something didn’t load"),
          route + " failed to render",
        );
        const other = await (await customerGet(route, cb)).text();
        assert.ok(
          !other.includes("HTTP-SHIPPING-ORDER") &&
            !other.includes("HTTP Channel A") &&
            !other.includes("HTTP Rule A"),
          route + " leaked customer data",
        );
      }
      console.log(
        "PASS Stage 4 exception requests, rules, channel retries, private reports, freight, feedback and scoped pages",
      );
      const phase6Order = await (
        await op("order", { ...data, reference: "HTTP-PHASE6" }, ca)
      ).json();
      const packing = {
        kind: "packing",
        customer_id: a,
        name: "HTTP Packing A",
        active: 1,
        priority: 1,
        country: "IN",
        prefix: "",
        warehouse_id: warehouse,
        sku: "SKU-HTTP",
        units: 1,
        unit_weight: "0.5",
        tare: "0.1",
        length: 10,
        width: 10,
        height: 10,
        max_kg: 2,
      };
      assert.equal((await op("dispatch_profile", packing, ca)).status, 403);
      assert.equal((await op("dispatch_profile", packing)).status, 200);
      assert.equal(
        (
          await op(
            "packing_preview",
            { order_id: phase6Order.id, revision: 1 },
            cb,
          )
        ).status,
        404,
      );
      const plan = await (
        await op(
          "packing_preview",
          { order_id: phase6Order.id, revision: 1 },
          ca,
        )
      ).json();
      assert.equal(plan.packages.length, 2);
      assert.equal(
        (
          await op(
            "packing_apply",
            { order_id: phase6Order.id, revision: 1, token: plan.token },
            ca,
          )
        ).status,
        200,
      );
      const split = await (
        await op(
          "order_transform",
          {
            kind: "split",
            sources: [{ id: phase6Order.id, revision: 2 }],
            quantities: [1],
            reference_a: "HTTP-P6-A",
            reference_b: "HTTP-P6-B",
            packages_a: data.packages,
            packages_b: data.packages,
          },
          ca,
        )
      ).json();
      assert.equal(split.results.length, 2);
      const merged = await (
        await op(
          "order_transform",
          {
            kind: "merge",
            sources: split.results.map((r: { id: string }) => ({
              id: r.id,
              revision: 1,
            })),
            reference: "HTTP-P6-MERGED",
          },
          ca,
        )
      ).json();
      const quoteBatch = await (
        await op(
          "bulk_quotes",
          { orders: [merged.results[0].id], strategy: "balanced" },
          ca,
        )
      ).json();
      const bookingRows = [
        {
          quote_id: quoteBatch[0].quote.id,
          request_key: "http-phase6-bulk-001",
        },
      ];
      const bookedBatch = await (
        await op("bulk_book", { rows: bookingRows }, ca)
      ).json();
      assert.equal(bookedBatch.results[0].status, "booked");
      assert.equal(
        (await (await op("bulk_book", { rows: bookingRows }, ca)).json())
          .results[0].id,
        bookedBatch.results[0].id,
      );
      const inspection = openDatabase(path),
        awb = inspection
          .prepare("SELECT awb FROM shipments WHERE id=?")
          .get(bookedBatch.results[0].id)!.awb;
      inspection.close();
      const trackRows = [
        {
          awb,
          event_key: "http-phase6-file-event",
          status: "in_transit",
          occurred_at: new Date().toISOString(),
          location: "Test",
          note: "CSV-equivalent payload",
        },
      ];
      assert.equal(
        (await op("tracking_preview", { rows: trackRows }, ca)).status,
        403,
      );
      assert.equal(
        (await (await op("tracking_preview", { rows: trackRows })).json())
          .results[0].status,
        "valid",
      );
      assert.equal(
        (await (await op("tracking_import", { rows: trackRows })).json())
          .results[0].status,
        "saved",
      );
      assert.ok(
        !(
          await (await customerGet("/dispatch?customer=" + a, cb)).text()
        ).includes("HTTP Packing A"),
      );
      console.log(
        "PASS Phase 6 packing preview/apply, split/merge, batch booking retry, tracking import and customer isolation",
      );
      assert.equal(
        (
          await op("customer", {
            ...contact,
            id: a,
            email: "shop-a@example.test",
            revision: 1,
            active: 0,
          })
        ).status,
        200,
      );
      assert.equal((await customerGet("/orders", ca)).status, 307);
      console.log(
        "PASS customer provisioning, isolation on all read surfaces, ownership forgery, revision conflicts, partial bulk results and archive/session invalidation",
      );
    }
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

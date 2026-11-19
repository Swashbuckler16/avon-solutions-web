"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Customer, Warehouse } from "@/lib/orders";
import { csv, importFields, businessDate } from "@/lib/order-format";
import { operation } from "./operations-forms";
type Result = {
  row: number;
  reference: string;
  status: string;
  message: string;
  id?: string;
};
function download(name: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function OrderImport({
  customers,
  warehouses,
  mappings,
}: {
  customers: Customer[];
  warehouses: Warehouse[];
  mappings: { name: string; mapping: Record<string, string> }[];
}) {
  const router = useRouter();
  const [customer, setCustomer] = useState(customers[0]?.id || ""),
    [warehouse, setWarehouse] = useState(""),
    [headers, setHeaders] = useState<string[]>([]),
    [rows, setRows] = useState<Record<string, string>[]>([]),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [name, setName] = useState(""),
    [results, setResults] = useState<Result[]>([]),
    [preview, setPreview] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const reset = () => {
    setPreview(false);
    setResults([]);
  };
  return (
    <>
      <section className="card op-panel">
        <h2>1. Choose destination workspace & file</h2>
        <p>
          One row = one order, one product and one package. Add more
          products/packages in the order editor after import. CSV, TSV or XLSX
          (first sheet), up to 1 MB and 500 orders. Use YYYY-MM-DD invoice dates
          and text cells for phone/PIN/HSN codes.
        </p>
        <div className="op-grid">
          <label className="op-field">
            Customer
            <select
              disabled={busy}
              value={customer}
              onChange={(e) => {
                setCustomer(e.target.value);
                setWarehouse("");
                reset();
              }}
            >
              <option value="">Choose customer</option>
              {customers
                .filter((c) => c.active)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="op-field">
            Pickup location
            <select
              disabled={busy}
              value={warehouse}
              onChange={(e) => {
                setWarehouse(e.target.value);
                reset();
              }}
            >
              <option value="">Choose pickup location</option>
              {warehouses
                .filter((w) => w.active && w.customer_id === customer)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <label className="op-field">
          Import file
          <input
            disabled={busy}
            type="file"
            accept=".csv,.tsv,.xlsx"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              reset();
              setRows([]);
              setHeaders([]);
              setMessage("");
              if (!file) return;
              setBusy(true);
              try {
                if (file.size > 1_000_000)
                  throw new Error(
                    "File exceeds 1 MB. Split it into smaller files.",
                  );
                let table: unknown[][];
                if (file.name.toLowerCase().endsWith(".xlsx")) {
                  const { readSheet } = await import("read-excel-file/browser");
                  table = await readSheet(file);
                } else if (/\.(csv|tsv)$/i.test(file.name)) {
                  const { parse } = await import("csv-parse/browser/esm/sync");
                  table = parse(await file.text(), {
                    bom: true,
                    skip_empty_lines: true,
                    delimiter: /\.tsv$/i.test(file.name) ? "\t" : ",",
                    max_record_size: 20000,
                  });
                } else throw new Error("Choose CSV, TSV or XLSX.");
                if (table.length < 2 || table.length > 501)
                  throw new Error(
                    "File must contain a header and 1–500 data rows.",
                  );
                const names = table[0].map((x) => String(x ?? "").trim());
                if (
                  names.length > 40 ||
                  names.some((n) => !n || n.length > 200) ||
                  new Set(names).size !== names.length
                )
                  throw new Error(
                    "Use 1–40 unique, non-empty column headings.",
                  );
                const parsed = table.slice(1).map((row) => {
                  if (row.length > names.length)
                    throw new Error("A row has more cells than the header.");
                  return Object.fromEntries(
                    names.map((h, i) => [
                      h,
                      row[i] instanceof Date
                        ? row[i].toISOString().slice(0, 10)
                        : String(row[i] ?? ""),
                    ]),
                  );
                });
                setHeaders(names);
                setRows(parsed);
                setMapping(
                  Object.fromEntries(
                    importFields.map((f) => [
                      f,
                      names.find(
                        (n) => n.toLowerCase().replaceAll(" ", "_") === f,
                      ) || "",
                    ]),
                  ),
                );
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        <button
          type="button"
          className="button button-secondary"
          onClick={() =>
            download(
              "avon-import-template.csv",
              csv([
                Array.from(importFields),
                [
                  "SHOP-1001",
                  "Sample Recipient",
                  "9999999999",
                  "12 Sample Street",
                  "Chennai",
                  "Tamil Nadu",
                  "600001",
                  "Cotton shirt",
                  "SHIRT-01",
                  "6109",
                  "2",
                  "499.50",
                  "0.5",
                  "20",
                  "15",
                  "10",
                  "INV-1001",
                  businessDate(),
                  "prepaid",
                  "DTDC",
                ],
              ]),
            )
          }
        >
          Download CSV template
        </button>
      </section>
      {rows.length > 0 && (
        <section className="card op-panel">
          <h2>2. Map columns</h2>
          <p>
            {rows.length} rows loaded. SKU, HSN and carrier are optional. All
            other fields must be mapped.
          </p>
          <div className="op-grid">
            <label className="op-field">
              Load saved mapping
              <select
                disabled={busy}
                defaultValue=""
                onChange={(e) => {
                  const saved = mappings.find((m) => m.name === e.target.value);
                  if (saved) {
                    setMapping(saved.mapping);
                    reset();
                  }
                }}
              >
                <option value="">Choose mapping</option>
                {mappings.map((m) => (
                  <option key={m.name}>{m.name}</option>
                ))}
              </select>
            </label>
            <label className="op-field">
              Mapping name
              <input
                maxLength={60}
                value={name}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button
              className="button button-secondary"
              disabled={busy || !name.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  await operation("mapping", { name, mapping });
                  setMessage("Mapping saved for your account.");
                  router.refresh();
                } catch (error) {
                  setMessage((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save mapping
            </button>
          </div>
          <div className="op-grid three">
            {importFields.map((field) => (
              <label className="op-field" key={field}>
                {field.replaceAll("_", " ")}
                <select
                  value={mapping[field] || ""}
                  disabled={busy}
                  onChange={(e) => {
                    setMapping({ ...mapping, [field]: e.target.value });
                    reset();
                  }}
                >
                  <option value="">Not mapped</option>
                  {headers.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <h3>First-row preview</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {headers.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {headers.map((h) => (
                    <td key={h}>{rows[0][h]}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <button
            className="button"
            disabled={busy || !customer || !warehouse}
            onClick={async () => {
              setBusy(true);
              setPreview(false);
              try {
                setResults(
                  await operation("preview", {
                    rows,
                    mapping,
                    customer_id: customer,
                    warehouse_id: warehouse,
                  }),
                );
                setPreview(true);
                setMessage("Preview checked. Nothing has been imported yet.");
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Checking…" : "Validate import"}
          </button>
        </section>
      )}
      {results.length > 0 && (
        <section className="card op-panel">
          <h2>3. Review row results</h2>
          <p>
            {results.filter((r) => r.status === "ready").length} ready ·{" "}
            {results.filter((r) => r.status === "imported").length} imported ·{" "}
            {results.filter((r) => r.status === "error").length} errors. Invalid
            rows are skipped; existing orders are never overwritten.
          </p>
          <div className="op-actions">
            <button
              className="button"
              disabled={
                busy || !preview || !results.some((r) => r.status === "ready")
              }
              onClick={async () => {
                setBusy(true);
                setPreview(false);
                try {
                  setResults(
                    await operation("import", {
                      rows,
                      mapping,
                      customer_id: customer,
                      warehouse_id: warehouse,
                    }),
                  );
                  setMessage(
                    "Import completed. Correct failed rows and upload again; existing references will be skipped.",
                  );
                  router.refresh();
                } catch (error) {
                  setMessage((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Import valid rows
            </button>
            <button
              className="button button-secondary"
              onClick={() =>
                download(
                  "avon-import-results.csv",
                  csv([
                    ["Row", "Reference", "Status", "Message"],
                    ...results.map((r) => [
                      r.row,
                      r.reference,
                      r.status,
                      r.message,
                    ]),
                  ]),
                )
              }
            >
              Download results
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Reference</th>
                  <th>Result</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.row}>
                    <td>{r.row}</td>
                    <td>
                      {r.id ? (
                        <Link href={"/orders/" + r.id}>{r.reference}</Link>
                      ) : (
                        r.reference
                      )}
                    </td>
                    <td>{r.status}</td>
                    <td>{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <p className="op-message" role="status">
        {message}
      </p>
    </>
  );
}

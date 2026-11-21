"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { operation } from "./operations-forms";
export function ReconciliationFile({ kind }: { kind: "freight" | "feedback" }) {
  const headers =
    kind === "freight"
      ? "event_key,awb,invoice_ref,quoted,invoiced,revision"
      : "awb,score,note,revision";
  const router = useRouter(),
    lock = useRef(false),
    [busy, setBusy] = useState(false),
    [rows, setRows] = useState<Record<string, string>[]>([]),
    [preview, setPreview] = useState(false),
    [message, setMessage] = useState(""),
    [results, setResults] = useState<
      { id: string; status: string; message: string }[]
    >([]);
  async function run(commit: boolean) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const r = await operation<{ message: string; results: typeof results }>(
        commit ? "reconciliation_import" : "reconciliation_preview",
        { kind, rows },
      );
      setMessage(r.message);
      setResults(r.results);
      setPreview(!commit);
      if (commit) router.refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="card op-panel">
      <h2>
        {kind === "freight"
          ? "Import freight invoice comparisons"
          : "Import delivery feedback"}
      </h2>
      <p>
        CSV, TSV or XLSX (first sheet), up to 1 MB and 1,000 rows. Use exact
        headers. Revision 0 creates a record; amendments require its current
        revision. Valid rows can be saved even if other rows fail.
      </p>
      <a
        download={`${kind}-template.csv`}
        href={`data:text/csv;charset=utf-8,${encodeURIComponent(headers + "\n")}`}
      >
        Download {kind} CSV template
      </a>
      <label className="op-field">
        {kind} file
        <input
          type="file"
          accept=".csv,.tsv,.xlsx"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            setRows([]);
            setPreview(false);
            setResults([]);
            if (!file) return;
            lock.current = true;
            setBusy(true);
            try {
              if (file.size > 1000000) throw new Error("File exceeds 1 MB.");
              let table: unknown[][];
              if (file.name.toLowerCase().endsWith(".xlsx")) {
                const { readSheet } = await import("read-excel-file/browser");
                table = await readSheet(file);
              } else {
                const { parse } = await import("csv-parse/browser/esm/sync");
                table = parse(await file.text(), {
                  bom: true,
                  skip_empty_lines: true,
                  delimiter: file.name.toLowerCase().endsWith(".tsv")
                    ? "\t"
                    : ",",
                  max_record_size: 20000,
                });
              }
              const names = (table[0] || []).map((v) => String(v ?? "").trim());
              if (
                names.length > 20 ||
                new Set(names).size !== names.length ||
                !headers.split(",").every((h) => names.includes(h))
              )
                throw new Error("Use the template headers without duplicates.");
              if (table.length < 2 || table.length > 1001)
                throw new Error("Include 1–1,000 rows.");
              setRows(
                table
                  .slice(1)
                  .map((row) =>
                    Object.fromEntries(
                      names.map((h, i) => [h, String(row[i] ?? "")]),
                    ),
                  ),
              );
              setMessage("File loaded. Preview before saving.");
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}
        />
      </label>
      <div className="op-actions">
        <button
          className="button button-secondary"
          disabled={busy || !rows.length}
          onClick={() => run(false)}
        >
          Preview {kind} rows
        </button>
        {preview && (
          <button
            className="button"
            disabled={busy || !results.some((r) => r.status === "valid")}
            onClick={() => run(true)}
          >
            Save valid {kind} rows
          </button>
        )}
      </div>
      <p role="status">{busy ? "Processing…" : message}</p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Row</th>
              <th>Waybill</th>
              <th>Result</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{r.id}</td>
                <td>{r.status}</td>
                <td>{r.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

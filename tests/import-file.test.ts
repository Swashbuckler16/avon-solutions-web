import test from "node:test";
import assert from "node:assert/strict";
import { readSheet } from "read-excel-file/node";
import { parse } from "csv-parse/browser/esm/sync";
test("XLSX reader preserves text codes and numeric prices", async () => {
  assert.deepEqual(await readSheet("tests/fixtures/import.xlsx"), [
    ["reference", "pincode", "price"],
    ["XLSX-TEST", "560001", 12.34],
  ]);
});
test("CSV and TSV readers preserve quoted commas, escaped quotes, BOM and cells", () => {
  assert.deepEqual(
    parse('\uFEFFreference,product\r\nCSV-1,"Shirt, ""blue"""\r\n', {
      bom: true,
      skip_empty_lines: true,
    }),
    [
      ["reference", "product"],
      ["CSV-1", 'Shirt, "blue"'],
    ],
  );
  assert.deepEqual(
    parse("reference\tproduct\nTSV-1\tShirt", { delimiter: "\t" }),
    [
      ["reference", "product"],
      ["TSV-1", "Shirt"],
    ],
  );
});

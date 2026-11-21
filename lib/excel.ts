import writeExcelFile from "write-excel-file/node";
import type { Workbook } from "./reports.ts";
export function excel(workbook: Workbook) {
  return writeExcelFile(
    workbook.map((s) => ({
      sheet: s.name,
      stickyRowsCount: 1,
      columns: s.rows[0].map(() => ({ width: 26 })),
      data: s.rows.map((row, i) =>
        row.map((value) => ({
          value,
          fontWeight: i === 0 ? ("bold" as const) : undefined,
          backgroundColor: i === 0 ? "#DDF0EB" : undefined,
        })),
      ),
    })),
  ).toBuffer();
}

import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { InputError } from "@/lib/orders";
import {
  reportCsv,
  reportDownload,
  reportWorkbook,
  savedWorkbook,
} from "@/lib/reports";
import { excel } from "@/lib/excel";
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    if (params.get("format") === "xlsx") {
      const workbook = params.has("run")
        ? savedWorkbook(getDb(), user, params.get("run")!)
        : reportWorkbook(getDb(), user, Object.fromEntries(params));
      return new Response(new Uint8Array(await excel(workbook)), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": "attachment; filename=avon-report.xlsx",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    const content = params.has("run")
      ? reportDownload(getDb(), user, params.get("run")!)
      : reportCsv(getDb(), user, Object.fromEntries(params));
    return new Response(content, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=avon-shipment-report.csv",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof InputError)
      return new Response(error.message, { status: error.status });
    throw error;
  }
}

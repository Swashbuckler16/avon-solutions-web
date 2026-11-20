import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { InputError } from "@/lib/orders";
import { reportCsv, reportDownload } from "@/lib/reports";
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
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

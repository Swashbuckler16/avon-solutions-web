import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { InputError, listOrders } from "@/lib/orders";
import { csv } from "@/lib/imports";
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  try {
    const { rows } = listOrders(
      getDb(),
      user,
      new URL(request.url).searchParams,
      true,
    );
    return new Response(
      csv([
        [
          "Reference",
          "Customer",
          "Destination",
          "Status",
          "Payment",
          "Value INR",
          "Created",
          "Warehouse",
          "Carrier preference",
        ],
        ...rows.map((r) => [
          r.reference,
          r.customer,
          r.destination,
          r.status,
          r.payment_mode,
          Number(r.amount_paise) / 100,
          r.created_date,
          r.warehouse,
          (r.details as { carrier?: string }).carrier || "",
        ]),
      ]),
      {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=avon-orders.csv",
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    if (error instanceof InputError)
      return new Response(error.message, { status: error.status });
    throw error;
  }
}

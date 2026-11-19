import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/auth-core";
import { getDb } from "@/lib/db";
import { listOrders, customers, warehouses, InputError } from "@/lib/orders";
import { PageHeading } from "@/components/ui";
import { OrderList, type OrderRow } from "@/components/order-list";
export default async function Orders({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser(),
    db = getDb(),
    raw = await searchParams,
    params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw))
    if (typeof value === "string") params.set(key, value);
  let data;
  try {
    data = listOrders(db, user, params);
  } catch (error) {
    if (error instanceof InputError)
      return (
        <div role="alert">
          {error.message} <Link href="/orders">Clear filters</Link>
        </div>
      );
    throw error;
  }
  const editable = can(user.role, "operate");
  const pageLink = (page: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(page));
    return "/orders?" + next;
  };
  return (
    <>
      <PageHeading
        eyebrow="ORDER MANAGEMENT"
        title="Every order, in one place."
        description="Prepare dispatches for your customers. Carrier booking comes next."
      >
        <Link
          className="button button-secondary"
          href={"/api/orders/export?" + params}
        >
          Export filtered CSV
        </Link>
        {editable && (
          <>
            <Link className="button button-secondary" href="/orders/import">
              Import orders
            </Link>
            <Link className="button" href="/orders/new">
              + Create order
            </Link>
          </>
        )}
      </PageHeading>
      <section className="card">
        <form action="/orders" className="order-filters">
          <label>
            Search
            <input
              name="q"
              defaultValue={params.get("q") || ""}
              placeholder="Reference, customer or city"
              maxLength={100}
            />
          </label>
          <label>
            Status
            <select name="status" defaultValue={params.get("status") || ""}>
              <option value="">All statuses</option>
              {["new", "unprocessed", "shipped", "cancelled"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          {!user.customer_id && (
            <label>
              Customer
              <select
                name="customer"
                defaultValue={params.get("customer") || ""}
              >
                <option value="">All customers</option>
                {customers(db, user).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Pickup
            <select
              name="warehouse"
              defaultValue={params.get("warehouse") || ""}
            >
              <option value="">All locations</option>
              {warehouses(db, user).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Payment
            <select name="payment" defaultValue={params.get("payment") || ""}>
              <option value="">All payments</option>
              <option value="prepaid">Prepaid</option>
              <option value="cod">COD</option>
            </select>
          </label>
          <label>
            From
            <input
              type="date"
              name="from"
              defaultValue={params.get("from") || ""}
            />
          </label>
          <label>
            To
            <input
              type="date"
              name="to"
              defaultValue={params.get("to") || ""}
            />
          </label>
          <label>
            Sort
            <select name="sort" defaultValue={params.get("sort") || "newest"}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="reference">Reference</option>
              <option value="value">Highest value</option>
            </select>
          </label>
          <button className="button">Apply filters</button>
          <Link className="text-link" href="/orders">
            Reset
          </Link>
        </form>
        <OrderList
          key={params.toString()}
          rows={data.rows as unknown as OrderRow[]}
          editable={editable}
        />
        <div className="table-footer">
          <span>
            {data.total} orders · Page {data.page} of {data.pages} · 20 per page
          </span>
          <div className="pagination">
            {data.page > 1 && (
              <Link href={pageLink(data.page - 1)}>← Previous</Link>
            )}
            {data.page < data.pages && (
              <Link href={pageLink(data.page + 1)}>Next →</Link>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

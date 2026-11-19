import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/auth-core";
import { getDb } from "@/lib/db";
import { customers, warehouses } from "@/lib/orders";
import { PageHeading } from "@/components/ui";
import { OrderImport } from "@/components/order-import";
export default async function Import() {
  const user = await requireUser(),
    db = getDb();
  if (!can(user.role, "operate"))
    return <p>Read-only access. Import requires operational access.</p>;
  const mappings = db
    .prepare(
      "SELECT name,mapping FROM import_mappings WHERE user_id=? ORDER BY name",
    )
    .all(user.id)
    .map((r) => ({
      name: String(r.name),
      mapping: JSON.parse(String(r.mapping)),
    }));
  return (
    <>
      <PageHeading
        eyebrow="BULK ORDER INTAKE"
        title="Import with confidence."
        description="Map your columns, check every row, then save the valid orders."
      >
        <Link className="button button-secondary" href="/orders">
          Back to orders
        </Link>
      </PageHeading>
      <OrderImport
        customers={customers(db, user)}
        warehouses={warehouses(db, user)}
        mappings={mappings}
      />
    </>
  );
}

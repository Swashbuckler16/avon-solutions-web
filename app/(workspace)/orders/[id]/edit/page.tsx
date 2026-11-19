import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/auth-core";
import { getDb } from "@/lib/db";
import { getOrder, customers, warehouses, InputError } from "@/lib/orders";
import { PageHeading } from "@/components/ui";
import { OrderEditor } from "@/components/operations-forms";
export default async function Edit({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser(),
    db = getDb(),
    { id } = await params;
  let order;
  try {
    order = getOrder(db, user, id);
  } catch (error) {
    if (error instanceof InputError && error.status === 404) notFound();
    throw error;
  }
  if (
    !can(user.role, "operate") ||
    !["new", "unprocessed"].includes(order.status) ||
    db.prepare("SELECT id FROM shipments WHERE order_id=?").get(id)
  )
    return <p>This order cannot be edited.</p>;
  return (
    <>
      <PageHeading
        eyebrow="ORDER MANAGEMENT"
        title={`Edit ${order.reference}`}
        description="Changes are saved with a revision check and recorded in the audit history."
      />
      <OrderEditor
        customers={customers(db, user)}
        warehouses={warehouses(db, user)}
        order={order}
      />
    </>
  );
}

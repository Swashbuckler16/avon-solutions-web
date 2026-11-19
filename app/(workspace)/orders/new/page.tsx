import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/auth-core";
import { getDb } from "@/lib/db";
import { customers, warehouses, getOrder, InputError } from "@/lib/orders";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/ui";
import { OrderEditor } from "@/components/operations-forms";
export default async function NewOrder({
  searchParams,
}: {
  searchParams: Promise<{ clone?: string }>;
}) {
  const user = await requireUser(),
    db = getDb();
  if (!can(user.role, "operate"))
    return (
      <p>
        Read-only access. <Link href="/orders">View orders</Link>
      </p>
    );
  const params = await searchParams;
  let source;
  try {
    source =
      typeof params.clone === "string"
        ? getOrder(db, user, params.clone)
        : undefined;
  } catch (error) {
    if (error instanceof InputError && error.status === 404) notFound();
    throw error;
  }
  return (
    <>
      <PageHeading
        eyebrow="ORDERS"
        title={source ? "Clone order" : "Create order"}
        description={
          source
            ? "A new reference creates a separate order. No shipment or booking is copied."
            : "Customer, recipient, products and parcels—all in one place."
        }
      />
      <OrderEditor
        customers={customers(db, user)}
        warehouses={warehouses(db, user)}
        order={source}
        clone={!!source}
      />
    </>
  );
}

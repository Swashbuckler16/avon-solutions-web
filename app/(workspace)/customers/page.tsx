import { requireUser } from "@/lib/auth";
import { can } from "@/lib/auth-core";
import { getDb } from "@/lib/db";
import { customers } from "@/lib/orders";
import { PageHeading } from "@/components/ui";
import { DirectoryEditor } from "@/components/operations-forms";
export default async function Customers() {
  const user = await requireUser();
  return (
    <>
      <PageHeading
        eyebrow="CUSTOMER RELATIONSHIPS"
        title={user.customer_id ? "Your business" : "Customers"}
        description="The businesses shipping with Avon. Delivery is fulfilled by carrier partners."
      />
      <DirectoryEditor
        kind="customer"
        customers={customers(getDb(), user)}
        editable={!user.customer_id && can(user.role, "operate")}
        admin={!user.customer_id && user.role === "admin"}
      />
    </>
  );
}

import { requireUser } from "@/lib/auth";
import { can } from "@/lib/auth-core";
import { getDb } from "@/lib/db";
import { customers, warehouses } from "@/lib/orders";
import { PageHeading } from "@/components/ui";
import { DirectoryEditor } from "@/components/operations-forms";
export default async function Warehouses() {
  const user = await requireUser(),
    db = getDb();
  return (
    <>
      <PageHeading
        eyebrow="WHERE EVERY JOURNEY STARTS"
        title="Pickup locations"
        description="Manage customer warehouses and validated pickup addresses."
      />
      <DirectoryEditor
        kind="warehouse"
        customers={customers(db, user)}
        warehouses={warehouses(db, user)}
        editable={can(user.role, "operate")}
      />
    </>
  );
}

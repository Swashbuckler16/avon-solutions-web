import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { getDb } from "@/lib/db";
import { workspace } from "@/lib/workspace";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <Shell user={user} settings={workspace(getDb(), user)}>
      {children}
    </Shell>
  );
}

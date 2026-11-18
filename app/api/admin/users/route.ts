import { currentUser } from "@/lib/auth";
import { can } from "@/lib/auth-core";
import { getDb } from "@/lib/db";

export async function GET() {
  const user = await currentUser();
  if (!user)
    return Response.json({ error: "Sign in required" }, { status: 401 });
  if (!can(user.role, "manage_users"))
    return Response.json(
      { error: "Administrator access required" },
      { status: 403 },
    );
  return Response.json(
    getDb().prepare("SELECT id,name,email,role FROM users ORDER BY name").all(),
    { headers: { "Cache-Control": "no-store" } },
  );
}

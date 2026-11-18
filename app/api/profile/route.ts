import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { appOrigin, validOrigin } from "@/lib/auth-core";

export async function POST(request: NextRequest) {
  if (!validOrigin(request.headers.get("origin")))
    return new NextResponse("Invalid request origin", { status: 403 });
  const user = await currentUser();
  if (!user) return new NextResponse("Sign in required", { status: 401 });
  const data = await request.formData();
  const name = String(data.get("name") || "").trim();
  if (name.length < 2 || name.length > 80 || /[\x00-\x1f\x7f]/.test(name)) {
    return NextResponse.redirect(
      new URL("/settings?error=name", appOrigin()),
      303,
    );
  }
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE users SET name=? WHERE id=?").run(name, user.id);
    db.prepare(
      "INSERT INTO audit_events(user_id,action,created_at) VALUES (?,?,?)",
    ).run(user.id, "profile_updated", Date.now());
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return NextResponse.redirect(new URL("/settings?saved=1", appOrigin()), 303);
}

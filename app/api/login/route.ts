import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  appOrigin,
  authenticate,
  consumeLoginAttempt,
  createSession,
  SESSION_SECONDS,
  validOrigin,
} from "@/lib/auth-core";
import { COOKIE } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!validOrigin(request.headers.get("origin")))
    return new NextResponse("Invalid request origin", { status: 403 });
  const data = await request.formData();
  const email = String(data.get("email") || "")
    .trim()
    .toLowerCase();
  const password = String(data.get("password") || "");
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/login?error=${reason}`, appOrigin()), 303);
  if (!email || email.length > 254 || !password || password.length > 256)
    return fail("credentials");
  const db = getDb();
  if (!consumeLoginAttempt(db, email)) return fail("limited");
  const user = await authenticate(db, email, password);
  if (!user) return fail("credentials");
  const response = NextResponse.redirect(
    new URL("/dashboard", appOrigin()),
    303,
  );
  response.cookies.set(COOKIE, createSession(db, user.id), {
    httpOnly: true,
    sameSite: "strict",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  db.prepare(
    "INSERT INTO audit_events(user_id,action,created_at) VALUES (?,?,?)",
  ).run(user.id, "signed_in", Date.now());
  return response;
}

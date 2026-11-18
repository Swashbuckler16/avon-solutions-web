import { NextRequest, NextResponse } from "next/server";
import { COOKIE } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { appOrigin, revokeSession, validOrigin } from "@/lib/auth-core";

export async function POST(request: NextRequest) {
  if (!validOrigin(request.headers.get("origin")))
    return new NextResponse("Invalid request origin", { status: 403 });
  const token = request.cookies.get(COOKIE)?.value;
  if (token) revokeSession(getDb(), token);
  const response = NextResponse.redirect(new URL("/login", appOrigin()), 303);
  response.cookies.set(COOKIE, "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "strict",
  });
  return response;
}

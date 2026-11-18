import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "./db.ts";
import { sessionUser } from "./auth-core.ts";

export const COOKIE = "avon_session";
export async function currentUser() {
  return sessionUser(getDb(), (await cookies()).get(COOKIE)?.value);
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

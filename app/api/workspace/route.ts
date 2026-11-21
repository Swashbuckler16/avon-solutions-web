import { currentUser } from "@/lib/auth";
import { validOrigin } from "@/lib/auth-core";
import { getDb } from "@/lib/db";
import { InputError } from "@/lib/orders";
import { saveWorkspace } from "@/lib/workspace";
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user)
    return Response.json({ error: "Sign in required" }, { status: 401 });
  if (!validOrigin(request.headers.get("origin")))
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new InputError("Request body required.");
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.length;
      if (size > 4096) {
        await reader.cancel();
        throw new InputError("Settings exceed 4 KB.", 413);
      }
      chunks.push(r.value);
    }
    let input: unknown;
    try {
      input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new InputError("Invalid JSON.");
    }
    return Response.json(saveWorkspace(getDb(), user, input));
  } catch (error) {
    if (error instanceof InputError)
      return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

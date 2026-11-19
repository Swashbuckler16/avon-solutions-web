import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getProof } from "@/lib/shipping";
import { InputError } from "@/lib/orders";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  try {
    const proof = getProof(getDb(), user, (await params).id);
    return new Response(new Uint8Array(proof.content as Uint8Array), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": 'inline; filename="delivery-proof.png"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof InputError)
      return new Response(error.message, { status: error.status });
    throw error;
  }
}

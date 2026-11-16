import { getHolders } from "@/lib/server/extras";
import { fail, isAddr, json } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  if (!isAddr(address)) return fail(new Error("invalid address"), 400);
  try { return json(await getHolders(address), 30); } catch (e) { return fail(e); }
}

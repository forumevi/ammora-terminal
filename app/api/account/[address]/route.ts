import { getAccountActivity } from "@/lib/server/indexer";
import { fail, isAddr, json } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  if (!isAddr(address)) return fail(new Error("invalid address"), 400);
  try { return json(await getAccountActivity(address), 10); } catch (e) { return fail(e); }
}

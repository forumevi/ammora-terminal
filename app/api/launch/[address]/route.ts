import { getLaunchDetail } from "@/lib/server/indexer";
import { fail, isAddr, json } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  if (!isAddr(address)) return fail(new Error("invalid address"), 400);
  try {
    const d = await getLaunchDetail(address);
    return d ? json(d, 8) : fail(new Error("Not an Ammora V4 launch from the reviewed LaunchFactory (or not indexed yet)"), 404);
  } catch (e) { return fail(e); }
}

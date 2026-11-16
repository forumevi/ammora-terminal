import { getLaunchIndex } from "@/lib/server/indexer";
import { fail, json } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try { return json(await getLaunchIndex(), 10); } catch (e) { return fail(e); }
}

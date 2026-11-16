import { getConfigs } from "@/lib/server/extras";
import { fail, json } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try { return json({ configs: await getConfigs() }, 300); } catch (e) { return fail(e); }
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TokenView } from "@/components/TokenView";
import { getLaunchDetail } from "@/lib/server/indexer";
import { fmtPrice, statusLabel } from "@/lib/ammora/format";

type Props = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return { title: "Token not found" };
  try {
    const d = await getLaunchDetail(address);
    if (!d) return { title: "Token not found" };
    const l = d.launch;
    const description = `${l.name} ($${l.symbol}) on Ammora V4 · ${statusLabel(l.status)}${l.status === 1 ? ` · ${(l.progressBps / 100).toFixed(1)}% to graduation` : ""} · price ${fmtPrice(l.price)} WETH · ${l.trades} trades.`;
    return { title: `$${l.symbol} — ${l.name}`, description, openGraph: { title: `$${l.symbol} — ${l.name} · Ammora Terminal`, description } };
  } catch {
    return { title: "Token" };
  }
}

export default async function TokenPage({ params }: Props) {
  const { address } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) notFound();
  return <TokenView address={address} />;
}

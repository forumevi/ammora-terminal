"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { decodeFunctionData } from "viem";
import { useConnection } from "wagmi";
import {
  ammoraLaunchFactoryV4Abi,
  buildCreateAmmoraV4Launch,
  getAmmoraV4ConfigAtBlock,
  getAmmoraV4PredictedLaunchAtBlock,
  parseAmmoraV4LaunchCreatedReceipt,
} from "@ammora-protocol/sdk";
import { Check, ChevronLeft, ChevronRight, ImagePlus, Loader2, Rocket, Trash2 } from "lucide-react";
import { useConfigs } from "@/lib/client/api";
import { confirmedHead, useGiwaClient } from "@/lib/client/sdk";
import { useTx } from "@/lib/client/tx";
import { explainError } from "@/lib/client/errors";
import { CONTRACTS, DEFAULT_CONFIG_ID, explorerAddress } from "@/lib/ammora/config";
import { buildInlineMetadataURI } from "@/lib/ammora/metadata";
import { fmtBps, fmtUnits, shortAddr } from "@/lib/ammora/format";
import type { ConfigSummary } from "@/lib/ammora/types";
import { Progress, TokenAvatar } from "@/components/ui";
import { WalletButton } from "@/components/WalletButton";
import { useToast } from "@/components/toast";

type Draft = { name: string; symbol: string; description: string; image: string; website: string; twitter: string; telegram: string; configId: string };
const EMPTY: Draft = { name: "", symbol: "", description: "", image: "", website: "", twitter: "", telegram: "", configId: String(DEFAULT_CONFIG_ID) };
const KEY = "ammora-terminal:create-draft";
const MAX_IMAGE_BYTES = 24_000;

const validate = (d: Draft) => {
  const e: Partial<Record<keyof Draft, string>> = {};
  if (!d.name.trim() || d.name.trim().length > 32) e.name = "1–32 characters";
  if (!/^[A-Z0-9]{2,10}$/.test(d.symbol)) e.symbol = "2–10 characters, A–Z and 0–9";
  if (d.description.length > 280) e.description = "Max 280 characters";
  if (d.image && !/^(https:\/\/|data:image\/)/.test(d.image)) e.image = "Use an https:// URL or upload an image";
  if (d.website && !/^https:\/\//.test(d.website)) e.website = "Must start with https://";
  return e;
};

/** Downscale an uploaded image to a 256px WebP data URI so it can live inside the on-chain metadata URI. */
const toDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 256;
      const c = document.createElement("canvas");
      c.width = size; c.height = size;
      const ctx = c.getContext("2d")!;
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      for (const q of [0.82, 0.7, 0.55, 0.4]) {
        const url = c.toDataURL("image/webp", q);
        if (url.length <= MAX_IMAGE_BYTES) return resolve(url);
      }
      reject(new Error("Image is too detailed to store on-chain; try a simpler image or an https URL"));
    };
    img.onerror = () => reject(new Error("Could not read that image"));
    img.src = URL.createObjectURL(file);
  });

export default function CreatePage() {
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const errors = validate(d);
  const { data: cfg, isLoading: cfgLoading, error: cfgError } = useConfigs();
  const enabled = useMemo(() => (cfg?.configs ?? []).filter((c) => c.enabled), [cfg]);
  const config = enabled.find((c) => c.configId === d.configId);

  useEffect(() => {
    let saved: Partial<Draft> = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the saved draft once on mount (localStorage is client-only)
    setD({ ...EMPTY, ...saved });
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) localStorage.setItem(KEY, JSON.stringify(d)); }, [d, loaded]);

  const set = (k: keyof Draft) => (v: string) => setD((x) => ({ ...x, [k]: v }));
  const step0ok = !errors.name && !errors.symbol && !errors.description && !errors.image && !errors.website;
  const steps = ["Token", "Economics", "Review & launch"];

  const preview = { token: "0x0000000000000000000000000000000000000000" as const, symbol: d.symbol || "TKN", meta: { image: d.image || undefined } };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Create a launch</h1>
        <p className="mt-1 text-sm text-zinc-400">Issue a new token and its Ammora ALC bonding curve in one <code className="text-emerald-200">LaunchFactory</code> transaction, built with <code className="text-emerald-200">buildCreateAmmoraV4Launch</code> on a reviewed, reusable Config.</p>
      </div>
      <ol className="flex flex-wrap gap-2">
        {steps.map((s, i) => (
          <li key={s}>
            <button onClick={() => (i === 0 || step0ok) && setStep(i)} className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm ${i === step ? "border-emerald-400/50 bg-emerald-400/10 text-white" : "border-white/10 text-zinc-400"}`}>
              <span className={`flex size-5 items-center justify-center rounded-full text-[11px] font-bold ${i < step ? "bg-emerald-400 text-black" : "bg-white/10"}`}>{i < step ? <Check className="size-3" /> : i + 1}</span>{s}
            </button>
          </li>
        ))}
        <li className="ml-auto self-center text-[11px] text-zinc-500">Draft saved locally</li>
      </ol>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="card p-5">
          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" err={errors.name} hint={`${d.name.length}/32`}><input className="input" value={d.name} onChange={(e) => set("name")(e.target.value)} placeholder="Giwa Otter" maxLength={32} /></Field>
              <Field label="Symbol" err={errors.symbol} hint="A–Z, 0–9"><input className="input uppercase" value={d.symbol} onChange={(e) => set("symbol")(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="OTTER" maxLength={10} /></Field>
              <div className="sm:col-span-2"><Field label="Description" err={errors.description} hint={`${d.description.length}/280`}><textarea className="input min-h-24" value={d.description} onChange={(e) => set("description")(e.target.value)} placeholder="What is this token about?" maxLength={280} /></Field></div>
              <div className="sm:col-span-2"><ImageField value={d.image} onChange={set("image")} err={errors.image} /></div>
              <Field label="Website (optional)" err={errors.website}><input className="input" value={d.website} onChange={(e) => set("website")(e.target.value)} placeholder="https://" /></Field>
              <Field label="X / Twitter (optional)"><input className="input" value={d.twitter} onChange={(e) => set("twitter")(e.target.value)} placeholder="@handle" /></Field>
              <Field label="Telegram (optional)"><input className="input" value={d.telegram} onChange={(e) => set("telegram")(e.target.value)} placeholder="group name or https://t.me/…" /></Field>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">A Config fixes supply, curve segments, fees, graduation threshold and LP locks — immutably. Choosing an existing enabled Config needs no Ammora approval. Config #6 is the reviewed GIWA template used in the Ammora launchpad guide.</p>
              {cfgLoading ? <div className="skeleton h-40" /> : cfgError ? <p className="text-sm text-rose-300">{explainError(cfgError)}</p> : (
                <>
                  <select className="input" value={d.configId} onChange={(e) => set("configId")(e.target.value)} aria-label="Config">
                    {enabled.map((c) => <option key={c.configId} value={c.configId}>Config #{c.configId} · grad at {fmtUnits(c.migrationQuoteThresholdRaw, 18, 4)} WETH · {fmtBps(c.cliffFeeBps)} fee · {c.migrationMode === 0 ? "concentrated" : "compounding"} · used by {c.launchesUsingIt}{String(DEFAULT_CONFIG_ID) === c.configId ? " · reviewed template" : ""}</option>)}
                  </select>
                  {config ? <ConfigDetails c={config} /> : <p className="text-sm text-amber-200">Config #{d.configId} is not enabled; pick another.</p>}
                </>
              )}
            </div>
          )}
          {step === 2 && config && <Review d={d} config={config} />}
          <div className="mt-6 flex justify-between">
            <button className="btn-ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}><ChevronLeft className="size-4" /> Back</button>
            {step < 2 && <button className="btn-primary" disabled={(step === 0 && !step0ok) || (step === 1 && !config)} onClick={() => setStep((s) => s + 1)}>Next <ChevronRight className="size-4" /></button>}
          </div>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Live preview</p>
          <div className="card p-4">
            <div className="flex items-start gap-3">
              <TokenAvatar launch={preview} size={64} />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-white">{d.name || "Token name"}</p>
                <p className="text-sm text-zinc-500">${d.symbol || "SYMBOL"}</p>
                <span className="chip mt-1 border-emerald-400/30 bg-emerald-400/10 text-emerald-200">Bonding</span>
              </div>
            </div>
            {d.description && <p className="mt-3 line-clamp-3 text-xs text-zinc-400">{d.description}</p>}
            <div className="mt-3"><Progress bps={0} status={1} /></div>
            {config && <p className="mt-2 text-[11px] text-zinc-500">Graduates at {fmtUnits(config.migrationQuoteThresholdRaw, 18, 4)} WETH · supply {fmtUnits(config.totalSupplyRaw, config.tokenDecimals, 0)}</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, err, hint, children }: { label: string; err?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label flex justify-between"><span>{label}</span>{hint && <span className="normal-case tracking-normal text-zinc-600">{hint}</span>}</span>
      {children}
      {err && <span className="mt-1 block text-[11px] text-rose-300">{err}</span>}
    </label>
  );
}

function ImageField({ value, onChange, err }: { value: string; onChange: (v: string) => void; err?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <div>
      <span className="label">Artwork</span>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost" onClick={() => ref.current?.click()} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />} Upload</button>
        <input ref={ref} type="file" accept="image/*" hidden onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          setBusy(true);
          try { onChange(await toDataUrl(f)); } catch (x) { toast.push({ kind: "error", title: "Image not used", body: (x as Error).message }); } finally { setBusy(false); e.target.value = ""; }
        }} />
        <input className="input flex-1" value={value.startsWith("data:") ? "(uploaded image, stored inline)" : value} disabled={value.startsWith("data:")} onChange={(e) => onChange(e.target.value)} placeholder="…or paste an https:// image URL" />
        {value && <button type="button" className="btn-ghost !px-3" onClick={() => onChange("")} aria-label="Remove image"><Trash2 className="size-4" /></button>}
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">Uploads are cropped to 256×256 WebP (≤ 24 KB) and embedded in the metadata URI on-chain — no third-party storage. {value.startsWith("data:") && `${(value.length / 1024).toFixed(1)} KB`}</p>
      {err && <span className="mt-1 block text-[11px] text-rose-300">{err}</span>}
    </div>
  );
}

function ConfigDetails({ c }: { c: ConfigSummary }) {
  const rows: [string, string][] = [
    ["Config hash", `${c.configHash.slice(0, 22)}…`],
    ["Quote asset", c.quoteToken.toLowerCase() === CONTRACTS.weth.toLowerCase() ? "WETH (wrapped native)" : c.quoteToken],
    ["Total supply", `${fmtUnits(c.totalSupplyRaw, c.tokenDecimals, 0)} (${c.tokenDecimals} decimals)`],
    ["Graduation threshold", `${fmtUnits(c.migrationQuoteThresholdRaw, 18, 6)} WETH in the curve`],
    ["Curve segments", String(c.segments)],
    ["Trading fee (cliff)", `${fmtBps(c.cliffFeeBps)}${c.dynamicFeeEnabled ? " + dynamic" : ""}`],
    ["Creator share of non-protocol fees", fmtBps(c.creatorShareOfNonProtocolBps)],
    ["After graduation", `${c.migrationMode === 0 ? "Concentrated" : "Compounding"} ARL pool · ${fmtBps(c.postMigrationFeeBps)} fee`],
    ["LP locks at graduation", `Partner ${fmtBps(c.partnerPermanentLockedBps)} · Creator ${fmtBps(c.creatorPermanentLockedBps)} permanent`],
    ["Partner recipient", shortAddr(c.partnerRecipient, 6)],
    ["Creation fee", `${fmtUnits(c.poolCreationFeeRaw, 18, 6)} ETH`],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-2 rounded-xl border border-white/5 bg-black/20 p-4 text-xs sm:grid-cols-2">
      {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-zinc-500">{k}</dt><dd className="text-right text-zinc-200 num">{v}</dd></div>)}
    </dl>
  );
}

function Review({ d, config }: { d: Draft; config: ConfigSummary }) {
  const { address, status } = useConnection();
  const client = useGiwaClient();
  const { run } = useTx();
  const router = useRouter();
  const metadataURI = useMemo(() => buildInlineMetadataURI({ name: d.name.trim(), symbol: d.symbol, description: d.description, image: d.image, website: d.website, twitter: d.twitter, telegram: d.telegram }), [d]);
  const tx = useMemo(() => buildCreateAmmoraV4Launch({ name: d.name.trim(), symbol: d.symbol, metadataURI, creatorMetadataURI: metadataURI, tokenDecimals: config.tokenDecimals }, BigInt(config.configId), BigInt(config.poolCreationFeeRaw)), [d, config, metadataURI]);
  const fn = useMemo(() => { try { return decodeFunctionData({ abi: ammoraLaunchFactoryV4Abi, data: tx.data }).functionName; } catch { return "?"; } }, [tx]);

  const check = useQuery({
    queryKey: ["create-sim", address, tx.data, String(tx.value)],
    enabled: !!client && !!address,
    retry: 0,
    queryFn: async () => {
      const block = await confirmedHead(client!);
      const live = await getAmmoraV4ConfigAtBlock(client!, CONTRACTS.configRegistry, BigInt(config.configId), block);
      if (!live.enabled) throw new Error(`Config #${config.configId} is disabled`);
      if (live.configHash !== config.configHash) throw new Error("Config hash changed — reload");
      const predicted = await getAmmoraV4PredictedLaunchAtBlock(client!, CONTRACTS.launchFactory, address!, BigInt(config.configId), metadataURI, block);
      await client!.call({ account: address!, to: CONTRACTS.launchFactory, data: tx.data, value: tx.value });
      return { predicted, block };
    },
  });

  const launch = () => run(`Launch $${d.symbol}`, [{
    kind: "tx",
    label: `Create ${d.symbol} + bonding curve`,
    details: [
      { label: "Contract", value: <a className="hover:underline" href={explorerAddress(CONTRACTS.launchFactory)} target="_blank" rel="noreferrer">LaunchFactory {shortAddr(CONTRACTS.launchFactory)}</a> },
      { label: "Function", value: fn },
      { label: "Config", value: `#${config.configId}` },
      { label: "Token", value: `${d.name.trim()} ($${d.symbol}), ${config.tokenDecimals} decimals` },
      { label: "Value (creation fee)", value: `${fmtUnits(tx.value, 18, 6)} ETH` },
      { label: "Metadata URI", value: `${(metadataURI.length / 1024).toFixed(1)} KB inline JSON` },
    ],
    build: async () => {
      const block = await client!.getBlockNumber();
      const live = await getAmmoraV4ConfigAtBlock(client!, CONTRACTS.configRegistry, BigInt(config.configId), block);
      if (!live.enabled || live.config.tokenDecimals !== config.tokenDecimals) throw new Error("Config changed since review");
      const fresh = buildCreateAmmoraV4Launch({ name: d.name.trim(), symbol: d.symbol, metadataURI, creatorMetadataURI: metadataURI, tokenDecimals: live.config.tokenDecimals }, BigInt(config.configId), live.config.poolCreationFee);
      return { tx: { to: CONTRACTS.launchFactory, data: fresh.data, value: fresh.value } };
    },
    onReceipt: async (r) => {
      const created = parseAmmoraV4LaunchCreatedReceipt(r, CONTRACTS.launchFactory);
      localStorage.removeItem(KEY);
      setTimeout(() => router.push(`/token/${created.token}`), 2500);
    },
  }], "Receipt is parsed with parseAmmoraV4LaunchCreatedReceipt; the token page opens when it is indexed.");

  return (
    <div className="space-y-4">
      <dl className="grid gap-2 text-sm">
        {[
          ["Token", `${d.name.trim()} ($${d.symbol})`],
          ["Config", `#${config.configId} · ${config.configHash.slice(0, 18)}…`],
          ["Supply", `${fmtUnits(config.totalSupplyRaw, config.tokenDecimals, 0)} ${d.symbol}`],
          ["Graduation", `${fmtUnits(config.migrationQuoteThresholdRaw, 18, 6)} WETH → ${config.migrationMode === 0 ? "concentrated" : "compounding"} ARL pool`],
          ["Call", `LaunchFactory.${fn}(…) with ${fmtUnits(tx.value, 18, 6)} ETH`],
          ["You will be", "Creator (msg.sender) — earns the Creator fee share"],
        ].map(([k, v]) => <div key={k} className="flex justify-between gap-3 border-b border-white/5 pb-2"><dt className="text-zinc-500">{k}</dt><dd className="text-right text-zinc-200">{v}</dd></div>)}
      </dl>
      <details className="rounded-xl border border-white/5 bg-black/30 p-3 text-xs">
        <summary className="cursor-pointer text-zinc-400">Metadata JSON written on-chain</summary>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[11px] text-zinc-300">{metadataURI.length > 1200 ? `${metadataURI.slice(0, 1200)}…` : metadataURI}</pre>
      </details>
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs">
        {status !== "connected" ? <p className="text-zinc-400">Connect your wallet to predict addresses and simulate the launch.</p> : check.isLoading ? (
          <p className="flex items-center gap-2 text-zinc-400"><Loader2 className="size-3 animate-spin" /> Predicting addresses and simulating createLaunch at a confirmed block…</p>
        ) : check.error ? <p className="text-rose-300">Simulation failed: {explainError(check.error)}</p> : check.data ? (
          <div className="space-y-1">
            <p className="flex items-center gap-1 text-emerald-300"><Check className="size-3" /> Simulation passed (eth_call) — config enabled, hash matches.</p>
            <p className="text-zinc-400">Predicted token <span className="font-mono text-zinc-200">{check.data.predicted.token}</span></p>
            <p className="text-zinc-400">Predicted curve <span className="font-mono text-zinc-200">{check.data.predicted.curve}</span></p>
            <p className="text-[10px] text-zinc-600">Predictions are nonce-sensitive; the confirmed LaunchCreated receipt is authoritative.</p>
          </div>
        ) : null}
      </div>
      {status !== "connected" ? <WalletButton /> : (
        <button className="btn-primary w-full !py-3" disabled={!check.data} onClick={launch}><Rocket className="size-4" /> Review & launch</button>
      )}
    </div>
  );
}

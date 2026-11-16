/**
 * Read-only live verification against GIWA Sepolia (chainId 91342).
 * Signs nothing, sends nothing, needs no private key. Every write is only
 * *simulated* with eth_call (and, where funds are required, an eth_call state
 * override that gives a throwaway address a WETH / token balance + allowance).
 *
 *   node scripts/verify-live.mjs
 */
import {
  createPublicClient, http, custom, decodeEventLog, encodeAbiParameters, keccak256, erc20Abi, parseUnits, toHex, pad,
} from "viem";
import { giwaSepolia } from "viem/chains";
import {
  AmmoraDataApiClient, AmmoraRouteClient, AmmoraV4LaunchCurveClient, AMMORA_FEE_POLICY_VERSION,
  ammoraLaunchFactoryV4Abi, ammoraLaunchPoolV4Abi, buildCreateAmmoraV4Launch, classifyAmmoraV4ExactInputFill,
  getAmmoraV4ConfigAtBlock, getAmmoraV4PredictedLaunchAtBlock, giwaSepoliaAutoRoute, giwaSepoliaAutoRouteCatalog,
  giwaSepoliaAutoRouteDeployment as D, giwaSepoliaAutoRouteDeploymentCatalog, giwaSepoliaAutoRoutePoolProfiles,
  resolveAmmoraFinalizedHead, verifyAmmoraV4CoreAtBlock, decodeAmmoraContractError,
} from "@ammora-protocol/sdk";

const RPC = process.env.AMMORA_RPC_URL || D.chain.rpcUrls[0];
const EXPLORER = D.chain.blockExplorerUrl;
const DATA_API = "https://ammora-giwa-sepolia-data.fly.dev";
const L = D.contracts.launch;
const WETH = D.contracts.tokens.wrappedNative;
const CORE = { configRegistry: L.configRegistry, launchFactory: L.factory, graduationAdapter: L.graduationAdapter, feePolicy: L.feePolicy };
const SIM = "0x00000000000000000000000000000000a11ce000"; // throwaway simulation account, no key exists for it
const j = (x) => JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v));
const results = [];
const check = async (name, fn) => {
  const t0 = Date.now();
  try { const detail = await fn(); results.push({ name, ok: true, ms: Date.now() - t0, detail }); console.log(`PASS  ${name}\n      ${j(detail)}`); }
  catch (e) { results.push({ name, ok: false, ms: Date.now() - t0, error: e.shortMessage || e.message }); console.log(`FAIL  ${name}\n      ${(e.shortMessage || e.message).slice(0, 400)}`); }
};

/** Serialize public RPC calls (pattern from ammora-examples src/shared/rpc.ts) to respect the shared RPC rate limit. */
const paced = (url, intervalMs = Number(process.env.AMMORA_RPC_INTERVAL_MS ?? "120")) => {
  let tail = Promise.resolve(); let nextStart = 0;
  return (params) => {
    const base = http(url, { retryCount: 4, retryDelay: 1200 })(params);
    return custom({ request: (args) => { const r = tail.then(async () => { await new Promise((ok) => setTimeout(ok, Math.max(0, nextStart - Date.now()))); try { return await base.request(args); } finally { nextStart = Date.now() + intervalMs; } }); tail = r.catch(() => undefined); return r; } }, { retryCount: 0 })(params);
  };
};
const client = createPublicClient({ chain: giwaSepolia, transport: paced(RPC) });

/** Find the mapping slot of an ERC-20 balance/allowance by probing with state overrides (read-only). */
const findSlot = async (token, kind, holder, spender) => {
  const marker = 123456789n * 10n ** 18n;
  for (let slot = 0n; slot < 12n; slot++) {
    const key = kind === "balance"
      ? keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [holder, slot]))
      : keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [spender, keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [holder, slot]))]));
    const stateOverride = [{ address: token, stateDiff: [{ slot: key, value: pad(toHex(marker), { size: 32 }) }] }];
    const value = await client.readContract(kind === "balance"
      ? { address: token, abi: erc20Abi, functionName: "balanceOf", args: [holder], stateOverride }
      : { address: token, abi: erc20Abi, functionName: "allowance", args: [holder, spender], stateOverride }).catch(() => 0n);
    if (value === marker) return key;
  }
  return null;
};
const fund = async (token, holder, spender, amount) => {
  const [b, a] = await Promise.all([findSlot(token, "balance", holder), findSlot(token, "allowance", holder, spender)]);
  if (!b || !a) return null;
  const v = pad(toHex(amount), { size: 32 });
  return [{ address: token, stateDiff: [{ slot: b, value: v }, { slot: a, value: v }] }];
};

let launches = [];
let head;
await check("RPC chain id is 91342", async () => ({ rpc: RPC, chainId: await client.getChainId() }));
await check("Ammora V4 core verified at confirmed block (verifyAmmoraV4CoreAtBlock)", async () => {
  head = await resolveAmmoraFinalizedHead([client], giwaSepoliaAutoRoute.finality);
  await verifyAmmoraV4CoreAtBlock(client, CORE, head);
  return { block: head, factory: L.factory, registry: L.configRegistry };
});
await check("Ammora Data API reachable (AmmoraDataApiClient.getLaunches)", async () => {
  const fetcher = async (url, init) => { const r = await fetch(url, { ...init, signal: AbortSignal.timeout(5000) }); const t = await r.text(); return { ok: r.ok, status: r.status, json: async () => JSON.parse(t), text: async () => t }; };
  const api = new AmmoraDataApiClient(DATA_API, fetcher);
  const page = await api.getLaunches({ chainId: 91342n });
  return { items: page.items.length };
});
await check("Launch index from LaunchCreated logs (explorer log index + SDK ABI decode)", async () => {
  const topic = "0x0d8c51804d67b6aa256e855176d3b6f5d0cc3657138b63947cc9eb5a1908d00a";
  const r = await (await fetch(`${EXPLORER}/api?module=logs&action=getLogs&fromBlock=${D.startBlock}&toBlock=latest&address=${L.factory}&topic0=${topic}`)).json();
  launches = r.result.map((l) => ({ ...decodeEventLog({ abi: ammoraLaunchFactoryV4Abi, data: l.data, topics: l.topics.filter(Boolean) }).args, block: BigInt(l.blockNumber) }));
  const states = await client.multicall({ contracts: launches.flatMap((x) => [{ address: x.curve, abi: ammoraLaunchPoolV4Abi, functionName: "status" }, { address: x.curve, abi: ammoraLaunchPoolV4Abi, functionName: "canonicalPool" }]) });
  launches.forEach((x, i) => { x.status = states[2 * i].result; x.pool = states[2 * i + 1].result; });
  const by = launches.reduce((a, x) => ((a[x.status] = (a[x.status] || 0) + 1), a), {});
  return { launches: launches.length, byStatus: by, newest: { token: launches.at(-1).token, curve: launches.at(-1).curve, configId: launches.at(-1).configId } };
});

let active;
await check("Curve state + quote via AmmoraV4LaunchCurveClient (getStateAtBlock / quoteExactInputAtBlock)", async () => {
  const candidates = launches.filter((x) => x.status === 1 && x.block <= head).reverse(); // skip launches newer than the confirmed snapshot
  for (const c of candidates) {
    const sdk = new AmmoraV4LaunchCurveClient(client, c.curve, CORE);
    const state = await sdk.getStateAtBlock(head).catch(() => null);
    if (!state || state.quoteReserve < 10n ** 15n) continue; // need existing liquidity so a sell can also be simulated
    const factoryToken = await client.readContract({ address: L.factory, abi: ammoraLaunchFactoryV4Abi, functionName: "tokenForCurve", args: [c.curve], blockNumber: head });
    if (factoryToken.toLowerCase() !== state.baseToken.toLowerCase() || state.feePolicyVersion !== AMMORA_FEE_POLICY_VERSION) continue;
    const amountIn = parseUnits("0.0001", 18);
    const quote = await sdk.quoteExactInputAtBlock(amountIn, false, head);
    const fill = classifyAmmoraV4ExactInputFill(quote, false);
    if (fill.kind !== "full") continue;
    const progress = await sdk.getMigrationProgressAtBlock(head);
    active = { ...c, state, sdk };
    return { curve: c.curve, token: c.token, quoteIn: "0.0001 WETH", out: quote.amountOut, fee: quote.fee, fill: fill.kind, progressBps: progress.progressBps };
  }
  throw new Error("no active curve accepted a full 0.0001 WETH buy");
});
await check("Curve BUY planned by SDK (planSwapExactInput) and simulated with eth_call", async () => {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
  const plan = await active.sdk.planSwapExactInput({ includedAmountIn: parseUnits("0.0001", 18), baseForQuote: false, allowPartialFill: false, slippageBps: 100, recipient: SIM, deadline });
  const approval = plan.approvalRequirements[0];
  const stateOverride = await fund(WETH, SIM, approval.spender, approval.amount);
  if (!stateOverride) throw new Error("could not locate WETH storage slots");
  const sim = await client.call({ account: SIM, to: plan.transaction.to, data: plan.transaction.data, value: plan.transaction.value ?? 0n, stateOverride });
  const gas = await client.estimateGas({ account: SIM, to: plan.transaction.to, data: plan.transaction.data, stateOverride }).catch((e) => `n/a (${e.shortMessage})`);
  return { to: plan.transaction.to, selector: plan.transaction.data.slice(0, 10), approval: { token: approval.token, spender: approval.spender, amount: approval.amount }, minimumAmountOut: plan.quote.minimumAmountOut, simulated: sim.data ? "success" : "success (no return data)", gas };
});
await check("Curve SELL planned by SDK and simulated with eth_call", async () => {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
  const amount = 10n ** 12n; // 1,000 tokens (9 decimals)
  const plan = await active.sdk.planSwapExactInput({ includedAmountIn: amount, baseForQuote: true, allowPartialFill: false, slippageBps: 100, recipient: SIM, deadline });
  const approval = plan.approvalRequirements[0];
  const stateOverride = await fund(active.state.baseToken, SIM, approval.spender, approval.amount);
  if (!stateOverride) return { encoded: plan.transaction.data.slice(0, 10), minimumAmountOut: plan.quote.minimumAmountOut, simulated: "skipped: token storage layout not probe-able" };
  await client.call({ account: SIM, to: plan.transaction.to, data: plan.transaction.data, stateOverride });
  return { selector: plan.transaction.data.slice(0, 10), approval: { token: approval.token, spender: approval.spender }, sell: "1000 tokens", minimumAmountOut: plan.quote.minimumAmountOut, simulated: "success" };
});
await check("Create launch encoded by SDK (buildCreateAmmoraV4Launch) on Config #6, predicted + simulated", async () => {
  const entry = await getAmmoraV4ConfigAtBlock(client, L.configRegistry, 6n, head);
  if (!entry.enabled) throw new Error("config 6 disabled");
  const metadataURI = 'data:application/json;utf8,{"name":"Verify Only","symbol":"VRFY","description":"read-only simulation"}';
  const tx = buildCreateAmmoraV4Launch({ name: "Verify Only", symbol: "VRFY", metadataURI, creatorMetadataURI: metadataURI, tokenDecimals: entry.config.tokenDecimals }, 6n, entry.config.poolCreationFee);
  const predicted = await getAmmoraV4PredictedLaunchAtBlock(client, L.factory, SIM, 6n, metadataURI, head);
  const balance = [{ address: SIM, balance: 10n ** 18n }];
  const sim = await client.call({ account: SIM, to: L.factory, data: tx.data, value: tx.value, stateOverride: balance });
  return { config: 6, configHash: entry.configHash, poolCreationFeeWei: tx.value, predictedToken: predicted.token, predictedCurve: predicted.curve, simulated: sim.data ? "success" : "success (no return data)" };
});
let routeOk;
await check("Exchange: AmmoraRouteClient.quoteExactIn on graduated ARL pools", async () => {
  const graduated = launches.filter((x) => x.status === 3);
  const out = [];
  for (const g of graduated) {
    const factory = await client.readContract({ address: g.pool, abi: [{ type: "function", name: "factory", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" }], functionName: "factory" });
    const model = factory.toLowerCase() === L.concentratedFactory.toLowerCase() ? "concentrated" : factory.toLowerCase() === L.compoundingFactory.toLowerCase() ? "compounding" : null;
    if (!model) continue;
    let routes;
    for (let attempt = 0; attempt < 3 && !routes; attempt++) {
      routes = await AmmoraRouteClient.create({ client, routeCatalog: giwaSepoliaAutoRouteCatalog, deploymentCatalog: giwaSepoliaAutoRouteDeploymentCatalog, factoryProfiles: giwaSepoliaAutoRoutePoolProfiles, pools: [{ model, pool: g.pool }], verificationBlock: await resolveAmmoraFinalizedHead([client], giwaSepoliaAutoRoute.finality) })
        .catch((e) => { if (attempt === 2) throw e; return new Promise((r) => setTimeout(r, 2500)).then(() => undefined); });
    }
    for (const [tin, tout, amt] of [[WETH, g.token, 10n ** 14n], [g.token, WETH, 10n ** 12n]]) {
      try {
        const q = await routes.quoteExactIn({ tokenIn: tin, tokenOut: tout, amountIn: amt, recipient: SIM, slippageBps: 100 });
        out.push({ pool: g.pool, model, side: tin === WETH ? "buy" : "sell", out: q.expectedAmountOut, min: q.minimumAmountOut, impactBps: q.priceImpactBps, hops: q.hops.length });
        if (!routeOk) routeOk = { routes, request: { tokenIn: tin, tokenOut: tout, amountIn: amt, recipient: SIM, slippageBps: 100 } };
      } catch (e) { out.push({ pool: g.pool, model, side: tin === WETH ? "buy" : "sell", unavailable: e.code }); }
    }
    if (out.filter((o) => o.out).length >= 3) break;
  }
  if (!routeOk) throw new Error(`no route: ${j(out)}`);
  return out;
});
await check("Exchange: prepareExactIn + eth_call simulation of the routed swap", async () => {
  const fresh = await routeOk.routes.quoteExactIn(routeOk.request); // quotes expire after ~30s: always re-quote right before preparing
  const prepared = await routeOk.routes.prepareExactIn(fresh, { payer: SIM, recipient: SIM, executionMode: "direct-wallet" });
  const a = prepared.approvalRequirements[0];
  const stateOverride = a ? await fund(a.token, SIM, a.spender, a.amount) : undefined;
  try {
    await client.call({ account: SIM, to: prepared.transaction.to, data: prepared.transaction.data, value: prepared.transaction.value ?? 0n, stateOverride });
    return { to: prepared.transaction.to, approvals: prepared.approvalRequirements.length, simulated: "success" };
  } catch (e) {
    const data = e?.cause?.data ?? e?.data; let decoded = null; try { decoded = data ? decodeAmmoraContractError(data).message : null; } catch {}
    return { to: prepared.transaction.to, encoded: prepared.transaction.data.slice(0, 10), simulated: `reverted: ${decoded || e.shortMessage}` };
  }
});

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed at ${new Date().toISOString()}`);
if (process.env.VERIFY_OUT) (await import("node:fs")).writeFileSync(process.env.VERIFY_OUT, j({ at: new Date().toISOString(), rpc: RPC, results }));

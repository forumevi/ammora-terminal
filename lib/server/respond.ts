const replacer = (_: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);
export const json = (data: unknown, sMaxAge = 10, status = 200) =>
  new Response(JSON.stringify(data, replacer), {
    status,
    headers: { "content-type": "application/json", "cache-control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge * 4}` },
  });
export const fail = (e: unknown, status = 502) =>
  new Response(JSON.stringify({ error: (e as Error)?.message ?? String(e) }), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
export const isAddr = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a);

import { CONTRACTS, DOCS_URL, EXPLORER_URL, FAUCET_URL } from "@/lib/ammora/config";

export function Footer() {
  return (
    <footer className="border-t border-white/5 py-8 text-xs text-zinc-500">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          Built on <a className="text-zinc-300 hover:underline" href="https://www.npmjs.com/package/@ammora-protocol/sdk/v/0.3.9" target="_blank" rel="noreferrer">@ammora-protocol/sdk 0.3.9</a> · GIWA Sepolia (91342) · V4 auto-route ·
          LaunchFactory <a className="font-mono hover:underline" href={`${EXPLORER_URL}/address/${CONTRACTS.launchFactory}`} target="_blank" rel="noreferrer">{CONTRACTS.launchFactory.slice(0, 10)}…</a>
        </p>
        <p className="flex flex-wrap gap-4">
          <a className="hover:text-white" href={DOCS_URL} target="_blank" rel="noreferrer">Ammora docs</a>
          <a className="hover:text-white" href={FAUCET_URL} target="_blank" rel="noreferrer">GIWA faucet</a>
          <a className="hover:text-white" href={EXPLORER_URL} target="_blank" rel="noreferrer">Explorer</a>
          <a className="hover:text-white" href="https://github.com/forumevi/ammora-terminal" target="_blank" rel="noreferrer">Source</a>
          <span>Testnet software — no real funds.</span>
        </p>
      </div>
    </footer>
  );
}

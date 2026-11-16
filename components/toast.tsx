"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, ExternalLink, Info, Loader2, X, XCircle } from "lucide-react";
import { explorerTx } from "@/lib/ammora/config";

type Kind = "pending" | "success" | "error" | "info";
type Toast = { id: number; kind: Kind; title: string; body?: string; hash?: string };
type Ctx = { push: (t: Omit<Toast, "id">) => number; update: (id: number, t: Partial<Omit<Toast, "id">>) => void; dismiss: (id: number) => void };

const ToastCtx = createContext<Ctx | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const schedule = useCallback((id: number, kind: Kind) => {
    if (kind === "success" || kind === "info") setTimeout(() => dismiss(id), 9000);
  }, [dismiss]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = ++seq;
    setToasts((all) => [...all.slice(-4), { ...t, id }]);
    schedule(id, t.kind);
    return id;
  }, [schedule]);
  const update = useCallback((id: number, t: Partial<Omit<Toast, "id">>) => {
    setToasts((all) => all.map((x) => (x.id === id ? { ...x, ...t } : x)));
    if (t.kind) schedule(id, t.kind);
  }, [schedule]);
  return (
    <ToastCtx.Provider value={{ push, update, dismiss }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto animate-in rounded-xl border border-white/10 bg-[#0d1117]/95 p-3 shadow-2xl shadow-black/50 backdrop-blur">
            <div className="flex items-start gap-3">
              <span className="mt-0.5">
                {t.kind === "pending" && <Loader2 className="size-4 animate-spin text-sky-400" />}
                {t.kind === "success" && <CheckCircle2 className="size-4 text-emerald-400" />}
                {t.kind === "error" && <XCircle className="size-4 text-rose-400" />}
                {t.kind === "info" && <Info className="size-4 text-sky-400" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">{t.title}</p>
                {t.body && <p className="mt-0.5 break-words text-xs text-zinc-400">{t.body}</p>}
                {t.hash && (
                  <a href={explorerTx(t.hash)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-300 hover:underline">
                    View on GIWA explorer <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
              <button onClick={() => dismiss(t.id)} className="text-zinc-500 hover:text-white" aria-label="Dismiss"><X className="size-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => {
  const c = useContext(ToastCtx);
  if (!c) throw new Error("useToast outside ToastProvider");
  return c;
};

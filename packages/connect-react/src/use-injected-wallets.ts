"use client";
/** Browser wallets (EIP-6963) while `active`; `searching` is true for the first moments of discovery. */
import { useEffect, useState } from "react";
import { watchInjectedWallets, type InjectedWallet } from "@sanctum.ai/connect";

export function useInjectedWallets(active: boolean, settleMs = 400) {
  const [wallets, setWallets] = useState<InjectedWallet[]>([]);
  const [searching, setSearching] = useState(true);
  useEffect(() => {
    if (!active) return;
    const stop = watchInjectedWallets(setWallets, window);
    const settled = window.setTimeout(() => setSearching(false), settleMs);
    return () => {
      stop();
      window.clearTimeout(settled);
    };
  }, [active, settleMs]);
  return { wallets, searching: active && searching };
}

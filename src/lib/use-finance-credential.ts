"use client";
import { useEffect, useState } from "react";
import { getFinanceCredentialState, subscribeFinanceCredential, usesDefaultFinancePin, type FinanceCredentialState } from "./finance-credential";
export function useFinanceCredential() {
  const [state, setState] = useState<FinanceCredentialState | null>(null);
  const [defaultPin, setDefaultPin] = useState(false);
  useEffect(() => {
    const refresh = () => { setState(getFinanceCredentialState()); setDefaultPin(usesDefaultFinancePin()); };
    refresh();
    return subscribeFinanceCredential(refresh);
  }, []);
  return { state, defaultPin };
}

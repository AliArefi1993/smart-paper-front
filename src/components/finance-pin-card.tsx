"use client";
import { useEffect, useRef, useState } from "react";
import { changeFinancePin, FinancePinError, getFinanceCredentialState, subscribeFinanceCredential, financeCredentialRevision, type FinanceCredentialState, type FinancePinErrorCode } from "@/lib/finance-credential";
import type { TranslationKey } from "@/lib/i18n";
import { useLanguage } from "@/lib/use-language";
const errors: Record<FinancePinErrorCode, TranslationKey> = { currentRequired: "pinCurrentRequired", wrongCurrent: "pinWrongCurrent", invalidNew: "pinInvalidNew", samePin: "pinSamePin", mismatch: "pinMismatch", unavailable: "pinUnavailable", writeFailed: "pinWriteFailed", changed: "pinChanged", unreadable: "pinUnreadable", invalid: "pinInvalid" };
const buttonClass = "min-h-12 rounded-xl border border-[#b6c9bf] px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50";
export function FinancePinCard({ onBusyChange }: { onBusyChange: (busy: boolean) => void }) {
  const { t } = useLanguage();
  const [state, setState] = useState<FinanceCredentialState | null>(null);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(["", "", ""]);
  const [error, setError] = useState<FinancePinErrorCode | null>(null);
  const [message, setMessage] = useState<"pinSuccess" | "pinCancelled" | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const action = useRef<HTMLButtonElement>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  useEffect(() => {
    mounted.current = true;
    queueMicrotask(() => { if (mounted.current) setState(getFinanceCredentialState()); });
    if (window.location.hash === "#finance-pin") { queueMicrotask(() => { if (mounted.current) setOpen(true); }); heading.current?.focus(); heading.current?.scrollIntoView({ block: "start" }); }
    const unsubscribe = subscribeFinanceCredential(() => {
      setState(getFinanceCredentialState());
      setValues(["", "", ""]);
      if (!pending.current) { setError("changed"); setMessage(null); }
    });
    return () => { mounted.current = false; unsubscribe(); };
  }, []);
  async function save() {
    if (pending.current) return;
    const revision = financeCredentialRevision();
    pending.current = true; onBusyChange(true); setBusy(true); setError(null); setMessage(null);
    try {
      await changeFinancePin(values[0], values[1], values[2]);
      if (!mounted.current) return;
      if (financeCredentialRevision() !== revision + 1) throw new FinancePinError("changed");
      setValues(["", "", ""]); setOpen(false); setMessage("pinSuccess");
      requestAnimationFrame(() => feedback.current?.focus());
    } catch (failure) {
      if (!mounted.current) return;
      const code = financeCredentialRevision() !== revision
        ? "changed"
        : failure instanceof FinancePinError ? failure.code : "writeFailed";
      setError(code); setState(getFinanceCredentialState());
      if (code === "changed") setValues(["", "", ""]);
      const index = code === "mismatch" ? 2 : code === "invalidNew" || code === "samePin" ? 1 : 0;
      requestAnimationFrame(() => { inputs.current[index]?.focus(); feedback.current?.scrollIntoView({ block: "nearest" }); });
    } finally { pending.current = false; if (mounted.current) { setBusy(false); onBusyChange(false); } }
  }
  const damaged = state === "invalid" || state === "unreadable";
  return <section id="finance-pin" aria-busy={busy} className="mx-auto mt-6 w-full max-w-5xl rounded-2xl border border-[#d9e4de] bg-white p-5">
    <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold focus-visible:outline-2 focus-visible:outline-teal-700">{t("pinTitle")}</h2>
    <p className="mt-1 text-sm leading-6 text-[#536660]">{t("pinDescription")}</p>
    {damaged ? <><p role="alert" className="mt-4 text-sm text-rose-700">{t(state === "invalid" ? "pinInvalid" : "pinUnreadable")}</p><button type="button" className={`${buttonClass} mt-3`} onClick={() => { setState(getFinanceCredentialState()); setError(null); }}>{t("pinCheck")}</button></> : <>
      {open ? <form className="mt-4 max-w-xl" onSubmit={event => { event.preventDefault(); void save(); }}>
        <div className="space-y-2 text-sm leading-6 text-[#536660]" id="finance-pin-warnings">
          {(["pinLockWarning", "pinRecoveryWarning", "pinBackupWarning", "pinRelockWarning", "pinRule"] as const).map(key => <p key={key}>{t(key)}</p>)}
        </div>
        {(["pinCurrent", "pinNew", "pinConfirm"] as const).map((key, index) => <div key={key} className="mt-4">
          <label htmlFor={`finance-pin-${index}`} className="block text-sm font-semibold">{t(key)}</label>
          <input ref={node => { inputs.current[index] = node; }} id={`finance-pin-${index}`} type="password" dir="ltr" autoComplete="off" inputMode={index === 0 && state === "legacy" ? "text" : "numeric"} value={values[index]} disabled={busy}
            aria-invalid={!!error && (index === 0 ? error === "currentRequired" || error === "wrongCurrent" : index === 1 ? error === "invalidNew" || error === "samePin" : error === "mismatch")}
            aria-describedby={`finance-pin-warnings${error ? " finance-pin-feedback" : ""}`}
            onChange={event => { const value = event.target.value; setValues(previous => previous.map((item, itemIndex) => itemIndex === index ? value : item)); setError(null); }}
            className="mt-2 min-h-12 w-full rounded-xl border border-[#b6c9bf] px-4 py-3 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50" />
        </div>)}
        <div className="mt-4 flex flex-wrap gap-3"><button disabled={busy} type="submit" className={`${buttonClass} bg-[#21695c] text-white`}>{t(busy ? "pinSaving" : "pinSave")}</button>
          <button disabled={busy} type="button" className={buttonClass} onClick={() => { setValues(["", "", ""]); setOpen(false); setError(null); setMessage("pinCancelled"); requestAnimationFrame(() => action.current?.focus()); }}>{t("cancel")}</button></div>
        {busy ? <p role="status" className="mt-3 text-sm">{t("pinSaving")}</p> : null}
      </form> : message === "pinSuccess" ? <button type="button" className={`${buttonClass} mt-4`} onClick={() => { setMessage(null); requestAnimationFrame(() => action.current?.focus()); }}>{t("pinDone")}</button> : <button ref={action} type="button" disabled={!state} className={`${buttonClass} mt-4`} onClick={() => { setOpen(true); setMessage(null); setError(null); heading.current?.focus(); heading.current?.scrollIntoView({ block: "start" }); }}>{t("pinChange")}</button>}
      {!open ? <details className="mt-4 text-sm leading-6 text-[#536660]"><summary className="min-h-12 cursor-pointer py-3 font-semibold focus-visible:outline-2 focus-visible:outline-teal-700">{t("pinForgot")}</summary><p>{t("pinRecoveryWarning")}</p><p className="mt-2">{t("pinBackupWarning")}</p></details> : null}
    </>}
    {error ? <p ref={feedback} id="finance-pin-feedback" role="alert" tabIndex={-1} className="mt-4 text-sm text-rose-700">{t(errors[error])}</p> : message ? <p ref={feedback} tabIndex={-1} role="status" className="mt-4 text-sm text-emerald-800 focus-visible:outline-2 focus-visible:outline-teal-700">{t(message)}</p> : null}
  </section>;
}

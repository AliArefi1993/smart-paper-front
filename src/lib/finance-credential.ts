// This verifier gates screens; it does not encrypt local records or backups.
export const FINANCE_CREDENTIAL_KEY = "smart-paper.local.finance-credential.v1";
const ITERATIONS = 600_000;
type Credential = { version: 1; algorithm: "PBKDF2-SHA-256"; iterations: number; salt: string; verifier: string };
export type FinanceCredentialState = "legacy" | "custom" | "unreadable" | "invalid";
export type FinancePinErrorCode = "currentRequired" | "wrongCurrent" | "invalidNew" | "samePin" | "mismatch" | "unavailable" | "writeFailed" | "changed" | "unreadable" | "invalid";
export class FinancePinError extends Error {
  readonly code: FinancePinErrorCode;
  constructor(code: FinancePinErrorCode) { super(code); this.code = code; }
}
const listeners = new Set<() => void>();
let watching: Window | undefined;
let revision = 0;
let saving = false;
function storage(): Storage {
  try { return window.localStorage; } catch { throw new FinancePinError("unreadable"); }
}
export function readFinanceCredentialSnapshot(): string | null {
  try { return storage().getItem(FINANCE_CREDENTIAL_KEY); } catch { throw new FinancePinError("unreadable"); }
}
function parse(raw: string): Credential {
  try {
    const value = JSON.parse(raw);
    if (!value || Object.keys(value).sort().join(",") !== "algorithm,iterations,salt,verifier,version" ||
      value.version !== 1 || value.algorithm !== "PBKDF2-SHA-256" || value.iterations !== ITERATIONS ||
      typeof value.salt !== "string" || value.salt.length !== 32 || !/^[0-9a-f]{32}$/.test(value.salt) ||
      typeof value.verifier !== "string" || value.verifier.length !== 64 || !/^[0-9a-f]{64}$/.test(value.verifier)) throw 0;
    return value;
  } catch { throw new FinancePinError("invalid"); }
}
export function getFinanceCredentialState(): FinanceCredentialState {
  try { const raw = readFinanceCredentialSnapshot(); if (raw === null) return "legacy"; parse(raw); return "custom"; }
  catch (error) { return error instanceof FinancePinError && error.code === "invalid" ? "invalid" : "unreadable"; }
}
export function usesDefaultFinancePin(): boolean {
  return getFinanceCredentialState() === "legacy" && (process.env.NEXT_PUBLIC_FINANCE_PIN ?? "1234") === "1234";
}
export function normalizeFinancePin(pin: string): string {
  return pin.replace(/[۰-۹٠-٩]/g, digit => String(digit.charCodeAt(0) - (digit >= "۰" ? 0x6f0 : 0x660)));
}
function cryptoApi(): Crypto {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) throw new FinancePinError("unavailable");
  return globalThis.crypto;
}
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
async function derive(pin: string, salt: string): Promise<string> {
  try {
    const api = cryptoApi();
    const key = await api.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
    const bytes = Uint8Array.from(salt.match(/../g)!, pair => parseInt(pair, 16));
    return hex(new Uint8Array(await api.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: bytes, iterations: ITERATIONS }, key, 256)));
  } catch { throw new FinancePinError("unavailable"); }
}
export async function verifyFinancePin(pin: string, raw = readFinanceCredentialSnapshot()): Promise<boolean> {
  if (raw === null) return pin === (process.env.NEXT_PUBLIC_FINANCE_PIN ?? "1234");
  const credential = parse(raw);
  const normalized = normalizeFinancePin(pin);
  if (normalized.length < 4 || normalized.length > 12 || /[^0-9]/.test(normalized)) return false;
  const result = await derive(normalized, credential.salt);
  let difference = 0;
  for (let index = 0; index < result.length; index++) difference |= result.charCodeAt(index) ^ credential.verifier.charCodeAt(index);
  return difference === 0;
}
export function notifyFinanceCredentialChanged(): void {
  revision++;
  // A consumer's rendering failure must never prevent the other consumers relocking.
  for (const listener of listeners) { try { listener(); } catch { /* continue revocation */ } }
}
export function subscribeFinanceCredential(listener: () => void): () => void {
  listeners.add(listener);
  if (typeof window !== "undefined" && watching !== window && window.addEventListener) {
    watching = window;
    window.addEventListener("storage", event => {
      if (event.key === FINANCE_CREDENTIAL_KEY || event.key === null) notifyFinanceCredentialChanged();
    });
  }
  return () => { listeners.delete(listener); };
}
export function financeCredentialRevision(): number { return revision; }
export async function changeFinancePin(current: string, next: string, confirmation: string): Promise<void> {
  if (saving) throw new FinancePinError("changed");
  saving = true;
  try {
    const commit = async () => {
      const snapshot = readFinanceCredentialSnapshot();
      if (snapshot !== null) parse(snapshot);
      if (!current) throw new FinancePinError("currentRequired");
      const normalized = normalizeFinancePin(next);
      if (normalized.length < 4 || normalized.length > 12 || /[^0-9]/.test(normalized)) throw new FinancePinError("invalidNew");
      if (normalized !== normalizeFinancePin(confirmation)) throw new FinancePinError("mismatch");
      if (!await verifyFinancePin(current, snapshot)) throw new FinancePinError("wrongCurrent");
      if (await verifyFinancePin(normalized, snapshot)) throw new FinancePinError("samePin");
      const salt = hex(cryptoApi().getRandomValues(new Uint8Array(16)));
      const credential: Credential = { version: 1, algorithm: "PBKDF2-SHA-256", iterations: ITERATIONS, salt, verifier: await derive(normalized, salt) };
      // Reauthenticate against the exact persisted snapshot at the write boundary.
      if (readFinanceCredentialSnapshot() !== snapshot) { notifyFinanceCredentialChanged(); throw new FinancePinError("changed"); }
      try { storage().setItem(FINANCE_CREDENTIAL_KEY, JSON.stringify(credential)); }
      catch { throw new FinancePinError("writeFailed"); }
      notifyFinanceCredentialChanged();
    };
    // Web Locks serializes commits across cooperating windows; no PIN enters lock metadata.
    if (typeof navigator !== "undefined" && navigator.locks) await navigator.locks.request(FINANCE_CREDENTIAL_KEY, commit);
    else throw new FinancePinError("unavailable");
  } finally { saving = false; }
}

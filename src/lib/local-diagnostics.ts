// Automatic evidence is reconstructed from these closed vocabularies only.
export const DIAGNOSTIC_ROUTES = ["planner", "ideas", "timer", "finance", "summaries", "export", "settings", "unknown"] as const;
export const DIAGNOSTIC_ACTIONS = ["load", "save", "import", "export", "share", "runtime"] as const;
export const DIAGNOSTIC_ERROR_CODES = ["LOCAL_READ_FAILED", "LOCAL_SAVE_FAILED", "IMPORT_FAILED", "EXPORT_FAILED", "SHARE_FAILED", "JS_RUNTIME_ERROR", "JS_UNHANDLED_REJECTION"] as const;
export const DIAGNOSTIC_FLOWS = ["save", "import", "export", "share"] as const;
export const DIAGNOSTIC_OUTCOMES = ["completed", "failed", "cancelled", "chooser-returned"] as const;
export type DiagnosticRoute = typeof DIAGNOSTIC_ROUTES[number];
export type DiagnosticAction = typeof DIAGNOSTIC_ACTIONS[number];
export type DiagnosticErrorCode = typeof DIAGNOSTIC_ERROR_CODES[number];
export type DiagnosticFlow = typeof DIAGNOSTIC_FLOWS[number];
export type DiagnosticOutcome = typeof DIAGNOSTIC_OUTCOMES[number];
export type DiagnosticCategory = "errors" | "usage";
export type DiagnosticPreferences = { errors: boolean; usage: boolean; unavailable: boolean };
export type DiagnosticErrorRecord = { day: string; route: DiagnosticRoute; action: DiagnosticAction; code: DiagnosticErrorCode };
export type DiagnosticUsageDay = { day: string; routes: Partial<Record<DiagnosticRoute, number>>; flows: Partial<Record<DiagnosticFlow, Partial<Record<DiagnosticOutcome, number>>>> };
export type DiagnosticData = { errors: DiagnosticErrorRecord[]; usage: DiagnosticUsageDay[] };
export type DiagnosticReportInput = { appVersion: string | null; platform: "android" | "web"; language: "en" | "fa"; description?: string; includeErrors?: boolean; includeUsage?: boolean };
export type DiagnosticReport = { header: { schemaVersion: 1; appVersion: string; platform: "android" | "web"; dataMode: "local"; language: "en" | "fa" }; description: string; errors?: DiagnosticErrorRecord[]; usage?: DiagnosticUsageDay[]; limitations: string };
export const DIAGNOSTIC_PREFERENCES_KEY = "smart-paper.diagnostics.preferences.v1";
export const DIAGNOSTIC_DATA_KEY = "smart-paper.diagnostics.data.v1";
export const DIAGNOSTIC_MAX_BYTES = 128 * 1024;
export const DIAGNOSTIC_MAX_ERRORS = 200;
export const DIAGNOSTIC_RETENTION_DAYS = 14;
const MAX_COUNT = 999999;
const LIMITATIONS = "Local errors are incomplete: native crashes, process termination and startup failures may leave no record. Records expire after 14 calendar days; at most 200 errors and 128 KiB of evidence are retained. Opening an email draft or copying a report does not confirm delivery.";
type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const member = <T extends string>(values: readonly T[], value: unknown): value is T => typeof value === "string" && values.includes(value as T);
const bytes = (value: string) => new TextEncoder().encode(value).length;
const count = (value: unknown): number => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? Math.min(value, MAX_COUNT) : 0;
const dayOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

export function createLocalDiagnostics(storage: StoragePort, now: () => Date = () => new Date()) {
  function persist(key: string, value: unknown) {
    const serialized = JSON.stringify(value);
    storage.setItem(key, serialized);
    if (storage.getItem(key) !== serialized) throw new Error("Diagnostics storage unavailable");
  }
  const blockedPreferences = new Set<DiagnosticCategory>();
  function storedPreferences(repairInvalid = false): { errors: boolean; usage: boolean } {
    const raw = storage.getItem(DIAGNOSTIC_PREFERENCES_KEY);
    if (raw === null) { persist(DIAGNOSTIC_PREFERENCES_KEY, { errors: true, usage: true }); return { errors: true, usage: true }; }
    let prefs: Record<string, unknown> | null = null;
    try { if (raw.length <= 256) prefs = object(JSON.parse(raw)); } catch { /* Explicit retry may repair malformed preferences. */ }
    if (!prefs || typeof prefs.errors !== "boolean" || typeof prefs.usage !== "boolean") {
      if (repairInvalid) return { errors: prefs?.errors === true, usage: prefs?.usage === true };
      throw new Error("Invalid diagnostics preferences");
    }
    return { errors: prefs.errors, usage: prefs.usage };
  }
  function readDiagnosticPreferences(): DiagnosticPreferences {
    try {
      const prefs = storedPreferences();
      return { errors: prefs.errors && !blockedPreferences.has("errors"), usage: prefs.usage && !blockedPreferences.has("usage"), unavailable: blockedPreferences.size > 0 };
    } catch { return { errors: false, usage: false, unavailable: true }; }
  }
  function setDiagnosticPreference(category: DiagnosticCategory, enabled: boolean) {
    if (!member(["errors", "usage"], category) || typeof enabled !== "boolean") throw new Error("Invalid diagnostics preference");
    try {
      const prefs = storedPreferences(true);
      persist(DIAGNOSTIC_PREFERENCES_KEY, { errors: category === "errors" ? enabled : prefs.errors, usage: category === "usage" ? enabled : prefs.usage });
      blockedPreferences.delete(category);
    } catch {
      blockedPreferences.add(category);
      throw new Error("Diagnostics preferences unavailable");
    }
  }
  function validDay(value: unknown): value is string {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return false;
    const oldest = new Date(now()); oldest.setDate(oldest.getDate() - DIAGNOSTIC_RETENTION_DAYS + 1);
    return value >= dayOf(oldest) && value <= dayOf(now());
  }
  function bound(data: DiagnosticData): DiagnosticData {
    data.errors.sort((a, b) => a.day.localeCompare(b.day));
    data.errors = data.errors.slice(-DIAGNOSTIC_MAX_ERRORS);
    data.usage.sort((a, b) => a.day.localeCompare(b.day));
    while (bytes(JSON.stringify(data)) > DIAGNOSTIC_MAX_BYTES) {
      if (data.errors.length && (!data.usage.length || data.errors[0].day <= data.usage[0].day)) data.errors.shift(); else data.usage.shift();
    }
    return data;
  }
  function load(): DiagnosticData {
    const raw = storage.getItem(DIAGNOSTIC_DATA_KEY);
    if (raw === null) return { errors: [], usage: [] };
    if (raw.length > DIAGNOSTIC_MAX_BYTES || bytes(raw) > DIAGNOSTIC_MAX_BYTES) throw new Error("Diagnostics store exceeds limits");
    const parsed = object(JSON.parse(raw));
    if (!parsed || !Array.isArray(parsed.errors) || !Array.isArray(parsed.usage)) throw new Error("Invalid diagnostics store");
    const data: DiagnosticData = { errors: [], usage: [] };
    for (const item of parsed.errors) {
      const row = object(item);
      if (row && validDay(row.day) && member(DIAGNOSTIC_ROUTES, row.route) && member(DIAGNOSTIC_ACTIONS, row.action) && member(DIAGNOSTIC_ERROR_CODES, row.code)) data.errors.push({ day: row.day, route: row.route, action: row.action, code: row.code });
    }
    const days = new Map<string, DiagnosticUsageDay>();
    for (const item of parsed.usage) {
      const row = object(item);
      if (!row || !validDay(row.day)) continue;
      const bucket = days.get(row.day) ?? { day: row.day, routes: {}, flows: {} };
      const routes = object(row.routes); const flows = object(row.flows);
      for (const route of DIAGNOSTIC_ROUTES) { const n = count(routes?.[route]); if (n) bucket.routes[route] = Math.min(MAX_COUNT, (bucket.routes[route] ?? 0) + n); }
      for (const flow of DIAGNOSTIC_FLOWS) for (const outcome of DIAGNOSTIC_OUTCOMES) {
        if (outcome === "chooser-returned" && flow !== "share") continue;
        const n = count(object(flows?.[flow])?.[outcome]);
        if (n) { bucket.flows[flow] ??= {}; bucket.flows[flow]![outcome] = Math.min(MAX_COUNT, (bucket.flows[flow]![outcome] ?? 0) + n); }
      }
      days.set(row.day, bucket);
    }
    data.usage = [...days.values()]; return bound(data);
  }
  function save(data: DiagnosticData) { persist(DIAGNOSTIC_DATA_KEY, bound(data)); }
  function saveRecording(data: DiagnosticData) {
    // Quota pressure can shed only our own evidence, with a bounded retry count.
    for (let attempt = 0; attempt < 10; attempt++) {
      try { save(data); return; } catch {
        if (!data.errors.length && !data.usage.length) return;
        const total = data.errors.length + data.usage.length;
        for (let remove = Math.max(1, Math.ceil(total / 2)); remove > 0; remove--) {
          if (data.errors.length && (!data.usage.length || data.errors[0].day <= data.usage[0].day)) data.errors.shift(); else data.usage.shift();
        }
      }
    }
  }
  function inspectLocalDiagnostics(): DiagnosticData { const data = load(); save(data); return data; }
  function deleteLocalDiagnostics(category: DiagnosticCategory | "all") {
    if (!member(["errors", "usage", "all"], category)) throw new Error("Invalid diagnostics category");
    if (category === "all") {
      storage.removeItem(DIAGNOSTIC_DATA_KEY);
      if (storage.getItem(DIAGNOSTIC_DATA_KEY) !== null) throw new Error("Diagnostics deletion failed");
      return;
    }
    const data = load(); data[category] = []; save(data);
  }
  function recordLocalError(input: { route: DiagnosticRoute; action: DiagnosticAction; code: DiagnosticErrorCode }) {
    try {
      if (!readDiagnosticPreferences().errors) return;
      const row = object(input);
      if (!row || !member(DIAGNOSTIC_ROUTES, row.route) || !member(DIAGNOSTIC_ACTIONS, row.action) || !member(DIAGNOSTIC_ERROR_CODES, row.code)) return;
      const data = load(); data.errors.push({ day: dayOf(now()), route: row.route, action: row.action, code: row.code }); saveRecording(data);
    } catch { /* Diagnostics never change primary operation outcomes. */ }
  }
  function recordUsage(update: (bucket: DiagnosticUsageDay) => void) {
    try {
      if (!readDiagnosticPreferences().usage) return;
      const data = load(); const day = dayOf(now());
      let bucket = data.usage.find(row => row.day === day);
      if (!bucket) { bucket = { day, routes: {}, flows: {} }; data.usage.push(bucket); }
      update(bucket); saveRecording(data);
    } catch { /* No recursive error recording. */ }
  }
  function recordRouteUse(route: DiagnosticRoute) {
    if (!member(DIAGNOSTIC_ROUTES, route) || route === "unknown") return;
    recordUsage(bucket => { bucket.routes[route] = Math.min(MAX_COUNT, (bucket.routes[route] ?? 0) + 1); });
  }
  function recordFlowOutcome(flow: DiagnosticFlow, outcome: DiagnosticOutcome) {
    if (!member(DIAGNOSTIC_FLOWS, flow) || !member(DIAGNOSTIC_OUTCOMES, outcome) || (outcome === "chooser-returned" && flow !== "share")) return;
    recordUsage(bucket => { bucket.flows[flow] ??= {}; bucket.flows[flow]![outcome] = Math.min(MAX_COUNT, (bucket.flows[flow]![outcome] ?? 0) + 1); });
  }
  function prepareLocalDiagnosticReport(input: DiagnosticReportInput): DiagnosticReport {
    if (!member(["android", "web"], input.platform) || !member(["en", "fa"], input.language)) throw new Error("Invalid report context");
    const description = input.description ?? "";
    if (typeof description !== "string" || description.length > 4000) throw new Error("Report description exceeds 4000 characters");
    const version = typeof input.appVersion === "string" && /^[0-9A-Za-z.+_-]{1,80}$/.test(input.appVersion) ? input.appVersion : "unavailable";
    const report: DiagnosticReport = { header: { schemaVersion: 1, appVersion: version, platform: input.platform, dataMode: "local", language: input.language }, description, limitations: LIMITATIONS };
    if (input.includeErrors || input.includeUsage) {
      const data = inspectLocalDiagnostics();
      if (input.includeErrors) report.errors = data.errors;
      if (input.includeUsage) report.usage = data.usage;
    }
    return freeze(report);
  }
  return { readDiagnosticPreferences, setDiagnosticPreference, inspectLocalDiagnostics, deleteLocalDiagnostics, recordLocalError, recordRouteUse, recordFlowOutcome, prepareLocalDiagnosticReport };
}

// Resolve lazily: backend mode and server rendering never touch browser storage.
let disclosureShown = false;
let browserStore: Storage | undefined;
let browserInstance: ReturnType<typeof createLocalDiagnostics> | undefined;
export function activateLocalDiagnosticsAfterDisclosure() { disclosureShown = true; }
function browserDiagnostics() {
  if (!disclosureShown || process.env.NEXT_PUBLIC_DATA_MODE !== "local" || typeof window === "undefined") throw new Error("Local diagnostics unavailable");
  const storage = window.localStorage;
  if (browserStore !== storage || !browserInstance) { browserStore = storage; browserInstance = createLocalDiagnostics(storage); }
  return browserInstance;
}
export function readDiagnosticPreferences(): DiagnosticPreferences { try { return browserDiagnostics().readDiagnosticPreferences(); } catch { return { errors: false, usage: false, unavailable: true }; } }
export function setDiagnosticPreference(category: DiagnosticCategory, enabled: boolean) { browserDiagnostics().setDiagnosticPreference(category, enabled); }
export function inspectLocalDiagnostics() { return browserDiagnostics().inspectLocalDiagnostics(); }
export function deleteLocalDiagnostics(category: DiagnosticCategory | "all") { browserDiagnostics().deleteLocalDiagnostics(category); }
export function recordLocalError(input: { route: DiagnosticRoute; action: DiagnosticAction; code: DiagnosticErrorCode }) { try { browserDiagnostics().recordLocalError(input); } catch {} }
export function recordRouteUse(route: DiagnosticRoute) { try { browserDiagnostics().recordRouteUse(route); } catch {} }
export function recordFlowOutcome(flow: DiagnosticFlow, outcome: DiagnosticOutcome) { try { browserDiagnostics().recordFlowOutcome(flow, outcome); } catch {} }
export function prepareLocalDiagnosticReport(input: DiagnosticReportInput) { return browserDiagnostics().prepareLocalDiagnosticReport(input); }
export function formatLocalDiagnosticReport(report: DiagnosticReport): string { return JSON.stringify(report, null, 2); }

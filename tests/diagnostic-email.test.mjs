import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const transportPath = new URL("../src/lib/diagnostic-email.ts", import.meta.url);
const source = await readFile(transportPath, "utf8");
const capacitorStub = `data:text/javascript;base64,${Buffer.from(
  "export const registerPlugin = () => ({ openDraft: async () => {} }); export const Capacitor = { isNativePlatform: () => false };",
).toString("base64")}`;
const compiled = ts.transpile(source, {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
}).replaceAll('from "@capacitor/core"', `from "${capacitorStub}"`).replaceAll('import("@capacitor/core")', `import("${capacitorStub}")`);
const transportUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
const { SUPPORT_EMAIL, buildDiagnosticMailtoUri, openDiagnosticEmail, copyDiagnosticReport } = await import(transportUrl);

test("browser mailto URI fixes destination and encodes subject and reviewed Unicode body", () => {
  assert.equal(SUPPORT_EMAIL, "arefi.ali90@gmail.com");
  assert.equal(
    buildDiagnosticMailtoUri("سلام & ? # = % + !'()*\n"),
    "mailto:arefi.ali90@gmail.com?subject=Smart%20Paper%20problem%20report&body=%D8%B3%D9%84%D8%A7%D9%85%20%26%20%3F%20%23%20%3D%20%25%20%2B%20%21%27%28%29%2A%0A",
  );
});

test("oversized reports reject without truncation", () => {
  const oversized = "x".repeat(131073);
  assert.throws(() => buildDiagnosticMailtoUri(oversized), /too long/);
  assert.equal(oversized.length, 131073);
});

test("browser handoff is labeled unconfirmed and does not accept address overrides", async () => {
  const originalWindow = globalThis.window;
  let assigned;
  globalThis.window = { location: { set href(value) { assigned = value; } } };
  try {
    const result = await openDiagnosticEmail("Reviewed report");
    assert.equal(result, "handoff-unconfirmed");
    assert.equal(assigned, buildDiagnosticMailtoUri("Reviewed report"));
    assert.equal(assigned.includes("to="), false);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("copy returns success or failure from browser clipboard without changing text", async () => {
  const originalNavigator = globalThis.navigator;
  let copied;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { clipboard: { writeText: async (text) => { copied = text; } } },
  });
  try {
    const content = "Exact preview — سلام";
    assert.equal(await copyDiagnosticReport(content), true);
    assert.equal(copied, content);
    globalThis.navigator.clipboard.writeText = async () => { throw new Error("clipboard denied"); };
    assert.equal(await copyDiagnosticReport(content), false);
  } finally {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator });
  }
});

test("native source fixes recipient, subject, intent, limit and static errors without logging body", async () => {
  const nativePath = new URL("../android/app/src/main/java/com/aliarefi/smartpaper/EmailReportPlugin.java", import.meta.url);
  const mainPath = new URL("../android/app/src/main/java/com/aliarefi/smartpaper/MainActivity.java", import.meta.url);
  const nativeSource = await readFile(nativePath, "utf8");
  const mainSource = await readFile(mainPath, "utf8");
  assert.match(nativeSource, /@CapacitorPlugin\(name = "DiagnosticEmailPlugin"\)/);
  assert.match(nativeSource, /mailto:" \+ SUPPORT_EMAIL/);
  assert.match(nativeSource, /private static final String SUPPORT_EMAIL = "arefi\.ali90@gmail\.com"/);
  assert.match(nativeSource, /private static final String EMAIL_SUBJECT = "Smart Paper problem report"/);
  assert.match(nativeSource, /MAX_EMAIL_BODY_CHARS = 131072/);
  assert.match(nativeSource, /Intent\.ACTION_SENDTO/);
  assert.match(nativeSource, /"\?subject=" \+ Uri\.encode\(EMAIL_SUBJECT\)/);
  assert.match(nativeSource, /"&body=" \+ Uri\.encode\(body\)/);
  assert.doesNotMatch(nativeSource, /buildUpon|appendQueryParameter/);
  assert.match(nativeSource, /activity\.runOnUiThread\(\(\) ->/);
  assert.match(nativeSource, /exception instanceof ActivityNotFoundException \|\| exception instanceof SecurityException/);
  assert.match(nativeSource, /No email app is available to open this draft/);
  assert.doesNotMatch(nativeSource, /Log\.|getLocalizedMessage|getMessage|printStackTrace/);
  assert.match(mainSource, /registerPlugin\(EmailReportPlugin\.class\);\s*super\.onCreate/);
});

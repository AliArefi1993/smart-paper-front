import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as notesLib from "../src/lib/idea-notes.ts";
import * as draftLib from "../src/lib/idea-draft.ts";
import * as readerLib from "../src/lib/idea-reader.ts";

const timestamp = "2026-10-01T10:00:00Z";
const note = (id, parent_id = null, created_at = timestamp, body = "Same prose") => ({ id, parent_id, created_at, updated_at: created_at, body });
const records = [note("root", null, timestamp, "Needle"), note("b", "root"), note("a", "root"), note("late", "root", "2026-10-02T10:00:00Z"), note("orphan", "gone"), note("self", "self"), note("x", "y"), note("y", "x")];

test("direct relationships retain duplicate prose, order by instant then ID and never recurse or repair", () => {
  const before = JSON.stringify(records);
  assert.deepEqual(readerLib.ideaRelationships(records, "root").children.map(n => n.id), ["a", "b", "late"]);
  assert.equal(readerLib.ideaRelationships(records, "orphan").origin, null);
  const self = readerLib.ideaRelationships(records, "self");
  assert.equal(self.origin, null); assert.deepEqual(self.children, []);
  assert.equal(readerLib.ideaRelationships(records, "x").origin.id, "y");
  assert.deepEqual(readerLib.ideaRelationships(records, "x").children.map(n => n.id), ["y"]);
  assert.equal(readerLib.ideaRelationships(records, "gone").note, null);
  const offsets = [note("r"), note("later", "r", "2026-10-01T08:00:00-03:00"), note("earlier", "r", "2026-10-01T10:00:00Z")];
  assert.deepEqual(readerLib.ideaRelationships(offsets, "r").children.map(n => n.id), ["earlier", "later"]);
  assert.equal(JSON.stringify(records), before);
});

test("viewing history records deliberate repeated cycle steps and Back removes only one step", () => {
  let path = ["x"];
  path = readerLib.hopIdeaReader(path, "y"); path = readerLib.hopIdeaReader(path, "x");
  assert.deepEqual(path, ["x", "y", "x"]);
  assert.deepEqual(readerLib.backIdeaReader(path), ["x", "y"]);
  assert.deepEqual(readerLib.backIdeaReader(["x"]), []);
});

// Execute the actual IdeaSpace handlers with isolated React hooks and synthetic storage.
// Native focus/dialog rendering is covered separately by browser QA, not this harness.
function harness(savedDraft, { cleanup = false, writeFailure = false } = {}) {
  const values = new Map([[notesLib.IDEA_NOTES_KEY, JSON.stringify(records)], [draftLib.IDEA_DRAFT_KEY, draftLib.IDEA_DRAFT_PREFIX + JSON.stringify(savedDraft)]]);
  let writes = 0, index = 0, slots = [], effects = [], tree; let clock = "2026-10-13T12:00:00Z";
  class TestDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } }
  const listeners = new Map(); const frames = []; const scrolls = []; let confirm = false;
  const storage = { getItem: k => values.get(k) ?? null, setItem(k,v) { if (writeFailure && k === draftLib.IDEA_DRAFT_KEY) throw Error("write denied"); writes++; values.set(k,v); }, removeItem(k) { if (cleanup) throw Error("cleanup denied"); writes++; values.delete(k); } };
  const react = {
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = index++; slots[i] ??= { current: initial }; return slots[i]; },
    useMemo(fn) { index++; return fn(); },
    useEffect(fn, deps) { const i = index++; const old = slots[i]; if (!old || deps.some((d,j) => d !== old[j])) effects.push(fn); slots[i] = deps; },
  };
  const jsx = (type, props) => ({ type, props });
  const window = { localStorage: storage, scrollX: 7, scrollY: 310, setTimeout: fn => { frames.push(fn); return frames.length; }, clearTimeout() {}, requestAnimationFrame: fn => frames.push(fn), scrollTo: opts => scrolls.push(opts), confirm: () => typeof confirm === "function" ? confirm() : confirm, addEventListener: (n,fn) => listeners.set(n,fn), removeEventListener: n => listeners.delete(n) };
  const context = { exports: {}, Date: TestDate, window, process: { env: { NEXT_PUBLIC_DATA_MODE: "local" } }, console, require: name => {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
    if (name === "@/lib/idea-notes") return notesLib;
    if (name === "@/lib/idea-draft") return draftLib;
    if (name === "@/lib/idea-reader") return readerLib;
    if (name === "@/lib/use-language") return { useLanguage: () => ({ isPersian: false, language: "en", t: key => key }) };
    if (name === "@/components/idea-reader") return { IdeaReader: "reader" };
    return { default: "link", LanguageToggle: "language", AppearanceToggle: "appearance" };
  } };
  const source = ts.transpileModule(readFileSync(new URL("../src/components/idea-space.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, context);
  const render = () => { index = 0; tree = context.exports.IdeaSpace(); const work = effects; effects = []; work.forEach(fn => fn()); return tree; };
  const all = () => { const found = []; const walk = n => { if (!n || typeof n !== "object") return; if (Array.isArray(n)) { n.forEach(walk); return; } found.push(n); walk(n.props?.children); }; walk(tree); return found; };
  render(); while (frames.length) frames.shift()(); render();
  return { render, all, values, storage, advanceDay: () => { clock = "2026-10-14T12:00:00Z"; }, writes: () => writes, reader: () => all().find(n => n.type === "reader"), draft: () => slots.find(s => s?.version === 1 && "mode" in s), frames, scrolls, listeners, confirm: value => { confirm = value; } };
}

test("actual read handlers preserve exact full draft and storage through outside-query hops, cycles and return for every composer mode", () => {
  for (const mode of ["new", "edit", "branch"]) {
    for (const receipt of [null, note("pending", mode === "branch" ? "root" : null, timestamp, "فکر ناتمام\nMixed writing")]) {
      const source = mode === "new" ? null : note("root");
      const validReceipt = mode === "edit" && receipt ? { ...receipt, id: "root" } : receipt;
      const draft = { version: 1, mode, body: "  فکر ناتمام\nMixed writing  ", source, receipt: validReceipt };
      const h = harness(draft); const serialized = JSON.stringify(h.draft()); const storageBefore = [...h.values]; const writesBefore = h.writes();
      const search = h.all().find(n => n.props?.id === "ideas-search"); search.props.onChange({ target: { value: "  Needle  " } }); h.render();
      const trigger = { isConnected: true, focus(opts) { this.focused = opts; } };
      const open = h.all().find(n => n.type === "button" && n.props["aria-label"]?.startsWith("Open saved thought"));
      open.props.onClick({ currentTarget: trigger }); h.render();
      const entryId = h.reader().props.path[0];
      h.reader().props.onHop("orphan"); h.render(); assert.equal(h.reader().props.path.at(-1), "orphan");
      h.reader().props.onHop("x"); h.render(); h.reader().props.onHop("y"); h.render(); h.reader().props.onHop("x"); h.render();
      h.reader().props.onBack(); h.render(); assert.equal(h.reader().props.path.at(-1), "y");
      assert.equal(h.reader().props.path[0], entryId); assert.equal(JSON.stringify(h.draft()), serialized);
      h.reader().props.onExit(); h.render(); while (h.frames.length) h.frames.shift()();
      assert.equal(h.reader(), undefined); assert.equal(JSON.stringify(h.draft()), serialized);
      assert.equal(h.all().find(n => n.props?.id === "ideas-search").props.value, "  Needle  ");
      assert.deepEqual([...h.values], storageBefore); assert.equal(h.writes(), writesBefore);
      assert.equal(trigger.focused.preventScroll, true); assert.equal(h.scrolls.at(-1).top, 310);
    }
  }
});

test("actual reader selection decline and cleanup guard retain reader; deleted/updated targets resolve from current saved records", () => {
  const draft = { ...draftLib.newIdeaDraft("  retained  "), mode: "branch", source: records[0] };
  const h = harness(draft);
  const trigger = { isConnected: true, focus() {} };
  h.all().find(n => n.type === "button" && n.props["aria-label"]?.startsWith("Open saved thought")).props.onClick({ currentTarget: trigger }); h.render();
  const id = h.reader().props.path[0]; const before = JSON.stringify(h.draft()); const writes = h.writes();
  h.reader().props.onSelect(id, "edit"); h.render(); assert.ok(h.reader()); assert.equal(JSON.stringify(h.draft()), before); assert.equal(h.writes(), writes);
  h.values.set(notesLib.IDEA_NOTES_KEY, JSON.stringify(records.filter(n => n.id !== id)));
  h.listeners.get("storage")({ storageArea: { unrelated: true }, key: notesLib.IDEA_NOTES_KEY }); h.render();
  h.reader().props.onSelect(id, "edit"); h.render(); assert.ok(h.reader()); assert.equal(readerLib.ideaRelationships(h.reader().props.notes, id).note, null); assert.equal(JSON.stringify(h.draft()), before);
  const committedNote = note("receipt", null, timestamp, "saved");
  const c = harness({ ...draftLib.newIdeaDraft("saved"), receipt: committedNote }, { cleanup: true });
  c.values.set(notesLib.IDEA_NOTES_KEY, JSON.stringify([...records, committedNote]));
  c.all().find(n => n.type === "button" && n.props["aria-label"]?.startsWith("Open saved thought")).props.onClick({ currentTarget: trigger }); c.render();
  c.reader().props.onSelect("root", "branch"); c.render(); assert.ok(c.reader()); assert.equal(c.draft().receipt.id, "receipt");
});

test("actual recovery write failure and cleanup-pending pure reading retain warnings, receipt and full draft", () => {
  for (const options of [{ writeFailure: true }, { cleanup: true }]) {
    const saved = options.cleanup ? { ...draftLib.newIdeaDraft("Needle"), receipt: records[0] } : draftLib.newIdeaDraft("initial");
    const h = harness(saved, options);
    if (options.writeFailure) {
      h.all().find(n => n.props?.id === "idea-body").props.onChange({ target: { value: "  فکر ناتمام\nMixed writing  " } }); h.render();
    }
    const before = JSON.stringify(h.draft()); const alerts = JSON.stringify(h.all().filter(n => n.props?.role === "alert")); const values = [...h.values]; const writes = h.writes();
    const trigger = { isConnected: true, focus() {} };
    h.all().find(n => n.type === "button" && n.props["aria-label"]?.startsWith("Open daily thought")).props.onClick({ currentTarget: trigger }); h.render();
    assert.equal(h.reader().props.entry, "daily");
    h.reader().props.onHop("x"); h.render(); h.reader().props.onBack(); h.render(); h.reader().props.onExit(); h.render();
    assert.equal(JSON.stringify(h.draft()), before); assert.equal(JSON.stringify(h.all().filter(n => n.props?.role === "alert")), alerts);
    assert.deepEqual([...h.values], values); assert.equal(h.writes(), writes);
  }
});

test("current storage events replace saved bodies, missing targets and denied reads remove stale reader content", () => {
  const h = harness(draftLib.newIdeaDraft("untouched")); const trigger = { isConnected: true, focus() {} };
  h.all().find(n => n.type === "button" && n.props["aria-label"]?.startsWith("Open saved thought")).props.onClick({ currentTarget: trigger }); h.render();
  const id = h.reader().props.path[0];
  h.values.set(notesLib.IDEA_NOTES_KEY, JSON.stringify(records.map(n => n.id === id ? { ...n, body: "Updated current saved body" } : n)));
  h.listeners.get("storage")({ storageArea: h.storage, key: notesLib.IDEA_NOTES_KEY }); h.render();
  assert.equal(readerLib.ideaRelationships(h.reader().props.notes, id).note.body, "Updated current saved body");
  h.values.set(notesLib.IDEA_NOTES_KEY, JSON.stringify(records.filter(n => n.id !== id)));
  h.listeners.get("storage")({ storageArea: h.storage, key: notesLib.IDEA_NOTES_KEY }); h.render();
  assert.equal(readerLib.ideaRelationships(h.reader().props.notes, id).note, null);
  h.values.set(notesLib.IDEA_NOTES_KEY, "damaged");
  h.listeners.get("storage")({ storageArea: h.storage, key: notesLib.IDEA_NOTES_KEY }); h.render();
  assert.equal(h.reader().props.readFailed, true); assert.equal(h.draft().body, "untouched"); assert.equal(h.writes(), 0);
});

test("direct card-origin entry has one step and restores its own control; successful explicit edit selects current body", () => {
  const h = harness(draftLib.newIdeaDraft()); const trigger = { isConnected: true, focus(opts) { this.focused = opts; } };
  h.all().find(n => n.type === "button" && n.props["aria-label"]?.startsWith("Open original thought") && n.props["aria-label"].includes("Needle")).props.onClick({ currentTarget: trigger }); h.render();
  assert.deepEqual(Array.from(h.reader().props.path), ["root"]);
  h.reader().props.onBack(); h.render(); while (h.frames.length) h.frames.shift()(); assert.equal(trigger.focused.preventScroll, true);
  h.all().find(n => n.type === "button" && n.props["aria-label"]?.startsWith("Open original thought") && n.props["aria-label"].includes("Needle")).props.onClick({ currentTarget: trigger }); h.render();
  h.values.set(notesLib.IDEA_NOTES_KEY, JSON.stringify(records.map(n => n.id === "root" ? { ...n, body: "fresh edit" } : n)));
  h.reader().props.onSelect("root", "edit"); h.render();
  assert.equal(h.reader(), undefined); assert.equal(h.draft().mode, "edit"); assert.equal(h.draft().body, "fresh edit");
});

test("native replacement acceptance rechecks deletion, edit, damaged storage and newly committed receipt before changing draft", () => {
  for (const change of ["deleted", "edited", "damaged", "committed"]) {
    const pending = { ...draftLib.newIdeaDraft("  exact unfinished  "), receipt: note("pending", null, timestamp, "exact unfinished") };
    const h = harness(pending); const trigger = { isConnected: true, focus() {} };
    h.all().find(n => n.type === "button" && n.props["aria-label"]?.startsWith("Open original thought") && n.props["aria-label"].includes("Needle")).props.onClick({ currentTarget: trigger }); h.render();
    const before = JSON.stringify(h.draft()); const writes = h.writes();
    h.confirm(() => {
      h.values.set(notesLib.IDEA_NOTES_KEY, change === "damaged" ? "broken" : JSON.stringify(change === "deleted" ? records.filter(n => n.id !== "root") : change === "committed" ? [...records, pending.receipt] : records.map(n => n.id === "root" ? { ...n, body: "changed during confirmation" } : n)));
      return true;
    });
    h.reader().props.onSelect("root", "edit"); h.render();
    if (change === "edited") { assert.equal(h.reader(), undefined); assert.equal(h.draft().body, "changed during confirmation"); assert.equal(h.draft().source.body, "changed during confirmation"); }
    else { assert.ok(h.reader()); assert.equal(JSON.stringify(h.draft()), before); assert.equal(h.writes(), writes); }
  }
});

test("notes-only failed-read Retry after exit retains exact active draft and recovery warnings", () => {
  const h = harness(draftLib.newIdeaDraft("  unfinished  "), { writeFailure: true });
  h.all().find(n => n.props?.id === "idea-body").props.onChange({ target: { value: "  فکر\nunchanged  " } }); h.render();
  const before = JSON.stringify(h.draft()); const trigger = { isConnected: true, focus() {} };
  h.all().find(n => n.type === "button" && n.props["aria-label"]?.startsWith("Open saved thought")).props.onClick({ currentTarget: trigger }); h.render();
  h.values.set(notesLib.IDEA_NOTES_KEY, "damaged"); h.listeners.get("storage")({ storageArea: h.storage, key: notesLib.IDEA_NOTES_KEY }); h.render();
  h.reader().props.onExit(); h.render();
  assert.equal(h.all().some(n => n.props?.["aria-label"]?.startsWith("Open saved thought")), false);
  const retry = h.all().find(n => n.type === "button" && n.props.children === "Retry saved thoughts"); assert.ok(retry);
  h.values.set(notesLib.IDEA_NOTES_KEY, JSON.stringify(records)); retry.props.onClick(); h.render();
  assert.equal(JSON.stringify(h.draft()), before); assert.equal(h.writes(), 0);
  assert.ok(h.all().some(n => n.props?.role === "alert" && JSON.stringify(n).includes("Draft recovery could not be saved")));
  assert.ok(h.all().some(n => n.props?.["aria-label"]?.startsWith("Open saved thought")));
});

test("reading across midnight returns the same collection order and daily saved thought", () => {
  const h = harness(draftLib.newIdeaDraft("retained"));
  const labels = () => h.all().filter(n => n.props?.["aria-label"]?.startsWith("Open saved thought") || n.props?.["aria-label"]?.startsWith("Open daily thought")).map(n => n.props["aria-label"]);
  const before = labels();
  h.all().find(n => n.type === "button" && n.props["aria-label"]?.startsWith("Open saved thought")).props.onClick({ currentTarget: { isConnected: true, focus() {} } }); h.render();
  h.advanceDay(); h.reader().props.onHop("x"); h.render(); h.reader().props.onExit(); h.render();
  assert.deepEqual(labels(), before);
});

test("midnight before any reader entry keeps ordinary current-day discovery and scatter refresh", () => {
  const h = harness(draftLib.newIdeaDraft("retained"));
  const daily = () => h.all().find(n => n.props?.["aria-label"]?.startsWith("Open daily thought"));
  h.advanceDay(); h.render();
  const expectedDaily = notesLib.dailyIdeaNote(records, "2026-10-14");
  assert.equal(daily().props["aria-label"], `Open daily thought: ${readerLib.ideaPreview(expectedDaily)}`);
  // Some fixtures share prose; verify selected saved ID through the actual entry handler.
  daily().props.onClick({ currentTarget: { isConnected: true, focus() {} } }); h.render();
  assert.equal(h.reader().props.path[0], expectedDaily.id);
  h.reader().props.onExit(); h.render();
  const score = id => { let value = 0; for (const ch of `${id}2026-10-14`) value = (value * 31 + ch.charCodeAt(0)) | 0; return value; };
  const expectedOrder = [...records].sort((a,b) => score(a.id) - score(b.id));
  const opens = h.all().filter(n => n.props?.["aria-label"]?.startsWith("Open saved thought"));
  assert.equal(opens.length, expectedOrder.length);
  opens.forEach((control, i) => {
    control.props.onClick({ currentTarget: { isConnected: true, focus() {} } }); h.render();
    assert.equal(h.reader().props.path[0], expectedOrder[i].id);
    h.reader().props.onExit(); h.render();
  });
});

test("normal writing, search, save, draft retry and delete after reader return resume current-day discovery", () => {
  for (const action of ["typing", "search", "save", "retry", "delete"]) {
    const h = harness(draftLib.newIdeaDraft("unfinished"), action === "retry" ? { writeFailure: true } : {});
    if (action === "retry") { h.all().find(n => n.props?.id === "idea-body").props.onChange({ target: { value: "recovery" } }); h.render(); }
    const dailyControl = () => h.all().find(n => n.props?.["aria-label"]?.startsWith("Open daily thought"));
    dailyControl().props.onClick({ currentTarget: { isConnected: true, focus() {} } }); h.render();
    h.reader().props.onExit(); h.render(); const previousDailyLabel = dailyControl().props["aria-label"];
    h.advanceDay(); h.render(); assert.equal(dailyControl().props["aria-label"], previousDailyLabel);
    if (action === "typing") h.all().find(n => n.props?.id === "idea-body").props.onChange({ target: { value: "next writing" } });
    if (action === "search") h.all().find(n => n.props?.id === "ideas-search").props.onChange({ target: { value: "" } });
    if (action === "save") h.all().find(n => n.type === "form").props.onSubmit({ preventDefault() {} });
    if (action === "retry") h.all().find(n => n.type === "button" && n.props.children === "Retry draft recovery").props.onClick();
    if (action === "delete") { h.confirm(true); h.all().find(n => n.type === "button" && n.props.children === "delete").props.onClick(); }
    h.render();
    const current = notesLib.readIdeaNotes(h.storage); const expected = notesLib.dailyIdeaNote(current, "2026-10-14");
    dailyControl().props.onClick({ currentTarget: { isConnected: true, focus() {} } }); h.render();
    assert.equal(h.reader().props.path[0], expected.id, action);
    h.reader().props.onExit(); h.render();
    const score = id => { let result = 0; for (const ch of `${id}2026-10-14`) result = (result * 31 + ch.charCodeAt(0)) | 0; return result; };
    const sorted = [...current].sort((a,b) => score(a.id) - score(b.id));
    const opens = h.all().filter(n => n.props?.["aria-label"]?.startsWith("Open saved thought"));
    assert.equal(opens.length, sorted.length);
    opens.forEach((control, i) => { control.props.onClick({ currentTarget: { isConnected: true, focus() {} } }); h.render(); assert.equal(h.reader().props.path[0], sorted[i].id, action); h.reader().props.onExit(); h.render(); });
  }
});

test("declined reader Edit preserves captured day; successful selection releases reader context", () => {
  const h = harness(draftLib.newIdeaDraft("unfinished"));
  const dailyControl = () => h.all().find(n => n.props?.["aria-label"]?.startsWith("Open daily thought"));
  const previousDailyLabel = dailyControl().props["aria-label"];
  h.all().find(n => n.type === "button" && n.props["aria-label"]?.startsWith("Open original thought") && n.props["aria-label"].includes("Needle")).props.onClick({ currentTarget: { isConnected: true, focus() {} } }); h.render();
  h.advanceDay(); h.reader().props.onSelect("root", "edit"); h.render();
  assert.ok(h.reader()); assert.equal(dailyControl().props["aria-label"], previousDailyLabel);
  h.confirm(true); h.reader().props.onSelect("root", "edit"); h.render(); assert.equal(h.reader(), undefined);
  const expected = notesLib.dailyIdeaNote(records, "2026-10-14");
  dailyControl().props.onClick({ currentTarget: { isConnected: true, focus() {} } }); h.render(); assert.equal(h.reader().props.path[0], expected.id);
});

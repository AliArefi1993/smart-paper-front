import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
const lib = resolve("src/lib");
registerHooks({ resolve(s, c, next) { if (s.startsWith("@/lib/")) return next(pathToFileURL(resolve(lib, `${s.slice(6)}.ts`)).href,c); return next(s,c); } });
const credential = await import("../src/lib/finance-credential.ts");
const key = credential.FINANCE_CREDENTIAL_KEY;
function browser(t, seed = {}) {
  const original = { window: globalThis.window, navigator: globalThis.navigator };
  const values = new Map(Object.entries(seed)); let denyRead = false; let denyWrite = false; let writes = 0;
  globalThis.window = { localStorage: { getItem(k) { if(denyRead) throw Error("denied"); return values.get(k) ?? null; }, setItem(k,v) { if(denyWrite) throw Error("denied"); writes++; values.set(k,v); } }, addEventListener() {} };
  Object.defineProperty(globalThis,"navigator",{configurable:true,value:{locks:{request:async(_name,action)=>action()}}});
  t.after(()=>{globalThis.window=original.window;Object.defineProperty(globalThis,"navigator",{configurable:true,value:original.navigator});delete process.env.NEXT_PUBLIC_FINANCE_PIN;});
  return { values, writes:()=>writes, denyRead(v){denyRead=v;}, denyWrite(v){denyWrite=v;} };
}
const rejectsCode = (work,code)=>assert.rejects(work,e=>e instanceof credential.FinancePinError && e.code===code);

test("legacy exact configured string, strict normalized custom migration and fresh runtime",async t=>{
  const b=browser(t,{"smart-paper.local.finance":JSON.stringify({goal_amount:45,entries:[]})});
  process.env.NEXT_PUBLIC_FINANCE_PIN=" legacy A ";
  assert.equal(await credential.verifyFinancePin("legacy A"),false);
  assert.equal(await credential.verifyFinancePin(" legacy A "),true);
  const store=await import(`../src/lib/local-store.ts?pin=${Math.random()}`);
  await store.unlockLocalFinanceSession(" legacy A ");
  const records=b.values.get("smart-paper.local.finance");
  let notified=false; const unsub=credential.subscribeFinanceCredential(()=>{notified=true;});
  await credential.changeFinancePin(" legacy A ","۰۰١۲","0012"); unsub();
  assert.equal(notified,true); assert.equal((await store.checkLocalFinanceSession()).status,403);
  assert.equal(b.values.get("smart-paper.local.finance"),records); assert.equal(b.writes(),1);
  const saved=JSON.parse(b.values.get(key)); assert.equal(saved.iterations,600000); assert.equal(saved.salt.length,32);assert.equal(saved.verifier.length,64);
  assert.equal(credential.usesDefaultFinancePin(),false);assert.equal(await credential.verifyFinancePin(" legacy A "),false);assert.equal(await credential.verifyFinancePin("٠۰1۲"),true);
  await rejectsCode(()=>credential.changeFinancePin("0012","۰۰۱۲","0012"),"samePin");
  const restarted=await import(`../src/lib/local-store.ts?restart=${Math.random()}`);
  assert.equal((await restarted.checkLocalFinanceSession()).status,403);
  await assert.rejects(()=>restarted.unlockLocalFinanceSession(" legacy A "),e=>e.status===403);
  await restarted.unlockLocalFinanceSession("۰۰۱۲");assert.equal((await restarted.checkLocalFinanceSession()).status,200);
});

test("invalid, unreadable and atomic failed write never bypass or change prior session",async t=>{
  const b=browser(t); const store=await import(`../src/lib/local-store.ts?failure=${Math.random()}`);await store.unlockLocalFinanceSession("1234");
  await rejectsCode(()=>credential.changeFinancePin("bad","5678","5678"),"wrongCurrent");
  await rejectsCode(()=>credential.changeFinancePin("1234"," 5678"," 5678"),"invalidNew");
  await rejectsCode(()=>credential.changeFinancePin("1234","5678","9876"),"mismatch");
  b.denyWrite(true); await rejectsCode(()=>credential.changeFinancePin("1234","5678","5678"),"writeFailed");
  assert.equal(b.values.has(key),false); assert.equal((await store.checkLocalFinanceSession()).status,200);
  b.denyRead(true); assert.equal(credential.getFinanceCredentialState(),"unreadable");assert.equal(credential.usesDefaultFinancePin(),false);await rejectsCode(()=>credential.changeFinancePin("1234","5678","5678"),"unreadable");
  assert.equal((await store.checkLocalFinanceSession()).status,403);b.denyRead(false);b.denyWrite(false);
  for(const malformed of ['null','{}','{"version":2}','{"version":1,"algorithm":"PBKDF2-SHA-256","iterations":1,"salt":"00","verifier":"00"}']){
    b.values.set(key,malformed); assert.equal(credential.getFinanceCredentialState(),"invalid");assert.equal(credential.usesDefaultFinancePin(),false);await rejectsCode(()=>credential.verifyFinancePin("1234"),"invalid");
  }
  assert.equal(b.writes(),0);
});

test("concurrent derivation cannot overwrite changed snapshot, duplicate save rejected",async t=>{
  const b=browser(t);const first=credential.changeFinancePin("1234","5678","5678");
  await rejectsCode(()=>credential.changeFinancePin("1234","9876","9876"),"changed");
  b.values.set(key,"external-invalid");await rejectsCode(()=>first,"changed");assert.equal(b.values.get(key),"external-invalid");assert.equal(b.writes(),0);
});

test("missing cross-context serialization leaves old credential intact",async t=>{
  const b=browser(t);Object.defineProperty(globalThis,"navigator",{configurable:true,value:{}});
  await rejectsCode(()=>credential.changeFinancePin("1234","5678","5678"),"unavailable");assert.equal(b.writes(),0);assert.equal(await credential.verifyFinancePin("1234"),true);
});

test("backup schemas, merge and replace never carry or restore credentials",async t=>{
  const b=browser(t);const store=await import(`../src/lib/local-store.ts?backup=${Math.random()}`);
  await credential.changeFinancePin("1234","0055","٠٠٥٥"); const saved=b.values.get(key);
  await store.unlockLocalFinanceSession("0055");
  await store.saveLocalFinanceGoal(900); await store.addLocalIncome(30,"unchanged");
  const backup=await store.getLocalExportPayload();
  assert.equal(JSON.stringify(backup).includes("verifier"),false); assert.equal(JSON.stringify(backup).includes(saved),false);
  for(const mode of ["merge","replace"]) for(const schema of [undefined,1,2,3,4,5]) {
    const incoming={...backup,schema_version:schema,finance_credential:{pin:"9999",verifier:"forged"},[key]:"forged"};
    await store.importLocalExportPayload(incoming,mode);assert.equal(b.values.get(key),saved);assert.equal((await store.getLocalFinance()).goal_amount,900);
  }
  credential.notifyFinanceCredentialChanged();
  await assert.rejects(()=>store.getLocalExportPayload(),e=>e.status===403);
  await assert.rejects(()=>store.importLocalExportPayload(backup,"replace"),e=>e.status===403);
});

test("storage event relocks all protected adapters and pending unlock cannot revive authorization",async t=>{
  const b=browser(t);const events=new Map();window.addEventListener=(name,callback)=>events.set(name,callback);
  const store=await import(`../src/lib/local-store.ts?events=${Math.random()}`);
  const unsubscribe=credential.subscribeFinanceCredential(()=>{});t.after(unsubscribe);
  await credential.changeFinancePin("1234","0077","0077");await store.unlockLocalFinanceSession("0077");
  const pending=store.unlockLocalFinanceSession("0077");b.values.set(key,"invalid-external");events.get("storage")({key});
  await assert.rejects(()=>pending,e=>e.status===403);
  assert.equal((await store.checkLocalFinanceSession()).status,403);
  for(const operation of [()=>store.getLocalFinance(),()=>store.saveLocalFinanceGoal(5),()=>store.addLocalIncome(5,"x"),()=>store.editLocalIncome(1,1,"x","2026-10-13"),()=>store.deleteLocalIncome(1),()=>store.getLocalExportPayload()]) await assert.rejects(operation,e=>e.status===403);
});

test("new PIN bounds and unavailable crypto keep original credential and session",async t=>{
  const b=browser(t);const store=await import(`../src/lib/local-store.ts?crypto=${Math.random()}`);await store.unlockLocalFinanceSession("1234");
  for(const value of ["123","1234567890123","abcd","1234\n"]) await rejectsCode(()=>credential.changeFinancePin("1234",value,value),"invalidNew");
  await rejectsCode(()=>credential.changeFinancePin("1234","۱۲۳۴","١٢٣٤"),"samePin");
  const originalCrypto=globalThis.crypto;
  Object.defineProperty(globalThis,"crypto",{configurable:true,value:{}});
  try { await rejectsCode(()=>credential.changeFinancePin("1234","0000","0000"),"unavailable");assert.equal(b.values.has(key),false);assert.equal((await store.checkLocalFinanceSession()).status,200); }
  finally { Object.defineProperty(globalThis,"crypto",{configurable:true,value:originalCrypto}); }
  await credential.changeFinancePin("1234","000000000001","۰۰۰۰۰۰۰۰۰۰۰۱");assert.equal(await credential.verifyFinancePin("٠٠٠٠٠٠٠٠٠٠٠١"),true);
  // Current-PIN replacement requires the credential itself, independently of an expired/locked session.
  await credential.changeFinancePin("000000000001","0001","0001");assert.equal(await credential.verifyFinancePin("0001"),true);
});

test("two independent credential runtimes serialize replacement without overwriting", async t => {
  const b = browser(t);
  let tail = Promise.resolve();
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { locks: {
    request: (_name, action) => {
      const pending = tail.then(action);
      tail = pending.catch(() => {});
      return pending;
    },
  } } });
  const other = await import(`../src/lib/finance-credential.ts?other=${Math.random()}`);
  const first = credential.changeFinancePin("1234", "0066", "0066");
  const second = other.changeFinancePin("1234", "0099", "0099");
  await first;
  await assert.rejects(() => second, error => error.code === "wrongCurrent");
  assert.equal(b.writes(), 1);
  assert.equal(await credential.verifyFinancePin("0066"), true);
  assert.equal(await credential.verifyFinancePin("0099"), false);
});

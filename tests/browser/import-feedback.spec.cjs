const {test,expect}=require('@playwright/test');
const {fixture,storage,seed}=require('./fixtures.cjs');
const filename='smart-paper-نسخه-پشتیبان-برنامه‌ریزی-و-ایده‌های-بلند-2001.json';
const upload=(page,backup)=>page.locator('#json-backup-file').setInputFiles({name:filename,mimeType:'application/json',buffer:Buffer.from(typeof backup==='string'?backup:JSON.stringify(backup))});
const outcome=page=>page.locator('[aria-labelledby="import-feedback-title"]');
async function unlock(page){await page.locator('#export-pin').fill('1234');await page.locator('#export-pin').press('Enter');await expect(page.locator('#json-backup-file')).toBeEnabled();}
function incoming(){
  const source=fixture();const start='2001-01-06';
  const days=source.weeks[0].days.map((day,i)=>{const date=new Date(start+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+i);return {...day,date:date.toISOString().slice(0,10)};});
  return {...source,weeks:[{...source.weeks[0],start_date:start,end_date:days[6].date,days,weekly_goal:'Archived imported goal هدف'}],idea_notes:[{...source.idea_notes[0],id:'imported-note',body:'Imported writing متن'}],week_templates:[{id:71,name:'Imported template الگو',weekly_goal:'',weekly_note:'',days:[]}]};
}
test.beforeEach(async({page})=>{await page.clock.setFixedTime(new Date('2026-10-13T12:00:00Z'));await page.setViewportSize({width:390,height:700});});

for(const language of ['en','fa'])test(`${language}: import receipt is visible, truthful, localized and opens archived content`,async({page,context})=>{
  await seed(context,{...storage(fixture()),'smart-paper.language':language});await page.goto('/export');await unlock(page);
  await page.locator('#json-backup-file').scrollIntoViewIfNeeded();await upload(page,incoming());
  const receipt=outcome(page);await expect(receipt).toBeFocused();
  const heading=receipt.locator('h3');await expect(heading).toHaveText(language==='en'?'Import complete':'ورود اطلاعات انجام شد');
  expect(await heading.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})).toBe(true);
  await expect(receipt).toContainText(filename);await expect(receipt).toContainText(language==='en'?'Records in this backup':'رکوردهای موجود در این نسخهٔ پشتیبان');
  await expect(receipt.locator('dd')).toHaveText(language==='en'?['1','0','1','1']:['۱','۰','۱','۱']);
  await expect(receipt).toContainText(language==='en'?'not newly added records':'نه اطلاعات تازه افزوده‌شده');
  expect(await page.locator('#json-backup-file').inputValue()).toBe('');
  const records=await page.evaluate(()=>localStorage.getItem('smart-paper.local.weeks'));
  await upload(page,incoming());await expect(receipt).toBeFocused();
  expect(await page.evaluate(()=>localStorage.getItem('smart-paper.local.weeks'))).toBe(records);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('smart-paper.local.idea-notes')).length)).toBe(21);
  // Labels and counts retranslate; changing locale must not re-focus the receipt.
  const other=language==='en'?'fa':'en';const selector=page.locator('select').filter({has:page.locator('option[value="fa"]')});
  await selector.focus();await selector.selectOption(other);await expect(selector).toBeFocused();
  await expect(heading).toHaveText(other==='en'?'Import complete':'ورود اطلاعات انجام شد');
  await expect(receipt.locator('dd')).toHaveText(other==='en'?['1','0','1','1']:['۱','۰','۱','۱']);
  expect(await receipt.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await receipt.locator('a[href="/"]').click();
  const current=page.locator('[data-selected-week="true"]');await expect(current).toHaveAttribute('aria-current','date');
  // Match through the existing localized label rather than requiring a new deep link.
  const labels=await page.locator('[data-selected-week]').allTextContents();
  const archiveIndex=labels.findIndex(label=>label.includes('۱۳۷۹')||label.includes('1379'));
  expect(archiveIndex).toBeGreaterThanOrEqual(0);await page.locator('[data-selected-week]').nth(archiveIndex).click();
  await expect(page.getByRole('textbox',{name:other==='en'?'Weekly Goal':'هدف هفته',exact:true})).toHaveValue('Archived imported goal هدف');
  await page.goto('/ideas');await page.getByRole('button',{name:other==='en'?/Open saved thought.*Imported writing/:/Imported writing/}).first().click();
  await expect(page.getByRole('dialog')).toContainText('Imported writing متن');
});

test('Replace cancellation and invalid input replace prior success without mutating data',async({page,context})=>{
  await seed(context,storage(fixture()));await page.goto('/export');await unlock(page);await upload(page,incoming());await expect(outcome(page)).toContainText('Import complete');
  const before=await page.evaluate(()=>JSON.stringify(localStorage));
  await page.getByRole('radio',{name:'Delete old data first',exact:true}).check();
  page.once('dialog',async dialog=>{expect(dialog.message()).toContain('1 Week Templates');await dialog.dismiss();});await upload(page,incoming());
  await expect(outcome(page)).toContainText('Import cancelled');await expect(outcome(page)).toContainText('No changes were saved.');
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).toBe(before);
  await upload(page,'{');await expect(outcome(page).getByRole('alert')).toContainText('Import did not complete');await expect(outcome(page)).toBeFocused();
  await expect(outcome(page)).not.toContainText('Import complete');expect(await page.evaluate(()=>JSON.stringify(localStorage))).toBe(before);
});

test('Confirmed Replace reports empty/Ideas/templates categories and hidden Finance remains hidden',async({page,context})=>{
  await seed(context,{...storage(fixture()),'smart-paper.local.finance-visibility':'hidden'});await page.goto('/export');await unlock(page);
  const backup=incoming();backup.weeks=[];backup.idea_notes=[];
  await page.getByRole('radio',{name:'Delete old data first',exact:true}).check();page.once('dialog',dialog=>dialog.accept());await upload(page,backup);
  const receipt=outcome(page);await expect(receipt).toContainText('Import complete');await expect(receipt.locator('dd')).toHaveText(['0','0','0','1']);
  await expect(receipt.locator('a[href="/"]')).toBeVisible();await expect(receipt.locator('a[href="/settings#finance-visibility"]')).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('smart-paper.local.finance-visibility'))).toBe('hidden');
  expect(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('smart-paper.local.weeks'))).length)).toBe(0);
  backup.week_templates=[];backup.idea_notes=incoming().idea_notes;page.once('dialog',dialog=>dialog.accept());await upload(page,backup);
  await expect(receipt.locator('dd')).toHaveText(['0','0','1','0']);await expect(receipt.locator('a[href="/ideas"]')).toBeVisible();
  backup.idea_notes=[];page.once('dialog',dialog=>dialog.accept());await upload(page,backup);await expect(receipt.locator('dd')).toHaveText(['0','0','0','0']);
});

test('Storage failure has contextual error and retains primary records',async({page,context})=>{
  await seed(context,storage(fixture()));await page.goto('/export');await unlock(page);
  const before=await page.evaluate(()=>localStorage.getItem('smart-paper.local.weeks'));
  await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='smart-paper.local.weeks')throw new Error('Synthetic storage full');return original.call(this,key,value);};});
  await upload(page,incoming());await expect(outcome(page).getByRole('alert')).toContainText('Import did not complete');await expect(outcome(page)).toContainText('Synthetic storage full');
  expect(await page.evaluate(()=>localStorage.getItem('smart-paper.local.weeks'))).toBe(before);
});

test('File read progress disables controls and authorization expiry cannot produce a stale receipt',async({page,context})=>{
  await seed(context,storage(fixture()));await page.goto('/export');await unlock(page);
  await page.evaluate(()=>{const original=File.prototype.text;File.prototype.text=function(){return new Promise(resolve=>{window.finishImportRead=()=>original.call(this).then(resolve);});};});
  await upload(page,incoming());await expect(outcome(page)).toContainText('Importing backup…');
  await expect(page.getByRole('radio').first()).toBeDisabled();await expect(page.locator('#json-backup-file')).toBeDisabled();
  await page.clock.setFixedTime(new Date('2026-10-13T14:00:00Z'));await page.evaluate(()=>window.finishImportRead());
  await expect(page.locator('#export-pin')).toBeVisible();await expect(outcome(page)).toHaveCount(0);
  await expect(page.getByRole('alert').filter({hasText:'Import did not complete'})).toBeVisible();
  expect(await page.evaluate(()=>Object.hasOwn(JSON.parse(localStorage.getItem('smart-paper.local.weeks')),'2001-01-06'))).toBe(false);
});

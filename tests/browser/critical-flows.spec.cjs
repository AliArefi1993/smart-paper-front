const {test,expect} = require('@playwright/test');
const {fixture,storage,seed} = require('./fixtures.cjs');
const fs = require('node:fs/promises');
test.beforeEach(async({page})=>{await page.clock.setFixedTime(new Date('2026-10-13T12:00:00Z'));});
const goal = page => page.getByRole('textbox',{name:'Weekly Goal',exact:true});
const route = async(page,path)=>{await page.locator(`a[href="${path}"]`).first().click();};
test('Planner autosave and unpublished Idea survive immediate cross-route navigation and reload',async({page})=>{
  await page.goto('/'); await goal(page).fill('Browser goal هدف');
  await route(page,'/ideas'); await page.getByLabel('Your thought',{exact:true}).fill('Unpublished draft پیش‌نویس');
  await route(page,'/'); await expect(goal(page)).toHaveValue('Browser goal هدف');
  await route(page,'/ideas'); await expect(page.getByLabel('Your thought',{exact:true})).toHaveValue('Unpublished draft پیش‌نویس');
  await page.reload(); await expect(page.getByLabel('Your thought',{exact:true})).toHaveValue('Unpublished draft پیش‌نویس');
  await expect(page.getByText('Your first thought can be unfinished. Write it above.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Keep this thought',exact:true}).click();
  await expect(page.locator('#idea-body')).toHaveValue('');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('smart-paper.local.idea-notes')).length)).toBe(1);
});
test('Section hide/re-enable retains persisted and rendered work',async({page,context})=>{
  const backup=fixture(); await seed(context,storage(backup)); await page.goto('/');
  await page.goto('/settings'); const checkbox=page.locator('[data-section-active] input').first();
  await checkbox.uncheck(); await page.getByRole('button',{name:'Save Settings',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('smart-paper.local.planner-sections'))[0].active)).toBe(false);
  await page.goto('/'); await expect(page.getByRole('region',{name:'Main',exact:true})).toHaveCount(0);
  await page.goto('/settings'); await checkbox.check(); await page.getByRole('button',{name:'Save Settings',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('smart-paper.local.planner-sections'))[0].active)).toBe(true);
  await page.goto('/');
  // Stored Saturday work is the canonical fixture; expand the day/section through UI.
  const day=page.getByRole('button',{name:/Saturday ·/}); if(await day.getAttribute('aria-expanded')==='false') await day.click();
  const region=page.getByRole('region',{name:'Main',exact:true}).first(); await expect(region).toBeVisible();
  await region.getByRole('button').first().click(); await expect(region.getByRole('textbox').first()).toHaveValue('Goal 0/0/0 هدف');
});
test('JSON file-input Merge, canceled Replace, invalid input and confirmed Replace recover data',async({page,context})=>{
  const saved=fixture(); await seed(context,storage(saved)); await page.goto('/export');
  await page.locator('#export-pin').fill('1234'); await page.getByRole('button',{name:'Unlock Export',exact:true}).click();
  const input=page.locator('input[type=file]'); await expect(input).toBeEnabled();
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Export JSON Backup',exact:true}).click();
  const exported=JSON.parse(await fs.readFile(await (await downloaded).path(),'utf8'));
  expect(exported.weeks).toHaveLength(4);expect(exported.idea_notes).toEqual(saved.idea_notes);
  const incoming={...exported,weeks:[{...saved.weeks[0],weekly_goal:'Imported goal هدف'}],idea_notes:[{...saved.idea_notes[0],id:'incoming',body:'Imported writing متن'}]};
  const upload=backup=>input.setInputFiles({name:'synthetic-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await upload(incoming);
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('smart-paper.local.idea-notes')).length)).toBe(21);
  await page.getByRole('radio',{name:'Delete old data first',exact:true}).check();
  page.once('dialog',dialog=>dialog.dismiss()); await upload(incoming);
  await expect(input).toBeEnabled(); await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('smart-paper.local.idea-notes')).length)).toBe(21);
  await upload({schema_version:999}); await expect(page.getByRole('alert')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('smart-paper.local.idea-notes')).length)).toBe(21);
  page.once('dialog',dialog=>dialog.accept()); await upload(incoming);
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('smart-paper.local.idea-notes')).length)).toBe(1);
  await page.goto('/'); await expect(goal(page)).toHaveValue('Imported goal هدف');
  await page.goto('/ideas'); await page.getByRole('button',{name:/Open saved thought 1 of 1:/}).click();
  await expect(page.getByRole('dialog')).toContainText('Imported writing متن');
});
test('Persian cold entry, reload and language switch keep localized draft status and unpublished text',async({page})=>{
  await page.goto('/ideas'); await page.getByLabel('Your thought',{exact:true}).fill('Cold draft متن');
  await route(page,'/'); await page.locator('select').filter({has:page.locator('option[value="fa"]')}).selectOption('fa');
  await route(page,'/ideas'); await expect(page.locator('#idea-body')).toHaveValue('Cold draft متن');
  const restored='پیش‌نویس تازه بازیابی شد. هنوز فکر ذخیره‌شده نیست.';
  await expect(page.getByText(restored,{exact:true})).toBeVisible();
  await page.reload(); await expect(page.getByText(restored,{exact:true})).toBeVisible();
  await page.locator('select').filter({has:page.locator('option[value="en"]')}).selectOption('en');
  await expect(page.getByText('New draft restored. It is not a saved thought yet.',{exact:true})).toBeVisible();
  await expect(page.locator('#idea-body')).toHaveValue('Cold draft متن');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('smart-paper.local.idea-notes')||'[]').length)).toBe(0);
});
for (const [mode,status] of [
  ['edit','پیش‌نویس ویرایش بازیابی شد. تغییرات هنوز در یادداشت ذخیره نشده‌اند.'],
  ['branch','پیش‌نویس شاخه بازیابی شد. هنوز فکر ذخیره‌شده نیست.'],
]) test(`Persian ${mode} cold draft preserves source and publishes exactly once`,async({page,context})=>{
  const backup=fixture();const source=backup.idea_notes[0];const body=`Recovered ${mode} متن`;
  await seed(context,{...storage(backup),'smart-paper.language':'fa','smart-paper.local.idea-draft':'smart-paper.idea-draft.v1\n'+JSON.stringify({version:1,mode,body,source,receipt:null})});
  await page.goto('/ideas');await expect(page.getByText(status,{exact:true})).toBeVisible();await expect(page.locator('#idea-body')).toHaveValue(body);
  await page.reload();await expect(page.getByText(status,{exact:true})).toBeVisible();
  await page.locator('select').filter({has:page.locator('option[value="en"]')}).selectOption('en');
  await page.getByRole('button',{name:mode==='edit'?'Save changes':'Keep this thought',exact:true}).click();
  await expect(page.getByText('Thought saved.',{exact:true})).toBeVisible();
  await page.locator('select').filter({has:page.locator('option[value="fa"]')}).selectOption('fa');
  await expect(page.getByText('فکر ذخیره شد.',{exact:true})).toBeVisible();
  const notes=await page.evaluate(()=>JSON.parse(localStorage.getItem('smart-paper.local.idea-notes')));
  expect(notes.filter(note=>note.body===body)).toHaveLength(1);expect(notes).toHaveLength(mode==='edit'?20:21);
  if(mode==='edit')expect(notes.find(note=>note.id===source.id).body).toBe(body);
  else{expect(notes.find(note=>note.body===body).parent_id).toBe(source.id);expect(notes.find(note=>note.id===source.id)).toEqual(source);}
});
test('Failed draft write keeps session writing and localizes recovery without publishing',async({page})=>{
  await page.goto('/ideas');await expect(page.locator('#idea-body')).toBeVisible();
  await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='smart-paper.local.idea-draft')throw new DOMException('Synthetic quota','QuotaExceededError');return original.call(this,key,value);};});
  await page.locator('#idea-body').fill('Session recovery متن');await route(page,'/');
  await page.locator('select').filter({has:page.locator('option[value="fa"]')}).selectOption('fa');
  await route(page,'/ideas');await expect(page.locator('#idea-body')).toHaveValue('Session recovery متن');
  await expect(page.getByText('نوشته ناتمام در این نشست حفظ شد. هنوز فکر ذخیره‌شده نیست.',{exact:true})).toBeVisible();
  await page.locator('select').filter({has:page.locator('option[value="en"]')}).selectOption('en');
  await expect(page.getByText('Unfinished writing kept in this session. It is not a saved thought yet.',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('smart-paper.local.idea-notes')||'[]').length)).toBe(0);
});
test('Templates modal traps focus, names its field, closes on Escape, and returns focus',async({page})=>{
  await page.goto('/');
  const opener=page.getByRole('button',{name:'Week Templates',exact:true});
  await opener.click();
  const dialog=page.getByRole('dialog',{name:'Week Templates'});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox',{name:'Template name'})).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(()=>document.activeElement?.closest('dialog')?.open)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await page.locator('select').filter({has:page.locator('option[value="fa"]')}).selectOption('fa');
  await page.getByRole('button',{name:'الگوهای هفته',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('textbox',{name:'نام الگو'})).toBeFocused();
});
test('JSON backup chooser has a keyboard reachable named native file control in both languages',async({page})=>{
  await page.goto('/export');
  await page.locator('#export-pin').fill('1234');
  await page.getByRole('button',{name:'Unlock Export',exact:true}).click();
  const input=page.getByLabel('Choose JSON Backup',{exact:true});
  await expect(input).toBeVisible();
  await page.getByRole('radio',{name:'Delete old data first',exact:true}).focus();
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  await page.locator('select').filter({has:page.locator('option[value="fa"]')}).selectOption('fa');
  await expect(page.getByLabel('انتخاب فایل پشتیبان JSON',{exact:true})).toBeVisible();
});

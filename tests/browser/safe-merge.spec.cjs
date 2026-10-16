const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
const {fixture,storage,seed}=require('./fixtures.cjs');
const receipt=page=>page.locator('[aria-labelledby="import-feedback-title"]');
const upload=(page,backup)=>page.locator('#json-backup-file').setInputFiles({name:'older-backup-نسخه.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
async function unlock(page){if(await page.locator('#export-pin').isVisible()){await page.locator('#export-pin').fill('1234');await page.locator('#export-pin').press('Enter');}await expect(page.locator('#json-backup-file')).toBeEnabled();}
async function thursday(page,fa){const toggle=page.locator('[aria-controls="planner-day-2026-10-15"]');if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();return page.locator('[data-planner-day-body="2026-10-15"]').getByRole('textbox',{name:fa?'یادداشت روز':'Day Note',exact:true});}
test.beforeEach(async({page})=>{await page.clock.setFixedTime(new Date('2026-10-13T12:00:00Z'));await page.setViewportSize({width:390,height:700});});
for(const language of ['en','fa'])test(`${language}: export then Thursday writing survives older Merge and conflicting backup while missing same-week text imports`,async({page,context})=>{
  const fa=language==='fa';const saved=fixture();saved.weeks[0].days[5].day_note='';saved.weeks[0].weekly_note='';
  await seed(context,{...storage(saved),'smart-paper.language':language});
  await page.goto('/export');await unlock(page);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:fa?'پشتیبان JSON':'Export JSON Backup',exact:true}).click();
  const backup=JSON.parse(await fs.readFile(await (await download).path(),'utf8'));
  const backedWeek=backup.weeks.find(week=>week.start_date==='2026-10-10');expect(backedWeek).toBeTruthy();
  await page.locator('a[href="/"]').first().click();const note=await thursday(page,fa);
  const writing='Thursday written after exporting — نوشتهٔ پنجشنبه';await note.fill(writing);
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('smart-paper.local.weeks'))['2026-10-10'].days[5].day_note)).toBe(writing);
  await page.locator('a[href="/export"]').first().click();await unlock(page);await upload(page,backup);
  await expect(receipt(page).locator('h3')).toHaveText(fa?'ورود اطلاعات انجام شد':'Import complete');
  await expect(receipt(page).getByText(fa?'مقدارهای ذخیره‌شده حفظ شد':'Saved values kept',{exact:true})).toHaveCount(0);
  await receipt(page).locator('a[href="/"]').click();await expect(await thursday(page,fa)).toHaveValue(writing);
  backedWeek.days[5].day_note='Conflicting backup version';backedWeek.weekly_note='Restored missing weekly text';
  await page.locator('a[href="/export"]').first().click();await unlock(page);await upload(page,backup);
  await expect(receipt(page)).toBeFocused();
  await expect(receipt(page)).toContainText(fa?'بعضی مقدارهای نسخهٔ پشتیبان اعمال نشد':'Some backup values were not applied');
  expect(await receipt(page).locator('h3').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})).toBe(true);
  await expect(receipt(page)).not.toContainText('Conflicting backup version');
  await upload(page,backup);await expect(receipt(page).locator('h3')).toHaveText(fa?'ورود اطلاعات انجام شد':'Import complete');await expect(page.locator('#json-backup-file')).toBeEnabled();
  await expect(receipt(page)).toContainText(fa?'بعضی مقدارهای نسخهٔ پشتیبان اعمال نشد':'Some backup values were not applied');
  const selector=page.locator('select').filter({has:page.locator('option[value="fa"]')});await selector.focus();await selector.selectOption(fa?'en':'fa');await expect(selector).toBeFocused();
  await expect(receipt(page)).toContainText(fa?'Some backup values were not applied':'بعضی مقدارهای نسخهٔ پشتیبان اعمال نشد');
  expect(await receipt(page).evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await receipt(page).locator('a[href="/"]').click();await expect(await thursday(page,!fa)).toHaveValue(writing);
  await expect(page.getByRole('textbox',{name:!fa?'یادداشت هفته':'Weekly Note',exact:true})).toHaveValue('Restored missing weekly text');
});

test('matching hidden configuration reveals newly filled hidden content without a false conflict warning',async({page,context})=>{
  const saved=fixture();saved.planner_sections[0].active=false;saved.weeks[0].days[5].sections.slot_1.note='';
  await seed(context,storage(saved));await page.goto('/export');await unlock(page);
  const incoming=structuredClone(saved);incoming.weeks[0].days[5].sections.slot_1.note='Imported into hidden section';
  await upload(page,incoming);await expect(receipt(page).locator('h3')).toHaveText('Import complete');
  await expect(receipt(page)).toContainText('Imported content in hidden sections remains saved');
  await expect(receipt(page).getByText('Saved values kept',{exact:true})).toHaveCount(0);
  await expect(receipt(page).locator('a[href="/settings"]')).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('smart-paper.local.weeks'))['2026-10-10'].days[5].sections.slot_1.note)).toBe('Imported into hidden section');
});

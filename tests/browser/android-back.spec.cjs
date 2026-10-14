const {test,expect}=require('@playwright/test');
const {fixture,storage,seed}=require('./fixtures.cjs');

// Exercise the real coordinator using Capacitor's Android platform detection.
// This simulates native callback delivery, not OS keyboard/gesture dispatch.
const route=async(page,path)=>{await page.locator(`a[href="${path}"]`).first().click();await expect(page).toHaveURL(new RegExp(`${path==='/'?'/':path+'/?'}$`));};
const back=async page=>{
  await expect.poll(()=>page.evaluate(()=>typeof window.smartPaperAndroidBack)).toBe('function');
  return page.evaluate(()=>window.smartPaperAndroidBack());
};
test.beforeEach(async({page,context})=>{
  await page.clock.setFixedTime(new Date('2026-10-13T12:00:00Z'));
  await context.addInitScript(()=>{window.androidBridge={postMessage(){}};});
});

for(const language of ['en','fa']) {
  test(`${language}: actual route history unwinds once, reload survives, root exits`,async({page,context})=>{
    await seed(context,{...storage(fixture()),'smart-paper.language':language});
    await page.goto('/');await expect(page.getByRole('textbox').first()).toBeVisible();
    await route(page,'/settings');await route(page,'/summaries');await page.reload();
    expect(await back(page)).toBe('handled');await expect(page).toHaveURL(/\/settings\/?$/);
    expect(await back(page)).toBe('handled');await expect(page).toHaveURL(/\/$/);
    expect(await back(page)).toBe('exit');
  });

  test(`${language}: nested reader consumes one Back and retains unpublished writing`,async({page,context})=>{
    const backup=fixture();backup.idea_notes=backup.idea_notes.slice(0,2);
    backup.idea_notes[0].body='Parent thought فکر اصلی';backup.idea_notes[1].body='Child thought فکر فرزند';backup.idea_notes[1].parent_id=backup.idea_notes[0].id;
    await seed(context,{...storage(backup),'smart-paper.language':language});
    await page.goto('/ideas');await page.locator('#idea-body').fill('Unpublished پیش‌نویس');
    await page.getByRole('button',{name:language==='en'?/Open saved thought.*Parent thought/:/باز کردن فکر ذخیره‌شده.*Parent thought/}).click();
    await page.getByRole('dialog').getByRole('button',{name:language==='en'?/Open grown thought/:/باز کردن فکر رشدکرده/}).click();
    await expect(page.getByRole('dialog').getByText('Child thought فکر فرزند',{exact:true})).toBeVisible();
    expect(await back(page)).toBe('handled');
    await expect(page.getByRole('dialog').getByText('Parent thought فکر اصلی',{exact:true})).toBeVisible();
    expect(await back(page)).toBe('handled');await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('#idea-body')).toHaveValue('Unpublished پیش‌نویس');
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('smart-paper.local.idea-notes')).length)).toBe(2);
    await expect(page).toHaveURL(/\/ideas\/?$/);
    expect(await back(page)).toBe('handled');await expect(page).toHaveURL(/\/$/);
  });

  test(`${language}: Settings decline retains dirty choice and stays on route`,async({page,context})=>{
    await seed(context,{...storage(fixture()),'smart-paper.language':language});
    await page.goto('/');await route(page,'/settings');
    const active=page.locator('[data-section-active] input').first();await active.uncheck();
    const declined=page.waitForEvent('dialog');const action=back(page);await (await declined).dismiss();expect(await action).toBe('handled');
    await expect(page).toHaveURL(/\/settings\/?$/);await expect(active).not.toBeChecked();
    const accepted=page.waitForEvent('dialog');const second=back(page);await (await accepted).accept();expect(await second).toBe('handled');
    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('smart-paper.local.planner-sections'))[0].active)).toBe(true);
  });

  test(`${language}: report busy/discard blocks route departure and preserves description`,async({page,context})=>{
    await seed(context,{...storage(fixture()),'smart-paper.language':language});await page.goto('/settings');
    await page.getByRole('button',{name:language==='en'?'Report a problem':'گزارش مشکل',exact:true}).first().click();
    await page.locator('#diagnostic-description').fill('Unfinished report گزارش ناتمام');
    expect(await back(page)).toBe('handled');
    const discard=page.getByRole('heading',{name:language==='en'?'Discard this description?':'این توضیح کنار گذاشته شود؟',exact:true});await expect(discard).toBeVisible();
    expect(await back(page)).toBe('handled');await expect(discard).toBeVisible();await expect(page).toHaveURL(/\/settings\/?$/);
    await page.getByRole('button',{name:language==='en'?'Keep writing':'ادامهٔ نوشتن',exact:true}).click();
    await expect(page.locator('#diagnostic-description')).toHaveValue('Unfinished report گزارش ناتمام');
    await page.getByRole('button',{name:language==='en'?'Review report':'بررسی گزارش',exact:true}).click();
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise(resolve=>{window.finishReportCopy=resolve;})}}));
    const copy=page.getByRole('button',{name:language==='en'?'Copy report':'کپی گزارش',exact:true});await copy.click();await expect(copy).toBeDisabled();
    expect(await back(page)).toBe('handled');await expect(copy).toBeDisabled();await expect(page).toHaveURL(/\/settings\/?$/);
    await page.evaluate(()=>window.finishReportCopy());await expect(copy).toBeEnabled();
    expect(await back(page)).toBe('handled');await expect(discard).toBeVisible();
    await page.getByRole('button',{name:language==='en'?'Discard description':'کنار گذاشتن توضیح',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/settings\/?$/);
  });

  test(`${language}: failed Planner local save blocks root exit and retains Retry/edit`,async({page,context})=>{
    await seed(context,{...storage(fixture()),'smart-paper.language':language});await page.goto('/');
    const goal=page.getByRole('textbox',{name:language==='en'?'Weekly Goal':'هدف هفته',exact:true});await expect(goal).toBeVisible();
    await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='smart-paper.local.weeks')throw new DOMException('Synthetic quota','QuotaExceededError');return original.call(this,key,value);};});
    await goal.fill('Failed save متن حفظ‌شده');
    const retry=page.getByRole('button',{name:language==='en'?'Retry':'تلاش دوباره',exact:true}).first();await expect(retry).toBeVisible();
    expect(await back(page)).toBe('handled');await expect(page).toHaveURL(/\/$/);await expect(goal).toHaveValue('Failed save متن حفظ‌شده');await expect(retry).toBeVisible();
    await page.getByRole('button',{name:language==='en'?/^Previous week /:/^هفته قبل /}).click();
    // Local mode blocks a failed-save week switch before the manual-mode decision.
    await expect(page.getByRole('button',{name:language==='en'?'Keep editing':'ادامه ویرایش',exact:true})).toHaveCount(0);
    await expect(goal).toHaveValue('Failed save متن حفظ‌شده');await expect(retry).toBeVisible();
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('smart-paper.local.weeks'))['2026-10-10'].weekly_goal)).toBe('Synthetic week 0 هدف');
  });

  test(`${language}: writing, template and event Back preserve their existing close semantics`,async({page,context})=>{
    await seed(context,{...storage(fixture()),'smart-paper.language':language});await page.goto('/');
    // Open the current day's first section through the production controls.
    const region=page.getByRole('region',{name:'Main',exact:true}).first();await expect(region).toBeVisible();
    await region.getByRole('button').first().click();
    const writing=region.getByRole('button',{name:language==='en'?'Open writing view':'باز کردن نمای نوشتن',exact:true}).first();await writing.click();
    await page.getByRole('dialog').getByRole('textbox').fill('Writing kept نوشته حفظ‌شده');
    expect(await back(page)).toBe('handled');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(writing).toBeFocused();
    await expect(region.getByRole('textbox').first()).toHaveValue('Writing kept نوشته حفظ‌شده');await expect(page).toHaveURL(/\/$/);
    const templates=page.getByRole('button',{name:language==='en'?'Week Templates':'الگوهای هفته',exact:true});await templates.click();
    await page.getByRole('dialog').getByRole('textbox').fill('Unapplied template');
    expect(await back(page)).toBe('handled');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(templates).toBeFocused();
    const before=await page.evaluate(()=>localStorage.getItem('smart-paper.local.weeks'));
    await page.getByRole('button',{name:language==='en'?'+ Add Event':'+ افزودن رویداد',exact:true}).first().click();
    const title=page.getByRole('textbox',{name:language==='en'?'Event title':'عنوان رویداد',exact:true});await title.fill('Unapplied event');
    expect(await back(page)).toBe('handled');await expect(title).toHaveCount(0);
    expect(await page.evaluate(()=>localStorage.getItem('smart-paper.local.weeks'))).toBe(before);await expect(page).toHaveURL(/\/$/);
  });

  test(`${language}: pending PIN operation blocks Back without mutating credential`,async({page,context})=>{
    await seed(context,{...storage(fixture()),'smart-paper.language':language});await page.goto('/settings');
    await page.getByRole('button',{name:language==='en'?'Change Finance PIN':'تغییر رمز بخش مالی',exact:true}).click();
    await page.locator('#finance-pin-0').fill('1234');await page.locator('#finance-pin-1').fill('5678');await page.locator('#finance-pin-2').fill('5678');
    await page.evaluate(()=>Object.defineProperty(navigator,'locks',{configurable:true,value:{request:()=>new Promise((_,reject)=>{window.rejectPinOperation=reject;})}}));
    await page.getByRole('button',{name:language==='en'?'Save new PIN':'ذخیرهٔ رمز جدید',exact:true}).click();
    await expect(page.locator('#finance-pin')).toHaveAttribute('aria-busy','true');
    expect(await back(page)).toBe('handled');await expect(page).toHaveURL(/\/settings\/?$/);await expect(page.locator('#finance-pin-1')).toHaveValue('5678');
    await page.evaluate(()=>window.rejectPinOperation(new Error('Synthetic failed lock')));await expect(page.locator('#finance-pin')).toHaveAttribute('aria-busy','false');
    expect(await page.evaluate(()=>localStorage.getItem('smart-paper.local.finance-credential.v1'))).toBeNull();
  });
}

test('Direct secondary entry falls back to Planner despite unrelated browser history',async({page,context})=>{
  await seed(context,storage(fixture()));await page.goto('/');await page.goto('/export?reportWeek=2026-10-10');
  expect(await back(page)).toBe('handled');await expect(page).toHaveURL(/\/$/);expect(await back(page)).toBe('exit');
});

test('Query route history is restored and repeated Back remains available',async({page,context})=>{
  await seed(context,storage(fixture()));await page.goto('/');await route(page,'/export');
  // Same-document query entries model meaningful report/week navigation.
  await page.evaluate(()=>history.pushState(history.state,'','?reportWeek=2026-10-10'));
  expect(await back(page)).toBe('handled');await expect(page).toHaveURL(/\/export\/?$/);
  expect(await back(page)).toBe('handled');await expect(page).toHaveURL(/\/$/);expect(await back(page)).toBe('exit');
});

test('Rapid callbacks consume one pending route transition',async({page,context})=>{
  await seed(context,storage(fixture()));await page.goto('/');await route(page,'/settings');await route(page,'/summaries');
  expect(await page.evaluate(()=>[window.smartPaperAndroidBack(),window.smartPaperAndroidBack()])).toEqual(['handled','handled']);
  await expect(page).toHaveURL(/\/settings\/?$/);expect(await back(page)).toBe('handled');await expect(page).toHaveURL(/\/$/);
});

test('Web navigation keeps ordinary browser Back without installing Android callback',async({page,context})=>{
  await context.addInitScript(()=>{delete window.androidBridge;});
  await seed(context,storage(fixture()));await page.goto('/');await route(page,'/settings');await route(page,'/summaries');
  expect(await page.evaluate(()=>typeof window.smartPaperAndroidBack)).toBe('undefined');
  await page.goBack();await expect(page).toHaveURL(/\/settings\/?$/);
  await page.goBack();await expect(page).toHaveURL(/\/$/);
});

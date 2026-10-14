const {chromium,expect}=require('@playwright/test');
const {fixture,storage,seed}=require('./fixtures.cjs');
const fs=require('node:fs');
const base=process.env.BROWSER_BASE_URL||'http://host.docker.internal:3192';
const rows=[];
const round=n=>Math.round(n*10)/10;
(async()=>{
 for(let run=1;run<=3;run++) for(const size of ['small','large']){
  const browser=await chromium.launch(process.env.BROWSER_CHROME_CHANNEL ? {channel:process.env.BROWSER_CHROME_CHANNEL} : {}); const context=await browser.newContext({timezoneId:'UTC',viewport:{width:1280,height:800}});
  const backup=fixture(size); await seed(context,storage(backup)); const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-10-13T12:00:00Z'));
  const goal=()=>page.getByRole('textbox',{name:'Weekly Goal',exact:true});
  const row={size,run,fixtureBytes:Buffer.byteLength(JSON.stringify(storage(backup))),ideaBodyBytes:Buffer.byteLength(backup.idea_notes[0].body)};
  const measure=async(key,action)=>{const before=performance.now();await action();row[key]=round(performance.now()-before);};
  await measure('freshStartupMs',async()=>{await page.goto(base);await expect(goal()).toHaveValue('Synthetic week 0 هدف');});
  // Load Ideas and return so its JS and Next route payload are available before disconnecting.
  await page.locator('a[href="/ideas"]').first().click();await expect(page.locator('#idea-body')).toBeVisible();
  await page.locator('a[href="/"]').first().click();await expect(goal()).toBeVisible();
  await context.setOffline(true);
  if(await page.evaluate(()=>navigator.onLine))throw Error('Offline simulation not active');
  await measure('offlineWeekSwitchMs',async()=>{await page.getByRole('button',{name:/^Previous week\b/}).click();await expect(goal()).toHaveValue('Synthetic week 1 هدف');});
  await measure('offlineIdeasOpenMs',async()=>{await page.locator('a[href="/ideas"]').first().click();await expect(page.locator('#idea-body')).toBeVisible();});
  await measure('offlineSearchMs',async()=>{await page.locator('#ideas-search').fill('Fixture idea 17 فکر');await expect(page.getByRole('button',{name:/Open saved thought 1 of 1:/})).toBeVisible();});
  const writing=`Performance save ${size}/${run} متن`;
  await measure('offlineTypeSaveMs',async()=>{await page.locator('#idea-body').pressSequentially(writing,{delay:20});await page.getByRole('button',{name:'Keep this thought',exact:true}).click();await expect(page.locator('#idea-body')).toHaveValue('');});
  await measure('offlineReopenMs',async()=>{await page.locator('#ideas-search').fill(writing);await page.getByRole('button',{name:/Open saved thought 1 of 1:/}).click();await expect(page.getByRole('dialog')).toContainText(writing);});
  const actual=await page.evaluate(()=>({weeks:JSON.parse(localStorage.getItem('smart-paper.local.weeks')),ideas:JSON.parse(localStorage.getItem('smart-paper.local.idea-notes'))}));
  for(const week of backup.weeks){const saved=actual.weeks[week.start_date];expect(saved.weekly_goal).toBe(week.weekly_goal);expect(saved.weekly_note).toBe(week.weekly_note);expect(saved.planner_sections).toEqual(week.planner_sections);expect(saved.days).toEqual(week.days);}
  expect(Object.keys(actual.weeks)).toHaveLength(backup.weeks.length);
  expect(actual.ideas.length).toBe(backup.idea_notes.length+1);
  for(const idea of backup.idea_notes)expect(actual.ideas.find(x=>x.id===idea.id)).toEqual(idea);
  expect(actual.ideas.filter(x=>x.body===writing).length).toBe(1);
  row.integrity='all seeded week day/section/schedule and Idea records equal; one added Idea';
  rows.push(row);console.log(JSON.stringify(row));await browser.close();
 }
 const output=process.env.PERFORMANCE_OUTPUT||'/tmp/smart-paper-browser-performance.json';fs.writeFileSync(output,JSON.stringify({method:'Fresh Chromium/context; startup includes navigation+hydration, fixture injection occurs before app. Offline via setOffline after warming routes; 20ms/character deliberate typing; locator/assertion waits included. No Android or offline cold reload claim.',rows},null,2));
})().catch(error=>{console.error(error);process.exit(1)});

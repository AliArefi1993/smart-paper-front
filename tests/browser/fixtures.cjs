const names = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const iso = date => date.toISOString().slice(0, 10);
function fixture(size = 'small') {
  const count = size === 'large' ? 52 : 4;
  const sections = Array.from({length:10},(_,i)=>({id:`slot_${i+1}`,label:i===0?'Main':`Section ${i+1}`,active:true,order:i+1}));
  const anchor = new Date('2026-10-10T12:00:00Z');
  const weeks = Array.from({length:count},(_,w)=>{
    const start = new Date(anchor); start.setUTCDate(start.getUTCDate()-w*7);
    const days = names.map((name,d)=>{
      const date = new Date(start); date.setUTCDate(date.getUTCDate()+d);
      return {date:iso(date),weekday_index:d,weekday_name:name,day_note:`Day ${w}/${d} روز`,
        sections:Object.fromEntries(sections.map((s,i)=>[s.id,{duration_minutes:15+i,goal:`Goal ${w}/${d}/${i} هدف`,note:`Note ${w}/${d}/${i} یادداشت`} ])),
        schedule_entries:Array.from({length:10},(_,i)=>({id:`schedule-${w}-${d}-${i}`,order:i,start_time:`${String(i+7).padStart(2,'0')}:00`,end_time:`${String(i+7).padStart(2,'0')}:30`,title:`Schedule ${w}/${d}/${i} برنامه`,note:'Synthetic',section_id:sections[i].id}))};
    });
    return {start_date:iso(start),end_date:days[6].date,label:`Week ${w}`,weekly_goal:`Synthetic week ${w} هدف`,weekly_note:`Synthetic note ${w} یادداشت`,planner_sections:sections,days,totals:{total_minutes:0,section_minutes:{}}};
  });
  const ideaBody = i => { let body = `Fixture idea ${i} فکر ${i} `; const chunk = i%2 ? 'متن آزمایشی ' : 'Synthetic writing '; while(Buffer.byteLength(body+chunk)<=1024) body+=chunk; return body; };
  const idea_notes = Array.from({length:size==='large'?500:20},(_,i)=>({id:`fixture-${i}`,body:ideaBody(i),created_at:'2026-10-10T10:00:00.000Z',updated_at:'2026-10-10T10:00:00.000Z',parent_id:null}));
  return {schema_version:5,exported_at:'2026-10-13T00:00:00.000Z',weeks,planner_sections:sections,week_templates:[],idea_notes,finance:{goal_amount:0,total_income:0,remaining_amount:0,progress_percent:0,entries:[]}};
}
const storage = backup => ({'smart-paper.local.weeks':JSON.stringify(Object.fromEntries(backup.weeks.map(w=>[w.start_date,w]))),'smart-paper.local.planner-sections':JSON.stringify(backup.planner_sections),'smart-paper.local.idea-notes':JSON.stringify(backup.idea_notes),'smart-paper.diagnostics.preferences.v1':JSON.stringify({errors:false,usage:false}),'smart-paper.diagnostics.disclosure.v1':'1'});
async function seed(context, values) {
  await context.addInitScript(values=>{
    if (!sessionStorage.getItem('browser-fixture-seeded')) {
      Object.entries(values).forEach(([key,value])=>localStorage.setItem(key,value));
      sessionStorage.setItem('browser-fixture-seeded','1');
    }
  }, values);
}
module.exports = {fixture,storage,seed};

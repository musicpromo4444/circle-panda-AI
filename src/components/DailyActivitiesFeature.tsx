import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type DailyActivityItem = { activity_key:string; title:string; description:string; icon:string; is_ad_only:boolean; enabled:boolean; activity_enabled:boolean; day_number:number; reward_bc:number };
type Completion = { day_number:number; activity_key:string; reward_bc:number; completed_at:string };
type CatalogItem = { activity_key:string; title:string; icon:string; is_ad_only:boolean; enabled:boolean };
type StatePayload = { schedule?:DailyActivityItem[]; completed?:Completion[]; current_day?:number; cycle_start_date?:string };

export default function DailyActivitiesFeature({ userId, onReward }: { userId:string; onReward:()=>Promise<void> }) {
  const [schedule,setSchedule] = useState<DailyActivityItem[]>([]);
  const [catalog,setCatalog] = useState<CatalogItem[]>([]);
  const [completed,setCompleted] = useState<Completion[]>([]);
  const [currentDay,setCurrentDay] = useState(1);
  const [cycleStart,setCycleStart] = useState('');
  const [isAdmin,setIsAdmin] = useState(false);
  const [drafts,setDrafts] = useState<Record<number,{activity_key:string;reward_bc:string;enabled:boolean}>>({});
  const [selected,setSelected] = useState<DailyActivityItem|null>(null);
  const [gameStep,setGameStep] = useState(0);
  const [gameResult,setGameResult] = useState('');
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [notice,setNotice] = useState('');

  async function load() {
    if (!supabase) { setLoading(false); return; }
    const [stateResult,catalogResult,roleResult] = await Promise.all([
      supabase.rpc('get_daily_activity_state'),
      supabase.from('daily_activity_catalog').select('activity_key,title,icon,is_ad_only,enabled').order('sort_order'),
      supabase.from('user_roles').select('role').eq('user_id',userId).eq('role','admin').maybeSingle()
    ]);
    if (stateResult.error) setNotice(stateResult.error.message);
    else {
      const state = stateResult.data as StatePayload;
      const rows=state.schedule??[];
      setSchedule(rows); setCompleted(state.completed??[]); setCurrentDay(Number(state.current_day??1)); setCycleStart(state.cycle_start_date??'');
      setDrafts(Object.fromEntries(rows.map(row=>[row.day_number,{activity_key:row.activity_key,reward_bc:String(row.reward_bc),enabled:row.enabled}])));
    }
    if (catalogResult.error) setNotice(catalogResult.error.message);
    else setCatalog((catalogResult.data??[]) as CatalogItem[]);
    setIsAdmin(Boolean(roleResult.data));
    setLoading(false);
  }
  useEffect(()=>{void load();},[userId]);
  const today = schedule.find(row=>row.day_number===currentDay)??null;
  const todayCompleted = completed.some(row=>row.day_number===currentDay);

  async function saveDay(day:number) {
    if(!supabase || busy) return;
    const draft=drafts[day]; if(!draft) return;
    setBusy(true); setNotice('');
    const {error}=await supabase.rpc('admin_set_daily_activity',{p_day_number:day,p_activity_key:draft.activity_key,p_reward_bc:Number(draft.reward_bc),p_enabled:draft.enabled});
    if(error) setNotice(error.message); else {setNotice('Day '+day+' activity saved.');await load();}
    setBusy(false);
  }
  function beginActivity(item:DailyActivityItem) {
    if(item.is_ad_only){setNotice('Sponsored activity is listed, but rewards stay locked until verified ad playback is integrated.');return;}
    setSelected(item);setGameStep(0);setGameResult('');
  }
  async function finishActivity() {
    if(!supabase || !selected || busy) return;
    setBusy(true);setNotice('');
    const {data,error}=await supabase.rpc('complete_daily_activity',{p_activity_key:selected.activity_key});
    if(error) setNotice(error.message);
    else {setGameResult('+'+Number((data as {reward_bc?:number})?.reward_bc??selected.reward_bc)+' BC earned!');setGameStep(2);await load();await onReward();}
    setBusy(false);
  }
  function playStep() {
    const results:Record<string,string> = {
      wheel_spin:'The panda wheel has stopped!',guess_sponsor:'Sponsor challenge opened!',panda_cup_shuffle:'You picked a cup!',
      lucky_cards:'Your lucky card is revealed!',secret_reveal:'Your secret prompt is revealed!',panda_puzzle:'Puzzle round completed!',
      coin_drop:'Your Coin Drop round is complete!',panda_slots:'The slot result is ready!',mystery_box:'Your mystery box is open!',panda_target:'Target round complete!'
    };
    setGameResult(results[selected?.activity_key??'']??'Challenge completed!');setGameStep(1);
  }
  return <section className="daily-activities-panel">
    <div className="daily-activities-heading"><div><p className="eyebrow">YOUR 7-DAY CHALLENGE</p><h2>Daily Activities</h2><p>Claim your daily login reward, then complete the activity assigned for the day.</p></div><span className="daily-streak-mark">🐼 <b>{completed.length}/7</b><small>days complete</small></span></div>
    {notice&&<div className="notice inline-notice">{notice}<button type="button" onClick={()=>setNotice('')}>×</button></div>}
    {loading?<div className="empty-state">Loading your daily activities…</div>:<>
      <div className="daily-week-track">{Array.from({length:7},(_,i)=>{const day=i+1;const done=completed.some(row=>row.day_number===day);return <div key={day} className={done?'daily-day done':day===currentDay?'daily-day current':day<currentDay?'daily-day missed':'daily-day locked'}><span>{done?'✓':day<currentDay?'–':day}</span><small>Day {day}</small></div>})}</div>
      {today?<article className="daily-today-card"><div className="daily-activity-icon">{today.icon}</div><div className="daily-today-copy"><span className="eyebrow">DAY {currentDay} · {today.is_ad_only?'SPONSORED':'TODAY’S CHALLENGE'}</span><h3>{today.title}</h3><p>{today.description}</p><div className="daily-reward-line"><span>Reward</span><strong>{today.is_ad_only?'Ad verification required':today.reward_bc+' BC'}</strong></div>{todayCompleted?<span className="daily-completed-label">✓ Completed today</span>:!today.enabled||!today.activity_enabled?<span className="daily-completed-label">Unavailable — check back later</span>:<button type="button" className="primary-button" disabled={busy} onClick={()=>beginActivity(today)}>{today.is_ad_only?'Sponsored activity · Setup required':'Start today’s activity →'}</button>}</div></article>:<div className="empty-state">Today’s activity has not been assigned yet.</div>}
      <div className="daily-activity-library"><div className="section-title-row"><div><h3>Activity library</h3><p>One activity is assigned each day by the Circle Panda admin.</p></div></div><div className="daily-library-grid">{catalog.map(item=><article key={item.activity_key} className={'daily-library-card '+(today?.activity_key===item.activity_key?'assigned':'')}><span>{item.icon}</span><strong>{item.title}</strong><small>{item.is_ad_only?'Sponsored · no BC until ad verification':item.enabled?'Available in the activity rotation':'Currently disabled'}</small>{today?.activity_key===item.activity_key&&<em>Assigned today</em>}</article>)}</div></div>
      {isAdmin&&<div className="daily-admin-schedule"><div className="section-title-row"><div><h3>Admin · 7-day schedule</h3><p>Assign one library activity and set its BC reward for each day.</p></div></div>{schedule.map(row=>{const d=drafts[row.day_number]??{activity_key:row.activity_key,reward_bc:String(row.reward_bc),enabled:row.enabled};return <div className="daily-admin-row" key={row.day_number}><strong>Day {row.day_number}</strong><select value={d.activity_key} onChange={e=>setDrafts(old=>({...old,[row.day_number]:{...d,activity_key:e.target.value}}))}>{catalog.map(c=><option key={c.activity_key} value={c.activity_key}>{c.title}</option>)}</select><label><span>BC reward</span><input type="number" min="0" value={d.reward_bc} onChange={e=>setDrafts(old=>({...old,[row.day_number]:{...d,reward_bc:e.target.value}}))}/></label><label className="daily-enabled-toggle"><input type="checkbox" checked={d.enabled} onChange={e=>setDrafts(old=>({...old,[row.day_number]:{...d,enabled:e.target.checked}}))}/> Enabled</label><button type="button" className="secondary-button" disabled={busy} onClick={()=>void saveDay(row.day_number)}>Save</button></div>})}</div>}
    </>}
    {selected&&<div className="daily-game-backdrop"><section className="daily-game-modal" role="dialog" aria-modal="true" aria-label={selected.title}><button type="button" className="daily-game-close" onClick={()=>{setSelected(null);setGameStep(0);setGameResult('');}}>×</button><div className="daily-game-big-icon">{selected.icon}</div><p className="eyebrow">CIRCLE PANDA · DAILY CHALLENGE</p><h2>{selected.title}</h2>{gameStep===0?<><p>{selected.description}</p><p className="daily-game-note">Finish this short activity to unlock today’s configured reward. You can complete today’s assigned activity only once.</p><button type="button" className="primary-button full" onClick={playStep}>Play activity →</button></>:gameStep===1?<><h3>{gameResult}</h3><p>Your activity round is ready to submit.</p><button type="button" className="primary-button full" disabled={busy} onClick={()=>void finishActivity()}>{busy?'Saving…':'Complete activity & claim reward'}</button></>:<><h3>{gameResult}</h3><p>Your progress is saved for this 7-day cycle.</p><button type="button" className="primary-button full" onClick={()=>{setSelected(null);setGameStep(0);setGameResult('');}}>Back to daily activities</button></>}</section></div>}
    <p className="daily-cycle-footnote">Cycle started {cycleStart||'today'}. Each day has one assigned activity. Sponsored-ad rewards remain locked until playback is verified.</p>
  </section>;
}

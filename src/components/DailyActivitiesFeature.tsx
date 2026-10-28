import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type DailyActivityItem = { activity_key:string; title:string; description:string; icon:string; is_ad_only:boolean; enabled:boolean; activity_enabled:boolean; day_number:number; reward_bc:number };
type Completion = { day_number:number; activity_key:string; reward_bc:number; completed_at:string };
type CatalogItem = { activity_key:string; title:string; icon:string; is_ad_only:boolean; enabled:boolean };
type StatePayload = { schedule?:DailyActivityItem[]; completed?:Completion[]; current_day?:number; cycle_start_date?:string };
type Campaign = { id:string; campaign_type:'sweepstake'|'challenge'|'gift'|'giveaway'|'icon'; title:string; description:string; icon:string; prize_type:'BC'|'WC'|'gift'|'icon'|'badge'; prize_amount:number; prize_label:string; starts_at:string; ends_at:string|null; max_entries:number|null; status:'draft'|'open'|'closed'|'drawn'; winner_id:string|null; created_at:string };
type ActivityReward = { id:string; reward_type:string; reward_amount:number; reward_label:string; created_at:string };

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
  const [gameSeconds,setGameSeconds] = useState(60);
  const [gameScore,setGameScore] = useState(0);
  const [gameActive,setGameActive] = useState(false);
  const [coinDropSessionId,setCoinDropSessionId] = useState<string|null>(null);
  const [slotsSessionId,setSlotsSessionId] = useState<string|null>(null);
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [notice,setNotice] = useState('');
  const [activeTab,setActiveTab] = useState<'games'|'sweepstake'|'challenges'|'gifts'|'giveaways'|'icons'|'rewards'>('games');
  const [campaigns,setCampaigns] = useState<Campaign[]>([]);
  const [enteredCampaigns,setEnteredCampaigns] = useState<Set<string>>(()=>new Set());
  const [entryCounts,setEntryCounts] = useState<Record<string,number>>({});
  const [myRewards,setMyRewards] = useState<ActivityReward[]>([]);
  const [campaignDraft,setCampaignDraft] = useState({campaign_type:'sweepstake',title:'',description:'',icon:'🎁',prize_type:'BC',prize_amount:'100',prize_label:'',max_entries:''});

  async function load() {
    if (!supabase) { setLoading(false); return; }
    const [stateResult,catalogResult,roleResult,campaignResult,entryResult,rewardResult] = await Promise.all([
      supabase.rpc('get_daily_activity_state'),
      supabase.from('daily_activity_catalog').select('activity_key,title,icon,is_ad_only,enabled').order('sort_order'),
      supabase.from('user_roles').select('role').eq('user_id',userId).eq('role','admin').maybeSingle(),
      supabase.from('daily_activity_campaigns').select('id,campaign_type,title,description,icon,prize_type,prize_amount,prize_label,starts_at,ends_at,max_entries,status,winner_id,created_at').order('created_at',{ascending:false}).limit(100),
      supabase.from('daily_activity_campaign_entries').select('campaign_id,user_id').eq('user_id',userId),
      supabase.from('user_activity_rewards').select('id,reward_type,reward_amount,reward_label,created_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(50)
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
    if (campaignResult.error) setNotice(campaignResult.error.message);
    else setCampaigns((campaignResult.data??[]) as Campaign[]);
    setEnteredCampaigns(new Set((entryResult.data??[]).map((row:{campaign_id:string})=>row.campaign_id)));
    if (roleResult.data && !entryResult.error) {
      const {data:allEntries} = await supabase.from('daily_activity_campaign_entries').select('campaign_id');
      const counts:Record<string,number>={}; (allEntries??[]).forEach((row:{campaign_id:string})=>{counts[row.campaign_id]=(counts[row.campaign_id]??0)+1;}); setEntryCounts(counts);
    }
    if (rewardResult.error) setNotice(rewardResult.error.message); else setMyRewards((rewardResult.data??[]) as ActivityReward[]);
    setLoading(false);
  }
  useEffect(()=>{void load();},[userId]);
  useEffect(()=>{
    if(!gameActive) return;
    const timer=window.setInterval(()=>setGameSeconds(seconds=>Math.max(0,seconds-1)),1000);
    return ()=>window.clearInterval(timer);
  },[gameActive]);
  useEffect(()=>{
    if(!gameActive || gameSeconds>0) return;
    setGameActive(false);
    if(selected?.activity_key==='coin_drop' && coinDropSessionId && supabase) {
      void supabase.rpc('finish_daily_coin_drop',{p_session_id:coinDropSessionId}).then(({data,error})=>{
        if(error) setNotice(error.message);
        else { const result=data as {score?:number;earned_bc?:number}; setGameScore(Number(result.score??gameScore)); setGameResult('Round complete · score '+Number(result.score??gameScore)+' · '+Number(result.earned_bc??0)+' BC net from collected items.'); setGameStep(3); window.dispatchEvent(new Event('circle-panda-wallet-updated')); }
      });
    } else if(selected?.activity_key==='panda_slots' && slotsSessionId && supabase) {
      void supabase.rpc('finish_daily_panda_slots',{p_session_id:slotsSessionId}).then(({data,error})=>{
        if(error) setNotice(error.message);
        else { const result=data as {result?:string}; setGameResult(result.result??'Slot round complete.'); setGameStep(3); }
      });
    } else { setGameResult('The round ended. Please restart the activity.'); setGameStep(0); }
  },[gameSeconds,gameActive,selected?.activity_key,gameScore,coinDropSessionId,slotsSessionId]);
  useEffect(()=>{
    if(gameStep!==3) return;
    const timer=window.setTimeout(()=>{
      if(selected?.activity_key==='wheel_spin') setGameResult('Round complete.');
      setGameStep(1);
    },selected?.activity_key==='coin_drop'?4000:2200);
    return ()=>window.clearTimeout(timer);
  },[gameStep,selected?.activity_key]);

  async function createCampaign() {
    if (!supabase || !isAdmin || busy || !campaignDraft.title.trim()) return;
    setBusy(true); setNotice('');
    const {error} = await supabase.rpc('admin_create_daily_activity_campaign',{
      p_campaign_type:campaignDraft.campaign_type,p_title:campaignDraft.title.trim(),p_description:campaignDraft.description.trim(),
      p_icon:campaignDraft.icon.trim()||'🎁',p_prize_type:campaignDraft.prize_type,p_prize_amount:Number(campaignDraft.prize_amount||0),
      p_prize_label:campaignDraft.prize_label.trim(),p_starts_at:new Date().toISOString(),p_ends_at:null,
      p_max_entries:campaignDraft.max_entries?Number(campaignDraft.max_entries):null,p_status:'open'
    });
    if(error) setNotice(error.message);
    else {setNotice('Activity published.');setCampaignDraft({campaign_type:'sweepstake',title:'',description:'',icon:'🎁',prize_type:'BC',prize_amount:'100',prize_label:'',max_entries:''});await load();}
    setBusy(false);
  }
  async function joinCampaign(id:string) {
    if(!supabase || busy) return;
    setBusy(true);setNotice('');
    const {error}=await supabase.rpc('join_daily_activity_campaign',{p_campaign_id:id});
    if(error) setNotice(error.message); else {setNotice('You’re entered!');await load();}
    setBusy(false);
  }
  async function drawCampaign(id:string) {
    if(!supabase || !isAdmin || busy) return;
    setBusy(true);setNotice('');
    const {data,error}=await supabase.rpc('admin_draw_daily_activity_campaign',{p_campaign_id:id});
    if(error) setNotice(error.message);
    else {const result=data as {winner_id?:string;prize_type?:string;prize_amount?:number;prize_label?:string};setNotice('Winner selected · '+(result.prize_label||result.prize_type||'Reward')+(result.prize_amount?' · '+result.prize_amount+' '+result.prize_type:''));await load();window.dispatchEvent(new Event('circle-panda-wallet-updated'));}
    setBusy(false);
  }

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
  async function beginActivity(item:DailyActivityItem) {
    if(item.is_ad_only){setNotice('Sponsored activity is listed, but rewards stay locked until verified ad playback is integrated.');return;}
    if(!supabase || busy) return;
    setBusy(true);setNotice('');
    const {error}=await supabase.rpc('start_daily_activity',{p_activity_key:item.activity_key});
    if(error) {setNotice(error.message);setBusy(false);return;}
    setSelected(item);setGameStep(0);setGameResult('');setGameSeconds(60);setGameScore(0);setGameActive(false);
    setBusy(false);
  }
  async function finishActivity() {
    if(!supabase || !selected || busy) return;
    setBusy(true);setNotice('');
    const {data,error}=await supabase.rpc('complete_daily_activity',{p_activity_key:selected.activity_key});
    if(error) setNotice(error.message);
    else {setGameResult('+'+Number((data as {reward_bc?:number})?.reward_bc??selected.reward_bc)+' BC earned!');setGameStep(2);window.dispatchEvent(new Event('circle-panda-wallet-updated'));await load();await onReward();}
    setBusy(false);
  }
  async function chooseOption(choice:string) {
    if(!supabase || !selected || busy) return;
    setBusy(true);setNotice('');
    const {error}=await supabase.rpc('record_daily_activity_action',{p_activity_key:selected.activity_key,p_action:choice});
    if(error){setNotice(error.message);setBusy(false);return;}
    const outcome='Choice recorded.';
    setGameResult(outcome);setGameStep(3);setBusy(false);
  }
  async function startCoinDrop() {
    if(!supabase || busy) return;
    setBusy(true);setNotice('');
    const {data,error}=await supabase.rpc('start_daily_coin_drop');
    if(error) setNotice(error.message);
    else {
      const session=data as {session_id:string;score:number;seconds_remaining:number};
      setCoinDropSessionId(session.session_id);setGameScore(Number(session.score??0));setGameSeconds(Number(session.seconds_remaining??60));setGameActive(true);
    }
    setBusy(false);
  }
  async function recordCoinDrop(item:'coin'|'rare_coin'|'stone') {
    if(!supabase || !coinDropSessionId || busy || !gameActive) return;
    setBusy(true);
    const {data,error}=await supabase.rpc('daily_coin_drop_action',{p_session_id:coinDropSessionId,p_item:item});
    if(error) setNotice(error.message);
    else { const result=data as {score?:number}; setGameScore(Number(result.score??gameScore)); window.dispatchEvent(new Event('circle-panda-wallet-updated')); }
    setBusy(false);
  }
  async function playStep() {
    if(!supabase || !selected || busy) return;
    setBusy(true);setNotice('');
    const {error}=await supabase.rpc('record_daily_activity_action',{p_activity_key:selected.activity_key,p_action:'start_round'});
    if(error){setNotice(error.message);setBusy(false);return;}
    setBusy(false);
    if(selected.activity_key==='panda_slots') {
      const {data,error}=await supabase.rpc('start_daily_panda_slots');
      if(error){setNotice(error.message);setBusy(false);return;}
      const session=data as {session_id:string;seconds_remaining:number};
      setSlotsSessionId(session.session_id);setGameSeconds(Number(session.seconds_remaining??60));setGameScore(0);setGameActive(true);setGameResult('');return;
    }
    const results:Record<string,string> = {
      wheel_spin:'The panda wheel is spinning…',guess_sponsor:'Checking your sponsor guess…',panda_cup_shuffle:'Shuffling the cups…',
      lucky_cards:'Shuffling your lucky cards…',secret_reveal:'Unlocking your secret prompt…',panda_puzzle:'Checking the puzzle…',
      coin_drop:'Your Coin Drop round is complete!',panda_slots:'The slot result is ready!',mystery_box:'Opening your mystery box…',panda_target:'Locking onto the target…'
    };
    setGameResult(results[selected.activity_key]??'Calculating your result…');setGameStep(3);
  }
  return <section className="daily-activities-panel">
    <div className="daily-activities-heading"><div><p className="eyebrow">YOUR 7-DAY CHALLENGE</p><h2>Daily Activities</h2><p>Claim your daily login reward, then complete the activity assigned for the day.</p></div><span className="daily-streak-mark">🐼 <b>{completed.length}/7</b><small>days complete</small></span></div>
    {notice&&<div className="notice inline-notice">{notice}<button type="button" onClick={()=>setNotice('')}>×</button></div>}
    {loading?<div className="empty-state">Loading your daily activities…</div>:<>
      <div className="daily-activity-tabs">{[{key:'games',label:'🎮 Games'},{key:'sweepstake',label:'🎟️ Sweepstake Room'},{key:'challenges',label:'🏆 Challenges'},{key:'gifts',label:'🎁 Gifts'},{key:'giveaways',label:'🎉 Giveaways'},{key:'icons',label:'✨ Icons'},{key:'rewards',label:'🎒 My Rewards'}].map(tab=><button type="button" key={tab.key} className={activeTab===tab.key?'active':''} onClick={()=>setActiveTab(tab.key as typeof activeTab)}>{tab.label}</button>)}</div>
      {activeTab==='games' && <>
      <div className="daily-week-track">{Array.from({length:7},(_,i)=>{const day=i+1;const done=completed.some(row=>row.day_number===day);return <div key={day} className={done?'daily-day done':day===currentDay?'daily-day current':day<currentDay?'daily-day missed':'daily-day locked'}><span>{done?'✓':day<currentDay?'–':day}</span><small>Day {day}</small></div>})}</div>
      {today?<article className="daily-today-card"><div className="daily-activity-icon">{today.icon}</div><div className="daily-today-copy"><span className="eyebrow">DAY {currentDay} · {today.is_ad_only?'SPONSORED':'TODAY’S CHALLENGE'}</span><h3>{today.title}</h3><p>{today.description}</p><div className="daily-reward-line"><span>Reward</span><strong>{today.is_ad_only?'Ad verification required':today.reward_bc+' BC'}</strong></div>{todayCompleted?<span className="daily-completed-label">✓ Completed today</span>:!today.enabled||!today.activity_enabled?<span className="daily-completed-label">Unavailable — check back later</span>:<button type="button" className="primary-button" disabled={busy} onClick={()=>beginActivity(today)}>{today.is_ad_only?'Sponsored activity · Setup required':'Start today’s activity →'}</button>}</div></article>:<div className="empty-state">Today’s activity has not been assigned yet.</div>}
      {isAdmin&&<div className="daily-activity-library"><div className="section-title-row"><div><h3>Activity library</h3></div></div><div className="daily-library-grid">{catalog.map(item=><article key={item.activity_key} className={'daily-library-card '+(today?.activity_key===item.activity_key?'assigned':'')}><span>{item.icon}</span><strong>{item.title}</strong><small>{item.is_ad_only?'Sponsored · no BC until ad verification':item.enabled?'Available in the activity rotation':'Currently disabled'}</small>{today?.activity_key===item.activity_key&&<em>Assigned today</em>}</article>)}</div></div>}
      {isAdmin&&<div className="daily-admin-schedule"><div className="section-title-row"><div><h3>7-day schedule</h3></div></div>{schedule.map(row=>{const d=drafts[row.day_number]??{activity_key:row.activity_key,reward_bc:String(row.reward_bc),enabled:row.enabled};return <div className="daily-admin-row" key={row.day_number}><strong>Day {row.day_number}</strong><select value={d.activity_key} onChange={e=>setDrafts(old=>({...old,[row.day_number]:{...d,activity_key:e.target.value}}))}>{catalog.map(c=><option key={c.activity_key} value={c.activity_key}>{c.title}</option>)}</select><label><span>BC reward</span><input type="number" min="0" value={d.reward_bc} onChange={e=>setDrafts(old=>({...old,[row.day_number]:{...d,reward_bc:e.target.value}}))}/></label><label className="daily-enabled-toggle"><input type="checkbox" checked={d.enabled} onChange={e=>setDrafts(old=>({...old,[row.day_number]:{...d,enabled:e.target.checked}}))}/> Enabled</label><button type="button" className="secondary-button" disabled={busy} onClick={()=>void saveDay(row.day_number)}>Save</button></div>})}</div>}
      </>}
      {activeTab!=='games' && activeTab!=='rewards' && <>
        {isAdmin && <form className="daily-campaign-admin" onSubmit={e=>{e.preventDefault();void createCampaign();}}>
          <h3>Create {activeTab==='sweepstake'?'sweepstake':activeTab==='challenges'?'challenge':activeTab==='gifts'?'gift activity':activeTab==='giveaways'?'giveaway':'icon reward'}</h3>
          <div className="daily-campaign-form-grid">
            <label>Title<input required maxLength={120} value={campaignDraft.title} onChange={e=>setCampaignDraft(d=>({...d,title:e.target.value,campaign_type:activeTab==='sweepstake'?'sweepstake':activeTab==='challenges'?'challenge':activeTab==='gifts'?'gift':activeTab==='giveaways'?'giveaway':'icon'}))} placeholder="Activity title"/></label>
            <label>Icon<input value={campaignDraft.icon} maxLength={12} onChange={e=>setCampaignDraft(d=>({...d,icon:e.target.value}))}/></label>
            <label>Reward type<select value={campaignDraft.prize_type} onChange={e=>setCampaignDraft(d=>({...d,prize_type:e.target.value}))}>{['BC','WC','gift','icon','badge'].map(t=><option key={t} value={t}>{t==='BC'?'Panda Coins (BC)':t==='WC'?'Wallet Coins (WC)':t}</option>)}</select></label>
            <label>Reward amount<input type="number" min="0" value={campaignDraft.prize_amount} onChange={e=>setCampaignDraft(d=>({...d,prize_amount:e.target.value}))}/></label>
            <label>Reward name<input value={campaignDraft.prize_label} onChange={e=>setCampaignDraft(d=>({...d,prize_label:e.target.value}))} placeholder="Gift, icon or prize name"/></label>
            <label>Entry limit<input type="number" min="1" value={campaignDraft.max_entries} onChange={e=>setCampaignDraft(d=>({...d,max_entries:e.target.value}))} placeholder="Unlimited"/></label>
            <label className="daily-campaign-description">Description<textarea rows={2} value={campaignDraft.description} onChange={e=>setCampaignDraft(d=>({...d,description:e.target.value}))} placeholder="What can members win?"/></label>
          </div>
          <button className="primary-button" type="submit" disabled={busy||!campaignDraft.title.trim()}>{busy?'Publishing…':'Publish activity'}</button>
        </form>}
        <div className="daily-campaign-grid">{campaigns.filter(c=>c.campaign_type===({sweepstake:'sweepstake',challenges:'challenge',gifts:'gift',giveaways:'giveaway',icons:'icon'} as Record<string,string>)[activeTab]).map(c=><article className="daily-campaign-card" key={c.id}>
          <div className="daily-campaign-card-icon">{c.icon}</div><span className={'daily-campaign-status '+c.status}>{c.status==='drawn'?'Winner selected':c.status==='open'?'Open':c.status}</span>
          <h3>{c.title}</h3>{c.description&&<p>{c.description}</p>}
          <div className="daily-campaign-prize"><small>PRIZE</small><strong>{c.prize_label||c.prize_type}{c.prize_amount>0?' · '+c.prize_amount+' '+c.prize_type:''}</strong></div>
          {c.ends_at&&<small>Ends {new Date(c.ends_at).toLocaleString()}</small>}
          {isAdmin&&<small>{entryCounts[c.id]??0} entries</small>}
          {c.winner_id&&<small>Winner selected</small>}
          {c.status==='open'&&!enteredCampaigns.has(c.id)&&<button type="button" className="primary-button full" disabled={busy} onClick={()=>void joinCampaign(c.id)}>Enter now</button>}
          {c.status==='open'&&enteredCampaigns.has(c.id)&&<span className="daily-completed-label">✓ You’re entered</span>}
          {isAdmin&&(c.status==='open'||c.status==='closed')&&<button type="button" className="secondary-button full" disabled={busy||!(entryCounts[c.id]>0)} onClick={()=>void drawCampaign(c.id)}>Draw winner</button>}
          {c.status==='drawn'&&isAdmin&&<small>Winner ID: {c.winner_id}</small>}
        </article>)}
        {!campaigns.some(c=>c.campaign_type===({sweepstake:'sweepstake',challenges:'challenge',gifts:'gift',giveaways:'giveaway',icons:'icon'} as Record<string,string>)[activeTab])&&<div className="empty-state">Nothing here yet.</div>}
        </div>
      </>}
      {activeTab==='rewards' && <div className="daily-my-rewards">{myRewards.length?myRewards.map(reward=><article key={reward.id} className="daily-reward-inventory-item"><span>{reward.reward_type==='BC'?'🪙':reward.reward_type==='WC'?'💰':reward.reward_type==='icon'?'✨':reward.reward_type==='badge'?'🏅':'🎁'}</span><div><strong>{reward.reward_label}</strong><small>{reward.reward_amount>0?reward.reward_amount+' '+reward.reward_type+' · ':''}{new Date(reward.created_at).toLocaleDateString()}</small></div></article>):<div className="empty-state">Your rewards will appear here.</div>}</div>}
    {selected&&<div className="daily-game-backdrop"><section className="daily-game-modal" role="dialog" aria-modal="true" aria-label={selected.title}><button type="button" className="daily-game-close" onClick={()=>{setSelected(null);setGameStep(0);setGameResult('');}}>×</button><div className="daily-game-big-icon">{selected.icon}</div><p className="eyebrow">CIRCLE PANDA · DAILY CHALLENGE</p><h2>{selected.title}</h2>{gameStep===0?<><p>{selected.description}</p><p className="daily-game-note">Play the activity round below. Today’s assigned activity can be completed only once.</p>{selected.activity_key==='panda_cup_shuffle'?<div className="daily-game-choices">{['Left cup','Middle cup','Right cup'].map(choice=><button type="button" key={choice} onClick={()=>chooseOption(choice)}>🥤<small>{choice}</small></button>)}</div>:selected.activity_key==='lucky_cards'||selected.activity_key==='mystery_box'?<div className="daily-game-choices">{['Choice 1','Choice 2','Choice 3'].map(choice=><button type="button" key={choice} onClick={()=>chooseOption(choice)}>{selected.activity_key==='lucky_cards'?'🃏':'🎁'}<small>{choice}</small></button>)}</div>:selected.activity_key==='coin_drop'&&gameActive?<div className="daily-live-game"><strong>{gameSeconds}s remaining</strong><div className="daily-score-meter">Round score <b>{gameScore}</b></div><div className="daily-game-choices"><button type="button" disabled={busy} onClick={()=>void recordCoinDrop('coin')}>🪙<small>Catch coin +1 BC</small></button><button type="button" disabled={busy} onClick={()=>void recordCoinDrop('rare_coin')}>✨<small>Rare coin +2 BC</small></button><button type="button" disabled={busy} onClick={()=>void recordCoinDrop('stone')}>🪨<small>Stone −3 BC</small></button></div><p className="daily-game-note">Tap falling items during the 60-second round. The configured daily activity reward is credited separately.</p></div>:selected.activity_key==='panda_slots'&&gameActive?<div className="daily-live-game"><strong>{gameSeconds}s remaining</strong><div className="daily-slot-reels"><span>🐼</span><span>🪙</span><span>🎋</span></div><p>Slots are running. The result is calculated when the timer ends.</p></div>:selected.activity_key==='panda_target'?<div className="daily-game-choices">{['Target left','Bullseye','Target right'].map(choice=><button type="button" key={choice} onClick={()=>chooseOption(choice)}>🎯<small>{choice}</small></button>)}</div>:selected.activity_key==='panda_puzzle'?<div className="daily-game-choices">{['Panda face','Golden coin','Green bamboo'].map(choice=><button type="button" key={choice} onClick={()=>chooseOption(choice)}>🧩<small>{choice}</small></button>)}</div>:selected.activity_key==='guess_sponsor'?<div className="daily-game-choices">{['Sponsor option A','Sponsor option B','Sponsor option C'].map(choice=><button type="button" key={choice} onClick={()=>chooseOption(choice)}>🔎<small>{choice}</small></button>)}</div>:<button type="button" className="primary-button full" onClick={selected.activity_key==='coin_drop'?()=>void startCoinDrop():playStep}>{selected.activity_key==='wheel_spin'?'Spin the wheel →':selected.activity_key==='coin_drop'?'Start Coin Drop →':selected.activity_key==='panda_slots'?'Play slots →':'Reveal the secret →'}</button>}</>:gameStep===1?<><h3>{gameResult}</h3><p>Your activity round is ready to submit.</p><button type="button" className="primary-button full" disabled={busy} onClick={()=>void finishActivity()}>{busy?'Saving…':'Complete activity & claim reward'}</button></>:gameStep===3?<><div className="daily-reveal-spinner" aria-label="Calculating results">✦</div><h3>{gameResult}</h3><p>{selected.activity_key==='coin_drop'?'Revealing your score and BC summary…':'Calculating your slots result…'}</p></>:<><h3>{gameResult}</h3><p>Your progress is saved for this 7-day cycle.</p><button type="button" className="primary-button full" onClick={()=>{setSelected(null);setGameStep(0);setGameResult('');}}>Back to daily activities</button></>}</section></div>}
    <p className="daily-cycle-footnote">Cycle started {cycleStart||'today'}. Each day has one assigned activity. Sponsored-ad rewards remain locked until playback is verified.</p>
  </section>;
}

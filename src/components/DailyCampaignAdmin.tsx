import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';

type Campaign = {
  id:string; campaign_type:'sweepstake'|'challenge'|'gift'|'giveaway'|'icon'; title:string;
  description:string; icon:string; prize_type:'BC'|'WC'|'gift'|'icon'|'badge'; prize_amount:number;
  prize_label:string; starts_at:string; ends_at:string|null; max_entries:number|null;
  status:'draft'|'open'|'closed'|'drawn'; winner_id:string|null; drawn_at:string|null; created_at:string;
};
const TYPES: Campaign['campaign_type'][] = ['sweepstake','challenge','gift','giveaway','icon'];
const PRIZES: Campaign['prize_type'][] = ['BC','WC','gift','icon','badge'];
const localDateTime = (date:Date) => {
  const pad=(n:number)=>String(n).padStart(2,'0');
  return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+'T'+pad(date.getHours())+':'+pad(date.getMinutes());
};
export default function DailyCampaignAdmin({userId}:{userId:string}) {
  const [rows,setRows]=useState<Campaign[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState('');
  const [notice,setNotice]=useState('');
  const [kind,setKind]=useState<Campaign['campaign_type']>('sweepstake');
  const [title,setTitle]=useState('');
  const [description,setDescription]=useState('');
  const [icon,setIcon]=useState('🎁');
  const [prizeType,setPrizeType]=useState<Campaign['prize_type']>('BC');
  const [prizeAmount,setPrizeAmount]=useState('100');
  const [prizeLabel,setPrizeLabel]=useState('100 BC');
  const [startsAt,setStartsAt]=useState(localDateTime(new Date()));
  const [endsAt,setEndsAt]=useState('');
  const [maxEntries,setMaxEntries]=useState('');
  const [status,setStatus]=useState<'draft'|'open'>('draft');

  const load=useCallback(async()=>{
    if(!supabase){setNotice('Supabase is not configured.');setLoading(false);return;}
    const {data,error}=await supabase.from('daily_activity_campaigns')
      .select('id,campaign_type,title,description,icon,prize_type,prize_amount,prize_label,starts_at,ends_at,max_entries,status,winner_id,drawn_at,created_at')
      .order('created_at',{ascending:false}).limit(100);
    if(error)setNotice(error.message);
    else setRows((data??[]) as Campaign[]);
    setLoading(false);
  },[]);
  useEffect(()=>{void load();},[load,userId]);

  async function create(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!supabase||busy)return;
    if(endsAt && new Date(endsAt).getTime()<=new Date(startsAt).getTime()){setNotice('End time must be later than the start time.');return;}
    setBusy('create');setNotice('');
    const {error}=await supabase.rpc('admin_create_daily_activity_campaign',{
      p_campaign_type:kind,p_title:title.trim(),p_description:description.trim(),p_icon:icon.trim()||'🎁',
      p_prize_type:prizeType,p_prize_amount:Math.max(0,Math.floor(Number(prizeAmount)||0)),
      p_prize_label:prizeLabel.trim(),p_starts_at:new Date(startsAt).toISOString(),
      p_ends_at:endsAt?new Date(endsAt).toISOString():null,
      p_max_entries:maxEntries?Math.max(1,Math.floor(Number(maxEntries))):null,p_status:status
    });
    if(error)setNotice(error.message);
    else{setNotice('Campaign created and saved.');setTitle('');setDescription('');await load();}
    setBusy(''); 
  }
  async function act(row:Campaign,action:'open'|'close'|'draw'){
    if(!supabase||busy)return;
    if(action==='draw'&&!window.confirm('Draw a winner now? This action is final and may award the configured prize.'))return;
    setBusy(row.id);setNotice('');
    const rpcName=action==='draw'?'admin_draw_daily_activity_campaign':action==='close'?'admin_close_daily_activity_campaign':'admin_publish_daily_activity_campaign';
    const {data,error}=await supabase.rpc(rpcName,{p_campaign_id:row.id});
    if(error)setNotice(error.message);
    else{
      const result=data as {winner_id?:string;message?:string}|null;
      setNotice(action==='draw'?(result?.winner_id?'Winner selected: '+result.winner_id:'Draw completed. Check campaign status and reward ledger.'):action==='close'?'Campaign closed.':'Campaign published and open for entries.');
      await load();
    }
    setBusy('');
  }
  return <section className="admin-dashboard-section" id="admin-daily-campaigns">
    <div className="section-title-row"><div><h3>Sweepstakes, giveaways, gifts &amp; challenge campaigns</h3><p className="feature-copy">Create and manage campaigns saved in Supabase. Entries and prize draws use server-side admin/member RPCs.</p></div><button type="button" className="secondary-button" onClick={()=>void load()} disabled={loading||Boolean(busy)}>Refresh</button></div>
    {notice&&<div className="notice inline-notice">{notice}<button type="button" onClick={()=>setNotice('')}>×</button></div>}
    <form className="global-action-admin-form" onSubmit={event=>void create(event)}>
      <div className="global-action-field-grid">
        <label>Campaign type<select value={kind} onChange={e=>setKind(e.target.value as Campaign['campaign_type'])}>{TYPES.map(x=><option key={x} value={x}>{x[0].toUpperCase()+x.slice(1)}</option>)}</select></label>
        <label>Icon / emoji<input value={icon} maxLength={12} onChange={e=>setIcon(e.target.value)} required/></label>
      </div>
      <label>Campaign title<input value={title} maxLength={120} onChange={e=>setTitle(e.target.value)} required minLength={1}/></label>
      <label>Member instructions<textarea rows={3} maxLength={2000} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Explain eligibility, how to enter, and how the prize is awarded."/></label>
      <div className="global-action-field-grid">
        <label>Prize type<select value={prizeType} onChange={e=>setPrizeType(e.target.value as Campaign['prize_type'])}>{PRIZES.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
        <label>Prize amount<input type="number" min="0" step="1" value={prizeAmount} onChange={e=>setPrizeAmount(e.target.value)} required/></label>
      </div>
      <label>Prize label<input value={prizeLabel} maxLength={120} onChange={e=>setPrizeLabel(e.target.value)} placeholder="e.g. 100 BC or Premium Panda Gift"/></label>
      <div className="global-action-field-grid">
        <label>Starts at<input type="datetime-local" value={startsAt} onChange={e=>setStartsAt(e.target.value)} required/></label>
        <label>Ends at (optional)<input type="datetime-local" value={endsAt} onChange={e=>setEndsAt(e.target.value)}/></label>
      </div>
      <div className="global-action-field-grid">
        <label>Maximum entries (blank = unlimited)<input type="number" min="1" step="1" value={maxEntries} onChange={e=>setMaxEntries(e.target.value)}/></label>
        <label>Initial status<select value={status} onChange={e=>setStatus(e.target.value as 'draft'|'open')}><option value="draft">Draft</option><option value="open">Open for entries</option></select></label>
      </div>
      <button type="submit" className="primary-button" disabled={busy==='create'}>{busy==='create'?'Creating…':'Create campaign and save'}</button>
    </form>
    <div className="admin-campaign-list">
      {loading?<div className="empty-state">Loading campaigns…</div>:rows.length===0?<div className="empty-state">No activity campaigns yet. Create the first one above.</div>:rows.map(row=><article className="admin-campaign-row" key={row.id}>
        <div className="admin-campaign-icon">{row.icon}</div><div className="admin-campaign-copy"><strong>{row.title}</strong><small>{row.campaign_type} · {row.prize_label||row.prize_type+' '+row.prize_amount} · {new Date(row.starts_at).toLocaleString()}</small><span>{row.description||'No additional instructions.'}</span><small>Entries limit: {row.max_entries??'Unlimited'} · Status: <b>{row.status}</b>{row.winner_id?' · Winner recorded':''}</small></div>
        <div className="admin-campaign-actions">{row.status==='draft'&&<button type="button" className="primary-button" disabled={Boolean(busy)} onClick={()=>void act(row,'open')}>{busy===row.id?'Publishing…':'Publish / open entries'}</button>}{row.status==='open'&&<button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={()=>void act(row,'close')}>{busy===row.id?'Saving…':'Close entries'}</button>}{(row.status==='open'||row.status==='closed')&&<button type="button" className="primary-button" disabled={Boolean(busy)} onClick={()=>void act(row,'draw')}>{busy===row.id?'Drawing…':'Draw winner'}</button>}</div>
      </article>)}
    </div>
  </section>;
}

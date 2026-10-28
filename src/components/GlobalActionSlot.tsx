import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';

type SectionName = 'Confessions' | 'Crush' | 'Dating' | 'Events' | 'Groups' | 'Messages' | 'HotSeat' | 'DailyActivities' | 'VIP' | 'Wallet';
type ActionType = 'navigate' | 'popup' | 'ad' | 'giveaway';
type SlotConfig = {
  slot_key: string;
  enabled: boolean;
  catalog_key: string;
  action_key: string;
  icon: string;
  label: string;
  description: string;
  action_type: ActionType;
  destination: string;
  popup_title: string;
  popup_body: string;
  target_url: string | null;
  updated_at?: string;
};
type Draft = Omit<SlotConfig, 'slot_key' | 'updated_at' | 'target_url'> & { target_url:string };
const LIBRARY = [
  { key:'hot_seat', label:'Hot Seat', icon:'🔥', title:'HOT SEAT', description:'Questions, gifts and the next seat', action:'navigate' as ActionType, destination:'HotSeat' },
  { key:'daily_activities', label:'Daily Activities', icon:'🎯', title:'DAILY ACTIVITIES', description:'Games, daily challenges and rewards', action:'navigate' as ActionType, destination:'DailyActivities' },
  { key:'games', label:'Games library', icon:'🎮', title:'PLAY GAMES', description:'Open the games and challenge library', action:'navigate' as ActionType, destination:'DailyActivities' },
  { key:'sweepstake_room', label:'Sweepstake Room', icon:'🎟️', title:'SWEEPSTAKE', description:'Enter the sweepstake room and read the instructions', action:'giveaway' as ActionType, destination:'DailyActivities' },
  { key:'giveaway', label:'Giveaway', icon:'🎁', title:'GIVEAWAY', description:'See how to join the current giveaway', action:'giveaway' as ActionType, destination:'DailyActivities' },
  { key:'sponsor_ad', label:'Sponsored ad', icon:'📣', title:'SPONSORED', description:'View this sponsor message and continue to the offer', action:'ad' as ActionType, destination:'Events' },
  { key:'confessions', label:'Confessions', icon:'🔒', title:'CONFESSIONS', description:'Open the anonymous confession feed', action:'navigate' as ActionType, destination:'Confessions' },
  { key:'dating', label:'Dating', icon:'💗', title:'DATING', description:'Discover dating profiles and connection requests', action:'navigate' as ActionType, destination:'Dating' },
  { key:'events', label:'Events', icon:'📅', title:'EVENTS', description:'Explore events and invitations', action:'navigate' as ActionType, destination:'Events' },
  { key:'groups', label:'Groups', icon:'👥', title:'GROUPS', description:'Find groups and communities', action:'navigate' as ActionType, destination:'Groups' },
  { key:'wcw_mcm', label:'WCW / MCM', icon:'👑', title:'WCW / MCM', description:'Open the weekly crush feed', action:'navigate' as ActionType, destination:'Crush' },
  { key:'messages', label:'Messages', icon:'💬', title:'MESSAGES', description:'Open message requests and chats', action:'navigate' as ActionType, destination:'Messages' },
  { key:'wallet', label:'Wallet', icon:'🪙', title:'PANDA WALLET', description:'Open your BC wallet', action:'navigate' as ActionType, destination:'Wallet' },
  { key:'vip', label:'VIP', icon:'✨', title:'VIP CIRCLE', description:'Explore VIP membership and benefits', action:'navigate' as ActionType, destination:'VIP' },
];
const DEFAULT: Draft = {
  enabled:true, catalog_key:'daily_activities', action_key:'DailyActivities', icon:'🎯', label:'DAILY ACTIVITIES',
  description:'Games, daily challenges and rewards', action_type:'navigate', destination:'DailyActivities',
  popup_title:'Daily Activities', popup_body:'Open today’s activity, read its instructions, and complete the challenge to take part.', target_url:''
};
const DESTINATIONS: Array<{value:SectionName;label:string}> = [
  {value:'HotSeat',label:'Hot Seat'}, {value:'DailyActivities',label:'Daily Activities / Games'},
  {value:'Confessions',label:'Confessions'}, {value:'Dating',label:'Dating'}, {value:'Events',label:'Events'},
  {value:'Groups',label:'Groups'}, {value:'Messages',label:'Messages'}, {value:'Wallet',label:'Wallet'}, {value:'VIP',label:'VIP'}
];
const asDraft = (row: SlotConfig): Draft => ({
  enabled:row.enabled, catalog_key:row.catalog_key, action_key:row.action_key, icon:row.icon, label:row.label,
  description:row.description, action_type:row.action_type, destination:row.destination, popup_title:row.popup_title,
  popup_body:row.popup_body, target_url:row.target_url || ''
});

export default function GlobalActionSlot({ isAdmin, section, onNavigate }: {
  isAdmin:boolean; section:string; onNavigate:(section:SectionName)=>void;
}) {
  const [config,setConfig] = useState<SlotConfig|null>(null);
  const [draft,setDraft] = useState<Draft>(DEFAULT);
  const [popup,setPopup] = useState(false);
  const [saving,setSaving] = useState(false);
  const [loading,setLoading] = useState(true);
  const [notice,setNotice] = useState('');

  async function load() {
    if (!supabase) { setLoading(false); setNotice('Supabase is not configured.'); return; }
    const {data,error} = await supabase.from('global_action_slot').select('*').eq('slot_key','primary').maybeSingle();
    if (error) setNotice(error.message);
    else if (data) {
      const row = (Array.isArray(data) ? data[0] : data) as SlotConfig;
      setConfig(row); setDraft(asDraft(row));
    }
    setLoading(false);
  }
  useEffect(() => {
    void load();
    if (!supabase) return;
    const channel = supabase.channel('global-action-slot-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'global_action_slot'},() => { void load(); })
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, []);

  function chooseLibrary(key:string) {
    const item = LIBRARY.find(option=>option.key===key) || LIBRARY[1];
    setDraft(previous=>({
      ...previous, catalog_key:item.key, action_key:item.destination, icon:item.icon, label:item.title,
      description:item.description, action_type:item.action, destination:item.destination,
      popup_title:item.label, popup_body:item.key==='giveaway' || item.key==='sweepstake_room'
        ? 'Read the giveaway rules, check the eligibility requirements, then follow the steps shown here to enter. Do not submit payment or personal information outside Circle Panda’s approved flow.'
        : item.key==='sponsor_ad' ? 'This sponsored message is provided by a Circle Panda advertiser. Review the offer and choose Continue if you want to visit the sponsor.'
        : 'Tap Continue to open this Circle Panda activity and follow the instructions on the destination page.',
    }));
  }

  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !isAdmin || saving) return;
    setSaving(true); setNotice('');
    const {data,error} = await supabase.rpc('admin_configure_global_action_slot',{
      p_enabled:draft.enabled, p_catalog_key:draft.catalog_key, p_action_key:draft.action_key,
      p_icon:draft.icon.trim(), p_label:draft.label.trim(), p_description:draft.description.trim(),
      p_action_type:draft.action_type, p_destination:draft.destination, p_popup_title:draft.popup_title.trim(),
      p_popup_body:draft.popup_body.trim(), p_target_url:draft.target_url.trim() || null
    });
    if (error) setNotice(error.message);
    else {
      const row = (Array.isArray(data) ? data[0] : data) as SlotConfig;
      setConfig(row); setDraft(asDraft(row)); setNotice('Universal action icon saved. It will update across the app.');
    }
    setSaving(false);
  }

  function activate() {
    if (!config?.enabled) return;
    if (config.action_type === 'navigate') {
      onNavigate((config.destination || config.action_key) as SectionName);
      return;
    }
    setPopup(true);
  }
  function continueAction() {
    if (!config) return;
    if (config.action_type==='ad' && config.target_url) {
      window.open(config.target_url,'_blank','noopener,noreferrer');
      setPopup(false);
      return;
    }
    onNavigate((config.destination || config.action_key) as SectionName);
    setPopup(false);
  }

  const showFloating = Boolean(config?.enabled) && section!=='Profile' && section!=='Admin';
  return <>
    {isAdmin && section==='Admin' && <section id="admin-global-slot" className="global-action-admin-panel">
      <div className="global-action-admin-heading"><div><p className="eyebrow">UNIVERSAL FLOATING ICON</p><h2>Global activity &amp; promotion slot</h2><p>Choose what every member sees in the fixed lower-left icon position. It can launch an app page, open giveaway instructions, or show a sponsor ad popup. The choice is saved in Supabase and updates across the app.</p></div><span className="global-action-admin-badge">ADMIN ONLY</span></div>
      {notice && <div className="notice inline-notice">{notice}<button type="button" onClick={()=>setNotice('')}>×</button></div>}
      {loading ? <div className="empty-state">Loading global icon settings…</div> : <form className="global-action-admin-form" onSubmit={event=>void save(event)}>
        <label className="global-action-enabled"><input type="checkbox" checked={draft.enabled} onChange={event=>setDraft(p=>({...p,enabled:event.target.checked}))}/> Show the universal icon to members</label>
        <label>Choose from the activity library<select value={draft.catalog_key} onChange={event=>chooseLibrary(event.target.value)}>{LIBRARY.map(item=><option key={item.key} value={item.key}>{item.icon} {item.label}</option>)}</select></label>
        <div className="global-action-field-grid">
          <label>Icon / emoji<input value={draft.icon} maxLength={12} onChange={event=>setDraft(p=>({...p,icon:event.target.value}))} required/></label>
          <label>Icon label<input value={draft.label} maxLength={32} onChange={event=>setDraft(p=>({...p,label:event.target.value}))} required/></label>
        </div>
        <label>Short description<input value={draft.description} maxLength={180} onChange={event=>setDraft(p=>({...p,description:event.target.value}))}/></label>
        <label>What happens when clicked?<select value={draft.action_type} onChange={event=>setDraft(p=>({...p,action_type:event.target.value as ActionType}))}><option value="navigate">Open the selected app page</option><option value="popup">Show a popup with directions</option><option value="giveaway">Show giveaway / sweepstake instructions</option><option value="ad">Show sponsor ad popup</option></select></label>
        <label>Destination / landing page<select value={draft.destination} onChange={event=>setDraft(p=>({...p,destination:event.target.value,action_key:event.target.value}))}>{DESTINATIONS.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        {draft.action_type!=='navigate' && <>
          <label>Popup title<input value={draft.popup_title} maxLength={80} onChange={event=>setDraft(p=>({...p,popup_title:event.target.value}))} required/></label>
          <label>Instructions / ad message<textarea rows={4} value={draft.popup_body} maxLength={1500} onChange={event=>setDraft(p=>({...p,popup_body:event.target.value}))} required/></label>
        </>}
        {draft.action_type==='ad' && <label>Sponsor destination URL<input type="url" value={draft.target_url} placeholder="https://sponsor.example/offer" onChange={event=>setDraft(p=>({...p,target_url:event.target.value}))}/><small>The ad opens in a new tab only after a member taps the popup’s Continue button.</small></label>}
        <div className="global-action-preview"><span>{draft.icon || '✦'}</span><div><strong>{draft.label || 'Activity'}</strong><small>{draft.description || 'Your selected Circle Panda action'}</small></div></div>
        <button className="primary-button" type="submit" disabled={saving}>{saving?'Saving…':'Save universal icon settings'} <span>✓</span></button>
      </form>}
    </section>}
    {showFloating && config && <button type="button" className="global-action-float" onClick={activate} aria-label={config.label} title={config.description}>
      <span className="global-action-float-icon">{config.icon}</span><span className="global-action-float-copy"><strong>{config.label}</strong><small>{config.description}</small></span><span className="global-action-float-arrow">↗</span>
    </button>}
    {popup && config && <div className="global-action-backdrop" onClick={()=>setPopup(false)}><section className="global-action-popup" role="dialog" aria-modal="true" aria-labelledby="global-action-popup-title" onClick={event=>event.stopPropagation()}>
      <button type="button" className="global-action-popup-close" aria-label="Close popup" onClick={()=>setPopup(false)}>×</button>
      <div className="global-action-popup-icon">{config.icon}</div><p className="eyebrow">{config.action_type==='ad'?'SPONSORED MESSAGE':config.action_type==='giveaway'?'GIVEAWAY / SWEEPSTAKE':'CIRCLE PANDA ACTIVITY'}</p>
      <h2 id="global-action-popup-title">{config.popup_title}</h2><p className="global-action-popup-body">{config.popup_body}</p>
      <div className="global-action-popup-actions"><button type="button" className="primary-button" onClick={continueAction}>{config.action_type==='ad'?'Continue to sponsor':config.action_type==='giveaway'?'Continue to entry page':'Open activity'} <span>→</span></button><button type="button" className="secondary-button" onClick={()=>setPopup(false)}>Not now</button></div>
    </section></div>}
  </>;
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from './lib/supabase';

type HotSession = {
  id:string; host_id:string; status:'bidding'|'preparing'|'live'|'water_break'|'ended'|'evicted';
  title:string; started_at:string|null; ends_at:string|null; break_started_at:string|null; paused_at?:string|null; pause_until?:string|null;
  next_host_decision_deadline:string|null; preparation_deadline:string|null; created_at:string;
  host_evicted_at?:string|null; host_eviction_reason?:string|null;
};
type HotQuestion = {id:string;session_id:string;asker_id:string;body:string;question_type:string;status:string;answer:string|null;asked_at:string;answer_deadline:string;answered_at:string|null;host_earnings_bc:number};
type HotComment = {id:string;session_id:string;user_id:string;body:string;created_at:string};
type HotReaction = {id:string;session_id:string;user_id:string;reaction:string;created_at:string};
type HotGift = {id:string;name:string;emoji:string;price_bc:number;enabled:boolean;sort_order:number};
type HotGiftTx = {id:string;session_id:string;sender_id:string;host_id:string;gift_id:string;quantity:number;total_bc:number;host_earnings_bc:number;created_at:string};
type HotBid = {id:string;session_id:string;bidder_id:string;amount_bc:number;status:string;created_at:string;decided_at:string|null};
type BreakActivity = {id:string;title:string;description:string;activity_type:string;enabled:boolean;sort_order:number};
type Props = {userId:string;onOpenWallet:()=>void;isAdmin?:boolean};
type HotSetting = {setting_key:string;numeric_value:number};

const reactionOptions = [{id:'like',emoji:'👍',label:'Like'},{id:'love',emoji:'❤️',label:'Love'},{id:'laugh',emoji:'😂',label:'Laugh'},{id:'wow',emoji:'😮',label:'Wow'},{id:'fire',emoji:'🔥',label:'Fire'},{id:'clap',emoji:'👏',label:'Clap'}];
const formatRemaining = (ms:number) => { const sec=Math.max(0,Math.floor(ms/1000)); return [Math.floor(sec/3600),Math.floor((sec%3600)/60),sec%60].map(n=>String(n).padStart(2,'0')).join(':'); };

export default function HotSeatFeature({userId,onOpenWallet,isAdmin=false}:Props) {
  const [session,setSession]=useState<HotSession|null>(null);
  const [questions,setQuestions]=useState<HotQuestion[]>([]);
  const [comments,setComments]=useState<HotComment[]>([]);
  const [reactions,setReactions]=useState<HotReaction[]>([]);
  const [gifts,setGifts]=useState<HotGift[]>([]);
  const [giftTx,setGiftTx]=useState<HotGiftTx[]>([]);
  const [bids,setBids]=useState<HotBid[]>([]);
  const [activities,setActivities]=useState<BreakActivity[]>([]);
  const [adminSettings,setAdminSettings]=useState<HotSetting[]>([]);
  const [publicSettings,setPublicSettings]=useState<Record<string,number>>({});
  const [settingDrafts,setSettingDrafts]=useState<Record<string,string>>({});
  const [giftPriceDrafts,setGiftPriceDrafts]=useState<Record<string,string>>({});
  const [names,setNames]=useState<Record<string,string>>({});
  const [balance,setBalance]=useState<number|null>(null);
  const [now,setNow]=useState(Date.now());
  const [questionDraft,setQuestionDraft]=useState('');
  const [questionType,setQuestionType]=useState<'standard'|'custom'>('standard');
  const [answerDrafts,setAnswerDrafts]=useState<Record<string,string>>({});
  const [commentDraft,setCommentDraft]=useState('');
  const [bidDraft,setBidDraft]=useState('');
  const [busy,setBusy]=useState('');
  const [notice,setNotice]=useState('');
  const [giftBurst,setGiftBurst]=useState<HotGiftTx|null>(null);
  const seenGiftId=useRef<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [expandedComments,setExpandedComments]=useState(true);
  const [showAllQuestions,setShowAllQuestions]=useState(false);

  const load = useCallback(async () => {
    if (!supabase) {setNotice('Supabase is not configured.');setLoading(false);return;}
    try {
      await supabase.rpc('hot_seat_sync_pause');
      await supabase.rpc('hot_seat_sync_lifecycle');
      const {data:boot,error:bootError}=await supabase.rpc('hot_seat_bootstrap');
      if (bootError) throw bootError;
      const bootRow=(boot as {session?:HotSession}|null)?.session;
      const {data:activeRows,error:sessionError}=await supabase.from('hot_seat_sessions')
        .select('id,host_id,status,title,started_at,ends_at,break_started_at,next_host_decision_deadline,preparation_deadline,created_at,host_evicted_at,host_eviction_reason,paused_at,pause_until')
        .in('status',['bidding','preparing','live','water_break']).order('created_at',{ascending:false}).limit(1);
      if (sessionError) throw sessionError;
      const current=((activeRows??[])[0] as HotSession|undefined) ?? bootRow ?? null;
      setSession(current);
      if (!current) {setLoading(false);return;}
      const [q,c,r,g,gt,b,a,wallet,settingResult] = await Promise.all([
        supabase.from('hot_seat_questions').select('id,session_id,asker_id,body,question_type,status,answer,asked_at,answer_deadline,answered_at,host_earnings_bc').eq('session_id',current.id).order('asked_at',{ascending:false}).limit(100),
        supabase.from('hot_seat_comments').select('id,session_id,user_id,body,created_at').eq('session_id',current.id).order('created_at',{ascending:true}).limit(200),
        supabase.from('hot_seat_reactions').select('id,session_id,user_id,reaction,created_at').eq('session_id',current.id),
        supabase.from('hot_seat_gifts').select('id,name,emoji,price_bc,enabled,sort_order').order('sort_order'),
        supabase.from('hot_seat_gift_transactions').select('id,session_id,sender_id,host_id,gift_id,quantity,total_bc,host_earnings_bc,created_at').eq('session_id',current.id).order('created_at',{ascending:false}).limit(30),
        supabase.from('hot_seat_bids').select('id,session_id,bidder_id,amount_bc,status,created_at,decided_at').eq('session_id',current.id).in('status',['pending','selected','won','refunded','declined','expired']).order('amount_bc',{ascending:false}).limit(100),
        supabase.from('hot_seat_water_break_activities').select('id,title,description,activity_type,enabled,sort_order').order('sort_order'),
        supabase.from('wallet_accounts').select('bc_balance').eq('user_id',userId).maybeSingle(),
        supabase.from('hot_seat_settings').select('setting_key,numeric_value'),
      ]);
      if (q.error) throw q.error;
      if (c.error) throw c.error;
      if (r.error) throw r.error;
      setQuestions((q.data??[]) as HotQuestion[]);
      setComments((c.data??[]) as HotComment[]);
      setReactions((r.data??[]) as HotReaction[]);
      setGifts(((g.data??[]) as HotGift[]).filter(item=>item.enabled||isAdmin));
      setGiftPriceDrafts(Object.fromEntries(((g.data??[]) as HotGift[]).map(item=>[item.id,String(item.price_bc)])));
      setGiftTx((gt.data??[]) as HotGiftTx[]);
      setBids((b.data??[]) as HotBid[]);
      setActivities(((a.data??[]) as BreakActivity[]).filter(item=>item.enabled||isAdmin));
      if(isAdmin){setAdminSettings(settingRows.filter(row=>!['comment_ad_interval','question_ad_interval'].includes(row.setting_key)));setSettingDrafts(Object.fromEntries(settingRows.filter(row=>!['comment_ad_interval','question_ad_interval'].includes(row.setting_key)).map(row=>[row.setting_key,String(row.numeric_value)])));}
      setBalance(wallet.data ? Number(wallet.data.bc_balance) : null);
      const settingRows=(settingResult.data??[]) as HotSetting[];
      setPublicSettings(Object.fromEntries(settingRows.map(row=>[row.setting_key,Number(row.numeric_value)])));
      const ids=[current.host_id,...(q.data??[]).map((x:any)=>x.asker_id),...(c.data??[]).map((x:any)=>x.user_id),...(b.data??[]).map((x:any)=>x.bidder_id),...(gt.data??[]).flatMap((x:any)=>[x.sender_id,x.host_id])];
      const unique=[...new Set(ids)];
      if(unique.length){
        const {data:profiles}=await supabase.from('profiles').select('id,display_name,username').in('id',unique);
        setNames(Object.fromEntries((profiles??[]).map((p:any)=>[p.id,p.display_name||p.username||'Panda'])));
      }
    } catch(e) {setNotice(e instanceof Error?e.message:'Could not load Hot Seat.');}
    finally {setLoading(false);}
  },[userId,isAdmin]);

  useEffect(()=>{void load();const poll=window.setInterval(()=>void load(),12000);const clock=window.setInterval(()=>setNow(Date.now()),1000);return()=>{window.clearInterval(poll);window.clearInterval(clock);};},[load]);
  useEffect(()=>{if(!giftTx.length)return;const newest=giftTx[0];if(seenGiftId.current===null){seenGiftId.current=newest.id;return;}if(seenGiftId.current!==newest.id){seenGiftId.current=newest.id;setGiftBurst(newest);const timer=window.setTimeout(()=>setGiftBurst(null),4500);return()=>window.clearTimeout(timer);}},[giftTx]);

  const currentHost=session?.host_id===userId;
  const topBid=useMemo(()=>bids.filter(b=>['pending','selected','won'].includes(b.status)).sort((a,b)=>Number(b.amount_bc)-Number(a.amount_bc)||new Date(a.created_at).getTime()-new Date(b.created_at).getTime())[0]??null,[bids]);
  const myBid=bids.find(b=>b.bidder_id===userId&&['pending','selected','won'].includes(b.status));
  const myReactions=reactions.filter(r=>r.user_id===userId).map(r=>r.reaction);
  const likeCount=reactions.filter(r=>r.reaction==='like').length;
  const hostGifts=giftTx.filter(g=>g.host_id===session?.host_id).reduce((sum,g)=>sum+Number(g.host_earnings_bc),0);
  const questionEarnings=questions.reduce((sum,q)=>sum+Number(q.host_earnings_bc||0),0);
  const totalHostEarnings=hostGifts+questionEarnings;
  const totalGiftSpend=giftTx.reduce((sum,g)=>sum+Number(g.total_bc),0);
  const isPaused=Boolean(session?.paused_at&&session?.pause_until&&new Date(session.pause_until).getTime()>now);
  const endTime=session?.status==='live'&&isPaused&&session?.pause_until?new Date(session.pause_until).getTime():session?.status==='live'&&session.ends_at?new Date(session.ends_at).getTime():session?.status==='water_break'&&session.break_started_at?new Date(session.break_started_at).getTime()+waterBreakMinutes*60*1000:null;
  const timeLeft=endTime?formatRemaining(endTime-now):null;
  const questionStandardCost=Number(publicSettings.question_standard_cost??25);
  const questionCustomCost=Number(publicSettings.question_custom_cost??75);
  const questionCost=questionType==='custom'?questionCustomCost:questionStandardCost;
  const hostSharePercent=Number(publicSettings.host_earnings_percent??20);
  const waterBreakMinutes=Number(publicSettings.water_break_minutes??60);
  const pendingQuestions=questions.filter(q=>q.status==='pending');

  async function act(key:string,fn:()=>Promise<unknown>,success:string) {
    if(busy)return;setBusy(key);setNotice('');
    try {await fn();setNotice(success);await load();window.dispatchEvent(new Event('circle-panda-wallet-updated'));}
    catch(e){setNotice(e instanceof Error?e.message:'Action failed. Please try again.');}
    finally{setBusy('');}
  }
  async function startSession(){if(!session||!supabase)return;await act('start',async()=>{const {error}=await supabase!.rpc('hot_seat_start_session',{p_session_id:session.id});if(error)throw error;},'Hot Seat is live! The three-hour session has started.');}
  async function endSession(){if(!session||!supabase)return;await act('end',async()=>{const {error}=await supabase!.rpc('hot_seat_end_session',{p_session_id:session.id,p_evicted:false});if(error)throw error;},'Your Hot Seat session has ended.');}
  async function togglePause(){if(!session||!supabase)return;await act('pause',async()=>{const {error}=await supabase!.rpc(isPaused?'hot_seat_resume_session':'hot_seat_pause_session',{p_session_id:session.id});if(error)throw error;},isPaused?'Hot Seat resumed.':'Hot Seat paused for up to 15 minutes.');}

  async function submitQuestion(e:FormEvent){e.preventDefault();if(!session||!supabase)return;const body=questionDraft.trim();if(!body)return;await act('question',async()=>{const {error}=await supabase!.rpc('hot_seat_ask_question',{p_session_id:session.id,p_body:body,p_question_type:questionType});if(error)throw error;setQuestionDraft('');},'Question sent.');}
  async function answerQuestion(e:FormEvent,q:HotQuestion){e.preventDefault();if(!supabase)return;const answer=(answerDrafts[q.id]||'').trim();if(!answer)return;await act('answer:'+q.id,async()=>{const {error}=await supabase!.rpc('hot_seat_answer_question',{p_question_id:q.id,p_answer:answer});if(error)throw error;setAnswerDrafts(prev=>({...prev,[q.id]:''}));},'Answer published to the Hot Seat.');}
  async function submitComment(e:FormEvent){e.preventDefault();if(!session||!supabase)return;const body=commentDraft.trim();if(!body)return;await act('comment',async()=>{const {error}=await supabase!.from('hot_seat_comments').insert({session_id:session.id,user_id:userId,body});if(error)throw error;setCommentDraft('');},'Comment posted.');}
  async function react(reaction:string){if(!session||!supabase)return;await act('reaction:'+reaction,async()=>{const {error}=await supabase!.rpc('hot_seat_toggle_reaction',{p_session_id:session.id,p_reaction:reaction});if(error)throw error;},'Reaction updated.');}
  async function sendGift(gift:HotGift){if(!session||!supabase)return;await act('gift:'+gift.id,async()=>{const {error}=await supabase!.rpc('hot_seat_send_gift',{p_session_id:session.id,p_gift_id:gift.id,p_quantity:1});if(error)throw error;},gift.name+' gift sent!');}
  async function placeBid(e:FormEvent){e.preventDefault();if(!session||!supabase)return;const amount=Number(bidDraft);if(!Number.isSafeInteger(amount)||amount<1){setNotice('Enter a whole-number bid in BC.');return;}await act('bid',async()=>{const {error}=await supabase!.rpc('hot_seat_place_bid',{p_session_id:session.id,p_amount:amount});if(error)throw error;setBidDraft('');},'Your BC bid is escrowed. Non-selected bidders are refunded when the winner accepts.');}
  async function decideBid(accept:boolean){if(!topBid||!supabase)return;await act(accept?'accept-bid':'decline-bid',async()=>{const {error}=await supabase!.rpc('hot_seat_decide_bid',{p_bid_id:topBid.id,p_accept:accept});if(error)throw error;},accept?'You won the next Hot Seat. You have 15 minutes to prepare after accepting.':'You declined the seat; your bid was refunded.');}
  async function saveAdminSetting(key:string){if(!supabase)return;const value=Number(settingDrafts[key]);if(!Number.isFinite(value)||value<0){setNotice('Enter a valid non-negative setting.');return;}await act('setting:'+key,async()=>{const {error}=await supabase!.rpc('hot_seat_admin_update_setting',{p_setting_key:key,p_numeric_value:value});if(error)throw error;},'Hot Seat setting saved.');}
  async function toggleActivity(activity:BreakActivity){if(!supabase)return;await act('activity:'+activity.id,async()=>{const {error}=await supabase!.rpc('hot_seat_admin_set_activity',{p_activity_id:activity.id,p_enabled:!activity.enabled});if(error)throw error;},'Water-break activity updated.');}
  async function saveGift(gift:HotGift){if(!supabase)return;const price=Number(giftPriceDrafts[gift.id]);if(!Number.isSafeInteger(price)||price<1){setNotice('Gift price must be a whole number of at least 1 BC.');return;}await act('gift-admin:'+gift.id,async()=>{const {error}=await supabase!.rpc('hot_seat_admin_update_gift',{p_gift_id:gift.id,p_price_bc:price,p_enabled:gift.enabled});if(error)throw error;},'Gift price saved.');}


  if(loading&&!session)return <section className="hot-seat-shell"><div className="hot-seat-loading">Loading Hot Seat…</div></section>;
  return <section className="hot-seat-shell">
    <div className="hot-seat-hero"><div className="hot-seat-live-orbit"><span>🔥</span></div><div className="hot-seat-hero-copy"><p className="eyebrow">CIRCLE PANDA LIVE EXPERIENCE</p><h2>HOT <em>SEAT</em></h2><p>Ask bold questions. Show love with gifts. React in real time. Bid for your turn in the spotlight.</p><div className="hot-seat-status-row"><span className={'hot-seat-status status-'+(session?.status||'offline')}>{session?.status==='live'&&isPaused?'⏸ PAUSED':session?.status==='live'?'● LIVE':session?.status==='water_break'?'💧 WATER BREAK':session?.status==='bidding'?'🔨 BIDDING OPEN':session?.status==='preparing'?'⏳ NEXT HOST PREPARING':'OFFLINE'}</span>{timeLeft&&<span className="hot-seat-timer">{session?.status==='live'&&isPaused?'PAUSE RESUMES IN':session?.status==='live'?'SESSION ENDS IN':'BREAK ENDS IN'} {timeLeft}</span>}{endTime&&endTime-now>0&&endTime-now<=300000&&<span className="hot-seat-five-minute-warning">⚠ 5-MINUTE WARNING</span>}</div></div></div>
    {notice&&<div className="notice hot-seat-notice" role="status">{notice}<button type="button" onClick={()=>setNotice('')}>×</button></div>}
    {giftBurst&&<div className="hot-seat-gift-burst" role="status"><span>{gifts.find(g=>g.id===giftBurst.gift_id)?.emoji||'🎁'}</span><div><strong>{names[giftBurst.sender_id]||'A Panda'} sent a gift!</strong><small>{gifts.find(g=>g.id===giftBurst.gift_id)?.name||'Hot Seat gift'} · {giftBurst.total_bc} BC</small></div></div>}
    <div className="hot-seat-stats"><article><span>🪙</span><strong>{balance===null?'—':balance.toLocaleString()}</strong><small>YOUR BC BALANCE</small></article><article><span>💗</span><strong>{likeCount.toLocaleString()}</strong><small>LIKES</small></article><article><span>🎁</span><strong>{totalGiftSpend.toLocaleString()} BC</strong><small>GIFTS SENT</small></article><article><span>👑</span><strong>{totalHostEarnings.toLocaleString()} BC</strong><small>HOST EARNINGS</small></article><article><span>❓</span><strong>{pendingQuestions.length}</strong><small>QUESTIONS WAITING</small></article></div>
    {session?.status==='preparing'&&session.host_id===userId&&<div className="hot-seat-callout"><div><strong>Your next Hot Seat is reserved!</strong><p>Accepting a winning bid gives you 15 minutes to prepare. Start when you are ready.</p></div><button className="hot-seat-gold-button" disabled={Boolean(busy)} onClick={()=>void startSession()}>{busy==='start'?'Starting…':'Go Live'}</button></div>}
    {session?.status==='bidding'&&currentHost&&!session.host_evicted_at&&<div className="hot-seat-callout"><div><strong>You have the seat.</strong><p>Start your three-hour session. Questions, comments, gifts and reactions are enabled once live.</p></div><button className="hot-seat-gold-button" disabled={Boolean(busy)} onClick={()=>void startSession()}>{busy==='start'?'Starting…':'Start Hot Seat'}</button></div>}
    {session?.host_evicted_at&&<div className="hot-seat-callout hot-seat-warning"><div><strong>The host was removed from the seat.</strong><p>{session.host_eviction_reason||'A question timed out without an answer. Bidding is open for the next host.'}</p></div></div>}
    {(session?.status==='live'||session?.status==='water_break')&&<div className="hot-seat-host-strip"><div className="hot-seat-host-avatar">🐼</div><div><small>{session.status==='live'?'ON THE HOT SEAT':'CURRENT HOST · WATER BREAK'}</small><strong>{names[session.host_id]||'Panda host'} {currentHost?'(You)':''}</strong><p>{session.status==='live'?(isPaused?'The host has paused the room for up to 15 minutes.':'Answer the questions before their countdowns expire.'):'The host rests while the community enjoys break activities.'}</p></div>{currentHost&&session.status==='live'&&<button className="hot-seat-quiet-button" disabled={Boolean(busy)} onClick={()=>void togglePause()}>{busy==='pause'?'Updating…':isPaused?'Resume session':'Pause · 15 min'}</button>}{currentHost&&<button className="hot-seat-quiet-button" disabled={Boolean(busy)} onClick={()=>void endSession()}>Leave seat</button>}</div>}
    {session?.status==='water_break'&&<div className="hot-seat-break-hub"><div className="hot-seat-break-heading"><span>💧</span><div><p className="eyebrow">RESET · RECHARGE · PLAY</p><h3>Water Break Hub</h3><p>The live seat rests for {waterBreakMinutes} minutes. Choose an activity while bidding continues.</p></div></div><div className="hot-seat-break-grid">{activities.map(a=><article key={a.id}><span>{a.activity_type==='giveaway'?'🎁':a.activity_type==='movie'?'🎬':a.activity_type==='comedy'?'😂':a.activity_type==='vip_glimpse'?'👑':a.activity_type==='secret_stalls'?'🏪':a.activity_type==='game'?'🎮':a.activity_type==='sponsored'?'🤝':'📺'}</span><strong>{a.title}</strong><p>{a.description}</p><small>{a.activity_type==='ad'?'ADMIN-SET AD SLOT':'WATER BREAK ACTIVITY'}</small></article>)}</div></div>}
    <div className="hot-seat-main-grid">
      <div className="hot-seat-primary-column">
        <section className="hot-seat-card"><div className="hot-seat-section-head"><div><p className="eyebrow">SAY IT WITH YOUR CHEST</p><h3>Questions to the host</h3><p>Standard questions cost {questionStandardCost} BC; custom questions cost {questionCustomCost} BC. Each question has a {Number(publicSettings.question_answer_minutes??60)}-minute answer timer.</p></div><span className="hot-seat-section-count">{questions.length}</span></div>
          <form className="hot-seat-question-form" onSubmit={submitQuestion}><label>Question type<select value={questionType} onChange={e=>setQuestionType(e.target.value as 'standard'|'custom')}><option value="standard">Standard · {questionStandardCost} BC</option><option value="custom">Custom · {questionCustomCost} BC</option></select></label><textarea value={questionDraft} onChange={e=>setQuestionDraft(e.target.value)} maxLength={1000} placeholder="Ask the person on the Hot Seat…" required/><div className="hot-seat-form-foot"><small>{questionDraft.length}/1000 · {questionCost} BC</small><button className="hot-seat-gold-button" disabled={Boolean(busy)||isPaused||!questionDraft.trim()||session?.status==='bidding'||session?.status==='preparing'}>{busy==='question'?'Sending…':'Send question'}</button></div></form>
          <div className="hot-seat-question-list">{(showAllQuestions?questions:questions.slice(0,8)).map(q=><article className="hot-seat-question" key={q.id}><div className="hot-seat-question-number">Q</div><div className="hot-seat-question-body"><strong>{names[q.asker_id]||'Panda'} <small>{q.question_type==='custom'?'CUSTOM · 75 BC':'STANDARD · 25 BC'}</small></strong><p>{q.body}</p>{q.status==='pending'?<div className="hot-seat-question-clock">⏱ {formatRemaining(new Date(q.answer_deadline).getTime()-now)} {new Date(q.answer_deadline).getTime()-now>0&&new Date(q.answer_deadline).getTime()-now<=300000?'· 5-MINUTE WARNING':'to answer'}</div>:q.status==='answered'?<div className="hot-seat-answer"><b>HOST ANSWER</b><p>{q.answer}</p></div>:<div className="hot-seat-expired">This question expired unanswered.</div>}{currentHost&&q.status==='pending'&&<form className="hot-seat-answer-form" onSubmit={e=>void answerQuestion(e,q)}><input value={answerDrafts[q.id]||''} onChange={e=>setAnswerDrafts(prev=>({...prev,[q.id]:e.target.value}))} maxLength={2000} placeholder="Type your answer…" required/><button disabled={Boolean(busy)} className="hot-seat-quiet-button">{busy==='answer:'+q.id?'Posting…':'Answer'}</button></form>}</div></article>)}{questions.length>8&&<button className="hot-seat-text-button" onClick={()=>setShowAllQuestions(v=>!v)}>{showAllQuestions?'Show fewer questions':'Show all questions'}</button>}{questions.length>=5&&<div className="hot-seat-ad-slot"><span>AD</span><div><strong>Sponsored question break</strong><p>Reserved ad placement after every five questions. Provider connection is required to serve paid campaigns.</p></div></div>}{questions.length===0&&<div className="hot-seat-empty">Be the first to ask a question. The host has one hour to answer it.</div>}</div>
        </section>
        <section className="hot-seat-card"><div className="hot-seat-section-head"><div><p className="eyebrow">THE CROWD IS HERE</p><h3>Live comments</h3><p>Keep it lively and respectful. A sponsored slot appears after every five comments.</p></div><button className="hot-seat-quiet-button" onClick={()=>setExpandedComments(v=>!v)}>{expandedComments?'Collapse':'Expand'}</button></div>
          {expandedComments&&<><form className="hot-seat-comment-form" onSubmit={submitComment}><input value={commentDraft} onChange={e=>setCommentDraft(e.target.value)} maxLength={1000} placeholder="Say something to the room…" required/><button className="hot-seat-gold-button" disabled={Boolean(busy)||!commentDraft.trim()}>{busy==='comment'?'Posting…':'Comment'}</button></form><div className="hot-seat-comments">{comments.map((c,i)=><div key={c.id}><article className="hot-seat-comment"><span className="hot-seat-comment-avatar">🐼</span><div><strong>{names[c.user_id]||'Panda'}</strong><p>{c.body}</p><small>{new Date(c.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></div></article>{(i+1)%5===0&&<div className="hot-seat-ad-slot compact"><span>AD</span><div><strong>Sponsored comment break</strong><p>Reserved ad placement after every five comments.</p></div></div>}</div>)}</div></>}
        </section>
      </div>
      <aside className="hot-seat-side-column">
        <section className="hot-seat-card hot-seat-reaction-card"><p className="eyebrow">SHOW THE HOST SOME LOVE</p><h3>Reactions</h3><div className="hot-seat-reactions">{reactionOptions.map(r=><button key={r.id} className={myReactions.includes(r.id)?'selected':''} onClick={()=>void react(r.id)} disabled={Boolean(busy)} title={r.label}><span>{r.emoji}</span><small>{r.label}</small><b>{reactions.filter(x=>x.reaction===r.id).length}</b></button>)}</div></section>
        <section className="hot-seat-card"><div className="hot-seat-section-head"><div><p className="eyebrow">SEND SOMETHING SPECIAL</p><h3>Gift the host</h3><p>Animated gifts are recorded in the room. Hosts receive {hostSharePercent}% of eligible Hot Seat spend.</p></div></div><div className="hot-seat-gift-grid">{gifts.map(g=><button key={g.id} className="hot-seat-gift" onClick={()=>void sendGift(g)} disabled={Boolean(busy)||isPaused||session?.status==='bidding'||session?.status==='preparing'}><span>{g.emoji}</span><strong>{g.name}</strong><small>{g.price_bc.toLocaleString()} BC</small>{busy==='gift:'+g.id&&<i>Sending…</i>}</button>)}</div><button type="button" className="hot-seat-wallet-link" onClick={onOpenWallet}>Need more BC? Open wallet ↗</button><div className="hot-seat-gift-activity"><strong>Recent gifts</strong>{giftTx.slice(0,6).map(g=><p key={g.id}><span>{gifts.find(x=>x.id===g.gift_id)?.emoji||'🎁'}</span><b>{names[g.sender_id]||'Panda'}</b> sent {g.quantity} {gifts.find(x=>x.id===g.gift_id)?.name||'gift'} <small>· {g.total_bc} BC</small></p>)}{!giftTx.length&&<small>No gifts yet. Be the first to make the host's day.</small>}</div></section>
        <section className="hot-seat-card hot-seat-bidding-card"><p className="eyebrow">YOUR NEXT MOMENT</p><h3>Bid for the next Hot Seat</h3><p>Place an ascending BC bid. BC is held immediately; the winner keeps the seat and every non-selected bidder is refunded after the winner accepts.</p>{myBid&&<div className="hot-seat-my-bid"><span>Your current bid</span><strong>{Number(myBid.amount_bc).toLocaleString()} BC</strong></div>}<form className="hot-seat-bid-form" onSubmit={placeBid}><label>Bid amount (BC)<input type="number" min={myBid?Number(myBid.amount_bc)+1:1} step="1" value={bidDraft} onChange={e=>setBidDraft(e.target.value)} placeholder={myBid?String(Number(myBid.amount_bc)+1):'Enter your bid'} required/></label><button className="hot-seat-gold-button" disabled={Boolean(busy)||!['bidding','live','water_break'].includes(session?.status||'')||currentHost}>{busy==='bid'?'Placing bid…':myBid?'Raise bid':'Place bid'}</button></form><div className="hot-seat-bid-list"><div className="hot-seat-bid-list-head"><strong>Current bids</strong><small>{bids.filter(b=>['pending','selected','won'].includes(b.status)).length} active</small></div>{bids.filter(b=>['pending','selected','won'].includes(b.status)).slice(0,5).map((b,i)=><div className="hot-seat-bid-row" key={b.id}><span>{i===0?'👑':'↗'}</span><b>{names[b.bidder_id]||'Panda'} {b.bidder_id===userId?'(You)':''}</b><strong>{Number(b.amount_bc).toLocaleString()} BC</strong></div>)}{!bids.some(b=>['pending','selected','won'].includes(b.status))&&<small>No bids yet. Be the first to bid for the next seat.</small>}</div>{session?.status==='bidding'&&topBid?.bidder_id===userId&&<div className="hot-seat-winning-actions"><strong>You are currently the highest bidder!</strong><p>You have 15 minutes to accept the seat. The following 15 minutes are for preparation.</p><button className="hot-seat-gold-button" disabled={Boolean(busy)} onClick={()=>void decideBid(true)}>Accept next seat</button><button className="hot-seat-quiet-button" disabled={Boolean(busy)} onClick={()=>void decideBid(false)}>Decline and refund bid</button></div>}{isAdmin&&<p className="hot-seat-admin-note">Admin mode: lifecycle and pricing settings are stored in Supabase. Use the admin controls to manage rules as they are connected.</p>}</section>
        <section className="hot-seat-card hot-seat-host-earnings"><p className="eyebrow">CREATOR REWARDS</p><h3>Host earnings</h3><strong>{hostGifts.toLocaleString()} BC</strong><p>{hostSharePercent}% of eligible Hot Seat spend is credited to the host. Reference conversion: 1,000 BC ≈ $0.75.</p><small>Total gift spend in this seat: {totalGiftSpend.toLocaleString()} BC</small></section>
      </aside>
    </div>
    {isAdmin&&<section className="hot-seat-card hot-seat-admin-panel"><p className="eyebrow">OWNER CONTROL ROOM</p><h3>Hot Seat economy & water-break controls</h3><p>These controls save to the Hot Seat database. Gift prices are charged server-side; water-break activities can be enabled or disabled.</p><div className="hot-seat-admin-settings">{adminSettings.map(setting=><label key={setting.setting_key}><span>{setting.setting_key.replaceAll('_',' ')}</span><div><input type="number" min="0" step={setting.setting_key==='bc_per_usd_rate'?'0.01':'1'} value={settingDrafts[setting.setting_key]??String(setting.numeric_value)} onChange={e=>setSettingDrafts(prev=>({...prev,[setting.setting_key]:e.target.value}))}/><button className="hot-seat-quiet-button" disabled={Boolean(busy)||Number(settingDrafts[setting.setting_key])===Number(setting.numeric_value)} onClick={()=>void saveAdminSetting(setting.setting_key)}>{busy==='setting:'+setting.setting_key?'Saving…':'Save'}</button></div></label>)}</div><div className="hot-seat-admin-gifts"><strong>Gift catalogue pricing</strong>{gifts.map(g=><label key={g.id}><span>{g.emoji} {g.name}</span><div><input type="number" min="1" step="1" value={giftPriceDrafts[g.id]??String(g.price_bc)} onChange={e=>setGiftPriceDrafts(prev=>({...prev,[g.id]:e.target.value}))}/><button className="hot-seat-quiet-button" disabled={Boolean(busy)} onClick={()=>void saveGift(g)}>{busy==='gift-admin:'+g.id?'Saving…':'Save price'}</button></div></label>)}</div><div className="hot-seat-admin-activities"><strong>Water-break activities</strong>{activities.map(a=><label key={a.id}><span>{a.title}</span><button className="hot-seat-quiet-button" disabled={Boolean(busy)} onClick={()=>void toggleActivity(a)}>{a.enabled?'Disable':'Enable'}</button></label>)}</div></section>}
    <p className="hot-seat-footer-note">Hot Seat timers and BC charges are stored and checked on the server. Ads are reserved after each five questions/comments; live ad serving, movie playback and live video provider credentials still need configuration before public launch.</p>
  </section>;
}

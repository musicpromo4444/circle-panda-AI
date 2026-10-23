import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from './lib/supabase';

type HotSession = {
  id:string; host_id:string; status:'bidding'|'preparing'|'live'|'water_break'|'ended'|'evicted';
  title:string; started_at:string|null; ends_at:string|null; break_started_at:string|null; paused_at?:string|null; pause_until?:string|null;
  next_host_decision_deadline:string|null; preparation_deadline:string|null; created_at:string;
  host_evicted_at?:string|null; host_eviction_reason?:string|null; stream_provider?:string; stream_url?:string|null;
};
type HotQuestion = {id:string;session_id:string;asker_id:string;body:string;question_type:string;status:string;answer:string|null;asked_at:string;answer_deadline:string;answered_at:string|null;host_earnings_bc:number};
type HotComment = {id:string;session_id:string;user_id:string;body:string;created_at:string};
type HotReaction = {id:string;session_id:string;user_id:string;reaction:string;created_at:string};
type HotGift = {id:string;name:string;emoji:string;price_bc:number;enabled:boolean;sort_order:number};
type HotGiftTx = {id:string;session_id:string;sender_id:string;host_id:string;gift_id:string;quantity:number;total_bc:number;host_earnings_bc:number;created_at:string};
type HotBid = {id:string;session_id:string;bidder_id:string;amount_bc:number;status:string;created_at:string;decided_at:string|null};
type BreakActivity = {id:string;title:string;description:string;activity_type:string;enabled:boolean;sort_order:number};
type HotPoll = {id:string;session_id:string;host_id:string;question:string;options:string[];status:'open'|'closed';closes_at:string;created_at:string};
type HotPollVote = {poll_id:string;user_id:string;option_index:number};
type HotGiveaway = {id:string;session_id:string;host_id:string;title:string;prize_bc:number;status:'open'|'drawn'|'closed';winner_id:string|null;created_at:string};
type HotGiveawayEntry = {giveaway_id:string;user_id:string;created_at:string};
type Props = {userId:string;onOpenWallet:()=>void;isAdmin?:boolean;adminOnly?:boolean};
type HotSetting = {setting_key:string;numeric_value:number};

const reactionOptions = [{id:'like',emoji:'👍',label:'Like'},{id:'love',emoji:'❤️',label:'Love'},{id:'laugh',emoji:'😂',label:'Laugh'},{id:'wow',emoji:'😮',label:'Wow'},{id:'fire',emoji:'🔥',label:'Fire'},{id:'clap',emoji:'👏',label:'Clap'}];
const formatRemaining = (ms:number) => { const sec=Math.max(0,Math.floor(ms/1000)); return [Math.floor(sec/3600),Math.floor((sec%3600)/60),sec%60].map(n=>String(n).padStart(2,'0')).join(':'); };
function youtubeEmbedUrl(raw:string|null|undefined):string|null {if(!raw)return null;try{const u=new URL(raw);let id='';if(u.hostname==='youtu.be')id=u.pathname.split('/').filter(Boolean)[0]||'';else if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(u.hostname)){id=u.searchParams.get('v')||'';if(!id){const segments=u.pathname.split('/').filter(Boolean);if(['live','embed','shorts'].includes(segments[0]||''))id=segments[1]||'';}}return /^[A-Za-z0-9_-]{6,}$/.test(id)?'https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&mute=1&rel=0':null;}catch{return null;}}

export default function HotSeatFeature({userId,onOpenWallet,isAdmin=false,adminOnly=false}:Props) {
  const [session,setSession]=useState<HotSession|null>(null);
  const [activePanel,setActivePanel]=useState<'host'|'questions'|'comments'|'gifts'|'reactions'|'bids'|null>(null);
  const [questionsSeen,setQuestionsSeen]=useState(0);
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
  const [giveaways,setGiveaways]=useState<HotGiveaway[]>([]);
  const [giveawayEntries,setGiveawayEntries]=useState<HotGiveawayEntry[]>([]);
  const [giveawayDraft,setGiveawayDraft]=useState('Water Break Giveaway');
  const [giveawayPrizeDraft,setGiveawayPrizeDraft]=useState('100');
  const [polls,setPolls]=useState<HotPoll[]>([]);
  const [pollVotes,setPollVotes]=useState<HotPollVote[]>([]);
  const [pollDraft,setPollDraft]=useState('');
  const [pollOptionsDraft,setPollOptionsDraft]=useState('Yes\nNo');
  const [streamUrlDraft,setStreamUrlDraft]=useState('');
  const [isFollowingHost,setIsFollowingHost]=useState(false);
  const [hostFollowerCount,setHostFollowerCount]=useState(0);
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
        .select('id,host_id,status,title,started_at,ends_at,break_started_at,next_host_decision_deadline,preparation_deadline,created_at,host_evicted_at,host_eviction_reason,paused_at,pause_until,stream_provider,stream_url')
        .in('status',['bidding','preparing','live','water_break']).order('created_at',{ascending:false}).limit(1);
      if (sessionError) throw sessionError;
      const current=((activeRows??[])[0] as HotSession|undefined) ?? bootRow ?? null;
      setSession(current);
      setStreamUrlDraft(current?.stream_url||'');
      if (!current) {setLoading(false);return;}
      const [q,c,r,g,gt,b,a,wallet,settingResult,pollResult,followResult,followCountResult,giveawayResult] = await Promise.all([
        supabase.from('hot_seat_questions').select('id,session_id,asker_id,body,question_type,status,answer,asked_at,answer_deadline,answered_at,host_earnings_bc').eq('session_id',current.id).order('asked_at',{ascending:false}),
        supabase.from('hot_seat_comments').select('id,session_id,user_id,body,created_at').eq('session_id',current.id).order('created_at',{ascending:true}).limit(200),
        supabase.from('hot_seat_reactions').select('id,session_id,user_id,reaction,created_at').eq('session_id',current.id),
        supabase.from('hot_seat_gifts').select('id,name,emoji,price_bc,enabled,sort_order').order('sort_order'),
        supabase.from('hot_seat_gift_transactions').select('id,session_id,sender_id,host_id,gift_id,quantity,total_bc,host_earnings_bc,created_at').eq('session_id',current.id).order('created_at',{ascending:false}),
        supabase.from('hot_seat_bids').select('id,session_id,bidder_id,amount_bc,status,created_at,decided_at').eq('session_id',current.id).in('status',['pending','selected','won','refunded','declined','expired']).order('amount_bc',{ascending:false}).limit(100),
        supabase.from('hot_seat_water_break_activities').select('id,title,description,activity_type,enabled,sort_order').order('sort_order'),
        supabase.from('wallet_accounts').select('bc_balance').eq('user_id',userId).maybeSingle(),
        supabase.from('hot_seat_settings').select('setting_key,numeric_value'),
        supabase.from('hot_seat_polls').select('id,session_id,host_id,question,options,status,closes_at,created_at').eq('session_id',current.id).order('created_at',{ascending:false}).limit(5),
        supabase.from('hot_seat_follows').select('host_id').eq('host_id',current.host_id).eq('follower_id',userId).maybeSingle(),
        supabase.from('hot_seat_follows').select('host_id',{count:'exact',head:true}).eq('host_id',current.host_id),
        supabase.from('hot_seat_giveaways').select('id,session_id,host_id,title,prize_bc,status,winner_id,created_at').eq('session_id',current.id).order('created_at',{ascending:false}).limit(10),
      ]);
      if (q.error) throw q.error;
      if (c.error) throw c.error;
      if (r.error) throw r.error;
      for (const result of [g,gt,b,a,wallet,settingResult,pollResult,followResult,followCountResult,giveawayResult]) {
        if (result.error) throw result.error;
      }
      setQuestions((q.data??[]) as HotQuestion[]);
      setComments((c.data??[]) as HotComment[]);
      setReactions((r.data??[]) as HotReaction[]);
      setGifts(((g.data??[]) as HotGift[]).filter(item=>item.enabled||isAdmin));
      setGiftPriceDrafts(Object.fromEntries(((g.data??[]) as HotGift[]).map(item=>[item.id,String(item.price_bc)])));
      setGiftTx((gt.data??[]) as HotGiftTx[]);
      setBids((b.data??[]) as HotBid[]);
      setActivities(((a.data??[]) as BreakActivity[]).filter(item=>item.enabled||isAdmin));
      const settingRows=(settingResult.data??[]) as HotSetting[];
      setPublicSettings(Object.fromEntries(settingRows.map(row=>[row.setting_key,Number(row.numeric_value)])));
      if(isAdmin){setAdminSettings(settingRows.filter(row=>!['comment_ad_interval','question_ad_interval'].includes(row.setting_key)));setSettingDrafts(Object.fromEntries(settingRows.filter(row=>!['comment_ad_interval','question_ad_interval'].includes(row.setting_key)).map(row=>[row.setting_key,String(row.numeric_value)])));}
      setBalance(wallet.data ? Number(wallet.data.bc_balance) : null);
      const giveawayRows=(giveawayResult.data??[]) as HotGiveaway[];setGiveaways(giveawayRows);
      if(giveawayRows.length){const {data:entries,error:entriesError}=await supabase.from('hot_seat_giveaway_entries').select('giveaway_id,user_id,created_at').in('giveaway_id',giveawayRows.map(g=>g.id));if(entriesError)throw entriesError;setGiveawayEntries((entries??[]) as HotGiveawayEntry[]);}else setGiveawayEntries([]);
      const pollRows=(pollResult.data??[]) as HotPoll[];setPolls(pollRows);
      setIsFollowingHost(Boolean(followResult.data));setHostFollowerCount(followCountResult.count??0);
      if(pollRows.length){const {data:votes,error:votesError}=await supabase.from('hot_seat_poll_votes').select('poll_id,user_id,option_index').in('poll_id',pollRows.map(p=>p.id));if(votesError)throw votesError;setPollVotes((votes??[]) as HotPollVote[]);}else setPollVotes([]);
      const ids=[current.host_id,...(q.data??[]).map((x:any)=>x.asker_id),...(c.data??[]).map((x:any)=>x.user_id),...(b.data??[]).map((x:any)=>x.bidder_id),...(gt.data??[]).flatMap((x:any)=>[x.sender_id,x.host_id]),...giveawayRows.flatMap(g=>[g.host_id,g.winner_id].filter(Boolean))];
      const unique=[...new Set(ids)];
      if(unique.length){
        const {data:profiles,error:profilesError}=await supabase.from('profiles').select('id,display_name,username').in('id',unique);
        if(profilesError)throw profilesError;
        setNames(Object.fromEntries((profiles??[]).map((p:any)=>[p.id,p.display_name||p.username||'Panda'])));
      }
    } catch(e) {setNotice(e instanceof Error?e.message:'Could not load Hot Seat.');}
    finally {setLoading(false);}
  },[userId,isAdmin]);

  useEffect(()=>{
    void load();
    // Subscribe for instant room updates; keep a slower poll as a mobile-network fallback.
    const poll=window.setInterval(()=>void load(),30000);
    const clock=window.setInterval(()=>setNow(Date.now()),1000);
    let channel:any=null;
    const sessionId=session?.id;
    if(supabase&&sessionId){
      channel=supabase.channel('hot-seat-live-'+sessionId);
      const roomTables=[
        'hot_seat_sessions','hot_seat_questions','hot_seat_comments','hot_seat_reactions',
        'hot_seat_gift_transactions','hot_seat_bids','hot_seat_giveaways',
        'hot_seat_giveaway_entries','hot_seat_polls','hot_seat_poll_votes','hot_seat_follows'
      ];
      for(const table of roomTables){
        const scoped=['hot_seat_sessions','hot_seat_questions','hot_seat_comments','hot_seat_reactions','hot_seat_gift_transactions','hot_seat_bids','hot_seat_giveaways','hot_seat_polls'].includes(table);
        channel=channel.on('postgres_changes',{
          event:'*',schema:'public',table,
          ...(scoped?{filter:(table==='hot_seat_sessions'?'id':'session_id')+'=eq.'+sessionId}:{})
        },()=>{void load();});
      }
      channel.subscribe();
    }
    return()=>{
      window.clearInterval(poll);
      window.clearInterval(clock);
      if(channel&&supabase)void supabase.removeChannel(channel);
    };
  },[load,session?.id]);
  useEffect(()=>{if(!giftTx.length)return;const newest=giftTx[0];if(seenGiftId.current===null){seenGiftId.current=newest.id;return;}if(seenGiftId.current!==newest.id){seenGiftId.current=newest.id;setGiftBurst(newest);const timer=window.setTimeout(()=>setGiftBurst(null),4500);return()=>window.clearTimeout(timer);}},[giftTx]);

  const currentHost=session?.host_id===userId;
  const streamEmbed=useMemo(()=>youtubeEmbedUrl(session?.stream_url),[session?.stream_url]);
  const topBid=useMemo(()=>bids.filter(b=>['pending','selected','won'].includes(b.status)).sort((a,b)=>Number(b.amount_bc)-Number(a.amount_bc)||new Date(a.created_at).getTime()-new Date(b.created_at).getTime())[0]??null,[bids]);
  const myBid=bids.find(b=>b.bidder_id===userId&&['pending','selected','won'].includes(b.status));
  const myReactions=reactions.filter(r=>r.user_id===userId).map(r=>r.reaction);
  const likeCount=reactions.filter(r=>r.reaction==='like').length;
  const hostGifts=giftTx.filter(g=>g.host_id===session?.host_id).reduce((sum,g)=>sum+Number(g.host_earnings_bc),0);
  const questionEarnings=questions.reduce((sum,q)=>sum+Number(q.host_earnings_bc||0),0);
  const totalHostEarnings=hostGifts+questionEarnings;
  const totalGiftSpend=giftTx.reduce((sum,g)=>sum+Number(g.total_bc),0);
  const isPaused=Boolean(session?.paused_at&&session?.pause_until&&new Date(session.pause_until).getTime()>now);
  const waterBreakMinutes=Number(publicSettings.water_break_minutes??60);
  const endTime=session?.status==='live'&&isPaused&&session?.pause_until?new Date(session.pause_until).getTime():session?.status==='live'&&session.ends_at?new Date(session.ends_at).getTime():session?.status==='water_break'&&session.break_started_at?new Date(session.break_started_at).getTime()+waterBreakMinutes*60*1000:null;
  const timeLeft=endTime?formatRemaining(endTime-now):null;
  const questionStandardCost=Number(publicSettings.question_standard_cost??25);
  const questionCustomCost=Number(publicSettings.question_custom_cost??75);
  const questionCost=questionType==='custom'?questionCustomCost:questionStandardCost;
  const hostSharePercent=Number(publicSettings.host_earnings_percent??20);
  const pendingQuestions=questions.filter(q=>q.status==='pending');
  const unreadQuestions=Math.max(0,pendingQuestions.length-questionsSeen);

  async function act(key:string,fn:()=>Promise<unknown>,success:string) {
    if(busy)return;setBusy(key);setNotice('');
    try {await fn();setNotice(success);await load();window.dispatchEvent(new Event('circle-panda-wallet-updated'));}
    catch(e){setNotice(e instanceof Error?e.message:'Action failed. Please try again.');}
    finally{setBusy('');}
  }
  async function startSession(){if(!session||!supabase)return;await act('start',async()=>{const {error}=await supabase!.rpc('hot_seat_start_session',{p_session_id:session.id});if(error)throw error;},'Hot Seat is live! The three-hour session has started.');}
  async function endSession(){if(!session||!supabase)return;await act('end',async()=>{const {error}=await supabase!.rpc('hot_seat_end_session',{p_session_id:session.id,p_evicted:false});if(error)throw error;},'Your Hot Seat session has ended.');}
  async function togglePause(){if(!session||!supabase)return;await act('pause',async()=>{const {error}=await supabase!.rpc(isPaused?'hot_seat_resume_session':'hot_seat_pause_session',{p_session_id:session.id});if(error)throw error;},isPaused?'Hot Seat resumed.':'Hot Seat paused for up to 15 minutes.');}
  async function saveStream(e:FormEvent){e.preventDefault();if(!session||!supabase)return;await act('stream',async()=>{const {error}=await supabase!.rpc('hot_seat_set_stream',{p_session_id:session.id,p_stream_url:streamUrlDraft.trim()||null});if(error)throw error;},'Hot Seat stream link saved.');}


  async function submitQuestion(e:FormEvent){e.preventDefault();if(!session||!supabase)return;const body=questionDraft.trim();if(!body)return;await act('question',async()=>{const {error}=await supabase!.rpc('hot_seat_ask_question',{p_session_id:session.id,p_body:body,p_question_type:questionType});if(error)throw error;setQuestionDraft('');},'Question sent.');}
  async function answerQuestion(e:FormEvent,q:HotQuestion){e.preventDefault();if(!supabase)return;const answer=(answerDrafts[q.id]||'').trim();if(!answer)return;await act('answer:'+q.id,async()=>{const {error}=await supabase!.rpc('hot_seat_answer_question',{p_question_id:q.id,p_answer:answer});if(error)throw error;setAnswerDrafts(prev=>({...prev,[q.id]:''}));},'Answer published to the Hot Seat.');}
  async function submitComment(e:FormEvent){e.preventDefault();if(!session||!supabase)return;const body=commentDraft.trim();if(!body)return;await act('comment',async()=>{const {error}=await supabase!.from('hot_seat_comments').insert({session_id:session.id,user_id:userId,body});if(error)throw error;setCommentDraft('');},'Comment posted.');}
  async function toggleFollowHost(){if(!session||!supabase)return;await act('follow',async()=>{const {data,error}=await supabase!.rpc('hot_seat_toggle_follow',{p_host_id:session.host_id});if(error)throw error;setIsFollowingHost(Boolean((data as {following?:boolean}|null)?.following));},isFollowingHost?'Host unfollowed.':'Following the Hot Seat host.');}
  async function createPoll(e:FormEvent){e.preventDefault();if(!session||!supabase)return;const options=pollOptionsDraft.split(/[\\n,]/).map(x=>x.trim()).filter(Boolean);if(options.length<2||options.length>6){setNotice('Add between two and six poll options, separated by new lines or commas.');return;}await act('create-poll',async()=>{const {error}=await supabase!.rpc('hot_seat_create_poll',{p_session_id:session.id,p_question:pollDraft.trim(),p_options:options});if(error)throw error;setPollDraft('');},'Poll published. The community has 15 minutes to vote.');}
  async function votePoll(poll:HotPoll,index:number){if(!supabase)return;await act('vote-poll:'+poll.id,async()=>{const {error}=await supabase!.rpc('hot_seat_vote_poll',{p_poll_id:poll.id,p_option_index:index+1});if(error)throw error;},'Your vote has been recorded.');}
  async function closePoll(poll:HotPoll){if(!supabase)return;await act('close-poll:'+poll.id,async()=>{const {error}=await supabase!.rpc('hot_seat_close_poll',{p_poll_id:poll.id});if(error)throw error;},'Poll closed.');}
  async function createGiveaway(e:FormEvent){e.preventDefault();if(!session||!supabase)return;const prize=Number(giveawayPrizeDraft);if(!Number.isSafeInteger(prize)||prize<1){setNotice('Enter a whole-number giveaway prize of at least 1 BC.');return;}await act('create-giveaway',async()=>{const {error}=await supabase!.rpc('hot_seat_create_giveaway',{p_session_id:session.id,p_title:giveawayDraft.trim(),p_prize_bc:prize});if(error)throw error;setGiveawayDraft('Water Break Giveaway');},'Giveaway opened and its BC prize escrowed.');}
  async function enterGiveaway(giveaway:HotGiveaway){if(!supabase)return;await act('enter-giveaway:'+giveaway.id,async()=>{const {error}=await supabase!.rpc('hot_seat_enter_giveaway',{p_giveaway_id:giveaway.id});if(error)throw error;},'You entered the giveaway.');}
  async function drawGiveaway(giveaway:HotGiveaway){if(!supabase)return;await act('draw-giveaway:'+giveaway.id,async()=>{const {error}=await supabase!.rpc('hot_seat_draw_giveaway',{p_giveaway_id:giveaway.id});if(error)throw error;},'Giveaway drawn. The winner received the BC prize.');}


  async function react(reaction:string){if(!session||!supabase)return;await act('reaction:'+reaction,async()=>{const {error}=await supabase!.rpc('hot_seat_toggle_reaction',{p_session_id:session.id,p_reaction:reaction});if(error)throw error;},'Reaction updated.');}
  async function sendGift(gift:HotGift){if(!session||!supabase)return;await act('gift:'+gift.id,async()=>{const {error}=await supabase!.rpc('hot_seat_send_gift',{p_session_id:session.id,p_gift_id:gift.id,p_quantity:1});if(error)throw error;},gift.name+' gift sent!');}
  async function placeBid(e:FormEvent){e.preventDefault();if(!session||!supabase)return;const amount=Number(bidDraft);if(!Number.isSafeInteger(amount)||amount<1){setNotice('Enter a whole-number bid in BC.');return;}await act('bid',async()=>{const {error}=await supabase!.rpc('hot_seat_place_bid',{p_session_id:session.id,p_amount:amount});if(error)throw error;setBidDraft('');},'Your BC bid is escrowed. Non-selected bidders are refunded when the winner accepts.');}
  async function decideBid(accept:boolean){if(!topBid||!supabase)return;await act(accept?'accept-bid':'decline-bid',async()=>{const {error}=await supabase!.rpc('hot_seat_decide_bid',{p_bid_id:topBid.id,p_accept:accept});if(error)throw error;},accept?'You won the next Hot Seat. You have 15 minutes to prepare after accepting.':'You declined the seat; your bid was refunded.');}
  async function saveAdminSetting(key:string){if(!supabase)return;const value=Number(settingDrafts[key]);if(!Number.isFinite(value)||value<0){setNotice('Enter a valid non-negative setting.');return;}await act('setting:'+key,async()=>{const {error}=await supabase!.rpc('hot_seat_admin_update_setting',{p_setting_key:key,p_numeric_value:value});if(error)throw error;},'Hot Seat setting saved.');}
  async function toggleActivity(activity:BreakActivity){if(!supabase)return;await act('activity:'+activity.id,async()=>{const {error}=await supabase!.rpc('hot_seat_admin_set_activity',{p_activity_id:activity.id,p_enabled:!activity.enabled});if(error)throw error;},'Water-break activity updated.');}
  async function saveGift(gift:HotGift){if(!supabase)return;const price=Number(giftPriceDrafts[gift.id]);if(!Number.isSafeInteger(price)||price<1){setNotice('Gift price must be a whole number of at least 1 BC.');return;}await act('gift-admin:'+gift.id,async()=>{const {error}=await supabase!.rpc('hot_seat_admin_update_gift',{p_gift_id:gift.id,p_price_bc:price,p_enabled:gift.enabled});if(error)throw error;},'Gift price saved.');}


  if(adminOnly) return <section className="feature-panel admin-panel"><p className="eyebrow">HOT SEAT CONFIGURATION</p><h2>Hot Seat settings</h2><p className="feature-copy">Admin-only controls for platform-wide Hot Seat pricing and activities. Public users cannot see this configuration panel.</p><section className="hot-seat-card hot-seat-admin-panel"><p className="eyebrow">OWNER CONTROL ROOM</p><h3>Hot Seat economy & water-break controls</h3><p>These controls save to the Hot Seat database. Gift prices are charged server-side; water-break activities can be enabled or disabled.</p><div className="hot-seat-admin-settings">{adminSettings.map(setting=><label key={setting.setting_key}><span>{setting.setting_key.replaceAll('_',' ')}</span><div><input type="number" min="0" step={setting.setting_key==='bc_per_usd_rate'?'0.01':'1'} value={settingDrafts[setting.setting_key]??String(setting.numeric_value)} onChange={e=>setSettingDrafts(prev=>({...prev,[setting.setting_key]:e.target.value}))}/><button className="hot-seat-quiet-button" disabled={Boolean(busy)||Number(settingDrafts[setting.setting_key])===Number(setting.numeric_value)} onClick={()=>void saveAdminSetting(setting.setting_key)}>{busy==='setting:'+setting.setting_key?'Saving…':'Save'}</button></div></label>)}</div><div className="hot-seat-admin-gifts"><strong>Gift catalogue pricing</strong>{gifts.map(g=><label key={g.id}><span>{g.emoji} {g.name}</span><div><input type="number" min="1" step="1" value={giftPriceDrafts[g.id]??String(g.price_bc)} onChange={e=>setGiftPriceDrafts(prev=>({...prev,[g.id]:e.target.value}))}/><button className="hot-seat-quiet-button" disabled={Boolean(busy)} onClick={()=>void saveGift(g)}>{busy==='gift-admin:'+g.id?'Saving…':'Save price'}</button><button className="hot-seat-quiet-button" disabled={Boolean(busy)} onClick={()=>void saveGift({...g,enabled:!g.enabled})}>{g.enabled?'Disable':'Enable'}</button></div></label>)}</div><div className="hot-seat-admin-activities"><strong>Water-break activities</strong>{activities.map(a=><label key={a.id}><span>{a.title}</span><button className="hot-seat-quiet-button" disabled={Boolean(busy)} onClick={()=>void toggleActivity(a)}>{a.enabled?'Disable':'Enable'}</button></label>)}</div></section></section>;
  if(loading&&!session)return <section className="hot-seat-shell"><div className="hot-seat-loading">Loading Hot Seat…</div></section>;
  return <section className="hot-seat-shell">
    <header className="hot-seat-minimal-header"><div className="hot-seat-brand-mark">🐼</div><strong>Circle Panda</strong><span className="hot-seat-balance-chip">🪙 {balance===null?'—':balance.toLocaleString()} BC</span><span className="hot-seat-profile-dot">●</span></header>
    <div className="hot-seat-live-stage">
      <div className="hot-seat-stage-top"><button type="button" className="hot-seat-exit-pill" onClick={()=>window.history.back()}>← Exit</button><span className={'hot-seat-status status-'+(session?.status||'offline')}>{session?.status==='live'&&isPaused?'⏸ PAUSED':session?.status==='live'?'● LIVE':session?.status==='water_break'?'💧 BREAK':session?.status==='bidding'?'🔨 BIDDING':'OFFLINE'}</span><span className="hot-seat-mode-pill">🔥 Hot Seat</span>{timeLeft&&<span className="hot-seat-timer">{timeLeft}</span>}</div>
      <div className="hot-seat-stage-empty"><div className="hot-seat-blur-scene" aria-hidden="true"><span>🐼</span><span>🔥</span><span>💬</span><span>💛</span></div><div className="hot-seat-stage-host"><div className="hot-seat-host-avatar">🐼</div><strong>{names[session?.host_id||'']||'Circle Panda Host'}</strong><small>{session?.status==='live'?'HOST · LIVE NOW':'HOT SEAT COMMUNITY'}</small></div></div>
      <aside className="hot-seat-floating-actions" aria-label="Hot Seat actions">
        <button type="button" onClick={()=>setActivePanel('host')} aria-label="Open Hot Seat host profile"><span className="hot-seat-follow-panda">🐼</span><small>Host</small></button>
        <button type="button" onClick={()=>setActivePanel('reactions')} aria-label="Choose a reaction">❤️<small>React</small></button>
        <button type="button" onClick={()=>setActivePanel('gifts')} aria-label="Send a gift">🎁<small>Gift</small></button>
        <button type="button" onClick={()=>setActivePanel('questions')} aria-label="Ask a question">❓<small>Question</small></button>
        <button type="button" onClick={()=>setActivePanel('bids')} aria-label="Bid for the Hot Seat">🔨<small>Bid</small></button>
      </aside>
      <button type="button" className="hot-seat-giveaway-float" onClick={()=>setActivePanel('gifts')}><span>🎁</span><b>GIVEAWAY</b></button>
      <div className="hot-seat-topic-overlay"><span>🔥 CURRENT HOT TOPIC</span><strong>{session?.title||'What is one thing you pretend to understand but absolutely do not?'}</strong></div>
      <button type="button" className="hot-seat-comment-preview" onClick={()=>{setActivePanel('comments');}}><span>◉ CHAT:</span><p>{comments[comments.length-1]?.body||'Join the conversation…'}</p><b>{names[comments[comments.length-1]?.user_id||'']||'Panda'}</b></button>
      <form className="hot-seat-stage-compose" onSubmit={submitComment}><input value={commentDraft} onChange={e=>setCommentDraft(e.target.value)} maxLength={1000} placeholder="Ask or comment anonymously…" aria-label="Ask or comment anonymously" required/><button type="submit" disabled={Boolean(busy)||!commentDraft.trim()} aria-label="Send comment">➤</button></form>
    </div>
    {notice&&<div className="notice hot-seat-notice" role="status">{notice}<button type="button" onClick={()=>setNotice('')}>×</button></div>}
    {giftBurst&&<div className="hot-seat-gift-burst" role="status"><span>{gifts.find(g=>g.id===giftBurst.gift_id)?.emoji||'🎁'}</span><div><strong>{names[giftBurst.sender_id]||'A Panda'} sent a gift!</strong><small>{gifts.find(g=>g.id===giftBurst.gift_id)?.name||'Hot Seat gift'} · {giftBurst.total_bc} BC</small></div></div>}
    <div className="hot-seat-stats"><article><span>🪙</span><strong>{balance===null?'—':balance.toLocaleString()}</strong><small>YOUR BC BALANCE</small></article><article><span>💗</span><strong>{likeCount.toLocaleString()}</strong><small>LIKES</small></article><article><span>🎁</span><strong>{totalGiftSpend.toLocaleString()} BC</strong><small>GIFTS SENT</small></article><article><span>👑</span><strong>{totalHostEarnings.toLocaleString()} BC</strong><small>HOST EARNINGS</small></article><article><span>❓</span><strong>{pendingQuestions.length}</strong><small>QUESTIONS WAITING</small></article></div>
    {session?.status==='preparing'&&session.host_id===userId&&<div className="hot-seat-callout"><div><strong>Your next Hot Seat is reserved!</strong><p>Accepting a winning bid gives you 15 minutes to prepare. Start when you are ready.</p></div><button className="hot-seat-gold-button" disabled={Boolean(busy)} onClick={()=>void startSession()}>{busy==='start'?'Starting…':'Go Live'}</button></div>}
    {session?.status==='bidding'&&currentHost&&!session.host_evicted_at&&<div className="hot-seat-callout"><div><strong>You have the seat.</strong><p>Start your three-hour session. Questions, comments, gifts and reactions are enabled once live.</p></div><button className="hot-seat-gold-button" disabled={Boolean(busy)} onClick={()=>void startSession()}>{busy==='start'?'Starting…':'Start Hot Seat'}</button></div>}
    {session?.host_evicted_at&&<div className="hot-seat-callout hot-seat-warning"><div><strong>The host was removed from the seat.</strong><p>{session.host_eviction_reason||'A question timed out without an answer. Bidding is open for the next host.'}</p></div></div>}
    {(session?.status==='live'||session?.status==='water_break')&&<div className="hot-seat-host-strip"><div className="hot-seat-host-avatar">🐼</div><div><small>{session.status==='live'?'ON THE HOT SEAT':'CURRENT HOST · WATER BREAK'}</small><strong>{names[session.host_id]||'Panda host'} {currentHost?'(You)':''}</strong><p>{session.status==='live'?(isPaused?'The host has paused the room for up to 15 minutes.':'Answer the questions before their countdowns expire.'):'The host rests while the community enjoys break activities.'}</p></div>{currentHost&&session.status==='live'&&<button className="hot-seat-quiet-button" disabled={Boolean(busy)} onClick={()=>void togglePause()}>{busy==='pause'?'Updating…':isPaused?'Resume session':'Pause · 15 min'}</button>}{!currentHost&&<button className="hot-seat-quiet-button" disabled={Boolean(busy)} onClick={()=>void toggleFollowHost()}>{isFollowingHost?'Following ✓':'Follow host'} · {hostFollowerCount}</button>}{currentHost&&<button className="hot-seat-quiet-button" disabled={Boolean(busy)} onClick={()=>void endSession()}>Leave seat</button>}</div>}
    {session&&(session.status==='live'||session.status==='water_break'||session.status==='preparing')&&<section className="hot-seat-card hot-seat-stage-card"><div className="hot-seat-section-head"><div><p className="eyebrow">THE LIVE STAGE</p><h3>Host video</h3><p>Secure YouTube Live links can be shared with every viewer. The host or admin can update the stream source.</p></div><span className="hot-seat-section-count">LIVE</span></div>{streamEmbed?<div className="hot-seat-video-frame"><iframe src={streamEmbed} title="Circle Panda Hot Seat live stream" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/></div>:<div className="hot-seat-video-empty hot-seat-blurred-live"><div className="hot-seat-blur-scene" aria-hidden="true"><span>🐼</span><span>🔥</span><span>💬</span><span>💛</span></div><div className="hot-seat-blur-message"><span className="hot-seat-blur-live-dot"/> <strong>Hot Seat Live</strong><p>The live screen will appear here when the host connects.</p></div></div>}{(currentHost||isAdmin)&&<form className="hot-seat-stream-form" onSubmit={saveStream}><input type="url" value={streamUrlDraft} onChange={e=>setStreamUrlDraft(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" aria-label="YouTube Live stream URL"/><button className="hot-seat-gold-button" disabled={Boolean(busy)}>{busy==='stream'?'Saving…':'Save stream link'}</button><button type="button" className="hot-seat-quiet-button" disabled={Boolean(busy)||!session.stream_url} onClick={()=>{setStreamUrlDraft('');void act('stream-clear',async()=>{const {error}=await supabase!.rpc('hot_seat_set_stream',{p_session_id:session.id,p_stream_url:null});if(error)throw error;},'Stream link cleared.');}}>Clear</button></form>}</section>}
    {session&&(session.status==='live'||session.status==='water_break')&&<section className="hot-seat-card hot-seat-giveaway-card"><div className="hot-seat-section-head"><div><p className="eyebrow">WATER BREAK REWARDS</p><h3>BC giveaways</h3><p>Hosts can fund a prize, viewers enter once, and the winner is drawn server-side. If nobody enters, the host's prize is refunded.</p></div><span className="hot-seat-section-count">🎁</span></div>{(currentHost||isAdmin)&&!isPaused&&<form className="hot-seat-giveaway-form" onSubmit={createGiveaway}><input value={giveawayDraft} onChange={e=>setGiveawayDraft(e.target.value)} maxLength={200} placeholder="Giveaway name" required/><label>Prize (BC)<input type="number" min="1" step="1" value={giveawayPrizeDraft} onChange={e=>setGiveawayPrizeDraft(e.target.value)} required/></label><button className="hot-seat-gold-button" disabled={Boolean(busy)||!giveawayDraft.trim()}>{busy==='create-giveaway'?'Opening…':'Open giveaway'}</button></form>}{giveaways.map(g=>{const entries=giveawayEntries.filter(e=>e.giveaway_id===g.id);const entered=entries.some(e=>e.user_id===userId);return <article className="hot-seat-giveaway" key={g.id}><div className="hot-seat-giveaway-prize">🎁<strong>{Number(g.prize_bc).toLocaleString()} BC</strong></div><div className="hot-seat-giveaway-copy"><strong>{g.title}</strong><small>{g.status==='open'?'ENTRY OPEN':g.status==='drawn'?'WINNER DRAWN':'CLOSED'} · {entries.length} entries</small>{g.winner_id&&<p>Winner: {names[g.winner_id]||'Panda'} 🏆</p>}{g.status==='open'&&!currentHost&&<button className="hot-seat-quiet-button" disabled={Boolean(busy)||entered} onClick={()=>void enterGiveaway(g)}>{entered?'Entered ✓':'Enter for free'}</button>}{g.status==='open'&&(currentHost||isAdmin)&&<button className="hot-seat-gold-button" disabled={Boolean(busy)} onClick={()=>void drawGiveaway(g)}>{busy==='draw-giveaway:'+g.id?'Drawing…':'Draw winner'}</button>}</div></article>})}{!giveaways.length&&<div className="hot-seat-empty">No giveaway is open yet. The host can create a BC prize for the room.</div>}</section>}
    {session&&(session.status==='live'||session.status==='water_break')&&<section className="hot-seat-card hot-seat-polls-card"><div className="hot-seat-section-head"><div><p className="eyebrow">THE ROOM DECIDES</p><h3>Live polls & voting</h3><p>Hosts can run quick polls for up to 15 minutes. Each viewer gets one active vote per poll.</p></div><span className="hot-seat-section-count">{polls.filter(p=>p.status==='open'&&new Date(p.closes_at).getTime()>now).length} OPEN</span></div>{currentHost&&!isPaused&&<form className="hot-seat-poll-form" onSubmit={createPoll}><input value={pollDraft} onChange={e=>setPollDraft(e.target.value)} maxLength={300} placeholder="Ask the room a quick poll question…" required/><textarea value={pollOptionsDraft} onChange={e=>setPollOptionsDraft(e.target.value)} placeholder="One option per line (2–6 options)" required/><button className="hot-seat-gold-button" disabled={Boolean(busy)||!pollDraft.trim()}>{busy==='create-poll'?'Publishing…':'Publish poll'}</button></form>}{polls.map(poll=>{const mine=pollVotes.find(v=>v.poll_id===poll.id&&v.user_id===userId);const counts=poll.options.map((_,i)=>pollVotes.filter(v=>v.poll_id===poll.id&&v.option_index===i+1).length);const total=counts.reduce((sum,n)=>sum+n,0);const open=poll.status==='open'&&new Date(poll.closes_at).getTime()>now;return <article className="hot-seat-poll" key={poll.id}><div className="hot-seat-poll-head"><strong>{poll.question}</strong><small>{open?'VOTING OPEN':'POLL CLOSED'} · {total} votes</small></div>{poll.options.map((option,i)=><button type="button" key={option+'-'+i} className={'hot-seat-poll-option'+(mine?.option_index===i+1?' voted':'')} disabled={!open||currentHost||Boolean(busy)} onClick={()=>void votePoll(poll,i)}><span>{option}</span><b>{counts[i]}</b><i style={{width:(total?counts[i]/total*100:0)+'%'}}/></button>)}{currentHost&&open&&<button type="button" className="hot-seat-quiet-button" onClick={()=>void closePoll(poll)} disabled={Boolean(busy)}>Close poll</button>}</article>})}{!polls.length&&<div className="hot-seat-empty">No polls yet. The host can publish a poll while live or during the water break.</div>}</section>}
    {session?.status==='water_break'&&<div className="hot-seat-break-hub"><div className="hot-seat-break-heading"><span>💧</span><div><p className="eyebrow">RESET · RECHARGE · PLAY</p><h3>Water Break Hub</h3><p>The live seat rests for {waterBreakMinutes} minutes. Choose an activity while bidding continues.</p></div></div><div className="hot-seat-break-grid">{activities.map(a=><article key={a.id}><span>{a.activity_type==='giveaway'?'🎁':a.activity_type==='movie'?'🎬':a.activity_type==='comedy'?'😂':a.activity_type==='vip_glimpse'?'👑':a.activity_type==='secret_stalls'?'🏪':a.activity_type==='game'?'🎮':a.activity_type==='sponsored'?'🤝':'📺'}</span><strong>{a.title}</strong><p>{a.description}</p><small>{a.activity_type==='ad'?'ADMIN-SET AD SLOT':'WATER BREAK ACTIVITY'}</small></article>)}</div></div>}
    <nav className="hot-seat-live-actions" aria-label="Hot Seat live actions">
      <button type="button" onClick={()=>{const next=activePanel==='questions'?null:'questions';setActivePanel(next);if(next)setQuestionsSeen(pendingQuestions.length);}} aria-expanded={activePanel==='questions'}>❓<span>Questions</span><b>{pendingQuestions.length}</b>{unreadQuestions>0&&<i className="hot-seat-unread-light" aria-label="New questions"/>}</button>
      <button type="button" onClick={()=>setActivePanel(activePanel==='gifts'?null:'gifts')} aria-expanded={activePanel==='gifts'}>🎁<span>Gifts</span></button>
      <button type="button" onClick={()=>setActivePanel(activePanel==='reactions'?null:'reactions')} aria-expanded={activePanel==='reactions'}>❤️<span>React</span></button>
      <button type="button" onClick={()=>setActivePanel(activePanel==='bids'?null:'bids')} aria-expanded={activePanel==='bids'}>👑<span>Next seat</span></button>
    </nav>
    {activePanel&&<div className="hot-seat-action-backdrop" role="presentation" onClick={()=>setActivePanel(null)}>
      <section className="hot-seat-action-drawer" role="dialog" aria-modal="true" aria-label={activePanel==='questions'?'Questions':activePanel==='comments'?'Comments':activePanel==='gifts'?'Gift the host':activePanel==='reactions'?'Live reactions':'Bid for the next seat'} onClick={e=>e.stopPropagation()}>
        <header><strong>{activePanel==='questions'?'Questions to the host':activePanel==='comments'?'Comments':activePanel==='gifts'?'Gift the host':activePanel==='reactions'?'Reactions':'Bid for the next seat'}</strong><button type="button" aria-label="Close panel" onClick={()=>setActivePanel(null)}>×</button></header>
        {activePanel==='questions'&&<section className="hot-seat-card"><p>Standard questions cost {questionStandardCost} BC; custom questions cost {questionCustomCost} BC.</p><form className="hot-seat-question-form" onSubmit={submitQuestion}><label>Question type<select value={questionType} onChange={e=>setQuestionType(e.target.value as 'standard'|'custom')}><option value="standard">Standard · {questionStandardCost} BC</option><option value="custom">Custom · {questionCustomCost} BC</option></select></label><textarea value={questionDraft} onChange={e=>setQuestionDraft(e.target.value)} maxLength={1000} placeholder="Ask the person on the Hot Seat…" required/><button className="hot-seat-gold-button" disabled={Boolean(busy)||isPaused||!questionDraft.trim()||session?.status==='bidding'||session?.status==='preparing'}>{busy==='question'?'Sending…':'Send question'}</button></form><div className="hot-seat-question-list">{questions.slice(0,12).map(q=><article className="hot-seat-question" key={q.id}><strong>{names[q.asker_id]||'Panda'}</strong><p>{q.body}</p>{q.status==='pending'&&currentHost&&<form className="hot-seat-answer-form" onSubmit={e=>void answerQuestion(e,q)}><input value={answerDrafts[q.id]||''} onChange={e=>setAnswerDrafts(prev=>({...prev,[q.id]:e.target.value}))} maxLength={2000} placeholder="Type your answer…" required/><button className="hot-seat-quiet-button">Answer</button></form>}{q.status==='answered'&&<p>{q.answer}</p>}</article>)}</div></section>}
        {activePanel==='comments'&&<section className="hot-seat-card"><p className="hot-seat-comments-hint">Live comments from the room</p><form className="hot-seat-comment-form" onSubmit={submitComment}><input value={commentDraft} onChange={e=>setCommentDraft(e.target.value)} maxLength={1000} placeholder="Write a comment…" required/><button className="hot-seat-gold-button" disabled={Boolean(busy)||!commentDraft.trim()}>{busy==='comment'?'Posting…':'Send'}</button></form><div className="hot-seat-comments">{comments.slice(-60).map(c=><article className="hot-seat-comment" key={c.id}><strong>{names[c.user_id]||'Panda'}</strong><p>{c.body}</p></article>)}</div></section>}
        {activePanel==='gifts'&&<section className="hot-seat-card"><div className="hot-seat-gift-grid">{gifts.map(g=><button key={g.id} className="hot-seat-gift" onClick={()=>void sendGift(g)} disabled={Boolean(busy)||isPaused}><span>{g.emoji}</span><strong>{g.name}</strong><small>{g.price_bc.toLocaleString()} BC</small></button>)}</div><button type="button" className="hot-seat-wallet-link" onClick={onOpenWallet}>Open wallet ↗</button></section>}
        {activePanel==='reactions'&&<section className="hot-seat-card"><div className="hot-seat-reactions">{reactionOptions.map(r=><button key={r.id} className={myReactions.includes(r.id)?'selected':''} onClick={()=>void react(r.id)} disabled={Boolean(busy)}><span>{r.emoji}</span><small>{r.label}</small><b>{reactions.filter(x=>x.reaction===r.id).length}</b></button>)}</div></section>}
        {activePanel==='bids'&&<section className="hot-seat-card hot-seat-bidding-card"><p>Bid for the next Hot Seat. Your BC is held while the bid is active.</p><form className="hot-seat-bid-form" onSubmit={placeBid}><label>Bid amount (BC)<input type="number" min={myBid?Number(myBid.amount_bc)+1:1} step="1" value={bidDraft} onChange={e=>setBidDraft(e.target.value)} required/></label><button className="hot-seat-gold-button" disabled={Boolean(busy)||currentHost}>{busy==='bid'?'Placing bid…':myBid?'Raise bid':'Place bid'}</button></form><div className="hot-seat-bid-list">{bids.filter(b=>['pending','selected','won'].includes(b.status)).slice(0,8).map(b=><div className="hot-seat-bid-row" key={b.id}><b>{names[b.bidder_id]||'Panda'}</b><strong>{Number(b.amount_bc).toLocaleString()} BC</strong></div>)}</div></section>}
        <footer><button type="button" className="hot-seat-quiet-button" onClick={()=>setActivePanel(null)}>Close</button></footer>
      </section>
    </div>}
    <div className="hot-seat-main-grid" data-panel={activePanel||'closed'} style={{display:'none'}}>

      <div className="hot-seat-primary-column">
        <section className="hot-seat-card"><div className="hot-seat-section-head"><div><p className="eyebrow">SAY IT WITH YOUR CHEST</p><h3>Questions to the host</h3><p>Standard questions cost {questionStandardCost} BC; custom questions cost {questionCustomCost} BC. Each question has a {Number(publicSettings.question_answer_minutes??60)}-minute answer timer.</p></div><span className="hot-seat-section-count">{questions.length}</span></div>
          <form className="hot-seat-question-form" onSubmit={submitQuestion}><label>Question type<select value={questionType} onChange={e=>setQuestionType(e.target.value as 'standard'|'custom')}><option value="standard">Standard · {questionStandardCost} BC</option><option value="custom">Custom · {questionCustomCost} BC</option></select></label><textarea value={questionDraft} onChange={e=>setQuestionDraft(e.target.value)} maxLength={1000} placeholder="Ask the person on the Hot Seat…" required/><div className="hot-seat-form-foot"><small>{questionDraft.length}/1000 · {questionCost} BC</small><button className="hot-seat-gold-button" disabled={Boolean(busy)||isPaused||!questionDraft.trim()||session?.status==='bidding'||session?.status==='preparing'}>{busy==='question'?'Sending…':'Send question'}</button></div></form>
          <div className="hot-seat-question-list">{(showAllQuestions?questions:questions.slice(0,8)).map((q,index)=><div className="hot-seat-question-group" key={q.id}><article className="hot-seat-question"><div className="hot-seat-question-number">Q</div><div className="hot-seat-question-body"><strong>{names[q.asker_id]||'Panda'} <small>{q.question_type==='custom'?'CUSTOM · '+questionCustomCost+' BC':'STANDARD · '+questionStandardCost+' BC'}</small></strong><p>{q.body}</p>{q.status==='pending'?<div className="hot-seat-question-clock">⏱ {formatRemaining(new Date(q.answer_deadline).getTime()-now)} {new Date(q.answer_deadline).getTime()-now>0&&new Date(q.answer_deadline).getTime()-now<=300000?'· 5-MINUTE WARNING':'to answer'}</div>:q.status==='answered'?<div className="hot-seat-answer"><b>HOST ANSWER</b><p>{q.answer}</p></div>:<div className="hot-seat-expired">This question expired unanswered.</div>}{currentHost&&q.status==='pending'&&<form className="hot-seat-answer-form" onSubmit={e=>void answerQuestion(e,q)}><input value={answerDrafts[q.id]||''} onChange={e=>setAnswerDrafts(prev=>({...prev,[q.id]:e.target.value}))} maxLength={2000} placeholder="Type your answer…" required/><button disabled={Boolean(busy)} className="hot-seat-quiet-button">{busy==='answer:'+q.id?'Posting…':'Answer'}</button></form>}</div></article>{(index+1)%5===0&&<div className="hot-seat-ad-slot"><span>AD</span><div><strong>Sponsored question break</strong><p>Reserved ad placement after every five questions. Provider connection is required to serve paid campaigns.</p></div></div>}</div>)}{questions.length>8&&<button className="hot-seat-text-button" onClick={()=>setShowAllQuestions(v=>!v)}>{showAllQuestions?'Show fewer questions':'Show all questions'}</button>}{questions.length===0&&<div className="hot-seat-empty">Be the first to ask a question. The host has one hour to answer it.</div>}</div>
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

    <p className="hot-seat-footer-note">Hot Seat timers and BC charges are stored and checked on the server. Ads are reserved after each five questions/comments; live ad serving, movie playback and live video provider credentials still need configuration before public launch.</p>
  </section>;
}

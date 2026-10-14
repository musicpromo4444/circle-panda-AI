import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from './lib/supabase';
import LocationFields, { CountryDropdown, type LocationValue } from './components/LocationFields';
import CrushFeature from './components/CrushFeature';

type Section = 'Home' | 'Confessions' | 'Crush' | 'Dating' | 'Events' | 'Groups' | 'Messages' | 'Wallet' | 'Notifications' | 'Profile' | 'Admin';
type FeedPost = { id: string; body: string; post_type: string; is_anonymous: boolean; author_name: string | null; created_at: string };
type FeedComment = { id: string; post_id: string; author_id: string; body: string; created_at: string };
type FeedReaction = { id: string; post_id: string; user_id: string; reaction: string };
type MessageRequestRow = { id: string; sender_id: string; recipient_id: string; source_type: string; greeting: string; status: string; created_at: string; conversation_id: string | null };
type ChatMessage = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string; reply_to_message_id?: string | null };
type GroupMessageReaction = { id: string; message_id: string; user_id: string; reaction: string };
type ChatConversation = { conversation_id: string; user_id: string; joined_at: string };
type DatingProfileRow = { id: string; user_id: string; headline: string | null; about: string | null; personality: string[] | null; sexual_experience: string | null; looking_for: string[] | null; is_published: boolean; created_at: string; relationship_goal?: string | null; interests?: string[]; personality_tags?: string[]; occupation?: string | null; children?: string | null; smoking?: string | null; drinking?: string | null; photo_path?: string | null; blurred_photo_path?: string | null; age?: number | null; gender?: string | null };
type EventRow = { id: string; creator_id: string; title: string; description: string; venue: string | null; country: string | null; state: string | null; city: string | null; area: string | null; starts_at: string; cover_url: string | null; is_published: boolean };
type WalletTransactionRow = { id: string; currency: string; amount: number; reason: string; created_at: string };

const sections: { name: Section; icon: string; hint: string }[] = [
  { name: 'Confessions', icon: '☁', hint: 'Say what is on your mind' },
  { name: 'Dating', icon: '♡', hint: 'Meet someone new' },
  { name: 'Events', icon: '▦', hint: 'Find your next plan' },
  { name: 'Groups', icon: '◉', hint: 'Your people, your conversations' },
  { name: 'Messages', icon: '↗', hint: 'Requests and private chats' },
  { name: 'Wallet', icon: '◈', hint: 'Your Panda Coins and activity' },
  { name: 'Notifications', icon: '♧', hint: 'Requests, replies and activity updates' },
  { name: 'Profile', icon: '◎', hint: 'Your public details and preferences' },
  { name: 'Admin', icon: '⚙', hint: 'Manage rewards and economy rules' },
];

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [section, setSection] = useState<Section>('Confessions');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { return localStorage.getItem('circle-panda-theme') === 'light' ? 'light' : 'dark'; }
    catch { return 'dark'; }
  });
  const [coinBalance, setCoinBalance] = useState<number | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [signupCountry, setSignupCountry] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [commentsByPost, setCommentsByPost] = useState<Record<string,FeedComment[]>>({});
  const [reactionsByPost, setReactionsByPost] = useState<Record<string,FeedReaction[]>>({});
  const [myReactions, setMyReactions] = useState<Record<string,string>>({});
  const [commentNames, setCommentNames] = useState<Record<string,string>>({});
  const [expandedComments, setExpandedComments] = useState<Record<string,boolean>>({});
  const [reactionPickerPost, setReactionPickerPost] = useState<string|null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string,string>>({});
  const [onboardingStep, setOnboardingStep] = useState<'welcome' | 'tour' | null>(null);
  const [welcomeBonusAmount, setWelcomeBonusAmount] = useState(200);
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [crushPanelKey, setCrushPanelKey] = useState(0);
  const [showCrushUploadChoice, setShowCrushUploadChoice] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('circle-panda-theme', theme); } catch { /* Theme still works for this session. */ }
  }, [theme]);

  useEffect(() => {
    if (!supabase || !session) { setOnboardingStep(null); return; }
    let alive = true;
    async function loadOnboarding() {
      const [profileResult, rewardResult] = await Promise.all([
        supabase!.from('profiles').select('welcome_popup_seen_at,app_tour_seen_at').eq('id', session!.user.id).maybeSingle(),
        supabase!.from('economy_settings').select('numeric_value').eq('setting_key', 'welcome_bonus').maybeSingle(),
      ]);
      if (!alive || profileResult.error || !profileResult.data) return;
      if (rewardResult.data?.numeric_value != null) setWelcomeBonusAmount(Number(rewardResult.data.numeric_value));
      if (!profileResult.data.welcome_popup_seen_at) setOnboardingStep('welcome');
      else if (!profileResult.data.app_tour_seen_at) setOnboardingStep('tour');
      else setOnboardingStep(null);
    }
    void loadOnboarding();
    return () => { alive = false; };
  }, [session]);

  async function continueOnboarding(step: 'welcome' | 'tour', explore = false) {
    if (!supabase || onboardingBusy) return;
    setOnboardingBusy(true);
    const { error } = await supabase.rpc('mark_onboarding_seen', { p_step: step });
    if (error) setNotice(error.message);
    else if (step === 'welcome') setOnboardingStep('tour');
    else {
      setOnboardingStep(null);
      if (explore) setSection('Confessions');
    }
    setOnboardingBusy(false);
  }

  useEffect(() => {
    if (!supabase || !session) { setCoinBalance(null); return; }
    let alive = true;
    supabase.from('wallet_accounts').select('bc_balance').eq('user_id', session.user.id).maybeSingle()
      .then(({ data }) => { if (alive) setCoinBalance(data ? Number(data.bc_balance) : 0); });
    return () => { alive = false; };
  }, [session]);

  useEffect(() => {
    if (!supabase || !session) { setUnreadNotificationCount(0); return; }
    let alive = true;
    supabase.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',session.user.id).is('read_at',null)
      .then(({count})=>{if(alive)setUnreadNotificationCount(count??0);});
    return ()=>{alive=false;};
  }, [session, section]);

  useEffect(() => {
    if (!supabase || !session) { setIsAdmin(false); return; }
    let alive = true;
    supabase.from('user_roles').select('role').eq('user_id',session.user.id).eq('role','admin').maybeSingle()
      .then(({data}) => { if (alive) setIsAdmin(Boolean(data)); });
    return () => { alive = false; };
  }, [session]);

  useEffect(() => {
    if (!supabase || !session || (section !== 'Home' && section !== 'Confessions')) {
      if (!session) setPosts([]);
      return;
    }
    let alive = true;
    const activeUserId = session.user.id;
    async function loadFeed() {
      setLoadingFeed(true);
      const { data, error } = await supabase!.from('feed_posts_public')
        .select('id,body,post_type,is_anonymous,author_name,created_at')
        .eq('post_type', 'confession')
        .order('created_at', { ascending: false }).limit(30);
      if (!alive) return;
      if (error) { setNotice(error.message); setLoadingFeed(false); return; }
      const rows = (data ?? []) as FeedPost[];
      setPosts(rows);
      const ids = rows.map(p => p.id);
      if (ids.length) {
        const [commentResult, reactionResult] = await Promise.all([
          supabase!.from('post_comments').select('id,post_id,author_id,body,created_at').in('post_id', ids).order('created_at', {ascending:true}),
          supabase!.from('post_reactions').select('id,post_id,user_id,reaction').in('post_id', ids),
        ]);
        if (!alive) return;
        const commentRows = (commentResult.data ?? []) as FeedComment[];
        const reactionRows = (reactionResult.data ?? []) as FeedReaction[];
        const groupedComments: Record<string,FeedComment[]> = {};
        const groupedReactions: Record<string,FeedReaction[]> = {};
        commentRows.forEach(row => { (groupedComments[row.post_id] ??= []).push(row); });
        reactionRows.forEach(row => { (groupedReactions[row.post_id] ??= []).push(row); });
        setCommentsByPost(groupedComments); setReactionsByPost(groupedReactions);
        const mine: Record<string,string> = {};
        reactionRows.filter(row => row.user_id === activeUserId).forEach(row => { mine[row.post_id] = row.reaction; });
        setMyReactions(mine);
        const authorIds = [...new Set(commentRows.map(row => row.author_id))];
        if (authorIds.length) {
          const { data: profiles } = await supabase!.from('profiles').select('id,display_name,username').in('id', authorIds);
          if (!alive) return;
          const map: Record<string,string> = {};
          (profiles ?? []).forEach((p: {id:string;display_name:string|null;username:string|null}) => { map[p.id] = p.display_name || p.username || 'Panda'; });
          setCommentNames(map);
        }
      } else {
        setCommentsByPost({}); setReactionsByPost({}); setMyReactions({});
      }
      setLoadingFeed(false);
    }
    void loadFeed();
    return () => { alive = false; };
  }, [session, section]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setAuthBusy(true); setNotice('');
    try {
      if (authMode === 'signup') {
        if (password !== confirmPassword) throw new Error('Your passwords do not match.');
        if (!phone.trim().startsWith('+')) throw new Error('Enter your phone number in international format, including the + country code.');
        const { data, error } = await supabase.auth.signUp({
          phone: phone.trim(), password,
          options: { data: { display_name: displayName.trim() || undefined, country: signupCountry || undefined, contact_email: email.trim() || undefined } },
        });
        if (error) throw error;
        if (data.session) setNotice('Welcome to Circle Panda. Your account is ready.');
        else setNotice('Account created. If phone verification is enabled in Supabase, verify your number before signing in. Email confirmation is not required for this phone-based signup.');
      } else {
        const identifier = email.trim();
        const credentials = identifier.includes('@')
          ? await supabase.auth.signInWithPassword({ email: identifier, password })
          : await supabase.auth.signInWithPassword({ phone: identifier, password });
        if (credentials.error) throw credentials.error;
        setNotice('You are signed in.');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Authentication failed. Please try again.');
    } finally { setAuthBusy(false); }
  }

  async function publishPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session || !draft.trim()) return;
    setPosting(true); setNotice('');
    const { error } = await supabase.from('feed_posts').insert({
      author_id: session.user.id, post_type: section === 'Confessions' ? 'confession' : 'status',
      body: draft.trim(), is_anonymous: section === 'Confessions',
    });
    if (error) setNotice(error.message);
    else {
      setDraft('');
      const { data } = await supabase.from('feed_posts_public').select('id,body,post_type,is_anonymous,author_name,created_at')
        .order('created_at', { ascending: false }).limit(30);
      setPosts((data ?? []) as FeedPost[]);
      setNotice('Posted to your circle.');
    }
    setPosting(false);
  }

  async function toggleReaction(postId: string, reaction: string) {
    if (!supabase || !session) return;
    const existing = myReactions[postId];
    const result = existing === reaction
      ? await supabase.from('post_reactions').delete().eq('post_id', postId).eq('user_id', session.user.id)
      : await supabase.from('post_reactions').upsert({ post_id: postId, user_id: session.user.id, reaction }, { onConflict: 'post_id,user_id' });
    if (result.error) { setNotice(result.error.message); return; }
    setReactionPickerPost(null);
    const { data } = await supabase.from('post_reactions').select('id,post_id,user_id,reaction').eq('post_id', postId);
    const next = {...reactionsByPost, [postId]: (data ?? []) as FeedReaction[]};
    setReactionsByPost(next);
    const selected = {...myReactions};
    if (existing === reaction) delete selected[postId]; else selected[postId] = reaction;
    setMyReactions(selected);
  }

  async function submitComment(event: FormEvent<HTMLFormElement>, postId: string) {
    event.preventDefault();
    if (!supabase || !session || !commentDrafts[postId]?.trim()) return;
    const { error } = await supabase.from('post_comments').insert({
      post_id: postId, author_id: session.user.id, body: commentDrafts[postId].trim(),
    });
    if (error) { setNotice(error.message); return; }
    setCommentDrafts(prev => ({...prev,[postId]:''}));
    const { data } = await supabase.from('post_comments').select('id,post_id,author_id,body,created_at').eq('post_id',postId).order('created_at',{ascending:true});
    setCommentsByPost(prev => ({...prev,[postId]:(data ?? []) as FeedComment[]}));
  }

  async function shareFeedPost(post: FeedPost) {
    const shareText = `${post.is_anonymous ? 'Anonymous confession' : (post.author_name || 'Panda')}: ${post.body}`;
    try {
      const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void>; clipboard?: Clipboard };
      if (typeof nav.share === 'function') {
        await nav.share({ title: 'Circle Panda', text: shareText, url: window.location.href });
      } else if (nav.clipboard && typeof nav.clipboard.writeText === 'function') {
        await nav.clipboard.writeText(`${shareText} — ${window.location.href}`);
        setNotice('Share text copied. You can paste it into any app.');
      } else {
        window.prompt('Copy this to share:', `${shareText} — ${window.location.href}`);
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') setNotice('Could not open sharing options. Please try again.');
    }
  }

  async function messagePostAuthor(postId: string) {
    if (!supabase) return;
    const { error } = await supabase.rpc('send_post_message_request', {
      p_post_id: postId, p_greeting: 'Hi! I saw your post and would like to connect.',
    });
    setNotice(error ? error.message : 'Message request sent. The author will see it in their inbox.');
  }

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    setNotice(error ? error.message : 'You have signed out.');
  }

  if (!session) {
    return <main className="auth-screen">
      <div className="auth-orbit orbit-one" /><div className="auth-orbit orbit-two" />
      <section className="auth-panel">
        <div className="brand-mark">🐼</div>
        <p className="eyebrow">YOUR PEOPLE. YOUR WORLD.</p>
        <h1>Find your <span>circle.</span></h1>
        <p className="auth-copy">Confessions, crushes, events, dating and real conversations — all in one place.</p>
        {!supabaseConfigured && <div className="notice warning">Connect this app with <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to enable account access.</div>}
        <form className="auth-form" onSubmit={handleAuth}>
          {authMode === 'signup' && <label>Your name<input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="How should we call you?" autoComplete="name" required /></label>}
          {authMode === 'signup' && <label>Phone number<input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+2348012345678" autoComplete="tel" required /></label>}
          {authMode === 'signup' && <label>Country<CountryDropdown value={signupCountry} onChange={setSignupCountry} /></label>}
          {authMode === 'signup' ? <label>Email address (optional)<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" /></label> : <label>Phone number or email<input type="text" value={email} onChange={e => setEmail(e.target.value)} placeholder="+234… or you@example.com" required autoComplete="username" /></label>}
          <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} required autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} /></label>
          {authMode === 'signup' && <label>Confirm password<input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Enter your password again" minLength={8} required autoComplete="new-password" /></label>}
          <button className="primary-button full" type="submit" disabled={!supabaseConfigured || authBusy}>{authBusy ? 'Please wait…' : authMode === 'signup' ? 'Create account' : 'Sign in'} <span>→</span></button>
        </form>
        <p className="switch-auth">{authMode === 'signup' ? 'Already part of the circle?' : 'New to Circle Panda?'} <button onClick={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setNotice(''); }}>{authMode === 'signup' ? 'Sign in' : 'Create account'}</button></p>
        {notice && <p className="notice">{notice}</p>}
        <p className="fine-print">A fresh build. A better way to connect.</p>
      </section>
    </main>;
  }

  const active = sections.find(item => item.name === section) ?? { name: section, hint: 'Your circle at a glance' };
  return <div className={`app-shell theme-${theme}`}>
    <aside className="sidebar">
      <button className="brand" onClick={() => setSection('Confessions')}><span className="brand-icon">🐼</span><span>circle<span className="brand-green">panda</span><small>YOUR CIRCLE, YOUR WAY</small></span></button>
      <div className="nav-caption">YOUR SPACE</div>
      <nav>{sections.filter(item => item.name !== 'Admin' || isAdmin).map(item => <button key={item.name} className={section === item.name ? 'nav-item active' : 'nav-item'} onClick={() => { setSection(item.name); setNotice(''); }}><span className="nav-icon">{item.icon}</span><span>{item.name}</span>{item.name === 'Messages' && <i className="nav-dot" />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="online-mark" /> <span>Connected to your circle</span><button onClick={signOut} className="signout">Sign out ↗</button></div>
    </aside>
    <nav className="mobile-bottom-nav" aria-label="Main navigation">
      {[
        {name:'Confessions' as Section, icon:'☁', label:'Confess'},
        {name:'Events' as Section, icon:'▦', label:'Events'},
        {name:'Dating' as Section, icon:'♡', label:'Dating'},
        {name:'Groups' as Section, icon:'◉', label:'Groups'},
        {name:'Messages' as Section, icon:'↗', label:'Messages'},
      ].map((item,index)=><button type="button" key={item.name} aria-label={item.name} aria-current={section===item.name?'page':undefined} className={`mobile-nav-item${section===item.name?' active':''}${index===2?' mobile-nav-dating':''}`} onClick={()=>{setSection(item.name);setNotice('');}}>
        <span className="mobile-nav-icon" aria-hidden="true">{item.icon}</span><span className="mobile-nav-label">{item.label}</span>{item.name==='Messages'&&<i className="nav-dot" />}
      </button>)}
    </nav>
    <main className="main-area">
      <header className="topbar"><div className="mobile-brand">🐼 <strong>circle<span className="brand-green">panda</span></strong></div><div className="topbar-search">⌕ <span>Search your circle</span><kbd>⌘ K</kbd></div><div className="top-actions"><button className="coin-balance-chip" title="Open Panda wallet" onClick={() => setSection('Wallet')}><span className="coin-token" aria-hidden="true"><svg className="panda-coin-engraving" viewBox="0 0 64 64" focusable="false" role="img"><defs><linearGradient id="walletPandaFace" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff9cf"/><stop offset=".22" stopColor="#ffe58a"/><stop offset=".48" stopColor="#e9ad28"/><stop offset=".72" stopColor="#a96508"/><stop offset="1" stopColor="#ffdf70"/></linearGradient><linearGradient id="walletPandaRaised" x1="0" y1="0" x2=".25" y2="1"><stop offset="0" stopColor="#fff5b0"/><stop offset=".35" stopColor="#f8c94e"/><stop offset=".7" stopColor="#d18b13"/><stop offset="1" stopColor="#8b5106"/></linearGradient><linearGradient id="walletPandaRecess" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#75430a"/><stop offset=".5" stopColor="#a5660b"/><stop offset="1" stopColor="#f5c84d"/></linearGradient></defs><g strokeLinejoin="round"><circle cx="15.5" cy="14.5" r="10.5" fill="url(#walletPandaRaised)" stroke="#8c5708" strokeWidth="2"/><circle cx="48.5" cy="14.5" r="10.5" fill="url(#walletPandaRaised)" stroke="#8c5708" strokeWidth="2"/><circle cx="13.5" cy="11.5" r="3.2" fill="#fff2a2" opacity=".85"/><circle cx="46.5" cy="11.5" r="3.2" fill="#fff2a2" opacity=".85"/><path d="M12 28 C12 16 21 10 32 10 S52 16 52 28 L54 37 C53 51 44 58 32 59 C20 58 11 51 10 37 Z" fill="#9a5c08" opacity=".75" transform="translate(0 2)"/><path d="M11 27 C12 16 21 11 32 11 S52 16 53 27 L54 36 C53 50 44 57 32 58 C20 57 11 50 10 36 Z" fill="url(#walletPandaFace)" stroke="#7f4c07" strokeWidth="2"/><path d="M14 28 C16 18 24 15 32 15 S48 18 50 28" fill="none" stroke="#fff3b1" strokeWidth="2" opacity=".9"/><path d="M15 29 C17 23 22 21 26 24 C29 27 28 33 25 37 C22 41 16 40 14 35 C13 33 14 31 15 29 Z" fill="url(#walletPandaRecess)" stroke="#8e570a" strokeWidth="1.5"/><path d="M49 29 C47 23 42 21 38 24 C35 27 36 33 39 37 C42 41 48 40 50 35 C51 33 50 31 49 29 Z" fill="url(#walletPandaRecess)" stroke="#8e570a" strokeWidth="1.5"/><ellipse cx="22" cy="31" rx="3.4" ry="4.5" fill="#5c3508"/><ellipse cx="42" cy="31" rx="3.4" ry="4.5" fill="#5c3508"/><circle cx="21" cy="29.5" r="1.15" fill="#fff0a1"/><circle cx="41" cy="29.5" r="1.15" fill="#fff0a1"/><path d="M19 42 C21 37 27 36 32 39 C37 36 43 37 45 42 C43 49 38 52 32 52 C26 52 21 49 19 42 Z" fill="url(#walletPandaRaised)" stroke="#a5680c" strokeWidth="1.5"/><path d="M27 41 Q32 38 37 41 L32 45 Z" fill="#754207" stroke="#ffe18a" strokeWidth="1"/><path d="M32 45 L32 48 M32 48 Q28 51 25 48 M32 48 Q36 51 39 48" fill="none" stroke="#8b5408" strokeWidth="1.5" strokeLinecap="round"/><path d="M16 43 Q18 47 22 47 M48 43 Q46 47 42 47" fill="none" stroke="#fff0a0" strokeWidth="1.3" strokeLinecap="round"/><path d="M15 38 Q17 42 21 42 M49 38 Q47 42 43 42" fill="none" stroke="#ffec91" strokeWidth="1.2" strokeLinecap="round"/></g></svg></span><span className="coin-balance-copy"><strong>{coinBalance === null ? '—' : coinBalance.toLocaleString()}</strong><small>BC</small></span></button><button className="theme-toggle" title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☼' : '☾'}</button><button className="more-menu-trigger" onClick={() => setMoreOpen(value=>!value)} aria-expanded={moreOpen} aria-label="More Circle Panda pages">☰ <span>More</span></button><button className="icon-button notification-button" title="Notifications" onClick={() => setSection('Notifications')}>♧{unreadNotificationCount>0&&<i className="notification-count">{unreadNotificationCount>9?'9+':unreadNotificationCount}</i>}</button><button className="profile-chip" onClick={() => setSection('Profile')}><span className="avatar">{(session.user.email ?? 'P').slice(0,1).toUpperCase()}</span><span>{session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || 'Panda'}</span><span>⌄</span></button></div></header>{moreOpen && <div className="more-menu-panel"><div className="more-menu-heading"><strong>Explore Circle Panda</strong><button type="button" onClick={()=>setMoreOpen(false)} aria-label="Close menu">×</button></div>{[{name:'Crush' as Section,icon:'♛',hint:'Monday MCM · Wednesday WCW'},...sections.filter(item=>item.name!=='Confessions'&&(item.name!=='Admin'||isAdmin))].map(item=><button type="button" key={item.name} onClick={()=>{setSection(item.name);setMoreOpen(false);setNotice('');}}><span>{item.icon}</span><span>{item.name}</span><small>{item.hint}</small></button>)}<button type="button" className="more-signout" onClick={()=>{setMoreOpen(false);void signOut();}}>↗ Sign out</button></div>}
      <div className={`page-wrap page-${section.toLowerCase()}`}>
<div className="welcome-row"><div><p className="eyebrow">{section === 'Dating' ? 'A SPACE FOR REAL CONNECTIONS' : section === 'Confessions' ? 'WELCOME BACK TO CIRCLE PANDA' : 'WELCOME BACK TO YOUR WORLD'}</p><h1>{section === 'Home' ? 'Your circle, in one place.' : section === 'Confessions' ? 'Secret Confession' : active.name}<span className="heading-period">.</span></h1><p className="section-hint">{section === 'Confessions' ? 'Post your secret confessions, and nobody will know it was you. Nobody will judge you. Feel free to post.' : active.hint}</p></div>{section !== 'Confessions' && <div className="date-pill"><span className="pulse" /> YOUR SPACE IS LIVE</div>}</div>
                {(section === 'Home' || section === 'Confessions') && <div className="confession-shortcuts" aria-label="Circle Panda quick actions"><button type="button" className="confession-shortcut" onClick={() => setShowCrushUploadChoice(true)}><span className="shortcut-circle upload-3d"><span className="shortcut-symbol">＋</span></span><strong>Upload</strong><small>Upload your crush picture</small></button><button type="button" className="confession-shortcut" onClick={() => { localStorage.setItem('circle-panda-crush-type','wcw'); sessionStorage.setItem('circle-panda-open-crush-upload','1'); setSection('Crush'); setCrushPanelKey(key => key + 1); }}><span className="shortcut-circle"><span className="shortcut-symbol corner-symbol">♡</span></span><strong className="shortcut-acronym">WCW</strong><small>Woman Crush Wednesday</small></button><button type="button" className="confession-shortcut" onClick={() => { localStorage.setItem('circle-panda-crush-type','mcm'); sessionStorage.setItem('circle-panda-open-crush-upload','1'); setSection('Confessions'); setCrushPanelKey(key => key + 1); }}><span className="shortcut-circle"><span className="shortcut-symbol corner-symbol">♛</span></span><strong className="shortcut-acronym">MCM</strong><small>Man Crush Monday</small></button></div>}
        {showCrushUploadChoice && <div className="onboarding-backdrop" onClick={() => setShowCrushUploadChoice(false)}><section className="onboarding-dialog crush-choice-dialog" role="dialog" aria-modal="true" aria-labelledby="crush-choice-title" onClick={event => event.stopPropagation()}>
          <button type="button" className="onboarding-close" aria-label="Close upload options" onClick={() => setShowCrushUploadChoice(false)}>×</button>
          <div className="onboarding-panda" aria-hidden="true">🐼</div>
          <p className="eyebrow">SHARE A CRUSH MOMENT</p>
          <h2 id="crush-choice-title">Upload a crush picture</h2>
          <p>Choose where your picture belongs. You’ll continue to the separate picture-upload screen.</p>
          <div className="crush-choice-actions">
            <button type="button" className="primary-button full" onClick={() => { setShowCrushUploadChoice(false); localStorage.setItem('circle-panda-crush-type','wcw'); sessionStorage.setItem('circle-panda-open-crush-upload','1'); setSection('Crush'); setCrushPanelKey(key => key + 1); }}>♡ Woman Crush Wednesday</button>
            <button type="button" className="primary-button full" onClick={() => { setShowCrushUploadChoice(false); localStorage.setItem('circle-panda-crush-type','mcm'); sessionStorage.setItem('circle-panda-open-crush-upload','1'); setSection('Crush'); setCrushPanelKey(key => key + 1); }}>♛ Man Crush Monday</button>
            <button type="button" className="decline-button full" onClick={() => setShowCrushUploadChoice(false)}>Cancel</button>
          </div>
        </section></div>}
        {notice && <div className={`notice inline-notice ${notice.toLowerCase().includes('cannot message yourself') ? 'self-message-warning' : ''}`}>{notice}<button onClick={() => setNotice('')}>×</button></div>}
        {(section === 'Home' || section === 'Confessions') && <>
          <div className="section-title-row"><div><h2>{section === 'Confessions' ? 'Secret Confession' : 'From your circle'}</h2><p>{section === 'Confessions' ? 'Post your secret confessions, and nobody will know it was you. Nobody will judge you. Feel free to post.' : 'Small moments, shared honestly.'}</p></div><span className="count-pill">{posts.length} POSTS</span></div>
          <section id="confession-composer" className="feed-composer"><div className="composer-avatar">🐼</div><form onSubmit={publishPost}><textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder={section === 'Confessions' ? 'Share what is on your mind — anonymously…' : 'What would you like to share with your circle?'} maxLength={5000} required /><div className="composer-footer"><span>{section === 'Confessions' ? '☁ Posted anonymously' : '✦ Be kind, be real'}</span><button className="primary-button" disabled={posting || !draft.trim()}>{posting ? 'Posting…' : 'Share post'} <span>↗</span></button></div></form></section>
          {loadingFeed ? <div className="empty-state">Loading your circle…</div> : posts.length ? <div className="post-list">{posts.map(post => <article className="post-card" key={post.id}><div className="post-top"><div className="post-avatar">{post.is_anonymous ? '🐼' : '✦'}</div><div><strong>{post.is_anonymous ? 'Anonymous Panda' : (post.author_name || 'Panda')}</strong><p>{post.post_type === 'confession' ? 'Confession' : 'Circle post'} · {new Date(post.created_at).toLocaleString()}</p></div><button type="button" className="post-share-button" onClick={() => void shareFeedPost(post)} aria-label="Share this post"><span aria-hidden="true">↗</span> Share</button></div><p className="post-body">{post.body}</p><div className="post-actions"><button className={myReactions[post.id] ? 'react-active' : ''} onClick={() => setReactionPickerPost(reactionPickerPost === post.id ? null : post.id)}>♡ React {reactionsByPost[post.id]?.length ? `(${reactionsByPost[post.id].length})` : ''}</button><button onClick={() => setExpandedComments(prev => ({...prev,[post.id]:!prev[post.id]}))}>▢ Comment {commentsByPost[post.id]?.length ? `(${commentsByPost[post.id].length})` : ''}</button><button onClick={() => void messagePostAuthor(post.id)}>↗ Message</button></div>
              {reactionPickerPost === post.id && <div className="reaction-picker">{[{key:'heart',emoji:'❤️'},{key:'laugh',emoji:'😂'},{key:'surprised',emoji:'😮'},{key:'angry',emoji:'😠'},{key:'panda',emoji:'🐼'}].map(item => <button key={item.key} className={myReactions[post.id] === item.key ? 'selected' : ''} onClick={() => void toggleReaction(post.id,item.key)} title={item.key}>{item.emoji}</button>)}</div>}
              {expandedComments[post.id] && <div className="comments-panel">{(commentsByPost[post.id] ?? []).map(comment => <div className="comment-row" key={comment.id}><span className="comment-avatar">🐼</span><div><strong>{commentNames[comment.author_id] || 'Panda'}</strong><p>{comment.body}</p><small>{new Date(comment.created_at).toLocaleString()}</small></div></div>)}<form className="comment-form" onSubmit={e => void submitComment(e,post.id)}><input value={commentDrafts[post.id] || ''} onChange={e => setCommentDrafts(prev => ({...prev,[post.id]:e.target.value}))} placeholder="Write a comment…" maxLength={2000} required /><button className="primary-button">Send</button></form></div>}</article>)}</div> : <div className="empty-state"><span>✦</span><h3>Your circle starts here.</h3><p>Be the first to share something. Your posts will appear here after publishing.</p></div>}
        </>}
        {section !== 'Home' && section !== 'Confessions' && <FeaturePanel key={section === 'Crush' ? crushPanelKey : section} section={section} userId={session.user.id} onOpenMessages={() => setSection('Messages')} onNavigate={setSection} />}
        <footer className="page-footer"><span>© 2026 Circle Panda</span><span>Built for real connection <b>●</b></span></footer>
      </div>
    </main>
    {onboardingStep && <div className="onboarding-backdrop"><section className="onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      {onboardingStep === 'tour' && <button type="button" className="onboarding-close" aria-label="Close introduction" onClick={() => void continueOnboarding('tour')} disabled={onboardingBusy}>×</button>}
      <div className="onboarding-panda" aria-hidden="true">🐼</div>
      {onboardingStep === 'welcome' ? <>
        <p className="eyebrow">A LITTLE SOMETHING FOR YOU</p>
        <h2 id="onboarding-title">Welcome to Circle Panda!</h2>
        <p>Your welcome bonus has been added to your wallet. Use your BC to enjoy more of your circle.</p>
        <div className="welcome-bonus-amount"><span className="coin-token" aria-label="Gold panda coin"><svg className="panda-coin-engraving" viewBox="0 0 64 64" focusable="false" role="img"><defs><linearGradient id="welcomePandaFace" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff9cf"/><stop offset=".22" stopColor="#ffe58a"/><stop offset=".48" stopColor="#e9ad28"/><stop offset=".72" stopColor="#a96508"/><stop offset="1" stopColor="#ffdf70"/></linearGradient><linearGradient id="welcomePandaRaised" x1="0" y1="0" x2=".25" y2="1"><stop offset="0" stopColor="#fff5b0"/><stop offset=".35" stopColor="#f8c94e"/><stop offset=".7" stopColor="#d18b13"/><stop offset="1" stopColor="#8b5106"/></linearGradient><linearGradient id="welcomePandaRecess" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#75430a"/><stop offset=".5" stopColor="#a5660b"/><stop offset="1" stopColor="#f5c84d"/></linearGradient></defs><g strokeLinejoin="round"><circle cx="15.5" cy="14.5" r="10.5" fill="url(#welcomePandaRaised)" stroke="#8c5708" strokeWidth="2"/><circle cx="48.5" cy="14.5" r="10.5" fill="url(#welcomePandaRaised)" stroke="#8c5708" strokeWidth="2"/><circle cx="13.5" cy="11.5" r="3.2" fill="#fff2a2" opacity=".85"/><circle cx="46.5" cy="11.5" r="3.2" fill="#fff2a2" opacity=".85"/><path d="M12 28 C12 16 21 10 32 10 S52 16 52 28 L54 37 C53 51 44 58 32 59 C20 58 11 51 10 37 Z" fill="#9a5c08" opacity=".75" transform="translate(0 2)"/><path d="M11 27 C12 16 21 11 32 11 S52 16 53 27 L54 36 C53 50 44 57 32 58 C20 57 11 50 10 36 Z" fill="url(#welcomePandaFace)" stroke="#7f4c07" strokeWidth="2"/><path d="M14 28 C16 18 24 15 32 15 S48 18 50 28" fill="none" stroke="#fff3b1" strokeWidth="2" opacity=".9"/><path d="M15 29 C17 23 22 21 26 24 C29 27 28 33 25 37 C22 41 16 40 14 35 C13 33 14 31 15 29 Z" fill="url(#welcomePandaRecess)" stroke="#8e570a" strokeWidth="1.5"/><path d="M49 29 C47 23 42 21 38 24 C35 27 36 33 39 37 C42 41 48 40 50 35 C51 33 50 31 49 29 Z" fill="url(#welcomePandaRecess)" stroke="#8e570a" strokeWidth="1.5"/><ellipse cx="22" cy="31" rx="3.4" ry="4.5" fill="#5c3508"/><ellipse cx="42" cy="31" rx="3.4" ry="4.5" fill="#5c3508"/><circle cx="21" cy="29.5" r="1.15" fill="#fff0a1"/><circle cx="41" cy="29.5" r="1.15" fill="#fff0a1"/><path d="M19 42 C21 37 27 36 32 39 C37 36 43 37 45 42 C43 49 38 52 32 52 C26 52 21 49 19 42 Z" fill="url(#welcomePandaRaised)" stroke="#a5680c" strokeWidth="1.5"/><path d="M27 41 Q32 38 37 41 L32 45 Z" fill="#754207" stroke="#ffe18a" strokeWidth="1"/><path d="M32 45 L32 48 M32 48 Q28 51 25 48 M32 48 Q36 51 39 48" fill="none" stroke="#8b5408" strokeWidth="1.5" strokeLinecap="round"/><path d="M16 43 Q18 47 22 47 M48 43 Q46 47 42 47" fill="none" stroke="#fff0a0" strokeWidth="1.3" strokeLinecap="round"/><path d="M15 38 Q17 42 21 42 M49 38 Q47 42 43 42" fill="none" stroke="#ffec91" strokeWidth="1.2" strokeLinecap="round"/></g></svg></span><strong>{welcomeBonusAmount.toLocaleString()}</strong><small>BC WELCOME BONUS</small></div>
        <button type="button" className="primary-button full" onClick={() => void continueOnboarding('welcome')} disabled={onboardingBusy}>{onboardingBusy ? 'One moment…' : 'Continue'} <span>→</span></button>
      </> : <>
        <p className="eyebrow">YOUR PEOPLE. YOUR WORLD.</p>
        <h2 id="onboarding-title">Your circle, all in one place.</h2>
        <p>Share posts and anonymous confessions, celebrate WCW and MCM, discover dating connections and events, then take every connection into messages.</p>
        <div className="onboarding-features"><span>☁ Confessions</span><span>♡ Crush & dating</span><span>▦ Events</span><span>◉ Groups & chats</span></div>
        <button type="button" className="primary-button full" onClick={() => void continueOnboarding('tour', true)} disabled={onboardingBusy}>{onboardingBusy ? 'One moment…' : 'Explore Circle Panda'} <span>→</span></button>
      </>}
    </section></div>}
  </div>;
}

function FeaturePanel({ section, userId, onOpenMessages, onNavigate }: { section: Section; userId: string; onOpenMessages: () => void; onNavigate: (section: Section) => void }) {
  if (section === 'Messages') return <MessagesFeature userId={userId} />;
  if (section === 'Dating') return <DatingFeature userId={userId} onOpenMessages={onOpenMessages} />;
  if (section === 'Events') return <EventsFeature userId={userId} />;
  if (section === 'Wallet') return <WalletFeature userId={userId} />;
  if (section === 'Notifications') return <NotificationsFeature userId={userId} onNavigate={onNavigate} />;
  if (section === 'Profile') return <ProfileFeature userId={userId} />;
  if (section === 'Groups') return <GroupsFeature userId={userId} />;
  if (section === 'Crush') return <CrushFeature userId={userId} />;
  if (section === 'Admin') return <AdminFeature />;
  const content: Record<Exclude<Section, 'Home' | 'Confessions' | 'Admin' | 'Notifications' | 'Profile'>, { icon: string; title: string; body: string; next: string[] }> = {
    'Crush': { icon: '♛', title: 'Your next crush moment', body: 'MCM on Monday. WCW on Wednesday. Discover the people your circle is celebrating.', next: ['Weekly crush feed', 'Votes and reactions', 'Profile-to-message requests'] },
    'Dating': { icon: '♡', title: 'Make room for a connection', body: 'Build a dating profile, discover people who fit your preferences, and let every match lead to a conversation.', next: ['Dating profile setup', 'Country, state and area filters', 'Send, accept and decline requests'] },
    'Events': { icon: '▦', title: 'Make plans worth showing up for', body: 'Discover events around you or publish one of your own. Event cards will connect directly to the creator.', next: ['Create and publish events', 'Attendance and attendee counts', 'Creator messaging and event boosts'] },
    'Groups': { icon: '◉', title: 'Find your people', body: 'Join a conversation or create a group for your community. VIP spaces will be clearly separated.', next: ['Create and join groups', 'Group member and message flows', 'VIP group spaces'] },
    'Messages': { icon: '↗', title: 'Every connection leads to a conversation', body: 'Message requests from dating, events, groups and the feed will live alongside your accepted chats.', next: ['Incoming and sent requests', 'Accept or decline requests', 'Private chats and unread indicators'] },
    'Wallet': { icon: '◈', title: 'Your Panda wallet', body: 'Your wallet and activity rewards will be managed by server-side rules, with balances that do not expire.', next: ['BC balance and transaction history', 'Activity XP and levels', 'VIP and reward controls'] },
  };
  const item = content[section as Exclude<Section, 'Home' | 'Confessions' | 'Admin' | 'Notifications' | 'Profile'>];
  return <section className="feature-panel"><div className="feature-icon">{item.icon}</div><p className="eyebrow">THE CIRCLE PANDA EXPERIENCE</p><h2>{item.title}</h2><p className="feature-copy">{item.body}</p><div className="feature-list">{item.next.map((next, i) => <div key={next}><span>{String(i + 1).padStart(2, '0')}</span>{next}<b>↗</b></div>)}</div><div className="feature-note"><span className="pulse" /> This section is being connected to the new backend in stages.</div></section>;
}


function MessagesFeature({ userId }: { userId: string }) {
  const [requests, setRequests] = useState<MessageRequestRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [openConversation, setOpenConversation] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busyId, setBusyId] = useState('');
  const [busy, setBusy] = useState(false);
  const [messageNotice, setMessageNotice] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadRequests() {
    if (!supabase) return;
    const { data, error } = await supabase.from('message_requests')
      .select('id,sender_id,recipient_id,source_type,greeting,status,created_at,conversation_id')
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .order('created_at', { ascending: false }).limit(100);
    if (error) { setMessageNotice(error.message); setLoading(false); return; }
    const rows = (data ?? []) as MessageRequestRow[];
    setRequests(rows);
    const ids = [...new Set(rows.flatMap(r => [r.sender_id, r.recipient_id]))];
    if (ids.length) {
      const { data: profiles } = await supabase.from('profiles').select('id,display_name,username').in('id', ids);
      const nextNames: Record<string, string> = {};
      (profiles ?? []).forEach((p: {id:string;display_name:string|null;username:string|null}) => {
        nextNames[p.id] = p.display_name || p.username || 'Panda';
      });
      setNames(nextNames);
    }
    const { data: memberships } = await supabase.from('conversation_members').select('conversation_id,user_id').eq('user_id', userId);
    setConversations((memberships ?? []) as ChatConversation[]);
    setLoading(false);
  }

  async function loadMessages(conversationId: string) {
    if (!supabase) return;
    setOpenConversation(conversationId);
    const { data, error } = await supabase.from('messages')
      .select('id,conversation_id,sender_id,body,created_at')
      .eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(200);
    if (error) setMessageNotice(error.message);
    else setMessages((data ?? []) as ChatMessage[]);
  }

  useEffect(() => { void loadRequests(); }, [userId]);
  useEffect(() => {
    if (!supabase || !openConversation) return;
    const channel = supabase.channel('dm-messages-' + openConversation)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'conversation_id=eq.' + openConversation }, payload => {
        const incoming = payload.new as ChatMessage;
        setMessages(current => current.some(item => item.id === incoming.id)
          ? current
          : [...current, incoming].sort((a, b) => a.created_at.localeCompare(b.created_at)));
      })
      .subscribe();
    return () => { void channel.unsubscribe(); };
  }, [openConversation]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel('dm-requests-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_requests', filter: 'recipient_id=eq.' + userId }, () => { void loadRequests(); })
      .subscribe();
    return () => { void channel.unsubscribe(); };
  }, [userId]);


  async function respond(requestId: string, accept: boolean) {
    if (!supabase) return;
    setBusyId(requestId); setMessageNotice('');
    const { data, error } = await supabase.rpc('respond_direct_message_request_secure', { p_request_id: requestId, p_accept: accept });
    if (error) setMessageNotice(error.message);
    else {
      const result = data as {thread_id?: string|null;status?: string}|null;
      if (accept && result?.thread_id) await loadMessages(result.thread_id);
      await loadRequests();
      setMessageNotice(accept ? (result?.status === 'matched' ? 'Dating match accepted. Your 72-hour free chat is ready.' : 'Request accepted. Your chat is ready.') : 'Request declined.');
    }
    setBusyId('');
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !openConversation || !draft.trim()) return;
    setBusy(true); setMessageNotice('');
    const { error } = await supabase.from('messages').insert({
      conversation_id: openConversation, sender_id: userId, body: draft.trim(),
    });
    if (error) setMessageNotice(error.message);
    else { setDraft(''); await loadMessages(openConversation); }
    setBusy(false);
  }

  const incoming = requests.filter(r => r.recipient_id === userId && r.status === 'pending');
  const sent = requests.filter(r => r.sender_id === userId);
  const activeConversations = [...new Set(conversations.map(c => c.conversation_id))];
  const sourceLabels: Record<string, string> = { dating: 'Dating 💌', event: 'Event ▦', events: 'Event ▦', group: 'Group ◉', wcw: 'WCW ♛', mcm: 'MCM ♛', confession: 'Secret Confession ☁', post: 'Secret Confession ☁' };
  const sourceLabel = (source: string) => sourceLabels[source.toLowerCase()] || source.replaceAll('_', ' ');
  const conversationTitle = (id: string) => {
    const request = requests.find(r => r.conversation_id === id);
    if (!request) return 'Private conversation';
    const otherId = request.sender_id === userId ? request.recipient_id : request.sender_id;
    return names[otherId] || 'Panda';
  };

  return <section className="messages-layout">
    <div className="messages-overview">
      <div className="feature-panel messages-heading"><div className="feature-icon">↗</div><p className="eyebrow">YOUR PRIVATE SPACE</p><h2>Requests that lead to real conversations.</h2><p className="feature-copy">Accept requests to open a private chat. Declined requests are removed from your inbox.</p>
        <div className="message-stats"><div><strong>{incoming.length}</strong><span>INBOX</span></div><div><strong>{sent.filter(r => r.status === 'pending').length}</strong><span>AWAITING</span></div><div><strong>{activeConversations.length}</strong><span>CHATS</span></div></div>
      </div>
      {messageNotice && <div className="notice inline-notice">{messageNotice}<button onClick={() => setMessageNotice('')}>×</button></div>}
      <section className="request-section"><div className="section-title-row"><div><h2>Message requests</h2><p>Requests from dating, events, groups and your feed.</p></div><span className="count-pill">{incoming.length} NEW</span></div>
        {loading ? <div className="empty-state">Loading requests…</div> : incoming.length ? incoming.map(r => <article className="request-card" key={r.id}><div className="request-avatar">🐼</div><div className="request-content"><div className="request-card-top"><strong>{names[r.sender_id] || 'Panda'}</strong><span className="source-tag">{sourceLabel(r.source_type)}</span></div><p>{r.greeting || 'Would like to start a conversation with you.'}</p><small>{new Date(r.created_at).toLocaleString()}</small><div className="request-buttons"><button className="primary-button" disabled={busyId === r.id} onClick={() => void respond(r.id, true)}>{busyId === r.id ? 'Working…' : 'Accept'}</button><button className="decline-button" disabled={busyId === r.id} onClick={() => void respond(r.id, false)}>Decline</button></div></div></article>) : <div className="empty-state compact"><span>✦</span><h3>No new requests</h3><p>When someone wants to connect, their request will show up here.</p></div>}
      </section>
      <section className="request-section"><div className="section-title-row"><div><h2>Sent requests</h2><p>Keep track of requests you have sent.</p></div><span className="count-pill">{sent.length} TOTAL</span></div>
        {sent.length ? sent.map(r => <article className="sent-card" key={r.id}><div><strong>{names[r.recipient_id] || 'Panda'}</strong><p>Message request · {sourceLabel(r.source_type)}</p></div><span className={`status-tag status-${r.status}`}>{r.status}</span>{r.conversation_id && <button className="text-action" onClick={() => void loadMessages(r.conversation_id!)}>Open chat →</button>}</article>) : <div className="empty-state compact"><p>You have not sent a request yet.</p></div>}
      </section>
      <section className="request-section"><div className="section-title-row"><div><h2>Your chats</h2><p>Accepted message requests open private chats.</p></div><span className="count-pill">{activeConversations.length} CHATS</span></div>
        {activeConversations.length ? activeConversations.map(id => <button key={id} className={openConversation === id ? 'chat-list-item selected' : 'chat-list-item'} onClick={() => void loadMessages(id)}><span className="request-avatar">🐼</span><span><strong>{conversationTitle(id)}</strong><small>Private conversation</small></span><b>→</b></button>) : <div className="empty-state compact"><p>Accept a message request to start your first chat.</p></div>}
      </section>
    </div>
    <section className="chat-panel">
      {openConversation ? <><header className="chat-header"><div className="request-avatar">🐼</div><div><strong>{conversationTitle(openConversation)}</strong><p>Only conversation members can read messages.</p></div><button className="text-action" onClick={() => {setOpenConversation(null);setMessages([]);}}>Close ×</button></header><div className="chat-history">{messages.map(m => <div key={m.id} className={m.sender_id === userId ? 'chat-bubble mine' : 'chat-bubble'}><p>{m.body}</p><small>{new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></div>)}{!messages.length && <div className="empty-state compact"><p>Say hello and start the conversation.</p></div>}</div><form className="chat-compose" onSubmit={sendMessage}><input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Write a message…" maxLength={10000} required /><button className="primary-button" disabled={busy || !draft.trim()}>{busy ? 'Sending…' : 'Send ↗'}</button></form></> : <div className="chat-placeholder"><span>↗</span><h3>Your conversations live here.</h3><p>Choose a chat or accept a request to begin messaging.</p></div>}
    </section>
  </section>;
}


type ProfileEditorRow = { display_name: string | null; username: string | null; country: string | null; state: string | null; city: string | null; area: string | null; date_of_birth: string | null; gender: string | null; bio: string | null; timezone: string | null };
type NotificationRow = { id: string; actor_id: string | null; notification_type: string; title: string; body: string; target_type: string | null; target_id: string | null; read_at: string | null; created_at: string };

function ProfileFeature({ userId }: { userId: string }) {
  const [profile,setProfile] = useState<ProfileEditorRow>({display_name:'',username:'',country:'',state:'',city:'',area:'',date_of_birth:'',gender:'',bio:'',timezone:''});
  const [location,setLocation] = useState<LocationValue>({country:'',state:'',city:'',area:''});
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState('');
  async function load() {
    if(!supabase)return;
    const {data,error}=await supabase.from('profiles').select('display_name,username,country,state,city,area,date_of_birth,gender,bio,timezone').eq('id',userId).maybeSingle();
    if(error){setNotice(error.message);setLoading(false);return;}
    const row=(data??{}) as Partial<ProfileEditorRow>;
    const next:ProfileEditorRow={display_name:row.display_name??'',username:row.username??'',country:row.country??'',state:row.state??'',city:row.city??'',area:row.area??'',date_of_birth:row.date_of_birth??'',gender:row.gender??'',bio:row.bio??'',timezone:row.timezone??''};
    setProfile(next);setLocation({country:next.country??'',state:next.state??'',city:next.city??'',area:next.area??''});setLoading(false);
  }
  useEffect(()=>{void load();},[userId]);
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!supabase||busy)return;
    if(!profile.display_name?.trim()){setNotice('Add your display name first.');return;}
    if(profile.date_of_birth && new Date(profile.date_of_birth).getTime()>Date.now()){setNotice('Date of birth cannot be in the future.');return;}
    setBusy(true);setNotice('');
    const {error}=await supabase.from('profiles').update({display_name:profile.display_name.trim(),country:location.country||null,state:location.state||null,city:location.city||null,area:location.area||null,date_of_birth:profile.date_of_birth||null,gender:profile.gender||null,bio:profile.bio?.trim()||null,updated_at:new Date().toISOString()}).eq('id',userId);
    if(error)setNotice(error.message);else{setNotice('Your profile has been saved.');await load();}
    setBusy(false);
  }
  return <section className="feature-panel profile-panel"><div className="feature-icon">◎</div><p className="eyebrow">YOUR CIRCLE PANDA PROFILE</p><h2>Your profile</h2><p className="feature-copy">Keep your details accurate so your community and location-based features work correctly. Your country is used for community matching; there are no follower or following lists here.</p>{notice&&<div className="notice inline-notice">{notice}<button onClick={()=>setNotice('')}>×</button></div>}{loading?<div className="empty-state">Loading your profile…</div>:<form className="feature-form" onSubmit={save}><label>Display name<input value={profile.display_name??''} onChange={e=>setProfile(p=>({...p,display_name:e.target.value}))} maxLength={80} required /></label><label>Username<input value={profile.username??''} readOnly aria-readonly="true" /><small className="field-help">Username changes are managed separately to protect account links.</small></label><label>Bio<textarea value={profile.bio??''} onChange={e=>setProfile(p=>({...p,bio:e.target.value}))} rows={3} maxLength={500} placeholder="A little about you…" /></label><div className="form-grid-two"><label>Gender<select value={profile.gender??''} onChange={e=>setProfile(p=>({...p,gender:e.target.value}))}><option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></label><label>Date of birth<input type="date" value={profile.date_of_birth??''} onChange={e=>setProfile(p=>({...p,date_of_birth:e.target.value}))} /></label></div><div className="profile-location-heading"><strong>Location</strong><small>Choose from the lists; don't type location names manually.</small></div><LocationFields value={location} onChange={setLocation} /><div className="form-submit-row"><button className="primary-button" disabled={busy}>{busy?'Saving…':'Save profile ↗'}</button></div></form>}</section>;
}

function NotificationsFeature({ userId, onNavigate }: { userId:string; onNavigate:(section:Section)=>void }) {
  const [items,setItems]=useState<NotificationRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [busyId,setBusyId]=useState('');
  const [notice,setNotice]=useState('');
  async function load(){
    if(!supabase)return;
    const {data,error}=await supabase.from('notifications').select('id,actor_id,notification_type,title,body,target_type,target_id,read_at,created_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(80);
    if(error)setNotice(error.message);
    setItems((data??[]) as NotificationRow[]);setLoading(false);
  }
  useEffect(()=>{void load();},[userId]);
  async function markRead(id:string){
    if(!supabase)return;
    setBusyId(id);
    const {error}=await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('id',id).eq('user_id',userId);
    if(error)setNotice(error.message);else setItems(prev=>prev.map(item=>item.id===id?{...item,read_at:new Date().toISOString()}:item));
    setBusyId('');
  }
  async function markAllRead(){
    if(!supabase)return;
    setBusyId('all');
    const {error}=await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('user_id',userId).is('read_at',null);
    if(error)setNotice(error.message);else{setNotice('All notifications marked as read.');await load();}
    setBusyId('');
  }
  function openNotification(item:NotificationRow){
    const source=`${item.target_type??''} ${item.notification_type} ${item.title}`.toLowerCase();
    const destination:Section=source.includes('crush')||source.includes('wcw')||source.includes('mcm')?'Crush':source.includes('event')?'Events':source.includes('group')?'Groups':source.includes('dating')?'Dating':source.includes('profile')?'Profile':'Messages';
    if(!item.read_at)void markRead(item.id);
    onNavigate(destination);
  }
  const unread=items.filter(item=>!item.read_at).length;
  return <section className="notifications-page"><div className="notifications-hero"><div><p className="eyebrow">STAY IN THE LOOP</p><h2>Your notifications</h2><p>Message requests, group activity and community updates all appear here.</p></div><div className="notifications-count">{unread}<small>UNREAD</small></div></div>{notice&&<div className="notice inline-notice">{notice}<button onClick={()=>setNotice('')}>×</button></div>}<div className="notifications-toolbar"><span>{items.length} updates</span><button className="text-action" disabled={busyId==='all'||unread===0} onClick={()=>void markAllRead()}>{busyId==='all'?'Marking…':'Mark all as read'}</button></div>{loading?<div className="empty-state">Loading notifications…</div>:items.length?<div className="notification-list">{items.map(item=><article className={item.read_at?'notification-card':'notification-card unread'} key={item.id}><span className="notification-symbol">{item.notification_type.toLowerCase().includes('message')?'↗':item.notification_type.toLowerCase().includes('group')?'◉':item.notification_type.toLowerCase().includes('event')?'▦':'✦'}</span><button className="notification-main" onClick={()=>openNotification(item)}><strong>{item.title}</strong><p>{item.body}</p><small>{new Date(item.created_at).toLocaleString()}</small></button>{!item.read_at&&<button className="text-action" disabled={busyId===item.id} onClick={()=>void markRead(item.id)}>{busyId===item.id?'…':'Mark read'}</button>}</article>)}</div>:<div className="empty-state"><span>♧</span><h3>You’re all caught up.</h3><p>New requests and community updates will show here.</p></div>}</section>;
}

function DatingFeature({ userId, onOpenMessages }: { userId: string; onOpenMessages: () => void }) {
  const [registerOpen, setRegisterOpen] = useState(false);
  const [basicProfileOpen, setBasicProfileOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterLocation, setFilterLocation] = useState<LocationValue>({ country: '', state: '', city: '', area: '' });
  const [filterGoal, setFilterGoal] = useState('');
  const [filterLookingFor, setFilterLookingFor] = useState('');
  const [filterPersonality, setFilterPersonality] = useState('');
  const [filterSmoking, setFilterSmoking] = useState('');
  const [filterDrinking, setFilterDrinking] = useState('');
  const [filterChildren, setFilterChildren] = useState('');
  const [sameCountryOnly, setSameCountryOnly] = useState(false);
  const [openProfile, setOpenProfile] = useState<DatingProfileRow | null>(null);
  const [profileDetailPage, setProfileDetailPage] = useState(0);
  const [detailPhotoUrl, setDetailPhotoUrl] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [optionalAddress, setOptionalAddress] = useState('');
  const [location, setLocation] = useState<LocationValue>({ country: '', state: '', city: '', area: '' });
  const [mainProfile, setMainProfile] = useState<{name:string;username:string;age:number|null;gender:string}>({name:'',username:'',age:null,gender:''});
  const [headline, setHeadline] = useState('');
  const [about, setAbout] = useState('');
  const [relationshipGoal, setRelationshipGoal] = useState('Dating / getting to know someone');
  const [lookingFor, setLookingFor] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [personalityTags, setPersonalityTags] = useState<string[]>([]);
  const [sexualExperience, setSexualExperience] = useState('');
  const [occupation, setOccupation] = useState('');
  const [children, setChildren] = useState('Prefer not to say');
  const [smoking, setSmoking] = useState('Prefer not to say');
  const [drinking, setDrinking] = useState('Prefer not to say');
  const [published, setPublished] = useState(false);
  const [directory, setDirectory] = useState<DatingProfileRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [locations, setLocations] = useState<Record<string, string>>({});
  const [locationDetails, setLocationDetails] = useState<Record<string, LocationValue>>({});
  const [sentRequests, setSentRequests] = useState<Record<string, {status:string; id:string}>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [formStep, setFormStep] = useState(0);
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoPath, setPhotoPath] = useState('');
  const [blurredPhotoPath, setBlurredPhotoPath] = useState('');
  const [datingMatches, setDatingMatches] = useState<any[]>([]);
  const [matchPeople, setMatchPeople] = useState<Record<string,{name:string;headline:string;photoUrl:string;revealed:boolean}>>({});
  const [clock, setClock] = useState(Date.now());

  const relationshipOptions = [
    'Long-distance relationship','Something casual','Long-term relationship','Something that leads to marriage',
    'Just for fun','Just exploring','Friendship first','Dating / getting to know someone'
  ];
  const lookingForOptions = [
    'Very fair','Fair','Light brown','Brown','Dark brown','Deep dark',
    'Black hair','Brown hair','Blonde hair','Red hair','Grey hair','Other',
    'Short hair','Long hair','Dreads','Braids','Curly hair','Straight hair','Bald',
    'Casual','Smart','Streetwear','Glamorous','Feminine','Masculine','Sexy'
  ];
  const bodyTypeOptions = ['Slim','Petite','Average build','Athletic','Muscular','Chubby','Curvy','Plus-size','Broad shoulders','Figure-eight'];
  const interestOptions = [
    'Social media','Content creation','Comedy','Movies & TV','Music','TikTok / Reels','Gaming','Memes',
    'Football','Sports','Travel','Food','Fitness','Photography','Dancing','Fashion','Podcasts','Live music',
    'Cooking','Coffee','Books','Late walks','Night drives','Art galleries'
  ];
  const personalityOptions = [
    'Playful','Adventurous','Social','Social-media person','Office type','Inside type','Romantic','Funny',
    'Ambitious','Party person','Quiet/private','Family-oriented','Spontaneous','Jealous','Easygoing',
    'Quiet','Confident','Caring','Flirty','Introverted','Outgoing'
  ];
  const sexualExperienceOptions = ['Virgin','Novice','Expert','Good in bed','Pro','Prefer not to say'];
  const smokingOptions = ['Non-smoker','Smoker','Occasionally','Prefer not to say'];
  const drinkingOptions = ['Non-drinker','Drinker','Occasionally','Prefer not to say'];
  const childrenOptions = ['No children','Have children','Prefer not to say'];

  function toggleChoice(values: string[], value: string, setter: (next:string[]) => void) {
    setter(values.includes(value) ? values.filter(item => item !== value) : [...values, value]);
  }

  function ageFromDate(date: string) {
    if (!date) return null;
    const born = new Date(date + 'T00:00:00');
    if (Number.isNaN(born.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - born.getFullYear();
    if (now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())) age--;
    return age;
  }

  async function load() {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data: profile, error: profileError } = await supabase.from('profiles')
        .select('display_name,username,age,date_of_birth,gender,country,state,state_province,city,area')
        .eq('id', userId).maybeSingle();
      if (profileError) throw profileError;
      if (profile) {
        setMainProfile({ name: profile.display_name || profile.username || 'Panda', username: profile.username || '', age: profile.age == null ? null : Number(profile.age), gender: profile.gender || '' });
        setDateOfBirth(profile.date_of_birth || '');
        const savedLocation = { country: profile.country || '', state: profile.state_province || profile.state || '', city: profile.city || '', area: profile.area || '' };
        setLocation(savedLocation);
        if (!profile.date_of_birth || !savedLocation.country || !savedLocation.city || !savedLocation.area) { setBasicProfileOpen(true); }
      } else {
        setFormStep(0);
        setBasicProfileOpen(true);
      }

      const { data: mine, error: mineError } = await supabase.from('dating_profiles')
        .select('id,user_id,headline,about,personality,sexual_experience,looking_for,is_published,created_at,relationship_goal,interests,personality_tags,occupation,children,smoking,drinking,photo_path,blurred_photo_path,name,age,gender,vibe,emoji,location,country,state_province')
        .eq('user_id', userId).maybeSingle();
      if (mineError) throw mineError;
      if (mine) {
        setHeadline(mine.headline || '');
        setAbout(mine.about || '');
        setRelationshipGoal(mine.relationship_goal || 'Dating / getting to know someone');
        setLookingFor(Array.isArray(mine.looking_for) ? mine.looking_for : []);
        setInterests(Array.isArray(mine.interests) ? mine.interests : []);
        setPersonalityTags(Array.isArray(mine.personality_tags) ? mine.personality_tags : (Array.isArray(mine.personality) ? mine.personality : []));
        setSexualExperience(mine.sexual_experience || '');
        setOccupation(mine.occupation || '');
        setChildren(mine.children || 'Prefer not to say');
        setSmoking(mine.smoking || 'Prefer not to say');
        setDrinking(mine.drinking || 'Prefer not to say');
        setPublished(Boolean(mine.is_published));
        setPhotoPath(mine.photo_path || '');
        setBlurredPhotoPath(mine.blurred_photo_path || '');
      }

      const { data, error } = await supabase.from('dating_profiles')
        .select('id,user_id,headline,about,personality,sexual_experience,looking_for,is_published,created_at,relationship_goal,interests,personality_tags,occupation,children,smoking,drinking,photo_path,blurred_photo_path')
        .eq('is_published', true).neq('user_id', userId).order('created_at', { ascending: false }).limit(60);
      if (error) throw error;
      const rows = (data ?? []) as DatingProfileRow[];
      setDirectory(rows);
      const ids = rows.map(row => row.user_id);
      if (ids.length) {
        const { data: publicProfiles } = await supabase.from('profiles')
          .select('id,display_name,username,country,state,state_province,city,area,age,gender').in('id', ids);
        const nameMap: Record<string, string> = {};
        const locationMap: Record<string, string> = {};
        const detailsMap: Record<string, LocationValue> = {};
        (publicProfiles ?? []).forEach((p: {id:string;display_name:string|null;username:string|null;country:string|null;state:string|null;state_province:string|null;city:string|null;area:string|null}) => {
          nameMap[p.id] = p.display_name || p.username || 'Panda';
          locationMap[p.id] = [p.area,p.city,p.state_province || p.state,p.country].filter(Boolean).join(', ');
          detailsMap[p.id] = { country: p.country || '', state: p.state_province || p.state || '', city: p.city || '', area: p.area || '' };
        });
        setNames(nameMap); setLocations(locationMap); setLocationDetails(detailsMap);
      } else {
        setNames({}); setLocations({}); setLocationDetails({});
      }

      const { data: requests, error: requestsError } = await supabase.from('message_requests')
        .select('id,sender_id,recipient_id,source_type,status,created_at')
        .eq('source_type','dating').or('sender_id.eq.' + userId + ',recipient_id.eq.' + userId)
        .order('created_at',{ascending:false}).limit(100);
      if (requestsError) throw requestsError;
      const requestMap: Record<string,{status:string;id:string}> = {};
      (requests ?? []).filter((r: {sender_id:string;recipient_id:string}) => r.sender_id === userId)
        .forEach((r: {id:string;recipient_id:string;status:string}) => { requestMap[r.recipient_id] = {status:r.status,id:r.id}; });
      setSentRequests(requestMap);

      const { data: matchRows, error: matchError } = await supabase.rpc('get_my_dating_matches_secure');
      if (matchError) {
        setNotice(matchError.message);
      } else {
        const activeMatches = ((matchRows ?? []) as any[]).filter(match => match.status === 'matched');
        setDatingMatches(activeMatches);
        const otherIds = [...new Set(activeMatches.map(match => match.user_a === userId ? match.user_b : match.user_a))];
        if (otherIds.length) {
          const { data: datingRows } = await supabase.from('dating_profiles')
            .select('user_id,name,headline,photo_path,blurred_photo_path').in('user_id', otherIds);
          const { data: peopleRows } = await supabase.from('profiles')
            .select('id,display_name,username').in('id', otherIds);
          const profileNames: Record<string,string> = {};
          (peopleRows ?? []).forEach((person: {id:string;display_name:string|null;username:string|null}) => {
            profileNames[person.id] = person.display_name || person.username || 'Panda';
          });
          const people: Record<string,{name:string;headline:string;photoUrl:string;revealed:boolean}> = {};
          await Promise.all((datingRows ?? []).map(async (person: {user_id:string;name:string|null;headline:string|null;photo_path:string|null;blurred_photo_path:string|null}) => {
            const match = activeMatches.find(item => (item.user_a === userId ? item.user_b : item.user_a) === person.user_id);
            const revealed = Boolean(match?.photos_revealed);
            const path = revealed ? person.photo_path : person.blurred_photo_path;
            let photoUrl = '';
            if (path) {
              const bucket = revealed ? 'dating-photos' : 'dating-photo-blur';
              const { data: signed } = await supabase!.storage.from(bucket).createSignedUrl(path, 10 * 60);
              photoUrl = signed?.signedUrl || '';
            }
            people[person.user_id] = {name:person.name || profileNames[person.user_id] || 'Panda',headline:person.headline || '',photoUrl,revealed};
          }));
          setMatchPeople(people);
        } else {
          setMatchPeople({});
        }
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load dating profiles.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [userId]);
  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!profilePhoto) { setPhotoPreview(''); return; }
    const url = URL.createObjectURL(profilePhoto);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [profilePhoto]);

  const submitLock = useRef(false);

  async function createBlurredPhoto(file: File) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    const max = 1200;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the dating photo.');
    context.filter = 'blur(18px)';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not create blurred photo.')), 'image/webp', 0.78));
    return new File([blob], 'blurred.webp', {type:'image/webp'});
  }

  async function uploadDatingPhoto() {
    if (!supabase || !profilePhoto) return {photo_path:photoPath || null, blurred_photo_path:blurredPhotoPath || null};
    const extension = profilePhoto.name.split('.').pop()?.toLowerCase() || 'jpg';
    const base = userId + '/' + crypto.randomUUID();
    const originalPath = base + '.' + extension;
    const blurredPath = base + '-blurred.webp';
    const blurredFile = await createBlurredPhoto(profilePhoto);
    const { error: originalError } = await supabase.storage.from('dating-photos').upload(originalPath, profilePhoto, {upsert:true,contentType:profilePhoto.type});
    if (originalError) throw originalError;
    const { error: blurredError } = await supabase.storage.from('dating-photo-blur').upload(blurredPath, blurredFile, {upsert:true,contentType:'image/webp'});
    if (blurredError) throw blurredError;
    return {photo_path:originalPath,blurred_photo_path:blurredPath};
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>, publishNow: boolean) {
    event.preventDefault();
    if (!supabase || submitLock.current) return;
    const calculatedAge = ageFromDate(dateOfBirth);
    const effectiveAge = calculatedAge ?? mainProfile.age;
    if (publishNow && (!dateOfBirth || effectiveAge == null || effectiveAge < 18)) {
      setNotice(effectiveAge != null && effectiveAge < 18 ? 'Dating is only available to adults aged 18 and over.' : 'Add your date of birth to your main profile before publishing Dating.');
      return;
    }
    if (!headline.trim()) { setNotice('Add a profile headline before saving.'); return; }
    submitLock.current = true;
    setBusy(true); setNotice('');
    try {
      let photo = {photo_path:photoPath || null,blurred_photo_path:blurredPhotoPath || null};
      if (profilePhoto) photo = await uploadDatingPhoto();
      const { error: profileError } = await supabase.from('profiles').update({
        date_of_birth: dateOfBirth || null,
        country: location.country || null,
        state: location.state || null,
        state_province: location.state || null,
        city: location.city || null,
        area: location.area || null,
        age: calculatedAge ?? mainProfile.age,
      }).eq('id', userId);
      if (profileError) throw profileError;
      const { error } = await supabase.from('dating_profiles').upsert({
        user_id: userId,
        headline: headline.trim(),
        about: about.trim(),
        bio: about.trim(),
        name: mainProfile.name || 'Panda',
        age: effectiveAge,
        gender: mainProfile.gender || null,
        location: [location.area,location.city,location.state,location.country].filter(Boolean).join(', '),
        country: location.country || null,
        state_province: location.state || null,
        relationship_goal: relationshipGoal,
        looking_for: lookingFor,
        interests,
        personality: personalityTags,
        personality_tags: personalityTags,
        sexual_experience: sexualExperience || null,
        occupation: occupation.trim() || null,
        children,
        smoking,
        drinking,
        photo_path: photo.photo_path,
        blurred_photo_path: photo.blurred_photo_path,
        photos: photo.photo_path ? [photo.photo_path] : [],
        is_published: publishNow,
      }, { onConflict: 'user_id' });
      if (error) throw error;
      setPhotoPath(photo.photo_path || '');
      setBlurredPhotoPath(photo.blurred_photo_path || '');
      setProfilePhoto(null);
      setPublished(publishNow);
      setNotice(publishNow ? 'Your dating profile is published and ready to discover.' : 'Your dating profile draft is saved.');
      setRegisterOpen(false);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save your dating profile. Please try again.');
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  }

  async function confirmDatingMatch(matchId: string) {
    if (!supabase || busy) return;
    setBusy(true); setNotice('');
    const { data, error } = await supabase.rpc('decide_dating_match_secure', { p_match_id: matchId, p_decision: 'continue' });
    if (error) setNotice(error.message);
    else {
      const result = data as {status?:string}|null;
      setNotice(result?.status === 'matched' ? 'Both people confirmed. Dating photos are now revealed.' : 'Your confirmation is saved. The other person must also confirm to reveal photos.');
      await load();
    }
    setBusy(false);
  }

  async function requestChat(profile: DatingProfileRow) {
    if (!supabase || profile.user_id === userId) return;
    const previous = sentRequests[profile.user_id];
    if (previous && ['pending','accepted'].includes(previous.status)) {
      setNotice(previous.status === 'accepted' ? 'You already have an accepted conversation with this person.' : 'Your message request is already waiting for a response.');
      return;
    }
    setBusy(true); setNotice('');
    const { data, error } = await supabase.rpc('request_dating_match_secure', { p_recipient_id: profile.user_id });
    if (error) setNotice(error.message);
    else {
      const result = data as {status?:string;request_id?:string;thread_id?:string}|null;
      setNotice(result?.status === 'matched' ? 'It is a mutual match 💗. Your free 72-hour Dating chat is ready.' : 'Dating message request sent. You can track it in Messages.');
      await load();
      if (result?.status === 'matched') onOpenMessages();
    }
    setBusy(false);
  }

  const filteredDirectory = directory.filter(profile => {
    const place = locationDetails[profile.user_id];
    const row = profile as DatingProfileRow & {relationship_goal?:string;looking_for?:string[];personality_tags?:string[];children?:string;smoking?:string;drinking?:string};
    if (filterGoal && !(row.relationship_goal || '').toLowerCase().includes(filterGoal.toLowerCase())) return false;
    if (filterLookingFor && !(row.looking_for || []).some(value => value.toLowerCase().includes(filterLookingFor.toLowerCase()))) return false;
    if (filterPersonality && !(row.personality_tags || row.personality || []).some(value => value.toLowerCase().includes(filterPersonality.toLowerCase()))) return false;
    if (filterSmoking && row.smoking !== filterSmoking) return false;
    if (filterDrinking && row.drinking !== filterDrinking) return false;
    if (filterChildren && row.children !== filterChildren) return false;
    if (sameCountryOnly && location.country && place?.country !== location.country) return false;
    if (!place) return !filterLocation.country && !filterLocation.state && !filterLocation.city && !filterLocation.area && !sameCountryOnly;
    return (!filterLocation.country || place.country === filterLocation.country)
      && (!filterLocation.state || place.state === filterLocation.state)
      && (!filterLocation.city || place.city === filterLocation.city)
      && (!filterLocation.area || place.area === filterLocation.area);
  });

  async function viewDatingProfile(profile: DatingProfileRow) {
    setOpenProfile(profile);
    setProfileDetailPage(0);
    setDetailPhotoUrl('');
    const row = profile as DatingProfileRow & {blurred_photo_path?:string|null};
    if (supabase && row.blurred_photo_path) {
      const { data } = await supabase.storage.from('dating-photo-blur').createSignedUrl(row.blurred_photo_path, 10 * 60);
      setDetailPhotoUrl(data?.signedUrl || '');
    }
  }

  function ChoiceChips({values,selected,onToggle}:{values:string[];selected:string[];onToggle:(value:string)=>void}) {
    return <div className="choice-chips">{values.map(value => <button type="button" key={value}
      className={selected.includes(value) ? 'choice-chip selected' : 'choice-chip'}
      onClick={() => onToggle(value)}>{value}</button>)}</div>;
  }

  function SingleChoices({values,value,onChange}:{values:string[];value:string;onChange:(value:string)=>void}) {
    return <div className="choice-chips">{values.map(option => <button type="button" key={option}
      className={value === option ? 'choice-chip selected' : 'choice-chip'}
      onClick={() => onChange(option)}>{option}</button>)}</div>;
  }

  const effectiveAge = ageFromDate(dateOfBirth) ?? mainProfile.age;
  const formSteps = ['Your introduction','Lifestyle','Personality','Looking for & appearance','Body type','Sexual Experience','Picture upload'];
  const currentPhotoLabel = profilePhoto ? profilePhoto.name : photoPath ? 'Dating photo saved' : 'Add a dating photo';

  return <div className="dating-page">
    <div className="dating-toolbar dating-toolbar-stacked">
      <button type="button" className="secondary-button dating-filter-button" aria-expanded={filtersOpen} onClick={() => { setFiltersOpen(open => !open); if (!filtersOpen) setRegisterOpen(false); }}>{filtersOpen ? 'Close Filter ×' : 'Filter'}</button>
      <button type="button" className="primary-button dating-create-button" aria-expanded={registerOpen || basicProfileOpen} onClick={() => { if (basicProfileOpen) { setBasicProfileOpen(false); return; } if (registerOpen) { setRegisterOpen(false); return; } setFiltersOpen(false); const complete=Boolean(dateOfBirth && location.country && location.city && location.area && effectiveAge != null && effectiveAge >= 18); if (!complete) setBasicProfileOpen(true); else { setFormStep(0); setRegisterOpen(true); } }}>
        {registerOpen ? 'Close Dating Profile ×' : published ? 'Edit Dating Profile' : 'Create Dating Profile'}
      </button>
    </div>
    {filtersOpen && <section className="feature-panel dating-filter-panel">
      <div className="section-title-row"><div><h2>Filter dating cards</h2><p>Choose location and relationship preferences.</p></div><button type="button" className="secondary-button" onClick={() => {setFilterLocation({country:'',state:'',city:'',area:''});setFilterGoal('');setFilterLookingFor('');setFilterPersonality('');setFilterSmoking('');setFilterDrinking('');setFilterChildren('');setSameCountryOnly(false);}}>Clear</button></div>
      <LocationFields value={filterLocation} onChange={setFilterLocation} />
      <label>Relationship goal<select value={filterGoal} onChange={e => setFilterGoal(e.target.value)}><option value="">Any relationship goal</option>{relationshipOptions.map(option => <option key={option}>{option}</option>)}</select></label>
      <div className="dating-filter-grid">
        <label>Looking for<select value={filterLookingFor} onChange={e=>setFilterLookingFor(e.target.value)}><option value="">Any preference</option>{lookingForOptions.map(option=><option key={option}>{option}</option>)}</select></label>
        <label>Personality<select value={filterPersonality} onChange={e=>setFilterPersonality(e.target.value)}><option value="">Any personality</option>{personalityOptions.map(option=><option key={option}>{option}</option>)}</select></label>
        <label>Smoking<select value={filterSmoking} onChange={e=>setFilterSmoking(e.target.value)}><option value="">Any</option>{smokingOptions.map(option=><option key={option}>{option}</option>)}</select></label>
        <label>Drinking<select value={filterDrinking} onChange={e=>setFilterDrinking(e.target.value)}><option value="">Any</option>{drinkingOptions.map(option=><option key={option}>{option}</option>)}</select></label>
        <label>Children<select value={filterChildren} onChange={e=>setFilterChildren(e.target.value)}><option value="">Any</option>{childrenOptions.map(option=><option key={option}>{option}</option>)}</select></label>
      </div>
      <label className="dating-same-country"><input type="checkbox" checked={sameCountryOnly} onChange={e=>setSameCountryOnly(e.target.checked)} /> Only show people in my country{location.country ? ' (' + location.country + ')' : ''}</label>
    </section>}
    {basicProfileOpen && <div className="dating-basic-backdrop" role="dialog" aria-modal="true" aria-label="Complete your profile"><section className="dating-basic-modal">
      <header><div><p className="eyebrow">DATING</p><h2>Complete your profile</h2></div><button type="button" className="dating-basic-close" aria-label="Close" onClick={()=>setBasicProfileOpen(false)}>×</button></header>
      <label>Date of birth<input type="date" value={dateOfBirth} max={new Date().toISOString().slice(0,10)} onChange={e=>setDateOfBirth(e.target.value)} required /></label>
      <p className="dating-basic-age">Age: <strong>{effectiveAge == null ? 'Choose your date of birth' : effectiveAge + ' years'}</strong> · 18+ only.</p>
      <LocationFields value={location} onChange={setLocation} required />
      <label className="dating-address-field">Address <span>(optional)</span><input type="text" value={optionalAddress} onChange={e=>setOptionalAddress(e.target.value)} maxLength={180} placeholder="Street or address (optional)" autoComplete="street-address" /></label>
      {notice && <div className="notice dating-basic-notice">{notice}</div>}
      <div className="dating-basic-actions"><button type="button" className="secondary-button" onClick={()=>setBasicProfileOpen(false)}>Cancel</button><button type="button" className="primary-button" disabled={busy} onClick={async()=>{
        const age=ageFromDate(dateOfBirth);
        if(!dateOfBirth || age===null){setNotice('Choose your date of birth to continue.');return;}
        if(age<18){setNotice('Dating is only available to adults aged 18 and over.');return;}
        if(!location.country){setNotice('Choose your country to continue.');return;}
        if(location.country && !location.state && ['United States','Canada','Australia','India','Brazil','Mexico'].includes(location.country)){setNotice('Choose your state or province to continue.');return;}
        if(!location.city){setNotice('Choose your city to continue.');return;}
        if(!location.area){setNotice('Choose your area or neighbourhood to continue.');return;}
        if(!supabase){setNotice('Your account could not be reached. Please try again.');return;}
        setBusy(true);setNotice('');
        const {error}=await supabase.from('profiles').update({date_of_birth:dateOfBirth,age,country:location.country,state:location.state||null,state_province:location.state||null,city:location.city||null,area:location.area||null}).eq('id',userId);
        if(!error && optionalAddress.trim()) {
          const { error: metadataError } = await supabase.auth.updateUser({data:{optional_address:optionalAddress.trim()}});
          if(metadataError) setNotice('Profile saved, but the optional address could not be saved: '+metadataError.message);
        }
        setBusy(false);
        if(error){setNotice(error.message);return;}
        setMainProfile(current=>({...current,age}));
        setBasicProfileOpen(false);setFormStep(0);setRegisterOpen(true);
      }}>{busy?'Saving…':'Submit'}</button></div>
    </section></div>}
    {registerOpen && <div className="dating-profile-backdrop dating-setup-backdrop" role="dialog" aria-modal="true" aria-label="Complete your dating details"><section className="dating-profile-detail dating-setup-modal">
      <header><button type="button" className="secondary-button" onClick={() => { setRegisterOpen(false); setNotice('You can finish your Dating details any time from Edit Your Profile.'); }}>Cancel</button><strong>Dating profile setup</strong><span>{formStep+1}/{formSteps.length}</span></header><div className="dating-setup-intro"><div className="feature-icon dating-feature-icon">♡</div><p className="eyebrow">YOUR DATING SPACE</p>
      <h2>{published ? 'Update your dating profile' : 'Create your dating profile'}</h2>
      <p className="feature-copy">Dating is for adults aged 18+. Your basic details are saved to your Circle Panda account so the rest of the app can use the same profile information.</p></div>
      <div className="dating-stepper" aria-label="Setup progress"><span className="dating-step-counter">STEP {formStep+1} OF {formSteps.length}</span><strong>{formSteps[formStep]}</strong><div className="dating-progress-track"><span style={{width:`${((formStep+1)/formSteps.length)*100}%`}} /></div></div>
      <form className="feature-form" onSubmit={e => void saveProfile(e, false)}>
        {formStep === 0 && <section className="dating-form-step">
          <h3>Your introduction</h3><p>Now that your basic profile is complete, introduce yourself to people in Dating.</p>
          <div className="dating-account-summary"><div><span>Name</span><strong>{mainProfile.name || 'Panda'}</strong></div><div><span>Age</span><strong>{effectiveAge == null ? '—' : effectiveAge}</strong></div><div><span>Location</span><strong>{[location.area,location.city,location.state,location.country].filter(Boolean).join(', ') || '—'}</strong></div></div>
          <label>Profile headline<input value={headline} onChange={e=>setHeadline(e.target.value)} maxLength={120} required placeholder="A little about the kind of person you are…" /></label>
          <label>About me<textarea value={about} onChange={e=>setAbout(e.target.value)} maxLength={2500} rows={3} placeholder="What would you like someone to know about you?" /></label>
        </section>}
        {formStep === 1 && <section className="dating-form-step">
          <h3>Lifestyle</h3><p>Quick details that help people understand your everyday preferences.</p>
          <label>Smoking<SingleChoices values={smokingOptions} value={smoking} onChange={setSmoking} /></label>
          <label>Children<SingleChoices values={childrenOptions} value={children} onChange={setChildren} /></label>
          <label>Drinking<SingleChoices values={drinkingOptions} value={drinking} onChange={setDrinking} /></label>
          <label>Occupation (optional)<input value={occupation} onChange={e=>setOccupation(e.target.value)} maxLength={120} placeholder="What you do" /></label>
        </section>}
        {formStep === 2 && <section className="dating-form-step">
          <h3>Personality</h3><p>Pick the traits and interests that feel most like you.</p>
          <label>Personality<ChoiceChips values={personalityOptions} selected={personalityTags} onToggle={value=>toggleChoice(personalityTags,value,setPersonalityTags)} /></label>
          <label>Interests<ChoiceChips values={interestOptions} selected={interests} onToggle={value=>toggleChoice(interests,value,setInterests)} /></label>
        </section>}
        {formStep === 3 && <section className="dating-form-step">
          <h3>Looking for & appearance</h3><p>Choose the relationship you want and the appearance traits you prefer.</p>
          <label>Relationship goal<SingleChoices values={relationshipOptions} value={relationshipGoal} onChange={setRelationshipGoal} /></label>
          <label>Skin, hair & style<ChoiceChips values={lookingForOptions} selected={lookingFor} onToggle={value=>toggleChoice(lookingFor,value,setLookingFor)} /></label>
        </section>}
        {formStep === 4 && <section className="dating-form-step">
          <h3>Body type</h3><p>Select the body types you prefer.</p>
          <ChoiceChips values={bodyTypeOptions} selected={lookingFor.filter(value=>bodyTypeOptions.includes(value))} onToggle={value=>toggleChoice(lookingFor,value,setLookingFor)} />
        </section>}
        {formStep === 5 && <section className="dating-form-step">
          <h3>Sexual Experience</h3><p>Choose the option you feel comfortable sharing. This is a personal detail, and you can choose the answer you prefer.</p>
          <label>Sexual Experience<SingleChoices values={sexualExperienceOptions} value={sexualExperience} onChange={setSexualExperience} /></label>
        </section>}
        {formStep === 6 && <section className="dating-form-step">
          <h3>Picture upload</h3><p>Add an optional dating picture to finish setting up your profile.</p>
          <div className="dating-photo-preview">{profilePhoto && photoPreview ? <img src={photoPreview} alt="Dating photo preview" /> : photoPath ? <span>✓</span> : <span>🐼</span>}</div><label className="photo-upload-label">Dating photo (optional)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setProfilePhoto(e.target.files?.[0] || null)} /></label><p className="draft-state">{currentPhotoLabel}</p>
        </section>}
        <div className="form-submit-row dating-form-actions">
          <button className="secondary-button" type="button" disabled={formStep===0 || busy} onClick={()=>setFormStep(step=>Math.max(0,step-1))}>Back</button>
          {formStep < formSteps.length-1
            ? <button className="primary-button" type="button" disabled={busy} onClick={async()=>{
                if(formStep===0){
                  const age=ageFromDate(dateOfBirth);
                  if(!dateOfBirth || age===null){setNotice('Add your date of birth to continue.');return;}
                  if(age<18){setNotice('Dating is only available to adults aged 18 and over.');return;}
                  if(!location.country){setNotice('Choose your country to continue.');return;}
                  if(!supabase){setNotice('Your account could not be reached. Please try again.');return;}
                  setBusy(true);setNotice('');
                  const {error}=await supabase.from('profiles').update({date_of_birth:dateOfBirth,age,country:location.country,state:location.state||null,state_province:location.state||null,city:location.city||null,area:location.area||null}).eq('id',userId);
                  setBusy(false);
                  if(error){setNotice(error.message);return;}
                  setMainProfile(current=>({...current,age}));
                }
                setNotice('');setFormStep(step=>Math.min(formSteps.length-1,step+1));
              }}>Next →</button>
            : <><button className="secondary-button" type="submit" disabled={busy}>{busy?'Saving…':'Save draft'}</button><button className="primary-button" type="button" disabled={busy} onClick={e=>{const form=e.currentTarget.form;if(form)void saveProfile({preventDefault:()=>{},currentTarget:form} as FormEvent<HTMLFormElement>,true);}}>{busy?'Publishing…':'Save & publish ↗'}</button></>}
        </div>
      </form>
      {notice && <div className="notice">{notice}</div>}
    </section></div>}
    {notice && !registerOpen && <div className="notice">{notice}</div>}
    {datingMatches.length > 0 && <section className="directory-section dating-connections-section">
      <div className="section-title-row"><div><h2>Your Dating connections</h2><p>Dating chats are free for the first 72 hours. After that, both people must continue before photos are revealed.</p></div><span className="count-pill">{datingMatches.length} MATCHES</span></div>
      <div className="dating-directory">{datingMatches.map(match => {
        const otherId = match.user_a === userId ? match.user_b : match.user_a;
        const person = matchPeople[otherId];
        const remaining = Math.max(0,new Date(match.free_until).getTime()-clock);
        const hours = Math.floor(remaining/3600000);
        const minutes = Math.floor((remaining%3600000)/60000);
        const seconds = Math.floor((remaining%60000)/1000);
        return <article className="dating-card dating-match-card" key={match.id}>
          <div className="dating-card-top"><div className="dating-avatar">💗</div><div><strong>{person?.name || 'Your match'}</strong><p>{match.photos_revealed ? 'Photos revealed' : remaining > 0 ? 'Free Dating chat active' : 'Waiting for mutual confirmation'}</p></div></div>
          {person?.photoUrl ? <img className="dating-match-photo" src={person.photoUrl} alt={match.photos_revealed ? 'Dating match photo' : 'Blurred dating photo'} /> : <div className="dating-photo-preview match-photo-placeholder">🐼</div>}
          {person?.headline && <p className="dating-about">{person.headline}</p>}
          {remaining > 0 ? <p className="dating-match-countdown">Free chat · {String(hours).padStart(2,'0')}:{String(minutes).padStart(2,'0')}:{String(seconds).padStart(2,'0')} remaining</p>
            : match.photos_revealed ? <p className="published-state">● Both people continued. Photos are revealed.</p>
            : <><p className="draft-state">The 72-hour period is complete. Confirm that you want to continue.</p><button className="primary-button" disabled={busy} onClick={()=>void confirmDatingMatch(match.id)}>Continue & reveal ↗</button></>}
          <button className="secondary-button" type="button" onClick={onOpenMessages}>Open chat in Messages ↗</button>
        </article>;
      })}</div>
    </section>}
    <section className="directory-section"><div className="section-title-row"><div><h2>Discover your circle</h2><p>Adult profiles from the Circle Panda community.</p></div><span className="count-pill">{filteredDirectory.length} PROFILES</span></div>
      {loading ? <div className="empty-state">Loading dating profiles…</div> : filteredDirectory.length ? <div className="dating-directory">{filteredDirectory.map(profile => {
        const row = profile as DatingProfileRow & {relationship_goal?:string;interests?:string[];personality_tags?:string[];occupation?:string;children?:string;smoking?:string;drinking?:string;sexual_experience?:string;looking_for?:string[];age?:number;gender?:string};
        const request = sentRequests[profile.user_id];
        const alreadyMatched = datingMatches.some(match => (match.user_a === userId && match.user_b === profile.user_id) || (match.user_b === userId && match.user_a === profile.user_id));
        return <article className="dating-card" key={profile.id}>
          <div className="dating-card-top"><div className="dating-avatar">♡</div><div><strong>{names[profile.user_id] || 'Panda'}</strong><p>{locations[profile.user_id] || 'Location not added'}{row.age ? ' · ' + row.age : ''}</p></div><span className="heart-mark">♡</span></div>
          <h3>{profile.headline || 'Getting to know someone new'}</h3><p className="dating-about">{profile.about || 'This panda is looking forward to meeting someone.'}</p>
          {row.relationship_goal && <div className="personality-tag">Looking for: {row.relationship_goal}</div>}
          {Array.isArray(row.personality_tags) && row.personality_tags.length > 0 && <div className="dating-tag-list">{row.personality_tags.slice(0,5).map(tag=><span className="personality-tag" key={tag}>{tag}</span>)}</div>}
          {Array.isArray(row.interests) && row.interests.length > 0 && <p className="dating-about"><strong>Interests:</strong> {row.interests.slice(0,5).join(' · ')}</p>}
          <button type="button" className="secondary-button dating-view-profile" onClick={()=>void viewDatingProfile(profile)}>View full profile</button>
          <div className="dating-card-bottom"><span>{alreadyMatched ? 'Mutual match 💗' : request ? 'Request: ' + request.status : '18+ · Dating'}</span>
            <button className="primary-button" disabled={busy || Boolean(request && request.status === 'pending' && !alreadyMatched)} onClick={()=>alreadyMatched || request?.status === 'accepted' ? onOpenMessages() : void requestChat(profile)}>
              {alreadyMatched || request?.status === 'accepted' ? 'Open chat ↗' : request?.status === 'pending' ? 'Request sent ✓' : request?.status === 'declined' ? 'Send again ↗' : 'Send message request ↗'}
            </button>
          </div>
        </article>;
      })}</div> : <div className="empty-state"><span>♡</span><h3>{directory.length ? 'No dating cards match these filters.' : 'Your next connection starts here.'}</h3><p>{directory.length ? 'Try a different location or clear your filters.' : 'Published profiles from adults in the community will appear here.'}</p></div>}
    </section>
    {openProfile && <div className="dating-profile-backdrop" role="dialog" aria-modal="true" aria-label="Dating profile details">
      <section className="dating-profile-detail">
        <header><button type="button" className="secondary-button" onClick={()=>setOpenProfile(null)}>‹ Back</button><strong>Dating profile</strong><span>{profileDetailPage+1}/2</span></header>
        {profileDetailPage === 0 ? <div className="dating-detail-body">
          {detailPhotoUrl ? <img className="dating-detail-photo" src={detailPhotoUrl} alt="Blurred dating profile photo" /> : <div className="dating-detail-avatar">♡</div>}
          <p className="eyebrow">ABOUT THIS PANDA</p>
          <h2>{names[openProfile.user_id] || 'Panda'}{(openProfile as DatingProfileRow & {age?:number}).age ? ' · ' + (openProfile as DatingProfileRow & {age?:number}).age : ''}</h2>
          <p className="dating-about">{openProfile.headline || 'Getting to know someone new'}</p>
          <p className="dating-about">{openProfile.about || 'This panda is looking forward to meeting someone.'}</p>
          <div className="dating-detail-facts">
            <div><span>Location</span><strong>{locations[openProfile.user_id] || 'Not added'}</strong></div>
            <div><span>Relationship goal</span><strong>{(openProfile as DatingProfileRow & {relationship_goal?:string}).relationship_goal || 'Not specified'}</strong></div>
            <div><span>Sexual Experience</span><strong>{openProfile.sexual_experience || 'Prefer not to say'}</strong></div>
          </div>
          <button type="button" className="primary-button" onClick={()=>setProfileDetailPage(1)}>More about this Panda →</button>
        </div> : <div className="dating-detail-body">
          <p className="eyebrow">GET TO KNOW THEM</p>
          <h2>More about {names[openProfile.user_id] || 'this Panda'}</h2>
          <div className="dating-detail-facts">
            <div><span>Looking for</span><strong>{((openProfile as DatingProfileRow & {looking_for?:string[]}).looking_for || []).join(', ') || 'Not specified'}</strong></div>
            <div><span>Personality</span><strong>{((openProfile as DatingProfileRow & {personality_tags?:string[]}).personality_tags || openProfile.personality || []).join(', ') || 'Not specified'}</strong></div>
            <div><span>Interests</span><strong>{((openProfile as DatingProfileRow & {interests?:string[]}).interests || []).join(', ') || 'Not specified'}</strong></div>
            <div><span>Occupation</span><strong>{(openProfile as DatingProfileRow & {occupation?:string}).occupation || 'Not specified'}</strong></div>
            <div><span>Children</span><strong>{(openProfile as DatingProfileRow & {children?:string}).children || 'Prefer not to say'}</strong></div>
            <div><span>Smoking / drinking</span><strong>{[(openProfile as DatingProfileRow & {smoking?:string}).smoking,(openProfile as DatingProfileRow & {drinking?:string}).drinking].filter(Boolean).join(' · ') || 'Not specified'}</strong></div>
          </div>
          <button type="button" className="secondary-button" onClick={()=>setProfileDetailPage(0)}>← Back to overview</button>
          <button type="button" className="primary-button" disabled={busy} onClick={()=>{const selected=openProfile;setOpenProfile(null);void requestChat(selected);}}>Send message request ↗</button>
        </div>}
      </section>
    </div>}
  </div>;
}

function EventsFeature({ userId }: { userId: string }) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [attending, setAttending] = useState<Record<string, boolean>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [venue, setVenue] = useState('');
  const [location, setLocation] = useState<LocationValue>({ country: '', state: '', city: '', area: '' });
  const [startsAt, setStartsAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [promotionStatus, setPromotionStatus] = useState<{eligible:boolean;base_reach:number;notification_cap:number;is_vip:boolean}|null>(null);
  const [blastEventId, setBlastEventId] = useState<string|null>(null);
  const [blastScope, setBlastScope] = useState<'worldwide'|'country'|'state'|'city'|'area'>('worldwide');
  const [blastLocation, setBlastLocation] = useState<LocationValue>({country:'',state:'',city:'',area:''});
  const [blastBusy, setBlastBusy] = useState(false);
  const [eventSearch, setEventSearch] = useState('');

  async function load() {
    if (!supabase) return;
    const { data, error } = await supabase.from('events')
      .select('id,creator_id,title,description,venue,country,state,city,area,starts_at,cover_url,is_published')
      .eq('is_published', true).order('starts_at', { ascending: true }).limit(60);
    const { data: promotion } = await supabase.rpc('get_event_promotion_status_secure');
    if (promotion) setPromotionStatus(promotion as {eligible:boolean;base_reach:number;notification_cap:number;is_vip:boolean});
    if (error) setNotice(error.message);
    const rows = (data ?? []) as EventRow[];
    setEvents(rows);
    const ids = rows.map(row => row.id);
    const creatorIds = [...new Set(rows.map(row => row.creator_id))];
    if (creatorIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('id,display_name,username').in('id', creatorIds);
      const nameMap: Record<string,string> = {};
      (profiles ?? []).forEach((p: {id:string;display_name:string|null;username:string|null}) => { nameMap[p.id] = p.display_name || p.username || 'Panda'; });
      setNames(nameMap);
    }
    if (ids.length) {
      const { data: attendees } = await supabase.from('event_attendees').select('event_id,user_id,status').in('event_id', ids).neq('status','cancelled');
      const countMap: Record<string,number> = {};
      const ownMap: Record<string,boolean> = {};
      (attendees ?? []).forEach((a: {event_id:string;user_id:string;status:string}) => {
        countMap[a.event_id] = (countMap[a.event_id] || 0) + (a.status === 'attending' ? 1 : 0);
        if (a.user_id === userId && a.status === 'attending') ownMap[a.event_id] = true;
      });
      setCounts(countMap); setAttending(ownMap);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [userId]);

  const filteredEvents = events.filter(item=>`${item.title} ${item.description} ${item.venue??''} ${item.country??''} ${item.state??''} ${item.city??''} ${item.area??''}`.toLowerCase().includes(eventSearch.trim().toLowerCase()));
  const publishLock = useRef(false);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || publishLock.current) return;
    if (!startsAt || new Date(startsAt).getTime() <= Date.now()) { setNotice('Choose a future event date and time.'); return; }
    publishLock.current = true;
    setBusy(true); setNotice('');
    try {
      const { error } = await supabase.from('events').insert({
        creator_id: userId, title: title.trim(), description: description.trim(),
        venue: venue.trim() || null, country: location.country || null,
        state: location.state || null, city: location.city || null, area: location.area || null, starts_at: new Date(startsAt).toISOString(), is_published: true,
      });
      if (error) throw error;
      setTitle(''); setDescription(''); setVenue(''); setLocation({ country: '', state: '', city: '', area: '' }); setStartsAt('');
      setNotice('Event published successfully.'); await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not publish this event. Please try again.');
    } finally {
      publishLock.current = false;
      setBusy(false);
    }
  }

  async function toggleAttendance(item: EventRow) {
    if (!supabase || item.creator_id === userId) return;
    setBusy(true); setNotice('');
    const { error } = await supabase.from('event_attendees').upsert({
      event_id: item.id, user_id: userId, status: attending[item.id] ? 'cancelled' : 'attending',
    }, { onConflict: 'event_id,user_id' });
    if (error) setNotice(error.message);
    else { setNotice(attending[item.id] ? 'You are no longer attending.' : 'You are marked as attending.'); await load(); }
    setBusy(false);
  }

  async function startFreeBlast() {
    if(!supabase||!blastEventId||blastBusy)return;
    if(!promotionStatus?.eligible){setNotice('Your free Event Blast has already been used this month.');return;}
    if(blastScope==='country'&&!blastLocation.country){setNotice('Choose a country for this audience.');return;}
    if(blastScope==='state'&&(!blastLocation.country||!blastLocation.state)){setNotice('Choose a country and state for this audience.');return;}
    if(blastScope==='city'&&(!blastLocation.country||!blastLocation.city)){setNotice('Choose a country and city for this audience.');return;}
    if(blastScope==='area'&&(!blastLocation.country||!blastLocation.area)){setNotice('Choose a country and area for this audience.');return;}
    setBlastBusy(true);setNotice('');
    const {data,error}=await supabase.rpc('claim_free_event_promotion_secure',{
      p_event_id:blastEventId,p_target_scope:blastScope,
      p_target_country:blastLocation.country||null,p_target_state:blastLocation.state||null,
      p_target_city:blastLocation.city||null,p_target_area:blastLocation.area||null,
    });
    if(error)setNotice(error.message);
    else {
      const result=(data??{}) as {unique_reach?:number;notification_cap?:number;ends_at?:string};
      setNotice(`Event Blast started: ${result.unique_reach??promotionStatus?.base_reach??100} unique people targeted. Your audience will receive the event notification.`);
      setBlastEventId(null);setBlastLocation({country:'',state:'',city:'',area:''});setBlastScope('worldwide');await load();
    }
    setBlastBusy(false);
  }

  async function messageCreator(item: EventRow) {
    if (!supabase || item.creator_id === userId) return;
    const { error } = await supabase.rpc('send_message_request', {
      p_recipient_id: item.creator_id, p_source_type: 'event', p_source_id: item.id,
      p_greeting: `Hi! I saw your event “${item.title}” and would like to ask you something.`,
    });
    setNotice(error ? error.message : 'Message request sent to the event creator.');
  }

  return <div className="events-page">
    <section className="feature-panel event-create-panel"><div className="feature-icon">▦</div><p className="eyebrow">MAKE SOMETHING HAPPEN</p><h2>Publish an event</h2><p className="feature-copy">Create a real plan for your community. Your event is published once the form succeeds.</p>
      <form className="feature-form" onSubmit={publish}>
        <label>Event title<input value={title} onChange={e => setTitle(e.target.value)} maxLength={160} required placeholder="What are we getting together for?" /></label>
        <label>Description<textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={4000} placeholder="Tell people what to expect…" /></label>
        <label>Venue or meeting point<input value={venue} onChange={e => setVenue(e.target.value)} maxLength={250} placeholder="Venue, online or meeting point" /></label>
        <LocationFields value={location} onChange={setLocation} /><label>Date and time<input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} required /></label>
        <div className="form-submit-row"><span className="draft-state">No media upload in this version</span><button className="primary-button" type="submit" disabled={busy}>{busy ? 'Publishing…' : 'Publish event ↗'}</button></div>
      </form>
      {notice && <div className="notice">{notice}</div>}
    </section>
    <section className="directory-section"><div className="section-title-row"><div><h2>Events in your circle</h2><p>Find a plan, RSVP, or contact the host directly.</p></div><span className="count-pill">{events.length} EVENTS</span></div><div className="event-directory-tools"><input value={eventSearch} onChange={e=>setEventSearch(e.target.value)} placeholder="Search events, venues or locations…" aria-label="Search events" /></div>
      {loading ? <div className="empty-state">Loading events…</div> : filteredEvents.length ? <div className="event-directory">{filteredEvents.map(item => <article className="event-card" key={item.id}><div className="event-date-block"><span>{new Date(item.starts_at).toLocaleDateString([], {month:'short'}).toUpperCase()}</span><strong>{new Date(item.starts_at).getDate()}</strong><small>{new Date(item.starts_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></div><div className="event-card-body"><div className="event-creator">HOSTED BY {names[item.creator_id] || 'PANDA'}</div><h3>{item.title}</h3><p>{item.description || 'Join the community for this event.'}</p><div className="event-meta"><span>⌖ {[item.venue,item.area,item.city,item.state,item.country].filter(Boolean).join(' · ') || 'Location to be announced'}</span><span className="event-attending-count"><strong>ATTENDING {counts[item.id] || 0}</strong> 👤</span></div><div className="event-card-actions">{item.creator_id === userId ? <><span className="published-state">● Your event</span><button className="primary-button event-boost-button" disabled={!promotionStatus?.eligible||busy||!promotionStatus} onClick={()=>{setBlastEventId(item.id);setBlastScope('worldwide');setBlastLocation({country:'',state:'',city:'',area:''});}}>{promotionStatus?.eligible?'Boost Event ↗':'Free Blast Used'}</button></> : <><button className="primary-button" disabled={busy} onClick={() => void toggleAttendance(item)}>{attending[item.id] ? '✓ Attending' : 'I’m attending'}</button><button className="decline-button" disabled={busy} onClick={() => void messageCreator(item)}>Message creator ↗</button></>}</div></div></article>)}</div> : <div className="empty-state"><span>▦</span><h3>{events.length?'No events match your search.':'There is room for your first event.'}</h3><p>{events.length?'Try a different title, venue or location.':'Publish an event above and it will appear here for your community.'}</p></div>}
    </section>
    {blastEventId&&<div className="onboarding-backdrop" onClick={()=>!blastBusy&&setBlastEventId(null)}><section className="feature-panel event-blast-modal" role="dialog" aria-modal="true" aria-labelledby="event-blast-title" onClick={event=>event.stopPropagation()}><button type="button" className="modal-close" aria-label="Close Event Blast" onClick={()=>setBlastEventId(null)}>×</button><p className="eyebrow">REACH YOUR COMMUNITY</p><h2 id="event-blast-title">Boost Event · Free Blast</h2><p className="feature-copy">Your monthly free blast reaches up to <strong>{promotionStatus?.base_reach??100} unique people</strong> with a notification cap of {promotionStatus?.notification_cap??200}. {promotionStatus?.is_vip?'Your VIP benefit is active.':'VIP members receive a higher monthly reach.'}</p><label className="event-blast-scope">Target audience<select value={blastScope} onChange={e=>setBlastScope(e.target.value as typeof blastScope)}><option value="worldwide">Worldwide</option><option value="country">Country</option><option value="state">State / region</option><option value="city">City</option><option value="area">Area / neighbourhood</option></select></label>{blastScope!=='worldwide'&&<LocationFields value={blastLocation} onChange={setBlastLocation} />}<div className="form-submit-row"><button type="button" className="decline-button" disabled={blastBusy} onClick={()=>setBlastEventId(null)}>Cancel</button><button type="button" className="primary-button" disabled={blastBusy||!promotionStatus?.eligible} onClick={()=>void startFreeBlast()}>{blastBusy?'Starting blast…':'Start free blast ↗'}</button></div></section></div>}
  </div>;
}


function WalletFeature({ userId }: { userId: string }) {
  const [bcBalance, setBcBalance] = useState(0);
  const [wcBalance, setWcBalance] = useState(0);
  const [xpTotal, setXpTotal] = useState(0);
  const [levelName, setLevelName] = useState('Novice');
  const [transactions, setTransactions] = useState<WalletTransactionRow[]>([]);
  const [settings, setSettings] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  async function load() {
    if (!supabase) return;
    const [walletResult, xpResult, transactionResult, settingsResult] = await Promise.all([
      supabase.from('wallet_accounts').select('bc_balance,wc_balance').eq('user_id', userId).maybeSingle(),
      supabase.from('user_xp').select('xp_total,level_name').eq('user_id', userId).maybeSingle(),
      supabase.from('wallet_transactions').select('id,currency,amount,reason,created_at').eq('user_id', userId).order('created_at', {ascending:false}).limit(20),
      supabase.from('economy_settings').select('setting_key,numeric_value'),
    ]);
    if (walletResult.data) { setBcBalance(Number(walletResult.data.bc_balance)); setWcBalance(Number(walletResult.data.wc_balance)); }
    if (xpResult.data) { setXpTotal(Number(xpResult.data.xp_total)); setLevelName(xpResult.data.level_name); }
    setTransactions((transactionResult.data ?? []) as WalletTransactionRow[]);
    const map: Record<string,number> = {};
    (settingsResult.data ?? []).forEach((s: {setting_key:string;numeric_value:number}) => { map[s.setting_key] = Number(s.numeric_value); });
    setSettings(map);
    const error = walletResult.error || xpResult.error || transactionResult.error || settingsResult.error;
    if (error) setNotice(error.message);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [userId]);

  async function claimDailyReward() {
    if (!supabase) return;
    setBusy(true); setNotice('');
    const { error } = await supabase.rpc('claim_economy_reward', { p_reward_key: 'daily_login_reward' });
    if (error) setNotice(error.message);
    else { setNotice('Daily login reward credited to your wallet.'); await load(); }
    setBusy(false);
  }

  function formatReason(reason: string) {
    return reason.replace(/^reward:/,'').replace(/^message_cost:/,'message cost · ').replaceAll('_',' ');
  }

  return <div className="wallet-page">
    <section className="wallet-hero"><div><p className="eyebrow">YOUR PANDA ECONOMY</p><h2>Your activity has value.</h2><p>BC balances do not expire. Rewards and message charges are processed by the backend.</p></div><div className="wallet-coin">◈<span>BC</span></div></section>
    {notice && <div className="notice inline-notice">{notice}<button onClick={() => setNotice('')}>×</button></div>}
    <div className="wallet-balance-grid"><article className="balance-card primary-balance"><span>PANDA COINS</span><strong>{loading ? '—' : bcBalance.toLocaleString()}</strong><small>BC · non-expiring balance</small></article><article className="balance-card"><span>WALLET COINS</span><strong>{loading ? '—' : wcBalance.toLocaleString()}</strong><small>WC balance</small></article><article className="balance-card"><span>EXPERIENCE POINTS</span><strong>{loading ? '—' : xpTotal.toLocaleString()}</strong><small>{levelName} level</small></article></div>
    <div className="wallet-actions"><div><h3>Daily activity</h3><p>Claim the daily login reward once every 24 hours.</p></div><button className="primary-button" disabled={busy || loading} onClick={() => void claimDailyReward()}>{busy ? 'Checking…' : `Claim daily reward · +${settings.daily_login_reward ?? 3} BC`}</button></div>
    <section className="wallet-history"><div className="section-title-row"><div><h2>Wallet activity</h2><p>Latest rewards and message charges.</p></div><span className="count-pill">{transactions.length} RECORDS</span></div>
      {loading ? <div className="empty-state">Loading wallet…</div> : transactions.length ? transactions.map(t => <article className="transaction-row" key={t.id}><span className={t.amount >= 0 ? 'transaction-icon credit' : 'transaction-icon debit'}>{t.amount >= 0 ? '+' : '−'}</span><div><strong>{formatReason(t.reason)}</strong><small>{new Date(t.created_at).toLocaleString()}</small></div><b className={t.amount >= 0 ? 'amount-credit' : 'amount-debit'}>{t.amount > 0 ? '+' : ''}{t.amount} {t.currency}</b></article>) : <div className="empty-state compact"><p>Your wallet transactions will appear here.</p></div>}
    </section>
    <section className="economy-rules"><div className="section-title-row"><div><h2>Current economy rules</h2><p>Values are loaded from admin-controlled settings.</p></div></div><div className="rules-grid"><div><span>Regular message</span><strong>{settings.chat_message_cost ?? 1} BC</strong></div><div><span>Dating messages after free period</span><strong>{settings.dating_message_cost ?? 1} BC</strong></div><div><span>Dating free period</span><strong>{settings.dating_free_hours ?? 72} hours</strong></div><div><span>Ad reward</span><strong>{settings.ad_reward ?? 30} BC</strong></div><div><span>Ad cooldown</span><strong>{Math.round((settings.ad_reward_cooldown_seconds ?? 300)/60)} min</strong></div><div><span>Extra vote</span><strong>{settings.extra_vote_cost ?? 50} BC</strong></div></div><p className="economy-footnote">Ad rewards remain locked until a trusted ad-completion callback is connected. This prevents reward claims without a verified ad view.</p></section>
  </div>;
}


type GroupRow = { id: string; creator_id: string; name: string; description: string; country_restriction: string | null; is_vip: boolean; created_at: string };
function GroupsFeature({ userId }: { userId: string }) {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string,number>>({});
  const [myGroups, setMyGroups] = useState<Record<string,boolean>>({});
  const [myVip, setMyVip] = useState(false);
  const [myCountry, setMyCountry] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [countryRestriction, setCountryRestriction] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [openGroupId, setOpenGroupId] = useState<string|null>(null);
  const [openConversationId, setOpenConversationId] = useState<string|null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [groupReactions, setGroupReactions] = useState<Record<string,GroupMessageReaction[]>>({});
  const [groupReactionPicker, setGroupReactionPicker] = useState<string | null>(null);
  const [groupSenderNames, setGroupSenderNames] = useState<Record<string,string>>({});

  async function load() {
    if (!supabase) return;
    const { data: profile } = await supabase.from('profiles').select('is_vip,country').eq('id',userId).maybeSingle();
    setMyVip(Boolean(profile?.is_vip)); setMyCountry(profile?.country || '');
    const { data, error } = await supabase.from('chat_groups')
      .select('id,creator_id,name,description,country_restriction,is_vip,created_at')
      .order('created_at',{ascending:false}).limit(100);
    if (error) setNotice(error.message);
    const rows = (data ?? []) as GroupRow[];
    setGroups(rows);
    const ids = rows.map(g => g.id);
    if (ids.length) {
      const [membersResult, mineResult] = await Promise.all([
        supabase.from('group_members').select('group_id,user_id,role').in('group_id',ids),
        supabase.from('group_members').select('group_id').eq('user_id',userId).in('group_id',ids),
      ]);
      const counts: Record<string,number> = {};
      const mine: Record<string,boolean> = {};
      (membersResult.data ?? []).forEach((m: {group_id:string;user_id:string;role:string}) => { counts[m.group_id] = (counts[m.group_id] || 0) + 1; });
      (mineResult.data ?? []).forEach((m: {group_id:string}) => { mine[m.group_id] = true; });
      setMemberCounts(counts); setMyGroups(mine);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [userId]);
  useEffect(() => {
    if (!supabase || !openConversationId) return;
    const channel = supabase.channel('group-messages-' + openConversationId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'conversation_id=eq.' + openConversationId }, payload => {
        const incoming = payload.new as ChatMessage;
        setChatMessages(current => current.some(item => item.id === incoming.id)
          ? current
          : [...current, incoming].sort((a, b) => a.created_at.localeCompare(b.created_at)));
      })
      .subscribe();
    return () => { void channel.unsubscribe(); };
  }, [openConversationId]);


  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setNotice('');
    const { error } = await supabase.rpc('create_chat_group',{
      p_name:name.trim(),p_description:description.trim(),p_country_restriction:countryRestriction.trim() || null,p_is_vip:false,
    });
    if (error) setNotice(error.message);
    else { setName('');setDescription('');setCountryRestriction('');setNotice('Group created. Invite people to join; chat opens at 3 members.');await load(); }
    setBusy(false);
  }

  async function joinGroup(group: GroupRow) {
    if (!supabase) return;
    setBusy(true);setNotice('');
    const { error } = await supabase.rpc('join_chat_group',{p_group_id:group.id});
    if (error) setNotice(error.message);
    else { setNotice('You joined the group.');await load(); }
    setBusy(false);
  }

  async function openChat(group: GroupRow) {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('open_group_chat',{p_group_id:group.id});
    if (error) { setNotice(error.message);return; }
    setOpenGroupId(group.id);setOpenConversationId(data as string);setNotice('');
    const { data: rows, error: messagesError } = await supabase.from('messages')
      .select('id,conversation_id,sender_id,body,created_at,reply_to_message_id').eq('conversation_id',data as string).order('created_at',{ascending:true}).limit(200);
    if (messagesError) setNotice(messagesError.message);
    else {
      const messages = (rows ?? []) as ChatMessage[];
      setChatMessages(messages);
      const senderIds = [...new Set(messages.map(m => m.sender_id))];
      if (senderIds.length) {
        const { data: people } = await supabase.from('profiles').select('id,display_name,username').in('id', senderIds);
        const map: Record<string,string> = {};
        (people ?? []).forEach((p: {id:string;display_name:string|null;username:string|null}) => { map[p.id] = p.display_name || p.username || 'Panda'; });
        setGroupSenderNames(map);
      }
      const messageIds = messages.map(m => m.id);
      if (messageIds.length) {
        const { data: reactions } = await supabase.from('group_message_reactions').select('id,message_id,user_id,reaction').in('message_id',messageIds);
        const grouped: Record<string,GroupMessageReaction[]> = {};
        (reactions ?? []).forEach((r: GroupMessageReaction) => { (grouped[r.message_id] ??= []).push(r); });
        setGroupReactions(grouped);
      } else setGroupReactions({});
    }
  }

  async function sendGroupMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !openConversationId || !chatDraft.trim()) return;
    setBusy(true);setNotice('');
    const { error } = await supabase.from('messages').insert({conversation_id:openConversationId,sender_id:userId,body:chatDraft.trim(),reply_to_message_id:replyingTo?.id ?? null});
    if (error) setNotice(error.message);
    else {
      setChatDraft(''); setReplyingTo(null);
      const { data } = await supabase.from('messages').select('id,conversation_id,sender_id,body,created_at,reply_to_message_id')
        .eq('conversation_id',openConversationId).order('created_at',{ascending:true}).limit(200);
      setChatMessages((data ?? []) as ChatMessage[]);
    }
    setBusy(false);
  }

  async function toggleGroupReaction(messageId: string, reaction: string) {
    if (!supabase) return;
    const existing = groupReactions[messageId]?.find(r => r.user_id === userId);
    const result = existing?.reaction === reaction
      ? await supabase.from('group_message_reactions').delete().eq('message_id',messageId).eq('user_id',userId)
      : await supabase.from('group_message_reactions').upsert({message_id:messageId,user_id:userId,reaction},{onConflict:'message_id,user_id'});
    if (result.error) { setNotice(result.error.message); return; }
    const { data } = await supabase.from('group_message_reactions').select('id,message_id,user_id,reaction').eq('message_id',messageId);
    setGroupReactions(prev => ({...prev,[messageId]:(data ?? []) as GroupMessageReaction[]}));
    setGroupReactionPicker(null);
  }

  const openGroup = groups.find(g => g.id === openGroupId);
  return <div className="groups-page">
    <section className="feature-panel group-create-panel"><div className="feature-icon">◉</div><p className="eyebrow">YOUR PEOPLE, YOUR SPACE</p><h2>Create a group</h2><p className="feature-copy">Normal groups stay available without a 24-hour expiry. The group chat unlocks when at least three members have joined.</p>
      <form className="feature-form" onSubmit={createGroup}>
        <label>Group name<input value={name} onChange={e=>setName(e.target.value)} maxLength={100} minLength={2} required placeholder="Give your group a name" /></label>
        <label>About the group<textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3} maxLength={2000} placeholder="What brings this group together?" /></label>
        <CountryDropdown value={countryRestriction} onChange={setCountryRestriction} />
        <div className="form-submit-row"><span className="draft-state">3 members to open chat</span><button className="primary-button" disabled={busy}>{busy?'Creating…':'Create group ↗'}</button></div>
      </form>
      {notice && <div className="notice">{notice}</div>}
    </section>
    <section className="group-directory"><div className="section-title-row"><div><h2>Group directory</h2><p>Join a community and help it reach three members.</p></div><span className="count-pill">{groups.length} GROUPS</span></div>
      <div className="vip-group-banner"><div><span>✦ VIP WORLDWIDE</span><strong>Worldwide VIP Group</strong><small>Always available to VIP members</small></div>{myVip ? <span className="vip-access">VIP access</span> : <button className="vip-locked" onClick={()=>setNotice('VIP membership checkout will be connected to the admin-controlled subscription flow.')}>🔒 Become VIP</button>}</div>
      {myCountry && <div className="vip-group-banner country-vip"><div><span>✦ VIP COUNTRY</span><strong>{myCountry} VIP Group</strong><small>Country-based VIP community</small></div>{myVip ? <span className="vip-access">VIP access</span> : <button className="vip-locked" onClick={()=>setNotice('Complete VIP membership to unlock the country group.')}>🔒 Become VIP</button>}</div>}
      {loading ? <div className="empty-state">Loading groups…</div> : groups.length ? <div className="group-cards">{groups.filter(g=>!g.is_vip).map(group => {
        const count = memberCounts[group.id] || 0;
        const member = Boolean(myGroups[group.id]);
        const opened = count >= 3;
        return <article className="group-card" key={group.id}><div className="group-card-icon">◉</div><div className="group-card-main"><div className="group-card-title"><h3>{group.name}</h3>{group.creator_id===userId&&<span className="source-tag">Creator</span>}</div><p>{group.description || 'A Circle Panda community group.'}</p><div className="group-meta"><span>👤 {count} members</span><span>{group.country_restriction ? '⌖ '+group.country_restriction : '🌐 Open community'}</span><span className={opened?'group-open':'group-closed'}>{opened?'● Chat open':'○ Needs '+(3-count)+' more'}</span></div><div className="group-actions">{!member ? <button className="primary-button" disabled={busy} onClick={()=>void joinGroup(group)}>Join group ↗</button> : <button className="primary-button" disabled={!opened} onClick={()=>void openChat(group)}>{opened?'Open group chat ↗':'Waiting for 3 members'}</button>}</div></div></article>;
      })}</div> : <div className="empty-state"><span>◉</span><h3>Build your first community.</h3><p>Create a group above or invite members to one that already exists.</p></div>}
    </section>
    {openGroup && openConversationId && <div className="group-chat-overlay"><section className="group-chat-panel" role="dialog" aria-label={openGroup.name + ' group chat'}><header className="group-chat-topbar"><button className="group-back-button" aria-label="Back to groups" onClick={()=>{setOpenGroupId(null);setOpenConversationId(null);setChatMessages([]);setReplyingTo(null);}}>‹</button><div className="group-chat-avatar">◉</div><div className="group-chat-heading"><strong>{openGroup.name}</strong><p>{memberCounts[openGroup.id] || 0} members · online chat</p></div><button className="group-header-action" title="Group settings" onClick={()=>setNotice('Group settings are being connected to member and creator controls.')}>⋮</button></header><div className="group-chat-history">{chatMessages.map(m=>{const quoted=chatMessages.find(item=>item.id===m.reply_to_message_id);const reactions=groupReactions[m.id] ?? [];return <article key={m.id} className={m.sender_id===userId?'group-message mine':'group-message'}><div className="group-message-author">{m.sender_id===userId?'You':(groupSenderNames[m.sender_id] || 'Panda')}</div>{quoted&&<div className="group-quoted-message"><strong>{quoted.sender_id===userId?'You':(groupSenderNames[quoted.sender_id] || 'Panda')}</strong><span>{quoted.body}</span></div>}<p>{m.body}</p><div className="group-message-meta"><button className="group-reply-action" title="Reply to message" onClick={()=>setReplyingTo(m)}>↩ Reply</button><button className="group-react-action" title="React to message" onClick={()=>setGroupReactionPicker(groupReactionPicker===m.id?null:m.id)}>☺ React</button><small>{new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></div>{reactions.length>0&&<div className="group-reaction-summary">{['👍','❤️','😂','😮','🐼'].map((emoji,i)=>{const key=['like','heart','laugh','wow','panda'][i];const count=reactions.filter(r=>r.reaction===key).length;return count>0?<button key={key} className={reactions.some(r=>r.user_id===userId&&r.reaction===key)?'selected':''} onClick={()=>void toggleGroupReaction(m.id,key)}>{emoji} {count}</button>:null;})}</div>}{groupReactionPicker===m.id&&<div className="group-reaction-picker">{[{key:'like',emoji:'👍'},{key:'heart',emoji:'❤️'},{key:'laugh',emoji:'😂'},{key:'wow',emoji:'😮'},{key:'sad',emoji:'😢'},{key:'panda',emoji:'🐼'}].map(item=><button type="button" key={item.key} title={item.key} onClick={()=>void toggleGroupReaction(m.id,item.key)}>{item.emoji}</button>)}</div>}</article>;})}{!chatMessages.length&&<div className="group-chat-welcome"><span>◉</span><strong>Welcome to {openGroup.name}</strong><p>Say hello and start the conversation.</p></div>}</div>{replyingTo&&<div className="group-reply-preview"><div><strong>Replying to {replyingTo.sender_id===userId?'yourself':(groupSenderNames[replyingTo.sender_id]||'Panda')}</strong><span>{replyingTo.body}</span></div><button type="button" aria-label="Cancel reply" onClick={()=>setReplyingTo(null)}>×</button></div>}<form className="group-chat-composer" onSubmit={sendGroupMessage}><button type="button" className="group-composer-icon" title="Emoji reactions" onClick={()=>setNotice('Use the reaction button under any group message to react.')}>☺</button><input value={chatDraft} onChange={e=>setChatDraft(e.target.value)} maxLength={10000} required placeholder={replyingTo?'Write a reply…':'Message the group…'} /><button className="group-send-button" disabled={busy||!chatDraft.trim()} aria-label="Send message">{busy?'…':'➤'}</button></form></section></div>}
  </div>;
}


type EconomySettingRow = { setting_key: string; numeric_value: number; updated_at: string; };
function AdminFeature() {
  const [settings, setSettings] = useState<EconomySettingRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string,string>>({});
  const [busyKey, setBusyKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  async function load() {
    if (!supabase) return;
    const { data, error } = await supabase.from('economy_settings')
      .select('setting_key,numeric_value,updated_at').order('setting_key');
    if (error) setNotice(error.message);
    const rows = (data ?? []) as EconomySettingRow[];
    setSettings(rows);
    setDrafts(Object.fromEntries(rows.map(row => [row.setting_key,String(row.numeric_value)])));
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function save(key: string) {
    if (!supabase) return;
    const value = Number(drafts[key]);
    if (!Number.isSafeInteger(value) || value < 0) { setNotice('Enter a whole number greater than or equal to zero.'); return; }
    setBusyKey(key);setNotice('');
    const { error } = await supabase.rpc('set_economy_setting',{p_setting_key:key,p_numeric_value:value});
    if (error) setNotice(error.message);
    else { setNotice(`Saved ${key.replaceAll('_',' ')}.`);await load(); }
    setBusyKey('');
  }

  return <section className="feature-panel admin-panel"><div className="feature-icon">⚙</div><p className="eyebrow">CIRCLE PANDA CONTROL ROOM</p><h2>Economy settings</h2><p className="feature-copy">Reward amounts and message costs are stored in the database, not hard-coded into the interface. Changes here require an administrator role.</p>
    {notice && <div className="notice inline-notice">{notice}<button onClick={()=>setNotice('')}>×</button></div>}
    {loading ? <div className="empty-state">Loading settings…</div> : settings.length ? <div className="admin-settings">{settings.map(row=><div className="admin-setting-row" key={row.setting_key}><div><strong>{row.setting_key.replaceAll('_',' ')}</strong><small>Updated {new Date(row.updated_at).toLocaleString()}</small></div><input type="number" min="0" step="1" value={drafts[row.setting_key] ?? String(row.numeric_value)} onChange={e=>setDrafts(prev=>({...prev,[row.setting_key]:e.target.value}))}/><button className="primary-button" disabled={busyKey===row.setting_key || Number(drafts[row.setting_key])===Number(row.numeric_value)} onClick={()=>void save(row.setting_key)}>{busyKey===row.setting_key?'Saving…':'Save'}</button></div>)}</div> : <div className="empty-state"><p>No economy settings were found.</p></div>}
  </section>;
}

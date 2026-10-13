import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from './lib/supabase';
import LocationFields, { type LocationValue } from './components/LocationFields';

type Section = 'Home' | 'Confessions' | 'Crush' | 'Dating' | 'Events' | 'Groups' | 'Messages' | 'Wallet' | 'Admin';
type FeedPost = { id: string; body: string; post_type: string; is_anonymous: boolean; author_name: string | null; created_at: string };
type FeedComment = { id: string; post_id: string; author_id: string; body: string; created_at: string };
type FeedReaction = { id: string; post_id: string; user_id: string; reaction: string };
type MessageRequestRow = { id: string; sender_id: string; recipient_id: string; source_type: string; greeting: string; status: string; created_at: string; conversation_id: string | null };
type ChatMessage = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string; reply_to_message_id?: string | null };
type GroupMessageReaction = { id: string; message_id: string; user_id: string; reaction: string };
type ChatConversation = { conversation_id: string; user_id: string; joined_at: string };
type DatingProfileRow = { id: string; user_id: string; headline: string | null; about: string | null; personality: string | null; sexual_experience: string | null; looking_for: string | null; is_published: boolean; created_at: string };
type EventRow = { id: string; creator_id: string; title: string; description: string; venue: string | null; country: string | null; state: string | null; city: string | null; area: string | null; starts_at: string; cover_url: string | null; is_published: boolean };
type WalletTransactionRow = { id: string; currency: string; amount: number; reason: string; created_at: string };

const sections: { name: Section; icon: string; hint: string }[] = [
  { name: 'Home', icon: '⌂', hint: 'Your circle at a glance' },
  { name: 'Confessions', icon: '☁', hint: 'Say what is on your mind' },
  { name: 'Crush', icon: '♛', hint: 'Monday MCM · Wednesday WCW' },
  { name: 'Dating', icon: '♡', hint: 'Meet someone new' },
  { name: 'Events', icon: '▦', hint: 'Find your next plan' },
  { name: 'Groups', icon: '◉', hint: 'Your people, your conversations' },
  { name: 'Messages', icon: '↗', hint: 'Requests and private chats' },
  { name: 'Wallet', icon: '◈', hint: 'Your Panda Coins and activity' },
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
  const [password, setPassword] = useState('');
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
    if (!supabase || !session) { setCoinBalance(null); return; }
    let alive = true;
    supabase.from('wallet_accounts').select('bc_balance').eq('user_id', session.user.id).maybeSingle()
      .then(({ data }) => { if (alive) setCoinBalance(data ? Number(data.bc_balance) : 0); });
    return () => { alive = false; };
  }, [session]);

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
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { data: { display_name: displayName.trim() || undefined } },
        });
        if (error) throw error;
        if (data.session) setNotice('Welcome to Circle Panda. Your account is ready.');
        else setNotice('Account created. If email confirmation is enabled in Supabase, confirm your email before signing in.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
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
          {authMode === 'signup' && <label>Your name<input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="How should we call you?" autoComplete="name" /></label>}
          <label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" /></label>
          <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} required autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} /></label>
          <button className="primary-button full" type="submit" disabled={!supabaseConfigured || authBusy}>{authBusy ? 'Please wait…' : authMode === 'signup' ? 'Create account' : 'Sign in'} <span>→</span></button>
        </form>
        <p className="switch-auth">{authMode === 'signup' ? 'Already part of the circle?' : 'New to Circle Panda?'} <button onClick={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setNotice(''); }}>{authMode === 'signup' ? 'Sign in' : 'Create account'}</button></p>
        {notice && <p className="notice">{notice}</p>}
        <p className="fine-print">A fresh build. A better way to connect.</p>
      </section>
    </main>;
  }

  const active = sections.find(item => item.name === section)!;
  return <div className={`app-shell theme-${theme}`}>
    <aside className="sidebar">
      <button className="brand" onClick={() => setSection('Confessions')}><span className="brand-icon">🐼</span><span>circle<span className="brand-green">panda</span><small>YOUR CIRCLE, YOUR WAY</small></span></button>
      <div className="nav-caption">YOUR SPACE</div>
      <nav>{sections.filter(item => item.name !== 'Admin' || isAdmin).map(item => <button key={item.name} className={section === item.name ? 'nav-item active' : 'nav-item'} onClick={() => { setSection(item.name); setNotice(''); }}><span className="nav-icon">{item.icon}</span><span>{item.name}</span>{item.name === 'Messages' && <i className="nav-dot" />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="online-mark" /> <span>Connected to your circle</span><button onClick={signOut} className="signout">Sign out ↗</button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="mobile-brand">🐼 <strong>circle<span className="brand-green">panda</span></strong></div><div className="topbar-search">⌕ <span>Search your circle</span><kbd>⌘ K</kbd></div><div className="top-actions"><button className="coin-balance-chip" title="Open Panda wallet" onClick={() => setSection('Wallet')}><span className="coin-token" aria-hidden="true">P</span><span className="coin-balance-copy"><strong>{coinBalance === null ? '—' : coinBalance.toLocaleString()}</strong><small>BC</small></span></button><button className="theme-toggle" title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☼' : '☾'}</button><button className="icon-button" title="Notifications" onClick={() => setNotice('You are all caught up.')}>♧</button><button className="profile-chip" onClick={() => setSection('Wallet')}><span className="avatar">{(session.user.email ?? 'P').slice(0,1).toUpperCase()}</span><span>{session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || 'Panda'}</span><span>⌄</span></button></div></header>
      <div className={`page-wrap page-${section.toLowerCase()}`}>
        <div className="welcome-row"><div><p className="eyebrow">{section === 'Dating' ? 'A SPACE FOR REAL CONNECTIONS' : 'WELCOME BACK TO YOUR WORLD'}</p><h1>{section === 'Home' ? 'Your circle, in one place.' : active.name}<span className="heading-period">.</span></h1><p className="section-hint">{active.hint}</p></div><div className="date-pill"><span className="pulse" /> YOUR SPACE IS LIVE</div></div>
        {notice && <div className="notice inline-notice">{notice}<button onClick={() => setNotice('')}>×</button></div>}
        {(section === 'Home' || section === 'Confessions') && <>
          <section className="hero-card"><div className="hero-content"><span className="hero-kicker">✦ A LITTLE SPACE TO BE YOU</span><h2>Good things happen<br />when we <em>connect.</em></h2><p>Share a thought, discover a new event, or start a conversation that matters.</p><button className="hero-button" onClick={() => setSection('Dating')}>Explore your circle <span>→</span></button></div><div className="hero-art"><div className="planet planet-back" /><div className="planet planet-front">🐼</div><span className="spark spark-a">✦</span><span className="spark spark-b">✧</span><span className="art-caption">STAY CURIOUS. STAY CONNECTED.</span></div></section>
          <div className="section-title-row"><div><h2>{section === 'Confessions' ? 'Anonymous confessions' : 'From your circle'}</h2><p>Small moments, shared honestly.</p></div><span className="count-pill">{posts.length} POSTS</span></div>
          <section className="feed-composer"><div className="composer-avatar">🐼</div><form onSubmit={publishPost}><textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder={section === 'Confessions' ? 'Share what is on your mind — anonymously…' : 'What would you like to share with your circle?'} maxLength={5000} required /><div className="composer-footer"><span>{section === 'Confessions' ? '☁ Posted anonymously' : '✦ Be kind, be real'}</span><button className="primary-button" disabled={posting || !draft.trim()}>{posting ? 'Posting…' : 'Share post'} <span>↗</span></button></div></form></section>
          {loadingFeed ? <div className="empty-state">Loading your circle…</div> : posts.length ? <div className="post-list">{posts.map(post => <article className="post-card" key={post.id}><div className="post-top"><div className="post-avatar">{post.is_anonymous ? '🐼' : '✦'}</div><div><strong>{post.is_anonymous ? 'Anonymous Panda' : (post.author_name || 'Panda')}</strong><p>{post.post_type === 'confession' ? 'Confession' : 'Circle post'} · {new Date(post.created_at).toLocaleString()}</p></div><span className="post-menu">•••</span></div><p className="post-body">{post.body}</p><div className="post-actions"><button className={myReactions[post.id] ? 'react-active' : ''} onClick={() => setReactionPickerPost(reactionPickerPost === post.id ? null : post.id)}>♡ React {reactionsByPost[post.id]?.length ? `(${reactionsByPost[post.id].length})` : ''}</button><button onClick={() => setExpandedComments(prev => ({...prev,[post.id]:!prev[post.id]}))}>▢ Comment {commentsByPost[post.id]?.length ? `(${commentsByPost[post.id].length})` : ''}</button><button onClick={() => void messagePostAuthor(post.id)}>↗ Message</button></div>
              {reactionPickerPost === post.id && <div className="reaction-picker">{[{key:'heart',emoji:'❤️'},{key:'laugh',emoji:'😂'},{key:'surprised',emoji:'😮'},{key:'angry',emoji:'😠'},{key:'panda',emoji:'🐼'}].map(item => <button key={item.key} className={myReactions[post.id] === item.key ? 'selected' : ''} onClick={() => void toggleReaction(post.id,item.key)} title={item.key}>{item.emoji}</button>)}</div>}
              {expandedComments[post.id] && <div className="comments-panel">{(commentsByPost[post.id] ?? []).map(comment => <div className="comment-row" key={comment.id}><span className="comment-avatar">🐼</span><div><strong>{commentNames[comment.author_id] || 'Panda'}</strong><p>{comment.body}</p><small>{new Date(comment.created_at).toLocaleString()}</small></div></div>)}<form className="comment-form" onSubmit={e => void submitComment(e,post.id)}><input value={commentDrafts[post.id] || ''} onChange={e => setCommentDrafts(prev => ({...prev,[post.id]:e.target.value}))} placeholder="Write a comment…" maxLength={2000} required /><button className="primary-button">Send</button></form></div>}</article>)}</div> : <div className="empty-state"><span>✦</span><h3>Your circle starts here.</h3><p>Be the first to share something. Your posts will appear here after publishing.</p></div>}
        </>}
        {section !== 'Home' && section !== 'Confessions' && <FeaturePanel section={section} userId={session.user.id} />}
        <footer className="page-footer"><span>© 2026 Circle Panda</span><span>Built for real connection <b>●</b></span></footer>
      </div>
    </main>
  </div>;
}

function FeaturePanel({ section, userId }: { section: Section; userId: string }) {
  if (section === 'Messages') return <MessagesFeature userId={userId} />;
  if (section === 'Dating') return <DatingFeature userId={userId} />;
  if (section === 'Events') return <EventsFeature userId={userId} />;
  if (section === 'Wallet') return <WalletFeature userId={userId} />;
  if (section === 'Groups') return <GroupsFeature userId={userId} />;
  if (section === 'Admin') return <AdminFeature />;
  const content: Record<Exclude<Section, 'Home' | 'Confessions' | 'Admin'>, { icon: string; title: string; body: string; next: string[] }> = {
    'Crush': { icon: '♛', title: 'Your next crush moment', body: 'MCM on Monday. WCW on Wednesday. Discover the people your circle is celebrating.', next: ['Weekly crush feed', 'Votes and reactions', 'Profile-to-message requests'] },
    'Dating': { icon: '♡', title: 'Make room for a connection', body: 'Build a dating profile, discover people who fit your preferences, and let every match lead to a conversation.', next: ['Dating profile setup', 'Country, state and area filters', 'Send, accept and decline requests'] },
    'Events': { icon: '▦', title: 'Make plans worth showing up for', body: 'Discover events around you or publish one of your own. Event cards will connect directly to the creator.', next: ['Create and publish events', 'Attendance and attendee counts', 'Creator messaging and event boosts'] },
    'Groups': { icon: '◉', title: 'Find your people', body: 'Join a conversation or create a group for your community. VIP spaces will be clearly separated.', next: ['Create and join groups', 'Group member and message flows', 'VIP group spaces'] },
    'Messages': { icon: '↗', title: 'Every connection leads to a conversation', body: 'Message requests from dating, events, groups and the feed will live alongside your accepted chats.', next: ['Incoming and sent requests', 'Accept or decline requests', 'Private chats and unread indicators'] },
    'Wallet': { icon: '◈', title: 'Your Panda wallet', body: 'Your wallet and activity rewards will be managed by server-side rules, with balances that do not expire.', next: ['BC balance and transaction history', 'Activity XP and levels', 'VIP and reward controls'] },
  };
  const item = content[section as Exclude<Section, 'Home' | 'Confessions' | 'Admin'>];
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

  async function respond(requestId: string, accept: boolean) {
    if (!supabase) return;
    setBusyId(requestId); setMessageNotice('');
    const { data, error } = await supabase.rpc('respond_message_request', { p_request_id: requestId, p_accept: accept });
    if (error) setMessageNotice(error.message);
    else {
      if (accept && typeof data === 'string') await loadMessages(data);
      await loadRequests();
      setMessageNotice(accept ? 'Request accepted. Your chat is ready.' : 'Request declined.');
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

  return <section className="messages-layout">
    <div className="messages-overview">
      <div className="feature-panel messages-heading"><div className="feature-icon">↗</div><p className="eyebrow">YOUR PRIVATE SPACE</p><h2>Requests that lead to real conversations.</h2><p className="feature-copy">Accept requests to open a private chat. Declined requests are removed from your inbox.</p>
        <div className="message-stats"><div><strong>{incoming.length}</strong><span>INBOX</span></div><div><strong>{sent.filter(r => r.status === 'pending').length}</strong><span>AWAITING</span></div><div><strong>{activeConversations.length}</strong><span>CHATS</span></div></div>
      </div>
      {messageNotice && <div className="notice inline-notice">{messageNotice}<button onClick={() => setMessageNotice('')}>×</button></div>}
      <section className="request-section"><div className="section-title-row"><div><h2>Message requests</h2><p>Requests from dating, events, groups and your feed.</p></div><span className="count-pill">{incoming.length} NEW</span></div>
        {loading ? <div className="empty-state">Loading requests…</div> : incoming.length ? incoming.map(r => <article className="request-card" key={r.id}><div className="request-avatar">🐼</div><div className="request-content"><div className="request-card-top"><strong>{names[r.sender_id] || 'Panda'}</strong><span className="source-tag">{r.source_type}</span></div><p>{r.greeting || 'Would like to start a conversation with you.'}</p><small>{new Date(r.created_at).toLocaleString()}</small><div className="request-buttons"><button className="primary-button" disabled={busyId === r.id} onClick={() => void respond(r.id, true)}>{busyId === r.id ? 'Working…' : 'Accept'}</button><button className="decline-button" disabled={busyId === r.id} onClick={() => void respond(r.id, false)}>Decline</button></div></div></article>) : <div className="empty-state compact"><span>✦</span><h3>No new requests</h3><p>When someone wants to connect, their request will show up here.</p></div>}
      </section>
      <section className="request-section"><div className="section-title-row"><div><h2>Sent requests</h2><p>Keep track of requests you have sent.</p></div><span className="count-pill">{sent.length} TOTAL</span></div>
        {sent.length ? sent.map(r => <article className="sent-card" key={r.id}><div><strong>{names[r.recipient_id] || 'Panda'}</strong><p>{r.greeting || 'Message request'} · {r.source_type}</p></div><span className={`status-tag status-${r.status}`}>{r.status}</span>{r.conversation_id && <button className="text-action" onClick={() => void loadMessages(r.conversation_id!)}>Open chat →</button>}</article>) : <div className="empty-state compact"><p>You have not sent a request yet.</p></div>}
      </section>
      <section className="request-section"><div className="section-title-row"><div><h2>Your chats</h2><p>Accepted message requests open private chats.</p></div><span className="count-pill">{activeConversations.length} CHATS</span></div>
        {activeConversations.length ? activeConversations.map(id => <button key={id} className={openConversation === id ? 'chat-list-item selected' : 'chat-list-item'} onClick={() => void loadMessages(id)}><span className="request-avatar">🐼</span><span><strong>Private conversation</strong><small>{id.slice(0, 8)}…</small></span><b>→</b></button>) : <div className="empty-state compact"><p>Accept a message request to start your first chat.</p></div>}
      </section>
    </div>
    <section className="chat-panel">
      {openConversation ? <><header className="chat-header"><div className="request-avatar">🐼</div><div><strong>Your private chat</strong><p>Only conversation members can read messages.</p></div><button className="text-action" onClick={() => {setOpenConversation(null);setMessages([]);}}>Close ×</button></header><div className="chat-history">{messages.map(m => <div key={m.id} className={m.sender_id === userId ? 'chat-bubble mine' : 'chat-bubble'}><p>{m.body}</p><small>{new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></div>)}{!messages.length && <div className="empty-state compact"><p>Say hello and start the conversation.</p></div>}</div><form className="chat-compose" onSubmit={sendMessage}><input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Write a message…" maxLength={10000} required /><button className="primary-button" disabled={busy || !draft.trim()}>{busy ? 'Sending…' : 'Send ↗'}</button></form></> : <div className="chat-placeholder"><span>↗</span><h3>Your conversations live here.</h3><p>Choose a chat or accept a request to begin messaging.</p></div>}
    </section>
  </section>;
}


function DatingFeature({ userId }: { userId: string }) {
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [location, setLocation] = useState<LocationValue>({ country: '', state: '', city: '', area: '' });
  const [headline, setHeadline] = useState('');
  const [about, setAbout] = useState('');
  const [personality, setPersonality] = useState('');
  const [sexualExperience, setSexualExperience] = useState('');
  const [lookingFor, setLookingFor] = useState('Relationship');
  const [published, setPublished] = useState(false);
  const [directory, setDirectory] = useState<DatingProfileRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [locations, setLocations] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  async function load() {
    if (!supabase) return;
    const [{ data: profile }, { data: birthDate }] = await Promise.all([
      supabase.from('profiles').select('country,state,city,area').eq('id', userId).maybeSingle(),
      supabase.rpc('get_my_date_of_birth'),
    ]);
    setDateOfBirth(typeof birthDate === 'string' ? birthDate : '');
    if (profile) {
      setLocation({ country: profile.country || '', state: profile.state || '', city: profile.city || '', area: profile.area || '' });
    }
    const { data: mine } = await supabase.from('dating_profiles')
      .select('headline,about,personality,sexual_experience,looking_for,is_published')
      .eq('user_id', userId).maybeSingle();
    if (mine) {
      setHeadline(mine.headline || ''); setAbout(mine.about || '');
      setPersonality(mine.personality || ''); setSexualExperience(mine.sexual_experience || '');
      setLookingFor(mine.looking_for || 'Relationship'); setPublished(Boolean(mine.is_published));
    }
    const { data, error } = await supabase.from('dating_profiles')
      .select('id,user_id,headline,about,personality,sexual_experience,looking_for,is_published,created_at')
      .eq('is_published', true).neq('user_id', userId).order('created_at', { ascending: false }).limit(60);
    if (error) setNotice(error.message);
    const rows = (data ?? []) as DatingProfileRow[];
    setDirectory(rows);
    const ids = rows.map(row => row.user_id);
    if (ids.length) {
      const { data: publicProfiles } = await supabase.from('profiles')
        .select('id,display_name,username,country,state,city,area').in('id', ids);
      const nameMap: Record<string, string> = {};
      const locationMap: Record<string, string> = {};
      (publicProfiles ?? []).forEach((p: {id:string;display_name:string|null;username:string|null;country:string|null;state:string|null;city:string|null;area:string|null}) => {
        nameMap[p.id] = p.display_name || p.username || 'Panda';
        locationMap[p.id] = [p.area,p.city,p.state,p.country].filter(Boolean).join(', ');
      });
      setNames(nameMap); setLocations(locationMap);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [userId]);

  async function saveProfile(event: FormEvent<HTMLFormElement>, publishNow: boolean) {
    event.preventDefault();
    if (!supabase) return;
    if (publishNow && !dateOfBirth) { setNotice('Add your date of birth first. Dating is for adults aged 18 and over.'); return; }
    setBusy(true); setNotice('');
    const { error: profileError } = await supabase.from('profiles').update({
      date_of_birth: dateOfBirth || null, country: location.country || null,
      state: location.state || null, city: location.city || null, area: location.area || null,
    }).eq('id', userId);
    if (profileError) { setNotice(profileError.message); setBusy(false); return; }
    const { error } = await supabase.from('dating_profiles').upsert({
      user_id: userId, headline: headline.trim(), about: about.trim(),
      personality: personality.trim() || null, sexual_experience: sexualExperience || null,
      looking_for: lookingFor, is_published: publishNow,
    }, { onConflict: 'user_id' });
    if (error) setNotice(error.message);
    else { setPublished(publishNow); setNotice(publishNow ? 'Your dating profile is published.' : 'Your dating profile draft is saved.'); await load(); }
    setBusy(false);
  }

  async function requestChat(profile: DatingProfileRow) {
    if (!supabase || profile.user_id === userId) return;
    const { error } = await supabase.rpc('send_message_request', {
      p_recipient_id: profile.user_id, p_source_type: 'dating', p_source_id: profile.id,
      p_greeting: 'Hi! I saw your dating profile and would like to get to know you.',
    });
    setNotice(error ? error.message : 'Message request sent. You can track it in Messages.');
  }

  return <div className="dating-page">
    <section className="feature-panel dating-form-panel"><div className="feature-icon dating-feature-icon">♡</div><p className="eyebrow">YOUR DATING SPACE</p><h2>Make room for a connection</h2><p className="feature-copy">Keep it honest and respectful. Only adults aged 18+ can publish or browse dating profiles.</p>
      <form className="feature-form" onSubmit={e => void saveProfile(e, false)}>
        <label>Date of birth<input type="date" value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} required /></label>
        <LocationFields value={location} onChange={setLocation} />
        <label>Profile headline<input value={headline} onChange={e => setHeadline(e.target.value)} maxLength={120} placeholder="A little about the kind of person you are…" required /></label>
        <label>About me<textarea value={about} onChange={e => setAbout(e.target.value)} maxLength={2500} rows={3} placeholder="What would you like someone to know about you?" /></label>
        <label>Personality<textarea value={personality} onChange={e => setPersonality(e.target.value)} maxLength={1200} rows={2} placeholder="Your personality and lifestyle" /></label>
        <div className="form-grid-two"><label>Sexual Experience<select value={sexualExperience} onChange={e => setSexualExperience(e.target.value)}><option value="">Prefer not to say</option><option>Inexperienced</option><option>Some experience</option><option>Experienced</option></select></label><label>Looking for<select value={lookingFor} onChange={e => setLookingFor(e.target.value)}><option>Relationship</option><option>Dating</option><option>Friendship</option><option>Open to possibilities</option></select></label></div>
        <div className="form-submit-row"><span className={published ? 'published-state' : 'draft-state'}>{published ? '● Published' : '○ Draft'}</span><button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save draft'}</button><button className="primary-button" type="button" disabled={busy} onClick={e => { const form = e.currentTarget.form; if (form) void saveProfile({ preventDefault: () => {}, currentTarget: form } as FormEvent<HTMLFormElement>, true); }}>Publish profile ↗</button></div>
      </form>
      {notice && <div className="notice">{notice}</div>}
    </section>
    <section className="directory-section"><div className="section-title-row"><div><h2>Discover your circle</h2><p>Published profiles from adults in the community.</p></div><span className="count-pill">{directory.length} PROFILES</span></div>
      {loading ? <div className="empty-state">Loading dating profiles…</div> : directory.length ? <div className="dating-directory">{directory.map(profile => <article className="dating-card" key={profile.id}><div className="dating-card-top"><div className="dating-avatar">🐼</div><div><strong>{names[profile.user_id] || 'Panda'}</strong><p>{locations[profile.user_id] || 'Location not added'}</p></div><span className="heart-mark">♡</span></div><h3>{profile.headline || 'Getting to know someone new'}</h3><p className="dating-about">{profile.about || 'This panda is looking forward to meeting someone.'}</p>{profile.personality && <div className="personality-tag">{profile.personality}</div>}<div className="dating-card-bottom"><span>Looking for: {profile.looking_for || 'Connection'}</span><button className="primary-button" onClick={() => void requestChat(profile)}>Message request ↗</button></div></article>)}</div> : <div className="empty-state"><span>♡</span><h3>Your next connection starts here.</h3><p>When adult members publish dating profiles, they will appear here.</p></div>}
    </section>
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

  async function load() {
    if (!supabase) return;
    const { data, error } = await supabase.from('events')
      .select('id,creator_id,title,description,venue,country,state,city,area,starts_at,cover_url,is_published')
      .eq('is_published', true).order('starts_at', { ascending: true }).limit(60);
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

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    if (!startsAt || new Date(startsAt).getTime() <= Date.now()) { setNotice('Choose a future event date and time.'); return; }
    setBusy(true); setNotice('');
    const { error } = await supabase.from('events').insert({
      creator_id: userId, title: title.trim(), description: description.trim(),
      venue: venue.trim() || null, country: location.country || null,
      state: location.state || null, city: location.city || null, area: location.area || null, starts_at: new Date(startsAt).toISOString(), is_published: true,
    });
    if (error) setNotice(error.message);
    else {
      setTitle(''); setDescription(''); setVenue(''); setLocation({ country: '', state: '', city: '', area: '' }); setStartsAt('');
      setNotice('Event published successfully.'); await load();
    }
    setBusy(false);
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
    <section className="directory-section"><div className="section-title-row"><div><h2>Events in your circle</h2><p>Published events and the people bringing them together.</p></div><span className="count-pill">{events.length} EVENTS</span></div>
      {loading ? <div className="empty-state">Loading events…</div> : events.length ? <div className="event-directory">{events.map(item => <article className="event-card" key={item.id}><div className="event-date-block"><span>{new Date(item.starts_at).toLocaleDateString([], {month:'short'}).toUpperCase()}</span><strong>{new Date(item.starts_at).getDate()}</strong><small>{new Date(item.starts_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></div><div className="event-card-body"><div className="event-creator">HOSTED BY {names[item.creator_id] || 'PANDA'}</div><h3>{item.title}</h3><p>{item.description || 'Join the community for this event.'}</p><div className="event-meta"><span>⌖ {[item.venue,item.area,item.city,item.state,item.country].filter(Boolean).join(' · ') || 'Location to be announced'}</span><span>👤 {counts[item.id] || 0} attending</span></div><div className="event-card-actions">{item.creator_id === userId ? <span className="published-state">● Your event</span> : <><button className="primary-button" disabled={busy} onClick={() => void toggleAttendance(item)}>{attending[item.id] ? '✓ Attending' : 'I’m attending'}</button><button className="decline-button" disabled={busy} onClick={() => void messageCreator(item)}>Message creator ↗</button></>}</div></div></article>)}</div> : <div className="empty-state"><span>▦</span><h3>There is room for your first event.</h3><p>Publish an event above and it will appear here for your community.</p></div>}
    </section>
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
        <label>Country restriction (optional)<input value={countryRestriction} onChange={e=>setCountryRestriction(e.target.value)} placeholder="Only allow members from this country" /></label>
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

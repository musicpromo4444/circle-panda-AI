import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from './lib/supabase';

type Section = 'Home' | 'Confessions' | 'Crush' | 'Dating' | 'Events' | 'Groups' | 'Messages' | 'Wallet';
type FeedPost = { id: string; body: string; post_type: string; is_anonymous: boolean; created_at: string };
type MessageRequestRow = { id: string; sender_id: string; recipient_id: string; source_type: string; greeting: string; status: string; created_at: string; conversation_id: string | null };
type ChatMessage = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string };
type ChatConversation = { conversation_id: string; user_id: string; joined_at: string };
type DatingProfileRow = { id: string; user_id: string; headline: string | null; about: string | null; personality: string | null; sexual_experience: string | null; looking_for: string | null; is_published: boolean; created_at: string };
type EventRow = { id: string; creator_id: string; title: string; description: string; venue: string | null; country: string | null; state: string | null; starts_at: string; cover_url: string | null; is_published: boolean };

const sections: { name: Section; icon: string; hint: string }[] = [
  { name: 'Home', icon: '⌂', hint: 'Your circle at a glance' },
  { name: 'Confessions', icon: '☁', hint: 'Say what is on your mind' },
  { name: 'Crush', icon: '♛', hint: 'Monday MCM · Wednesday WCW' },
  { name: 'Dating', icon: '♡', hint: 'Meet someone new' },
  { name: 'Events', icon: '▦', hint: 'Find your next plan' },
  { name: 'Groups', icon: '◉', hint: 'Your people, your conversations' },
  { name: 'Messages', icon: '↗', hint: 'Requests and private chats' },
  { name: 'Wallet', icon: '◈', hint: 'Your Panda Coins and activity' },
];

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [section, setSection] = useState<Section>('Home');
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

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) { setPosts([]); return; }
    let alive = true;
    setLoadingFeed(true);
    supabase.from('feed_posts_public').select('id,body,post_type,is_anonymous,created_at')
      .order('created_at', { ascending: false }).limit(30)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setNotice(error.message);
        else setPosts((data ?? []) as FeedPost[]);
        setLoadingFeed(false);
      });
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
      const { data } = await supabase.from('feed_posts_public').select('id,body,post_type,is_anonymous,created_at')
        .order('created_at', { ascending: false }).limit(30);
      setPosts((data ?? []) as FeedPost[]);
      setNotice('Posted to your circle.');
    }
    setPosting(false);
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
  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => setSection('Home')}><span className="brand-icon">🐼</span><span>circle<span className="brand-green">panda</span><small>YOUR CIRCLE, YOUR WAY</small></span></button>
      <div className="nav-caption">YOUR SPACE</div>
      <nav>{sections.map(item => <button key={item.name} className={section === item.name ? 'nav-item active' : 'nav-item'} onClick={() => { setSection(item.name); setNotice(''); }}><span className="nav-icon">{item.icon}</span><span>{item.name}</span>{item.name === 'Messages' && <i className="nav-dot" />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="online-mark" /> <span>Connected to your circle</span><button onClick={signOut} className="signout">Sign out ↗</button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="mobile-brand">🐼 <strong>circle<span className="brand-green">panda</span></strong></div><div className="topbar-search">⌕ <span>Search your circle</span><kbd>⌘ K</kbd></div><div className="top-actions"><button className="icon-button" title="Notifications" onClick={() => setNotice('You are all caught up.')}>♧</button><button className="profile-chip" onClick={() => setSection('Wallet')}><span className="avatar">{(session.user.email ?? 'P').slice(0,1).toUpperCase()}</span><span>{session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || 'Panda'}</span><span>⌄</span></button></div></header>
      <div className="page-wrap">
        <div className="welcome-row"><div><p className="eyebrow">WELCOME BACK TO YOUR WORLD</p><h1>{section === 'Home' ? 'Your circle, in one place.' : active.name}<span className="heading-period">.</span></h1><p className="section-hint">{active.hint}</p></div><div className="date-pill"><span className="pulse" /> YOUR SPACE IS LIVE</div></div>
        {notice && <div className="notice inline-notice">{notice}<button onClick={() => setNotice('')}>×</button></div>}
        {(section === 'Home' || section === 'Confessions') && <>
          <section className="hero-card"><div className="hero-content"><span className="hero-kicker">✦ A LITTLE SPACE TO BE YOU</span><h2>Good things happen<br />when we <em>connect.</em></h2><p>Share a thought, discover a new event, or start a conversation that matters.</p><button className="hero-button" onClick={() => setSection('Dating')}>Explore your circle <span>→</span></button></div><div className="hero-art"><div className="planet planet-back" /><div className="planet planet-front">🐼</div><span className="spark spark-a">✦</span><span className="spark spark-b">✧</span><span className="art-caption">STAY CURIOUS. STAY CONNECTED.</span></div></section>
          <div className="section-title-row"><div><h2>{section === 'Confessions' ? 'Anonymous confessions' : 'From your circle'}</h2><p>Small moments, shared honestly.</p></div><span className="count-pill">{posts.length} POSTS</span></div>
          <section className="feed-composer"><div className="composer-avatar">🐼</div><form onSubmit={publishPost}><textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder={section === 'Confessions' ? 'Share what is on your mind — anonymously…' : 'What would you like to share with your circle?'} maxLength={5000} required /><div className="composer-footer"><span>{section === 'Confessions' ? '☁ Posted anonymously' : '✦ Be kind, be real'}</span><button className="primary-button" disabled={posting || !draft.trim()}>{posting ? 'Posting…' : 'Share post'} <span>↗</span></button></div></form></section>
          {loadingFeed ? <div className="empty-state">Loading your circle…</div> : posts.length ? <div className="post-list">{posts.map(post => <article className="post-card" key={post.id}><div className="post-top"><div className="post-avatar">{post.is_anonymous ? '🐼' : '✦'}</div><div><strong>{post.is_anonymous ? 'Anonymous Panda' : 'A panda in your circle'}</strong><p>{post.post_type === 'confession' ? 'Confession' : 'Circle post'} · {new Date(post.created_at).toLocaleString()}</p></div><span className="post-menu">•••</span></div><p className="post-body">{post.body}</p><div className="post-actions"><button onClick={() => setNotice('Reactions are next on the build checklist.')}>♡ React</button><button onClick={() => setNotice('Comments are next on the build checklist.')}>▢ Comment</button><button onClick={() => setNotice('Message requests will connect here.')}>↗ Message</button></div></article>)}</div> : <div className="empty-state"><span>✦</span><h3>Your circle starts here.</h3><p>Be the first to share something. Your posts will appear here after publishing.</p></div>}
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
  const content: Record<Exclude<Section, 'Home' | 'Confessions'>, { icon: string; title: string; body: string; next: string[] }> = {
    'Crush': { icon: '♛', title: 'Your next crush moment', body: 'MCM on Monday. WCW on Wednesday. Discover the people your circle is celebrating.', next: ['Weekly crush feed', 'Votes and reactions', 'Profile-to-message requests'] },
    'Dating': { icon: '♡', title: 'Make room for a connection', body: 'Build a dating profile, discover people who fit your preferences, and let every match lead to a conversation.', next: ['Dating profile setup', 'Country, state and area filters', 'Send, accept and decline requests'] },
    'Events': { icon: '▦', title: 'Make plans worth showing up for', body: 'Discover events around you or publish one of your own. Event cards will connect directly to the creator.', next: ['Create and publish events', 'Attendance and attendee counts', 'Creator messaging and event boosts'] },
    'Groups': { icon: '◉', title: 'Find your people', body: 'Join a conversation or create a group for your community. VIP spaces will be clearly separated.', next: ['Create and join groups', 'Group member and message flows', 'VIP group spaces'] },
    'Messages': { icon: '↗', title: 'Every connection leads to a conversation', body: 'Message requests from dating, events, groups and the feed will live alongside your accepted chats.', next: ['Incoming and sent requests', 'Accept or decline requests', 'Private chats and unread indicators'] },
    'Wallet': { icon: '◈', title: 'Your Panda wallet', body: 'Your wallet and activity rewards will be managed by server-side rules, with balances that do not expire.', next: ['BC balance and transaction history', 'Activity XP and levels', 'VIP and reward controls'] },
  };
  const item = content[section as Exclude<Section, 'Home' | 'Confessions'>];
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
  const [country, setCountry] = useState('');
  const [stateName, setStateName] = useState('');
  const [area, setArea] = useState('');
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
    const { data: profile } = await supabase.from('profiles')
      .select('date_of_birth,country,state,area').eq('id', userId).maybeSingle();
    if (profile) {
      setDateOfBirth(profile.date_of_birth || '');
      setCountry(profile.country || ''); setStateName(profile.state || ''); setArea(profile.area || '');
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
        .select('id,display_name,username,country,state,area').in('id', ids);
      const nameMap: Record<string, string> = {};
      const locationMap: Record<string, string> = {};
      (publicProfiles ?? []).forEach((p: {id:string;display_name:string|null;username:string|null;country:string|null;state:string|null;area:string|null}) => {
        nameMap[p.id] = p.display_name || p.username || 'Panda';
        locationMap[p.id] = [p.area,p.state,p.country].filter(Boolean).join(', ');
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
      date_of_birth: dateOfBirth || null, country: country.trim() || null,
      state: stateName.trim() || null, area: area.trim() || null,
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
    <section className="feature-panel dating-form-panel"><div className="feature-icon">♡</div><p className="eyebrow">MEET WITH INTENTION</p><h2>Your dating profile</h2><p className="feature-copy">Keep it honest and respectful. Only adults aged 18+ can publish or browse dating profiles.</p>
      <form className="feature-form" onSubmit={e => void saveProfile(e, false)}>
        <label>Date of birth<input type="date" value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} required /></label>
        <div className="form-grid-three"><label>Country<input value={country} onChange={e => setCountry(e.target.value)} placeholder="Country" /></label><label>State<input value={stateName} onChange={e => setStateName(e.target.value)} placeholder="State" /></label><label>Area<input value={area} onChange={e => setArea(e.target.value)} placeholder="City / area" /></label></div>
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
  const [country, setCountry] = useState('');
  const [stateName, setStateName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  async function load() {
    if (!supabase) return;
    const { data, error } = await supabase.from('events')
      .select('id,creator_id,title,description,venue,country,state,starts_at,cover_url,is_published')
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
      venue: venue.trim() || null, country: country.trim() || null,
      state: stateName.trim() || null, starts_at: new Date(startsAt).toISOString(), is_published: true,
    });
    if (error) setNotice(error.message);
    else {
      setTitle(''); setDescription(''); setVenue(''); setCountry(''); setStateName(''); setStartsAt('');
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
        <div className="form-grid-three"><label>Country<input value={country} onChange={e => setCountry(e.target.value)} placeholder="Country" /></label><label>State<input value={stateName} onChange={e => setStateName(e.target.value)} placeholder="State" /></label><label>Date and time<input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} required /></label></div>
        <div className="form-submit-row"><span className="draft-state">No media upload in this version</span><button className="primary-button" type="submit" disabled={busy}>{busy ? 'Publishing…' : 'Publish event ↗'}</button></div>
      </form>
      {notice && <div className="notice">{notice}</div>}
    </section>
    <section className="directory-section"><div className="section-title-row"><div><h2>Events in your circle</h2><p>Published events and the people bringing them together.</p></div><span className="count-pill">{events.length} EVENTS</span></div>
      {loading ? <div className="empty-state">Loading events…</div> : events.length ? <div className="event-directory">{events.map(item => <article className="event-card" key={item.id}><div className="event-date-block"><span>{new Date(item.starts_at).toLocaleDateString([], {month:'short'}).toUpperCase()}</span><strong>{new Date(item.starts_at).getDate()}</strong><small>{new Date(item.starts_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></div><div className="event-card-body"><div className="event-creator">HOSTED BY {names[item.creator_id] || 'PANDA'}</div><h3>{item.title}</h3><p>{item.description || 'Join the community for this event.'}</p><div className="event-meta"><span>⌖ {[item.venue,item.state,item.country].filter(Boolean).join(' · ') || 'Location to be announced'}</span><span>👤 {counts[item.id] || 0} attending</span></div><div className="event-card-actions">{item.creator_id === userId ? <span className="published-state">● Your event</span> : <><button className="primary-button" disabled={busy} onClick={() => void toggleAttendance(item)}>{attending[item.id] ? '✓ Attending' : 'I’m attending'}</button><button className="decline-button" disabled={busy} onClick={() => void messageCreator(item)}>Message creator ↗</button></>}</div></div></article>)}</div> : <div className="empty-state"><span>▦</span><h3>There is room for your first event.</h3><p>Publish an event above and it will appear here for your community.</p></div>}
    </section>
  </div>;
}

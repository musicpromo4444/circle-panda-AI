import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';

type CrushPost = { id: string; user_id: string; crush_type: 'mcm' | 'wcw'; caption: string; image_path: string | null; week_start: string; created_at: string; scheduled_for: string | null };
type Reaction = { id: string; post_id: string; user_id: string; reaction: string };
type Comment = { id: string; post_id: string; user_id: string; body: string; created_at: string };

export default function CrushFeature({ userId }: { userId: string }) {
  const [posts, setPosts] = useState<CrushPost[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [gender, setGender] = useState('');
  const [genderDraft, setGenderDraft] = useState('');
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  const [crushType, setCrushType] = useState<'mcm' | 'wcw'>(() => new Date().getDay() === 3 ? 'wcw' : 'mcm');
  const [caption, setCaption] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [myVotes, setMyVotes] = useState<Record<string, boolean>>({});
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [myReactions, setMyReactions] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const lock = useRef(false);

  async function load() {
    if (!supabase) return;
    const { data: profile } = await supabase.from('profiles').select('gender,timezone').eq('id', userId).maybeSingle();
    const currentGender = profile?.gender || '';
    setGender(currentGender);
    if (!currentGender) setShowGenderPicker(true);
    if (!profile?.timezone) {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (timezone) await supabase.from('profiles').update({ timezone }).eq('id', userId);
    }
    const { data, error } = await supabase.from('crush_posts')
      .select('id,user_id,crush_type,caption,image_path,week_start,created_at,scheduled_for')
      .order('scheduled_for', { ascending: false }).limit(80);
    if (error) { setNotice(error.message); setLoading(false); return; }
    const rows = (data ?? []) as CrushPost[];
    setPosts(rows);
    const ids = rows.map(row => row.id);
    const userIds = [...new Set(rows.map(row => row.user_id))];
    if (userIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('id,display_name,username').in('id', userIds);
      const nextNames: Record<string, string> = {};
      (profiles ?? []).forEach((p: {id:string;display_name:string|null;username:string|null}) => { nextNames[p.id] = p.display_name || p.username || 'Panda'; });
      setNames(nextNames);
    }
    if (ids.length) {
      const [voteResult, reactionResult, commentResult] = await Promise.all([
        supabase.from('crush_votes').select('id,post_id,user_id').in('post_id', ids),
        supabase.from('crush_reactions').select('id,post_id,user_id,reaction').in('post_id', ids),
        supabase.from('crush_comments').select('id,post_id,user_id,body,created_at').in('post_id', ids).order('created_at', { ascending: true }),
      ]);
      const voteRows = (voteResult.data ?? []) as {id:string;post_id:string;user_id:string}[];
      const voteCounts: Record<string,number> = {};
      const voted: Record<string,boolean> = {};
      voteRows.forEach(v => { voteCounts[v.post_id] = (voteCounts[v.post_id] || 0) + 1; if (v.user_id === userId) voted[v.post_id] = true; });
      setVotes(voteCounts); setMyVotes(voted);
      const reactionRows = (reactionResult.data ?? []) as Reaction[];
      const reactionMap: Record<string,Reaction[]> = {};
      const mine: Record<string,string> = {};
      reactionRows.forEach(r => { (reactionMap[r.post_id] ??= []).push(r); if (r.user_id === userId) mine[r.post_id] = r.reaction; });
      setReactions(reactionMap); setMyReactions(mine);
      const commentRows = (commentResult.data ?? []) as Comment[];
      const commentMap: Record<string,Comment[]> = {};
      commentRows.forEach(c => { (commentMap[c.post_id] ??= []).push(c); });
      setComments(commentMap);
    } else { setVotes({}); setMyVotes({}); setReactions({}); setMyReactions({}); setComments({}); }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [userId]);

  async function saveGender(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !genderDraft) return;
    setBusy(true); setNotice('');
    const { error } = await supabase.from('profiles').update({ gender: genderDraft }).eq('id', userId);
    if (error) setNotice(error.message);
    else { setGender(genderDraft); setShowGenderPicker(false); setNotice('Your profile gender is saved.'); }
    setBusy(false);
  }

  async function createCrushPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || lock.current) return;
    if (!photo) { setNotice('Choose a photo for your MCM/WCW card.'); return; }
    if (!photo.type.startsWith('image/')) { setNotice('Choose an image file.'); return; }
    if (photo.size > 10 * 1024 * 1024) { setNotice('Choose an image smaller than 10 MB.'); return; }
    lock.current = true; setBusy(true); setNotice('');
    let uploadedPath = '';
    try {
      const ext = photo.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      uploadedPath = userId + '/' + crypto.randomUUID() + '.' + ext;
      const { error: uploadError } = await supabase.storage.from('crush-post-photos').upload(uploadedPath, photo, { contentType: photo.type, upsert: false });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('crush-post-photos').getPublicUrl(uploadedPath);
      const { error } = await supabase.from('crush_posts').insert({ user_id: userId, crush_type: crushType, caption: caption.trim(), image_path: urlData.publicUrl });
      if (error) throw error;
      setCaption(''); setPhoto(null);
      const input = document.getElementById('crush-photo-input') as HTMLInputElement | null;
      if (input) input.value = '';
      setNotice('Your card is scheduled for the next ' + (crushType === 'mcm' ? 'Monday Crush (MCM)' : 'Wednesday Crush (WCW)') + ' at 10:00 AM in your profile timezone.');
      await load();
    } catch (error) {
      if (uploadedPath) await supabase.storage.from('crush-post-photos').remove([uploadedPath]);
      setNotice(error instanceof Error ? error.message : 'Could not publish your crush card. Please try again.');
    } finally { lock.current = false; setBusy(false); }
  }

  async function vote(post: CrushPost) {
    if (!supabase || post.user_id === userId || myVotes[post.id]) return;
    setBusy(true); setNotice('');
    const { data, error } = await supabase.rpc('cast_crush_vote', { p_post_id: post.id });
    if (error) setNotice(error.message);
    else {
      const payload = data as { post_votes?: number; already_voted?: boolean } | null;
      setMyVotes(prev => ({ ...prev, [post.id]: true }));
      if (typeof payload?.post_votes === 'number') setVotes(prev => ({ ...prev, [post.id]: payload.post_votes! }));
      else await load();
      setNotice(payload?.already_voted ? 'You have already voted for this card.' : 'Your vote has been counted.');
    }
    setBusy(false);
  }

  async function toggleReaction(post: CrushPost, reaction: string) {
    if (!supabase || post.user_id === userId) return;
    const existing = myReactions[post.id];
    const result = existing === reaction
      ? await supabase.from('crush_reactions').delete().eq('post_id', post.id).eq('user_id', userId)
      : await supabase.from('crush_reactions').upsert({ post_id: post.id, user_id: userId, reaction }, { onConflict: 'post_id,user_id' });
    if (result.error) { setNotice(result.error.message); return; }
    const { data } = await supabase.from('crush_reactions').select('id,post_id,user_id,reaction').eq('post_id', post.id);
    setReactions(prev => ({ ...prev, [post.id]: (data ?? []) as Reaction[] }));
    setMyReactions(prev => { const next = { ...prev }; if (existing === reaction) delete next[post.id]; else next[post.id] = reaction; return next; });
  }

  async function addComment(event: FormEvent<HTMLFormElement>, post: CrushPost) {
    event.preventDefault();
    const body = (commentDrafts[post.id] || '').trim();
    if (!supabase || post.user_id === userId || !body) return;
    const { error } = await supabase.from('crush_comments').insert({ post_id: post.id, user_id: userId, body });
    if (error) { setNotice(error.message); return; }
    setCommentDrafts(prev => ({ ...prev, [post.id]: '' }));
    const { data } = await supabase.from('crush_comments').select('id,post_id,user_id,body,created_at').eq('post_id', post.id).order('created_at', { ascending: true });
    setComments(prev => ({ ...prev, [post.id]: (data ?? []) as Comment[] }));
  }

  async function deletePost(post: CrushPost) {
    if (!supabase || post.user_id !== userId) return;
    if (!window.confirm('Delete this crush card? This cannot be undone.')) return;
    setBusy(true); setNotice('');
    const { error } = await supabase.from('crush_posts').delete().eq('id', post.id).eq('user_id', userId);
    if (error) setNotice(error.message);
    else {
      if (post.image_path) {
        const marker = '/crush-post-photos/';
        const at = post.image_path.indexOf(marker);
        if (at >= 0) await supabase.storage.from('crush-post-photos').remove([decodeURIComponent(post.image_path.slice(at + marker.length))]);
      }
      setNotice('Crush card deleted.');
      await load();
    }
    setBusy(false);
  }

  async function sharePost(post: CrushPost) {
    const shareUrl = window.location.origin + window.location.pathname + '#crush-' + post.id;
    const shareText = post.crush_type.toUpperCase() + ' · ' + (names[post.user_id] || 'A Panda') + (post.caption ? ': ' + post.caption : '');
    try {
      if (navigator.share) await navigator.share({ title: 'Circle Panda ' + post.crush_type.toUpperCase(), text: shareText, url: shareUrl });
      else {
        await navigator.clipboard.writeText(shareText + ' ' + shareUrl);
        setNotice('Crush card link copied.');
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') setNotice('Could not share this card on this device.');
    }
  }

  async function messageOwner(post: CrushPost) {
    if (!supabase || post.user_id === userId) return;
    const { error } = await supabase.rpc('send_message_request', {
      p_recipient_id: post.user_id, p_source_type: post.crush_type, p_source_id: post.id,
      p_greeting: 'Hi! I saw your ' + post.crush_type.toUpperCase() + ' card and would like to connect.',
    });
    setNotice(error ? error.message : 'Message request sent. You can track it in Messages.');
  }

  const livePosts = posts.filter(post => !post.scheduled_for || new Date(post.scheduled_for).getTime() <= Date.now());
  const scheduledMine = posts.filter(post => post.user_id === userId && post.scheduled_for && new Date(post.scheduled_for).getTime() > Date.now());
  return <div className="crush-page">
    <section className="feature-panel crush-create-panel">
      <div className="feature-icon">♛</div><p className="eyebrow">MONDAY & WEDNESDAY TRADITION</p><h2>Post your crush card</h2>
      <p className="feature-copy">Choose a photo and a short caption. Cards go live at 10:00 AM on the next scheduled MCM Monday or WCW Wednesday in your profile timezone.</p>
      <form className="feature-form" onSubmit={createCrushPost}>
        <div className="form-grid-two"><label>Crush moment<select value={crushType} onChange={e => setCrushType(e.target.value as 'mcm'|'wcw')}><option value="mcm">MCM · Monday Crush</option><option value="wcw">WCW · Wednesday Crush</option></select></label><label>Caption (optional)<input value={caption} onChange={e => setCaption(e.target.value)} maxLength={300} placeholder="A little note for your circle…" /></label></div>
        <label>Photo<input id="crush-photo-input" type="file" accept="image/*" onChange={e => setPhoto(e.target.files?.[0] || null)} required /></label>
        <div className="form-submit-row"><span className="draft-state">Image limit: 10 MB</span><button className="primary-button" type="submit" disabled={busy || !photo}>{busy ? 'Publishing…' : 'Schedule crush card ↗'}</button></div>
      </form>
      {notice && <div className="notice">{notice}</div>}
      {scheduledMine.length > 0 && <div className="crush-scheduled-list"><strong>Your upcoming card</strong>{scheduledMine.map(p => <p key={p.id}>{p.crush_type.toUpperCase()} · scheduled {new Date(p.scheduled_for!).toLocaleString()}</p>)}</div>}
    </section>
    <section className="crush-feed-section"><div className="section-title-row"><div><h2>Crush cards</h2><p>Celebrate your circle without voting on your own card.</p></div><span className="count-pill">{livePosts.length} CARDS</span></div>
      {loading ? <div className="empty-state">Loading crush cards…</div> : livePosts.length ? <div className="crush-card-grid">{livePosts.map(post => {
        const mine = post.user_id === userId;
        const postReactions = reactions[post.id] || [];
        return <article className="crush-card" id={"crush-" + post.id} key={post.id}>
          <div className="crush-card-label"><span>{post.crush_type === 'mcm' ? '♛ MCM · MONDAY' : '♡ WCW · WEDNESDAY'}</span>{mine && <span className="source-tag">Your card</span>}</div>
          {post.image_path && <img className="crush-card-photo" src={post.image_path} alt={post.crush_type.toUpperCase() + ' crush card'} loading="lazy" />}
          <div className="crush-card-content"><div className="crush-card-author"><strong>{mine ? 'You' : (names[post.user_id] || 'Panda')}</strong><small>{post.scheduled_for ? new Date(post.scheduled_for).toLocaleString() : new Date(post.created_at).toLocaleDateString()}</small></div>
            {post.caption && <p>{post.caption}</p>}
            <div className="crush-card-stats"><span>♛ {votes[post.id] || 0} votes</span><span>☺ {postReactions.length} reactions</span><span>▢ {(comments[post.id] || []).length} comments</span></div>
            {mine && <div className="crush-card-actions"><button onClick={() => void sharePost(post)}>Share ↗</button><button className="decline-button" disabled={busy} onClick={() => void deletePost(post)}>Delete card</button></div>}
            {!mine && <div className="crush-card-actions"><button className="primary-button" disabled={busy || myVotes[post.id]} onClick={() => void vote(post)}>{myVotes[post.id] ? '✓ Voted' : 'Vote'}</button><button onClick={() => void messageOwner(post)}>Message ↗</button><button onClick={() => setExpandedComments(prev => ({ ...prev, [post.id]: !prev[post.id] }))}>Comment</button></div>}
            {!mine && <div className="crush-reactions">{[{key:'heart',emoji:'❤️'},{key:'laugh',emoji:'😂'},{key:'surprised',emoji:'😮'},{key:'angry',emoji:'😠'},{key:'panda',emoji:'🐼'}].map(item => <button type="button" key={item.key} className={myReactions[post.id]===item.key?'selected':''} title={item.key} onClick={() => void toggleReaction(post,item.key)}>{item.emoji}</button>)}</div>}
            {expandedComments[post.id] && <div className="comments-panel crush-comments">{(comments[post.id] || []).map(comment => <div className="comment-row" key={comment.id}><span className="comment-avatar">🐼</span><div><strong>{names[comment.user_id] || 'Panda'}</strong><p>{comment.body}</p><small>{new Date(comment.created_at).toLocaleString()}</small></div></div>)}{!mine && <form className="comment-form" onSubmit={e => void addComment(e,post)}><input value={commentDrafts[post.id] || ''} onChange={e => setCommentDrafts(prev => ({ ...prev, [post.id]: e.target.value }))} maxLength={1200} required placeholder="Write a comment…" /><button className="primary-button">Send</button></form>}</div>}
          </div>
        </article>;
      })}</div> : <div className="empty-state"><span>♛</span><h3>The next crush moment starts here.</h3><p>Schedule the first MCM or WCW card and it will appear when its weekly time arrives.</p></div>}
    </section>
    {showGenderPicker && <div className="modal-backdrop"><section className="feature-panel gender-picker-modal" role="dialog" aria-modal="true" aria-labelledby="crush-gender-title"><div className="feature-icon">♙</div><h2 id="crush-gender-title">Complete your profile</h2><p className="feature-copy">Choose your gender to finish setting up your Circle Panda profile.</p><form className="feature-form" onSubmit={saveGender}><label>Gender<select value={genderDraft || gender} onChange={e => setGenderDraft(e.target.value)} required><option value="">Select gender</option><option value="female">Female</option><option value="male">Male</option><option value="non_binary">Non-binary</option><option value="prefer_not_to_say">Prefer not to say</option></select></label><button className="primary-button" type="submit" disabled={busy || !(genderDraft || gender)}>Save and continue</button><button type="button" className="decline-button" onClick={() => setShowGenderPicker(false)}>Not now</button></form></section></div>}
  </div>;
}

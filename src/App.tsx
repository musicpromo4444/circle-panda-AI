import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from './lib/supabase';
import LocationFields, { CountryDropdown, type LocationValue } from './components/LocationFields';
import CrushFeature from './components/CrushFeature';
import HotSeatFeature from './HotSeatFeature';
import VipCallControls from './components/VipCallControls';

type Section = 'Home' | 'Confessions' | 'Crush' | 'Dating' | 'Events' | 'Groups' | 'Messages' | 'HotSeat' | 'VIP' | 'Wallet' | 'Profile' | 'Admin';
type FeedPost = { id: string; body: string; post_type: string; is_anonymous: boolean; author_name: string | null; created_at: string };
type FeedComment = { id: string; post_id: string; author_id: string; body: string; created_at: string };
type FeedReaction = { id: string; post_id: string; user_id: string; reaction: string };
type MessageRequestRow = { id: string; sender_id: string; recipient_id: string; source_type: string; greeting: string; status: string; created_at: string; conversation_id: string | null };
type ChatMessage = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string; reply_to_message_id?: string | null; media_type?: string | null; media_path?: string | null; view_once?: boolean };
type GroupMessageReaction = { id: string; message_id: string; user_id: string; reaction: string };
type ChatConversation = { conversation_id: string; user_id: string; joined_at: string };
type DatingProfileRow = { id: string; user_id: string; headline: string | null; about: string | null; personality: string[] | null; sexual_experience: string | null; looking_for: string[] | null; is_published: boolean; created_at: string; relationship_goal?: string | null; interests?: string[]; personality_tags?: string[]; occupation?: string | null; children?: string | null; smoking?: string | null; drinking?: string | null; photo_path?: string | null; blurred_photo_path?: string | null; age?: number | null; gender?: string | null; gender_preferences?: string[]; preferred_age_min?: number; preferred_age_max?: number; long_distance_ok?: boolean; communication_style?: string | null; relationship_values?: string[]; ideal_weekend?: string | null; conversation_topic?: string | null; smile_prompt?: string | null; searcher_experience?: string | null };
type EventRow = { id: string; creator_id: string; title: string; description: string; venue: string | null; country: string | null; state: string | null; city: string | null; area: string | null; starts_at: string; cover_url: string | null; category?: string | null; is_published: boolean };
type EventBlastPlan = { id: string; name: string; unique_reach: number; duration_minutes: number; price_usd: number; bc_price: number | null };
type WalletTransactionRow = { id: string; currency: string; amount: number; reason: string; created_at: string };
type CoinPackage = { id:string; name:string; coins:number; price_ngn:number|null; sort_order:number };

const sections: { name: Section; icon: string; hint: string }[] = [
  { name: 'Confessions', icon: '🔒', hint: 'Say what is on your mind' },
  { name: 'Dating', icon: '💗', hint: 'Meet someone new' },
  { name: 'Events', icon: '📅', hint: 'Find your next plan' },
  { name: 'Groups', icon: '👥', hint: 'Your people, your conversations' },
  { name: 'Messages', icon: '💬', hint: 'Requests and private chats' },
  { name: 'HotSeat', icon: '🔥', hint: 'Questions, gifts and the next seat' },
  { name: 'VIP', icon: '✦', hint: 'Your Gold Circle membership and benefits' },
  { name: 'Wallet', icon: '👛', hint: 'Your Panda Coins and activity' }, 
  { name: 'Admin', icon: '🛡️', hint: 'Manage rewards and economy rules' },
];

// One globally consistent aura style per UTC week. Every viewer sees the same VIP treatment,
// and refreshes do not reset it because the style is derived from the current week.
const VIP_AURA_STYLES = ['vip-effects-flame', 'vip-effects-lightning', 'vip-effects-bubbles', 'vip-effects-orbit'] as const;
function getWeeklyVipAuraClass(): typeof VIP_AURA_STYLES[number] {
  const utcWeek = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  return VIP_AURA_STYLES[((utcWeek % VIP_AURA_STYLES.length) + VIP_AURA_STYLES.length) % VIP_AURA_STYLES.length];
}

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
  const [authProviders, setAuthProviders] = useState({ google: false, apple: false });
  const [email, setEmail] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailConfirmationPending, setEmailConfirmationPending] = useState(false);
  const [phoneRecoveryPending, setPhoneRecoveryPending] = useState(false);
  const [recoveryPhone, setRecoveryPhone] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [signupCountry, setSignupCountry] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [vipPostIds, setVipPostIds] = useState<Set<string>>(() => new Set());
  const [, setIsVipMember] = useState(false);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const publishLock = useRef(false);
  const postMessageLocks = useRef(new Set<string>());
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [commentsByPost, setCommentsByPost] = useState<Record<string,FeedComment[]>>({});
  const [reactionsByPost, setReactionsByPost] = useState<Record<string,FeedReaction[]>>({});
  const [myReactions, setMyReactions] = useState<Record<string,string>>({});
  const [commentNames, setCommentNames] = useState<Record<string,string>>({});
  const [vipCommentAuthorIds, setVipCommentAuthorIds] = useState<Set<string>>(() => new Set());
  const [expandedComments, setExpandedComments] = useState<Record<string,boolean>>({});
  const [reactionPickerPost, setReactionPickerPost] = useState<string|null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string,string>>({});
  const [onboardingStep, setOnboardingStep] = useState<'welcome' | 'tour' | null>(null);
  const [welcomeBonusAmount, setWelcomeBonusAmount] = useState(200);
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [crushPanelKey, setCrushPanelKey] = useState(0);
  const [showCrushUploadChoice, setShowCrushUploadChoice] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let alive = true;
    void client.rpc('get_public_auth_provider_settings').then(({data,error}) => {
      if (!alive || error || !data?.length) return;
      setAuthProviders({google:Boolean(data[0].google_enabled),apple:Boolean(data[0].apple_enabled)});
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('circle-panda-theme', theme); } catch { /* Theme still works for this session. */ }
  }, [theme]);

  useEffect(() => {
    const client = supabase;
    if (!client || !session) return;
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') || params.get('trxref');
    if (params.get('payment') !== 'coin-purchase' || !reference) return;
    let alive = true;
    setSection('Wallet');
    window.history.replaceState({}, '', window.location.pathname);
    void (async () => {
      for (let attempt = 0; attempt < 10 && alive; attempt++) {
        const { data, error } = await client.rpc('get_my_coin_purchase_status_secure', { p_reference: reference });
        if (!alive) return;
        if (error) { setNotice('Payment return received, but the status could not be checked. Open Wallet again in a moment.'); return; }
        const status = data as {status:string;coins:number;amount_ngn:number}|null;
        if (status?.status === 'paid') {
          const { data: wallet } = await client.from('wallet_accounts').select('bc_balance').eq('user_id',session.user.id).maybeSingle();
          if (alive && wallet) setCoinBalance(Number(wallet.bc_balance));
          if (alive) setNotice(`Payment verified. ${Number(status.coins).toLocaleString()} BC has been credited to your wallet.`);
          return;
        }
        if (status?.status === 'failed') {
          setNotice('Paystack has not confirmed this purchase. No BC has been credited; you can retry checkout from the wallet.');
          return;
        }
        setNotice('Payment received. Waiting for Paystack confirmation before crediting your BC wallet…');
        await new Promise(resolve => window.setTimeout(resolve, 2000));
      }
      if (alive) setNotice('Payment is still processing. Your wallet will be credited only after the signed Paystack confirmation arrives.');
    })();
    return () => { alive = false; };
  }, [session]);

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
    const refreshWallet = async () => {
      const [{data:wallet},{data:adminRole}] = await Promise.all([
        supabase!.from('wallet_accounts').select('bc_balance').eq('user_id', session!.user.id).maybeSingle(),
        supabase!.from('user_roles').select('role').eq('user_id', session!.user.id).eq('role', 'admin').maybeSingle(),
      ]);
      if (alive) setCoinBalance(adminRole ? Number.POSITIVE_INFINITY : (wallet ? Number(wallet.bc_balance) : 0));
    };
    void refreshWallet();
    window.addEventListener('circle-panda-wallet-updated', refreshWallet);
    return () => { alive = false; window.removeEventListener('circle-panda-wallet-updated', refreshWallet); };
  }, [session]);

  useEffect(() => {
    if (!supabase || !session) { setIsVipMember(false); return; }
    let alive = true;
    async function resolveMembership() {
      const [profileResult, roleResult] = await Promise.all([
        supabase!.from('profiles').select('is_vip,vip_expires_at').eq('id', session!.user.id).maybeSingle(),
        supabase!.from('user_roles').select('role').eq('user_id', session!.user.id).eq('role', 'admin').maybeSingle(),
      ]);
      if (!alive) return;
      const expiry = profileResult.data?.vip_expires_at ? new Date(profileResult.data.vip_expires_at).getTime() : null;
      const profileVip = Boolean(profileResult.data?.is_vip) && (expiry === null || expiry > Date.now());
      setIsVipMember(profileVip || Boolean(roleResult.data));
    }
    void resolveMembership();
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
        .eq('post_type', 'confession')
        .order('created_at', { ascending: false }).limit(30);
      if (!alive) return;
      if (error) { setNotice(error.message); setLoadingFeed(false); return; }
      const rows = (data ?? []) as FeedPost[];
      setPosts(rows);
      // Resolve VIP from saved profiles for every author in this feed. Never infer VIP
      // from the current viewer or client-side metadata; membership is database-backed.
      const feedIds = rows.map(post => post.id);
      if (feedIds.length) {
        const { data: authors } = await supabase!.from('feed_posts').select('id,author_id').in('id', feedIds);
        const authorRows = (authors ?? []) as {id:string; author_id:string}[];
        const authorIds = [...new Set(authorRows.map(row => row.author_id).filter(Boolean))];
        if (authorIds.length) {
          const { data: vipProfiles } = await supabase!.from('profiles').select('id,is_vip,vip_expires_at').in('id', authorIds);
          const now = Date.now();
          const vipIds = new Set((vipProfiles ?? []).filter((profile: {id:string;is_vip:boolean|null;vip_expires_at:string|null}) => Boolean(profile.is_vip) && (!profile.vip_expires_at || new Date(profile.vip_expires_at).getTime() > now)).map((profile: {id:string}) => profile.id));
          setVipPostIds(new Set(authorRows.filter(row => vipIds.has(row.author_id)).map(row => row.id)));
        } else setVipPostIds(new Set());
      } else setVipPostIds(new Set());
      if (!alive) return;
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
          const { data: profiles } = await supabase!.from('profiles').select('id,display_name,username,is_vip,vip_expires_at').in('id', authorIds);
          if (!alive) return;
          const map: Record<string,string> = {};
          const activeVipIds = new Set<string>();
          const now = Date.now();
          (profiles ?? []).forEach((p: {id:string;display_name:string|null;username:string|null;is_vip?:boolean|null;vip_expires_at?:string|null}) => {
            map[p.id] = p.display_name || p.username || 'Panda';
            if (Boolean(p.is_vip) && (!p.vip_expires_at || new Date(p.vip_expires_at).getTime() > now)) activeVipIds.add(p.id);
          });
          setCommentNames(map);
          setVipCommentAuthorIds(activeVipIds);
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
        if (password.length < 8) throw new Error('Choose a password with at least 8 characters.');
        if (password !== confirmPassword) throw new Error('Your passwords do not match.');
        if (!displayName.trim()) throw new Error('Enter your name to create your Circle Panda account.');
        const identifier = email.trim();
        const isEmailIdentifier = identifier.includes('@');
        const normalizedPhone = (() => {
          const raw = identifier.replace(/[\s().-]/g, '');
          if (raw.startsWith('+')) return raw;
          if (raw.startsWith('00')) return '+' + raw.slice(2);
          if (/^0\d{10}$/.test(raw)) return '+234' + raw.slice(1);
          return raw;
        })();
        const { data: created, error: createError } = await supabase.functions.invoke('create-panda-account', {
          body: {
            name: displayName.trim(),
            identifier,
            password,
            metadata: {
              display_name: displayName.trim(),
              country: signupCountry || undefined,
              contact_email: contactEmail.trim().toLowerCase() || undefined,
            },
          },
        });
        if (createError) throw createError;
        if (!created?.ok) throw new Error(created?.error || 'Could not create your account.');
        const { error: loginError } = await supabase.auth.signInWithPassword(
          isEmailIdentifier
            ? { email: identifier.toLowerCase(), password }
            : { phone: normalizedPhone, password },
        );
        if (loginError) throw loginError;
        setEmailConfirmationPending(false);
        setNotice('Welcome to Circle Panda. Your account is ready and you are signed in.');
      } else {
        const identifier = email.trim();
        if (!identifier) throw new Error('Enter your phone number or email.');
        if (identifier.includes('@')) {
          const { error } = await supabase.auth.signInWithPassword({ email: identifier.toLowerCase(), password });
          if (error) throw error;
        } else {
          const raw = identifier.replace(/[\s().-]/g, '');
          const phone = raw.startsWith('+') ? raw : raw.startsWith('00') ? '+' + raw.slice(2) : /^0\d{10}$/.test(raw) ? '+234' + raw.slice(1) : raw;
          const { error } = await supabase.auth.signInWithPassword({ phone, password });
          if (error) throw error;
        }
        setNotice('You are signed in.');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Authentication failed. Please try again.');
    } finally { setAuthBusy(false); }
  }

  async function resendSignupConfirmation() {
    if (!supabase || !email.trim() || authBusy) return;
    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim().toLowerCase() });
      if (error) throw error;
      setNotice('If the account needs confirmation, a new confirmation email has been requested.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not resend the confirmation email.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function sendPasswordReset() {
    if (!supabase || !email.trim() || authBusy) {
      setNotice('Enter the phone number or email address used for your account first.');
      return;
    }
    setAuthBusy(true); setNotice('');
    try {
      if (email.includes('@')) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: window.location.origin });
        if (error) throw error;
        setNotice('If an account exists for that email, a password-reset link has been requested.');
      } else {
        const raw = email.trim().replace(/[\s().-]/g, '');
        const phone = raw.startsWith('+') ? raw : raw.startsWith('00') ? '+' + raw.slice(2) : /^0\d{10}$/.test(raw) ? '+234' + raw.slice(1) : raw;
        const { error } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: false } });
        if (error) throw error;
        setRecoveryPhone(phone); setRecoveryCode(''); setRecoveryNewPassword(''); setRecoveryConfirmPassword(''); setPhoneRecoveryPending(true);
        setNotice('A verification code was requested for your phone. Enter the SMS code below and choose a new password.');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not request a password reset. Check that phone/SMS authentication is configured.');
    } finally { setAuthBusy(false); }
  }

  async function finishPhonePasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || authBusy) return;
    if (recoveryNewPassword.length < 8) { setNotice('Your new password must have at least 8 characters.'); return; }
    if (recoveryNewPassword !== recoveryConfirmPassword) { setNotice('Your new passwords do not match.'); return; }
    setAuthBusy(true); setNotice('');
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({ phone: recoveryPhone, token: recoveryCode.trim(), type: 'sms' });
      if (verifyError) throw verifyError;
      const { error: updateError } = await supabase.auth.updateUser({ password: recoveryNewPassword });
      if (updateError) throw updateError;
      setPhoneRecoveryPending(false); setRecoveryCode(''); setRecoveryNewPassword(''); setRecoveryConfirmPassword('');
      setNotice('Your password has been updated and you are signed in.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not reset your password. Check the SMS code and try again.');
    } finally { setAuthBusy(false); }
  }

  async function signInWithProvider(provider: 'google' | 'apple') {
    if (!supabase || authBusy) return;
    setAuthBusy(true); setNotice('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `Could not start ${provider} sign-in. Check that this provider is configured in Supabase Auth.`);
    } finally { setAuthBusy(false); }
  }

  async function publishPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!supabase || !session || !body || publishLock.current) return;
    publishLock.current = true;
    setPosting(true); setNotice('');
    try {
      const postType = section === 'Confessions' ? 'confession' : 'status';
      const { error } = await supabase.from('feed_posts').insert({
        author_id: session.user.id, post_type: postType,
        body, is_anonymous: section === 'Confessions',
      });
      if (error) throw error;
      setDraft('');
      const { data, error: refreshError } = await supabase.from('feed_posts_public')
        .select('id,body,post_type,is_anonymous,author_name,created_at')
        .eq('post_type', 'confession')
        .order('created_at', { ascending: false }).limit(30);
      if (refreshError) throw refreshError;
      setPosts((data ?? []) as FeedPost[]);
      setNotice(section === 'Confessions' ? 'Your confession was posted anonymously.' : 'Posted to your circle.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not publish your post. Please try again.');
    } finally {
      publishLock.current = false;
      setPosting(false);
    }
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
    if (!supabase || !session || postMessageLocks.current.has(postId)) return;
    postMessageLocks.current.add(postId);
    setNotice('');
    try {
      const { error } = await supabase.rpc('send_post_message_request', {
        p_post_id: postId, p_greeting: 'Hi! I saw your post and would like to connect.',
      });
      if (error) throw error;
      setNotice('Message request sent. The author will see it in their inbox.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not send the message request. Please try again.');
    } finally {
      postMessageLocks.current.delete(postId);
    }
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
          {authMode === 'signup' && <CountryDropdown value={signupCountry} onChange={setSignupCountry} />}
          <label>Phone number or email<input type="text" inputMode="text" value={email} onChange={e => setEmail(e.target.value)} placeholder="+2348012345678 or you@example.com" required autoComplete="username" /></label>
          {authMode === 'signup' && <label>Optional email address<input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="you@example.com (optional)" autoComplete="email" /></label>}
          <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} required autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} /></label>
          {authMode === 'signup' && <label>Confirm password<input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Enter your password again" minLength={8} required autoComplete="new-password" /></label>}
          <button className="primary-button full" type="submit" disabled={!supabaseConfigured || authBusy}>{authBusy ? 'Please wait…' : authMode === 'signup' ? 'Create account' : 'Sign in'} <span>→</span></button>
        </form>
        {(authProviders.google || authProviders.apple) && <div className="auth-provider-buttons">{authProviders.google && <button type="button" className="auth-provider-button" disabled={!supabaseConfigured || authBusy} onClick={() => void signInWithProvider('google')}><span aria-hidden="true">G</span> Continue with Google</button>}{authProviders.apple && <button type="button" className="auth-provider-button" disabled={!supabaseConfigured || authBusy} onClick={() => void signInWithProvider('apple')}><span aria-hidden="true">●</span> Continue with Apple</button>}</div>}
        {(authProviders.google || authProviders.apple) && <p className="auth-provider-note">Enabled providers also need their client credentials and redirect URLs configured in Supabase Auth.</p>}
        <p className="switch-auth">{authMode === 'signup' ? 'Already part of the circle?' : 'New to Circle Panda?'} <button onClick={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setNotice(''); setEmailConfirmationPending(false); }}>{authMode === 'signup' ? 'Sign in' : 'Create account'}</button></p>
        {authMode === 'login' && !phoneRecoveryPending && <button type="button" className="text-button" onClick={() => void sendPasswordReset()} disabled={authBusy}>Forgot password?</button>}
        {authMode === 'login' && phoneRecoveryPending && <form className="auth-form phone-recovery-form" onSubmit={finishPhonePasswordReset}><p className="feature-copy">Reset password for {recoveryPhone}</p><label>SMS verification code<input value={recoveryCode} onChange={e=>setRecoveryCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" required placeholder="Enter the code" /></label><label>New password<input type="password" value={recoveryNewPassword} onChange={e=>setRecoveryNewPassword(e.target.value)} minLength={8} required autoComplete="new-password" placeholder="At least 8 characters" /></label><label>Confirm new password<input type="password" value={recoveryConfirmPassword} onChange={e=>setRecoveryConfirmPassword(e.target.value)} minLength={8} required autoComplete="new-password" placeholder="Enter it again" /></label><button className="primary-button full" disabled={authBusy}>{authBusy?'Verifying…':'Verify code & reset password'}</button><button type="button" className="text-button" disabled={authBusy} onClick={()=>{setPhoneRecoveryPending(false);setRecoveryCode('');setNotice('');}}>Cancel password reset</button></form>}
        {emailConfirmationPending && authMode === 'signup' && <button type="button" className="text-button" onClick={() => void resendSignupConfirmation()} disabled={authBusy}>Resend confirmation email</button>}
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
        {name:'Confessions' as Section, icon:'🔒', label:'Confessions', design:'lock'},
        {name:'Messages' as Section, icon:'💬', label:'Messages', design:'chat'},
        {name:'Dating' as Section, icon:'💗', label:'Dating', design:'heart'},
        {name:'Groups' as Section, icon:'👥', label:'Groups', design:'groups'},
        {name:'Events' as Section, icon:'📅', label:'Events', design:'calendar'},
      ].map(item=><button type="button" key={item.name} aria-label={item.name} aria-current={section===item.name?'page':undefined} className={`mobile-nav-item nav-design-${item.design}${section===item.name?' active':''}${item.design==='heart'?' mobile-nav-dating':''}`} onClick={()=>{setSection(item.name);setNotice('');}}>
        <span className="mobile-nav-icon" aria-hidden="true">{item.design==='lock' ? <svg viewBox="0 0 48 48" className="gold-nav-svg"><rect x="11" y="21" width="26" height="21" rx="4"/><path d="M16 21v-7a8 8 0 0 1 16 0v7"/><circle cx="24" cy="30" r="2"/><path d="M24 32v4"/></svg> : item.design==='chat' ? <svg viewBox="0 0 48 48" className="gold-nav-svg"><path d="M8 10h32v23H24l-10 7v-7H8z"/><circle cx="17" cy="21" r="1.5"/><circle cx="24" cy="21" r="1.5"/><circle cx="31" cy="21" r="1.5"/></svg> : item.design==='heart' ? <svg viewBox="0 0 48 48" className="gold-nav-svg gold-heart-svg"><path d="M24 42S5 30 5 17C5 7 18 4 24 14 30 4 43 7 43 17 43 30 24 42 24 42Z"/><path d="M13 7l-3-5m25 5 3-5M24 11V3"/><path d="M20 8l-2-4m12 4 2-4"/></svg> : item.design==='groups' ? <svg viewBox="0 0 48 48" className="gold-nav-svg"><circle cx="24" cy="13" r="6"/><circle cx="10" cy="18" r="4"/><circle cx="38" cy="18" r="4"/><path d="M12 38v-4a12 12 0 0 1 24 0v4z"/><path d="M3 36v-3a7 7 0 0 1 8-7m34 10v-3a7 7 0 0 0-8-7"/></svg> : <svg viewBox="0 0 48 48" className="gold-nav-svg"><rect x="7" y="11" width="34" height="31" rx="4"/><path d="M7 19h34M16 6v10m16-10v10"/><path d="M15 26h5m8 0h5M15 33h5m8 0h5"/></svg>}</span><span className="mobile-nav-label">{item.label}</span>{item.name==='Messages'&&<i className="nav-dot" />}
      </button>)}
    </nav>
    <main className="main-area">
      <header className="topbar"><div className="mobile-brand">🐼 <strong>circle<span className="brand-green">panda</span></strong></div><div className="top-actions"><button className="coin-balance-chip" title="Open Panda wallet" onClick={() => setSection('Wallet')}><span className="coin-token" aria-hidden="true"><PandaCoinArtwork /></span><span className="coin-balance-copy"><strong>{coinBalance === null ? '—' : coinBalance.toLocaleString()}</strong><small>BC</small></span></button><button type="button" className="hot-seat-header-shortcut" title="Open Hot Seat" aria-label="Open Hot Seat" onClick={() => setSection('HotSeat')}><span aria-hidden="true">🔥</span><small>HOT SEAT</small></button><button className="icon-button theme-toggle" title={theme==='dark'?'Switch to light mode':'Switch to dark mode'} aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'} onClick={()=>setTheme(theme==='dark'?'light':'dark')}><svg viewBox="0 0 24 24" aria-hidden="true">{theme==='dark' ? <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></> : <><path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/></>}</svg></button><button className="icon-button notification-button" title="Notifications" aria-label="Notifications" onClick={() => setNotice('You are all caught up.')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg></button><button className="profile-chip profile-chip-icon-only" onClick={() => setSection('Profile')} title="Your profile" aria-label="Your profile"><span className="avatar"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.5" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2z"/></svg></span></button></div></header>
      <div className={`page-wrap page-${section.toLowerCase()}`}>
<div className="welcome-row"><div><p className="eyebrow">{section === 'Dating' ? 'A SPACE FOR REAL CONNECTIONS' : section === 'Confessions' ? 'WELCOME BACK TO CIRCLE PANDA' : 'WELCOME BACK TO YOUR WORLD'}</p><h1>{section === 'Home' ? 'Your circle, in one place.' : section === 'Confessions' ? 'Secret Confessions' : section === 'HotSeat' ? 'Hot Seat' : active.name}<span className="heading-period">.</span></h1><p className="section-hint">{section === 'Confessions' ? 'Post your secret confessions, and nobody will know it was you. Nobody will judge you. Feel free to post.' : active.hint}</p></div></div>
                {(section === 'Home' || section === 'Confessions') && <div className="confession-shortcuts" aria-label="Circle Panda quick actions"><button type="button" className="confession-shortcut" onClick={() => setShowCrushUploadChoice(true)}><span className="shortcut-circle upload-3d"><span className="shortcut-symbol">＋</span></span><strong>Upload</strong><small>Upload your crush picture</small></button><button type="button" className="confession-shortcut" onClick={() => { localStorage.setItem('circle-panda-crush-type','wcw'); sessionStorage.setItem('circle-panda-open-crush-upload','1'); setSection('Confessions'); setCrushPanelKey(key => key + 1); }}><span className="shortcut-circle"><span className="shortcut-symbol corner-symbol">♡</span></span><strong className="shortcut-acronym">WCW</strong><small>Woman Crush Wednesday</small></button><button type="button" className="confession-shortcut" onClick={() => { localStorage.setItem('circle-panda-crush-type','mcm'); sessionStorage.setItem('circle-panda-open-crush-upload','1'); setSection('Confessions'); setCrushPanelKey(key => key + 1); }}><span className="shortcut-circle"><span className="shortcut-symbol corner-symbol">♛</span></span><strong className="shortcut-acronym">MCM</strong><small>Man Crush Monday</small></button></div>}
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
          <div className="section-title-row"><div><h2>{section === 'Confessions' ? 'Anonymous confessions' : 'From your circle'}</h2><p>{section === 'Confessions' ? 'Your identity stays hidden when you share.' : 'Small moments, shared honestly.'}</p></div><span className="count-pill">{posts.length} POSTS</span></div>
          <section id="confession-composer" className="feed-composer"><div className="composer-avatar">🐼</div><form onSubmit={publishPost}><textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder={section === 'Confessions' ? 'Share what is on your mind — anonymously…' : 'What would you like to share with your circle?'} maxLength={5000} required /><div className="composer-footer"><span>{section === 'Confessions' ? '☁ Posted anonymously' : '✦ Be kind, be real'}</span><button className="primary-button" disabled={posting || !draft.trim()}>{posting ? 'Posting…' : 'Share post'} <span>↗</span></button></div></form></section>
          {loadingFeed ? <div className="empty-state">Loading your circle…</div> : posts.length ? <div className="post-list">{posts.map(post => <article className={`post-card${vipPostIds.has(post.id) ? ` vip-post-card ${getWeeklyVipAuraClass()}` : ''}`} key={post.id}><div className={`post-top${vipPostIds.has(post.id) ? ' vip-post-top' : ''}`}><div className={`post-avatar${vipPostIds.has(post.id) ? ` vip-avatar-frame ${getWeeklyVipAuraClass()}` : ''}`}>{'🐼'}</div><div><strong>{post.is_anonymous ? 'Anonymous Panda' : (post.author_name || 'Panda')} {vipPostIds.has(post.id) && <span className="vip-member-label">VIP</span>}</strong><p>{post.post_type === 'confession' ? 'Confession' : 'Circle post'} · {new Date(post.created_at).toLocaleString()}</p></div><button type="button" className="post-share-button" onClick={() => void shareFeedPost(post)} aria-label="Share this post"><span aria-hidden="true">↗</span> Share</button></div><p className="post-body">{post.body}</p><div className="post-actions"><button className={myReactions[post.id] ? 'react-active' : ''} onClick={() => setReactionPickerPost(reactionPickerPost === post.id ? null : post.id)}>♡ React {reactionsByPost[post.id]?.length ? `(${reactionsByPost[post.id].length})` : ''}</button><button onClick={() => setExpandedComments(prev => ({...prev,[post.id]:!prev[post.id]}))}>▢ Comment {commentsByPost[post.id]?.length ? `(${commentsByPost[post.id].length})` : ''}</button><button onClick={() => void messagePostAuthor(post.id)}>↗ Message</button></div>
              {reactionPickerPost === post.id && <div className="reaction-picker">{[{key:'heart',emoji:'❤️'},{key:'laugh',emoji:'😂'},{key:'surprised',emoji:'😮'},{key:'angry',emoji:'😠'},{key:'panda',emoji:'🐼'}].map(item => <button key={item.key} className={myReactions[post.id] === item.key ? 'selected' : ''} onClick={() => void toggleReaction(post.id,item.key)} title={item.key}>{item.emoji}</button>)}</div>}
              {expandedComments[post.id] && <div className="comments-panel">{(commentsByPost[post.id] ?? []).map(comment => <div className={`comment-row${vipCommentAuthorIds.has(comment.author_id) ? ` vip-comment-row ${getWeeklyVipAuraClass()}` : ''}`} key={comment.id}><span className={`comment-avatar${vipCommentAuthorIds.has(comment.author_id) ? ` vip-avatar-frame ${getWeeklyVipAuraClass()}` : ''}`}>🐼</span><div><strong>{commentNames[comment.author_id] || 'Panda'} {vipCommentAuthorIds.has(comment.author_id) && <span className="vip-member-label">VIP</span>}</strong><p>{comment.body}</p><small>{new Date(comment.created_at).toLocaleString()}</small></div></div>)}<form className="comment-form" onSubmit={e => void submitComment(e,post.id)}><input value={commentDrafts[post.id] || ''} onChange={e => setCommentDrafts(prev => ({...prev,[post.id]:e.target.value}))} placeholder="Write a comment…" maxLength={2000} required /><button className="primary-button">Send</button></form></div>}</article>)}</div> : <div className="empty-state"><span>✦</span><h3>Your circle starts here.</h3><p>Be the first to share something. Your posts will appear here after publishing.</p></div>}
        </>}
        {section !== 'Home' && section !== 'Confessions' && <FeaturePanel key={section === 'Crush' ? crushPanelKey : section} section={section} userId={session.user.id} onOpenMessages={() => setSection('Messages')} onNavigate={setSection} isAdmin={isAdmin} />}
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
        <div className="welcome-bonus-amount"><span className="coin-token" aria-label="Gold panda coin"><PandaCoinArtwork /></span><strong>{welcomeBonusAmount.toLocaleString()}</strong><small>BC WELCOME BONUS</small></div>
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

function FeaturePanel({ section, userId, onOpenMessages, onNavigate, isAdmin }: { section: Section; userId: string; onOpenMessages: () => void; onNavigate: (section: Section) => void; isAdmin:boolean }) {
  if (section === 'Messages') return <MessagesFeature userId={userId} />;
  if (section === 'HotSeat') return <HotSeatFeature userId={userId} onOpenWallet={() => onNavigate('Wallet')} isAdmin={isAdmin} />;
  if (section === 'Dating') return <DatingFeature userId={userId} onOpenMessages={onOpenMessages} />;
  if (section === 'Events') return <EventsFeature userId={userId} />;
  if (section === 'VIP') return <VipFeature userId={userId} onNavigate={onNavigate} />;
  if (section === 'Wallet') return <WalletFeature userId={userId} />;
  if (section === 'Profile') return <ProfileFeature userId={userId} />;
  if (section === 'Groups') return <GroupsFeature userId={userId} />;
  if (section === 'Crush') return <CrushFeature userId={userId} />;
  if (section === 'Admin') return <AdminFeature />;
  const content: Record<Exclude<Section, 'Home' | 'Confessions' | 'VIP' | 'Admin' | 'Profile' | 'HotSeat'>, { icon: string; title: string; body: string; next: string[] }> = {
    'Crush': { icon: '♛', title: 'Your next crush moment', body: 'MCM on Monday. WCW on Wednesday. Discover the people your circle is celebrating.', next: ['Weekly crush feed', 'Votes and reactions', 'Profile-to-message requests'] },
    'Dating': { icon: '♡', title: 'Make room for a connection', body: 'Build a dating profile, discover people who fit your preferences, and let every match lead to a conversation.', next: ['Dating profile setup', 'Country, state and area filters', 'Send, accept and decline requests'] },
    'Events': { icon: '▦', title: 'Make plans worth showing up for', body: 'Discover events around you or publish one of your own. Event cards will connect directly to the creator.', next: ['Create and publish events', 'Attendance and attendee counts', 'Creator messaging and event boosts'] },
    'Groups': { icon: '◉', title: 'Find your people', body: 'Join a conversation or create a group for your community. VIP spaces will be clearly separated.', next: ['Create and join groups', 'Group member and message flows', 'VIP group spaces'] },
    'Messages': { icon: '↗', title: 'Every connection leads to a conversation', body: 'Message requests from dating, events, groups and the feed will live alongside your accepted chats.', next: ['Incoming and sent requests', 'Accept or decline requests', 'Private chats and unread indicators'] },
    'Wallet': { icon: '◈', title: 'Your Panda wallet', body: 'Your wallet and activity rewards will be managed by server-side rules, with balances that do not expire.', next: ['BC balance and transaction history', 'Activity XP and levels', 'VIP and reward controls'] },
  };
  const item = content[section as Exclude<Section, 'Home' | 'Confessions' | 'VIP' | 'Admin' | 'Profile' | 'HotSeat'>];
  return <section className="feature-panel"><div className="feature-icon">{item.icon}</div><p className="eyebrow">THE CIRCLE PANDA EXPERIENCE</p><h2>{item.title}</h2><p className="feature-copy">{item.body}</p><div className="feature-list">{item.next.map((next, i) => <div key={next}><span>{String(i + 1).padStart(2, '0')}</span>{next}<b>↗</b></div>)}</div><div className="feature-note"><span className="pulse" /> This section is being connected to the new backend in stages.</div></section>;
}


function MessagesFeature({ userId }: { userId: string }) {
  const [requests, setRequests] = useState<MessageRequestRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [vipMessageUserIds, setVipMessageUserIds] = useState<Set<string>>(() => new Set());
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [openConversation, setOpenConversation] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busyId, setBusyId] = useState('');
  const [busy, setBusy] = useState(false);
  const [messageNotice, setMessageNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [messageView, setMessageView] = useState<'requests' | 'messages' | 'sent'>('requests');
  const [totalMessages, setTotalMessages] = useState(0);
  const [lastMessageSender, setLastMessageSender] = useState<Record<string,string>>({});
  const [datingMatches, setDatingMatches] = useState<Array<{id:string;user_a?:string;user_b?:string;thread_id:string|null;free_until:string;status:string;photos_revealed?:boolean;my_confirmed?:boolean;other_confirmed?:boolean}>>([]);
  const [chatClock, setChatClock] = useState(Date.now());
  const [datingFreeHours, setDatingFreeHours] = useState(72);
  const [datingMessageCost, setDatingMessageCost] = useState(1);
  const responseLocks = useRef<Record<string, boolean>>({});
  const sendingLock = useRef(false);

  async function loadRequests() {
    if (!supabase) return;
    const { data: datingSettings } = await supabase.from('economy_settings').select('setting_key,numeric_value').in('setting_key', ['dating_free_hours','dating_message_cost']);
    const settingMap = Object.fromEntries((datingSettings ?? []).map((row: {setting_key:string;numeric_value:number}) => [row.setting_key, Number(row.numeric_value)]));
    if (settingMap.dating_free_hours != null) setDatingFreeHours(Math.max(0, settingMap.dating_free_hours));
    if (settingMap.dating_message_cost != null) setDatingMessageCost(Math.max(0, settingMap.dating_message_cost));
    const { data, error } = await supabase.from('message_requests')
      .select('id,sender_id,recipient_id,source_type,greeting,status,created_at,conversation_id')
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .order('created_at', { ascending: false }).limit(100);
    if (error) { setMessageNotice(error.message); setLoading(false); return; }
    const rows = (data ?? []) as MessageRequestRow[];
    setRequests(rows);
    const { data: datingMatchRows, error: datingMatchError } = await supabase.rpc('get_my_dating_matches_review_secure');
    if (datingMatchError) {
      setDatingMatches([]);
      setMessageNotice(`Message requests loaded, but Dating chats could not be refreshed: ${datingMatchError.message}`);
    } else {
      setDatingMatches(((datingMatchRows ?? []) as Array<{id:string;thread_id:string|null;free_until:string;status:string}>)
        .filter(match => match.status === 'matched' && Boolean(match.thread_id)));
    }
    const ids = [...new Set(rows.flatMap(r => [r.sender_id, r.recipient_id]))];
    if (ids.length) {
      const { data: profiles } = await supabase.from('profiles').select('id,display_name,username,is_vip,vip_expires_at').in('id', ids);
      const nextNames: Record<string, string> = {};
      const activeVipIds = new Set<string>();
      const vipCheckTime = Date.now();
      (profiles ?? []).forEach((p: {id:string;display_name:string|null;username:string|null;is_vip?:boolean|null;vip_expires_at?:string|null}) => {
        nextNames[p.id] = p.display_name || p.username || 'Panda';
        if (Boolean(p.is_vip) && (!p.vip_expires_at || new Date(p.vip_expires_at).getTime() > vipCheckTime)) activeVipIds.add(p.id);
      });
      setNames(nextNames); setVipMessageUserIds(activeVipIds);
    }
    const { data: memberships } = await supabase.from('conversation_members').select('conversation_id,user_id').eq('user_id', userId);
    const memberRows = (memberships ?? []) as ChatConversation[];
    setConversations(memberRows);
    const conversationIds = [...new Set(memberRows.map(item => item.conversation_id))];
    if (conversationIds.length) {
      const { data: allMessages } = await supabase.from('messages').select('id,conversation_id,sender_id,created_at').in('conversation_id', conversationIds).order('created_at', { ascending: true });
      const latest: Record<string,string> = {};
      (allMessages ?? []).forEach((item: {conversation_id:string;sender_id:string}) => { latest[item.conversation_id] = item.sender_id; });
      setTotalMessages((allMessages ?? []).length);
      setLastMessageSender(latest);
    } else { setTotalMessages(0); setLastMessageSender({}); }
    setLoading(false);
  }

  async function loadMessages(conversationId: string) {
    if (!supabase) return;
    setOpenConversation(conversationId);
    setLastMessageSender(previous => ({ ...previous, [conversationId]: userId }));
    const { data, error } = await supabase.from('messages')
      .select('id,conversation_id,sender_id,body,created_at')
      .eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(200);
    if (error) setMessageNotice(error.message);
    else setMessages((data ?? []) as ChatMessage[]);
  }

  useEffect(() => { void loadRequests(); }, [userId]);
  useEffect(() => { const timer = window.setInterval(() => setChatClock(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_requests', filter: 'sender_id=eq.' + userId }, () => { void loadRequests(); })
      .subscribe();
    return () => { void channel.unsubscribe(); };
  }, [userId]);


  async function respond(requestId: string, accept: boolean) {
    if (!supabase || responseLocks.current[requestId]) return;
    responseLocks.current[requestId] = true;
    setBusyId(requestId); setMessageNotice('');
    try {
      const { data, error } = await supabase.rpc('respond_direct_message_request_secure', { p_request_id: requestId, p_accept: accept });
      if (error) throw error;
      const result = data as {thread_id?: string|null;status?: string}|null;
      if (accept && result?.thread_id) await loadMessages(result.thread_id);
      await loadRequests();
      setMessageNotice(accept ? (result?.status === 'matched' ? 'Dating match accepted. Your 72-hour free chat is ready.' : 'Request accepted. Your chat is ready.') : 'Request declined.');
    } catch (error) {
      setMessageNotice(error instanceof Error ? error.message : 'Could not respond to this request. Please try again.');
    } finally {
      delete responseLocks.current[requestId];
      setBusyId('');
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !openConversation || !draft.trim() || sendingLock.current) return;
    sendingLock.current = true;
    setBusy(true); setMessageNotice('');
    const body = draft.trim();
    try {
      const { error } = await supabase.from('messages').insert({
        conversation_id: openConversation, sender_id: userId, body,
      });
      if (error) throw error;
      setDraft(''); await loadMessages(openConversation);
    } catch (error) {
      setMessageNotice(error instanceof Error ? error.message : 'Message could not be sent. Please try again.');
    } finally {
      sendingLock.current = false;
      setBusy(false);
    }
  }

  const incoming = requests.filter(r => r.recipient_id === userId && r.status === 'pending');
  const sent = requests.filter(r => r.sender_id === userId);
  const activeConversations = [...new Set(conversations.map(c => c.conversation_id))];
  const activeDatingMatch = datingMatches.find(match => match.thread_id === openConversation);
  const datingFreeRemaining = activeDatingMatch ? Math.max(0, new Date(activeDatingMatch.free_until).getTime() - chatClock) : 0;
  const datingTimerLabel = activeDatingMatch ? datingFreeRemaining > 0
    ? `Dating free period · ${String(Math.floor(datingFreeRemaining/3600000)).padStart(2,'0')}:${String(Math.floor((datingFreeRemaining%3600000)/60000)).padStart(2,'0')}:${String(Math.floor((datingFreeRemaining%60000)/1000)).padStart(2,'0')} remaining`
    : `The ${datingFreeHours}-hour free period has ended · ${datingMessageCost} BC per Dating message (VIP is free)`
    : '';
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
      <div className="message-counter-strip" aria-label="Message activity counters">
        <button type="button" className={messageView === 'requests' ? 'message-counter active' : 'message-counter'} onClick={() => setMessageView('requests')}><span className="message-counter-label">Requests</span><strong>{incoming.length}</strong>{incoming.length > 0 && <i className="message-alert-dot" aria-label="Requests need attention" />}<small>Inbox</small></button>
        <button type="button" className={messageView === 'messages' ? 'message-counter active' : 'message-counter'} onClick={() => setMessageView('messages')}><span className="message-counter-label">Messages</span><strong>{totalMessages}</strong>{activeConversations.some(id => lastMessageSender[id] && lastMessageSender[id] !== userId) && <i className="message-alert-dot" aria-label="Messages need attention" />}<small>{activeConversations.length} chats</small></button>
        <button type="button" className={messageView === 'sent' ? 'message-counter active' : 'message-counter'} onClick={() => setMessageView('sent')}><span className="message-counter-label">Sent requests</span><strong>{sent.length}</strong>{sent.some(r => r.status === 'pending') && <i className="message-alert-dot" aria-label="Sent requests awaiting response" />}<small>{sent.filter(r => r.status === 'pending').length} awaiting</small></button>
      </div>
      {messageNotice && <div className="notice inline-notice">{messageNotice}<button onClick={() => setMessageNotice('')}>×</button></div>}
      {messageView === 'requests' && <section className="request-section"><div className="section-title-row"><div><h2>Message requests</h2><p>Requests from dating, events, groups and your feed.</p></div><span className="count-pill">{incoming.length} NEW</span></div>
        {loading ? <div className="empty-state">Loading requests…</div> : incoming.length ? incoming.map(r => <article className="request-card request-needs-attention" key={r.id}><div className={`request-avatar${vipMessageUserIds.has(r.sender_id) ? ` vip-avatar-frame ${getWeeklyVipAuraClass()}` : ''}`}>🐼</div><div className="request-content"><div className="request-card-top"><strong>{names[r.sender_id] || 'Panda'} {vipMessageUserIds.has(r.sender_id) && <span className="vip-member-label">VIP</span>}</strong><span className="source-tag">{sourceLabel(r.source_type)}</span></div><p>{r.greeting || 'Would like to start a conversation with you.'}</p><small>{new Date(r.created_at).toLocaleString()}</small><div className="request-buttons"><button className="primary-button" disabled={busyId === r.id} onClick={() => void respond(r.id, true)}>{busyId === r.id ? 'Working…' : 'Accept'}</button><button className="decline-button" disabled={busyId === r.id} onClick={() => void respond(r.id, false)}>Decline</button></div></div></article>) : <div className="empty-state compact"><span>✦</span><h3>No new requests</h3><p>When someone wants to connect, their request will show up here.</p></div>}
      </section>}
      {messageView === 'sent' && <section className="request-section"><div className="section-title-row"><div><h2>Sent requests</h2><p>Keep track of requests you have sent.</p></div><span className="count-pill">{sent.length} TOTAL</span></div>
        {sent.length ? sent.map(r => <article className={r.status === 'pending' ? 'sent-card request-needs-attention' : 'sent-card'} key={r.id}><div className="sent-card-person"><span className={`request-avatar${vipMessageUserIds.has(r.recipient_id) ? ` vip-avatar-frame ${getWeeklyVipAuraClass()}` : ''}`}>🐼</span><div><strong>{names[r.recipient_id] || 'Panda'} {vipMessageUserIds.has(r.recipient_id) && <span className="vip-member-label">VIP</span>}</strong><p>Message request · {sourceLabel(r.source_type)}</p></div></div><span className={`status-tag status-${r.status}`}>{r.status}</span>{r.conversation_id && <button className="text-action" onClick={() => void loadMessages(r.conversation_id!)}>Open chat →</button>}</article>) : <div className="empty-state compact"><p>You have not sent a request yet.</p></div>}
      </section>}
      {messageView === 'messages' && <section className="request-section"><div className="section-title-row"><div><h2>Your messages</h2><p>Open a conversation to continue chatting.</p></div><span className="count-pill">{activeConversations.length} CHATS</span></div>
        {activeConversations.length ? activeConversations.map(id => <button key={id} className={(openConversation === id ? 'chat-list-item selected' : 'chat-list-item') + (lastMessageSender[id] && lastMessageSender[id] !== userId ? ' chat-needs-attention' : '')} onClick={() => void loadMessages(id)}><span className={`request-avatar${vipMessageUserIds.has((requests.find(r => r.conversation_id === id)?.sender_id === userId ? requests.find(r => r.conversation_id === id)?.recipient_id : requests.find(r => r.conversation_id === id)?.sender_id) || '') ? ` vip-avatar-frame ${getWeeklyVipAuraClass()}` : ''}`}>🐼</span><span><strong>{conversationTitle(id)}</strong><small>Private conversation</small></span><b>→</b></button>) : <div className="empty-state compact"><p>Accept a message request to start your first chat.</p></div>}
      </section>}
    </div>
    <section className="chat-panel">
      {openConversation ? <><header className="chat-header"><div className="request-avatar">🐼</div><div><strong>{conversationTitle(openConversation)}</strong><p>Only conversation members can read messages.</p>{datingTimerLabel && <small className={datingFreeRemaining > 0 ? 'dating-chat-timer active' : 'dating-chat-timer expired'}>{datingTimerLabel}</small>}</div><button className="text-action" onClick={() => {setOpenConversation(null);setMessages([]);}}>Close ×</button></header><VipCallControls userId={userId} threadId={openConversation} otherName={conversationTitle(openConversation)} otherIsVip={vipMessageUserIds.has((requests.find(r => r.conversation_id === openConversation)?.sender_id === userId ? requests.find(r => r.conversation_id === openConversation)?.recipient_id : requests.find(r => r.conversation_id === openConversation)?.sender_id) || '')} /><div className="chat-history">{messages.map(m => <div key={m.id} className={m.sender_id === userId ? 'chat-bubble mine' : 'chat-bubble'}><p>{m.body}</p><small>{new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></div>)}{!messages.length && <div className="empty-state compact"><p>Say hello and start the conversation.</p></div>}</div><form className="chat-compose" onSubmit={sendMessage}><input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Write a message…" maxLength={10000} required /><button className="primary-button" disabled={busy || !draft.trim()}>{busy ? 'Sending…' : 'Send ↗'}</button></form></> : <div className="chat-placeholder"><span>↗</span><h3>Your conversations live here.</h3><p>Choose a chat or accept a request to begin messaging.</p></div>}
    </section>
  </section>;
}


function DatingFeature({ userId, onOpenMessages }: { userId: string; onOpenMessages: () => void }) {
  const [datingFreeHours, setDatingFreeHours] = useState(72);
  const [datingMessageCost, setDatingMessageCost] = useState(1);
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
  const [locationHasStates, setLocationHasStates] = useState(false);
  const [mainProfile, setMainProfile] = useState<{name:string;username:string;age:number|null;gender:string}>({name:'',username:'',age:null,gender:''});
  const [headline, setHeadline] = useState('');
  const [about, setAbout] = useState('');
  const [relationshipGoal, setRelationshipGoal] = useState('Dating / getting to know someone');
  const [genderPreferences, setGenderPreferences] = useState<string[]>([]);
  const [preferredAgeMin, setPreferredAgeMin] = useState('18');
  const [preferredAgeMax, setPreferredAgeMax] = useState('45');
  const [longDistanceOk, setLongDistanceOk] = useState(false);
  const [communicationStyle, setCommunicationStyle] = useState('');
  const [relationshipValues, setRelationshipValues] = useState<string[]>([]);
  const [idealWeekend, setIdealWeekend] = useState('');
  const [conversationTopic, setConversationTopic] = useState('');
  const [smilePrompt, setSmilePrompt] = useState('');
  const [lookingFor, setLookingFor] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [personalityTags, setPersonalityTags] = useState<string[]>([]);
  const [sexualExperience, setSexualExperience] = useState('');
  const [searcherExperience, setSearcherExperience] = useState('');
  const [occupation, setOccupation] = useState('');
  const [children, setChildren] = useState('Prefer not to say');
  const [smoking, setSmoking] = useState('Prefer not to say');
  const [drinking, setDrinking] = useState('Prefer not to say');
  const [published, setPublished] = useState(false);
  const [directory, setDirectory] = useState<DatingProfileRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [vipDirectoryIds, setVipDirectoryIds] = useState<Set<string>>(() => new Set());
  const [locations, setLocations] = useState<Record<string, string>>({});
  const [locationDetails, setLocationDetails] = useState<Record<string, LocationValue>>({});
  const [sentRequests, setSentRequests] = useState<Record<string, {status:string; id:string}>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [formStep, setFormStep] = useState(0);
  useEffect(() => {
    let active = true;
    if (!location.country) { setLocationHasStates(false); return () => { active = false; }; }
    import('country-state-city').then(geo => {
      const country = geo.Country.getAllCountries().find(item => item.name === location.country || item.isoCode === location.country);
      if (active) setLocationHasStates(geo.State.getStatesOfCountry(country?.isoCode || location.country).length > 0);
    }).catch(() => { if (active) setLocationHasStates(false); });
    return () => { active = false; };
  }, [location.country]);
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
      const { data: datingSettings } = await supabase.from('economy_settings').select('setting_key,numeric_value').in('setting_key', ['dating_free_hours','dating_message_cost']);
      const settingMap = Object.fromEntries((datingSettings ?? []).map((row: {setting_key:string;numeric_value:number}) => [row.setting_key, Number(row.numeric_value)]));
      if (settingMap.dating_free_hours != null) setDatingFreeHours(Math.max(0, settingMap.dating_free_hours));
      if (settingMap.dating_message_cost != null) setDatingMessageCost(Math.max(0, settingMap.dating_message_cost));
      const { data: profile, error: profileError } = await supabase.from('profiles')
        .select('display_name,username,age,date_of_birth,gender,country,state,state_province,city,area')
        .eq('id', userId).maybeSingle();
      if (profileError) throw profileError;
      if (profile) {
        setMainProfile({ name: profile.display_name || profile.username || 'Panda', username: profile.username || '', age: profile.age == null ? null : Number(profile.age), gender: profile.gender || '' });
        setDateOfBirth(profile.date_of_birth || '');
        const savedLocation = { country: profile.country || '', state: profile.state_province || profile.state || '', city: profile.city || '', area: profile.area || '' };
        const { data: authUserResult } = await supabase.auth.getUser();
        const savedAddress = authUserResult.user?.user_metadata?.optional_address;
        setOptionalAddress(typeof savedAddress === 'string' ? savedAddress : '');
        setLocation(savedLocation);
        if (!profile.date_of_birth || !savedLocation.country || !savedLocation.city || !savedLocation.area) { /* Open profile completion only when the user taps Create Dating Profile. */ }
      } else {
        setFormStep(0);
        /* Keep setup closed on entry; the Create Dating Profile button opens it. */
      }

      const { data: mine, error: mineError } = await supabase.from('dating_profiles')
        .select('id,user_id,headline,about,personality,sexual_experience,looking_for,is_published,created_at,relationship_goal,interests,personality_tags,occupation,children,smoking,drinking,photo_path,blurred_photo_path,name,age,gender,vibe,emoji,location,country,state_province,gender_preferences,preferred_age_min,preferred_age_max,long_distance_ok,communication_style,relationship_values,ideal_weekend,conversation_topic,smile_prompt,searcher_experience')
        .eq('user_id', userId).maybeSingle();
      if (mineError) throw mineError;
      if (mine) {
        setHeadline(mine.headline || '');
        setAbout(mine.about || '');
        setRelationshipGoal(mine.relationship_goal || 'Dating / getting to know someone');
        setGenderPreferences(Array.isArray(mine.gender_preferences) ? mine.gender_preferences : []);
        setPreferredAgeMin(String(mine.preferred_age_min ?? 18));
        setPreferredAgeMax(String(mine.preferred_age_max ?? 45));
        setLongDistanceOk(Boolean(mine.long_distance_ok));
        setCommunicationStyle(mine.communication_style || '');
        setRelationshipValues(Array.isArray(mine.relationship_values) ? mine.relationship_values : []);
        setIdealWeekend(mine.ideal_weekend || '');
        setConversationTopic(mine.conversation_topic || '');
        setSmilePrompt(mine.smile_prompt || '');
        setSearcherExperience(mine.searcher_experience || '');
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

      // Use the server-side discovery RPC so adult eligibility is derived from the protected
      // account date of birth, never from a user-editable/stale dating_profiles.age value.
      const { data, error } = await supabase.rpc('get_dating_discovery_filters_secure', {
        p_age_min: 18,
        p_age_max: 120,
      });
      if (error) throw error;
      const rowsFromDiscovery = ((data ?? []) as Array<Partial<DatingProfileRow> & { user_id: string; updated_at?: string | null }>)
        .map(row => ({
          ...row,
          id: row.user_id,
          is_published: true,
          created_at: row.updated_at || '',
        })) as DatingProfileRow[];
      const { data: blockedRows, error: blockedError } = await supabase.from('user_blocks')
        .select('blocked_id').eq('blocker_id', userId);
      if (blockedError) throw blockedError;
      const blockedIds = new Set((blockedRows ?? []).map((row: {blocked_id:string}) => row.blocked_id));
      const rows = rowsFromDiscovery.filter(row => !blockedIds.has(row.user_id));
      setDirectory(rows);
      const ids = rows.map(row => row.user_id);
      if (ids.length) {
        const { data: publicProfiles } = await supabase.from('profiles')
          .select('id,display_name,username,country,state,state_province,city,area,age,gender,is_vip,vip_expires_at').in('id', ids);
        const nameMap: Record<string, string> = {};
        const locationMap: Record<string, string> = {};
        const detailsMap: Record<string, LocationValue> = {};
        const activeVipIds = new Set<string>();
        const vipCheckTime = Date.now();
        (publicProfiles ?? []).forEach((p: {id:string;display_name:string|null;username:string|null;country:string|null;state:string|null;state_province:string|null;city:string|null;area:string|null;is_vip?:boolean|null;vip_expires_at?:string|null}) => {
          nameMap[p.id] = p.display_name || p.username || 'Panda';
          locationMap[p.id] = [p.area,p.city,p.state_province || p.state,p.country].filter(Boolean).join(', ');
          detailsMap[p.id] = { country: p.country || '', state: p.state_province || p.state || '', city: p.city || '', area: p.area || '' };
          if (Boolean(p.is_vip) && (!p.vip_expires_at || new Date(p.vip_expires_at).getTime() > vipCheckTime)) activeVipIds.add(p.id);
        });
        setNames(nameMap); setLocations(locationMap); setLocationDetails(detailsMap); setVipDirectoryIds(activeVipIds);
      } else {
        setNames({}); setLocations({}); setLocationDetails({}); setVipDirectoryIds(new Set());
      }

      const { data: requests, error: requestsError } = await supabase.from('message_requests')
        .select('id,sender_id,recipient_id,source_type,status,created_at')
        .eq('source_type','dating').or('sender_id.eq.' + userId + ',recipient_id.eq.' + userId)
        .order('created_at',{ascending:false}).limit(100);
      if (requestsError) setNotice('Dating profiles loaded, but request status could not be refreshed.');
      const requestMap: Record<string,{status:string;id:string}> = {};
      // Requests are ordered newest-first; keep the newest status per recipient so an older
      // pending/accepted request cannot overwrite a later decline or a fresh re-request.
      (requests ?? []).filter((r: {sender_id:string;recipient_id:string}) => r.sender_id === userId)
        .forEach((r: {id:string;recipient_id:string;status:string}) => {
          if (!requestMap[r.recipient_id]) requestMap[r.recipient_id] = {status:r.status,id:r.id};
        });
      setSentRequests(requestMap);

      const { data: matchRows, error: matchError } = await supabase.rpc('get_my_dating_matches_review_secure');
      if (matchError) {
        setDatingMatches([]);
        setMatchPeople({});
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
              const bucket = 'dating-profile-photos';
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
  const datingRequestLocks = useRef<Record<string, boolean>>({});
  const datingDecisionLocks = useRef<Record<string, boolean>>({});

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
    const { error: originalError } = await supabase.storage.from('dating-profile-photos').upload(originalPath, profilePhoto, {upsert:true,contentType:profilePhoto.type});
    if (originalError) throw originalError;
    const { error: blurredError } = await supabase.storage.from('dating-profile-photos').upload(blurredPath, blurredFile, {upsert:true,contentType:'image/webp'});
    if (blurredError) throw blurredError;
    return {photo_path:originalPath,blurred_photo_path:blurredPath};
  }

  async function countryHasStates(countryName: string) {
    if (!countryName) return false;
    const geo = await import('country-state-city');
    const country = geo.Country.getAllCountries().find(item => item.name === countryName || item.isoCode === countryName);
    return geo.State.getStatesOfCountry(country?.isoCode || countryName).length > 0;
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
    if (publishNow && !location.country) { setNotice('Choose your country before publishing Dating.'); return; }
    if (publishNow && await countryHasStates(location.country) && !location.state) { setNotice('Choose your state or province before publishing Dating.'); return; }
    if (publishNow && (!location.city || !location.area)) { setNotice('Choose your city and area before publishing Dating.'); return; }
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
        location: [location.area || location.city,location.state,location.country].filter(Boolean).join(', '),
        country: location.country || null,
        state_province: location.state || null,
        relationship_goal: relationshipGoal,
        gender_preferences: genderPreferences,
        preferred_age_min: Number(preferredAgeMin) || 18,
        preferred_age_max: Math.max(Number(preferredAgeMin) || 18, Number(preferredAgeMax) || 45),
        long_distance_ok: longDistanceOk,
        communication_style: communicationStyle || null,
        relationship_values: relationshipValues,
        ideal_weekend: idealWeekend || null,
        conversation_topic: conversationTopic.trim() || null,
        smile_prompt: smilePrompt.trim() || null,
        looking_for: lookingFor,
        interests,
        personality: personalityTags,
        personality_tags: personalityTags,
        sexual_experience: sexualExperience || null,
        searcher_experience: searcherExperience.trim() || null,
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
      if(photoPreview.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
      setPhotoPreview('');
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
    if (!supabase || datingDecisionLocks.current[matchId]) return;
    datingDecisionLocks.current[matchId] = true;
    setBusy(true); setNotice('');
    try {
      const { data, error } = await supabase.rpc('decide_dating_match_secure', { p_match_id: matchId, p_decision: 'continue' });
      if (error) throw error;
      const result = data as {status?:string}|null;
      setNotice(result?.status === 'matched' ? 'Both people confirmed. Dating photos are now revealed.' : 'Your confirmation is saved. The other person must also confirm to reveal photos.');
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not confirm this dating match. Please try again.');
    } finally {
      delete datingDecisionLocks.current[matchId];
      setBusy(false);
    }
  }

  async function blockDatingProfile(profile: DatingProfileRow) {
    if (!supabase || profile.user_id === userId || busy) return;
    if (!window.confirm('Block this person? They will no longer be able to contact you, and you will no longer see their Dating profile.')) return;
    setBusy(true); setNotice('');
    try {
      const { error } = await supabase.rpc('block_user_secure', { p_user_id: profile.user_id });
      if (error) throw error;
      setDirectory(current => current.filter(item => item.user_id !== profile.user_id));
      setSentRequests(current => { const next = {...current}; delete next[profile.user_id]; return next; });
      setOpenProfile(null);
      setNotice('This person has been blocked.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not block this person. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function requestChat(profile: DatingProfileRow) {
    if (!supabase || profile.user_id === userId || datingRequestLocks.current[profile.user_id]) return;
    const previous = sentRequests[profile.user_id];
    if (previous && ['pending','accepted'].includes(previous.status)) {
      setNotice(previous.status === 'accepted' ? 'You already have an accepted conversation with this person.' : 'Your message request is already waiting for a response.');
      return;
    }
    datingRequestLocks.current[profile.user_id] = true;
    setBusy(true); setNotice('');
    try {
      const { data, error } = await supabase.rpc('request_dating_match_secure', { p_recipient_id: profile.user_id });
      if (error) throw error;
      const result = data as {status?:string;request_id?:string;thread_id?:string}|null;
      setNotice(result?.status === 'matched' ? 'It is a mutual match 💗. Your free 72-hour Dating chat is ready.' : 'Dating message request sent. You can track it in Messages.');
      await load();
      if (result?.status === 'matched') onOpenMessages();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not send this dating request. Please try again.');
    } finally {
      delete datingRequestLocks.current[profile.user_id];
      setBusy(false);
    }
  }

  function genderPreferenceMatches(preferences: string[] | undefined, gender: string) {
    if (!preferences?.length || preferences.includes('Everyone')) return true;
    const value = (gender || '').toLowerCase().replaceAll('-', ' ').trim();
    return preferences.some(preference => {
      const target = preference.toLowerCase();
      if (target === 'women') return ['woman','women','female'].includes(value);
      if (target === 'men') return ['man','men','male'].includes(value);
      if (target === 'non-binary people') return ['non binary','nonbinary'].includes(value);
      return target === value;
    });
  }

  const effectiveAge = ageFromDate(dateOfBirth) ?? mainProfile.age;

  const filteredDirectory = directory.filter(profile => {
    const place = locationDetails[profile.user_id];
    const row = profile as DatingProfileRow & {relationship_goal?:string;looking_for?:string[];personality_tags?:string[];children?:string;smoking?:string;drinking?:string};
    // Dating discovery is adults-only: never expose profiles with a missing or under-18 age.
    if (profile.age == null || profile.age < 18) return false;
    if (profile.age < (Number(preferredAgeMin) || 18) || profile.age > (Number(preferredAgeMax) || 120)) return false;
    if (effectiveAge != null && (effectiveAge < (profile.preferred_age_min ?? 18) || effectiveAge > (profile.preferred_age_max ?? 120))) return false;
    if (!genderPreferenceMatches(genderPreferences, profile.gender || '')) return false;
    if (!genderPreferenceMatches(profile.gender_preferences, mainProfile.gender || '')) return false;
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
      const { data } = await supabase.storage.from('dating-profile-photos').createSignedUrl(row.blurred_photo_path, 10 * 60);
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

  const formSteps = ['Your introduction','Connection goals','Age & distance','Personality & lifestyle','Interests','Relationship values','Conversation starters','Sexual experience','Searcher experience','Photos & publish'];
  const currentPhotoLabel = profilePhoto ? profilePhoto.name : photoPath ? 'Dating photo saved' : 'Add a dating photo';

  return <div className="dating-page">
    <div className="dating-toolbar dating-toolbar-stacked">
      <button type="button" className="secondary-button dating-filter-button" aria-expanded={filtersOpen} onClick={() => { setFiltersOpen(open => !open); if (!filtersOpen) setRegisterOpen(false); }}>{filtersOpen ? 'Close Filter ×' : 'Filter'}</button>
      <button type="button" className="primary-button dating-create-button" aria-expanded={registerOpen || basicProfileOpen} onClick={() => { if (basicProfileOpen) { setBasicProfileOpen(false); return; } if (registerOpen) { setRegisterOpen(false); return; } setFiltersOpen(false); const complete=Boolean(dateOfBirth && location.country && (!locationHasStates || location.state) && location.city && location.area && effectiveAge != null && effectiveAge >= 18); if (!complete) setBasicProfileOpen(true); else { setFormStep(0); setRegisterOpen(true); } }}>
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
      <label>Date of birth<input type="date" value={dateOfBirth} max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,10)} onChange={e=>setDateOfBirth(e.target.value)} required /></label>
      <p className="dating-basic-age">Age: <strong>{effectiveAge == null ? 'Choose your date of birth' : effectiveAge + ' years'}</strong> · 18+ only.</p>
      <LocationFields value={location} onChange={setLocation} required />
      <label className="dating-address-field">Address <span>(optional)</span><input type="text" value={optionalAddress} onChange={e=>setOptionalAddress(e.target.value)} maxLength={180} placeholder="Street or address (optional)" autoComplete="street-address" /></label>
      {notice && <div className="notice dating-basic-notice">{notice}</div>}
      <div className="dating-basic-actions"><button type="button" className="secondary-button" onClick={()=>setBasicProfileOpen(false)}>Cancel</button><button type="button" className="primary-button" disabled={busy} onClick={async()=>{
        const age=ageFromDate(dateOfBirth);
        if(!dateOfBirth || age===null){setNotice('Choose your date of birth to continue.');return;}
        if(age<18){setNotice('Dating is only available to adults aged 18 and over.');return;}
        if(!location.country){setNotice('Choose your country to continue.');return;}
        if(await countryHasStates(location.country) && !location.state){setNotice('Choose your state or province to continue.');return;}
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
          <div className="dating-account-summary"><div><span>Name</span><strong>{mainProfile.name || 'Panda'}</strong></div><div><span>Age</span><strong>{effectiveAge == null ? '—' : effectiveAge}</strong></div><div><span>Location</span><strong>{[location.area || location.city,location.state,location.country].filter(Boolean).join(', ') || '—'}</strong></div></div>
          <label>Profile headline<input value={headline} onChange={e=>setHeadline(e.target.value)} maxLength={120} required placeholder="A little about the kind of person you are…" /></label>
          <label>About me<textarea value={about} onChange={e=>setAbout(e.target.value)} maxLength={2500} rows={3} placeholder="What would you like someone to know about you?" /></label>
        </section>}
        {formStep === 1 && <section className="dating-form-step">
          <h3>Who would you like to meet?</h3><p>Choose the kind of connection you want. You can update this later.</p>
          <label>Interested in <ChoiceChips values={['Women','Men','Non-binary people','Everyone']} selected={genderPreferences} onToggle={value=>toggleChoice(genderPreferences,value,setGenderPreferences)} /></label>
          <label>Relationship goal <SingleChoices values={relationshipOptions} value={relationshipGoal} onChange={setRelationshipGoal} /></label>
        </section>}
        {formStep === 2 && <section className="dating-form-step">
          <h3>Your age & distance preferences</h3><p>Only adults aged 18 and older can appear in Dating.</p>
          <div className="dating-age-range"><label>Minimum age<select value={preferredAgeMin} onChange={e=>{setPreferredAgeMin(e.target.value);if(Number(e.target.value)>Number(preferredAgeMax))setPreferredAgeMax(e.target.value);}}>{Array.from({length:83},(_,i)=>i+18).map(age=><option key={age} value={age}>{age}</option>)}</select></label><label>Maximum age<select value={preferredAgeMax} onChange={e=>setPreferredAgeMax(e.target.value)}>{Array.from({length:103},(_,i)=>i+18).map(age=><option key={age} value={age}>{age}</option>)}</select></label></div>
          <label className="dating-inline-check"><input type="checkbox" checked={longDistanceOk} onChange={e=>setLongDistanceOk(e.target.checked)} /> I am open to long-distance relationships</label>
        </section>}
        {formStep === 3 && <section className="dating-form-step dating-personality-lifestyle-step">
          <h3>Your personality & lifestyle</h3><p>Choose the traits that feel like you. Lifestyle answers are optional.</p>
          <div className="dating-personality-lifestyle-grid">
            <div className="dating-personality-panel"><label>Personality</label><ChoiceChips values={personalityOptions} selected={personalityTags} onToggle={value=>toggleChoice(personalityTags,value,setPersonalityTags)} /></div>
            <div className="dating-lifestyle-panel">
              <label>Smoking <SingleChoices values={smokingOptions} value={smoking} onChange={setSmoking} /></label>
              <label>Drinking <SingleChoices values={drinkingOptions} value={drinking} onChange={setDrinking} /></label>
              <label>Children <SingleChoices values={childrenOptions} value={children} onChange={setChildren} /></label>
              <label>Occupation (optional)<input value={occupation} onChange={e=>setOccupation(e.target.value)} maxLength={120} placeholder="What you do" /></label>
            </div>
          </div>
        </section>}
        {formStep === 4 && <section className="dating-form-step">
          <h3>Your interests</h3><p>What do you enjoy doing or talking about?</p>
          <ChoiceChips values={interestOptions} selected={interests} onToggle={value=>toggleChoice(interests,value,setInterests)} />
        </section>}
        {formStep === 5 && <section className="dating-form-step">
          <h3>What matters to you?</h3><p>Choose the values you most want in a relationship.</p>
          <ChoiceChips values={['Trust','Communication','Loyalty','Affection','Shared goals','Personal space']} selected={relationshipValues} onToggle={value=>toggleChoice(relationshipValues,value,setRelationshipValues)} />
          <label>How do you prefer to communicate? <SingleChoices values={['Frequent messages','Calls & voice notes','Face-to-face','A mix']} value={communicationStyle} onChange={setCommunicationStyle} /></label>
        </section>}
        {formStep === 6 && <section className="dating-form-step">
          <h3>Conversation starters</h3><p>Optional answers that help someone start a meaningful conversation with you.</p>
          <label>My ideal weekend<select value={idealWeekend} onChange={e=>setIdealWeekend(e.target.value)}><option value="">Choose (optional)</option><option>Relaxing at home</option><option>Going out and exploring</option><option>Time with friends</option><option>Family time</option><option>Something spontaneous</option></select></label>
          <label>Something I could talk about for hours<input value={conversationTopic} onChange={e=>setConversationTopic(e.target.value)} maxLength={180} placeholder="Music, travel, football, books…" /></label>
          <label>One thing that makes me smile<input value={smilePrompt} onChange={e=>setSmilePrompt(e.target.value)} maxLength={180} placeholder="A little thing that makes your day" /></label>
        </section>}
        {formStep === 7 && <section className="dating-form-step">
          <h3>Sexual Experience</h3><p>This is optional. Share only what you feel comfortable including in your dating profile.</p>
          <SingleChoices values={['No experience','A little experience','Some experience','Experienced','Prefer not to say']} value={sexualExperience} onChange={setSexualExperience} />
        </section>}
        {formStep === 8 && <section className="dating-form-step">
          <h3>Searcher Experience</h3><p>Optional: share what you have learned from dating or what would help you feel comfortable meeting someone new.</p>
          <label>Your dating experience<textarea value={searcherExperience} onChange={e=>setSearcherExperience(e.target.value)} maxLength={1200} rows={4} placeholder="Share only what you feel comfortable sharing…" /></label>
        </section>}
        {formStep === 9 && <section className="dating-form-step dating-photo-step">
          <h3>Photos & publish</h3><p>Add a dating photo, preview your profile, then publish when you are ready.</p>
          <div className="dating-photo-preview">{profilePhoto && photoPreview ? <img src={photoPreview} alt="Dating photo preview" /> : photoPath ? <span>✓</span> : <span>🐼</span>}</div>
          <label className="photo-upload-label">Dating photo (optional)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{
            const file=e.currentTarget.files?.[0] || null;
            if(!file){if(photoPreview.startsWith('blob:'))URL.revokeObjectURL(photoPreview);setProfilePhoto(null);setPhotoPreview('');return;}
            if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setNotice('Choose a JPG, PNG or WebP image.');e.currentTarget.value='';return;}
            if(file.size>5*1024*1024){setNotice('Choose an image no larger than 5 MB.');e.currentTarget.value='';return;}
            setNotice(''); setProfilePhoto(file);
          }} /></label>
          <p className="draft-state">{currentPhotoLabel}</p>
          <div className="dating-preview-summary"><strong>{mainProfile.name || 'Panda'} · {effectiveAge ?? 'Age not set'}</strong><span>{headline || 'Your headline will appear here'}</span><span>{relationshipGoal}</span></div>
        </section>}
        {notice && <div className="notice dating-step-notice">{notice}</div>}
        <div className="form-submit-row dating-form-actions">
          <button className="secondary-button" type="button" disabled={formStep===0 || busy} onClick={()=>setFormStep(step=>Math.max(0,step-1))}>Back</button>
          {formStep < formSteps.length-1
            ? <button className="primary-button" type="button" disabled={busy} onClick={async()=>{
                if(formStep===2 && Number(preferredAgeMax)<Number(preferredAgeMin)){setNotice('Maximum age must be at least the minimum age.');return;}
                 if(formStep===0){
                  const age=ageFromDate(dateOfBirth);
                  if(!dateOfBirth || age===null){setNotice('Add your date of birth to continue.');return;}
                  if(age<18){setNotice('Dating is only available to adults aged 18 and over.');return;}
                  if(!location.country){setNotice('Choose your country to continue.');return;}
                  if(await countryHasStates(location.country) && !location.state){setNotice('Choose your state or province to continue.');return;}
                  if(!location.city){setNotice('Choose your city to continue.');return;}
                  if(!location.area){setNotice('Choose your area or neighbourhood to continue.');return;}
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
    {published && <section className="directory-section dating-discovery-section">
      <div className="section-title-row"><div><h2>People you may connect with</h2><p>Open a profile to learn more, then send a request if you would like to talk.</p></div><span className="count-pill">{filteredDirectory.length} PEOPLE</span></div>
      {loading ? <div className="empty-state">Loading dating profiles…</div> : filteredDirectory.length ? <div className="dating-directory">{filteredDirectory.map(profile => {
        const request = sentRequests[profile.user_id];
        const alreadyRequested = Boolean(request && ['pending','accepted'].includes(request.status));
        return <article className="dating-card dating-discovery-card" key={profile.id}>
          <button type="button" className="dating-discovery-open" onClick={()=>void viewDatingProfile(profile)} aria-label={'View profile for '+(names[profile.user_id] || 'Panda')}>
            <div className="dating-card-top"><div className={`dating-avatar${vipDirectoryIds.has(profile.user_id) ? ` vip-avatar-frame ${getWeeklyVipAuraClass()}` : ''}`}>🐼</div><div><strong>{names[profile.user_id] || 'Panda'}{profile.age ? ' · '+profile.age : ''} {vipDirectoryIds.has(profile.user_id) && <span className="vip-member-label">VIP</span>}</strong><p>{locations[profile.user_id] || 'Location not added'}</p></div></div>
            <h3>{profile.headline || 'Getting to know someone new'}</h3>
            <p className="dating-about">{profile.about || 'This Panda is looking forward to meeting someone.'}</p>
            <div className="dating-card-bottom"><span>{profile.relationship_goal || 'Open to connection'}</span><span>{(profile.personality_tags || profile.personality || []).slice(0,2).join(' · ')}</span></div>
          </button>
          <div className="dating-discovery-actions"><button type="button" className="secondary-button" onClick={()=>void viewDatingProfile(profile)}>View profile</button><button type="button" className="primary-button" disabled={busy || alreadyRequested} onClick={()=>void requestChat(profile)}>{request?.status === 'accepted' ? 'Request accepted' : request?.status === 'pending' ? 'Request sent' : 'Send message request'}</button></div>
        </article>;
      })}</div> : <div className="empty-state compact"><span>♡</span><h3>No profiles match yet</h3><p>Try changing your filters, or check back as more people publish their dating profiles.</p></div>}
    </section>}
    {datingMatches.length > 0 && <section className="directory-section dating-connections-section">
      <div className="section-title-row"><div><h2>Your Dating connections</h2><p>Dating chats are free for the first {datingFreeHours} hours. After that, each message costs {datingMessageCost} BC (VIP members message free). After the free period, both people must separately confirm before dating photos are revealed.</p></div><span className="count-pill">{datingMatches.length} MATCHES</span></div>
      <div className="dating-directory">{datingMatches.map(match => {
        const otherId = match.user_a === userId ? match.user_b : match.user_a;
        const person = matchPeople[otherId];
        const remaining = Math.max(0,new Date(match.free_until).getTime()-clock);
        const hours = Math.floor(remaining/3600000);
        const minutes = Math.floor((remaining%3600000)/60000);
        const seconds = Math.floor((remaining%60000)/1000);
        return <article className="dating-card dating-match-card" key={match.id}>
          <div className="dating-card-top"><div className="dating-avatar">💗</div><div><strong>{person?.name || 'Your match'}</strong><p>{match.photos_revealed ? 'Photos revealed' : remaining > 0 ? `Free Dating chat active · ${datingFreeHours} hours total` : 'Waiting for mutual confirmation'}</p></div></div>
          {person?.photoUrl ? <img className="dating-match-photo" src={person.photoUrl} alt={match.photos_revealed ? 'Dating match photo' : 'Blurred dating photo'} /> : <div className="dating-photo-preview match-photo-placeholder">🐼</div>}
          {person?.headline && <p className="dating-about">{person.headline}</p>}
          {remaining > 0 ? <p className="dating-match-countdown">Free chat · {String(hours).padStart(2,'0')}:{String(minutes).padStart(2,'0')}:{String(seconds).padStart(2,'0')} remaining</p>
            : match.photos_revealed ? <p className="published-state">● Both people continued. Photos are revealed.</p>
            : match.my_confirmed ? <p className="draft-state">Your confirmation is saved. Waiting for the other person to confirm before photos are revealed.</p>
            : <><p className="draft-state">The free period has ended. Each message costs {datingMessageCost} BC (VIP members message free). Confirm if you want to continue and reveal photos when both people agree.</p><button className="primary-button" disabled={busy} onClick={()=>void confirmDatingMatch(match.id)}>Confirm & reveal photos ↗</button></>}
          <button className="secondary-button" type="button" onClick={onOpenMessages}>Open chat in Messages ↗</button>
        </article>;
      })}</div>
    </section>}
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
            <div><span>Relationship values</span><strong>{(openProfile.relationship_values || []).join(', ') || 'Not specified'}</strong></div>
            <div><span>Communication style</span><strong>{openProfile.communication_style || 'Not specified'}</strong></div>
            <div><span>Ideal weekend</span><strong>{openProfile.ideal_weekend || 'Not specified'}</strong></div>
            {openProfile.conversation_topic && <div><span>Could talk about for hours</span><strong>{openProfile.conversation_topic}</strong></div>}
            {openProfile.smile_prompt && <div><span>Something that makes me smile</span><strong>{openProfile.smile_prompt}</strong></div>}
            <div><span>Preferred age range</span><strong>{openProfile.preferred_age_min || 18}–{openProfile.preferred_age_max || 45}</strong></div>
          </div>
          <button type="button" className="secondary-button" onClick={()=>setProfileDetailPage(0)}>← Back to overview</button>
          <button type="button" className="primary-button" disabled={busy || Boolean(sentRequests[openProfile.user_id] && ['pending','accepted'].includes(sentRequests[openProfile.user_id].status))} onClick={()=>{const selected=openProfile;setOpenProfile(null);void requestChat(selected);}}>Send message request ↗</button>
          <button type="button" className="decline-button dating-block-action" disabled={busy} onClick={()=>void blockDatingProfile(openProfile)}>Block this person</button>
        </div>}
      </section>
    </div>}
  </div>;
}

function EventsFeature({ userId }: { userId: string }) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterLocation, setFilterLocation] = useState<LocationValue>({ country: '', state: '', city: '', area: '' });
  const [eventCategory, setEventCategory] = useState('Other');
  const eventCategories = ['Music','Business','Education','Technology','Arts & Culture','Food & Drink','Sports & Fitness','Community','Faith & Spirituality','Travel','Other'];
  const [names, setNames] = useState<Record<string, string>>({});
  const [vipEventCreatorIds, setVipEventCreatorIds] = useState<Set<string>>(() => new Set());
  const [attending, setAttending] = useState<Record<string, boolean>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [venue, setVenue] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState('');
  const [location, setLocation] = useState<LocationValue>({ country: '', state: '', city: '', area: '' });
  const [startsAt, setStartsAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [publishedOnce, setPublishedOnce] = useState(false);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [promotionStatus, setPromotionStatus] = useState<{eligible:boolean;base_reach:number;notification_cap:number;is_vip:boolean}|null>(null);
  const [blastPlans, setBlastPlans] = useState<EventBlastPlan[]>([]);
  const [blastEvent, setBlastEvent] = useState<EventRow | null>(null);
  const [blastScope, setBlastScope] = useState<'worldwide'|'country'|'state'|'city'|'area'>('worldwide');
  const [blastLocation, setBlastLocation] = useState<LocationValue>({country:'',state:'',city:'',area:''});
  const [blastBusy, setBlastBusy] = useState(false);

  async function load() {
    if (!supabase) return;
    const [promotionResult, planResult] = await Promise.all([
      supabase.rpc('get_event_promotion_status_secure'),
      supabase.rpc('get_event_blast_plans'),
    ]);
    if (!promotionResult.error && promotionResult.data) setPromotionStatus(promotionResult.data as {eligible:boolean;base_reach:number;notification_cap:number;is_vip:boolean});
    if (!planResult.error) setBlastPlans((planResult.data ?? []) as EventBlastPlan[]);
    const { data, error } = await supabase.from('events')
      .select('id,creator_id,title,description,venue,country,state,city,area,starts_at,cover_url,category,is_published')
      .eq('is_published', true).order('starts_at', { ascending: true }).limit(60);
    if (error) setNotice(error.message);
    const rows = (data ?? []) as EventRow[];
    setEvents(rows);
    const ids = rows.map(row => row.id);
    const creatorIds = [...new Set(rows.map(row => row.creator_id))];
    if (creatorIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('id,display_name,username,is_vip,vip_expires_at').in('id', creatorIds);
      const nameMap: Record<string,string> = {};
      const activeVipIds = new Set<string>();
      const vipCheckTime = Date.now();
      (profiles ?? []).forEach((p: {id:string;display_name:string|null;username:string|null;is_vip?:boolean|null;vip_expires_at?:string|null}) => {
        nameMap[p.id] = p.display_name || p.username || 'Panda';
        if (Boolean(p.is_vip) && (!p.vip_expires_at || new Date(p.vip_expires_at).getTime() > vipCheckTime)) activeVipIds.add(p.id);
      });
      setNames(nameMap); setVipEventCreatorIds(activeVipIds);
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
  useEffect(() => {
    if (!coverFile) { setCoverPreview(''); return; }
    const preview = URL.createObjectURL(coverFile);
    setCoverPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [coverFile]);

  const publishLock = useRef(false);
  const attendanceLocks = useRef<Record<string, boolean>>({});
  const messageRequestLocks = useRef<Record<string, boolean>>({});

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || publishLock.current) return;
    if (!title.trim()) { setNotice('Add an event title.'); return; }
    if (!description.trim()) { setNotice('Add event details so people know what to expect.'); return; }
    if (!location.country || !location.city) { setNotice('Choose the event country and city.'); return; }
    if (!startsAt || new Date(startsAt).getTime() <= Date.now()) { setNotice('Choose a future event date and time.'); return; }
    if (coverFile && (!['image/jpeg','image/png','image/webp'].includes(coverFile.type) || coverFile.size > 5 * 1024 * 1024)) {
      setNotice('Event cover must be a JPG, PNG or WebP image up to 5 MB.'); return;
    }
    publishLock.current = true;
    setBusy(true); setNotice('');
    let uploadedCoverPath: string | null = null;
    try {
      let coverUrl: string | null = null;
      if (coverFile) {
        const extension = coverFile.type === 'image/png' ? 'png' : coverFile.type === 'image/webp' ? 'webp' : 'jpg';
        uploadedCoverPath = `${userId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('event-covers').upload(uploadedCoverPath, coverFile, { upsert: false, contentType: coverFile.type });
        if (uploadError) throw uploadError;
        coverUrl = supabase.storage.from('event-covers').getPublicUrl(uploadedCoverPath).data.publicUrl;
      }
      const start = new Date(startsAt);
      const end = new Date(start.getTime() + 120 * 60 * 1000);
      const { error } = await supabase.rpc('create_event_secure', {
        p_title: title.trim(),
        p_description: description.trim(),
        p_location: venue.trim() || null,
        p_starts_at: start.toISOString(),
        p_ends_at: end.toISOString(),
        p_category: eventCategory,
        p_entry_fee_bc: 0,
        p_duration_minutes: 120,
        p_reach_scope: 'worldwide',
        p_reach_country: null,
        p_reach_state: null,
        p_reach_city: null,
        p_reach_area: null,
        p_entry_fee_amount: 0,
        p_entry_fee_currency: 'NGN',
        p_venue_name: venue.trim() || null,
        p_address_line: null,
        p_country: location.country,
        p_state_province: location.state || null,
        p_city: location.city,
        p_area: location.area || null,
        p_latitude: null,
        p_longitude: null,
        p_cover_url: coverUrl,
      });
      if (error) throw error;
      setTitle(''); setDescription(''); setVenue(''); setCoverFile(null); setEventCategory('Other'); setLocation({ country: '', state: '', city: '', area: '' }); setStartsAt('');
      setPublishedOnce(true); setCreateEventOpen(false); setNotice('Event published successfully.'); await load();
    } catch (error) {
      if (uploadedCoverPath) await supabase.storage.from('event-covers').remove([uploadedCoverPath]).catch(() => undefined);
      setNotice(error instanceof Error ? error.message : 'Could not publish this event. Please try again.');
    } finally {
      publishLock.current = false;
      setBusy(false);
    }
  }

  async function toggleAttendance(item: EventRow) {
    if (!supabase || item.creator_id === userId || attendanceLocks.current[item.id]) return;
    attendanceLocks.current[item.id] = true;
    setBusy(true); setNotice('');
    try {
      const { error } = await supabase.from('event_attendees').upsert({
        event_id: item.id, user_id: userId, status: attending[item.id] ? 'cancelled' : 'attending',
      }, { onConflict: 'event_id,user_id' });
      if (error) throw error;
      setNotice(attending[item.id] ? 'You are no longer attending.' : 'You are marked as attending.');
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update your attendance. Please try again.');
    } finally {
      delete attendanceLocks.current[item.id];
      setBusy(false);
    }
  }

  async function messageCreator(item: EventRow) {
    if (!supabase || item.creator_id === userId || messageRequestLocks.current[item.id]) return;
    messageRequestLocks.current[item.id] = true;
    setBusy(true); setNotice('');
    try {
      const { error } = await supabase.rpc('send_message_request', {
        p_recipient_id: item.creator_id, p_source_type: 'event', p_source_id: item.id,
        p_greeting: `Hi! I saw your event “${item.title}” and would like to ask you something.`,
      });
      if (error) throw error;
      setNotice('Message request sent to the event creator.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not send the event message request.');
    } finally {
      delete messageRequestLocks.current[item.id];
      setBusy(false);
    }
  }

  async function startFreeEventBlast() {
    if (!supabase || !blastEvent || blastBusy) return;
    if (blastEvent.creator_id !== userId) { setNotice('Only the event creator can promote this event.'); return; }
    if (blastScope !== 'worldwide' && !blastLocation.country) { setNotice('Choose a target country for this Event Blast.'); return; }
    if (['state','city','area'].includes(blastScope) && !blastLocation.state) { setNotice('Choose a target state or province.'); return; }
    if (['city','area'].includes(blastScope) && !blastLocation.city) { setNotice('Choose a target city.'); return; }
    if (blastScope === 'area' && !blastLocation.area) { setNotice('Choose a target area.'); return; }
    setBlastBusy(true); setNotice('');
    try {
      const { data, error } = await supabase.rpc('claim_free_event_promotion_secure', {
        p_event_id: blastEvent.id,
        p_target_scope: blastScope,
        p_target_country: blastScope === 'worldwide' ? null : blastLocation.country,
        p_target_state: ['state','city','area'].includes(blastScope) ? blastLocation.state : null,
        p_target_city: ['city','area'].includes(blastScope) ? blastLocation.city : null,
        p_target_area: blastScope === 'area' ? blastLocation.area : null,
      });
      if (error) throw error;
      const result = data as {unique_reach?:number;ends_at?:string}|null;
      setBlastEvent(null);
      setBlastScope('worldwide'); setBlastLocation({country:'',state:'',city:'',area:''});
      setNotice(`Your free Event Blast has started and notified ${Number(result?.unique_reach ?? 0).toLocaleString()} eligible people. It runs for 24 hours.`);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not start the Event Blast. Please try again.');
    } finally { setBlastBusy(false); }
  }

  async function startPaidEventBlast(plan: EventBlastPlan) {
    if (!supabase || !blastEvent || blastBusy) return;
    if (blastEvent.creator_id !== userId) { setNotice('Only the event creator can promote this event.'); return; }
    if (plan.bc_price == null) { setNotice('This plan has no BC price configured.'); return; }
    if (blastScope !== 'worldwide' && !blastLocation.country) { setNotice('Choose a target country for this Event Blast.'); return; }
    if (['state','city','area'].includes(blastScope) && !blastLocation.state) { setNotice('Choose a target state or province.'); return; }
    if (['city','area'].includes(blastScope) && !blastLocation.city) { setNotice('Choose a target city.'); return; }
    if (blastScope === 'area' && !blastLocation.area) { setNotice('Choose a target area.'); return; }
    setBlastBusy(true); setNotice('');
    try {
      const { data, error } = await supabase.rpc('start_event_blast_secure', {
        p_event_id: blastEvent.id,
        p_plan_id: plan.id,
        p_payment_method: 'bc',
        p_target_scope: blastScope,
        p_target_country: blastScope === 'worldwide' ? null : blastLocation.country,
        p_target_state: ['state','city','area'].includes(blastScope) ? blastLocation.state : null,
        p_target_city: ['city','area'].includes(blastScope) ? blastLocation.city : null,
        p_target_area: blastScope === 'area' ? blastLocation.area : null,
      });
      if (error) throw error;
      const result = data as {unique_reach?:number;bc_cost?:number}|null;
      setBlastEvent(null);
      setBlastScope('worldwide'); setBlastLocation({country:'',state:'',city:'',area:''});
      setNotice(`Paid Event Blast started for ${Number(result?.unique_reach ?? plan.unique_reach).toLocaleString()} eligible people. ${Number(result?.bc_cost ?? plan.bc_price).toLocaleString()} BC was charged.`);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not start the paid Event Blast. Please try again.');
    } finally { setBlastBusy(false); }
  }

  const filteredEvents = events.filter(item => {
    const haystack = `${item.title} ${item.description} ${item.venue || ''}`.toLowerCase();
    return (!searchText.trim() || haystack.includes(searchText.trim().toLowerCase()))
      && (!filterCategory || (item.category || 'Other') === filterCategory)
      && (!filterLocation.country || item.country === filterLocation.country)
      && (!filterLocation.state || (item.state || '') === filterLocation.state)
      && (!filterLocation.city || (item.city || '') === filterLocation.city)
      && (!filterLocation.area || (item.area || '') === filterLocation.area);
  });

  return <div className="events-page">
    <div className="directory-toolbar"><div><p className="eyebrow">MAKE SOMETHING HAPPEN</p><p className="feature-copy">Discover events, or create one for your community.</p></div><div className="event-toolbar-actions"><button type="button" className="secondary-button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(open => !open)}>{filtersOpen ? 'Close Filter ×' : 'Filter'}</button><button type="button" className="primary-button" onClick={() => { setNotice(''); setPublishedOnce(false); setCreateEventOpen(true); }}>＋ Create Event</button></div></div>
    {filtersOpen && <section className="feature-panel event-filter-panel"><div className="section-title-row"><div><h2>Filter events</h2><p>Search by name, category and location.</p></div><button type="button" className="secondary-button" onClick={() => { setSearchText(''); setFilterCategory(''); setFilterLocation({country:'',state:'',city:'',area:''}); }}>Clear</button></div><label>Search events<input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Event name or keyword…" /></label><label>Category<select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}><option value="">All categories</option>{eventCategories.map(category => <option key={category}>{category}</option>)}</select></label><LocationFields value={filterLocation} onChange={setFilterLocation} /></section>}
    {blastEvent && <div className="create-modal-backdrop" role="dialog" aria-modal="true" aria-label="Promote event"><section className="create-modal-card event-create-panel"><header className="create-modal-header"><div><p className="eyebrow">EVENT BLAST</p><h2>Promote {blastEvent.title}</h2></div><button type="button" className="create-modal-close" aria-label="Close Event Blast" onClick={() => setBlastEvent(null)}>×</button></header><p className="feature-copy">Send a targeted notification to people who may be interested in your event.</p><div className="event-blast-reach-card"><strong>{promotionStatus?.base_reach ?? 100} people · 24 hours</strong><span>{promotionStatus?.is_vip ? 'VIP free reach' : 'Standard free reach'} · one free Event Blast per calendar month</span></div><label>Audience<select value={blastScope} onChange={e => setBlastScope(e.target.value as typeof blastScope)}><option value="worldwide">Worldwide</option><option value="country">Country</option><option value="state">State / province</option><option value="city">City</option><option value="area">Area / local government</option></select></label>{blastScope !== 'worldwide' && <LocationFields value={blastLocation} onChange={setBlastLocation} />}<p className="draft-state">{promotionStatus?.eligible ? 'Your free Event Blast is available.' : 'Your free Event Blast has already been used this month.'} Paid blast plans can be configured by an administrator.</p><div className="form-submit-row"><button type="button" className="secondary-button" onClick={() => setBlastEvent(null)}>Cancel</button><button type="button" className="primary-button" disabled={blastBusy || !promotionStatus?.eligible} onClick={() => void startFreeEventBlast()}>{blastBusy ? 'Starting…' : 'Use free Event Blast ↗'}</button></div><div className="event-blast-plans"><h3>Paid reach plans</h3><p>Pay from your BC wallet. Prices and reach are controlled by the admin dashboard.</p>{blastPlans.length ? blastPlans.map(plan => <article className="event-blast-plan" key={plan.id}><div><strong>{plan.name}</strong><span>{plan.unique_reach.toLocaleString()} people · {Math.max(1,Math.round(plan.duration_minutes/60))} hours</span></div><strong>{plan.bc_price == null ? 'Price not set' : `${plan.bc_price.toLocaleString()} BC`}</strong><button type="button" className="secondary-button" disabled={blastBusy || plan.bc_price == null} onClick={() => void startPaidEventBlast(plan)}>{blastBusy ? 'Starting…' : 'Promote'}</button></article>) : <p className="draft-state">No paid plans are available yet. Ask an administrator to configure them.</p>}</div></section></div>}
    {createEventOpen && <div className="create-modal-backdrop" role="dialog" aria-modal="true" aria-label="Create an event"><section className="create-modal-card event-create-panel"><header className="create-modal-header"><div><p className="eyebrow">MAKE SOMETHING HAPPEN</p><h2>Publish an event</h2></div><button type="button" className="create-modal-close" aria-label="Close create event" onClick={() => setCreateEventOpen(false)}>×</button></header><p className="feature-copy">Create a real plan for your community. Your event is published once the form succeeds.</p>
      <form className="feature-form" onSubmit={publish}>
        <label>Event title<input value={title} onChange={e => { setTitle(e.target.value); setPublishedOnce(false); }} maxLength={160} required placeholder="What are we getting together for?" /></label>
        <label>Description<textarea value={description} onChange={e => { setDescription(e.target.value); setPublishedOnce(false); }} rows={3} maxLength={4000} required placeholder="Tell people what to expect…" /></label>
        <label>Category<select value={eventCategory} onChange={e => setEventCategory(e.target.value)}>{eventCategories.map(category => <option key={category}>{category}</option>)}</select></label>
        <label>Venue or meeting point<input value={venue} onChange={e => { setVenue(e.target.value); setPublishedOnce(false); }} maxLength={250} placeholder="Venue, online or meeting point" /></label>
        <label className="event-cover-upload">Event cover image <span>(optional · JPG, PNG or WebP · up to 5 MB)</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.currentTarget.files?.[0] || null; setCoverFile(file); setPublishedOnce(false); if (file && (file.size > 5 * 1024 * 1024 || !['image/jpeg','image/png','image/webp'].includes(file.type))) setNotice('Choose a JPG, PNG or WebP image up to 5 MB.'); else setNotice(''); }} /></label>
        {coverPreview && <img className="event-cover-preview" src={coverPreview} alt="Event cover preview" />}
        <LocationFields value={location} onChange={value => { setLocation(value); setPublishedOnce(false); }} required /><label>Date and time<input type="datetime-local" value={startsAt} onChange={e => { setStartsAt(e.target.value); setPublishedOnce(false); }} required /></label>
        <div className="form-submit-row"><span className="draft-state">Optional cover image · event details save to your community</span><button className="primary-button" type="submit" disabled={busy || publishedOnce}>{busy ? 'Publishing…' : publishedOnce ? 'Event published ✓' : 'Publish event ↗'}</button></div>
      </form>
      {notice && <div className="notice">{notice}</div>}
    </section></div>}
    <section className="directory-section"><div className="section-title-row"><div><h2>Events in your circle</h2><p>Published events and the people bringing them together.</p></div><span className="count-pill">{filteredEvents.length} EVENTS</span></div>
      {loading ? <div className="empty-state">Loading events…</div> : filteredEvents.length ? <div className="event-directory">{filteredEvents.map(item => <article className="event-card" key={item.id}>{item.cover_url && <img className="event-card-cover" src={item.cover_url} alt="" loading="lazy" />}<div className="event-date-block"><span>{new Date(item.starts_at).toLocaleDateString([], {month:'short'}).toUpperCase()}</span><strong>{new Date(item.starts_at).getDate()}</strong><small>{new Date(item.starts_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></div><div className="event-card-body"><div className="event-creator">{vipEventCreatorIds.has(item.creator_id) && <span className={`public-vip-panda ${getWeeklyVipAuraClass()}`} aria-label="VIP host">🐼</span>} HOSTED BY {names[item.creator_id] || 'PANDA'} {vipEventCreatorIds.has(item.creator_id) && <span className="vip-member-label">VIP</span>}</div><h3>{item.title}</h3><p>{item.description || 'Join the community for this event.'}</p><div className="event-meta"><span>⌖ {[item.venue,item.area,item.city,item.state,item.country].filter(Boolean).join(' · ') || 'Location to be announced'}</span><strong className="event-attending-count">ATTENDING {counts[item.id] || 0} 👤</strong></div><div className="event-card-actions">{item.creator_id === userId ? <div className="event-owner-actions"><span className="published-state">● Your event</span><button type="button" className="secondary-button" disabled={blastBusy} onClick={() => { setNotice(''); setBlastEvent(item); setBlastScope('worldwide'); setBlastLocation({country:'',state:'',city:'',area:''}); }}>Promote event ↗</button></div> : <><button className="primary-button" disabled={busy} onClick={() => void toggleAttendance(item)}>{attending[item.id] ? '✓ Attending' : 'I’m attending'}</button><button className="decline-button" disabled={busy} onClick={() => void messageCreator(item)}>Message creator ↗</button></>}</div></div></article>)}</div> : <div className="empty-state"><span>▦</span><h3>{events.length ? 'No events match these filters.' : 'There is room for your first event.'}</h3><p>{events.length ? 'Try a different keyword, category or location.' : 'Publish an event above and it will appear here for your community.'}</p></div>}
    </section>
  </div>;
}


function PandaCoinArtwork() {
  return <img className="panda-coin-engraving" src="/bc-panda-coin.svg" alt="Gold Circle Panda BC coin" draggable={false} />;
}
function WalletPandaCoin() { return <span className="wallet-store-coin-token"><PandaCoinArtwork /></span>; }



type ProfileEditRow = { id:string; username:string|null; display_name:string|null; avatar_url:string|null; country:string|null; state:string|null; area:string|null; date_of_birth:string|null; gender:string|null; bio:string|null; address_line:string|null; is_vip:boolean|null; vip_expires_at:string|null };
function ProfileFeature({ userId }: { userId:string }) {
  const [profile,setProfile] = useState<ProfileEditRow|null>(null);
  const [draft,setDraft] = useState({username:'',display_name:'',country:'',state:'',area:'',date_of_birth:'',gender:'',bio:'',address_line:''});
  const [admin,setAdmin] = useState(false);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [notice,setNotice] = useState('');
  async function load() {
    if(!supabase) return;
    setLoading(true);
    const [p,r] = await Promise.all([
      supabase.from('profiles').select('id,username,display_name,avatar_url,country,state,area,date_of_birth,gender,bio,address_line,is_vip,vip_expires_at').eq('id',userId).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id',userId).eq('role','admin').maybeSingle(),
    ]);
    if(p.error) setNotice(p.error.message);
    if(p.data) {
      const row=p.data as ProfileEditRow; setProfile(row);
      setDraft({username:row.username||'',display_name:row.display_name||'',country:row.country||'',state:row.state||'',area:row.area||'',date_of_birth:row.date_of_birth||'',gender:row.gender||'',bio:row.bio||'',address_line:row.address_line||''});
    }
    setAdmin(Boolean(r.data)); setLoading(false);
  }
  useEffect(()=>{void load();},[userId]);
  async function save(e:FormEvent<HTMLFormElement>) {
    e.preventDefault(); if(!supabase||saving) return;
    if(draft.username.trim().length>30 || draft.bio.length>500) {setNotice('Username must be 30 characters or fewer and bio must be 500 characters or fewer.');return;}
    setSaving(true);setNotice('');
    const payload={id:userId,username:draft.username.trim()||null,display_name:draft.display_name.trim()||null,country:draft.country.trim()||null,state:draft.state.trim()||null,area:draft.area.trim()||null,date_of_birth:draft.date_of_birth||null,gender:draft.gender||null,bio:draft.bio.trim()||null,address_line:draft.address_line.trim()||null,updated_at:new Date().toISOString()};
    const {error}=await supabase.from('profiles').upsert(payload,{onConflict:'id'});
    if(error) setNotice(error.message); else {setNotice('Profile saved. Your changes are stored in Circle Panda.');await load();}
    setSaving(false);
  }
  const activeVip=admin || Boolean(profile?.is_vip && (!profile.vip_expires_at || new Date(profile.vip_expires_at).getTime()>Date.now()));
  return <section className="feature-panel profile-feature-panel">
    <div className="feature-icon">🐼</div><p className="eyebrow">YOUR CIRCLE PANDA IDENTITY</p><h2>Your profile</h2>
    <p className="feature-copy">Keep your profile details current. These details can be reused across dating, groups and events. Coin purchases are available only in Wallet.</p>
    {loading ? <div className="empty-state">Loading your profile…</div> : <>
      <div className="profile-summary-card"><div className={activeVip?'post-avatar vip-avatar-frame '+getWeeklyVipAuraClass():'post-avatar'}>🐼</div><div><strong>{draft.display_name||draft.username||'Circle Panda member'}</strong><p>@{draft.username||'choose-a-username'}</p><span className={activeVip?'vip-member-label':''}>{admin?'ADMIN · UNLIMITED BC':activeVip?'VIP MEMBER':'STANDARD MEMBER'}</span></div></div>
      <form className="profile-edit-form" onSubmit={save}>
        <label>Display name<input value={draft.display_name} maxLength={80} onChange={e=>setDraft(v=>({...v,display_name:e.target.value}))} placeholder="How people see you"/></label>
        <label>Username<input value={draft.username} maxLength={30} onChange={e=>setDraft(v=>({...v,username:e.target.value}))} placeholder="Choose a username"/></label>
        <label>Date of birth<input type="date" value={draft.date_of_birth} max={new Date().toISOString().slice(0,10)} onChange={e=>setDraft(v=>({...v,date_of_birth:e.target.value}))}/></label>
        <label>Gender<select value={draft.gender} onChange={e=>setDraft(v=>({...v,gender:e.target.value}))}><option value="">Prefer not to say</option><option value="woman">Woman</option><option value="man">Man</option><option value="non_binary">Non-binary</option><option value="other">Other</option></select></label>
        <label>Country<input value={draft.country} maxLength={100} onChange={e=>setDraft(v=>({...v,country:e.target.value}))} placeholder="Country"/></label>
        <label>State / province<input value={draft.state} maxLength={100} onChange={e=>setDraft(v=>({...v,state:e.target.value}))} placeholder="State or province"/></label>
        <label>Area / city<input value={draft.area} maxLength={100} onChange={e=>setDraft(v=>({...v,area:e.target.value}))} placeholder="Area or city"/></label>
        <label>Address (optional)<input value={draft.address_line} maxLength={250} onChange={e=>setDraft(v=>({...v,address_line:e.target.value}))} placeholder="Optional address"/></label>
        <label className="profile-bio-field">About you<textarea value={draft.bio} maxLength={500} rows={4} onChange={e=>setDraft(v=>({...v,bio:e.target.value}))} placeholder="A little about yourself…"/></label>
        {notice&&<div className="notice inline-notice">{notice}</div>}
        <div className="profile-form-actions"><button type="submit" className="primary-button" disabled={saving}>{saving?'Saving profile…':'Save profile'}</button><button type="button" className="secondary-button" onClick={()=>void load()} disabled={saving}>Reset changes</button></div>
      </form>
    </>}
  </section>;
}

function WalletFeature({ userId }: { userId: string }) {
  const [bcBalance, setBcBalance] = useState(0);
  const [isAdminUnlimited, setIsAdminUnlimited] = useState(false);
  const [wcBalance, setWcBalance] = useState(0);
  const [xpTotal, setXpTotal] = useState(0);
  const [levelName, setLevelName] = useState('Novice');
  const [transactions, setTransactions] = useState<WalletTransactionRow[]>([]);
  const [coinPackages, setCoinPackages] = useState<CoinPackage[]>([]);
  const [settings, setSettings] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [walletScreen, setWalletScreen] = useState<'overview' | 'buy'>('overview');
  const [selectedPackage, setSelectedPackage] = useState('1200');

  async function load() {
    if (!supabase) return;
    const [walletResult, xpResult, transactionResult, settingsResult, argumentsResult, adminResult] = await Promise.all([
      supabase.from('wallet_accounts').select('bc_balance,wc_balance').eq('user_id', userId).maybeSingle(),
      supabase.from('user_xp').select('xp_total,level_name').eq('user_id', userId).maybeSingle(),
      supabase.from('wallet_transactions').select('id,currency,amount,reason,created_at').eq('user_id', userId).order('created_at', {ascending:false}).limit(20),
      supabase.from('economy_settings').select('setting_key,numeric_value'),
      supabase.rpc('get_coin_packages'),
      supabase.from('user_roles').select('role').eq('user_id',userId).eq('role','admin').maybeSingle(),
    ]);
    const adminUnlimited = Boolean(adminResult.data);
    setIsAdminUnlimited(adminUnlimited);
    if (walletResult.data) { setBcBalance(adminUnlimited ? 0 : Number(walletResult.data.bc_balance)); setWcBalance(Number(walletResult.data.wc_balance)); }
    if (xpResult.data) { setXpTotal(Number(xpResult.data.xp_total)); setLevelName(xpResult.data.level_name); }
    setTransactions((transactionResult.data ?? []) as WalletTransactionRow[]);
    const map: Record<string,number> = {};
    (settingsResult.data ?? []).forEach((s: {setting_key:string;numeric_value:number}) => { map[s.setting_key] = Number(s.numeric_value); });
    setSettings(map);
    setCoinPackages((argumentsResult.data ?? []) as CoinPackage[]);
    const error = walletResult.error || xpResult.error || transactionResult.error || settingsResult.error || argumentsResult.error || adminResult.error;
    if (error) setNotice(error.message);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [userId]);
  const chosenCoinPackage = coinPackages.find(pack => pack.id === selectedPackage);

  async function startCoinPurchase() {
    if (!supabase || busy) return;
    if (!chosenCoinPackage) { setNotice('Choose a coin package first.'); return; }
    if (chosenCoinPackage.price_ngn == null || Number(chosenCoinPackage.price_ngn) <= 0) {
      setNotice('This package has no NGN price configured yet. An administrator must set the package price first.');
      return;
    }
    setBusy(true); setNotice('');
    try {
      const { data, error } = await supabase.functions.invoke('initialize-coin-purchase', { body: { package_id: chosenCoinPackage.id } });
      if (error) {
        const response = (error as Error & {context?: Response}).context;
        const payload = response ? await response.clone().json().catch(() => null) as {error?:string}|null : null;
        throw new Error(payload?.error || error.message);
      }
      if (data?.error) throw new Error(String(data.error));
      if (!data?.authorization_url || typeof data.authorization_url !== 'string') throw new Error('Secure checkout did not return a payment link.');
      window.location.assign(data.authorization_url);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not start secure checkout. No payment has been taken.');
    } finally { setBusy(false); }
  }

  async function claimDailyReward() {
    if (!supabase) return;
    setBusy(true); setNotice('');
    const { error } = await supabase.rpc('claim_economy_reward', { p_reward_key: 'daily_login_reward' });
    if (error) setNotice(error.message);
    else { setNotice('Daily login reward credited to your wallet.'); await load(); }
    setBusy(false);
  }

  function startFreeAdReward() {
    // No rewarded-ad provider or verified completion callback is configured in this
    // project yet. Do not call a missing RPC or ever credit coins from a button click.
    setNotice('Free ad rewards are paused until an ad provider and its verified completion callback are configured. No coins have been added.');
  }

  function formatReason(reason: string) {
    return reason.replace(/^reward:/,'').replace(/^message_cost:/,'message cost · ').replaceAll('_',' ');
  }

  return <div className="wallet-page">
    {walletScreen === 'buy' ? <div className="wallet-shop-page"><button type="button" className="wallet-back-link" onClick={() => setWalletScreen('overview')}>← Back to wallet</button><section className="wallet-shop-hero"><div className="wallet-shop-coin"><WalletPandaCoin /></div><p className="eyebrow">CIRCLE PANDA · BC STORE</p><h2>Buy Panda Coins</h2><p>Choose a coin bundle for your Circle Panda wallet. Your BC balance never expires.</p></section><div className="coin-package-grid">{coinPackages.map(pack => <button type="button" key={pack.id} className={`coin-package-card ${selectedPackage===pack.id?'selected':''}`} onClick={() => setSelectedPackage(pack.id)}><span className="package-ribbon">{pack.id==='1200'?'POPULAR':'BC BUNDLE'}</span><span className="package-coin"><WalletPandaCoin /></span><strong>{Number(pack.coins).toLocaleString()} BC</strong><small>{pack.name} bundle</small><span className="package-price">{pack.price_ngn != null && Number(pack.price_ngn)>0 ? `₦${Number(pack.price_ngn).toLocaleString('en-NG')}` : 'Price not configured'}</span></button>)}</div><div className="wallet-checkout-note"><strong>Secure checkout setup required</strong><p>Purchases must be completed through a configured payment provider and verified server-side. No payment is taken and no coins are added until checkout is connected.</p><button type="button" className="primary-button full" disabled={busy || !chosenCoinPackage} onClick={() => void startCoinPurchase()}>{busy ? 'Preparing secure checkout…' : 'Continue to secure checkout ↗'}</button>{notice&&<p className="wallet-shop-notice">{notice}</p>}</div></div> : <>
    <div className="wallet-purchase-actions"><button type="button" className="buy-coins-button" onClick={() => { setNotice(''); setWalletScreen('buy'); }}><span aria-hidden="true">◈</span> Buy Coins <span aria-hidden="true">↗</span></button><button type="button" className="free-bc-button" onClick={startFreeAdReward} title="Requires a verified rewarded-ad provider"><span aria-hidden="true">▷</span> Get 100 Free BC · Setup required <span aria-hidden="true">↗</span></button></div>
    <section className="wallet-hero"><div><p className="eyebrow">YOUR PANDA ECONOMY</p><h2>Your activity has value.</h2><p>BC balances do not expire. Rewards and message charges are processed by the backend.</p></div><div className="wallet-coin wallet-coin-emblem"><WalletPandaCoin /><span>BC</span></div></section>
    {notice && <div className="notice inline-notice">{notice}<button onClick={() => setNotice('')}>×</button></div>}
    <div className="wallet-balance-grid"><article className="balance-card primary-balance"><span>PANDA COINS</span><strong>{loading ? '—' : isAdminUnlimited ? '∞' : bcBalance.toLocaleString()}</strong><small>{isAdminUnlimited ? 'ADMIN · UNLIMITED BC' : 'BC · non-expiring balance'}</small></article><article className="balance-card"><span>WALLET COINS</span><strong>{loading ? '—' : wcBalance.toLocaleString()}</strong><small>WC balance</small></article><article className="balance-card"><span>EXPERIENCE POINTS</span><strong>{loading ? '—' : xpTotal.toLocaleString()}</strong><small>{levelName} level</small></article></div>
    <div className="wallet-actions"><div><h3>Daily activity</h3><p>Claim the daily login reward once every 24 hours.</p></div><button className="primary-button" disabled={busy || loading} onClick={() => void claimDailyReward()}>{busy ? 'Checking…' : `Claim daily reward · +${settings.daily_login_reward ?? 3} BC`}</button></div>
    <section className="wallet-history"><div className="section-title-row"><div><h2>Wallet activity</h2><p>Latest rewards and message charges.</p></div><span className="count-pill">{transactions.length} RECORDS</span></div>
      {loading ? <div className="empty-state">Loading wallet…</div> : transactions.length ? transactions.map(t => <article className="transaction-row" key={t.id}><span className={t.amount >= 0 ? 'transaction-icon credit' : 'transaction-icon debit'}>{t.amount >= 0 ? '+' : '−'}</span><div><strong>{formatReason(t.reason)}</strong><small>{new Date(t.created_at).toLocaleString()}</small></div><b className={t.amount >= 0 ? 'amount-credit' : 'amount-debit'}>{t.amount > 0 ? '+' : ''}{t.amount} {t.currency}</b></article>) : <div className="empty-state compact"><p>Your wallet transactions will appear here.</p></div>}
    </section>
    </>}
    <section className="economy-rules"><div className="section-title-row"><div><h2>Current economy rules</h2><p>Values are loaded from admin-controlled settings.</p></div></div><div className="rules-grid"><div><span>Regular message</span><strong>{settings.chat_message_cost ?? 1} BC</strong></div><div><span>Dating messages after free period</span><strong>{settings.dating_message_cost ?? 1} BC</strong></div><div><span>Dating free period</span><strong>{settings.dating_free_hours ?? 72} hours</strong></div><div><span>Ad reward</span><strong>{settings.ad_reward ?? 30} BC</strong></div><div><span>Ad cooldown</span><strong>{Math.round((settings.ad_reward_cooldown_seconds ?? 300)/60)} min</strong></div><div><span>Extra vote</span><strong>{settings.extra_vote_cost ?? 50} BC</strong></div></div><p className="economy-footnote">Ad rewards remain locked until a trusted ad-completion callback is connected. This prevents reward claims without a verified ad view.</p></section>
  </div>;
}


type GroupRow = { id: string; creator_id: string; name: string; description: string; country_restriction: string | null; is_vip: boolean; created_at: string; closed_at?: string | null; activated_at?: string | null };
type GroupJoinRequestRow = { id: string; group_id: string; user_id: string; status: string; created_at: string };
function GroupsFeature({ userId }: { userId: string }) {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string,number>>({});
  const [myGroups, setMyGroups] = useState<Record<string,boolean>>({});
  const [myGroupRoles, setMyGroupRoles] = useState<Record<string,string>>({});
  const [pendingJoinRequests, setPendingJoinRequests] = useState<GroupJoinRequestRow[]>([]);
  const [joinRequestNames, setJoinRequestNames] = useState<Record<string,string>>({});
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [groupEditInfo, setGroupEditInfo] = useState('admins');
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [groupDescriptionDraft, setGroupDescriptionDraft] = useState('');
  const [groupSendMessages, setGroupSendMessages] = useState(true);
  const [groupApproveMembers, setGroupApproveMembers] = useState(false);
  const [myVip, setMyVip] = useState(false);
  const [myCountry, setMyCountry] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [countryRestriction, setCountryRestriction] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [openGroupId, setOpenGroupId] = useState<string|null>(null);
  const [openConversationId, setOpenConversationId] = useState<string|null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [groupMediaFile, setGroupMediaFile] = useState<File | null>(null);
  const [groupMediaViewOnce, setGroupMediaViewOnce] = useState(true);
  const [groupMediaUrls, setGroupMediaUrls] = useState<Record<string,string>>({});
  const [viewedOnceMessageIds, setViewedOnceMessageIds] = useState<Record<string,boolean>>({});
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [groupReactions, setGroupReactions] = useState<Record<string,GroupMessageReaction[]>>({});
  const [groupReactionPicker, setGroupReactionPicker] = useState<string | null>(null);
  const [groupSenderNames, setGroupSenderNames] = useState<Record<string,string>>({});
  const [vipGroupUserIds, setVipGroupUserIds] = useState<Set<string>>(() => new Set());
  const groupActionLocks = useRef<Record<string, boolean>>({});

  async function load() {
    if (!supabase) return;
    const { data: profile } = await supabase.from('profiles').select('is_vip,vip_expires_at,country').eq('id',userId).maybeSingle();
    const { data: adminRole } = await supabase.from('user_roles').select('role').eq('user_id',userId).eq('role','admin').maybeSingle();
    const activeVip = Boolean(adminRole) || (Boolean(profile?.is_vip) && (!profile?.vip_expires_at || new Date(profile.vip_expires_at).getTime() > Date.now()));
    setMyVip(activeVip); setMyCountry(profile?.country || '');
    const { data, error } = await supabase.from('chat_groups')
      .select('id,creator_id,name,description,country_restriction,is_vip,created_at,closed_at,activated_at')
      .is('closed_at', null).order('created_at',{ascending:false}).limit(100);
    if (error) setNotice(error.message);
    const rows = (data ?? []) as GroupRow[];
    setGroups(rows);
    const ids = rows.map(g => g.id);
    if (ids.length) {
      const [membersResult, mineResult] = await Promise.all([
        supabase.from('group_members').select('group_id,user_id,role').in('group_id',ids),
        supabase.from('group_members').select('group_id,role').eq('user_id',userId).in('group_id',ids),
      ]);
      const counts: Record<string,number> = {};
      const mine: Record<string,boolean> = {};
      const roles: Record<string,string> = {};
      (membersResult.data ?? []).forEach((m: {group_id:string;user_id:string;role:string}) => { counts[m.group_id] = (counts[m.group_id] || 0) + 1; });
      (mineResult.data ?? []).forEach((m: {group_id:string;role?:string}) => { mine[m.group_id] = true; if (m.role) roles[m.group_id] = m.role; });
      setMemberCounts(counts); setMyGroups(mine); setMyGroupRoles(roles);
      const managedIds = (mineResult.data ?? []).filter((m: {group_id:string;role?:string}) => ['creator','admin'].includes(m.role || '')).map((m: {group_id:string}) => m.group_id);
      if (managedIds.length) {
        const { data: requests } = await supabase.from('group_join_requests').select('id,group_id,user_id,status,created_at').in('group_id',managedIds).eq('status','pending').order('created_at',{ascending:true});
        const pending = (requests ?? []) as GroupJoinRequestRow[];
        setPendingJoinRequests(pending);
        const requesterIds = [...new Set(pending.map(request => request.user_id))];
        if (requesterIds.length) {
          const { data: requesters } = await supabase.from('profiles').select('id,display_name,username').in('id',requesterIds);
          const names: Record<string,string> = {};
          (requesters ?? []).forEach((person: {id:string;display_name:string|null;username:string|null}) => { names[person.id] = person.display_name || person.username || 'Panda'; });
          setJoinRequestNames(names);
        } else setJoinRequestNames({});
      } else { setPendingJoinRequests([]); setJoinRequestNames({}); }
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
    if (!supabase || groupActionLocks.current.create) return;
    groupActionLocks.current.create = true;
    setBusy(true); setNotice('');
    try {
      const { error } = await supabase.rpc('create_chat_group',{
        p_name:name.trim(),p_description:description.trim(),p_country_restriction:countryRestriction.trim() || null,p_is_vip:false,
      });
      if (error) throw error;
      setName('');setDescription('');setCountryRestriction('');setCreateGroupOpen(false);setNotice('Group created. Invite people to join; chat opens at 3 members.');await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not create the group. Please try again.');
    } finally {
      delete groupActionLocks.current.create;
      setBusy(false);
    }
  }

  async function joinGroup(group: GroupRow) {
    if (!supabase || groupActionLocks.current[group.id]) return;
    groupActionLocks.current[group.id] = true;
    setBusy(true);setNotice('');
    try {
      // Use the policy-aware join RPC so approval settings and the three-member
      // activation rule are applied before a member can enter the conversation.
      const { data, error } = await supabase.rpc('join_group',{p_group_id:group.id});
      if (error) throw error;
      const result = data as {status?:string;member_count?:number}|null;
      if (result?.status === 'pending') setNotice('Join request sent. A group admin must approve you before you can enter.');
      else if (result?.status === 'waiting') setNotice(`You joined. The group chat opens when it has three members (currently ${result.member_count ?? 'fewer than three'}).`);
      else setNotice('You joined the group.');
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not join this group. Please try again.');
    } finally {
      delete groupActionLocks.current[group.id];
      setBusy(false);
    }
  }

  async function reviewJoinRequest(requestId: string, approve: boolean) {
    if (!supabase || groupActionLocks.current['request-' + requestId]) return;
    groupActionLocks.current['request-' + requestId] = true; setBusy(true); setNotice('');
    try {
      const { data, error } = await supabase.rpc('review_group_join_request', { p_request_id: requestId, p_approve: approve });
      if (error) throw error;
      const result = data as {status?:string;member_count?:number}|null;
      setNotice(approve ? (result?.member_count && result.member_count >= 3 ? 'Member approved. The group chat is now open.' : 'Member approved. The group still needs three members before chat opens.') : 'Join request declined.');
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not update the join request. Please try again.'); }
    finally { delete groupActionLocks.current['request-' + requestId]; setBusy(false); }
  }

  async function openVipGroup(scope: 'worldwide' | 'country') {
    if (!supabase || groupActionLocks.current['vip-' + scope]) return;
    if (!myVip) { setNotice('VIP membership is required. Your account must have active VIP access before the private room can open.'); return; }
    if (scope === 'country' && !myCountry) { setNotice('Choose your country in your profile first. Country VIP access follows your saved profile country, not GPS.'); return; }
    groupActionLocks.current['vip-' + scope] = true;
    setBusy(true); setNotice('');
    try {
      const { data: groupId, error: ensureError } = await supabase.rpc('ensure_vip_group', { p_scope: scope, p_country: scope === 'country' ? myCountry : null });
      if (ensureError) throw ensureError;
      const { data: group, error: groupError } = await supabase.from('chat_groups').select('id,creator_id,name,description,country_restriction,is_vip,created_at').eq('id', groupId as string).single();
      if (groupError || !group) throw groupError || new Error('VIP room could not be loaded.');
      await load();
      await openChat(group as GroupRow);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not open this VIP room. Please try again.');
    } finally { delete groupActionLocks.current['vip-' + scope]; setBusy(false); }
  }

  async function openChat(group: GroupRow) {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('open_group_chat',{p_group_id:group.id});
    if (error) { setNotice(error.message);return; }
    setOpenGroupId(group.id);setOpenConversationId(data as string);setNotice('');
    const { data: rows, error: messagesError } = await supabase.from('messages')
      .select('id,conversation_id,sender_id,body,created_at,reply_to_message_id,media_type,media_path,view_once').eq('conversation_id',data as string).order('created_at',{ascending:true}).limit(200);
    if (messagesError) setNotice(messagesError.message);
    else {
      const messages = (rows ?? []) as ChatMessage[];
      setChatMessages(messages);
      const onceIds = messages.filter(m => m.view_once).map(m => m.id);
      if (onceIds.length) {
        const { data: claims } = await supabase.from('group_media_views').select('message_id').eq('user_id',userId).in('message_id',onceIds);
        setViewedOnceMessageIds(Object.fromEntries((claims ?? []).map((claim: {message_id:string}) => [claim.message_id,true])));
      }
      const senderIds = [...new Set(messages.map(m => m.sender_id))];
      if (senderIds.length) {
        const { data: people } = await supabase.from('profiles').select('id,display_name,username,is_vip,vip_expires_at').in('id', senderIds);
        const map: Record<string,string> = {};
        const activeVipIds = new Set<string>();
        const vipCheckTime = Date.now();
        (people ?? []).forEach((p: {id:string;display_name:string|null;username:string|null;is_vip?:boolean|null;vip_expires_at?:string|null}) => {
          map[p.id] = p.display_name || p.username || 'Panda';
          if (Boolean(p.is_vip) && (!p.vip_expires_at || new Date(p.vip_expires_at).getTime() > vipCheckTime)) activeVipIds.add(p.id);
        });
        setGroupSenderNames(map); setVipGroupUserIds(activeVipIds);
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

  async function openGroupMedia(message: ChatMessage) {
    if (!supabase || !message.media_path || !openGroupId) return;
    if (message.view_once && viewedOnceMessageIds[message.id]) { setNotice('This view-once media has already been opened.'); return; }
    setNotice('');
    try {
      if (message.view_once) {
        const { data, error } = await supabase.rpc('claim_group_media_view_once',{p_message_id:message.id});
        if (error) throw error;
        if (data !== true) { setViewedOnceMessageIds(prev=>({...prev,[message.id]:true})); setNotice('This view-once media has already been opened.'); return; }
        setViewedOnceMessageIds(prev=>({...prev,[message.id]:true}));
      }
      const { data, error } = await supabase.storage.from('group-media').createSignedUrl(message.media_path, message.view_once ? 30 : 300);
      if (error || !data?.signedUrl) throw error || new Error('Media could not be opened.');
      setGroupMediaUrls(prev=>({...prev,[message.id]:data.signedUrl}));
      if (message.view_once) window.setTimeout(()=>setGroupMediaUrls(prev=>{const next={...prev};delete next[message.id];return next;}),10000);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not open this group media.'); }
  }

  async function sendGroupMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !openConversationId || (!chatDraft.trim() && !groupMediaFile) || groupActionLocks.current['send-message']) return;
    groupActionLocks.current['send-message'] = true;
    setBusy(true);setNotice('');
    let uploadedPath: string | null = null;
    try {
      let mediaType: string | null = null;
      if (groupMediaFile) {
        const allowed = ['image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/webm','audio/mpeg','audio/mp4','audio/ogg','audio/wav'];
        if (!allowed.includes(groupMediaFile.type) || groupMediaFile.size > 50 * 1024 * 1024) throw new Error('Choose supported image, video or audio media up to 50 MB.');
        mediaType = groupMediaFile.type.startsWith('image/') ? 'image' : groupMediaFile.type.startsWith('video/') ? 'video' : 'audio';
        const extension = groupMediaFile.name.split('.').pop()?.toLowerCase() || 'bin';
        uploadedPath = `${userId}/${openGroupId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('group-media').upload(uploadedPath,groupMediaFile,{upsert:false,contentType:groupMediaFile.type});
        if (uploadError) throw uploadError;
      }
      const { error } = await supabase.from('messages').insert({
        conversation_id:openConversationId, sender_id:userId, body:chatDraft.trim() || (groupMediaFile ? 'Shared media' : ''),
        reply_to_message_id:replyingTo?.id ?? null, media_type:mediaType, media_path:uploadedPath,
        view_once:Boolean(groupMediaFile && groupMediaViewOnce),
      });
      if (error) throw error;
      setChatDraft(''); setReplyingTo(null); setGroupMediaFile(null); setGroupMediaViewOnce(true);
      const { data } = await supabase.from('messages').select('id,conversation_id,sender_id,body,created_at,reply_to_message_id,media_type,media_path,view_once')
        .eq('conversation_id',openConversationId).order('created_at',{ascending:true}).limit(200);
      setChatMessages((data ?? []) as ChatMessage[]);
    } catch (error) {
      if (uploadedPath) await supabase.storage.from('group-media').remove([uploadedPath]).catch(()=>undefined);
      setNotice(error instanceof Error ? error.message : 'Message could not be sent. Please try again.');
    } finally {
      delete groupActionLocks.current['send-message'];
      setBusy(false);
    }
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
  const canManageOpenGroup = Boolean(openGroup && (openGroup.creator_id === userId || ['creator','admin'].includes(myGroupRoles[openGroup.id] || '')));
  const canEditOpenGroupInfo = Boolean(openGroup && myGroups[openGroup.id] && (canManageOpenGroup || groupEditInfo === 'admins_members'));

  async function showGroupSettings() {
    if (!supabase || !openGroup) return;
    setBusy(true); setNotice('');
    const { data, error } = await supabase.from('group_settings').select('edit_group_info,send_messages,approve_new_members').eq('group_id',openGroup.id).maybeSingle();
    if (error) setNotice(error.message);
    setGroupEditInfo(data?.edit_group_info || 'admins');
    setGroupNameDraft(openGroup.name);
    setGroupDescriptionDraft(openGroup.description || '');
    setGroupSendMessages(data?.send_messages ?? true);
    setGroupApproveMembers(data?.approve_new_members ?? false);
    setGroupSettingsOpen(true); setBusy(false);
  }

  async function saveGroupDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !openGroup || !canEditOpenGroupInfo) return;
    setBusy(true); setNotice('');
    try {
      const { error } = await supabase.rpc('update_group_details_secure', { p_group_id: openGroup.id, p_name: groupNameDraft.trim(), p_description: groupDescriptionDraft.trim() });
      if (error) throw error;
      setNotice('Group details updated.');
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not update group details.'); }
    finally { setBusy(false); }
  }

  async function saveGroupSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !openGroup) return;
    setBusy(true); setNotice('');
    const { error } = await supabase.rpc('update_group_settings', { p_group_id: openGroup.id, p_edit_group_info: groupEditInfo, p_send_messages: groupSendMessages, p_approve_new_members: groupApproveMembers });
    if (error) setNotice(error.message);
    else { setNotice('Group settings saved.'); setGroupSettingsOpen(false); }
    setBusy(false);
  }

  async function closeOpenGroup() {
    if (!supabase || !openGroup || openGroup.creator_id !== userId) return;
    if (!window.confirm('Close this group? Members will no longer be able to send messages, and the group will disappear from the active directory.')) return;
    setBusy(true); setNotice('');
    const { error } = await supabase.rpc('close_group', { p_group_id: openGroup.id });
    if (error) setNotice(error.message);
    else { setGroupSettingsOpen(false); setOpenGroupId(null); setOpenConversationId(null); setChatMessages([]); await load(); setNotice('Group closed.'); }
    setBusy(false);
  }

  async function leaveOpenGroup() {
    if (!supabase || !openGroup || openGroup.creator_id === userId) return;
    if (!window.confirm('Leave this group? You will need to join again to access its chat.')) return;
    setBusy(true); setNotice('');
    const { error } = await supabase.rpc('leave_group', { p_group_id: openGroup.id });
    if (error) setNotice(error.message);
    else { setGroupSettingsOpen(false); setOpenGroupId(null); setOpenConversationId(null); setChatMessages([]); await load(); setNotice('You left the group.'); }
    setBusy(false);
  }
  return <div className="groups-page">
    <div className="directory-toolbar"><div><p className="eyebrow">YOUR PEOPLE, YOUR SPACE</p><p className="feature-copy">Explore normal and VIP groups across your circle.</p></div><button type="button" className="primary-button" onClick={() => setCreateGroupOpen(true)}>＋ Create Group</button></div>
    {createGroupOpen && <div className="create-modal-backdrop" role="dialog" aria-modal="true" aria-label="Create a group"><section className="create-modal-card group-create-panel"><header className="create-modal-header"><div><p className="eyebrow">YOUR PEOPLE, YOUR SPACE</p><h2>Create a group</h2></div><button type="button" className="create-modal-close" aria-label="Close create group" onClick={() => setCreateGroupOpen(false)}>×</button></header><p className="feature-copy">Normal groups stay available without a 24-hour expiry. The group chat unlocks when at least three members have joined.</p>
      <form className="feature-form" onSubmit={createGroup}>
        <label>Group name<input value={name} onChange={e=>setName(e.target.value)} maxLength={100} minLength={2} required placeholder="Give your group a name" /></label>
        <label>About the group<textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3} maxLength={2000} placeholder="What brings this group together?" /></label>
        <CountryDropdown value={countryRestriction} onChange={setCountryRestriction} />
        <div className="form-submit-row"><span className="draft-state">3 members to open chat</span><button className="primary-button" disabled={busy}>{busy?'Creating…':'Create group ↗'}</button></div>
      </form>
      {notice && <div className="notice">{notice}</div>}
    </section></div>}
    <section className="group-directory"><div className="section-title-row"><div><h2>Group directory</h2><p>Join a community and help it reach three members.</p></div><span className="count-pill">{groups.length} GROUPS</span></div>
      <section className="vip-experience">
        <div className="vip-experience-heading"><div><p className="eyebrow">THE GOLD CIRCLE</p><h2>VIP Experience</h2><p>Private rooms, member-only connections and priority access.</p></div><span className={myVip ? 'vip-status unlocked' : 'vip-status'}>{myVip ? '✦ VIP UNLOCKED' : '🔒 VIP LOCKED'}</span></div>
        <div className="vip-room-grid">
          <article className="vip-room-card worldwide-vip-room"><div className="vip-room-ornament">✦</div><div className="vip-room-label">WORLDWIDE VIP</div><h3>Worldwide VIP Group</h3><p>Meet VIP members across Circle Panda in a dedicated private chat.</p><div className="vip-room-bottom"><span>🌐 Global community</span><button type="button" className={myVip ? 'vip-room-button' : 'vip-room-button locked'} disabled={busy} onClick={() => void openVipGroup('worldwide')}>{myVip ? 'Enter room ↗' : '🔒 Unlock VIP'}</button></div></article>
          {myCountry && <article className="vip-room-card country-vip-room"><div className="vip-room-ornament">♛</div><div className="vip-room-label">COUNTRY VIP</div><h3>{myCountry} VIP Group</h3><p>A country-only room for VIP members in your saved profile country. Other countries stay hidden.</p><div className="vip-room-bottom"><span>⌖ {myCountry} only</span><button type="button" className={myVip ? 'vip-room-button' : 'vip-room-button locked'} disabled={busy} onClick={() => void openVipGroup('country')}>{myVip ? 'Enter room ↗' : '🔒 Unlock VIP'}</button></div></article>}
        </div>
        <div className="vip-unlock-grid"><div><span>♛</span><strong>VIP-only group chat</strong><small>Membership checked by Supabase</small></div><div><span>◉</span><strong>Member connections</strong><small>Open conversations from the room</small></div><div><span>◈</span><strong>Gold-circle status</strong><small>{myVip ? 'Your profile has VIP access' : 'Membership required to unlock benefits'}</small></div></div>
        {!myVip && <p className="vip-unlock-note">VIP room access is enforced by the backend. Live subscription checkout still requires payment-provider configuration; tapping this card will not falsely grant VIP status.</p>}
      </section>
      {loading ? <div className="empty-state">Loading groups…</div> : groups.length ? <div className="group-cards">{groups.filter(g=>!g.is_vip).map(group => {
        const count = memberCounts[group.id] || 0;
        const member = Boolean(myGroups[group.id]);
        const opened = Boolean(group.activated_at);
        return <article className="group-card" key={group.id}><div className={`group-card-icon${vipGroupUserIds.has(group.creator_id) ? ` vip-avatar-frame ${getWeeklyVipAuraClass()}` : ''}`}>🐼</div><div className="group-card-main"><div className="group-card-title"><h3>{group.name}</h3>{vipGroupUserIds.has(group.creator_id) && <span className="vip-member-label">VIP creator</span>}{group.creator_id===userId&&<span className="source-tag">Creator</span>}</div><p>{group.description || 'A Circle Panda community group.'}</p><div className="group-meta"><span>👤 {count} members</span><span>{group.country_restriction ? '⌖ '+group.country_restriction : '🌐 Open community'}</span><span className={opened?'group-open':'group-closed'}>{opened?'● Chat open':'○ Needs '+(3-count)+' more'}</span></div><div className="group-actions">{!member ? <button className="primary-button" disabled={busy} onClick={()=>void joinGroup(group)}>Join group ↗</button> : <button className="primary-button" disabled={!opened} onClick={()=>void openChat(group)}>{opened?'Open group chat ↗':'Waiting for 3 members'}</button>}</div></div></article>;
      })}</div> : <div className="empty-state"><span>◉</span><h3>Build your first community.</h3><p>Create a group above or invite members to one that already exists.</p></div>}
    </section>
    {pendingJoinRequests.length > 0 && <section className="group-join-requests"><div className="section-title-row"><div><p className="eyebrow">GROUP ADMIN</p><h2>Join requests</h2><p>Review people asking to join groups you manage.</p></div><span className="count-pill">{pendingJoinRequests.length} PENDING</span></div><div className="group-join-request-list">{pendingJoinRequests.map(request => { const group = groups.find(item => item.id === request.group_id); return <article className="group-join-request-card" key={request.id}><div><strong>{joinRequestNames[request.user_id] || 'Panda'}</strong><p>Requested to join <b>{group?.name || 'your group'}</b></p><small>{new Date(request.created_at).toLocaleString()}</small></div><div className="group-join-request-actions"><button type="button" className="secondary-button" disabled={busy} onClick={()=>void reviewJoinRequest(request.id,false)}>Decline</button><button type="button" className="primary-button" disabled={busy} onClick={()=>void reviewJoinRequest(request.id,true)}>Approve</button></div></article>; })}</div></section>}
    {openGroup && openConversationId && <div className="group-chat-overlay"><section className="group-chat-panel" role="dialog" aria-label={openGroup.name + ' group chat'}><header className="group-chat-topbar"><button className="group-back-button" aria-label="Back to groups" onClick={()=>{setOpenGroupId(null);setOpenConversationId(null);setChatMessages([]);setReplyingTo(null);}}>‹</button><div className="group-chat-avatar">◉</div><div className="group-chat-heading"><strong>{openGroup.name}</strong><p>{memberCounts[openGroup.id] || 0} members · online chat</p></div><button className="group-header-action" title="Group settings" aria-label="Open group settings" onClick={()=>void showGroupSettings()}>⋮</button></header><div className="group-chat-history">{chatMessages.map(m=>{const quoted=chatMessages.find(item=>item.id===m.reply_to_message_id);const reactions=groupReactions[m.id] ?? [];return <article key={m.id} className={m.sender_id===userId?'group-message mine':'group-message'}><div className="group-message-author">{m.sender_id===userId?'You':(groupSenderNames[m.sender_id] || 'Panda')} {vipGroupUserIds.has(m.sender_id) && <span className="vip-member-label">VIP</span>}</div><div className="group-message-display-avatar-wrap"><span className={`group-message-display-avatar${vipGroupUserIds.has(m.sender_id) ? ` vip-avatar-frame ${getWeeklyVipAuraClass()}` : ''}`}>🐼</span></div>{quoted&&<div className="group-quoted-message"><strong>{quoted.sender_id===userId?'You':(groupSenderNames[quoted.sender_id] || 'Panda')}</strong><span>{quoted.body}</span></div>}<p>{m.body}</p>{m.media_path && <div className="group-media-message">{groupMediaUrls[m.id] ? <>{m.media_type==='image' ? <img src={groupMediaUrls[m.id]} alt="Group shared media" /> : m.media_type==='video' ? <video src={groupMediaUrls[m.id]} controls autoPlay /> : <audio src={groupMediaUrls[m.id]} controls autoPlay />}{m.view_once && <small>View-once media closes automatically.</small>}</> : <button type="button" className="group-media-open" disabled={Boolean(m.view_once && viewedOnceMessageIds[m.id])} onClick={()=>void openGroupMedia(m)}>{m.view_once ? (viewedOnceMessageIds[m.id] ? '✓ Viewed once' : 'Open view-once media ↗') : 'Open shared media ↗'}</button>}</div>}<div className="group-message-meta"><button className="group-reply-action" title="Reply to message" onClick={()=>setReplyingTo(m)}>↩ Reply</button><button className="group-react-action" title="React to message" onClick={()=>setGroupReactionPicker(groupReactionPicker===m.id?null:m.id)}>☺ React</button><small>{new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></div>{reactions.length>0&&<div className="group-reaction-summary">{['👍','❤️','😂','😮','🐼'].map((emoji,i)=>{const key=['like','heart','laugh','wow','panda'][i];const count=reactions.filter(r=>r.reaction===key).length;return count>0?<button key={key} className={reactions.some(r=>r.user_id===userId&&r.reaction===key)?'selected':''} onClick={()=>void toggleGroupReaction(m.id,key)}>{emoji} {count}</button>:null;})}</div>}{groupReactionPicker===m.id&&<div className="group-reaction-picker">{[{key:'like',emoji:'👍'},{key:'heart',emoji:'❤️'},{key:'laugh',emoji:'😂'},{key:'wow',emoji:'😮'},{key:'sad',emoji:'😢'},{key:'panda',emoji:'🐼'}].map(item=><button type="button" key={item.key} title={item.key} onClick={()=>void toggleGroupReaction(m.id,item.key)}>{item.emoji}</button>)}</div>}</article>;})}{!chatMessages.length&&<div className="group-chat-welcome"><span>◉</span><strong>Welcome to {openGroup.name}</strong><p>Say hello and start the conversation.</p></div>}</div>{replyingTo&&<div className="group-reply-preview"><div><strong>Replying to {replyingTo.sender_id===userId?'yourself':(groupSenderNames[replyingTo.sender_id]||'Panda')}</strong><span>{replyingTo.body}</span></div><button type="button" aria-label="Cancel reply" onClick={()=>setReplyingTo(null)}>×</button></div>}<form className="group-chat-composer" onSubmit={sendGroupMessage}><button type="button" className="group-composer-icon" title="Emoji reactions" onClick={()=>setNotice('Use the reaction button under any group message to react.')}>☺</button><label className="group-media-picker" title="Attach image, video or audio">＋<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,audio/webm,audio/mpeg,audio/mp4,audio/ogg,audio/wav" onChange={e=>{const file=e.currentTarget.files?.[0]||null;if(file&&(file.size>50*1024*1024)){setNotice('Media must be 50 MB or smaller.');setGroupMediaFile(null);}else{setGroupMediaFile(file);setNotice('');}}}/></label><input value={chatDraft} onChange={e=>setChatDraft(e.target.value)} maxLength={10000} placeholder={groupMediaFile ? groupMediaFile.name : replyingTo?'Write a reply…':'Message the group…'} /><label className="group-view-once-toggle"><input type="checkbox" checked={groupMediaViewOnce} disabled={!groupMediaFile} onChange={e=>setGroupMediaViewOnce(e.target.checked)}/> View once</label><button className="group-send-button" disabled={busy||(!chatDraft.trim()&&!groupMediaFile)} aria-label="Send message">{busy?'…':'➤'}</button></form></section></div>}
    {groupSettingsOpen && openGroup && <div className="create-modal-backdrop" role="dialog" aria-modal="true" aria-label="Group settings"><section className="create-modal-card group-create-panel"><header className="create-modal-header"><div><p className="eyebrow">GROUP CONTROLS</p><h2>{openGroup.name} settings</h2></div><button type="button" className="create-modal-close" aria-label="Close group settings" onClick={()=>setGroupSettingsOpen(false)}>×</button></header><p className="feature-copy">Choose who can update group details, whether members can send messages, and whether new members need approval.</p>{canEditOpenGroupInfo && <form className="feature-form group-details-form" onSubmit={saveGroupDetails}><label>Group name<input value={groupNameDraft} onChange={e=>setGroupNameDraft(e.target.value)} minLength={2} maxLength={100} required /></label><label>Group description<textarea value={groupDescriptionDraft} onChange={e=>setGroupDescriptionDraft(e.target.value)} maxLength={2000} rows={3} /></label><button className="primary-button" disabled={busy}>{busy?'Saving…':'Save group details'}</button></form>}{canManageOpenGroup ? <form className="feature-form" onSubmit={saveGroupSettings}><label>Who can edit group information<select value={groupEditInfo} onChange={e=>setGroupEditInfo(e.target.value)}><option value="admins">Admins only</option><option value="admins_members">Admins and members</option></select></label><label className="group-setting-toggle"><input type="checkbox" checked={groupSendMessages} onChange={e=>setGroupSendMessages(e.target.checked)}/> Allow members to send messages</label><label className="group-setting-toggle"><input type="checkbox" checked={groupApproveMembers} onChange={e=>setGroupApproveMembers(e.target.checked)}/> Approve new members before they join</label><div className="form-submit-row"><button type="button" className="secondary-button" onClick={()=>setGroupSettingsOpen(false)}>Cancel</button><button className="primary-button" disabled={busy}>{busy?'Saving…':'Save settings'}</button></div></form> : <p className="feature-copy">Only group creators and admins can change group settings.</p>}{openGroup.creator_id===userId ? <button type="button" className="danger-button" disabled={busy} onClick={()=>void closeOpenGroup()}>{busy?'Working…':'Close this group'}</button> : <button type="button" className="secondary-button" disabled={busy} onClick={()=>void leaveOpenGroup()}>{busy?'Working…':'Leave group'}</button>}</section></div>}
  </div>;
}


function VipFeature({ userId, onNavigate }: { userId: string; onNavigate: (section: Section) => void }) {
  const [vip, setVip] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [country, setCountry] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let alive = true;
    async function loadMembership() {
      if (!supabase) { setLoading(false); setNotice('Connect the rebuilt app to Supabase to check VIP membership.'); return; }
      const [profileResult, roleResult, walletResult] = await Promise.all([
        supabase.from('profiles').select('is_vip,vip_expires_at,country').eq('id', userId).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle(),
        supabase.from('wallet_accounts').select('bc_balance').eq('user_id', userId).maybeSingle(),
      ]);
      if (!alive) return;
      if (profileResult.error) setNotice(profileResult.error.message);
      const expiry = profileResult.data?.vip_expires_at ? new Date(profileResult.data.vip_expires_at).getTime() : null;
      setVip(Boolean(profileResult.data?.is_vip) && (expiry === null || expiry > Date.now()));
      setExpiresAt(profileResult.data?.vip_expires_at ?? null);
      setCountry(profileResult.data?.country ?? '');
      setIsAdmin(Boolean(roleResult.data));
      setBalance(walletResult.data ? Number(walletResult.data.bc_balance) : null);
      setLoading(false);
    }
    void loadMembership();
    return () => { alive = false; };
  }, [userId]);

  const permanent = vip && !expiresAt;
  return <div className="vip-dashboard">
    <section className="vip-dashboard-hero">
      <div className="vip-hero-copy">
        <p className="eyebrow">THE GOLD CIRCLE · CIRCLE PANDA</p>
        <div className="vip-hero-title-row"><span className="vip-crown-coin" aria-hidden="true">♛</span><div><h2>Your VIP Experience</h2><p>More access. Private spaces. A golden way to connect.</p></div></div>
        <div className="vip-member-badges">
          <span className={vip ? 'vip-member-badge active' : 'vip-member-badge'}>{vip ? '✦ VIP ACTIVE' : '◇ VIP INACTIVE'}</span>
          {isAdmin && <span className="vip-member-badge admin">♜ ADMIN ACCOUNT</span>}
          {permanent && <span className="vip-member-badge permanent">∞ NO EXPIRY</span>}
        </div>
        <p className="vip-membership-summary">{loading ? 'Checking your membership…' : vip ? (permanent ? 'Your VIP membership is permanent. It has no expiry date.' : 'Your VIP membership is active' + (expiresAt ? ' until ' + new Date(expiresAt).toLocaleDateString() + '.' : '.')) : 'VIP membership is not active on this profile. This page will not grant membership by itself.'}</p>
      </div>
      <div className="vip-hero-medallion" aria-hidden="true"><span>♛</span><small>GOLD<br/>CIRCLE</small></div>
      <div className="vip-hero-glint glint-one" /><div className="vip-hero-glint glint-two" />
    </section>

    {notice && <div className="notice inline-notice">{notice}<button type="button" onClick={() => setNotice('')}>×</button></div>}

    <div className="vip-metric-grid">
      <article className="vip-metric-card"><span className="vip-metric-icon">◈</span><small>YOUR BC BALANCE</small><strong>{balance === null ? '—' : balance.toLocaleString()}</strong><p>Coins stay in your wallet without expiring.</p><button type="button" onClick={() => onNavigate('Wallet')}>Open wallet ↗</button></article>
      <article className="vip-metric-card"><span className="vip-metric-icon">◎</span><small>MEMBERSHIP</small><strong>{loading ? '…' : vip ? 'VIP' : 'Standard'}</strong><p>{permanent ? 'Permanent access · no expiry' : vip ? 'Active membership' : 'VIP access required for private rooms'}</p><button type="button" onClick={() => onNavigate('Groups')}>Explore VIP rooms ↗</button></article>
      <article className="vip-metric-card"><span className="vip-metric-icon">♜</span><small>ACCOUNT ACCESS</small><strong>{isAdmin ? 'Owner / Admin' : 'Member'}</strong><p>{isAdmin ? 'Administrator role detected on this account.' : 'Your membership benefits are shown below.'}</p>{isAdmin && <button type="button" onClick={() => onNavigate('Admin')}>Open admin controls ↗</button>}</article>
    </div>

    <section className="vip-dashboard-section">
      <div className="vip-section-heading"><div><p className="eyebrow">PRIVATE SPACES</p><h3>Enter the Gold Circle</h3><p>Two separate VIP rooms, with country access based on your saved profile country.</p></div><span className="vip-section-spark">✧</span></div>
      <div className="vip-dashboard-room-grid">
        <article className="vip-dashboard-room worldwide"><div className="vip-room-topline"><span>🌐 WORLDWIDE</span><span>✦ VIP ONLY</span></div><div className="vip-room-emblem">✧</div><h4>Worldwide VIP Group</h4><p>Connect with VIP members across the Circle Panda community in a dedicated private room.</p><button type="button" className="vip-gold-button" onClick={() => onNavigate('Groups')}>View worldwide room ↗</button></article>
        <article className="vip-dashboard-room country"><div className="vip-room-topline"><span>⌖ COUNTRY ROOM</span><span>✦ VIP ONLY</span></div><div className="vip-room-emblem">♛</div><h4>{country ? country + ' VIP Group' : 'Your Country VIP Group'}</h4><p>{country ? 'A country-only room for VIP members whose saved profile country is ' + country + '.' : 'Complete the country field in your profile to reveal the matching country VIP room.'}</p><button type="button" className="vip-gold-button" onClick={() => onNavigate('Groups')}>View country room ↗</button></article>
      </div>
    </section>

    <section className="vip-dashboard-section">
      <div className="vip-section-heading"><div><p className="eyebrow">VIP PRIVILEGES</p><h3>What your Gold Circle unlocks</h3><p>Use these shortcuts to test the VIP experience in the rebuilt app.</p></div></div>
      <div className="vip-benefit-grid">
        <article><span>💬</span><div><strong>Messaging without BC fees</strong><p>VIP users are intended to send private messages without the normal per-message BC charge.</p><small>Verify in live chat flow</small></div></article>
        <article><span>💗</span><div><strong>Dating access</strong><p>Explore dating profiles and request-to-chat flows. The planned VIP experience avoids ad gates after the initial free period.</p><button type="button" onClick={() => onNavigate('Dating')}>Open dating ↗</button></div></article>
        <article><span>◉</span><div><strong>Private VIP groups</strong><p>Worldwide and country VIP rooms are separate from regular groups and do not need three members to open.</p><button type="button" onClick={() => onNavigate('Groups')}>Open groups ↗</button></div></article>
        <article><span>▣</span><div><strong>VIP-to-VIP calls</strong><p>Calls and admin-controlled call permissions are part of the planned VIP experience; this shortcut does not start a call yet.</p><small>Connection still required</small></div></article>
        <article><span>◈</span><div><strong>Non-expiring BC wallet</strong><p>Review your balance and wallet transactions. VIP status does not silently change the stored coin balance.</p><button type="button" onClick={() => onNavigate('Wallet')}>View wallet ↗</button></div></article>
        <article><span>⚙</span><div><strong>Owner controls</strong><p>Administrators can adjust economy settings from the admin area. Access is role-checked by the backend.</p>{isAdmin ? <button type="button" onClick={() => onNavigate('Admin')}>Open admin ↗</button> : <small>Admin role required</small>}</div></article>
      </div>
    </section>
    <p className="vip-dashboard-footnote">Membership is read from the new Circle Panda database. A visible VIP badge is not a substitute for server-side permission checks; payment, calls, and any privilege not connected end-to-end must be tested separately.</p>
  </div>;
}

type VipAdminMember = { user_id:string; email:string|null; display_name:string|null; username:string|null; is_vip:boolean; vip_expires_at:string|null };

function VipAdminControls() {
  const [members, setMembers] = useState<VipAdminMember[]>([]);
  const [search, setSearch] = useState('');
  const [duration, setDuration] = useState<'permanent'|'30'|'90'>('permanent');
  const [busyId, setBusyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  async function load() {
    if (!supabase) { setLoading(false); setNotice('Supabase is not configured.'); return; }
    const { data, error } = await supabase.rpc('admin_list_vip_members');
    if (error) setNotice(error.message);
    else setMembers((data ?? []) as VipAdminMember[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function setMembership(member: VipAdminMember, active: boolean) {
    if (!supabase || busyId) return;
    const expiresAt = active && duration !== 'permanent'
      ? new Date(Date.now() + Number(duration) * 24 * 60 * 60 * 1000).toISOString()
      : null;
    setBusyId(member.user_id); setNotice('');
    const { error } = await supabase.rpc('admin_set_user_vip', {
      p_user_id: member.user_id, p_active: active, p_expires_at: expiresAt,
    });
    if (error) setNotice(error.message);
    else {
      setNotice(active ? (expiresAt ? 'VIP access granted for ' + duration + ' days.' : 'Permanent VIP access granted.') : 'VIP access revoked.');
      await load();
    }
    setBusyId('');
  }

  const visible = members.filter(member => {
    const needle = search.trim().toLowerCase();
    return !needle || [member.email || '', member.display_name || '', member.username || ''].some(value => value.toLowerCase().includes(needle));
  });

  return <section className="vip-admin-controls">
    <div className="section-title-row"><div><p className="eyebrow">MEMBERSHIP MANAGEMENT</p><h3>VIP access control</h3><p>Grant or revoke VIP access through admin-only database functions. The owner account is protected from revocation.</p></div><button type="button" className="secondary-button" disabled={loading || Boolean(busyId)} onClick={() => void load()}>Refresh</button></div>
    <div className="vip-admin-toolbar"><input aria-label="Search users for VIP access" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name, username or email" /><label>Grant duration<select value={duration} onChange={event => setDuration(event.target.value as 'permanent'|'30'|'90')}><option value="permanent">Permanent VIP</option><option value="30">30 days</option><option value="90">90 days</option></select></label></div>
    {notice && <div className="notice inline-notice">{notice}<button type="button" onClick={() => setNotice('')}>×</button></div>}
    {loading ? <div className="empty-state">Loading members…</div> : <div className="vip-admin-member-list">{visible.map(member => {
      const owner = (member.email || '').toLowerCase() === 'circlepandaapp@gmail.com';
      const active = member.is_vip && (!member.vip_expires_at || new Date(member.vip_expires_at).getTime() > Date.now());
      return <article className="vip-admin-member" key={member.user_id}>
        <div className="vip-admin-member-avatar">🐼</div><div className="vip-admin-member-copy"><strong>{member.display_name || member.username || 'Circle Panda member'}</strong><span>{member.email || 'Phone-only account'}</span><small>{owner ? 'Owner account · protected' : active ? (member.vip_expires_at ? 'VIP until ' + new Date(member.vip_expires_at).toLocaleDateString() : 'Permanent VIP') : 'Standard membership'}</small></div>
        {active ? <button type="button" className="secondary-button" disabled={owner || Boolean(busyId)} onClick={() => void setMembership(member,false)}>{busyId===member.user_id?'Saving…':owner?'Owner protected':'Revoke VIP'}</button> : <button type="button" className="vip-gold-button" disabled={Boolean(busyId)} onClick={() => void setMembership(member,true)}>{busyId===member.user_id?'Saving…':'Grant VIP'}</button>}
      </article>;
    })}{!visible.length && <div className="empty-state">No matching members found.</div>}</div>}
    <p className="vip-admin-footnote">Showing up to 200 accounts. Membership changes are enforced server-side and persist across refreshes.</p>
  </section>;
}

type EconomySettingRow = { setting_key: string; numeric_value: number; updated_at: string; };
type EventBlastAdminPlan = EventBlastPlan & { enabled: boolean };
type CoinPackageAdmin = CoinPackage & { enabled:boolean };
type CoinPackageAdminDraft = { name:string; coins:string; price_ngn:string; enabled:boolean; sort_order:string };
type EventBlastPlanDraft = { name:string; unique_reach:string; duration_minutes:string; price_usd:string; bc_price:string; enabled:boolean };
function AdminFeature() {
  const [settings, setSettings] = useState<EconomySettingRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string,string>>({});
  const [blastPlans, setBlastPlans] = useState<EventBlastAdminPlan[]>([]);
  const [planDrafts, setPlanDrafts] = useState<Record<string,EventBlastPlanDraft>>({});
  const [coinPackages, setCoinPackages] = useState<CoinPackageAdmin[]>([]);
  const [coinPackageDrafts, setCoinPackageDrafts] = useState<Record<string,CoinPackageAdminDraft>>({});
  const [busyKey, setBusyKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  async function load() {
    if (!supabase) return;
    const [settingsResult, plansResult, coinPackagesResult] = await Promise.all([
      supabase.from('economy_settings').select('setting_key,numeric_value,updated_at').order('setting_key'),
      supabase.rpc('get_event_blast_plans_admin'),
      supabase.rpc('get_coin_packages_admin'),
    ]);
    if (settingsResult.error) setNotice(settingsResult.error.message);
    else {
      const rows = (settingsResult.data ?? []) as EconomySettingRow[];
      setSettings(rows);
      setDrafts(Object.fromEntries(rows.map(row => [row.setting_key,String(row.numeric_value)])));
    }
    if (plansResult.error) setNotice(plansResult.error.message);
    else {
      const plans = (plansResult.data ?? []) as EventBlastAdminPlan[];
      setBlastPlans(plans);
      setPlanDrafts(Object.fromEntries(plans.map(plan => [plan.id, {
        name:plan.name, unique_reach:String(plan.unique_reach), duration_minutes:String(plan.duration_minutes),
        price_usd:String(plan.price_usd), bc_price:plan.bc_price == null ? '' : String(plan.bc_price), enabled:plan.enabled,
      }])));
    }
    if (coinPackagesResult.error) setNotice(coinPackagesResult.error.message);
    else {
      const packages = (coinPackagesResult.data ?? []) as CoinPackageAdmin[];
      setCoinPackages(packages);
      setCoinPackageDrafts(Object.fromEntries(packages.map(pack => [pack.id, {
        name:pack.name, coins:String(pack.coins), price_ngn:pack.price_ngn == null ? '' : String(pack.price_ngn), enabled:pack.enabled, sort_order:String(pack.sort_order),
      }])));
    }
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

  async function saveCoinPackage(id: string) {
    if (!supabase) return;
    const draft = coinPackageDrafts[id];
    if (!draft) return;
    const coins = Number(draft.coins), price = draft.price_ngn.trim()==='' ? null : Number(draft.price_ngn), order = Number(draft.sort_order);
    if (!draft.name.trim() || !Number.isSafeInteger(coins) || coins<1 || (price!==null && (!Number.isFinite(price)||price<0)) || !Number.isSafeInteger(order)) {
      setNotice('Check the package name, positive coin amount, price and order before saving.'); return;
    }
    setBusyKey('coin:'+id); setNotice('');
    const { error } = await supabase.rpc('admin_upsert_coin_package', { p_id:id, p_name:draft.name.trim(), p_coins:coins, p_price_ngn:price, p_enabled:draft.enabled, p_sort_order:order });
    if (error) setNotice(error.message);
    else { setNotice(`Saved coin package: ${draft.name}.`); await load(); }
    setBusyKey('');
  }

  async function saveBlastPlan(id: string) {
    if (!supabase) return;
    const draft = planDrafts[id];
    if (!draft) return;
    const reach = Number(draft.unique_reach), duration = Number(draft.duration_minutes), usd = Number(draft.price_usd);
    const bc = draft.bc_price.trim() === '' ? null : Number(draft.bc_price);
    if (!draft.name.trim() || !Number.isSafeInteger(reach) || reach < 1 || !Number.isSafeInteger(duration) || duration < 1 || !Number.isFinite(usd) || usd < 0 || (bc !== null && (!Number.isSafeInteger(bc) || bc < 0))) {
      setNotice('Check the plan name, reach, duration and non-negative prices before saving.'); return;
    }
    setBusyKey('blast:'+id); setNotice('');
    const { error } = await supabase.rpc('admin_upsert_event_blast_plan', {
      p_id:id, p_name:draft.name.trim(), p_unique_reach:reach, p_duration_minutes:duration,
      p_price_usd:usd, p_bc_price:bc, p_enabled:draft.enabled,
    });
    if (error) setNotice(error.message);
    else { setNotice(`Saved Event Blast plan: ${draft.name}.`); await load(); }
    setBusyKey('');
  }

  return <section className="feature-panel admin-panel"><div className="feature-icon">⚙</div><p className="eyebrow">CIRCLE PANDA CONTROL ROOM</p><h2>Economy settings</h2><p className="feature-copy">Reward amounts and message costs are stored in the database, not hard-coded into the interface. Changes here require an administrator role.</p>
    <VipAdminControls />
    {notice && <div className="notice inline-notice">{notice}<button onClick={()=>setNotice('')}>×</button></div>}
    {loading ? <div className="empty-state">Loading settings…</div> : settings.length ? <div className="admin-settings">{settings.map(row=><div className="admin-setting-row" key={row.setting_key}><div><strong>{row.setting_key.replaceAll('_',' ')}</strong><small>Updated {new Date(row.updated_at).toLocaleString()}</small></div><input type="number" min="0" step="1" value={drafts[row.setting_key] ?? String(row.numeric_value)} onChange={e=>setDrafts(prev=>({...prev,[row.setting_key]:e.target.value}))}/><button className="primary-button" disabled={busyKey===row.setting_key || Number(drafts[row.setting_key])===Number(row.numeric_value)} onClick={()=>void save(row.setting_key)}>{busyKey===row.setting_key?'Saving…':'Save'}</button></div>)}</div> : <div className="empty-state"><p>No economy settings were found.</p></div>}
    <section className="admin-coin-packages"><div><p className="eyebrow">WALLET STORE</p><h3>BC coin packages</h3><p className="feature-copy">Set the BC amount and NGN price for each bundle. Checkout stays unavailable until a payment provider is configured.</p></div>{coinPackages.length ? coinPackages.map(pack=>{const draft=coinPackageDrafts[pack.id] || {name:pack.name,coins:String(pack.coins),price_ngn:pack.price_ngn==null?'':String(pack.price_ngn),enabled:pack.enabled,sort_order:String(pack.sort_order)};return <article className="admin-coin-package-row" key={pack.id}><div className="admin-blast-plan-id"><strong>{pack.id} BC package</strong><label><input type="checkbox" checked={draft.enabled} onChange={e=>setCoinPackageDrafts(prev=>({...prev,[pack.id]:{...draft,enabled:e.target.checked}}))}/> Enabled</label></div><div className="admin-coin-package-fields"><label>Package name<input value={draft.name} onChange={e=>setCoinPackageDrafts(prev=>({...prev,[pack.id]:{...draft,name:e.target.value}}))}/></label><label>Coins<input type="number" min="1" step="1" value={draft.coins} onChange={e=>setCoinPackageDrafts(prev=>({...prev,[pack.id]:{...draft,coins:e.target.value}}))}/></label><label>Price (NGN)<input type="number" min="0" step="0.01" value={draft.price_ngn} placeholder="Set price" onChange={e=>setCoinPackageDrafts(prev=>({...prev,[pack.id]:{...draft,price_ngn:e.target.value}}))}/></label><label>Sort order<input type="number" step="1" value={draft.sort_order} onChange={e=>setCoinPackageDrafts(prev=>({...prev,[pack.id]:{...draft,sort_order:e.target.value}}))}/></label></div><button className="primary-button" disabled={busyKey==='coin:'+pack.id} onClick={()=>void saveCoinPackage(pack.id)}>{busyKey==='coin:'+pack.id?'Saving…':'Save package'}</button></article>}) : <div className="empty-state">No coin packages configured.</div>}</section>
    <section className="admin-blast-plans"><div><p className="eyebrow">EVENT PROMOTION</p><h3>Event Blast plans</h3><p className="feature-copy">Set paid reach, duration and BC pricing here. Changes apply to new Event Blasts.</p></div>{blastPlans.length ? blastPlans.map(plan=>{const draft=planDrafts[plan.id] || {name:plan.name,unique_reach:String(plan.unique_reach),duration_minutes:String(plan.duration_minutes),price_usd:String(plan.price_usd),bc_price:plan.bc_price == null?'':String(plan.bc_price),enabled:plan.enabled};return <article className="admin-blast-plan-row" key={plan.id}><div className="admin-blast-plan-id"><strong>{plan.id}</strong><label><input type="checkbox" checked={draft.enabled} onChange={e=>setPlanDrafts(prev=>({...prev,[plan.id]:{...draft,enabled:e.target.checked}}))}/> Enabled</label></div><label>Plan name<input value={draft.name} onChange={e=>setPlanDrafts(prev=>({...prev,[plan.id]:{...draft,name:e.target.value}}))}/></label><div className="admin-blast-plan-fields"><label>Unique reach<input type="number" min="1" step="1" value={draft.unique_reach} onChange={e=>setPlanDrafts(prev=>({...prev,[plan.id]:{...draft,unique_reach:e.target.value}}))}/></label><label>Duration (minutes)<input type="number" min="1" step="1" value={draft.duration_minutes} onChange={e=>setPlanDrafts(prev=>({...prev,[plan.id]:{...draft,duration_minutes:e.target.value}}))}/></label><label>Price (USD)<input type="number" min="0" step="0.01" value={draft.price_usd} onChange={e=>setPlanDrafts(prev=>({...prev,[plan.id]:{...draft,price_usd:e.target.value}}))}/></label><label>Price (BC)<input type="number" min="0" step="1" value={draft.bc_price} placeholder="Unavailable" onChange={e=>setPlanDrafts(prev=>({...prev,[plan.id]:{...draft,bc_price:e.target.value}}))}/></label></div><button className="primary-button" disabled={busyKey==='blast:'+plan.id} onClick={()=>void saveBlastPlan(plan.id)}>{busyKey==='blast:'+plan.id?'Saving…':'Save plan'}</button></article>}) : <div className="empty-state">No Event Blast plans are configured.</div>}</section>
  </section>;
}

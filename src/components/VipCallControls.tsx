import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type IncomingCall = { id: string; thread_id: string; caller_id: string; call_type: 'voice'|'video'; status: string; created_at: string };
type CallRow = { id:string; thread_id:string; caller_id:string; recipient_id:string; call_type:'voice'|'video'; status:string; offer:RTCSessionDescriptionInit|null; answer:RTCSessionDescriptionInit|null };
type CandidateRow = { sender_id:string; candidate:RTCIceCandidateInit };

export default function VipCallControls({ userId, threadId, otherName, otherIsVip }: { userId:string; threadId:string; otherName:string; otherIsVip:boolean }) {
  const [myVip,setMyVip] = useState(false);
  const [incoming,setIncoming] = useState<IncomingCall[]>([]);
  const [active,setActive] = useState<CallRow|null>(null);
  const [kind,setKind] = useState<'voice'|'video'>('voice');
  const [status,setStatus] = useState<'idle'|'ringing'|'connecting'|'connected'|'ended'>('idle');
  const [notice,setNotice] = useState('');
  const [remoteStream,setRemoteStream] = useState<MediaStream|null>(null);
  const [muted,setMuted] = useState(false);
  const [cameraOff,setCameraOff] = useState(false);
  const pcRef = useRef<RTCPeerConnection|null>(null);
  const localRef = useRef<MediaStream|null>(null);
  const callIdRef = useRef('');
  const appliedRef = useRef<Set<string>>(new Set());
  const busyRef = useRef(false);
  const localVideoRef = useRef<HTMLVideoElement|null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement|null>(null);

  useEffect(() => {
    if (!supabase) return;
    let live=true;
    const refresh=async()=>{
      const [{data:profile},{data:calls}]=await Promise.all([
        supabase.from('profiles').select('is_vip,vip_expires_at').eq('id',userId).maybeSingle(),
        supabase.rpc('get_my_incoming_vip_calls')
      ]);
      if(!live)return;
      setMyVip(Boolean(profile?.is_vip)&&(!profile?.vip_expires_at||new Date(profile.vip_expires_at).getTime()>Date.now()));
      setIncoming(((calls??[]) as IncomingCall[]).filter(c=>c.thread_id===threadId));
    };
    void refresh();
    const timer=window.setInterval(()=>void refresh(),3000);
    return()=>{live=false;window.clearInterval(timer);};
  },[userId,threadId]);

  useEffect(()=>{if(localVideoRef.current&&localRef.current)localVideoRef.current.srcObject=localRef.current;},[status,kind]);
  useEffect(()=>{if(remoteVideoRef.current&&remoteStream)remoteVideoRef.current.srcObject=remoteStream;},[remoteStream,status]);

  function cleanup(){
    pcRef.current?.close();pcRef.current=null;
    localRef.current?.getTracks().forEach(t=>t.stop());localRef.current=null;
    setRemoteStream(null);
    if(localVideoRef.current)localVideoRef.current.srcObject=null;
    if(remoteVideoRef.current)remoteVideoRef.current.srcObject=null;
  }

  async function makePeer(id:string){
    const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    pcRef.current=pc;
    pc.ontrack=e=>setRemoteStream(e.streams[0]??null);
    pc.onicecandidate=e=>{if(e.candidate&&supabase)void supabase.rpc('add_vip_call_candidate',{p_call_id:id,p_candidate:e.candidate.toJSON()});};
    pc.onconnectionstatechange=()=>{if(pc.connectionState==='connected')setStatus('connected');if(pc.connectionState==='failed')setNotice('Call connection failed. Check your network and try again.');};
    return pc;
  }

  async function media(type:'voice'|'video'){
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone/camera access is not available in this browser.');
    const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:type==='video'});
    localRef.current=stream;
    if(localVideoRef.current)localVideoRef.current.srcObject=stream;
    return stream;
  }

  async function applySignals(id:string,role:'caller'|'recipient'){
    if(!supabase||!pcRef.current)return;
    const pc=pcRef.current;
    const {data,error}=await supabase.rpc('get_vip_call',{p_call_id:id});
    if(error)throw error;
    const call=data as CallRow;
    setActive(call);
    if(role==='recipient'&&call.offer&&!pc.remoteDescription){
      await pc.setRemoteDescription(new RTCSessionDescription(call.offer));
      const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
      const saved=await supabase.rpc('set_vip_call_answer',{p_call_id:id,p_answer:answer});if(saved.error)throw saved.error;
      setStatus('connecting');
    }
    if(role==='caller'&&call.answer&&!pc.remoteDescription)await pc.setRemoteDescription(new RTCSessionDescription(call.answer));
    const {data:candidates,error:candidateError}=await supabase.rpc('get_vip_call_candidates',{p_call_id:id});
    if(candidateError)throw candidateError;
    for(const item of (candidates??[]) as CandidateRow[]){
      const key=JSON.stringify(item.candidate);
      if(item.sender_id!==userId&&!appliedRef.current.has(key)&&pc.remoteDescription){
        try{await pc.addIceCandidate(new RTCIceCandidate(item.candidate));appliedRef.current.add(key);}catch{/* Retry candidates on the next signal poll. */}
      }
    }
    if(['ended','declined','missed'].includes(call.status)){setStatus('ended');setNotice(call.status==='declined'?'The call was declined.':'The call has ended.');cleanup();}
  }

  async function start(type:'voice'|'video'){
    if(!supabase||busyRef.current)return;busyRef.current=true;setNotice('');
    try{
      if(!myVip)throw new Error('An active VIP membership is required.');
      if(!otherIsVip)throw new Error('VIP calling is available only between active VIP members.');
      setKind(type);setStatus('connecting');
      const {data,error}=await supabase.rpc('start_vip_private_call',{p_thread_id:threadId,p_call_type:type});if(error)throw error;
      const id=(data as {id:string}).id;callIdRef.current=id;
      const pc=await makePeer(id);const stream=await media(type);stream.getTracks().forEach(t=>pc.addTrack(t,stream));
      const offer=await pc.createOffer();await pc.setLocalDescription(offer);
      const saved=await supabase.rpc('set_vip_call_offer',{p_call_id:id,p_offer:offer});if(saved.error)throw saved.error;
      setActive({id,thread_id:threadId,caller_id:userId,recipient_id:'',call_type:type,status:'ringing',offer,answer:null});setStatus('ringing');
    }catch(e){cleanup();setStatus('idle');setNotice(e instanceof Error?e.message:'Unable to start the call.');}
    finally{busyRef.current=false;}
  }

  async function accept(call:IncomingCall){
    if(!supabase||busyRef.current)return;busyRef.current=true;setNotice('');
    try{
      callIdRef.current=call.id;setKind(call.call_type);setStatus('connecting');
      const pc=await makePeer(call.id);const stream=await media(call.call_type);stream.getTracks().forEach(t=>pc.addTrack(t,stream));
      await applySignals(call.id,'recipient');setIncoming(items=>items.filter(item=>item.id!==call.id));
    }catch(e){cleanup();setStatus('idle');setNotice(e instanceof Error?e.message:'Unable to accept the call.');}
    finally{busyRef.current=false;}
  }

  async function end(callStatus:'ended'|'declined'='ended',id=callIdRef.current){
    if(supabase&&id){const {error}=await supabase.rpc('end_vip_private_call',{p_call_id:id,p_status:callStatus});if(error)setNotice(error.message);}
    cleanup();setStatus('ended');setActive(null);setIncoming(items=>items.filter(item=>item.id!==id));callIdRef.current='';
  }

  useEffect(()=>{
    if(!active?.id||!pcRef.current||status==='ended')return;
    const id=active.id;const role=active.caller_id===userId?'caller':'recipient';
    const timer=window.setInterval(()=>void applySignals(id,role).catch(e=>setNotice(e instanceof Error?e.message:'Call signaling failed.')),1200);
    return()=>window.clearInterval(timer);
  },[active?.id,active?.caller_id,userId,status]);

  useEffect(()=>()=>cleanup(),[]);
  return <section className="vip-call-controls">
    <div className="vip-call-heading"><div><strong>VIP private calling</strong><small>{myVip&&otherIsVip?'Voice and video calling between VIP members':'Both members must have active VIP access'}</small></div><span className="vip-call-pill">✦ VIP</span></div>
    {(status==='idle'||status==='ended')&&<div className="vip-call-actions"><button type="button" disabled={!myVip||!otherIsVip} className="vip-gold-button" onClick={()=>void start('voice')}>☎ Voice call</button><button type="button" disabled={!myVip||!otherIsVip} className="vip-gold-button" onClick={()=>void start('video')}>▣ Video call</button></div>}
    {active&&status!=='ended'&&<div className="vip-call-live"><div className="vip-call-video-grid"><video ref={remoteVideoRef} autoPlay playsInline className={kind==='video'?'vip-remote-video':'vip-audio-video'} aria-label="Remote participant"/><video ref={localVideoRef} autoPlay muted playsInline className={kind==='video'?'vip-local-video':'vip-local-preview'} aria-label="Your preview"/></div><p>{status==='ringing'?'Calling '+otherName+'…':status==='connected'?'Connected with '+otherName:'Connecting call…'}</p><div className="vip-call-actions"><button type="button" className="secondary-button" onClick={()=>{localRef.current?.getAudioTracks().forEach(t=>t.enabled=muted);setMuted(v=>!v);}}>{muted?'Unmute':'Mute'}</button>{kind==='video'&&<button type="button" className="secondary-button" onClick={()=>{localRef.current?.getVideoTracks().forEach(t=>t.enabled=cameraOff);setCameraOff(v=>!v);}}>{cameraOff?'Camera on':'Camera off'}</button>}<button type="button" className="vip-call-end" onClick={()=>void end()}>End call</button></div></div>}
    {incoming.map(call=><div className="vip-incoming-call" key={call.id}><span>{call.call_type==='video'?'▣':'☎'} Incoming VIP {call.call_type} call</span><div><button type="button" className="vip-gold-button" onClick={()=>void accept(call)}>Accept</button><button type="button" className="secondary-button" onClick={()=>void end('declined',call.id)}>Decline</button></div></div>)}
    {notice&&<p className="vip-call-notice" role="status">{notice}</p>}
  </section>;
}

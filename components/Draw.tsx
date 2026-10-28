'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicStatus } from '../lib/types';
import { FlockSimulation, type FlyingDuck } from '../lib/flocking';

type Phase = 'idle' | 'sniff' | 'flight' | 'shot' | 'retrieve' | 'winner';
const labels: Record<Phase, string> = { idle: 'READY WHEN YOU ARE', sniff: 'THE HUNT IS ON', flight: 'A LITTLE LUCK IN THE AIR', shot: 'NICE SHOT!', retrieve: 'LOOK WHAT WE FOUND', winner: 'WE HAVE A WINNER' };
const duck = [
'......GGGG......','.....GGGGGG.....','.....GKWWGO.....','......GGG.OOO...','....WWWW........','...WWPPWW.......','..KKPPPPWW......','.KKKPPPPPWW.....','..KKPPPPPWW.....','...KKKKKKK......','.....OO.OO......'];
const wing = ['....W....','...WWW...','..WWPW...','.WWPPW...','WWPPPW...','.WWPP....','..WW.....'];
const dogSniff = [
'..BB..............................',
'.BDD..............................',
'..BDD.................BBBBBB......',
'...DDDDDDDDDDDD......BBDDDDBB.....',
'...DDDDDDDDDDDDD....BDDDDDDDDB....',
'..DDDDDDDDDDDDDDD..BDDDWKWDDDB....',
'..DDDDDDDDDDDDDDDDDDDDWWWWDDD....',
'..DDDDDDDDDDDDDDDDDBDDWWWWWWKK...',
'..DDDDDDDDDDDDDDDDDBBDWWWWWWKK...',
'...DDDDDDWWDDDDDDDDDBBDWWWWW.....',
'....DDDWWWWWDDDDDDDDDBBWWW.......',
'....DDDWWWWWDDDDDDDDDBB..........',
'....DDD..WWW.....DDDD............',
'....DDD..WW......DDDD............',
'....DDD..WW......DD.DD...........',
'...DDDD.WWW.....DDD.DDD..........',
'...WWWW.WWW.....WWW.WWW..........'];
const dog = [
'......BBBB......BBBB......',
'.....BBDDDDDDDDDDDDBB.....',
'....BBDDDDDDDDDDDDDDBB....',
'...BBDDDDDDDDDDDDDDDDBB...',
'...BBDDDDDDDDDDDDDDDDBB...',
'...BBDDDKKDDDDDDKKDDDBB...',
'...BBDDDKWDDDDDDWKDDDBB...',
'...BBDDDDDWWWWWWDDDDDBB...',
'...BBBDDWWWWWWWWWWDDBBB...',
'...BBBDDWWWKKKKWWWDDBBB...',
'....BBBDWWWKKKKWWWDBBB....',
'.....BBDDWWWWWWWWDDBB.....',
'.......DDDWWKKWWDDD.......',
'........DDDWWWWDDD........',
'.......DDDDDDDDDDDD.......',
'......DDDDWWWWWWDDDD......',
'.....DDDDWWWWWWWWDDDD.....',
'....DDDDWWWWWWWWWWDDDD....',
'...DDDD.WWWWWWWWWW.DDDD...',
'..DDDD..WWWWWWWWWW..DDDD..',
'..WWW...WWWWWWWWWW...WWW..',
'..WWW...DWWWWWWWWD...WWW..',
'........DDWWWWWWDD........',
'........DDDDDDDDDD........'];
const spriteCache = new Map<string, HTMLCanvasElement>();
let idleNameCache: { key: string; window: number; names: string[] } | null = null;
const palette: Record<string,string> = {G:'#157644',K:'#162c2b',W:'#fff4d3',O:'#ef9a38',P:'#ad4278',B:'#553d2e',D:'#bd692f'};

function sprite(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, scale=2, flip=false, bodyColor?:string) {
  const key=`${rows.join('|')}:${bodyColor??''}`;let bitmap=spriteCache.get(key);
  if(!bitmap){bitmap=document.createElement('canvas');bitmap.width=Math.max(...rows.map(r=>r.length));bitmap.height=rows.length;const pixels=bitmap.getContext('2d')!;const colors={...palette,P:bodyColor??palette.P};rows.forEach((row,j)=>[...row].forEach((p,i)=>{if(colors[p]){pixels.fillStyle=colors[p];pixels.fillRect(i,j,1,1);}}));spriteCache.set(key,bitmap);}
  const width=Math.round(bitmap.width*scale),height=Math.round(bitmap.height*scale);
  ctx.save();ctx.translate(Math.round(x),Math.round(y));if(flip){ctx.scale(-1,1);ctx.translate(-width,0);}ctx.drawImage(bitmap,0,0,width,height);ctx.restore();
}
function random(seed:number) { const value=Math.sin(seed*12.9898)*43758.5453;return value-Math.floor(value); }
function shortName(name:string) { return name.length>19?`${name.slice(0,18)}…`:name; }
function duckColor(name:string) { const code=(name.trim().charAt(0).toUpperCase().charCodeAt(0)||65)-65;if(code<5)return '#ef7c3d';if(code<10)return '#e4b936';if(code<15)return '#4ba95d';if(code<20)return '#4b86c3';return '#ad5bb5'; }
function duckScale(name:string) { return Math.round(Math.min(2.5,1.45+Math.min(name.length,35)*.032)*4)/4; }
function scene(ctx: CanvasRenderingContext2D, w: number, h: number, now: number, phase: Phase, elapsed: number, birds: FlyingDuck[], targetDuck: number, eligibleNames: string[], promoQr: HTMLImageElement | null) {
  const ground=h-30; const rect=(x:number,y:number,a:number,b:number,c:string)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.ceil(a),Math.ceil(b));};
  rect(0,0,w,h,'#3fb8f4');
  // A few deliberately blocky, quiet clouds.
  for(let i=0;i<3;i++){const x=(w*.30+i*w*.29+now*1.3)%(w+140)-70;const y=36+i%2*32;rect(x,y,40,8,'#8bd9f7');rect(x+9,y-6,23,8,'#8bd9f7');}
  // The registration invitation belongs to the resting field only. Once a
  // draw begins, the scene is intentionally clear for the duck sequence.
  if(phase==='idle'&&promoQr){const cardW=Math.min(188,w*.28),cardH=184,cardX=w-cardW-18,cardY=18,qrSize=108,qrX=cardX+(cardW-qrSize)/2,qrY=cardY+57;rect(cardX,cardY,cardW,cardH,'#fffdf5');rect(cardX,cardY,cardW,4,'#173025');rect(cardX,cardY+cardH-4,cardW,4,'#173025');rect(cardX,cardY,4,cardH,'#173025');rect(cardX+cardW-4,cardY,4,cardH,'#173025');ctx.save();ctx.textAlign='center';ctx.fillStyle='#426438';ctx.font='bold 7px monospace';ctx.fillText('DAFTAR UNTUK CABUTAN BERTUAH',cardX+cardW/2,cardY+16);ctx.fillStyle='#173025';ctx.font='bold 8px monospace';ctx.fillText('JALINAN KASIH ZON',cardX+cardW/2,cardY+29);ctx.fillText('SEGAMAT BARU',cardX+cardW/2,cardY+39);ctx.drawImage(promoQr,Math.round(qrX),qrY,qrSize,qrSize);ctx.fillStyle='#426438';ctx.font='bold 7px monospace';ctx.fillText('IMBAS UNTUK DAFTAR',cardX+cardW/2,cardY+177);ctx.restore();}
  // Trunk and angular branches.
  const tx=w*.14;
  ctx.save();ctx.translate(tx,ground);const treeScale=Math.min(1,(ground-18)/250);ctx.scale(treeScale,treeScale);ctx.translate(-tx,-ground);
  ctx.strokeStyle='#71452c';ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(tx,ground+10);ctx.lineTo(tx-10,ground-100);ctx.lineTo(tx-22,ground-211);ctx.stroke();
  ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(tx-8,ground-88);ctx.lineTo(tx+38,ground-155);ctx.lineTo(tx+43,ground-208);ctx.moveTo(tx-14,ground-134);ctx.lineTo(tx-54,ground-175);ctx.stroke();
  const leaves=(x:number,y:number,r:number)=>{for(let j=-r;j<=r;j+=4)for(let i=-r;i<=r;i+=4){if(i*i+j*j<r*r){const shade=(i*13+j*7)%17;rect(x+i,y+j,4,4,shade< -6?'#227b31':shade>8?'#b7d92f':'#65b92d');}}};
  leaves(tx-23,ground-218,28);leaves(tx+43,ground-211,22);leaves(tx-55,ground-175,21);leaves(tx+27,ground-139,27);leaves(tx-12,ground-162,17);
  ctx.restore();
  // Low hedges, with deterministic pixels (no frame-to-frame visual noise).
  for(let x=0;x<w;x+=4){const height=10+Math.sin(x*.019)*9+Math.sin(x*.051)*5;rect(x,ground-height,4,height+12,'#43a834');}
  for(let i=0;i<4;i++)leaves(w*.82+(i%2)*14,ground-14-i*11,25-i*3);
  if(phase==='idle') {
    // Keep the field readable: at most 30 eligible people are walking at once.
    // A duck travels completely beyond an edge before that slot receives a new,
    // randomly selected participant and direction for its next crossing.
    // A shuffled, deduplicated roster is shared by every walking slot. This
    // prevents the same name appearing on two ducks at once, even as slots
    // independently enter and leave the field.
    const rosterKey=eligibleNames.join('\u0000');const rosterWindow=Math.floor(now/30);
    if(!idleNameCache||idleNameCache.key!==rosterKey||idleNameCache.window!==rosterWindow){const names=[...new Set(eligibleNames)];for(let j=names.length-1;j>0;j--){const swap=Math.floor(random(rosterWindow*997+j*31)* (j+1));[names[j],names[swap]]=[names[swap],names[j]];}idleNameCache={key:rosterKey,window:rosterWindow,names};}
    const roster=idleNameCache.names;const total=roster.length;const visible=Math.min(total,30);const cycleLength=17;
    for(let i=0;i<visible;i++){const shifted=now+i*.53;const crossing=Math.floor(shifted/cycleLength);const elapsed=shifted-crossing*cycleLength;const journey=8+random(crossing*43+i*17)*7;if(elapsed>journey)continue;const progress=elapsed/journey;const fromLeft=random(crossing*101+i*37)>.5;const x=(fromLeft?progress:1-progress)*(w+120)-60;const left=!fromLeft;const name=roster[i];const scale=duckScale(name);const walking=Math.sin(now*10+i)>0;const y=ground-2-11*scale+(walking?0:1);sprite(ctx,duck,x,y,scale,left,duckColor(name));rect(x+(walking?5.5*scale:9*scale),ground-3,Math.max(3,2.5*scale),2,'#ef9a38');const label=shortName(name);ctx.save();ctx.font='bold 10px monospace';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#11271e';ctx.strokeText(label,x+8*scale,y-7);ctx.fillStyle='#fff4d3';ctx.fillText(label,x+8*scale,y-7);ctx.restore();}
  }
  if(phase==='sniff') {
    const x=-85+Math.min(1,elapsed/1100)*(w*.35+85);const bob=Math.sin(now*14)>0?1:0;
    sprite(ctx,dogSniff,x,ground-35+bob,2.5);
    // Alternating paws and a small sniff puff, rather than rotating the whole dog.
    rect(x+15+(bob?3:0),ground+2,9,4,'#fff4d3');rect(x+65-(bob?3:0),ground+2,9,4,'#fff4d3');
    if(elapsed>1100&&Math.sin(now*10)>0){rect(x+89,ground-13,3,3,'#fff4d3');rect(x+95,ground-17,2,2,'#fff4d3');}
  }
  if(phase==='flight'||phase==='shot') {
    for(let i=0;i<birds.length;i++){
      const p=birds[i];const facingLeft=Math.cos(p.heading)<0;
      let {x,y}=p;const target=i===targetDuck;
      if(phase==='flight')y+=Math.max(0,1-(elapsed/1000-p.launchDelay)/.35)*34;
      if(phase==='shot'){if(target)y+=Math.pow(elapsed/1000,2)*(h*2);else{y-=elapsed*.75;x+=Math.cos(p.heading)*elapsed*.3;}}
      if(y< -30||y>ground+30||x< -30||x>w+30)continue;
      sprite(ctx,duck,x,y,p.scale,facingLeft);
      if(phase==='flight'||!target){const flap=Math.sin(now*24+i)>0;sprite(ctx,wing,x+4*p.scale,y+(flap?-6:3)*p.scale,p.scale,facingLeft);}
      if(phase==='shot'&&target&&elapsed<180){rect(x-6,y-6,3,3,'#fff4d3');rect(x+21,y,5,3,'#fff4d3');}
    }
  }
  // Grass foreground hides the actors as they enter and leave the bushes.
  rect(0,ground+2,w,h-ground,'#82bf2c');
  for(let x=0;x<w;x+=5){const ht=5+((x*17)%13);rect(x,ground-ht+8,3,ht,'#82bf2c');if(x%3===0)rect(x+1,ground-ht+6,2,5,'#d5e751');}
  if(phase==='retrieve'||phase==='winner') {
    const rise=phase==='winner'?1:Math.min(1,elapsed/650);
    ctx.save();ctx.beginPath();ctx.rect(0,0,w,ground+8);ctx.clip();
    const dogY=ground+12-rise*91;
    sprite(ctx,dog,w/2-39,dogY,3);
    // Raised paw and limp duck held by its feet, away from the dog's face.
    rect(w/2+32,dogY+40,9,20,'#bd692f');rect(w/2+32,dogY+35,10,8,'#fff4d3');
    ctx.save();ctx.translate(w/2+39,dogY+37);ctx.rotate(Math.PI);sprite(ctx,duck,-16,-24,1.7,true);ctx.restore();ctx.restore();
  }
  if(phase==='shot'&&elapsed<75)rect(0,0,w,h,'#fff8df');
}

export default function Draw() {
  const canvas=useRef<HTMLCanvasElement>(null);const screen=useRef<HTMLDivElement>(null);
  const promoQr=useRef<HTMLImageElement|null>(null);
  const flock=useRef<{key:string;simulation:FlockSimulation} | null>(null);
  const timing=useRef({phase:'idle' as Phase,start:0}); const audio=useRef<AudioContext|null>(null);const muted=useRef(true);
  const [phase,setPhase]=useState<Phase>('idle');const [sound,setSound]=useState(false);const [round,setRound]=useState(0);const [full,setFull]=useState(false);const [status,setStatus]=useState<PublicStatus>({eligibleCount:0,totalCount:0,eligibleNames:[],activeDraw:null});const [completionError,setCompletionError]=useState('');const [completing,setCompleting]=useState(false);
  const tone=useCallback((freq:number,duration:number,type:OscillatorType='square',volume=.025)=>{
    if(muted.current||!audio.current)return;const ac=audio.current;const oscillator=ac.createOscillator();const gain=ac.createGain();oscillator.type=type;oscillator.frequency.setValueAtTime(freq,ac.currentTime);oscillator.frequency.exponentialRampToValueAtTime(Math.max(40,freq*.45),ac.currentTime+duration);gain.gain.setValueAtTime(volume,ac.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ac.currentTime+duration);oscillator.connect(gain);gain.connect(ac.destination);oscillator.start();oscillator.stop(ac.currentTime+duration);
  },[]);
  const noise=useCallback((duration:number,volume:number)=>{if(muted.current||!audio.current)return;const ac=audio.current;const buffer=ac.createBuffer(1,Math.ceil(ac.sampleRate*duration),ac.sampleRate);const data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);const source=ac.createBufferSource();const filter=ac.createBiquadFilter();const gain=ac.createGain();filter.type='highpass';filter.frequency.value=700;gain.gain.setValueAtTime(volume,ac.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ac.currentTime+duration);source.buffer=buffer;source.connect(filter);filter.connect(gain);gain.connect(ac.destination);source.start();source.stop(ac.currentTime+duration);},[]);
  const change=useCallback((next:Phase)=>{timing.current={phase:next,start:performance.now()};setPhase(next);},[]);
  const enableSound=useCallback(async()=>{if(!audio.current){const Context=window.AudioContext||(window as typeof window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;if(!Context)return;audio.current=new Context();}await audio.current.resume();muted.current=false;setSound(true);},[]);
  useEffect(()=>()=>{void audio.current?.close();},[]);
  useEffect(()=>{const image=new Image();image.src='/registration-qr.png';image.onload=()=>{promoQr.current=image;};return()=>{image.onload=null;};},[]);
  useEffect(()=>{if(!sound)return;const timers:number[]=[];const later=(fn:()=>void,delay:number)=>timers.push(window.setTimeout(fn,delay));if(phase==='sniff'){noise(.09,.018);later(()=>noise(.07,.012),420);later(()=>tone(138,.08,'triangle',.025),840);}if(phase==='shot'){noise(.18,.12);tone(98,.32,'sawtooth',.09);later(()=>tone(460,.48,'square',.03),110);}if(phase==='retrieve'){tone(180,.12,'square',.035);later(()=>tone(220,.12,'square',.035),180);later(()=>tone(160,.16,'triangle',.03),480);}if(phase==='winner'){[523,659,784,1047].forEach((note,index)=>later(()=>tone(note,.22,'square',.045),index*150));}return()=>timers.forEach(window.clearTimeout);},[noise,phase,sound,tone]);
  useEffect(()=>{if(!sound||phase!=='flight')return;const melody=[262,0,330,0,392,330,294,0,262,0,392,0,440,392,330,0];let index=0;const play=()=>{const note=melody[index++%melody.length];if(note)tone(note,.17,'square',.012);};play();const music=window.setInterval(play,300);const wings=window.setInterval(()=>tone(760,.045,'triangle',.006),650);return()=>{window.clearInterval(music);window.clearInterval(wings);};},[phase,sound,tone]);
  useEffect(()=>{
    let raf=0;const durations:Partial<Record<Phase,number>>={sniff:2100,shot:850,retrieve:1700};
    const next:Partial<Record<Phase,Phase>>={sniff:'flight',shot:'retrieve',retrieve:'winner'};
    function frame(now:number){const c=canvas.current;const state=timing.current;if(c){const ctx=c.getContext('2d');if(ctx){ctx.imageSmoothingEnabled=false;const flockSize=status.activeDraw?.eligibleCount ?? status.eligibleCount;const drawId=status.activeDraw?.id ?? 0;const targetDuck=flockSize ? drawId % flockSize : 0;let birds:FlyingDuck[]=[];if(state.phase==='flight'||state.phase==='shot'){const key=`${drawId}:${flockSize}:${c.width}:${c.height}`;if(flock.current?.key!==key)flock.current={key,simulation:new FlockSimulation(flockSize,c.width,c.height-30,drawId)};birds=flock.current.simulation.advanceTo(state.phase==='shot'?2.5:(now-state.start)/1000);}else if(state.phase==='idle'||state.phase==='sniff')flock.current=null;scene(ctx,c.width,c.height,now/1000,state.phase,now-state.start,birds,targetDuck,status.eligibleNames??[],promoQr.current);}}
      if(durations[state.phase]&&now-state.start>=durations[state.phase]!)change(next[state.phase]!);raf=requestAnimationFrame(frame);}
    raf=requestAnimationFrame(frame);return()=>cancelAnimationFrame(raf);
  },[change,status]);
  useEffect(()=>{const el=canvas.current;if(!el)return;const resize=new ResizeObserver(()=>{el.width=768;el.height=Math.max(290,Math.round(768*el.clientHeight/el.clientWidth));});resize.observe(el);return()=>resize.disconnect();},[]);
  useEffect(()=>{const fn=()=>setFull(Boolean(document.fullscreenElement));document.addEventListener('fullscreenchange',fn);return()=>document.removeEventListener('fullscreenchange',fn);},[]);
  useEffect(()=>{let cancelled=false;const refresh=async()=>{try{const response=await fetch('/api/status',{cache:'no-store'});if(response.ok&&!cancelled)setStatus(await response.json());}catch{}};void refresh();const timer=window.setInterval(refresh,1000);return()=>{cancelled=true;window.clearInterval(timer);};},[]);
  useEffect(()=>{const draw=status.activeDraw;if(!draw){if(timing.current.phase!=='idle')change('idle');return;}setRound(draw.id);if(draw.status==='flocking'){const elapsed=Math.max(0,Date.now()-new Date(draw.startedAt).getTime());const next:Phase=elapsed<2100?'sniff':'flight';if(timing.current.phase!==next){timing.current={phase:next,start:performance.now()-(next==='sniff'?elapsed:Math.min(2500,elapsed-2100))};setPhase(next);}return;}if(timing.current.phase==='flight'||timing.current.phase==='sniff'){change('shot');return;}if(timing.current.phase!=='idle')return;let elapsed=draw.shotAt?Math.max(0,Date.now()-new Date(draw.shotAt).getTime()):Infinity;let next:Phase='winner';let phaseElapsed=0;for(const [candidate,duration] of [['shot',850],['retrieve',1700]] as Array<[Phase,number]>){if(elapsed<duration){next=candidate;phaseElapsed=elapsed;break;}elapsed-=duration;}timing.current={phase:next,start:performance.now()-phaseElapsed};setPhase(next);},[status.activeDraw,change]);
  const close=async()=>{const draw=status.activeDraw;if(!draw)return;setCompleting(true);setCompletionError('');try{const response=await fetch(`/api/draws/${draw.id}/complete`,{method:'POST'});const body=await response.json().catch(()=>null);if(!response.ok||!body?.ok){setCompletionError(body?.error??'Could not complete this draw. Please try again.');return;}change('idle');setStatus(current=>({...current,activeDraw:null,eligibleCount:Math.max(0,current.eligibleCount)}));}catch{setCompletionError('Could not reach the draw service. Please try again.');}finally{setCompleting(false);}};
  const fullscreen=async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await screen.current?.requestFullscreen();};
  const flockSize=status.activeDraw?.eligibleCount ?? status.eligibleCount;const busy=phase!=='idle'&&phase!=='winner';
  return <main ref={screen} className="draw-app">
    <section className="field" aria-label="Duck Hunt lucky draw stage" data-phase={phase} data-flock-size={flockSize}>
      <canvas ref={canvas} aria-label={`Pixel art hunting scene: ${labels[phase]}`}/>
      <div className="game-tools">
        <button onClick={()=>void(sound?(muted.current=true,setSound(false)):enableSound())} aria-label={sound?'Mute sound':'Enable sound'} title={sound?'Mute sound':'Enable sound'}>{sound?'♪':'♩'}</button>
        <button onClick={()=>void fullscreen()} aria-label="Toggle fullscreen" title={full?'Exit fullscreen':'Fullscreen'}>⛶</button>
      </div>
      {phase==='winner'&&<div className="modal-backdrop"><section className="winner-modal" role="dialog" aria-modal="true" aria-labelledby="winner-title">
        <p className="winner-eyebrow">★ WINNER ★</p><h1 id="winner-title">NICE SHOT!</h1>
        <p className="winner-name">{status.activeDraw?.winner?.fullName??'Winner'}</p><p className="winner-phone">{status.activeDraw?.winner?.maskedPhone??'—'}</p>
        <p className="fictional">Lucky draw #{String(round).padStart(2,'0')}</p>
        {completionError&&<p className="stage-error" role="alert">{completionError}</p>}<button className="primary" autoFocus onClick={()=>void close()} disabled={completing}>{completing?'SAVING…':'BACK TO THE FIELD'}</button>
      </section></div>}
    </section>
    <div className="hud">
      <div className="hud-round"><small>ROUND</small><strong>{round ? String(round).padStart(2,'0') : '--'}</strong></div>
      <div className="hud-flock"><small>DUCKS</small><strong>{flockSize}</strong></div>
      <div className="hud-status" aria-live="polite">{status.activeDraw ? labels[phase] : 'AWAITING ADMIN'}</div>
      <div className="stage-live">{busy ? 'DRAWING…' : status.activeDraw ? 'LIVE DRAW' : 'REGISTRATION OPEN'}</div>
    </div>
  </main>;
}

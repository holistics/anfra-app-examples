/* What you hear: the lyre, the river and its weather, both, or nothing.
   Carried across from apps/nether: one AudioContext and master gain, a lyre
   score scheduled a second ahead on a steady timer (never a note per timer
   tick, which is what used to run dry), and the context resumed on any gesture
   or when the tab comes back. */
window.NetherSound=(()=>{
 let ctx=null,master=null,musicGain=null,timer=null,nextNoteTime=0,step=0,mode='off',musicLevel=.18,riverLevel=.35;
 const wantsMusic=()=>mode==='music'||mode==='both',wantsRiver=()=>mode==='river'||mode==='both';
 function buildMusic(){
  musicGain=ctx.createGain();musicGain.gain.value=0;musicGain.connect(master);
  const reverb=ctx.createConvolver(),length=ctx.sampleRate*3.4,impulse=ctx.createBuffer(2,length,ctx.sampleRate);
  for(let c=0;c<2;c++){const v=impulse.getChannelData(c);let smooth=0;for(let i=0;i<length;i++){smooth=smooth*.6+(Math.random()*2-1)*.4;v[i]=smooth*Math.pow(1-i/length,3)*.4;}}
  reverb.buffer=impulse;const wet=ctx.createGain();wet.gain.value=.38;reverb.connect(wet);wet.connect(musicGain);musicGain.reverb=reverb;
 }
 function playLyre(midi,at,duration=3,amplitude=.08){
  const osc=ctx.createOscillator(),env=ctx.createGain(),filter=ctx.createBiquadFilter(),harmonics=new Float32Array([0,1,.26,.1,.045,.018]);
  osc.setPeriodicWave(ctx.createPeriodicWave(new Float32Array(harmonics.length),harmonics));osc.frequency.value=440*Math.pow(2,(midi-69)/12);
  filter.type='lowpass';filter.frequency.setValueAtTime(2600,at);filter.frequency.exponentialRampToValueAtTime(500,at+duration);
  env.gain.setValueAtTime(.0001,at);env.gain.exponentialRampToValueAtTime(amplitude,at+.025);env.gain.exponentialRampToValueAtTime(.0001,at+duration);
  osc.connect(filter);filter.connect(env);env.connect(musicGain);env.connect(musicGain.reverb);osc.start(at);osc.stop(at+duration+.1);
  osc.onended=()=>{osc.disconnect();filter.disconnect();env.disconnect();};
 }
 function schedule(){
  if(!ctx||!wantsMusic()||document.hidden||ctx.state!=='running')return;
  const now=ctx.currentTime;if(nextNoteTime<now)nextNoteTime=now+.1;
  while(nextNoteTime<now+1.2){
   const phrase=Math.floor(step/12),beat=step%12,root=[50,46,43,45][Math.floor(phrase/2)%4];
   const motifs=[[0,7,12,10,7,3,5,7,3,2,0,7],[12,10,7,5,3,7,10,14,12,7,5,2],[0,3,7,14,12,10,7,5,3,2,5,0],[7,12,15,14,10,7,5,3,7,2,0,0]];
   if(beat===0)playLyre(root-12,nextNoteTime,6,.055);
   if((step*7+phrase)%9!==4&&beat!==11)playLyre(root+motifs[phrase%4][beat],nextNoteTime,2.8+beat%3*.35,.055+(beat===0?.015:0));
   nextNoteTime+=beat===10?2.4:beat%3===2?1.35:1.05;step++;
  }
 }
 /* Short synthesized cues for the desk. Quiet by design: the lyre and river stay the scene. */
 function noise(duration){const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate),v=buffer.getChannelData(0);for(let i=0;i<v.length;i++)v[i]=(Math.random()*2-1)*Math.pow(1-i/v.length,2);const source=ctx.createBufferSource();source.buffer=buffer;return source;}
 function tone(type,freq,at,duration,amplitude,freqEnd){
  const osc=ctx.createOscillator(),env=ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,at);if(freqEnd)osc.frequency.exponentialRampToValueAtTime(freqEnd,at+duration);
  env.gain.setValueAtTime(.0001,at);env.gain.exponentialRampToValueAtTime(amplitude,at+.015);env.gain.exponentialRampToValueAtTime(.0001,at+duration);
  osc.connect(env);env.connect(master);osc.start(at);osc.stop(at+duration+.05);osc.onended=()=>{osc.disconnect();env.disconnect();};
 }
 function cue(name){
  if(!ctx||mode==='off'||document.hidden||ctx.state!=='running')return;
  const at=ctx.currentTime+.01;
  if(name==='stamp'){tone('sine',110,at,.28,.5,38);const hit=noise(.12),filter=ctx.createBiquadFilter(),gain=ctx.createGain();filter.type='lowpass';filter.frequency.value=900;gain.gain.value=.45;hit.connect(filter);filter.connect(gain);gain.connect(master);hit.start(at);hit.onended=()=>{hit.disconnect();filter.disconnect();gain.disconnect();};}
  else if(name==='bell'){tone('sine',587,at,2.2,.2);tone('sine',1231,at+.008,1.6,.12);tone('sine',1757,at+.012,1.1,.065);tone('sine',2471,at+.016,.7,.035);}
  else if(name==='match'){tone('sine',784,at,.5,.16);tone('sine',1175,at+.11,.7,.14);}
  else if(name==='mismatch'){tone('triangle',196,at,.55,.2);tone('triangle',207.7,at,.55,.2);}
  else if(name==='paper'){const rustle=noise(.14),filter=ctx.createBiquadFilter(),gain=ctx.createGain();filter.type='bandpass';filter.frequency.value=2600;filter.Q.value=.7;gain.gain.value=.22;rustle.connect(filter);filter.connect(gain);gain.connect(master);rustle.start(at);rustle.onended=()=>{rustle.disconnect();filter.disconnect();gain.disconnect();};}
  else if(name==='tick')tone('sine',520,at,.12,.1);
 }
 function ensure(){
  if(ctx)return true;
  try{
   const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return false;
   ctx=new Audio();master=ctx.createGain();master.gain.value=0;master.connect(ctx.destination);
   if(typeof netherWeather!=='undefined')netherWeather.attach(ctx,master).catch(e=>console.warn(e.message));  // a top-level const, so not window.netherWeather
   buildMusic();timer=setInterval(schedule,250);return true;
  }catch{ctx=null;return false;}
 }
 function apply(){
  if(!ctx)return;const t=ctx.currentTime;
  master.gain.setTargetAtTime(mode!=='off'&&!document.hidden?.6:0,t,.5);
  musicGain.gain.setTargetAtTime(wantsMusic()?musicLevel:0,t,.3);
  netherWeather.setSound(wantsRiver());netherWeather.setVolume(wantsRiver()?riverLevel:0);
 }
 function wake(){
  if(!ctx||mode==='off')return;
  if(ctx.state!=='running')ctx.resume().then(()=>{nextNoteTime=ctx.currentTime+.1;schedule();}).catch(()=>{});
 }
 function set(next){
  mode=next;
  if(mode!=='off'&&!ensure()){mode='off';return false;}
  apply();wake();schedule();return true;
 }
 // Browsers only let audio start from a gesture, and may suspend it again later.
 for(const type of ['pointerdown','keydown'])document.addEventListener(type,wake,{capture:true});
 document.addEventListener('visibilitychange',()=>{apply();if(!document.hidden){if(ctx)nextNoteTime=ctx.currentTime+.1;wake();}});
 document.addEventListener('input',e=>{
  if(e.target.id==='score-volume')musicLevel=e.target.value/100;
  else if(e.target.id==='weather-volume')riverLevel=e.target.value/100;
  else return;apply();
 });
 return {set,cue,get mode(){return mode;},get running(){return ctx?.state==='running';},get step(){return step;}};
})();

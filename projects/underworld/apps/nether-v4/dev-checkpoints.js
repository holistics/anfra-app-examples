/* Named previews reuse the real conversations, checklist and case lifecycle. */
window.NetherDevCheckpoints=(()=>{
 const entries=[
  {id:'ferry-ledger',group:'Ferry → Court',label:'Final ferry case · Ledger',hint:'Close the last ledger, dismiss the day messages, then meet Minos.'},
  {id:'court-handoff',group:'Ferry → Court',label:'Charon & Minos · Handoff',hint:'Replay the conversation offering Eury the court work.'},
  {id:'court-entrance',group:'Ferry → Court',label:'Court entrance · Click to enter',hint:'Arrive outside the court with its entrance highlighted.'},
  {id:'court-guide',group:'Ferry → Court',label:'Minos · Court guide',hint:'Replay Minos’s introduction at the bottom right.'},
  {id:'court-feather',group:'Judgment checklist',label:'Feather · Highlighted',hint:'Start at the step that points to the feather and opens the scroll.'},
  {id:'checklist-open',group:'Judgment checklist',label:'Checklist · Two questions',hint:'A fresh court trial with five attempts available.'},
  {id:'checklist-hints',group:'Judgment checklist',label:'Checklist · Hints',hint:'Open the scroll with its metric and chart-tool hints expanded.'},
  {id:'checklist-retry',group:'Judgment checklist',label:'Checklist · One failed trial',hint:'Show 1/5 trials used, with Approve still locked.'},
  {id:'checklist-solved',group:'Judgment checklist',label:'Checklist · Approve unlocked',hint:'Resolve both answers from the Books and unlock the approve stamp.'},
  {id:'checklist-exhausted',group:'Case results',label:'Checklist · Five failed trials',hint:'Show the exhausted scroll. Continue files the case as pending.'},
  {id:'pending-ledger',group:'Case results',label:'Pending case · Ledger',hint:'Criteria not met, no stamp or Light reward, ready for review.'},
  {id:'approved-ledger',group:'Case results',label:'Approved case · Ledger',hint:'Review a correctly completed court case and its reward.'},
  {id:'next-soul',group:'Case results',label:'Next soul · Blinking bell',hint:'Documents returned and ledger reviewed. Ring the highlighted bell.'},
 ];
 async function run(id,g){
  if(!entries.some(e=>e.id===id))return false;
  g.clear();
  const cases=g.cases(),court=cases.find(c=>c.phase==='pavilion'),ferry=cases.filter(c=>c.phase==='ferry').at(-1);
  const needsClean=['checklist-solved','approved-ledger','next-soul'].includes(id);
  const c=id==='ferry-ledger'?ferry:needsClean?(cases.find(c=>c.phase==='pavilion'&&c.requiredVerdict==='approve')||court):court;
  if(!c)throw Error('This run has no case for that checkpoint.');
  g.completeBefore(c);
  if(id==='court-handoff'||id==='court-entrance'){
   g.setResult(c.id,'waiting');
   g.activate(c.id);g.go('map');NetherOnboarding.previewCourt(id==='court-handoff'?'conversation':'entrance');return true;
  }
  g.setResult(c.id,['ferry-ledger','approved-ledger','next-soul'].includes(id)?'correct':'waiting');
  g.activate(c.id);g.go(id==='ferry-ledger'?'desk':'marsh');
  const s=g.state(),mission=c.phase==='pavilion'?NetherPavilion.checklistOf(c,s):null;
  if(['ferry-ledger','approved-ledger'].includes(id)){g.showLedger(c,s);return true;}
  if(id==='next-soul')return true;
  if(id==='court-guide'||id==='court-feather'){NetherCourtOnboarding.show(id==='court-feather'?1:0);return true;}
  if(id==='checklist-solved'){
   const questions=NetherPavilion.questionsFor(c),truth=await Promise.all(questions.map(q=>g.ask(q)));
   if(g.state()!==s)return true;
   if(truth.some(t=>t?.status!=='rows'||t.value==null||!Number.isFinite(Number(t.value))))throw Error('The Books could not resolve this checkpoint. Try again.');
   mission.answers=truth.map((t,i)=>questions[i].decimals?Number(t.value).toFixed(questions[i].decimals):String(t.value));
   const result=await NetherPavilion.submitChecklist(c,s);
   if(!result.ok||!result.correct)throw Error(result.why||'The checklist could not be completed.');
   s.stampPrompt=true;
  }
  if(['checklist-retry','checklist-exhausted','pending-ledger'].includes(id)){
   mission.answers=['-1','-1'];mission.results=[false,false];mission.correct=false;
   mission.attempts=id==='checklist-retry'?1:NetherPavilion.MAX_TRIALS;s.answerCorrect=false;
  }
  if(id==='pending-ledger'){g.park(c,s);return true;}
  if(id==='checklist-hints')mission.hints=true;
  g.refresh();g.openChecklist();return true;
 }
 return {entries,run};
})();

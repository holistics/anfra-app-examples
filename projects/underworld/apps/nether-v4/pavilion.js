/* The judgment pavilion: the judges' questions, the Writ builder, the Shelf,
   and the amendment.

   The player never writes AQL. They pick a measure the Books already define,
   narrow it, and give it a name — and from then on a judge can ask for it by
   that name. The AQL is shown because seeing it is the lesson, not because
   anyone has to type it. */
(() => {
 'use strict';
 const W = window.NetherWrit, G = window.NetherGrade,
       esc = v => String(v ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

 const draftOf = s => (s.draft ||= {dataset:null, base:null, filters:[], window:null, name:'', showAql:false});
 const questionsFor=c=>c.phase==='pavilion'?window.NetherCourtQuestions.forCase(c):[];
 const checklistOf=(c,s)=>s.checklist||=( {answers:['',''],attempts:0,correct:false,results:null,hints:false,checking:false} );
 const MAX_TRIALS=5;

 async function submitChecklist(c,s){
  const questions=questionsFor(c),checklist=checklistOf(c,s);
  if(questions.length!==2)return {ok:false,why:'This soul has no judgment checklist.'};
  if(s.status!=='waiting')return {ok:false,why:'This case is already closed.'};
  if(checklist.checking||checklist.correct||checklist.attempts>=MAX_TRIALS)return {ok:false,why:'This checklist is closed.'};
  const answers=checklist.answers.map(v=>String(v??'').trim());
  if(answers.length!==2||answers.some(v=>!v||!Number.isFinite(Number(v))))return {ok:false,why:'Enter a number for both questions.'};
  checklist.checking=true;
  let truth;
  try{truth=await Promise.all(questions.map(q=>G.askJudgeQuestion(q)));}
  catch{truth=null;}
  finally{checklist.checking=false;}
  if(!truth||truth.some(t=>t?.status!=='rows'||t.value==null||!Number.isFinite(Number(t.value))))return {ok:false,why:'The Books could not answer. No trial was used. Try again.'};
  checklist.attempts++;
  checklist.results=truth.map((t,i)=>!questions[i].decimals?G.answersAgree(answers[i],t.value):Math.abs(Number(answers[i])-Number(t.value))<=0.5*Math.pow(10,-questions[i].decimals)+1e-9);
  checklist.correct=checklist.results.every(Boolean);
  s.answer=answers[0];s.answerCorrect=checklist.correct;s.judgeTruth=truth[0].value;
  return {ok:true,correct:checklist.correct,exhausted:!checklist.correct&&checklist.attempts>=MAX_TRIALS};
 }

 /* ---------------------------------------------------------- the question */

 function questionCard(c, s){
  if(!c.question) return '';
  const answered = s.answer !== undefined && s.answer !== '';
  const judged = s.answerCorrect !== undefined;
  return '<section data-anfra-block="judge-question" data-anfra-label="The judges’ question" data-anfra-query="judge-question" class="judge-card' + (judged ? (s.answerCorrect ? ' judged-right' : ' judged-wrong') : '') + '">'
   + '<p class="eyebrow">THE JUDGES ASK</p>'
   + '<p class="judge-question">' + esc(c.question.prompt) + '</p>'
   + (s.judgeWrit ? '<p class="judge-named">By the Writ you call <b>' + esc(s.judgeWrit) + '</b>.</p>' : '')
   + '<div class="judge-answer">'
   + '<input id="judge-answer" inputmode="decimal" placeholder="a number" value="' + esc(s.answer ?? '') + '"'
   + (judged ? ' disabled' : '') + ' aria-label="Your answer for the judges">'
   + (judged
      ? '<span class="judge-mark">' + (s.answerCorrect ? '✓ accepted' : '✕ rejected') + '</span>'
      : '<button class="text-button" data-action="submitanswer"' + (answered ? '' : ' disabled') + '>Submit</button>')
   + '</div>'
   + (judged && !s.answerCorrect ? '<p class="judge-note">The Books were asked the same question and did not agree with you.</p>' : '')
   + '</section>';
 }

 /* ------------------------------------------------------------- the builder */

 function metricOptions(draft){
  const metrics = draft.dataset ? W.metricsFor(draft.dataset) : [];
  return '<select id="writ-metric" aria-label="What to measure">'
   + '<option value="">Choose what to measure…</option>'
   + metrics.map(m => '<option value="' + esc(m.name) + '"' + (m.name === draft.base ? ' selected' : '') + '>'
      + esc(m.label) + (m.windowable ? '' : ' — no dates kept') + '</option>').join('')
   + '</select>';
 }

 function filterRow(draft, filter, index){
  const dims = W.dimensionsFor(draft.dataset);
  return '<div class="writ-filter">'
   + '<select data-filter="' + index + '" data-part="field" aria-label="Field">'
   + dims.map(d => '<option value="' + esc(d.id) + '"' + (d.id === filter.field ? ' selected' : '') + '>' + esc(d.label) + '</option>').join('')
   + '</select>'
   + '<select data-filter="' + index + '" data-part="op" aria-label="Comparison">'
   + W.OPS.map(o => '<option value="' + esc(o.id) + '"' + (o.id === filter.op ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('')
   + '</select>'
   + '<input data-filter="' + index + '" data-part="value" value="' + esc(filter.value) + '" aria-label="Value" placeholder="value">'
   + '<button class="text-button" data-action="dropfilter" data-index="' + index + '" aria-label="Remove this condition">×</button>'
   + '</div>';
 }

 function builder(c, s){
  const draft = draftOf(s);
  const books = window.NetherLedger.books();
  const when = draft.base ? W.whenFieldFor(draft) : null;
  let preview = '', trouble = '';
  if(draft.base || draft.compose){
   try{ preview = W.emit(draft, c.personId); }
   catch(error){ trouble = error.message; }
  }
  return '<div data-anfra-block="writ-builder" data-anfra-label="Draw a Writ">'
   + '<p class="eyebrow">DRAW A WRIT</p>'
   + '<select id="writ-book" aria-label="Which Book">'
   + '<option value="">Choose a Book…</option>'
   + books.map(b => '<option value="' + esc(b.id) + '"' + (b.id === draft.dataset ? ' selected' : '') + '>' + esc(b.title) + '</option>').join('')
   + '</select>'
   + (draft.dataset ? metricOptions(draft) : '')
   + (draft.base ? (draft.filters || []).map((f, i) => filterRow(draft, f, i)).join('') : '')
   + (draft.base ? '<button class="text-button" data-action="addfilter">+ Narrow it</button>' : '')
   + (draft.base && when
      ? '<label class="writ-window"><input type="checkbox" id="writ-window"' + (draft.window ? ' checked' : '') + '>'
        + ' Only their last <input id="writ-years" type="number" min="1" max="60" value="' + (draft.window?.years ?? 10) + '"> years</label>'
      : draft.base ? '<p class="writ-torn">This Book keeps no dates for that, so it cannot be asked about a span of years.</p>' : '')
   + (trouble ? '<p class="writ-torn">' + esc(trouble) + '</p>' : '')
   + (preview
      ? '<button class="text-button" data-action="toggleaql">' + (draft.showAql ? 'Hide' : 'Show') + ' what this asks</button>'
        + (draft.showAql ? '<pre class="writ-aql">' + esc(preview) + '</pre>' : '')
      : '')
   + (preview
      ? '<div class="writ-save"><input id="writ-name" placeholder="Name this Writ" value="' + esc(draft.name) + '" aria-label="Name this Writ">'
        + '<button class="brass-button small" data-action="savewrit"' + (draft.name.trim() ? '' : ' disabled') + '>'
        + (draft.amending ? 'Amend' : 'Keep it') + '</button></div>'
      : '')
   + '</div>';
 }

 /* --------------------------------------------------------------- the shelf */

 function shelf(c, s){
  const writs = W.all();
  if(!writs.length)
   return '<div data-anfra-block="writ-shelf" data-anfra-label="Your Writs" class="writ-shelf"><p class="eyebrow">YOUR WRITS</p><p class="empty-note">Nothing drawn yet. A Writ you name once can be asked for again.</p></div>';
  return '<div data-anfra-block="writ-shelf" data-anfra-label="Your Writs" class="writ-shelf"><p class="eyebrow">YOUR WRITS</p>'
   + writs.map(spec => {
      const bound = s.writAnswers?.[spec.name];
      return '<div class="writ-row">'
       + '<div><strong>' + esc(spec.name) + '</strong><small>' + esc(W.describe(spec)) + '</small></div>'
       + '<div class="writ-row-actions">'
       + (bound !== undefined ? '<span class="writ-value">' + esc(bound) + '</span>' : '')
       + '<button class="text-button" data-action="runwrit" data-writ="' + esc(spec.name) + '">Ask it</button>'
       + '<button class="text-button" data-action="amendwrit" data-writ="' + esc(spec.name) + '">Amend</button>'
       + '</div></div>';
     }).join('')
   + '</div>';
 }

 function pane(c, s){
  return '<div data-anfra-container="pavilion" data-anfra-label="The pavilion">' + shelf(c, s) + builder(c, s) + '</div>';
 }

 /* ----------------------------------------------------------- the amendment */

 /* What an amended Writ does to the work already done. Every number is asked
    again; nothing is adjusted in place. Verdicts that would now differ are
    called out, because that is the point of the whole exercise. */
 function amendmentScreen(name, diff, judged){
  if(diff.status === 'unreachable')
   return '<div class="overlay-body"><p>The Books would not answer. Nothing has been changed.</p></div>';
  if(!diff.changed.length)
   return '<div class="overlay-body"><p><b>' + esc(name) + '</b> now reads differently, but every soul it was used on comes back the same number.</p>'
        + '<p class="empty-note">' + diff.unchanged + ' unchanged.</p></div>';
  return '<div data-anfra-block="amendment" data-anfra-label="What the amendment changed" class="overlay-body amendment">'
   + '<p>You changed what <b>' + esc(name) + '</b> means. The Books were asked again, for every soul you used it on.</p>'
   + '<table class="result-table amendment-table"><thead><tr><th>Soul</th><th>Was</th><th>Now</th><th></th></tr></thead><tbody>'
   + diff.changed.map(d => '<tr><td>' + esc(d.soulName || d.personId) + '</td>'
      + '<td class="was">' + esc(d.before) + '</td><td class="now">' + esc(d.after) + '</td>'
      + '<td>' + (d.verdictWouldChange ? '<span class="case-status wrong">the verdict would have differed</span>' : '') + '</td></tr>').join('')
   + '</tbody></table>'
   + '<p class="empty-note">' + diff.changed.length + ' changed, ' + diff.unchanged + ' unchanged. '
   + 'None of these numbers was stored. They were asked again, under the new definition.</p></div>';
 }

 /* -------------------------------------------------------- stamping the case */

 /* A pavilion case needs its analytics answer before it can be stamped, and an
    approval needs that answer to be right (B3). A dispute does not: a soul may
    be turned away on their papers whatever the judges wanted to know. */
 function gate(c, s, action){
  if(c.phase==='pavilion'){
   if(action==='approve'&&!checklistOf(c,s).correct)return {ok:false,why:'Complete both questions in the judgment checklist to unlock Approve.'};
   return {ok:true};
  }
  if(!c.question) return {ok:true};
  if(s.answerCorrect === undefined)
   return {ok:false, why:'The judges are still waiting on their number.'};
  if(action === 'approve' && !s.answerCorrect)
   return {ok:false, why:'They will not let this one pass on a number the Books do not support.'};
  return {ok:true};
 }

 async function submitAnswer(c, s){
  const truth = await G.askJudgeQuestion(c.question);
  if(!truth || truth.status !== 'rows') return {ok:false, why:'The Books would not answer. Try again.'};
  s.answerCorrect = G.answersAgree(s.answer, truth.value);
  s.judgeTruth = truth.value;
  return {ok:true, correct:s.answerCorrect};
 }

 const api = {questionCard, pane, builder, shelf, amendmentScreen, gate, submitAnswer, draftOf,questionsFor,checklistOf,submitChecklist,MAX_TRIALS};
 if(typeof module !== 'undefined') module.exports = api; else window.NetherPavilion = api;
})();

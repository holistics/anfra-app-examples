/* Resolving a check, and grading a case.

   The same logic `scripts/check_nether_cases.py` replays at build time, now in
   the browser. It reads the answer out of the Books every time: no case holds
   an expected value, so there is nothing here to drift from (AD-3).

   AD-12: every query for a case resolves before anything is decided. If one
   cannot be answered the case is left exactly as it was and the desk says so,
   because losing a soul's work to a dropped query is worse than a slow desk. */
(() => {
 'use strict';
 const P = window.NetherPort;

 const DATE = /^(\d{4})-(\d{2})-(\d{2})/;

 /* Compare like with like. A document is handwriting and a ledger is a
    database; 'Samos ' and 'samos' are the same claim, and 120 and 120.0 are
    the same number. Anything subtler than that is a real disagreement. */
 function normalise(value){
  if(value === null || value === undefined) return null;
  const text = String(value).trim();
  if(text === '' || text === '\u2014') return null;      // an empty line on a paper and a missing value in a Book are the same thing
  const date = DATE.exec(text);
  if(date) return date[1] + '-' + date[2] + '-' + date[3];
  const number = Number(text);
  if(text !== '' && Number.isFinite(number)) return Math.round(number * 1e9) / 1e9;
  return text.toLowerCase();
 }

 /* What the papers say for this check. One copy, read from the document the
    check names, so the desk and the grader can never disagree about it. */
 function claimed(caseRow, check){
  const source = check.doc === 'support' ? (check.document || check) : caseRow.documents[check.doc];
  return source || {};   // every paper is under its own id, the extra ones included
 }

 /* One check against the Books. Returns a finding, never a verdict — the
    judgment stays the player's (B3). */
 async function resolve(caseRow, check){
  if(check.kind === 'absent')
   return {check:check.check, result:'conflict', status:'rows',
           why:'Nothing was offered to compare.', rows:[]};

  const answer = await P.ask(check.dataset, check.aql, 'check-' + check.check);
  if(answer.status === 'unreachable')
   return {check:check.check, result:'unresolved', status:'unreachable',
           why:'The Book would not open.', error:answer.error, rows:[]};

  if(answer.status === 'empty'){
   // A record that is not there is a finding, not a failure (AD-8).
   if(check.absent_is_conflict)
    return {check:check.check, result:'conflict', status:'empty',
            why:'No such record stands in this Book.', rows:[]};
   return {check:check.check, result:'match', status:'empty',
           why:'The Book holds nothing, which is what was claimed.', rows:[]};
  }

  const record = answer.rows[0], papers = claimed(caseRow, check), differences = [];
  for(const pair of check.compare){
   const exact = pair.doc_field === 'identity_id';
   const said = exact ? String(papers[pair.doc_field]??'').trim() : normalise(papers[pair.doc_field]);
   const written = exact ? String(record[pair.record_field]??'').trim() : normalise(record[pair.record_field]);
   if(said !== written)
    differences.push({field:pair.doc_field,
                      said: papers[pair.doc_field],
                      written: record[pair.record_field]});
  }
  // The cross-check on a muster roll: the dates on the paper must lie inside the campaign's own dates, which the
  // Book gives in the same query. A paper that agrees with its soul's service line can still be outside the campaign.
  if(check.rule?.within){
   const w=check.rule.within,joined=normalise(papers[w.from]),left=normalise(papers[w.to]),start=normalise(record[w.window_start]),end=normalise(record[w.window_end]);
   if(DATE.test(String(joined))&&DATE.test(String(start))&&joined<start)
    differences.push({field:w.from,said:papers[w.from],written:'the campaign began on '+record[w.window_start]});
   if(DATE.test(String(left))&&DATE.test(String(end))&&left>end)
    differences.push({field:w.to,said:papers[w.to],written:'the campaign ended on '+record[w.window_end]});
  }
  if(check.validity){
   const issued=normalise(papers[check.validity.issued]),expires=normalise(papers[check.validity.expires]);
   const today=normalise(caseRow.current_date);
   if(!DATE.test(String(issued))||!DATE.test(String(expires))||!DATE.test(String(today))||issued>=expires||today<issued||today>expires)
    differences.push({field:'validity',said:'outside the permitted dates',written:'the current realm date must be between issue and expiry'});
  }
  return {
   check: check.check,
   result: differences.length ? 'conflict' : 'match',
   status: 'rows',
   why: differences.length
    ? differences.map(d => `The papers say ${d.field} is “${d.said}”. The Book says “${d.written}”.`).join(' ')
    : 'Every line agrees with the Book.',
   differences, record, rows: answer.rows,
  };
 }

 /* Every check for a case, resolved together. Nothing is committed here: the
    caller decides what to do with the findings. */
 async function resolveAll(caseRow){
  const findings = await Promise.all(caseRow.checks.map(c => resolve(caseRow, c)));
  return {
   findings,
   unresolved: findings.some(f => f.result === 'unresolved'),
   conflicts: findings.filter(f => f.result === 'conflict'),
  };
 }

 /* The verdict the Books support. All four must resolve before the player may
    stamp anything, and a single disagreement is grounds to dispute. */
 function verdictFor(findings){
  if(findings.some(f => f.result === 'unresolved')) return null;
  return findings.some(f => f.result === 'conflict') ? 'dispute' : 'approve';
 }

 /* The judge's question, answered out of the Book the question names. The
    player's answer is compared against it; neither side holds a stored number. */
 async function askJudgeQuestion(question){
  if(!question) return null;
  const answer = await P.askOne(question.dataset, question.aql, question.field, 'judge-question');
  if(answer.status !== 'rows') return {status:answer.status, value:null, error:answer.error};
  return {status:'rows', value:answer.value, dataset:question.dataset, aql:question.aql};
 }

 /* An integer count must land exactly; a ratio is allowed the last digit. */
 function answersAgree(given, truth){
  const a = Number(given), b = Number(truth);
  if(!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if(Number.isInteger(b)) return a === b;
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
 }

 const api = {resolve, resolveAll, verdictFor, askJudgeQuestion, answersAgree, normalise};
 if(typeof module !== 'undefined') module.exports = api; else window.NetherGrade = api;
})();

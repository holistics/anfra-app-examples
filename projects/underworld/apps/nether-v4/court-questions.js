/* Two questions per trial. These are query definitions, never an answer key:
   NetherGrade.askJudgeQuestion resolves every answer from the live Books.
   The second question asks for a statistic over a chart's groups, so readers
   can solve it with a breakdown and a maximum reference line. */
(() => {
 'use strict';
 const METRICS = {
  assets_acquired: ['How many assets did this soul acquire?', 'Assets acquired', 0],
  total_paid: ['How much did this soul pay for all acquired assets?', 'Total paid', 2],
  average_yield: ['What was the average yield per recorded harvest?', 'Average yield', 2],
  total_yield: ['What was the total yield from this soul’s estates?', 'Total yield', 2],
  harvests_recorded: ['How many harvests are recorded for this soul’s estates?', 'Harvests recorded', 0],
  offerings_made: ['How many offerings did this soul make?', 'Offerings made', 0],
  oaths_sworn: ['How many oaths did this soul swear?', 'Oaths sworn', 0],
  oaths_broken: ['How many oaths did this soul break?', 'Oaths broken', 0],
  souls_killed: ['How many killings are recorded against this soul?', 'Souls killed', 0],
  killed_in_battle: ['How many killings were recorded in battle?', 'Killed in battle', 0],
  killed_outside_battle: ['How many killings were recorded outside battle?', 'Killed outside battle', 0],
  employers: ['How many distinct businesses employed this soul?', 'Employers', 0],
  years_employed: ['How many years of employment are recorded for this soul?', 'Years employed', 0],
  souls_bonded: ['How many bonds are recorded against this soul?', 'Souls bonded', 0],
  patients_treated: ['How many patient cases did this soul treat?', 'Patients treated', 0],
  recovery_rate: ['What percentage of this soul’s patient cases recovered?', 'Recovery rate', 2],
 };
 const BOOKS = {
  nether_property: {
   label: 'The Book of Holdings', dimension: 'nether_asset.asset_type',
   grouping: 'Asset → Asset Type', metric: 'total_paid', metricLabel: 'Total paid', decimals: 2,
   prompt: 'What was the largest total paid for a single asset type?',
  },
  nether_harvest: {
   label: 'The Book of Agriculture', dimension: 'nether_estate.estate_id',
   grouping: 'Estate → Estate Id', metric: 'total_yield', metricLabel: 'Total yield', decimals: 2,
   prompt: 'What was the largest total yield from a single estate?',
  },
  nether_rites: {
   label: 'The Book of Religion', dimension: 'nether_temple.deity',
   grouping: 'Temple → Deity', metric: 'nether_offering | sum(nether_offering.value)',
   metricLabel: 'Sum of Offering → Value', decimals: 2,
   prompt: 'What was the largest total offering value given to one deity?',
  },
  nether_arms: {
   label: 'The Book of Battle', dimension: 'nether_casualty_record.context',
   grouping: 'Casualty Record → Context', metric: 'souls_killed', metricLabel: 'Souls killed', decimals: 0,
   prompt: 'Group killings by context. What is the largest group’s count?',
  },
  nether_work: {
   label: 'The Book of Trades', dimension: 'nether_employment.role',
   grouping: 'Employment → Role', metric: 'years_employed', metricLabel: 'Years employed', decimals: 0,
   prompt: 'What was the largest total number of employment years in one role?',
  },
  nether_identity: {
   label: 'The Book of Names', dimension: 'nether_relationship.bond_type',
   grouping: 'Relationship → Bond Type', metric: 'souls_bonded', metricLabel: 'Souls bonded', decimals: 0,
   prompt: 'Group bonds by type. What is the largest group’s count?',
  },
  nether_healing: {
   label: 'The Book of Healthcare', dimension: 'nether_ailment.name',
   grouping: 'Ailment → Name', metric: 'nether_patient_case | sum(nether_patient_case.fee)',
   metricLabel: 'Sum of Patient Case → Fee', decimals: 2,
   prompt: 'What was the largest total patient fee for one ailment?',
  },
 };
 const quote = value => "'" + String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
 function query(personId, expression){
  return `explore {\n  measures { v: ${expression} }\n  filters { nether_person.person_id is ${quote(personId)} }\n  sorts { v desc }\n}`;
 }
 function forCase(c){
  if(c?.phase !== 'pavilion') return [];
  const personId = c.personId || c.person_id;
  if(!personId) throw new Error('A judgment checklist needs the soul’s Person Id.');
  const original = c.question || {};
  const match = /measures\s*\{\s*v:\s*([a-z_]+)/i.exec(original.aql || '');
  const metric = match && METRICS[match[1]] && BOOKS[original.dataset] ? match[1] : 'souls_bonded';
  const dataset = metric === 'souls_bonded' ? 'nether_identity' : original.dataset;
  const book = BOOKS[dataset], [prompt, metricLabel, decimals] = METRICS[metric];
  const scope = `Open ${book.label}. Filter Person → Person Id to ${personId}.`;
  const percentage = metric === 'recovery_rate';
  return [
   {
    id: 'question-1', prompt, dataset, field: 'v', decimals,
    aql: query(personId, percentage ? 'coalesce(recovery_rate, 0) * 100.0' : `coalesce(${metric}, 0)`),
    hint: `${scope} Add ${metricLabel} as a value and read its total.${percentage ? ' Format it as a percentage and enter the number from 0 to 100, without the % sign.' : ''}${decimals ? ' Round to two decimal places.' : ''}`,
   },
   {
    id: 'question-2', prompt: book.prompt, dataset, field: 'v', decimals: book.decimals,
    aql: query(personId, `coalesce((unique(${book.dimension}) | select(group_total: ${book.metric}) | max(group_total)), 0)`),
    hint: `${scope} Use a bar chart with ${book.metricLabel} as its value and ${book.grouping} as its category or Breakdown. Analyze → Reference line → Max marks the largest group total.${book.decimals ? ' Round to two decimal places.' : ''}`,
   },
  ];
 }
 const api = {forCase};
 if(typeof module !== 'undefined' && module.exports) module.exports = api;
 else window.NetherCourtQuestions = api;
})();

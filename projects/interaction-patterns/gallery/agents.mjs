// The gallery for coding agents, laid out as a skill in ../skill/: SKILL.md, AGENTS.md, llms.txt,
// llms-full.txt and references/<card id>.md, made from the same sources as the page (demos.js, steps/,
// prompts/, aql-results.json, live-apps/). build.mjs calls writeSkill() and copies skill/ into site/,
// so the files are committed, readable on GitHub, installable as a skill and served on anfra.ai.
import fs from 'node:fs';
import vm from 'node:vm';

const dir = new URL('.', import.meta.url).pathname;
const SITE = 'https://anfra.ai/interaction-patterns';
const PAGE = SITE + '/interaction-gallery.html';
const SDK = '@holistics/anfra-sdk 0.8.0';
const STATUS = {
	works: 'Works today: anfra does it natively',
	app: 'Works with app code: anfra supplies the queries, the app adds some logic',
	// rechecked on anfra 0.13.3 (26 Oct 2026): the core API has no write endpoint, the SDK has no
	// parameters (plugins: core, export, render, lineage, inspect), and the app frame is still
	// sandbox="allow-scripts", so no navigation or storage. Recheck when anfra adds any of these.
	proposed: 'Proposed: anfra cannot do this yet (checked on 0.13.3: no write path, no query parameters, and the app frame allows scripts only, so no navigation or storage). Build the closest version and say what is missing',
};
// what agents are usually told to follow, by the words they are told
const ALIASES = [
	['date filter', 'date-filter'],
	['date drill', 'date-drill'],
	['cross-filtering', 'single-select'],
	['underlying data', 'underlying-records'],
	['drill down', 'hierarchy-drill'],
	['what-if parameter', 'what-if'],
];

const read = (p) => fs.readFileSync(dir + p, 'utf8');
const merged = (sub) => Object.assign({}, ...fs.readdirSync(dir + sub).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(read(sub + '/' + f))));

// demos.js reads its data from the page's <script> tags; give it the same JSON
function gallery () {
	const ctx = { window: {}, document: { getElementById: (id) => ({ textContent: id === 'data' ? fs.readFileSync(dir + '../assets/trailer-data.json', 'utf8') : read('aql-results.json') }) } };
	vm.runInNewContext(read('demos.js'), ctx);
	return ctx.window.GALLERY;
}
function liveApps () {
	const ctx = { LIVE: {} };
	for (const f of fs.readdirSync(dir + 'live-apps').filter((f) => f.endsWith('.js')).sort()) vm.runInNewContext(read('live-apps/' + f), ctx);
	return ctx.LIVE;
}

// the cards' prose is light HTML: <b>, <code>, the odd <span> and entity
const md = (s) => String(s || '')
	.replace(/<b>(.*?)<\/b>/g, '**$1**').replace(/<code>(.*?)<\/code>/g, '`$1`')
	.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
const fence = (code, lang = '') => {
	const ticks = '`'.repeat(Math.max(3, ...(code.match(/`+/g) || []).map((t) => t.length + 1)));
	return `${ticks}${lang}\n${code.trim()}\n${ticks}`;
};
const cell = (v) => String(v ?? '').replace(/\|/g, '\\|');
function resultTable (r, max = 12) {
	const head = `| ${r.fields.map(cell).join(' | ')} |\n|${r.fields.map(() => '---').join('|')}|`;
	const rows = r.records.slice(0, max).map((x) => `| ${x.map(cell).join(' | ')} |`).join('\n');
	return `${head}\n${rows}${r.records.length > max ? `\n\n(${r.records.length - max} more rows)` : ''}`;
}
const url = (id) => `${SITE}/references/${id}.md`;

function patternMd (d, ctx) {
	const { prims, AQL, STEPS, PROMPTS, LIVE } = ctx;
	const prim = (k) => prims.find((p) => p.key === k).name;
	const p = PROMPTS[d.id] || {};
	const q = d.aqlRef && AQL[d.aqlRef];
	const live = LIVE[d.id];
	const out = [];
	out.push(`# ${d.title}\n\n> ${md(d.one)}`);
	out.push([
		`- Pattern id: \`${d.id}\``,
		`- Category: ${prim(d.prim)}${d.also ? ` (also ${d.also.map(prim).join(', ')})` : ''}`,
		`- Status: ${STATUS[d.status] || d.status}`,
		`- Gallery card${live ? ' with a live demo' : ''}: ${PAGE}#${d.id}`,
		d.app ? `- Full Data App: https://demo.anfra.ai/apps/${d.app}` : '',
		`- Built on: ${SDK}, the \`ecommerce\` sample Dataset. Swap in your own fields.`,
	].filter(Boolean).join('\n'));
	out.push(`## What the reader does\n\n${md(d.does)}\n\nWhy: ${md(d.why)}`);
	out.push(`## What to build\n\n${p.how ? md(p.how) + '\n\n' : ''}Layout: ${md(d.viz)}\n\nInstruction: ${md(p.mine || d.generic)}`
		+ (p.good ? `\n\nDone when: ${md(p.good)}` : '')
		+ (p.goodTry ? `\n\nOn the ecommerce sample: ${md(p.goodTry)}` : ''));
	if (q) {
		out.push(`## AQL\n\nRan on anfra 0.8.0 against \`ecommerce\`${q.timezone ? `, time zone ${q.timezone}` : ''}. The AQL stays fixed; the reader's choices arrive as the input below, which the SDK builds from controls and selections.\n\n${fence(q.aql, 'aql')}`
			+ (q.input ? `\n\nReader input the SDK sent:\n\n${fence(JSON.stringify(JSON.parse(q.input), null, 2), 'json')}` : '')
			+ (q.result ? `\n\nSaved result:\n\n${resultTable(q.result)}` : ''));
	} else if (d.aqlInline) {
		out.push(`## AQL\n\nNot run as written${d.aqlWhy ? `: ${md(d.aqlWhy)}` : ''}.\n\n${fence(d.aqlInline, 'aql')}`);
	}
	if (d.aqlNote) out.push(md(d.aqlNote));
	out.push(`## SDK wiring\n\n${fence(d.sdk, 'js')}` + (d.state ? `\n\nState it touches: ${md(d.state)}` : ''));
	const notes = [...(d.anfra || []).map(md), d.limits ? 'Limits: ' + md(d.limits) : ''].filter(Boolean);
	if (notes.length) out.push(`## Notes\n\n${notes.map((n) => '- ' + n).join('\n')}`);
	if (live) {
		out.push(`## Complete working example\n\nThe live demo's source: a small Data App the gallery mounts with \`mountDataApp\`. \`Anfra\` is the SDK global. \`K\` is the gallery's drawing kit (\`K.bars\`, \`K.columns\`, \`K.table\`, \`K.status\`, \`K.sent\`, formatters): replace it with your own rendering. The SDK calls are the part to copy.\n\nHTML body:\n\n${fence(live.html, 'html')}\n\nScript:\n\n${fence(live.js, 'js')}`);
	}
	if (STEPS[d.id]) out.push(`## Walkthrough on the gallery card\n\n${STEPS[d.id].map((s, i) => `${i + 1}. ${md(s)}`).join('\n')}`);
	const rel = ctx.demos.filter((x) => x.prim === d.prim && x.id !== d.id);
	if (rel.length) out.push(`## Other ${prim(d.prim)} patterns\n\n${rel.map((x) => `- [${x.title}](${x.id}.md): ${md(x.one)}`).join('\n')}`);
	return out.join('\n\n') + '\n';
}

function index (ctx, linkOf, h = '##') {
	return ctx.prims.map((pr) => {
		const ds = ctx.demos.filter((d) => d.prim === pr.key);
		if (!ds.length) return '';
		return `${h} ${pr.name}\n\n${md(pr.sub)}\n\n${ds.map((d) => `- [${d.title}](${linkOf(d.id)}): ${md(d.one)}${d.status === 'proposed' ? ' (proposed)' : ''}`).join('\n')}`;
	}).filter(Boolean).join('\n\n');
}

function llmsTxt (ctx) {
	return `# anfra interaction patterns

> ${ctx.demos.length} analytical interaction patterns for anfra Data Apps: filters, selections, dates and time, drilling, tables and calculations, scenarios and saved state. Each pattern has a Markdown page with its AQL, its ${SDK} wiring, a complete working example and what a good result looks like, all on the \`ecommerce\` sample Dataset.

Read [AGENTS.md](${SITE}/AGENTS.md) first: how to use these patterns in a Data App, and the rules that keep the SDK wiring working.

When told to follow an example by name, fetch its page: ${ALIASES.map(([w, id]) => `"${w}" is [${id}.md](${url(id)})`).join(', ')}.

${index(ctx, url)}

## Optional

- [All patterns in one file](${SITE}/llms-full.txt): every pattern page, concatenated.
- [The gallery](${PAGE}): the human page, with trailers and live demos. It is one large HTML file; agents should read the Markdown instead.
`;
}

// SKILL.md links relative (an installed skill reads its own files); AGENTS.md links absolute (fetched from the site)
function guide (ctx, link, title) {
	const url = (id) => link(`references/${id}.md`);
	return `# ${title}

A gallery of analytical interaction patterns for anfra Data Apps (${SITE}). Each pattern has a Markdown page: ${link('references/<id>.md')}. The list with one line per pattern is ${link('llms.txt')}.

## How to use a pattern

1. Find the pattern. Common names map to these pages:
${ALIASES.map(([w, id]) => `   - ${w}: ${url(id)}`).join('\n')}
2. Read its **What to build** section for the behaviour, and **Done when** for the check.
3. Copy the **SDK wiring**: \`createQuery\`, \`createFilter\`, \`createDateDrill\`, \`mapControl\`, \`mapCrossFilter\`, \`select\`, \`setSort\`, \`fetchMore\`. **Complete working example** shows the same calls in a running app.
4. Swap the \`ecommerce\` fields for the user's own. Run \`anfra show <dataset>\` to see them, and run each query with \`anfra query\` before putting it in the app.
5. Check the result against **Done when**, in the browser, by doing what the reader would do.

The examples run on ${SDK} and anfra 0.8.0. If the installed SDK is newer, check its typings (\`app.d.ts\`) before copying a call.

## What the examples assume

- A Data App is one HTML file in the repo's \`apps/\`, run by \`anfra serve\` in a sandboxed frame with the SDK on the global \`Anfra\`.
- \`K\` in the complete examples is the gallery's own drawing kit. It does not exist in a Data App: draw with your own HTML, SVG or a charting library.
- \`ecommerce\` models: \`orders\` (\`ordered_at\`, \`status\`, \`ordered_ts\` in UTC, \`discount_pct\`, \`fiscal_year\`, \`fiscal_quarter\`), \`order_items\`, \`customers\` (\`country\`), \`products\` (\`category\`, \`subcategory\`, \`brand\`), \`markets\` (\`region\`, \`monthly_target\`), \`sessions\`. Metrics: \`revenue\`, \`order_count\`, \`aov\`, \`net_revenue\`, \`monthly_target\`, \`session_count\`, \`units_sold\`. Orders run from 2025-06-01 to 2026-09-23.

## Rules for interactions

Everything else about a Data App is in the official anfra skills, installed with \`anfra skills install\`: \`build-data-app\` for the app, its SDK calls and the sandbox, \`aql\` and \`write-aql\` for the queries, and \`aml\` for adding a field or metric to a Dataset. Follow them first. These patterns add two rules, found on ${SDK}:

- Controls and selections can target only model fields and Dataset metrics, not dimensions or metrics declared in the query ("unknown field"). Promote the field or metric to the Dataset with the \`aml\` skill.
- Selecting rows whose date comes from \`| month()\` breaks the target query: the SDK sends exact-day conditions. Use a raw date field with \`createDateDrill\`, or turn the click into a \`between\` condition on a date filter, as date-drill and underlying-records do.

## Status

Each pattern page states one of:

${Object.values(STATUS).map((s) => '- ' + s).join('\n')}

## Do not

- Call this site's \`api/\` from an app. It serves the gallery's own demos, is rate-limited, and only has the \`ecommerce\` sample.
- Scrape ${PAGE}. It is one large HTML file with embedded fonts and scripts; everything in it is in the Markdown pages.

## Patterns

${index(ctx, url, '###')}
`;
}
const description = (ctx) => `Implements analytical interactions in anfra Data Apps with the @holistics/anfra-sdk: date filters, date drill, cross-filtering, view underlying data, drill down, Top N, period comparison, what-if and ${ctx.demos.length - 8} more, each with its AQL, SDK wiring and a working example. Use when building or changing an interaction in an anfra Data App, or when told to follow an example from anfra.ai/interaction-patterns.`;
const skillMd = (ctx) => `---\nname: anfra-interaction-patterns\ndescription: ${JSON.stringify(description(ctx))}\n---\n\n` + guide(ctx, (p) => p, 'anfra interaction patterns');
const agentsMd = (ctx) => guide(ctx, (p) => `${SITE}/${p}`, 'AGENTS.md: anfra interaction patterns');

const SKILL = dir + '../skill/';
export function writeSkill () {
	const G = gallery();
	const ctx = { ...G, AQL: JSON.parse(read('aql-results.json')), STEPS: merged('steps'), PROMPTS: merged('prompts'), LIVE: liveApps(), byId: Object.fromEntries(G.demos.map((d) => [d.id, d])) };
	for (const [, id] of ALIASES) if (!ctx.byId[id]) throw new Error(`agents.mjs: alias points at unknown pattern ${id}`);
	// start clean, so a removed card leaves no page behind
	fs.rmSync(SKILL, { recursive: true, force: true });
	fs.mkdirSync(SKILL + 'references', { recursive: true });
	const pages = G.demos.map((d) => [d.id, patternMd(d, ctx)]);
	for (const [id, text] of pages) fs.writeFileSync(`${SKILL}references/${id}.md`, text);
	fs.writeFileSync(SKILL + 'references/index.md', `# anfra interaction patterns\n\n${index(ctx, (id) => id + '.md')}\n`);
	fs.writeFileSync(SKILL + 'llms.txt', llmsTxt(ctx));
	fs.writeFileSync(SKILL + 'llms-full.txt', llmsTxt(ctx) + '\n' + pages.map(([, t]) => t).join('\n---\n\n'));
	fs.writeFileSync(SKILL + 'SKILL.md', skillMd(ctx));
	fs.writeFileSync(SKILL + 'AGENTS.md', agentsMd(ctx));
	return { dir: SKILL, pages: pages.length };
}

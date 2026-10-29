import fs from 'node:fs';
import { writeSkill } from './agents.mjs';
const dir = new URL('.', import.meta.url).pathname;
const src = fs.readFileSync(dir + 'gallery.src.html', 'utf8');
// the portal adds its review widget at the first </body>, so no closing tag may appear raw inside a script
const safe = (s) => s.replace(/<\/(script|body|html|head)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const data = fs.readFileSync(dir + '../assets/trailer-data.json', 'utf8');
const aql = fs.readFileSync(dir + 'aql-results.json', 'utf8');
const liveApps = fs.readdirSync(dir + 'live-apps').filter((f) => f.endsWith('.js')).sort()
	.map((f) => `<script data-live="${f}">\n${safe(fs.readFileSync(dir + 'live-apps/' + f, 'utf8'))}\n</script>`).join('\n');
// steps/, sql/ and prompts/ hold id → value JSON files, merged into one object
const merged = (sub) => JSON.stringify(Object.assign({}, ...(fs.existsSync(dir + sub) ? fs.readdirSync(dir + sub).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(dir + sub + '/' + f, 'utf8'))) : [])));
const out = src
	.replace('/*__DATA__*/', () => safe(data))
	.replace('/*__AQL__*/', () => safe(aql))
	.replace('/*__HOL__*/', () => safe(fs.existsSync(dir + 'holistics.json') ? fs.readFileSync(dir + 'holistics.json', 'utf8') : '{}'))
	.replace('/*__DESIGN__*/', () => fs.readFileSync(dir + 'design.css', 'utf8'))
	.replace('/*__FONTS__*/', () => {
		const f = (p) => fs.readFileSync(dir + '../assets/fonts/' + p.split('/').pop()).toString('base64');
		return `@font-face { font-family: 'Inter Variable'; font-style: normal; font-weight: 100 900; font-display: swap; src: url(data:font/woff2;base64,${f('fontsource-variable-inter-5.3.0/package/files/inter-latin-wght-normal.woff2')}) format('woff2'); }
@font-face { font-family: 'Geist Mono'; font-style: normal; font-weight: 400; font-display: swap; src: url(data:font/woff2;base64,${f('fontsource-geist-mono-5.3.0/package/files/geist-mono-latin-400-normal.woff2')}) format('woff2'); }
@font-face { font-family: 'Geist Mono'; font-style: normal; font-weight: 500; font-display: swap; src: url(data:font/woff2;base64,${f('fontsource-geist-mono-5.3.0/package/files/geist-mono-latin-500-normal.woff2')}) format('woff2'); }`;
	})
	.replace('/*__DEMOS__*/', () => safe(fs.readFileSync(dir + 'demos.js', 'utf8')))
	.replace('/*__ISO__*/', () => safe(fs.readFileSync(dir + 'iso.js', 'utf8')))
	.replace('/*__HOST__*/', () => safe(fs.readFileSync(dir + '../sdk/anfra-host.iife.js', 'utf8')))
	.replace('/*__LIVE__*/', () => safe(fs.readFileSync(dir + 'live.js', 'utf8')))
	.replace('<!--__LIVEAPPS__-->', () => liveApps)
	.replace('/*__ENGINE__*/', () => safe(fs.readFileSync(dir + 'engine.js', 'utf8').replace('/*__STEPS__*/{}', () => merged('steps')).replace('/*__SQLX__*/{}', () => merged('sql')).replace('/*__PROMPTS__*/{}', () => merged('prompts'))));
// the Dates & time time line, drawn by ../timeline/make.py (fonts embedded, so it renders the same inside an <img>)
const final = out.replace("'/*__TIMELINE__*/'", () => JSON.stringify(fs.readFileSync(dir + '../timeline/timeline.svg').toString('base64')));
// site/: the page, its redirecting index and the recorded trailers, ready for deploy/Dockerfile
const site = dir + '../site/';
fs.mkdirSync(site + 'media', { recursive: true });
fs.writeFileSync(site + 'interaction-gallery.html', final);
fs.copyFileSync(dir + '../deploy/index.html', site + 'index.html');
for (const m of fs.readdirSync(dir + '../assets/media')) fs.copyFileSync(dir + '../assets/media/' + m, site + 'media/' + m);
console.log('wrote site/interaction-gallery.html,', final.length, 'bytes');
// the same cards for coding agents: skill/ (committed), served from the site's root as llms.txt, AGENTS.md, references/<id>.md …
const skill = writeSkill();
fs.cpSync(skill.dir, site, { recursive: true });
// agents look for agents.md too; Linux file names are case-sensitive (on macOS this is the same file)
fs.copyFileSync(skill.dir + 'AGENTS.md', site + 'agents.md');
console.log('wrote skill/ with', skill.pages, 'pattern pages, and copied it into site/');

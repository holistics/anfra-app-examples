// (#/welcome/doc/<id>). Structured after Retool's CRM record-management page, adapted to this app: a dark hero with a
// framed product screen and one call to action; three value propositions; a bar that jumps between the sections;
// Why (the problems the business documented, with the date and kind of each source), what has been measured (nothing
// yet, said plainly), What (each capability this copy has, the problems it answers and where to find it), How (the
// workflows, each opening its screen), the tools it sits beside, questions and answers, the sources, and a closing call
// to action.
// The content comes from the server (/api/case-study/…), for signed-in staff only; the private originals stay outside
// the app. Nothing here is a testimonial or a measured result.
import * as React from "react"
import { ArrowLeft, ArrowRight, Download, FileText, ListChecks, Route, Search, Sparkles } from "lucide-react"
import { Badge } from "../components/badge"
import { Button } from "../components/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../components/accordion"
import { Alert, AlertDescription, AlertTitle } from "../components/alert"
import { Skeleton } from "../components/skeleton"
import { Separator } from "../components/separator"

type Ctx = { getToken: () => Promise<string | undefined> }
type Pain = { id: string; title: string; impact: string; detail: string; evidence: string; level: "both" | "data" | "reported"; asOf: string; docs: string[] }
type Capability = { capability: string; status: "implemented" | "partial"; addresses: string[]; href?: string; where?: string; detail: string }
type Doc = { id: string; title: string; type: string; date: string; basedOn: string; summary: string; words?: number }
type Tool = { name: string; examples: string; status: "implemented"; text: string }
type Index = {
  title: string; reviewed: string; business: string; hero: { eyebrow: string; title: string; lead: string; note: string }
  intro: string[]; naming: string; latest: string; why: Pain[]
  what: Capability[]; tools: Tool[]; faq: { q: string; a: string }[]
  documents: Doc[]; pending: { title: string; reason: string }[]; method: string[]
}
type Step = { title: string; role: string; href: string; cta: string; text: string; image?: string; alt?: string }
type Next = { text: string; href: string; cta: string }
type Props = { ctx: Ctx; flow: Step[]; next: Next[]; docId?: string; section?: string; onWalkthrough?: () => void }

async function fetchCaseStudy(ctx: Ctx, file: string) {
  const r = await fetch(`/api/case-study/${file}`, { headers: { authorization: `Bearer ${await ctx.getToken()}` }, cache: "no-store" })
  if (r.status === 401) throw new Error("Your demo session has ended. Choose a persona again to read the case study.")
  if (r.status === 404) throw new Error("This document is not available.")
  if (!r.ok) throw new Error("The case study could not be loaded. Try again in a moment.")
  return file.endsWith(".json") ? r.json() : r.text()
}

function useIndex(ctx: Ctx) {
  const [state, setState] = React.useState<{ status: "loading" | "ready" | "error"; index?: Index; error?: string }>({ status: "loading" })
  const load = React.useCallback(() => {
    setState({ status: "loading" })
    fetchCaseStudy(ctx, "index.json").then((index) => setState({ status: "ready", index })).catch((e) => setState({ status: "error", error: e.message }))
  }, [])
  React.useEffect(load, [load])
  return { ...state, reload: load }
}

const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`))
const LEVEL: Record<Pain["level"], string> = { both: "Synthetic example", data: "Synthetic example", reported: "Synthetic example" }
// The page shows only what this copy does: a capability that is not built is left out, never announced as planned.
const STATUS: Record<Capability["status"], [string, string]> = { implemented: ["Built", "bg-ok-soft text-ok"], partial: ["Partly built", "bg-warn-soft text-warn"] }
const SECTIONS = [["why", "Why"], ["what", "What"], ["how", "How"], ["sources", "Sources"]] as const

// In-page jumps without touching the router's hash: the section is scrolled to, and the address keeps it for a reload.
function jump(id: string) {
  const el = document.getElementById(`cs-${id}`); if (!el) return
  el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })
  el.focus({ preventScroll: true })
  history.replaceState(null, "", `#/welcome?section=${id}`)
}
const JumpLink = ({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) =>
  <a href={`#/welcome?section=${id}`} className={className} onClick={(e) => { e.preventDefault(); jump(id) }}>{children}</a>

function Loading() {
  return <div className="grid gap-3" aria-busy="true" aria-label="Loading the case study"><Skeleton className="h-48 w-full" /><Skeleton className="h-6 w-1/3" /><Skeleton className="h-24 w-full" /></div>
}
function Failed({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <Alert variant="destructive"><AlertTitle>Case study unavailable</AlertTitle><AlertDescription><p>{message}</p>{onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Try again</Button>}</AlertDescription></Alert>
}
const Eyebrow = ({ children }: { children: React.ReactNode }) => <p className="m-0 text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</p>
const Frame = ({ src, alt, caption }: { src: string; alt: string; caption: string }) => (
  <figure className="m-0 grid gap-2">
    <div className="overflow-hidden rounded-xl border border-white/15 bg-white shadow-2xl"><img src={src} alt={alt} width={1280} height={800} loading="lazy" decoding="async" className="block h-auto w-full" /></div>
    <figcaption className="text-xs text-[#a6a69e]">{caption}</figcaption>
  </figure>
)

export default function CaseStudy({ ctx, flow, next, docId, section, onWalkthrough }: Props) {
  const { status, index, error, reload } = useIndex(ctx)
  const [current, setCurrent] = React.useState<string>("why")
  React.useEffect(() => { if (status === "ready" && section) setTimeout(() => jump(section), 50) }, [status, section])
  // The bar shows which section is on screen.
  React.useEffect(() => {
    if (status !== "ready") return
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) setCurrent(e.target.id.replace("cs-", "")) }), { rootMargin: "-40% 0px -55% 0px" })
    SECTIONS.forEach(([id]) => { const el = document.getElementById(`cs-${id}`); if (el) io.observe(el) })
    return () => io.disconnect()
  }, [status])
  if (docId) return <DocumentView ctx={ctx} docId={docId} index={index} />
  if (status === "loading") return <Loading />
  if (status === "error" || !index) return <Failed message={error ?? ""} onRetry={reload} />
  const painTitle = (id: string) => index.why.find((p) => p.id === id)?.title ?? id
  const pains = [...index.why].sort((a, b) => (a.level === "reported" ? 1 : 0) - (b.level === "reported" ? 1 : 0) || b.asOf.localeCompare(a.asOf))
  const B = index.business
  return (
    <div className="grid gap-0" data-kk="case-study">
      {/* ---- Hero: what it is, for whom, the pain it answers, one call to action, a real screen ---- */}
      <section aria-labelledby="cs-title" className="overflow-hidden rounded-2xl bg-[#151515] text-[#e9ebdf]">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="grid content-center gap-5 border-[#433e38] p-6 sm:p-10 lg:border-r">
            <span className="w-fit rounded-md bg-[#2a2a28] px-2 py-1 text-xs text-[#cbccc4]">{index.hero.eyebrow}</span>
            <h1 id="cs-title" className="m-0 text-3xl leading-tight font-light tracking-tight text-balance sm:text-5xl sm:leading-[1.08]">{index.hero.title}</h1>
            <p className="m-0 max-w-[60ch] text-base leading-relaxed text-[#cbccc4]">{index.hero.lead}</p>
            <div className="flex flex-wrap items-center gap-3">
              {onWalkthrough && <button type="button" onClick={onWalkthrough} data-kk="hero-walkthrough"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-[#e9ebdf] px-6 text-base font-medium text-[#151515] transition-colors hover:bg-white focus-visible:ring-[3px] focus-visible:ring-white/60 focus-visible:outline-none">
                <Sparkles className="size-4" aria-hidden="true" /> Start the walkthrough</button>}
              {next[0] && <a href={next[0].href} className="inline-flex h-12 items-center gap-2 rounded-full border border-[#5b5750] px-6 text-base text-[#e9ebdf] no-underline transition-colors hover:bg-[#242424] focus-visible:ring-[3px] focus-visible:ring-white/60 focus-visible:outline-none">{next[0].cta} <ArrowRight className="size-4" aria-hidden="true" /></a>}
            </div>
            <p className="m-0 text-xs text-[#a6a69e]">{index.hero.note}</p>
          </div>
          <div className="border-t border-[#433e38] bg-[radial-gradient(120%_90%_at_70%_20%,#5a2a14_0%,#151515_65%)] p-6 sm:p-10 lg:border-t-0">
            <Frame src="/assets/welcome/job360.jpg" alt="Job 360 for a sample project: its four states (commercial stage, delivery, financial verification, payment), the delivery readiness checks and the Update project form." caption="Job 360, one record per job. Sample data, as on 18 Oct 2026." />
          </div>
        </div>
        {/* ---- Three value propositions, one per section ---- */}
        <div className="grid border-t border-[#433e38] sm:grid-cols-3">
          {([["why", ListChecks, "Why it exists", `Fictional workflow challenges that you can explore with the sample records.`],
             ["what", Search, "What it does", "One record per job, a next action with an owner, and money changes approved by Finance, each with the screen where it happens."],
             ["how", Route, "How to begin", "The workflows, each opening its own screen, and a walkthrough of one sample project from start to finish."]] as const).map(([id, Icon, title, text], i) => (
            <JumpLink key={id} id={id} className={`group grid gap-2 p-6 text-[#e9ebdf] no-underline transition-colors hover:bg-[#1d1d1c] sm:p-8 ${i ? "border-t border-[#433e38] sm:border-t-0 sm:border-l" : ""}`}>
              <Icon className="size-5 text-[#cbccc4]" aria-hidden="true" />
              <span className="text-lg font-normal">{title}</span>
              <span className="text-sm leading-relaxed text-[#a6a69e]">{text}</span>
            </JumpLink>
          ))}
        </div>
      </section>

      {/* ---- The bar that jumps between the sections (wide screens) ---- */}
      <nav aria-label="Sections of the case study" className="sticky top-[var(--kk-appbar-h,104px)] z-[5] mt-6 hidden grid-cols-4 overflow-hidden rounded-xl border bg-background md:grid">
        {SECTIONS.map(([id, label], i) => (
          <JumpLink key={id} id={id} className={`px-4 py-3 text-center text-sm font-medium text-foreground no-underline transition-colors hover:bg-accent ${i ? "border-l" : ""} ${current === id ? "bg-muted" : ""}`}>
            <span aria-current={current === id ? "true" : undefined}>{label}</span>
          </JumpLink>
        ))}
      </nav>

      {/* ---- Why ---- */}
      <section id="cs-why" tabIndex={-1} aria-labelledby="cs-why-title" className="grid scroll-mt-40 gap-5 pt-14 outline-none">
        <div className="grid gap-2">
          <Eyebrow>Why</Eyebrow>
          <h2 id="cs-why-title" className="m-0 text-2xl font-semibold tracking-tight sm:text-3xl">Example workflows for {B}</h2>
          {index.intro.map((p, i) => <p key={i} className="m-0 max-w-[var(--ui-measure)] text-sm leading-relaxed">{p}</p>)}
          <p className="m-0 max-w-[var(--ui-measure)] rounded-lg border bg-muted px-4 py-3 text-sm" data-role="latest"><b>Example context.</b> {index.latest}</p>
        </div>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,22rem),1fr))]">
          {pains.map((p) => (
            <Card key={p.id} id={`pain-${p.id}`} className="gap-3 py-5" data-pain={p.id}>
              <CardHeader className="px-5"><CardTitle className="text-base leading-snug">{p.title}</CardTitle>
                <CardDescription className="flex flex-wrap gap-1.5"><Badge variant="outline">{LEVEL[p.level]}</Badge><Badge variant="secondary">Example date: {day(p.asOf)}</Badge></CardDescription></CardHeader>
              <CardContent className="grid gap-2 px-5 text-sm">
                <p><b>Impact.</b> {p.impact}</p>
                <p className="text-muted-foreground">{p.detail}</p>
                <p className="text-xs text-muted-foreground"><b>Evidence.</b> {p.evidence}</p>
              </CardContent>
              {p.docs.length > 0 && <CardFooter className="flex-wrap gap-x-3 gap-y-1 px-5 text-xs">
                {p.docs.map((d) => { const doc = index.documents.find((x) => x.id === d); return doc ? <a key={d} className="text-foreground underline underline-offset-4" href={`#/welcome/doc/${d}`}>{doc.title}</a> : null })}
              </CardFooter>}
            </Card>
          ))}
        </div>
      </section>

      {/* ---- What ---- */}
      <section id="cs-what" tabIndex={-1} aria-labelledby="cs-what-title" className="grid scroll-mt-40 gap-5 pt-14 outline-none">
        <div className="grid gap-2">
          <Eyebrow>What</Eyebrow>
          <h2 id="cs-what-title" className="m-0 text-2xl font-semibold tracking-tight sm:text-3xl">What the CRM does about each problem</h2>
        </div>
        {/* A bordered grid: each cell draws its own right and bottom lines, 1px past its area, and the frame's border and
            clipping make the outer edge. Every cell stays closed, whatever the number of columns and however full the
            last row is. Long problem names and links wrap, so nothing in a cell runs past its lines. */}
        <div className="grid overflow-hidden rounded-2xl border [grid-template-columns:repeat(auto-fill,minmax(min(100%,20rem),1fr))]" data-kk="capabilities">
          {index.what.map((c) => (
            <div key={c.capability} className="-mr-px -mb-px grid content-start gap-3 border-r border-b p-6" data-capability={c.status}>
              <h3 className="m-0 text-base leading-snug font-semibold">{c.capability}</h3>
              <div className="flex flex-wrap gap-1.5"><Badge variant="secondary" className={STATUS[c.status][1]}>{STATUS[c.status][0]}</Badge>
                {c.addresses.map((a) => <a key={a} href={`#/welcome?section=why`} onClick={(e) => { e.preventDefault(); document.getElementById(`pain-${a}`)?.scrollIntoView({ block: "center" }) }} className="no-underline"><Badge variant="outline" title={painTitle(a)} className="max-w-full text-left whitespace-normal">{painTitle(a)}</Badge></a>)}</div>
              <p className="m-0 text-sm text-muted-foreground">{c.detail}</p>
              {c.href && <Button asChild size="sm" variant="outline" className="h-auto min-h-8 w-fit max-w-full py-1.5 text-left whitespace-normal"><a href={c.href}>Open {c.where}</a></Button>}
              {!c.href && c.where && <p className="m-0 text-xs text-muted-foreground">Where: {c.where}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* ---- How: the workflows as cards that scroll sideways, the walkthrough first ---- */}
      <section id="cs-how" tabIndex={-1} aria-labelledby="cs-how-title" className="grid scroll-mt-40 gap-5 pt-14 outline-none">
        <div className="grid gap-2">
          <Eyebrow>How</Eyebrow>
          <h2 id="cs-how-title" className="m-0 text-2xl font-semibold tracking-tight sm:text-3xl">How the teams use it, step by step</h2>
          <p className="m-0 max-w-[var(--ui-measure)] text-sm text-muted-foreground">Each card opens the screen where the step happens. The walkthrough takes one new sample project from the first conversation to verified acceptance, as BD, Account and Finance in turn.</p>
        </div>
        <ol className="m-0 flex snap-x snap-mandatory list-none gap-4 overflow-x-auto p-0 pb-3" aria-label="The workflows" tabIndex={0} data-kk="how">
          {onWalkthrough && <li className="w-[min(85vw,26rem)] shrink-0 snap-start">
            <Card className="h-full gap-3 overflow-hidden border-[#151515] bg-[#151515] pt-0 pb-5 text-[#e9ebdf]">
              <img src="/assets/welcome/walkthrough-card.jpg" alt="The walkthrough's card beside Quick intake: the step, the role's responsibility, what to do and the expected outcome." width={1000} height={625} loading="lazy" decoding="async" className="block aspect-[16/10] h-auto w-full border-b border-[#433e38] object-cover object-top" />
              <CardHeader className="px-5"><CardDescription className="text-[#a6a69e]">The whole lifecycle · BD, Account, Finance</CardDescription>
                <CardTitle className="text-lg leading-snug font-normal">Take the walkthrough</CardTitle></CardHeader>
              <CardContent className="px-5 text-sm text-[#cbccc4]"><p>Eleven steps on the real screens: open an opportunity, win it, confirm the brief, propose the money, have Finance approve it, deliver, and have the acceptance verified. Your progress is kept, and you can pause or stop at any time.</p></CardContent>
              <CardFooter className="mt-auto px-5"><button type="button" onClick={onWalkthrough} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#e9ebdf] px-5 text-sm font-medium text-[#151515] hover:bg-white focus-visible:ring-[3px] focus-visible:ring-white/60 focus-visible:outline-none"><Sparkles className="size-4" aria-hidden="true" /> Start the walkthrough</button></CardFooter>
            </Card></li>}
          {flow.map((s, i) => (
            <li key={s.title} className="w-[min(85vw,22rem)] shrink-0 snap-start">
              <Card className="h-full gap-3 overflow-hidden pt-0 pb-5">
                {s.image && <img src={s.image} alt={s.alt ?? ""} width={1000} height={625} loading="lazy" decoding="async" className="block aspect-[16/10] h-auto w-full border-b object-cover object-top" />}
                <CardHeader className={`px-5 ${s.image ? "" : "pt-5"}`}><CardDescription>Step {i + 1} · {s.role}</CardDescription><CardTitle className="text-base leading-snug">{s.title}</CardTitle></CardHeader>
                <CardContent className="px-5 text-sm"><p>{s.text}</p></CardContent>
                <CardFooter className="mt-auto px-5"><Button asChild size="sm" variant="outline"><a href={s.href}>{s.cta}</a></Button></CardFooter>
              </Card></li>
          ))}
        </ol>
        {next.length > 0 && <Card className="gap-2 py-5"><CardHeader className="px-5"><CardTitle className="text-base">Where you begin</CardTitle></CardHeader>
          <CardContent className="grid gap-3 px-5 text-sm">{next.map((n) => <div key={n.href} className="flex flex-wrap items-center gap-3"><span>{n.text}</span><Button asChild size="sm"><a href={n.href}>{n.cta}</a></Button></div>)}</CardContent></Card>}
      </section>

      {/* ---- The tools it sits beside ---- */}
      <section aria-labelledby="cs-tools-title" className="grid gap-5 pt-14">
        <div className="grid gap-2"><Eyebrow>Alongside your tools</Eyebrow><h2 id="cs-tools-title" className="m-0 text-2xl font-semibold tracking-tight">It extends the tools the teams already use</h2></div>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,16rem),1fr))]">
          {index.tools.map((t) => (
            <div key={t.name} className="grid content-start gap-2 rounded-xl border p-5" data-tool={t.status}>
              <div className="flex items-center justify-between gap-2"><h3 className="m-0 text-base font-semibold">{t.name}</h3><Badge variant="secondary" className={STATUS[t.status][1]}>{STATUS[t.status][0]}</Badge></div>
              <p className="m-0 text-xs text-muted-foreground">{t.examples}</p>
              <p className="m-0 text-sm">{t.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Questions ---- */}
      <section aria-labelledby="cs-faq-title" className="grid gap-6 pt-14 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="grid content-start gap-2 md:sticky md:top-40 md:self-start"><Eyebrow>Questions</Eyebrow><h2 id="cs-faq-title" className="m-0 text-2xl font-semibold tracking-tight">What people ask first</h2></div>
        <Accordion type="multiple" className="rounded-xl border px-5" data-kk="faq">
          {index.faq.map((f, i) => (
            <AccordionItem key={f.q} value={`q${i}`}>
              <AccordionTrigger className="text-base">{f.q}</AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* ---- Sources ---- */}
      <section id="cs-sources" tabIndex={-1} aria-labelledby="cs-sources-title" className="grid scroll-mt-40 gap-5 pt-14 outline-none">
        <div className="grid gap-2">
          <Eyebrow>Sources</Eyebrow>
          <h2 id="cs-sources-title" className="m-0 text-2xl font-semibold tracking-tight">Sample documentation</h2>
          <p className="m-0 max-w-[var(--ui-measure)] text-sm text-muted-foreground">Anonymized English copies, made for this page. The originals are kept unchanged, outside the app. {index.naming}</p>
        </div>
        {index.documents.length === 0 ? <Alert><AlertTitle>No document is published yet</AlertTitle><AlertDescription>The anonymized copies are still being prepared.</AlertDescription></Alert> : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,22rem),1fr))]">
            {index.documents.map((d) => (
              <Card key={d.id} className="gap-3 py-5" data-doc={d.id}>
                <CardHeader className="px-5"><CardTitle className="text-base leading-snug"><a className="text-foreground underline-offset-4 hover:underline" href={`#/welcome/doc/${d.id}`}>{d.title}</a></CardTitle>
                  <CardDescription className="flex flex-wrap gap-1.5"><Badge variant="secondary">{d.type}</Badge><Badge variant="outline">{d.date}</Badge>{d.words ? <Badge variant="outline">{d.words} words</Badge> : null}</CardDescription></CardHeader>
                <CardContent className="grid gap-1 px-5 text-sm"><p>{d.summary}</p><p className="text-xs text-muted-foreground">Based on {d.basedOn}.</p></CardContent>
                <CardFooter className="flex-wrap gap-2 px-5"><Button asChild size="sm"><a href={`#/welcome/doc/${d.id}`}><FileText aria-hidden="true" /> Read</a></Button>
                  <DownloadButton ctx={ctx} doc={d} /></CardFooter>
              </Card>
            ))}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="gap-2 py-5"><CardHeader className="px-5"><CardTitle className="text-base">Not published</CardTitle>
            <CardDescription>Kept out until they can be anonymized reliably.</CardDescription></CardHeader>
            <CardContent className="px-5"><ul className="grid gap-1.5 text-sm">{index.pending.map((p) => <li key={p.title}><b>{p.title}.</b> <span className="text-muted-foreground">{p.reason}</span></li>)}</ul></CardContent></Card>
          <Card className="gap-2 py-5"><CardHeader className="px-5"><CardTitle className="text-base">How this case study was put together</CardTitle><CardDescription>Reviewed {day(index.reviewed)}.</CardDescription></CardHeader>
            <CardContent className="px-5"><ul className="grid list-disc gap-1 pl-5 text-sm">{index.method.map((m) => <li key={m}>{m}</li>)}</ul></CardContent></Card>
        </div>
      </section>

      {/* ---- Closing call to action ---- */}
      <section aria-labelledby="cs-cta-title" className="mt-14 grid justify-items-center gap-5 rounded-2xl bg-[#151515] bg-[radial-gradient(70%_120%_at_50%_120%,#5a2a14_0%,#151515_70%)] px-6 py-14 text-center text-[#e9ebdf]">
        <h2 id="cs-cta-title" className="m-0 max-w-[24ch] text-3xl leading-tight font-light tracking-tight text-balance sm:text-4xl">See one job go from the first conversation to verified acceptance</h2>
        <div className="flex flex-wrap justify-center gap-3">
          {onWalkthrough && <button type="button" onClick={onWalkthrough} className="inline-flex h-12 items-center gap-2 rounded-full bg-[#e9ebdf] px-6 text-base font-medium text-[#151515] hover:bg-white focus-visible:ring-[3px] focus-visible:ring-white/60 focus-visible:outline-none"><Sparkles className="size-4" aria-hidden="true" /> Start the walkthrough</button>}
          {next[0] && <a href={next[0].href} className="inline-flex h-12 items-center gap-2 rounded-full border border-[#5b5750] px-6 text-base text-[#e9ebdf] no-underline hover:bg-[#242424] focus-visible:ring-[3px] focus-visible:ring-white/60 focus-visible:outline-none">{next[0].cta}</a>}
        </div>
        <p className="m-0 text-xs text-[#a6a69e]">Sample data only. The walkthrough opens its own sample project and touches no other record.</p>
      </section>
    </div>
  )
}

// ---- One supporting document, read in the app --------------------------------------------------------------------
function DownloadButton({ ctx, doc }: { ctx: Ctx; doc: Doc }) {
  const [error, setError] = React.useState<string | null>(null)
  const download = async () => {
    setError(null)
    try {
      const text = await fetchCaseStudy(ctx, `${doc.id}.md`)
      const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }))
      const a = document.createElement("a"); a.href = url; a.download = `tp-production-studio-${doc.id}.md`; document.body.append(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e: any) { setError(e.message) }
  }
  return <><Button size="sm" variant="outline" onClick={download}><Download aria-hidden="true" /> Download (.md)</Button>{error && <span role="alert" className="text-xs text-destructive">{error}</span>}</>
}

function DocumentView({ ctx, docId, index }: { ctx: Ctx; docId: string; index?: Index }) {
  const [state, setState] = React.useState<{ status: "loading" | "ready" | "error"; text?: string; error?: string }>({ status: "loading" })
  React.useEffect(() => {
    if (!/^[a-z0-9-]{1,60}$/.test(docId)) { setState({ status: "error", error: "This document is not available." }); return }
    fetchCaseStudy(ctx, `${docId}.md`).then((text) => setState({ status: "ready", text })).catch((e) => setState({ status: "error", error: e.message }))
  }, [docId])
  const doc = index?.documents.find((d) => d.id === docId)
  return (
    <article className="grid gap-4" data-kk="case-study-doc">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline"><a href="#/welcome?section=sources"><ArrowLeft aria-hidden="true" /> Back to the Welcome guide</a></Button>
        {doc && <DownloadButton ctx={ctx} doc={doc} />}
      </div>
      {state.status === "loading" && <Loading />}
      {state.status === "error" && <Failed message={state.error ?? ""} />}
      {state.status === "ready" && <Card className="py-6"><CardContent className="px-6"><Markdown text={state.text ?? ""} /></CardContent></Card>}
    </article>
  )
}

// A small renderer for the documents' restricted Markdown (headings, paragraphs, "- " lists, **bold**). It builds
// React elements, never HTML strings, so a document cannot inject markup.
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) => part.startsWith("**") && part.endsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : part)
}
export function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = []
  let list: string[] = []; let para: string[] = []
  const flush = () => {
    if (para.length) { blocks.push(<p key={blocks.length} className="max-w-[var(--ui-measure)] text-sm leading-relaxed">{inline(para.join(" "))}</p>); para = [] }
    if (list.length) { const items = list; blocks.push(<ul key={blocks.length} className="grid max-w-[var(--ui-measure)] list-disc gap-1 pl-5 text-sm">{items.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>); list = [] }
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd()
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) { flush(); const level = h[1].length; const cls = level === 1 ? "text-xl font-semibold" : level === 2 ? "mt-2 text-base font-semibold" : "text-sm font-semibold"
      blocks.push(level === 1 ? <h2 key={blocks.length} className={cls}>{inline(h[2])}</h2> : level === 2 ? <h3 key={blocks.length} className={cls}>{inline(h[2])}</h3> : <h4 key={blocks.length} className={cls}>{inline(h[2])}</h4>); continue }
    const li = line.match(/^\s*[-*]\s+(.*)$/)
    if (li) { if (para.length) flush(); list.push(li[1]); continue }
    if (!line.trim()) { flush(); continue }
    if (list.length) flush()
    para.push(line.trim())
  }
  flush()
  return <div className="grid gap-3">{blocks.length ? blocks : <p className="text-sm text-muted-foreground">This document is empty.</p>}<Separator className="my-1" /><p className="text-xs text-muted-foreground">Fictional example documentation. No customer research or customer records are included.</p></div>
}

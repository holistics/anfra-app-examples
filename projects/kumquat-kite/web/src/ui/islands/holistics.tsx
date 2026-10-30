//   Create  opens the team's Holistics workspace in a new tab to build a report there (navigation only: nothing is
//           sent to Holistics), then comes back to connect the saved report.
//   Connect saves a link to a Holistics report, with the CRM record it is about, in Kumquat Kite's database
//           (public.report_links, permissions checked by the database).
//   View    opens a connected report in Holistics, or inside Kumquat Kite once an embed is set up in Holistics. Until
//           then nothing about embedding is offered: the status box lists only what works in this copy.
import * as React from "react"
import { ExternalLink, Link2, Plus, RefreshCw, Trash2, Pencil, ArrowLeft } from "lucide-react"
import { Button } from "../components/button"
import { Badge } from "../components/badge"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/tabs"
import { Input } from "../components/input"
import { Label } from "../components/label"
import { Textarea } from "../components/textarea"
import { NativeSelect, NativeSelectOption } from "../components/native-select"
import { Alert, AlertDescription, AlertTitle } from "../components/alert"
import { Skeleton } from "../components/skeleton"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "../components/empty"
import { toast } from "../../ui.js"
import { newRequestId } from "../../../../shared/api.mjs"
import { fmtDateTime } from "../../../../shared/format.mjs"

export type Ctx = {
  api: any
  getToken: () => Promise<string | undefined>
  session: { id: string; roles: string[] }
  config: { holistics?: { url: string | null; embed: boolean } }
  has: (...roles: string[]) => boolean
  personName: (id: string | null) => string
}
export type ContextRef =
  | { type: "portfolio" }
  | { type: "client"; id: string; label: string }
  | { type: "project"; id: string; ref: string; label: string }
export type ReportLink = {
  id: string; report_ref: string; title: string; purpose: string | null; url: string; link_kind: string
  context_type: "portfolio" | "client" | "project"; client_id: string | null; project_id: string | null
  embed_object: string | null; created_by: string; created_at: string; updated_at: string; version: number
  client?: { id: string; client_ref: string; display_name: string } | null
  project?: { id: string; project_ref: string; title: string } | null
}

export const KINDS: Record<string, string> = { dashboard: "Dashboard", report: "Report", dataset: "Dataset exploration", other: "Other page" }
export const READERS = ["bd", "account", "finance", "admin"]
export const CHANGED = "kk:report-links-changed"

// The same rule as the database's check: an https address on holistics.io, without sign-in details or a token.
export function checkReportUrl(raw: string): string | null {
  let u: URL
  try { u = new URL(raw.trim()) } catch { return "Paste the report's full address, starting with https://" }
  if (u.protocol !== "https:") return "The address must start with https://"
  if (!/^([a-z0-9-]+\.)*holistics\.io$/i.test(u.hostname)) return "This is not a Holistics address (it must end in holistics.io)"
  if (u.username || u.password) return "Addresses with sign-in details cannot be saved"
  if ([...u.searchParams.keys()].some((k) => /token/i.test(k))) return "This address carries an access token: copy the report's normal address from the browser instead"
  if (u.href.length > 2000) return "The address is too long"
  return null
}

export const linkHash = (l: ReportLink) =>
  l.context_type === "project" && l.project ? `#/p/${l.project.project_ref}/overview`
    : l.context_type === "client" && l.client_id ? `#/crm/client/${l.client_id}` : null
export const contextLabel = (l: ReportLink) =>
  l.context_type === "project" && l.project ? `${l.project.project_ref} · ${l.project.title}`
    : l.context_type === "client" && l.client ? l.client.display_name : "Whole business (portfolio)"

export function announceChange() { window.dispatchEvent(new CustomEvent(CHANGED)) }

// Focus goes back to whatever opened a dialog (a button in a card, the header's Add report), as Radix does for its own
// trigger. The opener is read while the dialog is about to open, before focus moves into it.
function useReturnFocus(open: boolean) {
  const opener = React.useRef<HTMLElement | null>(null)
  const wasOpen = React.useRef(open)
  if (open && !wasOpen.current && typeof document !== "undefined") opener.current = document.activeElement as HTMLElement | null
  wasOpen.current = open
  return (e: Event) => { const el = opener.current; if (el && el.isConnected) { e.preventDefault(); el.focus() } }
}

// ---- Add or edit a report link -----------------------------------------------------------------------------------
type Draft = { url: string; title: string; purpose: string; link_kind: string; context_type: ContextRef["type"]; client_id: string; project_id: string; embed_object: string }
const draftFrom = (ctxRef?: ContextRef, link?: ReportLink): Draft => link
  ? { url: link.url, title: link.title, purpose: link.purpose ?? "", link_kind: link.link_kind, context_type: link.context_type, client_id: link.client_id ?? "", project_id: link.project_id ?? "", embed_object: link.embed_object ?? "" }
  : { url: "", title: "", purpose: "", link_kind: "dashboard", context_type: ctxRef?.type ?? "portfolio",
      client_id: ctxRef?.type === "client" ? ctxRef.id : "", project_id: ctxRef?.type === "project" ? ctxRef.id : "", embed_object: "" }

export function AddReportDialog({ ctx, open, onOpenChange, context, editing, onSaved }: {
  ctx: Ctx; open: boolean; onOpenChange: (v: boolean) => void; context?: ContextRef; editing?: ReportLink | null; onSaved?: (l: ReportLink) => void
}) {
  const holisticsUrl = ctx.config.holistics?.url ?? null
  const [tab, setTab] = React.useState(editing ? "connect" : "create")
  const [draft, setDraft] = React.useState<Draft>(() => draftFrom(context, editing ?? undefined))
  const [lists, setLists] = React.useState<{ clients: any[]; projects: any[] } | null>(null)
  const [listError, setListError] = React.useState<string | null>(null)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [opened, setOpened] = React.useState(false)
  const requestId = React.useRef(newRequestId())
  const returnFocus = useReturnFocus(open)

  React.useEffect(() => {
    if (!open) return
    setTab(editing ? "connect" : "create"); setDraft(draftFrom(context, editing ?? undefined)); setErrors({}); setSaveError(null); setOpened(false)
    requestId.current = newRequestId()
  }, [open, editing?.id])
  React.useEffect(() => {
    if (!open || lists) return
    Promise.all([ctx.api.clients(), ctx.api.projects()])
      .then(([clients, projects]) => setLists({ clients, projects }))
      .catch((e: any) => setListError(e?.message ?? "Could not load clients and projects"))
  }, [open])

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }))
  const validate = () => {
    const out: Record<string, string> = {}
    const urlError = checkReportUrl(draft.url); if (urlError) out.url = urlError
    if (draft.title.trim().length < 3) out.title = "Give the report a title (at least 3 characters)"
    if (draft.title.trim().length > 120) out.title = "Keep the title under 120 characters"
    if (draft.purpose.length > 500) out.purpose = "Keep the purpose under 500 characters"
    if (draft.context_type === "client" && !draft.client_id) out.client_id = "Choose the client"
    if (draft.context_type === "project" && !draft.project_id) out.project_id = "Choose the project"
    if (draft.embed_object && !/^[a-z][a-z0-9_]{0,127}$/.test(draft.embed_object)) out.embed_object = "Use the dashboard's AML unique name: lowercase letters, digits and underscores"
    setErrors(out); return !Object.keys(out).length
  }
  const save = async () => {
    setSaveError(null)
    if (!validate()) return
    setSaving(true)
    const fields = { url: draft.url.trim(), title: draft.title.trim(), purpose: draft.purpose.trim() || null, link_kind: draft.link_kind,
      context_type: draft.context_type, client_id: draft.context_type === "client" ? draft.client_id : null,
      project_id: draft.context_type === "project" ? draft.project_id : null,
      ...(ctx.has("admin") ? { embed_object: draft.embed_object.trim() || null } : {}) }
    try {
      const saved: ReportLink = editing ? await ctx.api.updateReportLink(editing.id, editing.version, fields) : await ctx.api.createReportLink(fields, requestId.current)
      toast(editing ? `Saved ${saved.report_ref}` : `Connected ${saved.report_ref}: ${saved.title}`, "ok")
      announceChange(); onSaved?.(saved); onOpenChange(false)
    } catch (e: any) {
      setSaveError(e?.message ?? "The report link was not saved.")
    } finally { setSaving(false) }
  }

  const contextFields = (
    <fieldset className="grid gap-3 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">What is the report about?</legend>
      <div className="grid gap-1.5">
        <Label htmlFor="rl-context">CRM record</Label>
        <NativeSelect id="rl-context" value={draft.context_type} onChange={set("context_type")} className="w-full" disabled={Boolean(context && context.type !== "portfolio")}>
          <NativeSelectOption value="portfolio">The whole business (portfolio)</NativeSelectOption>
          <NativeSelectOption value="client">One client</NativeSelectOption>
          <NativeSelectOption value="project">One project</NativeSelectOption>
        </NativeSelect>
      </div>
      {draft.context_type === "client" && (
        <div className="grid gap-1.5">
          <Label htmlFor="rl-client">Client</Label>
          <NativeSelect id="rl-client" value={draft.client_id} onChange={set("client_id")} aria-invalid={Boolean(errors.client_id)} className="w-full" disabled={!lists}>
            <NativeSelectOption value="">{lists ? "Choose a client" : "Loading clients…"}</NativeSelectOption>
            {lists?.clients.map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.display_name} ({c.client_ref})</NativeSelectOption>)}
          </NativeSelect>
          {errors.client_id && <p className="text-xs text-destructive">{errors.client_id}</p>}
        </div>
      )}
      {draft.context_type === "project" && (
        <div className="grid gap-1.5">
          <Label htmlFor="rl-project">Project</Label>
          <NativeSelect id="rl-project" value={draft.project_id} onChange={set("project_id")} aria-invalid={Boolean(errors.project_id)} className="w-full" disabled={!lists || context?.type === "project"}>
            <NativeSelectOption value="">{lists ? "Choose a project" : "Loading projects…"}</NativeSelectOption>
            {(lists?.projects ?? (context?.type === "project" ? [{ id: context.id, project_ref: context.ref, title: context.label }] : [])).map((p: any) =>
              <NativeSelectOption key={p.id} value={p.id}>{p.project_ref} · {p.title}</NativeSelectOption>)}
          </NativeSelect>
          {errors.project_id && <p className="text-xs text-destructive">{errors.project_id}</p>}
        </div>
      )}
      {listError && <p className="text-xs text-destructive">{listError}</p>}
    </fieldset>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto bg-card sm:max-w-2xl" aria-describedby="rl-desc" onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.report_ref}` : "Add a report"}</DialogTitle>
          <DialogDescription id="rl-desc">
            {editing ? "Change the link, its title or the CRM record it is about." : "Build the report in Holistics, or connect one you already have. Kumquat Kite keeps the link next to the CRM record it is about."}
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          {!editing && (
            <TabsList className="w-full">
              <TabsTrigger value="create">1 · Create in Holistics</TabsTrigger>
              <TabsTrigger value="connect">2 · Connect a report</TabsTrigger>
            </TabsList>
          )}
          <TabsContent value="create" className="grid gap-4 pt-2">
            {contextFields}
            {holisticsUrl ? (
              <div className="grid gap-3">
                <p className="text-sm">Open your Holistics workspace in a new tab and build the report there. Keep this tab open: come back when the report is saved.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild><a href={holisticsUrl} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(true)}>Open Holistics <ExternalLink aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span></a></Button>
                  <Button variant="outline" onClick={() => setTab("connect")}>I have the report link <Link2 aria-hidden="true" /></Button>
                </div>
                <Alert>
                  <AlertTitle>Opens Holistics only</AlertTitle>
                  <AlertDescription>This button opens {new URL(holisticsUrl).host} in a new tab. It does not send Kumquat Kite's data to Holistics: a report can only use data your Holistics workspace is already connected to.</AlertDescription>
                </Alert>
                {opened && <p className="text-sm text-muted-foreground" role="status">Holistics opened in a new tab. When the report is saved, copy its address from the browser and choose "I have the report link".</p>}
              </div>
            ) : (
              <Alert variant="destructive">
                <AlertTitle>No Holistics workspace is configured</AlertTitle>
                <AlertDescription>An Admin sets the workspace address (HOLISTICS_REPORTS_URL) on the server. You can still connect a report you already have.</AlertDescription>
              </Alert>
            )}
          </TabsContent>
          <TabsContent value="connect" className="grid gap-4 pt-2">
            <div className="grid gap-1.5">
              <Label htmlFor="rl-url">Report address</Label>
              <Input id="rl-url" type="url" inputMode="url" placeholder="https://…holistics.io/…" value={draft.url} onChange={set("url")} aria-invalid={Boolean(errors.url)} aria-describedby="rl-url-hint" autoComplete="off" />
              <p id="rl-url-hint" className={errors.url ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{errors.url ?? "Copy it from the browser's address bar while the report is open in Holistics."}</p>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_12rem] sm:gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="rl-title">Title</Label>
                <Input id="rl-title" value={draft.title} onChange={set("title")} maxLength={120} aria-invalid={Boolean(errors.title)} />
                {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rl-kind">Type</Label>
                <NativeSelect id="rl-kind" value={draft.link_kind} onChange={set("link_kind")} className="w-full">
                  {Object.entries(KINDS).map(([k, v]) => <NativeSelectOption key={k} value={k}>{v}</NativeSelectOption>)}
                </NativeSelect>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rl-purpose">What it answers <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea id="rl-purpose" value={draft.purpose} onChange={set("purpose")} maxLength={500} aria-invalid={Boolean(errors.purpose)} placeholder="For example: weekly pipeline by owner, for the Monday meeting" />
              {errors.purpose && <p className="text-xs text-destructive">{errors.purpose}</p>}
            </div>
            {contextFields}
            {ctx.has("admin") && ctx.config.holistics?.embed && (
              <div className="grid gap-1.5">
                <Label htmlFor="rl-embed">Embedded dashboard <span className="font-normal text-muted-foreground">(Admin, optional)</span></Label>
                <Input id="rl-embed" value={draft.embed_object} onChange={set("embed_object")} placeholder="AML unique name, for example pipeline_overview" aria-invalid={Boolean(errors.embed_object)} aria-describedby="rl-embed-hint" autoComplete="off" />
                <p id="rl-embed-hint" className={errors.embed_object ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{errors.embed_object ?? "Needed only to view this dashboard inside Kumquat Kite. It must be a canvas dashboard defined in AML in the Holistics workspace, with embedded analytics enabled."}</p>
              </div>
            )}
            {saveError && <Alert variant="destructive"><AlertTitle>Not saved</AlertTitle><AlertDescription>{saveError} Your entries are kept.</AlertDescription></Alert>}
          </TabsContent>
        </Tabs>
        {tab === "connect" && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Save report link"}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---- Viewing a connected dashboard inside Kumquat Kite (embedded analytics) ---------------------------------------
// The app server signs a token that expires in 10 minutes; the secret never reaches the browser.
export function EmbeddedViewer({ ctx, link, open, onOpenChange }: { ctx: Ctx; link: ReportLink; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [state, setState] = React.useState<{ status: "loading" | "ready" | "error"; url?: string; error?: string }>({ status: "loading" })
  const returnFocus = useReturnFocus(open)
  React.useEffect(() => {
    if (!open) return
    setState({ status: "loading" })
    ;(async () => {
      try {
        const r = await fetch("/api/holistics/embed", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await ctx.getToken()}` }, body: JSON.stringify({ id: link.id }) })
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(body?.error?.message ?? "The embedded dashboard is unavailable.")
        setState({ status: "ready", url: body.url })
      } catch (e: any) { setState({ status: "error", error: e?.message ?? "The embedded dashboard is unavailable." }) }
    })()
  }, [open, link.id])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] bg-card sm:max-w-[min(1400px,calc(100%-2rem))]" aria-describedby="rl-view-desc" onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>{link.title}</DialogTitle>
          <DialogDescription id="rl-view-desc">Embedded from Holistics ({link.report_ref}). It shows the data of the Holistics workspace.</DialogDescription>
        </DialogHeader>
        {state.status === "loading" && <Skeleton className="h-full w-full" aria-label="Loading the dashboard" />}
        {state.status === "error" && <Alert variant="destructive"><AlertTitle>Cannot show the dashboard here</AlertTitle><AlertDescription><p>{state.error}</p><Button asChild size="sm" variant="outline"><a href={link.url} target="_blank" rel="noopener noreferrer">Open it in Holistics instead <ExternalLink aria-hidden="true" /></a></Button></AlertDescription></Alert>}
        {state.status === "ready" && <iframe title={`${link.title} (Holistics)`} src={state.url} className="h-full w-full rounded-md border" allow="fullscreen; clipboard-write" referrerPolicy="no-referrer" />}
      </DialogContent>
    </Dialog>
  )
}

// ---- One connected report ----------------------------------------------------------------------------------------
export function ReportCard({ link, ctx, onEdit, highlight, here }: { link: ReportLink; ctx: Ctx; onEdit: (l: ReportLink) => void; highlight?: boolean; here?: ContextRef }) {
  const [confirming, setConfirming] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [viewing, setViewing] = React.useState(false)
  const embeddable = Boolean(ctx.config.holistics?.embed && link.embed_object)
  const mine = link.created_by === ctx.session.id || ctx.has("admin")
  // The way back to the CRM record the report is about, unless that record is the page already open.
  const onItsPage = here && here.type !== "portfolio" && ((here.type === "project" && link.project_id === here.id) || (here.type === "client" && link.client_id === here.id))
  const back = onItsPage ? null : linkHash(link)
  const remove = async () => {
    setBusy(true); setError(null)
    try { await ctx.api.archiveReportLink(link.id, link.version); toast(`Removed ${link.report_ref}`, "ok"); announceChange() }
    catch (e: any) { setError(e?.message ?? "Not removed.") } finally { setBusy(false); setConfirming(false) }
  }
  return (
    <Card data-report-ref={link.report_ref} className={highlight ? "gap-4 py-5 ring-2 ring-ring" : "gap-4 py-5"}>
      <CardHeader className="px-5">
        <CardTitle className="text-base leading-snug"><a className="text-foreground underline-offset-4 hover:underline" href={link.url} target="_blank" rel="noopener noreferrer">{link.title}<span className="sr-only"> (opens Holistics in a new tab)</span></a></CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{KINDS[link.link_kind] ?? link.link_kind}</Badge><span className="font-mono text-xs">{link.report_ref}</span>
        </CardDescription>
        <CardAction>{embeddable ? <Badge variant="outline">Can be viewed here</Badge> : <Badge variant="outline" title="Opens in Holistics; not embedded in Kumquat Kite">Opens in Holistics</Badge>}</CardAction>
      </CardHeader>
      <CardContent className="grid gap-2 px-5 text-sm">
        {link.purpose && <p className="max-w-[var(--ui-measure)]">{link.purpose}</p>}
        <p className="text-muted-foreground">About: {linkHash(link) && !onItsPage ? <a className="text-link underline-offset-4 hover:underline" href={linkHash(link) ?? undefined}>{contextLabel(link)}</a> : contextLabel(link)}</p>
        <p className="text-xs text-muted-foreground">Added by {ctx.personName(link.created_by)} · {fmtDateTime(link.created_at)}{link.updated_at !== link.created_at ? ` · edited ${fmtDateTime(link.updated_at)}` : ""}</p>
        {error && <Alert variant="destructive"><AlertTitle>Not allowed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      </CardContent>
      <CardFooter className="flex-wrap gap-2 px-5">
        <Button asChild size="sm"><a href={link.url} target="_blank" rel="noopener noreferrer">Open in Holistics <ExternalLink aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span></a></Button>
        {embeddable && <Button size="sm" variant="secondary" onClick={() => setViewing(true)}>View here</Button>}
        {back && <Button asChild size="sm" variant="outline"><a href={back}><ArrowLeft aria-hidden="true" /> Back to {link.context_type === "project" ? link.project?.project_ref : "the client"}</a></Button>}
        {mine && !confirming && <Button size="sm" variant="ghost" onClick={() => onEdit(link)}><Pencil aria-hidden="true" /> Edit</Button>}
        {mine && !confirming && <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}><Trash2 aria-hidden="true" /> Remove</Button>}
        {confirming && <span className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Confirm removal">Remove this link? The report stays in Holistics.
          <Button size="sm" variant="destructive" onClick={remove} disabled={busy}>{busy ? "Removing…" : "Yes, remove"}</Button>
          <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>Keep it</Button></span>}
      </CardFooter>
      {embeddable && <EmbeddedViewer ctx={ctx} link={link} open={viewing} onOpenChange={setViewing} />}
    </Card>
  )
}

// ---- What works with Holistics in this copy, said plainly: only what a person can do here is listed ---------------
export function IntegrationStatus({ ctx }: { ctx: Ctx }) {
  const url = ctx.config.holistics?.url
  const rows: [string, string][] = [
    ...(url ? [["Open Holistics to build a report", `Opens ${new URL(url).host} in a new tab. Navigation only.`] as [string, string]] : []),
    ["Keep report links with CRM records", "Saved in Kumquat Kite's database, with the client or project they are about."],
    ...(ctx.config.holistics?.embed ? [["View Holistics dashboards inside Kumquat Kite", "The server signs a 10-minute embed token for each view. An Admin names each dashboard's AML unique name on its link."] as [string, string]] : []),
  ]
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="px-5"><CardTitle className="text-base">How Kumquat Kite works with Holistics</CardTitle>
        <CardDescription>Reports are built and read in Holistics, on the data its workspace is connected to. Kumquat Kite sends it no data, and nothing is synchronised automatically.</CardDescription></CardHeader>
      <CardContent className="px-5">
        <ul className="grid gap-2">
          {rows.map(([what, note]) => (
            <li key={what} className="grid gap-1 rounded-md border px-3 py-2 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] sm:items-baseline sm:gap-3">
              <span className="text-sm font-medium">{what}</span>
              <span className="text-sm text-muted-foreground">{note}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

// ---- Loading the links ---------------------------------------------------------------------------------------------
export function useReportLinks(ctx: Ctx, filter: { projectId?: string; clientId?: string }) {
  const [state, setState] = React.useState<{ status: "loading" | "ready" | "error"; links: ReportLink[]; error?: string }>({ status: "loading", links: [] })
  const load = React.useCallback(() => {
    setState((s) => ({ ...s, status: "loading" }))
    ctx.api.reportLinks(filter).then((links: ReportLink[]) => setState({ status: "ready", links }))
      .catch((e: any) => setState({ status: "error", links: [], error: e?.message ?? "Could not load the report links." }))
  }, [filter.projectId, filter.clientId])
  React.useEffect(() => { load(); window.addEventListener(CHANGED, load); return () => window.removeEventListener(CHANGED, load) }, [load])
  return { ...state, reload: load }
}

export function LinksSkeleton() {
  return <div className="grid gap-3" aria-busy="true" aria-label="Loading report links">{[0, 1].map((i) => <div key={i} className="grid gap-2 rounded-lg border bg-card p-5"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-1/3" /><Skeleton className="h-3 w-2/3" /></div>)}</div>
}

export function NoLinks({ canAdd, onAdd, scope }: { canAdd: boolean; onAdd: () => void; scope: string }) {
  return (
    <Empty className="border bg-card">
      <EmptyHeader><EmptyTitle>No Holistics report is connected {scope} yet</EmptyTitle>
        <EmptyDescription>Connect the reports your team builds in Holistics, so everyone finds them next to the records they are about.</EmptyDescription></EmptyHeader>
      {canAdd && <EmptyContent><Button onClick={onAdd}><Plus aria-hidden="true" /> Add report</Button></EmptyContent>}
    </Empty>
  )
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <Alert variant="destructive"><AlertTitle>Report links unavailable</AlertTitle><AlertDescription><p>{message}</p><Button size="sm" variant="outline" onClick={onRetry}><RefreshCw aria-hidden="true" /> Try again</Button></AlertDescription></Alert>
}

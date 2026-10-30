// (web/src/next-steps.js, shared/next-actions.mjs), never stored, and kept apart from the committed next action:
// "Use as next action" only fills the Update project form, which saves with its version check like any other edit.
// After a save completes a check, the list says so, and its steps are the ones that save made next.
import * as React from "react"
import { Badge } from "../components/badge"
import { Button } from "../components/button"
import { Skeleton } from "../components/skeleton"
import { suggestionsFor, takeNews } from "../../next-steps.js"
import { fmtDate } from "../../../../shared/format.mjs"
import type { Ctx } from "./holistics"

type Due = { status: string; date: string | null; deadline?: string | null; late?: boolean; lines: string[]; missing?: string[] }
export type Suggestion = {
  key: string; code: string; label: string; kind: string; state: string; action: string; where: string; why: string
  owner: { id: string | null; name: string | null; role: string; suggested: boolean; note?: string }
  due: Due; href: string; mayAct: boolean; mayAssign: boolean
}
type Props = { ctx: Ctx & { config: Record<string, unknown>; people: unknown[] }; project: { id: string; project_ref: string }; readiness: unknown[]; loaded?: Record<string, unknown[]>; onUse?: (s: Suggestion) => void }
const load = suggestionsFor as (ctx: unknown, project: unknown, readiness: unknown[], completed?: string[], loaded?: unknown) => Promise<Suggestion[]>
const news = takeNews as (projectId: string) => { labels: string[]; suggestions: Suggestion[] } | null

function DueLine({ due }: { due: Due }) {
  const day = due.date ? fmtDate(due.date) : ""
  switch (due.status) {
    case "estimate": return <span>Suggested due <b>{day}</b> <Badge variant="outline">estimate</Badge></span>
    case "infeasible": return due.late
      ? <span><Badge variant="destructive">Late</Badge> the target was {fmtDate(due.deadline)}; earliest {day}</span>
      : <span><Badge variant="destructive">Not feasible as planned</Badge> earliest {day}, after {fmtDate(due.deadline)}</span>
    case "blocked": return <Badge variant="secondary">Waits for an earlier step</Badge>
    case "overdue": return <Badge variant="destructive">Already overdue</Badge>
    default: return <Badge variant="outline">Needs scheduling information</Badge>
  }
}

export default function NextSteps({ ctx, project, readiness, loaded, onUse }: Props) {
  const [items, setItems] = React.useState<Suggestion[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState<string[] | null>(null)
  React.useEffect(() => {
    let live = true
    // The news of a save outranks a plain recalculation that finishes after it (both read the same saved state; only
    // the news knows which check that save completed).
    let told = false
    const tell = (labels: string[], suggestions: Suggestion[]) => { told = true; setDone(labels); setItems(suggestions) }
    const n = news(project.id)
    if (n) tell(n.labels, n.suggestions)
    else load(ctx, project, readiness, [], loaded).then((s) => { if (live && !told) setItems(s) }, (e: Error) => { if (live && !told) setError(e.message) })
    // A save made while this list is on screen: take its news here, instead of a separate notice.
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail
      if (d.projectId !== project.id) return
      d.handled = true
      tell(d.labels, d.suggestions)
    }
    window.addEventListener("kk:next-steps", on)
    return () => { live = false; window.removeEventListener("kk:next-steps", on) }
  }, [ctx, project, readiness, loaded])
  return (
    <div className="grid gap-3" data-kk="next-steps">
      {done && <div role="status" className="rounded-md border border-[var(--ui-ok-line)] bg-[var(--ui-ok-soft)] px-3 py-2 text-sm" data-role="news">
        <b>Done: {done.join(", ")}.</b> The steps below are what that save made next.</div>}
      <p className="m-0 max-w-[var(--ui-measure)] text-sm text-muted-foreground">Suggestions, not assignments: nothing changes until someone allowed to saves it. Each date is an estimate that says how it was worked out.</p>
      {items === null && !error && <div className="grid gap-2" aria-label="Working out the next steps"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>}
      {error && <p role="alert" className="m-0 text-sm text-destructive">The suggestions could not be worked out: {error}</p>}
      {items && items.length === 0 && <p className="m-0 text-sm">No step is open on this project's readiness checks.</p>}
      {items && items.length > 0 && (
        <ol className="m-0 grid list-none gap-3 p-0">
          {items.map((s) => <Row key={s.key} s={s} onUse={onUse} />)}
        </ol>
      )}
    </div>
  )
}

function Row({ s, onUse }: { s: Suggestion; onUse?: (s: Suggestion) => void }) {
  return (
    <li className="rounded-md border border-border px-3 py-2" data-suggestion={s.key} data-code={s.code} data-due={s.due.status}>
      <p className="m-0 font-medium" data-role="action">{s.action}</p>
      <p className="m-0 text-sm text-muted-foreground" data-role="why">{s.why}</p>
      <dl className="m-0 mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Owner</dt>
          <dd className="m-0" data-role="owner">{s.owner.name ?? s.owner.role}{s.owner.name ? ` · ${s.owner.role}` : ""}{s.owner.suggested && <Badge variant="outline" className="ml-1">suggested</Badge>}</dd>
          {s.owner.note && <dd className="m-0 text-xs text-muted-foreground">{s.owner.note}</dd>}
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Due</dt>
          <dd className="m-0" data-role="due"><DueLine due={s.due} /></dd>
        </div>
      </dl>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-[var(--ui-link)]">How this date was worked out</summary>
        <ul className="m-0 mt-1 grid gap-1 pl-5" data-role="basis">{s.due.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </details>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {s.mayAct && <Button asChild size="sm"><a href={s.href}>Go there</a></Button>}
        {s.mayAssign && onUse && <Button size="sm" variant="outline" onClick={() => onUse(s)}>Use as next action</Button>}
        {!s.mayAct && <span className="text-xs text-muted-foreground">Your role does not do this step: {s.owner.name ?? s.owner.role} does.</span>}
      </div>
    </li>
  )
}

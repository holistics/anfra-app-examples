// Each check keeps its status and detail from the database view (public.project_readiness). Its help comes from one
// table, shared/readiness-guide.mjs, read with the viewer's roles and the project's pending records:
//   the tooltip (hover or keyboard focus) gives the one-line answer to "what now?";
//   the help popover (click, tap, Enter or Space) explains the check, its steps (preparing or submitting, then
//   approving or verifying), who is responsible, where to go and what completes it, with links only to what this
//   viewer may do. Taking the action is still checked by the database.
import * as React from "react"
import { CircleHelp } from "lucide-react"
import { cn } from "cn"
import { Button } from "../components/button"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "../components/popover"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/tooltip"
import { guide } from "../../../../shared/readiness-guide.mjs"
import { CHECK_ICON as ICONS, CHECK_STATUS as STATUSES } from "../../labels.js"
import type { Ctx } from "./holistics"

const CHECK_ICON: Record<string, string> = ICONS
const CHECK_STATUS: Record<string, string> = STATUSES
// The guidance table is plain JavaScript (shared with the server tests); its inputs are the records as loaded.
const guideFor = guide as (check: Check, project: Record<string, unknown>, viewer: { id: string; roles: string[] }, opts: Record<string, unknown>) => Guide | null

type Check = { check_code: string; label: string; status: string; detail: string; owner_role: string | null; sort_order: number }
type Step = { kind: string; title: string; who: string; action: string; state: "done" | "current" | "next" | "later" }
type Guide = {
  code: string; label: string; status: string; state: string; meaning: string; completes: string; now: string; short: string
  steps: Step[]; step?: { kind: string; title: string; who: string; role: string; where: string; action: string }
  yourPart: string | null; actions: { label: string; href: string }[]; mayAct: boolean; item?: { ref?: string } | null
}
type Props = { ctx: Ctx & { nav: (hash: string) => void }; project: Record<string, unknown>; readiness: Check[]; pending: unknown[]; milestones: unknown[]; work: unknown[] }

const STEP_STATE: Record<Step["state"], string> = { done: "done", current: "now", next: "after that", later: "later" }

// The status beside a check, from the guidance: a proposal waiting for Finance reads as such, not as "Missing".
function sideStatus(r: Check, g: Guide | null) {
  if (!g) return CHECK_STATUS[r.status] ?? r.status
  if (g.state === "pending") return `Waiting for Finance${g.item?.ref ? ` · ${g.item.ref}` : ""}`
  if (g.state === "done" || g.state === "na") return CHECK_STATUS[r.status] ?? r.status
  return `${CHECK_STATUS[r.status] ?? r.status}${g.step?.role ? ` · ${g.step.role}` : ""}`
}

export default function Readiness({ ctx, project, readiness, pending, milestones, work }: Props) {
  const viewer = { id: ctx.session.id, roles: ctx.session.roles }
  return (
    <TooltipProvider delayDuration={250}>
      <ul className="checks" data-kk="readiness">
        {readiness.map((r) => {
          const g = guideFor(r, project, viewer, { pending, milestones, work, personName: ctx.personName })
          return (
            <li key={r.check_code} className={cn(r.status, "kk-check")} data-check={r.check_code} data-state={g?.state}>
              <span className="ic" aria-hidden="true">{CHECK_ICON[r.status] ?? "?"}</span>
              <span><b>{r.label}</b><br /><span className="small">{r.detail}</span></span>
              <span className="kk-check-side">
                <span className="small muted" data-role="status">{sideStatus(r, g)}</span>
                {g && <Help g={g} nav={ctx.nav} />}
              </span>
            </li>
          )
        })}
      </ul>
    </TooltipProvider>
  )
}

function Help({ g, nav }: { g: Guide; nav: (hash: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const [tip, setTip] = React.useState(false)
  const id = `guide-${g.code}`
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setTip(false) }}>
      <Tooltip open={tip && !open} onOpenChange={setTip}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="xs" className="kk-help" aria-label={`Help: ${g.label}`} data-guide={g.code}>
              <CircleHelp aria-hidden="true" />{g.state === "done" || g.state === "na" ? "About" : "How to complete"}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-72" data-kk="guide-tip">{g.short}</TooltipContent>
      </Tooltip>
      {/* Never taller than the screen: on a short one (a phone held sideways) the help scrolls, so its links stay reachable. */}
      <PopoverContent align="end" collisionPadding={12} className="kk-guide grid max-h-[var(--radix-popover-content-available-height)] w-[min(25rem,calc(100vw-1.5rem))] gap-3 overflow-y-auto overscroll-contain text-sm" aria-labelledby={`${id}-title`} data-kk="guide">
        <PopoverHeader>
          <PopoverTitle id={`${id}-title`} className="text-base font-semibold">{g.label}</PopoverTitle>
          <PopoverDescription>{g.meaning}</PopoverDescription>
        </PopoverHeader>
        <p className="m-0"><span className="font-medium">Now: </span>{g.now}</p>
        <ol className="m-0 grid list-none gap-2 p-0" aria-label="Steps">
          {g.steps.map((s, i) => (
            <li key={s.kind} className={cn("rounded-md border px-3 py-2", s.state === "current" ? "border-ring bg-accent" : "border-border")} data-step={s.kind} data-step-state={s.state}>
              <p className="m-0 text-xs text-muted-foreground">Step {i + 1} of {g.steps.length} · {s.title} · <b>{STEP_STATE[s.state]}</b></p>
              <p className="m-0">{s.action}</p>
              <p className="m-0 text-xs text-muted-foreground">Who: {s.who}</p>
            </li>
          ))}
        </ol>
        {g.step && <p className="m-0"><span className="font-medium">Where: </span>{g.step.where}</p>}
        <p className="m-0"><span className="font-medium">Done when: </span>{g.completes}</p>
        {g.yourPart && <p className="m-0 rounded-md bg-muted px-3 py-2" data-role="your-part">{g.yourPart}</p>}
        {g.actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {g.actions.map((a, i) => (
              <Button key={a.href} asChild size="sm" variant={i === 0 && g.mayAct ? "default" : "outline"}>
                <a href={a.href} onClick={(e) => { e.preventDefault(); setOpen(false); nav(a.href) }}>{a.label}</a>
              </Button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

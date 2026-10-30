// step is, when it is done and where it lives: web/src/walkthrough.js. The card never blocks the page: it is a panel
// beside it, and the invitation is a banner in the page's flow.
import * as React from "react"
import { createPortal } from "react-dom"
import { Button } from "../components/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/dialog"
import { store as wtStore, actions as wtActions } from "../../walkthrough.js"

type Step = { id: string; title: string; duty: string; todo: string; outcome: string; role: string | null }
type View = {
  status: string; step?: Step | null; index?: number; total?: number; ref?: string | null; roleOk?: boolean
  who?: { key: string; name: string; role: string } | null; error?: string | null
}
const store = wtStore as { subscribe: (f: () => void) => () => void; get: () => View }
const actions = wtActions as Record<string, (...a: string[]) => Promise<void> | void>

export default function Walkthrough() {
  const v = React.useSyncExternalStore(store.subscribe, store.get)
  const slot = document.getElementById("wt-invite")
  return (
    <>
      {v.status === "invite" && slot && createPortal(<Invite />, slot)}
      {["active", "paused", "choose", "gone", "demo-only"].includes(v.status) && <Dock v={v} />}
      {v.status === "complete" && <Complete v={v} />}
    </>
  )
}

function Invite() {
  return (
    <section className="wt-invite" aria-labelledby="wt-invite-title" data-kk="walkthrough-invite">
      <div>
        <h2 id="wt-invite-title" className="m-0 text-base font-semibold">New here? Take the walkthrough</h2>
        <p className="m-0 text-sm text-muted-foreground">One sample project from the first conversation to the acceptance Finance verifies, on the real screens, as BD, Account and Finance in turn. It opens a new sample project and uses the demo personas only.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => actions.start()}>Start walkthrough</Button>
        <Button size="sm" variant="outline" onClick={() => actions.later()}>Maybe later</Button>
      </div>
    </section>
  )
}

// While the card shows, the page keeps room for it at the bottom, so every control can be scrolled clear of it; on a
// phone the card sits on top of the bottom navigation, whatever its height.
function useRoom(ref: React.RefObject<HTMLElement | null>) {
  React.useLayoutEffect(() => {
    const el = ref.current; if (!el) return
    const root = document.documentElement
    const nav = document.querySelector<HTMLElement>(".appbar .nav")
    const measure = () => {
      root.style.setProperty("--wt-dock-h", `${Math.ceil(el.getBoundingClientRect().height)}px`)
      const bottomNav = nav && window.matchMedia("(max-width: 860px)").matches ? Math.ceil(nav.getBoundingClientRect().height) : 0
      root.style.setProperty("--wt-nav-h", `${bottomNav}px`)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el); if (nav) ro.observe(nav)
    window.addEventListener("resize", measure)
    document.body.classList.add("wt-docked")
    measure()
    return () => {
      ro.disconnect(); window.removeEventListener("resize", measure); document.body.classList.remove("wt-docked")
      root.style.removeProperty("--wt-dock-h"); root.style.removeProperty("--wt-nav-h")
    }
  }, [ref])
}

function Dock({ v }: { v: View }) {
  const [shown, setShown] = React.useState(true)
  const ref = React.useRef<HTMLElement>(null)
  useRoom(ref)
  const head = v.step && v.index !== undefined ? `Walkthrough · step ${v.index + 1} of ${v.total}${v.step.role ? ` · ${v.step.role}` : ""}${v.ref ? ` · ${v.ref}` : ""}` : "Walkthrough"
  let body: React.ReactNode
  if (v.status === "demo-only") {
    body = <><p className="m-0 text-sm">The walkthrough runs with the demo personas (BD, Account and Finance) on its own sample project. Choose a demo persona to start it.</p>
      <div className="wt-actions"><Button size="sm" variant="outline" onClick={() => actions.close()}>Close</Button></div></>
  } else if (v.status === "gone") {
    body = <><p className="m-0 text-sm">The walkthrough's sample project is no longer there: the demo data was reset. Start again with a new sample project, or stop here.</p>
      <div className="wt-actions"><Button size="sm" onClick={() => actions.restart()}>Start again</Button><Button size="sm" variant="outline" onClick={() => actions.exit()}>Exit</Button></div></>
  } else if (v.status === "choose") {
    body = <><p className="m-0 text-sm">A walkthrough is under way{v.step ? `, at "${v.step.title}"` : ""}{v.ref ? ` on ${v.ref}` : ""}.</p>
      <div className="wt-actions"><Button size="sm" onClick={() => actions.resume()}>Resume</Button><Button size="sm" variant="outline" onClick={() => actions.restart()}>Start again with a new sample project</Button>
        <Button size="sm" variant="ghost" onClick={() => actions.exit()}>Exit</Button></div></>
  } else if (v.status === "paused") {
    body = <><p className="m-0 text-sm">Paused{v.step ? ` at "${v.step.title}"` : ""}. Your place is kept.</p>
      <div className="wt-actions"><Button size="sm" onClick={() => actions.resume()}>Resume</Button><Button size="sm" variant="ghost" onClick={() => actions.exit()}>Exit</Button></div></>
  } else if (v.step) {
    body = <>
      <h2 className="m-0 text-base font-semibold" aria-live="polite" data-role="title">{v.step.title}</h2>
      <p className="m-0 text-sm" data-role="duty">{v.step.duty}</p>
      <p className="m-0 text-sm" data-role="todo"><b>What to do: </b>{v.step.todo}</p>
      <p className="m-0 text-sm text-muted-foreground" data-role="outcome"><b>Expected outcome: </b>{v.step.outcome}</p>
      {!v.roleOk && v.who && <div className="wt-switch" data-role="switch">
        <p className="m-0 text-sm">This step is for {v.who.role}. Switch to {v.who.name}, the demo {v.who.role} persona: the walkthrough carries on with {v.ref}.</p>
        <Button size="sm" onClick={() => actions.switchTo(v.who!.key)}>Switch to {v.who.name} ({v.who.role})</Button></div>}
      <div className="wt-actions">
        {v.roleOk && <Button size="sm" onClick={() => actions.go()}>Take me there</Button>}
        <Button size="sm" variant="outline" onClick={() => actions.pause()}>Pause</Button>
        <Button size="sm" variant="ghost" onClick={() => actions.exit()}>Exit</Button>
        <Button size="sm" variant="ghost" onClick={() => actions.restart()}>Start again</Button>
      </div>
    </>
  }
  return (
    <section ref={ref} className="wt-dock" aria-label="Walkthrough" data-kk="walkthrough" data-status={v.status} data-step={v.step?.id}>
      <div className="wt-head">
        <span className="text-xs font-medium text-muted-foreground">{head}</span>
        <Button size="xs" variant="ghost" aria-expanded={shown} onClick={() => setShown(!shown)}>{shown ? "Hide" : "Show"}</Button>
      </div>
      {shown && <div className="grid gap-2">{body}{v.error && <p role="alert" className="m-0 text-sm text-destructive">{v.error}</p>}</div>}
    </section>
  )
}
// the app already has. Escape, the close button or a click beside it close it and leave the screen as it is.
function Complete({ v }: { v: View }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) actions.complete() }}>
      <DialogContent className="sm:max-w-md" data-kk="walkthrough-complete">
        <DialogHeader>
          <DialogTitle>Walkthrough complete</DialogTitle>
          <DialogDescription>
            {v.ref ?? "The sample project"} went from the first conversation to verified acceptance, with BD, Account and Finance each doing their part.
            Every readiness check is OK, and the reports now count its approved figures.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row sm:justify-start">
          <Button onClick={() => actions.complete("#/home")}>Check My Next Actions</Button>
          <Button onClick={() => actions.complete("#/welcome?section=why")}>Read Case Study</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

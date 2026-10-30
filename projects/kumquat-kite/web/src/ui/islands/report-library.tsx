// The connected Holistics reports: on Reports (all of them, with the integration status) and on a project's Job 360
// (the ones about that project). Loading, empty, error and permission states are drawn here.
import * as React from "react"
import { Plus } from "lucide-react"
import { Button } from "../components/button"
import { Alert, AlertDescription, AlertTitle } from "../components/alert"
import { AddReportDialog, IntegrationStatus, LinksSkeleton, LoadError, NoLinks, READERS, ReportCard, useReportLinks, type ContextRef, type Ctx, type ReportLink } from "./holistics"

export default function ReportLibrary({ ctx, context, highlight, showStatus = false }: { ctx: Ctx; context?: ContextRef; highlight?: string; showStatus?: boolean }) {
  const [dialog, setDialog] = React.useState<{ open: boolean; editing: ReportLink | null }>({ open: false, editing: null })
  const allowed = ctx.has(...READERS)
  const filter = context?.type === "project" ? { projectId: context.id } : context?.type === "client" ? { clientId: context.id } : {}
  const { status, links, error, reload } = useReportLinks(ctx, allowed ? filter : { projectId: "__none__" })
  React.useEffect(() => { if (highlight && status === "ready") document.querySelector(`[data-report-ref="${CSS.escape(highlight)}"]`)?.scrollIntoView({ block: "center" }) }, [highlight, status])
  if (!allowed) {
    return <Alert><AlertTitle>Reports are for BD, Account, Finance and Admin</AlertTitle><AlertDescription>Ask an Admin for one of these roles to see and connect Holistics reports.</AlertDescription></Alert>
  }
  const scope = context?.type === "project" ? "about this project" : context?.type === "client" ? "about this client" : ""
  return (
    <div className="grid gap-4" data-kk="report-library">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[var(--ui-measure)] text-sm text-muted-foreground">{context?.type === "project" ? "Reports built in Holistics about this project. Each one opens in Holistics in a new tab, so this page stays where it is." : "Reports your team built in Holistics, kept next to the CRM records they are about. Each card leads back to its client or project."}</p>
        {status === "ready" && links.length > 0 && <Button variant="outline" onClick={() => setDialog({ open: true, editing: null })}><Plus aria-hidden="true" /> {context ? "Connect a report" : "Add report"}</Button>}
      </div>
      {status === "loading" && <LinksSkeleton />}
      {status === "error" && <LoadError message={error ?? ""} onRetry={reload} />}
      {status === "ready" && !links.length && <NoLinks canAdd onAdd={() => setDialog({ open: true, editing: null })} scope={scope} />}
      {status === "ready" && links.length > 0 && (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,22rem),1fr))]">
          {links.map((l) => <ReportCard key={l.id} link={l} ctx={ctx} here={context} highlight={l.report_ref === highlight} onEdit={(x) => setDialog({ open: true, editing: x })} />)}
        </div>
      )}
      {showStatus && <IntegrationStatus ctx={ctx} />}
      <AddReportDialog ctx={ctx} open={dialog.open} editing={dialog.editing} context={context} onOpenChange={(open) => setDialog((d) => ({ open, editing: open ? d.editing : null }))} />
    </div>
  )
}

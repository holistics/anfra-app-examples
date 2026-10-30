// The "Add report" button of the Reports header, with its dialog. After a save it opens the Holistics reports tab.
import * as React from "react"
import { Plus } from "lucide-react"
import { Button } from "../components/button"
import { AddReportDialog, READERS, type Ctx, type ReportLink } from "./holistics"

export default function AddReport({ ctx, nav }: { ctx: Ctx; nav: (hash: string) => void }) {
  const [open, setOpen] = React.useState(false)
  if (!ctx.has(...READERS)) return null
  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)} data-kk="add-report"><Plus aria-hidden="true" /> Add report</Button>
      <AddReportDialog ctx={ctx} open={open} onOpenChange={setOpen} onSaved={(l: ReportLink) => nav(`#/reports/holistics?highlight=${l.report_ref}`)} />
    </>
  )
}

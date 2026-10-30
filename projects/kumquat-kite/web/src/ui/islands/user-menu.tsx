// persona's initials, name and role on the button, and a menu with the six demo personas to switch to, the Welcome
// guide, the walkthrough, the help tips and a way back to the persona chooser, as in Atomic CRM's header. Built with
// Atomic CRM's Avatar and DropdownMenu components (MIT: ../components/LICENSE-atomic-crm.md). Keyboard: Enter or
// Space opens it, the arrow keys move, Escape closes it and returns the focus.
import * as React from "react"
import { BookOpen, LogOut, Sparkles } from "lucide-react"
import { Avatar, AvatarFallback } from "../components/avatar"
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "../components/dropdown-menu"

type Persona = { key: string; name: string; title: string }
type Props = {
  name: string; role: string; detail: string; tipsOn: boolean; onTips: (on: boolean) => void; onWalkthrough: () => void
  personas: Persona[]; current?: string; onSwitch: (key: string) => void; onLeave: () => void
}

export default function UserMenu({ name, role, detail, tipsOn, onTips, onWalkthrough, personas, current, onSwitch, onLeave }: Props) {
  const [tips, setTips] = React.useState(tipsOn)
  const initials = name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?"
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="kk-avatar-button" aria-label={`Demo persona: ${name}, ${role}. Switch persona`} data-kk="user-menu">
          <Avatar className="size-8"><AvatarFallback className="text-xs font-medium text-foreground">{initials}</AvatarFallback></Avatar>
          <span className="kk-persona" aria-hidden="true"><span className="kk-persona-name">{name}</span><span className="kk-persona-role">{role} · switch</span></span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="grid font-normal">
          <span className="text-sm font-medium">{name}</span>
          <span className="text-xs text-muted-foreground">{detail}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Demo persona (no sign-in)</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={current} onValueChange={(key) => { if (key && key !== current) onSwitch(key) }}>
          {personas.map((p) => (
            <DropdownMenuRadioItem key={p.key} value={p.key} data-persona-switch={p.key}>
              <span className="grid"><span>{p.name}</span><span className="text-xs text-muted-foreground">{p.title}</span></span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><a href="#/welcome"><BookOpen aria-hidden="true" /> Welcome guide</a></DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onWalkthrough()}><Sparkles aria-hidden="true" /> Start walkthrough</DropdownMenuItem>
        <DropdownMenuCheckboxItem checked={tips} onCheckedChange={(v) => { const on = v === true; setTips(on); onTips(on) }}>Help tips on every screen</DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onLeave()}><LogOut aria-hidden="true" /> Change persona…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

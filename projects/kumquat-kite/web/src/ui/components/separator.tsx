// From shadcn/ui (https://github.com/shadcn-ui/ui), apps/v4/registry/new-york-v4/ui/separator.tsx at commit d2fba50.
// MIT License, Copyright (c) 2023 shadcn: see ./LICENSE.md. Changes: "use client" removed (no server components here).
import * as React from "react"
import { cn } from "cn"
import { Separator as SeparatorPrimitive } from "radix-ui"

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
        className
      )}
      {...props}
    />
  )
}

export { Separator }

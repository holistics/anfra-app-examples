// From shadcn/ui (https://github.com/shadcn-ui/ui), apps/v4/registry/new-york-v4/ui/skeleton.tsx at commit d2fba50.
// MIT License, Copyright (c) 2023 shadcn: see ./LICENSE.md. Changes: none.
import { cn } from "cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-accent", className)}
      {...props}
    />
  )
}

export { Skeleton }

// Mounts a React "island" (a screen part built with shadcn/ui components) into an element of the plain-JavaScript
// app. The app imports this module only when a screen needs an island (see web/src/islands.js), so React and the
// components load in their own chunk, never on the other screens.
import * as React from "react"
import { createRoot } from "react-dom/client"

type Island = { default: React.ComponentType<any> }
const ISLANDS: Record<string, () => Promise<Island>> = {
  "add-report": () => import("./islands/add-report"),
  "report-library": () => import("./islands/report-library"),
  "case-study": () => import("./islands/case-study"),
  "readiness": () => import("./islands/readiness"),
  "next-steps": () => import("./islands/next-steps"),
  "walkthrough": () => import("./islands/walkthrough"),
  "user-menu": () => import("./islands/user-menu"),
}

export async function mountIsland(el: HTMLElement, name: string, props: Record<string, unknown>) {
  const load = ISLANDS[name]
  if (!load) throw new Error(`Unknown island: ${name}`)
  const { default: Component } = await load()
  const root = createRoot(el)
  root.render(<Component {...props} />)
  return {
    update(next: Record<string, unknown>) { root.render(<Component {...next} />) },
    unmount() { root.unmount() },
  }
}

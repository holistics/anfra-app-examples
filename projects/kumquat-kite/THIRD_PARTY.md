# Third-party code in the interface

The browser app bundles these packages (feedback 02, item 14). Each bundle keeps the packages' own licence comments
(esbuild keeps `@license` comments at the end of each file). The versions are exact in `package.json`.

| Package | Version | Licence | Used for |
| --- | --- | --- | --- |
| shadcn/ui components (copied source) | commit `d2fba50` | MIT | `web/src/ui/components/*.tsx`: Accordion, Alert, Badge, Button, Card, Dialog, Empty, Input, Label, Native select, Popover, Separator, Skeleton, Tabs, Textarea, Tooltip. Copyright (c) 2023 shadcn; the licence text is in `web/src/ui/components/LICENSE.md`, and each file names its source path. |
| Atomic CRM components (copied source) | commit `520ab92` | MIT | `web/src/ui/components/avatar.tsx` and `dropdown-menu.tsx`, the person's menu in the top bar (feedback 03, ticket 20). Copyright (c) 2024-present Francois Zaninotto, Marmelab; the licence text is in `web/src/ui/components/LICENSE-atomic-crm.md`, and each file names its source path and its changes (imports only). They build on shadcn/ui (above). |
| Atomic CRM (design reference) | commit `520ab92` | MIT | The look of the whole interface (ticket 20): the top bar and tabs, the neutral palette, hairline cards, list rows, 8px controls, badges, the segmented tab bar and the avatar colours. The values are restated in this app's own CSS (`anfra/apps/tokens.css`, `web/public/assets/styles.css`); no other Atomic CRM code is used, and neither its name nor its logo. Its app components need ra-core (react-admin), ra-supabase-core, react-router and TanStack Query, which this app does not use, so they were not copied, and nothing from that repository was installed, built or run. |
| react, react-dom | 19.2.9 | MIT | Rendering the islands that use those components (Reports, Job 360, Welcome guide) |
| radix-ui | 1.4.3 | MIT | The accessible primitives under Dialog, Tabs, Label, Separator, Popover, Tooltip, Dropdown menu, Avatar and Accordion: focus trap, keyboard navigation, ARIA |
| class-variance-authority | 0.7.1 | Apache-2.0 | The components' variants |
| cn | 0.2.4 | MIT | Merging Tailwind class names (shadcn/ui's helper) |
| lucide-react | 1.21.0 | ISC | Icons |
| tailwindcss, @tailwindcss/cli | 4.3.0 | MIT | Build time only: compiles `web/dist/ui.css` |
| tw-animate-css | 1.4.0 | MIT | The components' open and close animations |
| typescript, @types/react, @types/react-dom | 5.9.2, 19.2.2 | Apache-2.0, MIT | Build time only: `npm run typecheck` |

All of these are development dependencies: they are bundled into `web/dist` at build time, and the container
image's runtime does not install them.

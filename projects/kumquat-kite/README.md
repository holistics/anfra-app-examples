# Kumquat Kite — CRM, Job 360 and Finance

- **Idea:** One record for every job, from the first conversation to the acceptance Finance verifies.
- **What it does:** Helps teams manage clients, projects and money in one place.
- **How it works:** Account proposes a cost change with a reason and evidence. Anfra shows how it affects profit. Official figures change only after Finance approves.
- **Try it:** [Open the demo](https://kumquat-kite-poc-demo.pages.holistics.dev/#/welcome) · [Watch the video](https://media.holistics.io/anfra/competition-2026/crm-job-360-finance.mp4)
- **Author:** Toan Pham
- **Data:** Made-up records and a fictional example guide. No customer data or credentials are included.

## Run locally

- Install Node.js 20+, Docker with Compose, and Anfra 0.8.0 at `~/.anfra/bin/anfra` (or set `ANFRA_CLI` to its location).
- Run these commands from this folder:

```sh
npm ci
npm run setup
npm start
```

- Open http://127.0.0.1:8787, pick a demo user and start the guided walkthrough.
- Setup creates a local database with sample data and stores generated passwords in an ignored `.env.local` file.
- The database uses port `54339`. If app port `8787` is busy, use `PORT=8897 npm start`.
- Demo users are for local testing. They are not a production sign-in system.
- Optional settings: [environment example](config/environment.example). Third-party licences: [notices](THIRD_PARTY.md).

## Check the app

- Build: `npm run build`
- Check types: `npm run typecheck`
- Run tests: `npm test` (uses a separate local test database).
- Check Anfra models and figures: `npm run anfra:validate`, `npm run check:panels`, `npm run reconcile`.
- Check database access: `npm run check:reader`.

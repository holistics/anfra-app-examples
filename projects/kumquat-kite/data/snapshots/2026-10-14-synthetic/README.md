# Synthetic source snapshot, 14 October 2026

Clearly labelled, made-up demo data for TP Production Studio's Kumquat Kite proof of concept. Every row says
`data_classification = synthetic`; the import refuses any other row. No client data, live source IDs, job
codes or contact details are used.

The rows start from the column shapes and the sample story of the planning package's `templates/` folder (the
`demo-*-001` keys and the 100,000,000 VND contract / 60,000,000 VND complete forecast cost are the package's
illustration, in English as the templates are), and a few added rows:

| File | Rows | What the extra rows show |
|---|---|---|
| `clients.csv` | 3 | Two more synthetic brands. |
| `projects.csv` | 3 | A pipeline opportunity (no contract value) and a won job that keeps its existing job code. |
| `work_items.csv` | 3 | `demo-work-003` names a project key the snapshot does not have: it stays **unresolved**. |
| `cost_lines.csv` | 4 | `demo-cost-003` has a blank amount: it is imported as **unknown**, never as 0. `demo-cost-004` is only *submitted* in the source: it is not an approved baseline and stays **unresolved**. |
| `activities.csv` | 3 | Weekly CRM notes become history on the mapped opportunity; `demo-act-003` matches no opportunity and stays **unresolved** instead of creating a deal. |

`mapping.json` holds the reviewed mapping: source system and as-of time, the stage and work-status dictionaries,
and which demo user owns each source role. Records are matched only by `(source_system, source key)`, never by
name, service title or row position. Run it with `npm run import -- data/snapshots/2026-10-14-synthetic`
(preview) and add `--commit` to apply it.

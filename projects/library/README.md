# Library

Walk a book marketplace's catalogue as a low-poly 3D library: rooms sized by revenue share, shelves filled by genre share, and a book that opens into a spread with a governed price what-if.

- Demo: https://anfra-library.pages.holistics.dev
- Video: to be added
- Author: Zap

Start outside the building, then drill in: library → room (market, audience or category) → shelf (genre) → book. Six rooms take their floor area from revenue share, each of the eight shelves fills with its genre's share, and forty spines stand on every shelf. Click a book and it flies to the camera and opens into a two-page spread with its units, revenue, rank and growth against the previous period, plus a price what-if driven by an AML param. Every number is a live AQL `explore` against the `library` dataset, and the sidebar's breadcrumb chips are the Query Input filters. Period and grain are controls; the room axis is switchable.

## Run

```sh
anfra validate
anfra serve      # http://127.0.0.1:7878/apps/library
```

`.anfra/data_sources.yml` opens `data/library.duckdb` read-only with a relative path, so there is nothing to set up.

To rebuild the app from source (needs Node 22 and pnpm):

```sh
pnpm install
pnpm check       # tsc --checkJs over src/
pnpm build       # writes apps/library.html
```

## What is in this folder

| Path | What it is |
|---|---|
| `apps/library.html` | The Data App: one built HTML file (three.js bundled, no CDN) that queries the dataset through the anfra SDK |
| `datasets/library.dataset.aml` | Units, revenue, previous-period and growth metrics, shares (`of_all`), rank, and the what-if metrics |
| `models/books.model.aml`, `models/sales.model.aml` | AML models over the `books` and `sales` tables; `books.price_factor` is the what-if param |
| `data/library.duckdb` | The data |
| `data/fetch-real.mjs`, `data/load.sql`, `data/SOURCES.md` | How the data was built and where it comes from |
| `src/`, `build.mjs` | The app source as JSDoc-typed ES modules, and the esbuild script that inlines the bundle into `src/template.html` |

## Data

Sample data only. The 1,920 titles (title, author, ISBN, price, rating, format) come from the public Amazon Reviews 2023 book metadata published by the McAuley Lab at UC San Diego, mapped into six categories and eight genres each; `data/books-provenance.csv` records which fields are real and which were filled in. Weekly sales (24 Monday weeks ending 18 October 2026) are synthetic, scaled to each title's ratings count. No customer, reviewer or company data. See `data/SOURCES.md`.

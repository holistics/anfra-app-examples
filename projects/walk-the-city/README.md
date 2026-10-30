# Walk the city

An interactive data story that asks whether a place is made for people or for vehicles, from the whole planet down to one street.

- Demo: https://meomeo-anfra.pages.holistics.dev/apps/walkable-insights
- Video: https://media.holistics.io/anfra/competition-2026/walk-the-city.mp4
- Author: my-nguyen

## Run it

Copy this folder into a Data Folder host such as [anfra-host-example](https://github.com/holistics/anfra-host-example) (branch `meomeo-anfra-walk-city`). Run `anfra serve --no-apps` in this folder, then start the host and open **Walk the city**. Needs anfra 0.11.1 or newer.

## Data

Country and city anchors are real public data (Althoff 2017, Boeing 2025, UN-Habitat, WHO, ERA5 climate, published road and shop cases). Neighbourhood and street values are synthetic, calibrated against those anchors. The app Sources level and the `wk_sources` table list the licence of each source. No customer or internal data.

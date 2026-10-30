# Metric tree and catalog

Builds a metric tree from the metric definitions in the repo, shows what moved a business metric through a change path, and lists every metric in a catalog.

- Demo: https://meomeo-anfra.pages.holistics.dev/apps/metric-catalog-tree
- Video: https://media.holistics.io/anfra/competition-2026/metric-tree.mp4
- Author: my-nguyen

## Run it

Copy this folder into a Data Folder host such as [anfra-host-example](https://github.com/holistics/anfra-host-example) (branch `meomeo-anfra-metric-tree`). Run `anfra serve --no-apps` in this folder, then start the host and open **Metric tree and catalog**. Needs anfra 0.11.1 or newer.

## Data

Generated sample data only, in two DuckDB files. The scripts `data/generate_ecommerce.py` and `data/generate_metric_layers.py` make it. The data is not real. No customer or internal data.

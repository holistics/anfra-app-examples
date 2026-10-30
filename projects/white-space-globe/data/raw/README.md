# Raw public sources

Downloaded by `scripts/coverage-globe/seed.py` (`--refresh` re-downloads). The files themselves are committed with the app, so the seed runs offline from them.

| File | Source | Licence | Downloaded |
|---|---|---|---|
| `es.json` | [Eurostat SBS `sbs_sc_ovw`: enterprises with 50-249 and 250+ employees, business economy excl. financial (B-S_X_O_S94), 2022](https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/sbs_sc_ovw?format=JSON&lang=EN&indic_sbs=ENT_NR&nace_r2=B-S_X_O_S94&size_emp=50-249&size_emp=GE250&time=2022) | Eurostat: reuse with attribution | 2026-10-13 |
| `oecd.csv` | [OECD SDBS (ISIC Rev.4): enterprises by size class, 2018 onwards (US only has 2015, so it is excluded and estimated)](https://sdmx.oecd.org/public/rest/data/OECD.SDD.TPS,DSD_SDBSBSC_ISIC4@DF_SDBS_ISIC4,/A..ENTR.BTSXO_S94+BTNXK+_T.S50T249+S_GE250+S_GE50.?startPeriod=2018&format=csvfile) | OECD terms and conditions: attribution | 2026-10-13 |
| `wb_gdp.json` | [World Bank GDP, current US$, 2023 (NY.GDP.MKTP.CD)](https://api.worldbank.org/v2/country/all/indicator/NY.GDP.MKTP.CD?date=2023&format=json&per_page=500) | CC BY 4.0 | 2026-10-13 |
| `wb_pcap.json` | [World Bank GDP per capita, current US$, 2023 (NY.GDP.PCAP.CD)](https://api.worldbank.org/v2/country/all/indicator/NY.GDP.PCAP.CD?date=2023&format=json&per_page=500) | CC BY 4.0 | 2026-10-13 |
| `ne_50m_admin_0_countries.geojson` | [Natural Earth admin-0 countries, 1:50m](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson) | Public domain | 2026-10-13 |
| `ne_50m_admin_1_states_provinces.geojson` | [Natural Earth admin-1 states and provinces, 1:50m (US states used)](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson) | Public domain | 2026-10-13 |
| `ne_10m_populated_places_simple.geojson` | [Natural Earth populated places, 1:10m (city lat/lon and population)](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson) | Public domain | 2026-10-13 |
| `us_state_gdp.html` | [Wikipedia, List of U.S. states and territories by GDP (BEA figures)](https://en.wikipedia.org/wiki/List_of_U.S._states_and_territories_by_GDP) | BEA data: public domain; page: CC BY-SA 4.0 | 2026-10-13 |

Hand-added: Taiwan GDP 2023 = US$756B and GDP per capita = US$32,000 (IMF WEO; not in the World Bank API).

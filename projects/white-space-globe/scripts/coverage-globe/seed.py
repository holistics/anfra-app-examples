# /// script
# requires-python = ">=3.11"
# dependencies = ["duckdb==1.4.2", "numpy>=2", "pandas>=2.2,<3", "lxml>=5"]
# ///
"""Build data/arcfield.duckdb: public market sizes + synthetic CRM data for the Coverage Globe.

    uv run scripts/coverage-globe/seed.py              # uses the cached downloads in data/raw/
    uv run scripts/coverage-globe/seed.py --refresh    # re-downloads the public sources first

Same output on every run (fixed seed). Spec: docs/coverage-globe/data.md.
"""
import argparse
import calendar
import json
import math
import re
import sys
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

COMPANY = "Arcfield"  # the fictional company; rename here only
SEED = 20261019
ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
DB = ROOT / "data" / "arcfield.duckdb"

AS_OF = datetime(2026, 9, 30, 23, 59, 59)  # last data day; the app's "2026 (to Sep)"
BENCHMARK = 0.021  # white-space benchmark ≈ top-quartile penetration of mature markets (modeling.md)
PRICE_SCALE = 0.8  # global MRR multiplier, tuned so total ARR lands near $340M
UA = f"{COMPANY.lower()}-seed/1.0 (Anfra App Competition demo; synthetic data project)"

# ---------------------------------------------------------------------------------------------
# Public sources
# ---------------------------------------------------------------------------------------------
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson"
SOURCES = [
    ("es.json",
     "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/sbs_sc_ovw?format=JSON&lang=EN"
     "&indic_sbs=ENT_NR&nace_r2=B-S_X_O_S94&size_emp=50-249&size_emp=GE250&time=2022",
     "Eurostat SBS `sbs_sc_ovw`: enterprises with 50-249 and 250+ employees, business economy excl. "
     "financial (B-S_X_O_S94), 2022", "Eurostat: reuse with attribution"),
    ("oecd.csv",
     "https://sdmx.oecd.org/public/rest/data/OECD.SDD.TPS,DSD_SDBSBSC_ISIC4@DF_SDBS_ISIC4,/"
     "A..ENTR.BTSXO_S94+BTNXK+_T.S50T249+S_GE250+S_GE50.?startPeriod=2018&format=csvfile",
     "OECD SDBS (ISIC Rev.4): enterprises by size class, 2018 onwards (US only has 2015, so it is "
     "excluded and estimated)", "OECD terms and conditions: attribution"),
    ("wb_gdp.json",
     "https://api.worldbank.org/v2/country/all/indicator/NY.GDP.MKTP.CD?date=2023&format=json&per_page=500",
     "World Bank GDP, current US$, 2023 (NY.GDP.MKTP.CD)", "CC BY 4.0"),
    ("wb_pcap.json",
     "https://api.worldbank.org/v2/country/all/indicator/NY.GDP.PCAP.CD?date=2023&format=json&per_page=500",
     "World Bank GDP per capita, current US$, 2023 (NY.GDP.PCAP.CD)", "CC BY 4.0"),
    ("ne_50m_admin_0_countries.geojson", f"{NE}/ne_50m_admin_0_countries.geojson",
     "Natural Earth admin-0 countries, 1:50m", "Public domain"),
    ("ne_50m_admin_1_states_provinces.geojson", f"{NE}/ne_50m_admin_1_states_provinces.geojson",
     "Natural Earth admin-1 states and provinces, 1:50m (US states used)", "Public domain"),
    ("ne_10m_populated_places_simple.geojson", f"{NE}/ne_10m_populated_places_simple.geojson",
     "Natural Earth populated places, 1:10m (city lat/lon and population)", "Public domain"),
    ("us_state_gdp.html", "https://en.wikipedia.org/wiki/List_of_U.S._states_and_territories_by_GDP",
     "Wikipedia, List of U.S. states and territories by GDP (BEA figures)",
     "BEA data: public domain; page: CC BY-SA 4.0"),
]
# Hand-added where the World Bank has no row (IMF WEO 2023).
GDP_EXTRA = {"TWN": 7.56e11}
PCAP_EXTRA = {"TWN": 32_000}
EUROSTAT_A2 = {"DE": "DEU", "FR": "FRA", "IT": "ITA", "ES": "ESP", "PL": "POL", "NL": "NLD", "CH": "CHE",
               "CZ": "CZE", "RO": "ROU", "SE": "SWE", "PT": "PRT", "AT": "AUT", "BE": "BEL", "HU": "HUN",
               "DK": "DNK", "EL": "GRC", "IE": "IRL", "BG": "BGR", "NO": "NOR", "FI": "FIN", "RS": "SRB",
               "SK": "SVK", "LT": "LTU", "HR": "HRV", "SI": "SVN", "LV": "LVA", "EE": "EST", "LU": "LUX",
               "CY": "CYP", "MT": "MLT", "IS": "ISL"}


def fetch(refresh: bool) -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    for file, url, _, _ in SOURCES:
        path = RAW / file
        if path.exists() and not refresh:
            continue
        print(f"  downloading {file}")
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=120) as r:
            path.write_bytes(r.read())
    missing = [f for f, *_ in SOURCES if not (RAW / f).exists()]
    if missing:
        sys.exit(f"missing raw files: {missing}; run with --refresh")
    lines = ["# Raw public sources", "",
             "Downloaded by `scripts/coverage-globe/seed.py` (`--refresh` re-downloads). The files themselves are "
             "committed with the app, so the seed runs offline from them.", "",
             "| File | Source | Licence | Downloaded |", "|---|---|---|---|"]
    for file, url, desc, lic in SOURCES:
        day = date.fromtimestamp((RAW / file).stat().st_mtime).isoformat()
        lines.append(f"| `{file}` | [{desc}]({url}) | {lic} | {day} |")
    lines += ["", "Hand-added: Taiwan GDP 2023 = US$756B and GDP per capita = US$32,000 (IMF WEO; not in "
              "the World Bank API).", ""]
    (RAW / "README.md").write_text("\n".join(lines))


def load_market_sizes():
    """Return ({iso3: (firms50+, source, year)}, gdp, gdp_per_capita, fit) as in docs/coverage-globe/reference/market_size_calib.py."""
    d = json.loads((RAW / "es.json").read_text())
    n_geo = d["size"][d["id"].index("geo")]
    geo_idx = d["dimension"]["geo"]["category"]["index"]
    size_idx = d["dimension"]["size_emp"]["category"]["index"]
    real = {}
    for c, i in geo_idx.items():
        v = [d["value"].get(str(si * n_geo + i)) for si in size_idx.values()]
        if c in EUROSTAT_A2 and None not in v:
            real[EUROSTAT_A2[c]] = (int(sum(v)), "Eurostat SBS", 2022)

    oecd = pd.read_csv(RAW / "oecd.csv", dtype={"OBS_VALUE": float})
    oecd = oecd[oecd["ACTIVITY"].isin(["BTSXO_S94", "BTNXK", "_T"]) & oecd["OBS_VALUE"].notna()]
    best = {}
    for (area, act, year), g in oecd.groupby(["REF_AREA", "ACTIVITY", "TIME_PERIOD"]):
        v = dict(zip(g["SIZE_CLASS"], g["OBS_VALUE"]))
        total = v.get("S_GE50") or (v["S50T249"] + v["S_GE250"] if {"S50T249", "S_GE250"} <= v.keys() else None)
        if not total:
            continue
        rank = {"BTSXO_S94": 0, "BTNXK": 1, "_T": 2}[act]
        if area not in best or (rank, -year) < (best[area][2], -best[area][1]):
            best[area] = (int(total), int(year), rank)
    for area, (total, year, _) in best.items():
        real.setdefault(area, (total, "OECD SDBS", year))

    def wb(file, extra):
        rows = json.loads((RAW / file).read_text())[1]
        return {r["countryiso3code"]: r["value"] for r in rows if r["value"]} | extra

    gdp, pcap = wb("wb_gdp.json", GDP_EXTRA), wb("wb_pcap.json", PCAP_EXTRA)
    pts = np.array([(math.log(gdp[c]), math.log(v[0])) for c, v in real.items() if c in gdp])
    b, a = np.polyfit(pts[:, 0], pts[:, 1], 1)
    return real, gdp, pcap, (a, b, len(pts))


def load_state_gdp(state_names: set[str]) -> tuple[dict[str, float], str]:
    for t in pd.read_html(RAW / "us_state_gdp.html"):
        cols = [" ".join(str(x) for x in (c if isinstance(c, tuple) else (c,))) for c in t.columns]
        name_col = next((i for i, c in enumerate(cols) if "State" in c), None)
        gdp_cols = [(int(m.group()), i) for i, c in enumerate(cols)
                    if "Nominal GDP at current prices" in c and (m := re.search(r"20\d\d$", c))]
        if name_col is None or not gdp_cols:
            continue
        year, gdp_col = max(gdp_cols)
        out = {}
        for _, row in t.iterrows():
            name = re.sub(r"\[.*?\]|\*", "", str(row.iloc[name_col])).strip()
            name = {"Washington, D.C.": "District of Columbia"}.get(name, name)
            if name in state_names:
                out[name] = float(str(row.iloc[gdp_col]).replace(",", ""))
        if len(out) == len(state_names):
            return out, str(year)
    sys.exit("could not parse state GDP table from us_state_gdp.html")


# ---------------------------------------------------------------------------------------------
# The story (docs/coverage-globe/data.md): penetration on Sep 30 2026 and entry quarter per market
# ---------------------------------------------------------------------------------------------
COUNTRY_PLAN = {
    # 2019
    "USA": (0.85, "2019Q1"), "GBR": (1.8, "2019Q3"), "SGP": (3.0, "2019Q4"), "AUS": (1.2, "2019Q4"),
    "IRL": (1.6, "2019Q4"),
    # 2020: Northern Europe, Canada, Germany
    "NZL": (1.5, "2020Q1"), "NLD": (2.1, "2020Q1"), "SWE": (2.2, "2020Q1"), "DNK": (2.0, "2020Q2"),
    "NOR": (1.9, "2020Q2"), "FIN": (1.7, "2020Q3"), "CAN": (0.6, "2020Q1"), "DEU": (0.35, "2020Q2"),
    "CHE": (0.7, "2020Q3"), "ISR": (0.8, "2020Q3"), "BEL": (0.5, "2020Q4"), "HKG": (0.7, "2020Q4"),
    # 2021: France, Japan, India, Vietnam
    "FRA": (0.4, "2021Q1"), "JPN": (0.12, "2021Q2"), "IND": (0.15, "2021Q1"), "VNM": (0.6, "2021Q3"),
    "ESP": (0.25, "2021Q2"), "AUT": (0.35, "2021Q1"), "ARE": (0.6, "2021Q4"), "MYS": (0.5, "2021Q3"),
    "KOR": (0.12, "2021Q4"), "ZAF": (0.45, "2021Q4"), "ITA": (0.15, "2021Q3"),
    # 2022: Latin America, Southeast Asia
    "BRA": (0.13, "2022Q1"), "ARG": (0.15, "2022Q2"), "CHL": (0.35, "2022Q2"), "COL": (0.15, "2022Q3"),
    "IDN": (0.18, "2022Q1"), "THA": (0.25, "2022Q2"), "PHL": (0.4, "2022Q3"), "TWN": (0.2, "2022Q4"),
    "PRT": (0.25, "2022Q1"), "CZE": (0.12, "2022Q4"),
    # 2023-24: Middle East, Africa, China
    "CHN": (0.012, "2023Q2"), "SAU": (0.12, "2023Q1"), "TUR": (0.05, "2023Q3"), "KEN": (0.3, "2023Q4"),
    "NGA": (0.08, "2023Q4"), "EGY": (0.07, "2024Q1"),
    # not entered yet
    **{c: (0.0, None) for c in ["MEX", "POL", "PER", "GRC", "ROU", "HUN", "SRB", "BGR", "MAR", "PAK", "BGD",
                                "QAT", "KAZ", "LKA", "GHA"]},
}
# US states: coastal tech saturated, Sun Belt and Midwest not; unlisted states share one rate
# solved so the US total hits COUNTRY_PLAN["USA"].
STATE_PEN = {"CA": 2.0, "NY": 1.8, "MA": 2.0, "WA": 1.8, "CO": 1.6, "DC": 1.6,
             "TX": 0.4, "FL": 0.35, "GA": 0.45, "NC": 0.5, "OH": 0.4, "PA": 0.45,
             "IL": 0.6, "NJ": 0.8, "OR": 0.8, "UT": 0.9}
STATE_EARLY = {"CA", "NY", "MA", "WA", "IL", "TX", "NJ", "CO"}  # entered 2019 Q1; others 2019 Q2-2020 Q2

# Growth curve exponent towards the 2026 level: default 1.6; Vietnam accelerates late (fastest YoY);
# 2023-24 entrants grow fast early then flatten; France peaks in 2025 and stalls in 2026.
CURVE_K = {"VNM": 3.0, "FRA": 1.0}
CURVE_JITTER = (0.7, 1.35)  # other markets: own pace around the default, so YoY isn't identical per entry year
FRA_PEAK = 1.15  # France's end-2025 level relative to Sep 2026

NAME_FIX = {"USA": "United States", "TUR": "Türkiye"}
NORDICS = {"SWE", "DNK", "NOR", "FIN"}
HUBS = {"CHE", "ARE", "SGP", "ISR"}  # regional HQ hubs: bigger accounts
VALUE = {"IND", "VNM"}  # mostly small accounts

SEGMENTS = {  # name: (employees lo, hi, MRR lo, hi at US prices, main plan, annual churn)
    "Mid-market": (50, 249, 1_500, 4_000, "Essentials", 0.10),
    "Upper-mid": (250, 999, 5_000, 12_000, "Professional", 0.06),
    "Enterprise": (1_000, 20_000, 15_000, 40_000, "Enterprise", 0.03),
}
SEGMENT_MIX = {"default": (0.65, 0.27, 0.08), "hub": (0.25, 0.37, 0.38), "value": (0.88, 0.11, 0.01)}
PLANS = ["Essentials", "Professional", "Enterprise"]
UPGRADE, DOWNGRADE, FRA_CHURN_2026 = 0.18, 0.05, 0.18

INDUSTRIES = {"Manufacturing": 16, "Professional services": 14, "Retail & e-commerce": 13, "Technology": 12,
              "Logistics": 10, "Healthcare": 9, "Financial services": 8, "Construction": 7, "Hospitality": 6,
              "Education": 5}
INDUSTRY_TILT = {"DEU": {"Manufacturing": 1.6}, "JPN": {"Manufacturing": 1.5},
                 "GBR": {"Financial services": 1.5}, "SGP": {"Financial services": 1.6},
                 "USA": {"Technology": 1.4}, "IND": {"Technology": 1.6},
                 "VNM": {"Manufacturing": 1.5, "Logistics": 1.5}}

# Reviews: mean score per market (global ≈ 4.1)
RATING = {"SWE": 4.5, "DNK": 4.5, "NOR": 4.5, "FIN": 4.5, "SGP": 4.4, "NLD": 4.4, "VNM": 4.4, "GBR": 4.3,
          "IRL": 4.3, "NZL": 4.3, "IND": 3.7, "BRA": 3.7, "JPN": 3.4, "CHN": 3.5, "FRA": 3.8, "DEU": 3.9}
RATING_DEFAULT = 4.1
REVIEWS_TARGET = 4_000
# The planted "why": every n-th negative-leading review in the market opens with its pain theme
# (a quota, not a probability, so the signal doesn't depend on luck in small samples)
PLANTED_PAIN = {"JPN": ("Language & localization", 7), "DEU": ("Integrations", 3), "CHN": ("Performance", 2)}
REVIEW_RATE_TILT = {"JPN": 1.5, "CHN": 2.5}  # struggling markets get more CSM check-ins, so more feedback

THEMES = ["Ease of use", "Reporting", "Integrations", "Support", "Onboarding", "Pricing", "Performance",
          "Language & localization", "Mobile"]
POS_W = dict(zip(THEMES, [0.24, 0.18, 0.12, 0.16, 0.10, 0.06, 0.06, 0.02, 0.06]))
NEG_W = dict(zip(THEMES, [0.08, 0.14, 0.14, 0.08, 0.10, 0.18, 0.12, 0.04, 0.12]))
THEME_TILT = {  # market: {(theme, sentiment): multiplier}
    **{c: {("Support", "positive"): 4.5} for c in NORDICS | {"SGP", "VNM"}},
    "NLD": {("Ease of use", "positive"): 2.5},
    "GBR": {("Integrations", "positive"): 2.5, ("Support", "positive"): 2.0},
    "DEU": {("Language & localization", "negative"): 1.3},
    "JPN": {("Onboarding", "negative"): 1.5},
    "CHN": {("Language & localization", "negative"): 2.0},
    "BRA": {("Pricing", "negative"): 3.0, ("Language & localization", "negative"): 3.0},
    "FRA": {("Language & localization", "negative"): 5.0},
    "IND": {("Pricing", "negative"): 5.0},
}


# ---------------------------------------------------------------------------------------------
# Review text
# ---------------------------------------------------------------------------------------------
LANG = {"JPN": "Japanese", "DEU": "German", "AUT": "German", "CHE": "German", "FRA": "French", "BEL": "French",
        "BRA": "Portuguese", "PRT": "Portuguese", "CHN": "Chinese", "TWN": "Chinese", "HKG": "Chinese",
        "KOR": "Korean", "ESP": "Spanish", "ARG": "Spanish", "CHL": "Spanish", "COL": "Spanish",
        "ITA": "Italian", "NLD": "Dutch", "SWE": "Swedish", "NOR": "Norwegian", "DNK": "Danish",
        "FIN": "Finnish", "TUR": "Turkish", "THA": "Thai", "VNM": "Vietnamese", "IDN": "Indonesian",
        "CZE": "Czech", "SAU": "Arabic", "ARE": "Arabic", "EGY": "Arabic", "ISR": "Hebrew", "MYS": "Malay"}
ERP = {"DEU": "SAP", "AUT": "SAP", "CHE": "SAP", "JPN": "accounting", "FRA": "Sage",
       "GBR": "Xero", "AUS": "Xero", "NZL": "Xero", "IRL": "Xero", "USA": "NetSuite", "CAN": "QuickBooks"}
FEATURES = ["the scheduling board", "approval flows", "the inventory module", "shift planning",
            "purchase orders", "the dashboards", "work orders", "the asset register", "time tracking",
            "the task board", "vendor management", "the planning view"]
TEAMS = ["our finance team", "the warehouse leads", "our ops managers", "the field team",
         "our site managers", "the admin team", "our planners", "the front-line supervisors"]
TOOLS = ["Slack", "Microsoft Teams", "Google Workspace", "HubSpot", "Salesforce", "Shopify", "Jira"]

TEXT = {
    ("Ease of use", "positive"): [
        "New starters pick it up in a day without training.",
        "{feature} is the first tool {team} actually enjoys using.",
        "Everything is where you expect it to be.",
        "We replaced three spreadsheets with {feature} and nobody looked back.",
        "Clean, fast to learn, and it doesn't fight you.",
        "Even {team} switched over without a single complaint.",
        "The interface is calm and obvious, which is rare for ops software.",
        "Setting up {feature} took an afternoon, not a project.",
    ],
    ("Ease of use", "negative"): [
        "{feature} takes too many clicks for something we do every day.",
        "Some settings are buried three menus deep.",
        "{team} still asks how to do basic things after months.",
        "Bulk edits are clumsy; we end up exporting to a spreadsheet.",
        "The navigation changed again and people got lost.",
    ],
    ("Reporting", "positive"): [
        "The weekly ops report builds itself now.",
        "Dashboards finally give {team} one number to agree on.",
        "Custom reports are flexible without needing an analyst.",
        "Exporting to our board pack takes minutes instead of a day.",
        "Being able to slice by site and team is exactly what we needed.",
        "Scheduled reports land in inboxes every Monday, no chasing.",
    ],
    ("Reporting", "negative"): [
        "Reports are rigid once you go beyond the templates.",
        "We still export to Excel for anything cross-site.",
        "Report filters reset every time you open them.",
        "Large reports time out at month end, which is when we need them.",
        "We can't build the margin view {team} keeps asking for.",
    ],
    ("Integrations", "positive"): [
        "The {erp} sync just works and saves hours every week.",
        "Hooking it up to {tool} took ten minutes.",
        "The API is well documented; our developer was done in a day.",
        "Data flows both ways with our {erp} system, so nobody re-keys orders anymore.",
        "The {tool} notifications keep {team} in the loop without another app.",
    ],
    ("Integrations", "negative"): [
        "The {erp} connector breaks every few weeks and we only notice when numbers are off.",
        "There is no native {erp} integration, so we built a fragile workaround.",
        "The {erp} sync is one-way only, which defeats the point.",
        "The {tool} integration is shallow; it posts updates but you can't act on them.",
        "Every integration needs a consultant, which adds up fast.",
    ],
    ("Support", "positive"): [
        "Support answers in minutes, and they actually fix the problem.",
        "Our CSM knows our setup better than some of our own staff.",
        "Whenever something breaks, a real person picks it up the same day.",
        "The support team walked {team} through a tricky migration on a Sunday.",
        "Honestly the best support of any vendor we use.",
        "Local support in our time zone makes a huge difference.",
    ],
    ("Support", "negative"): [
        "Tickets sit for days before anyone replies.",
        "We get a different support person every time and repeat ourselves.",
        "Support hours don't overlap with our working day.",
        "Our CSM changed three times this year.",
        "Answers are copy-pasted help articles that don't address the question.",
    ],
    ("Onboarding", "positive"): [
        "We were live in {weeks}, faster than the plan.",
        "The onboarding team mapped our processes before touching the software.",
        "Templates for our industry gave us a head start.",
        "Training sessions were practical and short.",
        "Migration from our old system was smoother than expected.",
    ],
    ("Onboarding", "negative"): [
        "Onboarding took {weeks} longer than promised.",
        "The setup guide assumes you already know the product.",
        "We needed far more hand-holding during setup than expected.",
        "Training material is generic and doesn't match our industry.",
        "Importing our existing data was painful and mostly manual.",
    ],
    ("Pricing", "positive"): [
        "Fair price for what it replaces.",
        "It paid for itself within the first quarter.",
        "Clear pricing with no surprise add-ons.",
        "The per-site pricing suits how we grow.",
    ],
    ("Pricing", "negative"): [
        "The price jumped at renewal with little warning.",
        "Too expensive for a company our size once you add the modules we need.",
        "Pricing is only in US dollars, so our cost moves with the exchange rate.",
        "Key features are locked behind the higher plan.",
        "Per-seat pricing punishes us for rolling it out to {team}.",
    ],
    ("Performance", "positive"): [
        "Fast even with years of data in it.",
        "Pages load instantly, even on site Wi-Fi.",
        "No downtime that we've noticed in two years.",
        "It handles our month-end volume without slowing down.",
    ],
    ("Performance", "negative"): [
        "Pages take several seconds to load during the day.",
        "{feature} gets sluggish once a list passes a few thousand rows.",
        "We had two outages during our busiest week.",
        "Search is slow enough that people stopped using it.",
        "It feels noticeably slower from our office than from the US.",
    ],
    ("Language & localization", "positive"): [
        "The {lang} interface reads naturally; no awkward translations.",
        "Local tax and date formats work out of the box.",
        "Multi-currency invoicing just works across our entities.",
        "Having everything in {lang} made the rollout to {team} easy.",
    ],
    ("Language & localization", "negative"): [
        "Half of the screens are still only in English, so {team} can't use it alone.",
        "The {lang} translation is incomplete and sometimes wrong.",
        "Reports and emails come out in English even with {lang} selected.",
        "Local date, address and tax formats aren't supported properly.",
        "We had to write our own {lang} guides for the staff.",
        "Time zones get mixed up when we schedule across countries.",
        "Multi-currency support is too basic for our overseas entities.",
    ],
    ("Mobile", "positive"): [
        "The mobile app is great for {team} out on site.",
        "Approving requests from my phone saves me hours.",
        "Offline mode on mobile is a lifesaver in the warehouse.",
        "Photos and checklists from mobile sync instantly.",
    ],
    ("Mobile", "negative"): [
        "The mobile app is a cut-down version of the web app.",
        "The mobile app logs us out constantly.",
        "No offline mode, which matters on our sites.",
        "Mobile is fine for viewing but useless for actually doing the work.",
    ],
}
# Market-specific lines that carry the planted "why" (used ~60% of the time for that theme)
TEXT_MARKET = {
    ("JPN", "Language & localization", "negative"): [
        "Half of the menus are still in English, so our staff need a translator to use it.",
        "The Japanese translation feels machine-made and confuses our managers.",
        "Japanese invoices, seals and date formats aren't supported, so we keep paper alongside it.",
        "Our team can't read the English help center, and there is no Japanese version.",
    ],
    ("JPN", "Onboarding", "negative"): [
        "There was no Japanese-speaking onboarding consultant, so setup dragged on for months.",
        "Training was only offered in English, in US hours.",
    ],
    ("DEU", "Integrations", "negative"): [
        "Without a proper SAP integration we re-enter every order by hand.",
        "The SAP connector only syncs nightly and breaks after every SAP update.",
        "Our plants run on SAP, and the integration simply isn't good enough for manufacturing.",
        "We need SAP S/4HANA support before we can roll this out to the other sites.",
    ],
    ("CHN", "Performance", "negative"): [
        "From our Shanghai office pages take ten seconds or more to load.",
        "The app is unusably slow for our mainland team during the day.",
        "File uploads fail half the time from our China offices.",
    ],
    ("BRA", "Pricing", "negative"): [
        "Paying in US dollars makes the cost swing every month against the real.",
        "Too expensive for Brazilian mid-size companies compared with local tools.",
    ],
    ("IND", "Pricing", "negative"): [
        "The price is high for the Indian market compared with local alternatives.",
        "We would roll it out to all branches if the per-seat price were lower.",
    ],
    ("FRA", "Language & localization", "negative"): [
        "The French translation is patchy and our site managers have stopped using it.",
        "Invoices don't follow French formatting rules, so finance redoes them.",
    ],
}
TITLES = {
    ("Ease of use", "positive"): ["Easy to pick up", "Our team actually uses it", "Simple and clean",
                                  "No training needed"],
    ("Ease of use", "negative"): ["Too many clicks", "Clunky for daily work", "Hard to find things"],
    ("Reporting", "positive"): ["Reports that build themselves", "One number everyone trusts",
                                "Great dashboards"],
    ("Reporting", "negative"): ["Reporting is limited", "Still exporting to Excel", "Reports need work"],
    ("Integrations", "positive"): ["Integrations just work", "Plays well with our stack", "Great API"],
    ("Integrations", "negative"): ["Integrations are the weak spot", "Connector keeps breaking",
                                   "Doesn't fit our ERP"],
    ("Support", "positive"): ["Outstanding support", "Support team is the best part", "Real people, fast answers"],
    ("Support", "negative"): ["Support is slow", "Hard to get help", "Support needs to improve"],
    ("Onboarding", "positive"): ["Smooth rollout", "Live in weeks", "Great onboarding"],
    ("Onboarding", "negative"): ["Rough onboarding", "Setup took forever", "Onboarding needs work"],
    ("Pricing", "positive"): ["Worth the money", "Fair pricing", "Paid for itself"],
    ("Pricing", "negative"): ["Too expensive", "Price went up again", "Hard to justify the cost"],
    ("Performance", "positive"): ["Fast and reliable", "Never lets us down", "Snappy"],
    ("Performance", "negative"): ["Too slow", "Performance issues", "Slow at peak times"],
    ("Language & localization", "positive"): ["Feels local", "Great localization", "Works in our language"],
    ("Language & localization", "negative"): ["Not really localized", "Needs proper translation",
                                              "English-only in places"],
    ("Mobile", "positive"): ["Great on mobile", "Mobile app is excellent", "Works on site"],
    ("Mobile", "negative"): ["Mobile app is weak", "Mobile needs work", "Can't use it on site"],
}
OPENERS = {5: ["We've used {company} for {years}.", "", "", ""],
           4: ["Good tool overall.", "", "", ""],
           3: ["Mixed feelings.", "It does the job, mostly.", ""],
           2: ["Disappointed so far.", "", ""],
           1: ["Considering alternatives.", "Not what we were sold.", ""]}
CLOSERS = {5: ["Would recommend to any ops team our size.", "", ""], 4: ["", "", "Happy overall."],
           3: ["", ""], 2: ["", "Hoping this gets fixed."], 1: ["", "We may not renew."]}

# Account names: generic word list + industry noun (+ legal form)
PREFIX = ("Harbor Meridian Copperline Bluewater Northgate Silverleaf Redwood Granite Cedar Tidal Ironbridge "
          "Saltmarsh Halcyon Larkspur Brightwater Stonebridge Fernhill Oakridge Willowbrook Highmoor Clearwater "
          "Amberly Lakeshore Pinecrest Riverbend Westbrook Eastwind Southbank Fairhaven Goldcrest Hollowell "
          "Ashford Birchwood Blackthorn Briarwood Coldspring Crestline Deepwell Driftwood Elmstead Evergreen "
          "Falconridge Foxglove Glenmore Greystone Hawthorne Hillcrest Juniper Kingsley Lindenwood Marigold "
          "Millbrook Moorland Oakhaven Orchard Parkside Quarry Ravenwood Rosewood Sandstone Seabright "
          "Silverpine Skyline Springvale Stillwater Sunridge Thornbury Timberline Trailhead Valemont "
          "Whitecliff Wildrose Windmere Yarrow Alder Aspen Basalt Beacon Bramble Calder Canopy Cascade "
          "Corvid Ember Fathom Fjord Flint Garnet Glacier Harrow Helix Indigo Jasper Keystone Lantern Linden "
          "Lumen Maple Marlin Mosaic Nimbus Onyx Opal Osprey Pebble Prairie Quill Raven Ridgeline Sable Sage "
          "Sequoia Shoreline Sierra Slate Sparrow Spruce Talon Thistle Topaz Tundra Umber Vale Verity Vista "
          "Wren Zephyr Arbor Bastion Bellwether Brook Caldera Cove Crescent Dune Ferro Gale Heron Kite "
          "Cobble Mistral Northfield Pemberton Quayside Rainier Saltash Torrent Upland Wexford").split()
NOUNS = {
    "Manufacturing": ["Manufacturing", "Industries", "Fabrication", "Components", "Works", "Machining",
                      "Plastics", "Metals", "Assembly", "Tooling", "Precision", "Foundry"],
    "Professional services": ["Consulting", "Advisory", "Partners", "Associates", "Engineering",
                              "Design Studio", "Architects", "Accounting", "Legal", "Group", "Surveyors"],
    "Retail & e-commerce": ["Retail", "Goods", "Market", "Outfitters", "Home", "Apparel", "Stores",
                            "Trading", "Supply", "Brands", "Foods", "Provisions"],
    "Technology": ["Labs", "Systems", "Software", "Digital", "Technologies", "Networks", "Data", "Cloud",
                   "Robotics", "Devices", "Analytics", "Interactive"],
    "Logistics": ["Logistics", "Freight", "Shipping", "Cargo", "Transport", "Distribution", "Haulage",
                  "Couriers", "Warehousing", "Fulfillment", "Express", "Lines"],
    "Healthcare": ["Clinics", "Health", "Medical", "Care", "Dental", "Diagnostics", "Pharmacy", "Therapy",
                   "Wellness", "Physio", "Vet Group", "Imaging"],
    "Financial services": ["Capital", "Finance", "Insurance", "Lending", "Credit", "Payments", "Wealth",
                           "Assurance", "Securities", "Brokers", "Leasing", "Mutual"],
    "Construction": ["Builders", "Construction", "Contracting", "Developments", "Homes", "Civil",
                     "Structures", "Roofing", "Concrete", "Interiors", "Joinery", "Scaffolding"],
    "Hospitality": ["Hotels", "Hospitality", "Restaurants", "Resorts", "Kitchens", "Catering", "Inns",
                    "Dining", "Events", "Travel", "Coffee", "Leisure"],
    "Education": ["Academy", "Learning", "Schools", "Education", "Institute", "Training", "Tutoring",
                  "College", "Campus", "Language School", "Montessori", "Skills"],
}
LEGAL = {"USA": ["Inc.", "LLC"], "GBR": ["Ltd"], "IRL": ["Ltd"], "AUS": ["Pty Ltd"], "NZL": ["Ltd"],
         "SGP": ["Pte Ltd"], "HKG": ["Ltd"], "IND": ["Pvt Ltd"], "MYS": ["Sdn Bhd"], "CAN": ["Inc."],
         "DEU": ["GmbH"], "AUT": ["GmbH"], "CHE": ["AG", "GmbH"], "FRA": ["SAS"], "BEL": ["SA", "BV"],
         "NLD": ["B.V."], "JPN": ["K.K."], "BRA": ["Ltda."], "PRT": ["Lda"], "ESP": ["S.L."], "ITA": ["S.r.l."],
         "SWE": ["AB"], "NOR": ["AS"], "DNK": ["ApS"], "FIN": ["Oy"], "CHN": ["Co., Ltd."], "VNM": ["JSC"],
         "IDN": ["PT"], "ZAF": ["(Pty) Ltd"], "KOR": ["Co., Ltd."], "TWN": ["Co., Ltd."]}


# ---------------------------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------------------------
rng = np.random.default_rng(SEED)


def months_between(y0, m0, y1, m1):
    return (y1 - y0) * 12 + (m1 - m0)


def month_iter(y, m, y_end, m_end):
    while (y, m) <= (y_end, m_end):
        yield y, m
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def rand_day(y, m, after: datetime | None = None, last_day: int | None = None) -> datetime:
    """Random business-hours timestamp in the month, optionally after a timestamp."""
    days = last_day or calendar.monthrange(y, m)[1]
    lo = after.day + 1 if after and (after.year, after.month) == (y, m) else 1
    lo = min(lo, days)
    d = int(rng.integers(lo, days + 1))
    return datetime(y, m, d, int(rng.integers(8, 19)), int(rng.integers(0, 60)), int(rng.integers(0, 60)))


def pick(weights: dict):
    keys = list(weights)
    p = np.array([weights[k] for k in keys], dtype=float)
    return keys[int(rng.choice(len(keys), p=p / p.sum()))]


def choice(seq):
    return seq[int(rng.integers(len(seq)))]


def score_mu_for_mean(target: float, sd=0.95) -> float:
    """Normal mean whose rounded, clipped (1..5) score has the target mean."""
    def mean_for(mu):
        cdf = lambda x: 0.5 * (1 + math.erf((x - mu) / (sd * math.sqrt(2))))
        edges = [-math.inf, 1.5, 2.5, 3.5, 4.5, math.inf]
        return sum(s * (cdf(edges[s]) - cdf(edges[s - 1])) for s in range(1, 6))
    lo, hi = 0.0, 7.0
    for _ in range(60):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if mean_for(mid) < target else (lo, mid)
    return lo


def largest_remainder(total: int, shares: dict) -> dict:
    s = sum(shares.values())
    raw = {k: total * v / s for k, v in shares.items()}
    out = {k: int(v) for k, v in raw.items()}
    for k in sorted(raw, key=lambda k: raw[k] - out[k], reverse=True)[: total - sum(out.values())]:
        out[k] += 1
    return out


# ---------------------------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------------------------
def build_geo(real, gdp, pcap, fit):
    a, b, n_fit = fit
    countries = {f["properties"]["ADM0_A3"]: f["properties"]
                 for f in json.loads((RAW / "ne_50m_admin_0_countries.geojson").read_text())["features"]}
    states = {f["properties"]["postal"]: f["properties"]
              for f in json.loads((RAW / "ne_50m_admin_1_states_provinces.geojson").read_text())["features"]
              if f["properties"]["adm0_a3"] == "USA"}
    places = [f["properties"] for f in
              json.loads((RAW / "ne_10m_populated_places_simple.geojson").read_text())["features"]]

    geo_countries, market_size = [], []
    us_pc = pcap["USA"]
    for code in COUNTRY_PLAN:
        p = countries[code]
        price_index = min(1.1, max(0.35, math.sqrt(pcap[code] / us_pc)))
        geo_countries.append(dict(
            country_code=code, iso_n3=f"{int(p['ISO_N3_EH']):03d}", name=NAME_FIX.get(code, p["NAME"]), region=p["REGION_UN"],
            sub_region=p["SUBREGION"], lat=round(p["LABEL_Y"], 4), lon=round(p["LABEL_X"], 4),
            gdp_per_capita_usd=round(pcap[code]), price_index=round(price_index, 3)))

    def size_row(code):
        if code in real:
            n, src, yr = real[code]
            return n, src, yr, f"{src} {yr}: enterprises with 50+ employees"
        n = int(math.exp(a + b * math.log(gdp[code])))
        return (n, "Estimate from GDP", 2023,
                f"World Bank GDP 2023 x log-log fit of firms50+ on GDP over {n_fit} countries with "
                f"published counts: firms = e^{a:.2f} x GDP^{b:.3f}")

    for code in COUNTRY_PLAN:
        if code == "USA":
            continue
        n, src, yr, note = size_row(code)
        market_size.append(dict(market_id=code, country_code=code, state_code=None, addressable_companies=n,
                                source=src, source_year=yr, source_note=note))

    # US: GDP estimate split by BEA state GDP
    us_total, _, _, us_note = size_row("USA")
    state_gdp, gdp_year = load_state_gdp({s["name"] for s in states.values()})
    by_postal = {pc: state_gdp[s["name"]] for pc, s in states.items()}
    split = largest_remainder(us_total, by_postal)
    geo_states = []
    for pc, s in sorted(states.items()):
        code = f"US-{pc}"
        geo_states.append(dict(state_code=code, country_code="USA", name=s["name"],
                               lat=round(s["latitude"], 4), lon=round(s["longitude"], 4)))
        market_size.append(dict(market_id=code, country_code="USA", state_code=code,
                                addressable_companies=split[pc], source="Estimate from GDP", source_year=2023,
                                source_note=f"US total {us_total:,} ({us_note}); split by BEA state GDP "
                                            f"{gdp_year} (via Wikipedia)"))
    for m in market_size:
        m["size_definition"] = "50+ employees"
        m["target_penetration"] = BENCHMARK  # "RevOps sets the target": the white-space benchmark

    # Market plan: target active customers on Sep 30 2026 per market (non-US country or US state)
    size = {m["market_id"]: m["addressable_companies"] for m in market_size}
    plan = {}
    for code, (pen, entry) in COUNTRY_PLAN.items():
        if code != "USA":
            plan[code] = dict(country=code, state=None, target=round(size[code] * pen / 100), entry=entry,
                              pen=pen)
    us_target = round(us_total * COUNTRY_PLAN["USA"][0] / 100)
    fixed = {f"US-{k}": v for k, v in STATE_PEN.items()}
    fixed_cust = sum(round(size[c] * p / 100) for c, p in fixed.items())
    rest = [s["state_code"] for s in geo_states if s["state_code"] not in fixed]
    rest_rate = 100 * (us_target - fixed_cust) / sum(size[c] for c in rest)
    if not 0.2 <= rest_rate <= 0.6:
        sys.exit(f"unlisted US states would need {rest_rate:.2f}% penetration; adjust STATE_PEN")
    for s in geo_states:
        c = s["state_code"]
        pen = fixed.get(c, rest_rate)
        early = c[3:] in STATE_EARLY
        entry = "2019Q1" if early else f"{2019 + (hash_int(c) % 5 + 1) // 4}Q{(hash_int(c) % 5 + 1) % 4 + 1}"
        plan[c] = dict(country="USA", state=c, target=round(size[c] * pen / 100), entry=entry, pen=pen)

    # Cities: the biggest Natural Earth places per market, enough to spread customers believably
    geo_cities, cities_by_market = [], {}
    name_to_postal = {s["name"]: pc for pc, s in states.items()}
    for mkt, p in plan.items():
        if p["state"]:
            pool = [x for x in places if x["adm0_a3"] == "USA" and name_to_postal.get(x["adm1name"]) == mkt[3:]]
            k = int(np.clip(3 + 3 * math.log10(1 + p["target"]), 3, 10))
        else:
            pool = [x for x in places if x["adm0_a3"] == mkt]
            k = int(np.clip(3 + 4 * math.log10(1 + p["target"]), 3, 15)) if p["target"] else 2
        pool = sorted(pool, key=lambda x: -x["pop_max"])
        seen, chosen = set(), []
        for x in pool:
            if x["name"] not in seen:
                seen.add(x["name"])
                chosen.append(x)
            if len(chosen) == k:
                break
        if not chosen:
            sys.exit(f"no cities for {mkt}")
        cities_by_market[mkt] = []
        for x in chosen:
            cid = len(geo_cities) + 1
            geo_cities.append(dict(city_id=cid, name=x["name"], country_code=p["country"], state_code=p["state"],
                                   lat=round(x["latitude"], 4), lon=round(x["longitude"], 4),
                                   population=int(x["pop_max"])))
            cities_by_market[mkt].append((cid, x["name"], int(x["pop_max"])))
    return geo_countries, geo_states, geo_cities, market_size, plan, cities_by_market, rest_rate


def hash_int(s: str) -> int:
    return sum((i + 1) * ord(ch) for i, ch in enumerate(s))  # stable across runs, unlike hash()


def curve(code, p):
    """Target active customers at each month end from entry to Sep 2026."""
    y0, q = int(p["entry"][:4]), int(p["entry"][-1])
    m0 = 3 * (q - 1) + 1
    target = p["target"]
    if p["country"] in CURVE_K:
        k = CURVE_K[p["country"]]
    else:
        k = (0.8 if y0 >= 2023 else 1.6) * np.random.default_rng([SEED, hash_int(code), 1]).uniform(*CURVE_JITTER)
    if p["country"] == "FRA":
        anchor = {y: FRA_PEAK * target * ((y - y0 + 1) / (2026 - y0)) ** k for y in range(y0, 2026)}
    else:
        anchor = {y: target * ((y - y0 + 1) / (2027 - y0)) ** k for y in range(y0, 2026)}
    out = {}
    for y, m in month_iter(y0, m0, 2026, 9):
        if y == 2026:
            prev = anchor.get(2025, 0.0)
            v = prev + (target - prev) * m / 9
        elif y == y0:
            span = 12 - m0 + 1
            v = anchor[y0] * (m - m0 + 1) / span
        else:
            v = anchor[y - 1] + (anchor[y] - anchor[y - 1]) * m / 12
        out[(y, m)] = max(1, round(v)) if target else 0
    return out


def simulate(plan, cities_by_market, geo_countries):
    price = {g["country_code"]: g["price_index"] for g in geo_countries}
    seg_names = list(SEGMENTS)
    accounts, subs, used_names = [], [], set()

    def new_account(mkt, p, y, m):
        country = p["country"]
        mix = SEGMENT_MIX["hub" if country in HUBS else "value" if country in VALUE else "default"]
        seg = seg_names[int(rng.choice(3, p=mix))]
        e_lo, e_hi, mrr_lo, mrr_hi, main_plan, _ = SEGMENTS[seg]
        employees = int(math.exp(rng.uniform(math.log(e_lo), math.log(e_hi + 1))))
        tilt = INDUSTRY_TILT.get(country, {})
        industry = pick({k: v * tilt.get(k, 1) for k, v in INDUSTRIES.items()})
        cities = cities_by_market[mkt]
        alpha = 1.3 if seg == "Enterprise" else 0.9
        city = cities[int(rng.choice(len(cities), p=(w := np.array([c[2] ** alpha for c in cities])) / w.sum()))]
        name = None
        for attempt in range(20):
            base = f"{choice(PREFIX)} {choice(NOUNS[industry])}"
            cand = base if attempt < 8 else f"{base} {city[1]}"
            if rng.random() < 0.3 or cand in used_names:
                cand = f"{cand} {choice(LEGAL.get(country, ['Ltd']))}"
            if cand not in used_names:
                name = cand
                break
        used_names.add(name)
        pi = PLANS.index(main_plan)
        r = rng.random()
        plan_name = PLANS[min(2, pi + 1)] if r < 0.12 else PLANS[max(0, pi - 1)] if r < 0.20 else main_plan
        mrr = math.exp(rng.uniform(math.log(mrr_lo), math.log(mrr_hi)))
        mrr *= {1: 1.2, -1: 0.85, 0: 1.0}[np.sign(PLANS.index(plan_name) - pi)]
        mrr = round(mrr * price[country] * PRICE_SCALE, -1)
        created = rand_day(y, m, last_day=30 if (y, m) == (2026, 9) else None)
        acc = dict(account_id=len(accounts) + 1, name=name, industry=industry, employees=employees, segment=seg,
                   hq_city_id=city[0], created_at=created)
        accounts.append(acc)
        subs.append(dict(account_id=acc["account_id"], plan=plan_name, mrr_usd=mrr, started_at=created,
                         ended_at=None, change_reason="new"))
        return dict(id=acc["account_id"], seg=seg, sub=len(subs) - 1, last_change=(y, m), market=mkt)

    global rng
    for mkt, p in plan.items():
        if not p["target"]:
            continue
        rng = np.random.default_rng([SEED, hash_int(mkt)])  # own stream: tuning one market leaves the rest alone
        target = curve(mkt, p)
        active = []
        for (y, m), want in target.items():
            survivors = []
            for a in active:
                if months_between(*a["last_change"], y, m) < 2:
                    survivors.append(a)
                    continue
                churn = SEGMENTS[a["seg"]][5]
                if p["country"] == "FRA" and y == 2026:
                    churn = FRA_CHURN_2026
                u = rng.random() * 12
                cur = subs[a["sub"]]
                when = rand_day(y, m, after=cur["started_at"], last_day=30 if (y, m) == (2026, 9) else None)
                when = when.replace(hour=0, minute=0, second=0)
                if when <= cur["started_at"]:
                    when = cur["started_at"] + timedelta(days=1)
                if u < churn:
                    cur["ended_at"] = when
                    continue
                if u < churn + UPGRADE + DOWNGRADE:
                    up = u < churn + UPGRADE
                    pi = PLANS.index(cur["plan"])
                    new_plan = cur["plan"]
                    if rng.random() < 0.3:
                        new_plan = PLANS[min(2, pi + 1)] if up else PLANS[max(0, pi - 1)]
                    mrr = round(cur["mrr_usd"] * (rng.uniform(1.15, 1.60) if up else rng.uniform(0.65, 0.85)), -1)
                    cur["ended_at"] = when
                    subs.append(dict(account_id=a["id"], plan=new_plan, mrr_usd=mrr, started_at=when,
                                     ended_at=None, change_reason="upgrade" if up else "downgrade"))
                    a["sub"], a["last_change"] = len(subs) - 1, (y, m)
                survivors.append(a)
            active = survivors
            for _ in range(max(0, want - len(active))):
                active.append(new_account(mkt, p, y, m))
    for i, s in enumerate(subs):
        s["subscription_id"] = i + 1
    return accounts, subs


def make_reviews(accounts, subs, city_country):
    """~0.7 reviews per account over its life, at random times while it is active."""
    life = {}
    for s in subs:
        a = s["account_id"]
        lo, hi = life.get(a, (s["started_at"], s["started_at"]))
        end = s["ended_at"] or AS_OF
        life[a] = (min(lo, s["started_at"]), max(hi, end))
    total_years = sum((hi - lo).total_seconds() for lo, hi in life.values()) / (365.25 * 86400)
    rate = REVIEWS_TARGET / total_years
    mu = {}
    channel_p = {"Enterprise": (0.30, 0.30, 0.40), "Upper-mid": (0.48, 0.36, 0.16), "Mid-market": (0.54, 0.36, 0.10)}
    reviews, review_themes, pain_count = [], [], {}
    global rng
    for acc in accounts:
        rng = np.random.default_rng([SEED, 7, acc["account_id"]])
        country = city_country[acc["hq_city_id"]]
        if country not in mu:
            mu[country] = score_mu_for_mean(RATING.get(country, RATING_DEFAULT))
        lo, hi = life[acc["account_id"]]
        years = (hi - lo).total_seconds() / (365.25 * 86400)
        for _ in range(rng.poisson(rate * years * REVIEW_RATE_TILT.get(country, 1))):
            when = lo + timedelta(seconds=float(rng.uniform(60, max(61, (hi - lo).total_seconds() - 60))))
            score = int(np.clip(round(rng.normal(mu[country], 0.95)), 1, 5))
            n = int(rng.choice([1, 2, 3], p=[0.45, 0.40, 0.15]))
            tilt = THEME_TILT.get(country, {})
            pos_w = {t: w * tilt.get((t, "positive"), 1) for t, w in POS_W.items()}
            neg_w = {t: w * tilt.get((t, "negative"), 1) for t, w in NEG_W.items()}
            tagged = []
            for i in range(n):
                if score >= 4:
                    sentiment = "negative" if (i == n - 1 and n > 1 and rng.random() < 0.15) else "positive"
                elif score == 3:
                    sentiment = "negative" if i == 0 or rng.random() < 0.5 else "positive"
                else:
                    sentiment = "negative"
                w = {t: v for t, v in (pos_w if sentiment == "positive" else neg_w).items()
                     if t not in [x[0] for x in tagged]}
                if country not in LANG and sentiment == "positive":
                    w["Language & localization"] = w.get("Language & localization", 0) * 0.5
                pain = PLANTED_PAIN.get(country)
                if i == 0 and sentiment == "negative" and pain:
                    pain_count[country] = pain_count.get(country, 0) + 1
                if i == 0 and sentiment == "negative" and pain and pain_count[country] % pain[1] == 0:
                    tagged.append((pain[0], sentiment))
                else:
                    tagged.append((pick(w), sentiment))
            rid = len(reviews) + 1
            title_theme = tagged[0]
            body = [choice(OPENERS[score])]
            for t, s in tagged:
                pool = TEXT_MARKET.get((country, t, s))
                generic = [x for x in TEXT[(t, s)] if country in LANG or ("{lang}" not in x and "English" not in x)]
                body.append(choice(pool) if pool and rng.random() < 0.6 else choice(generic))
            body.append(choice(CLOSERS[score]))
            fill = dict(company=COMPANY, feature=choice(FEATURES), team=choice(TEAMS), tool=choice(TOOLS),
                        erp=ERP.get(country, "ERP"), lang=LANG.get(country, "local"),
                        weeks=choice(["two weeks", "three weeks", "a month", "six weeks"]),
                        years=choice(["two years", "three years", "over a year", "a few years now"]))
            text = " ".join(x[0].upper() + x[1:] for x in (b.format(**fill) for b in body) if x)
            r = rng.random()
            cp = channel_p[acc["segment"]]
            reviews.append(dict(review_id=rid, account_id=acc["account_id"], created_at=when.replace(microsecond=0),
                                score=score, title=choice(TITLES[title_theme]), body=text,
                                channel="in-app" if r < cp[0] else "survey" if r < cp[0] + cp[1] else "CSM call"))
            for t, s in tagged:
                review_themes.append(dict(review_id=rid, theme=t, sentiment=s))
    return reviews, review_themes


# ---------------------------------------------------------------------------------------------
# Write + check
# ---------------------------------------------------------------------------------------------
DDL = """
CREATE TABLE geo_countries (country_code VARCHAR PRIMARY KEY, iso_n3 VARCHAR, name VARCHAR, region VARCHAR,
  sub_region VARCHAR, lat DOUBLE, lon DOUBLE, gdp_per_capita_usd INTEGER, price_index DOUBLE);
CREATE TABLE geo_states (state_code VARCHAR PRIMARY KEY, country_code VARCHAR, name VARCHAR, lat DOUBLE, lon DOUBLE);
CREATE TABLE geo_cities (city_id INTEGER PRIMARY KEY, name VARCHAR, country_code VARCHAR, state_code VARCHAR,
  lat DOUBLE, lon DOUBLE, population INTEGER);
CREATE TABLE market_size (market_id VARCHAR PRIMARY KEY, country_code VARCHAR, state_code VARCHAR,
  addressable_companies INTEGER, size_definition VARCHAR, source VARCHAR, source_year INTEGER,
  source_note VARCHAR, target_penetration DOUBLE);
CREATE TABLE accounts (account_id INTEGER PRIMARY KEY, name VARCHAR, industry VARCHAR, employees INTEGER,
  segment VARCHAR, hq_city_id INTEGER, created_at TIMESTAMP);
CREATE TABLE subscriptions (subscription_id INTEGER PRIMARY KEY, account_id INTEGER, plan VARCHAR,
  mrr_usd DOUBLE, started_at TIMESTAMP, ended_at TIMESTAMP, change_reason VARCHAR);
CREATE TABLE reviews (review_id INTEGER PRIMARY KEY, account_id INTEGER, created_at TIMESTAMP, score INTEGER,
  title VARCHAR, body VARCHAR, channel VARCHAR);
CREATE TABLE review_themes (review_id INTEGER, theme VARCHAR, sentiment VARCHAR);
"""


def write_db(tables: dict):
    tmp = DB.with_suffix(".duckdb.tmp")
    tmp.unlink(missing_ok=True)
    con = duckdb.connect(str(tmp))
    con.execute(DDL)
    for name, rows in tables.items():
        df = pd.DataFrame(rows)
        cols = [r[0] for r in con.execute(f"DESCRIBE {name}").fetchall()]
        con.register("df", df[cols])
        con.execute(f"INSERT INTO {name} SELECT * FROM df")
        con.unregister("df")
    con.close()
    tmp.replace(DB)


SUMMARY_SQL = """
WITH acc AS (
  SELECT a.account_id, c.country_code, c.state_code FROM accounts a JOIN geo_cities c ON c.city_id = a.hq_city_id),
snap AS (
  SELECT acc.country_code, acc.state_code, t.label, count(DISTINCT s.account_id) AS customers,
         sum(s.mrr_usd) * 12 AS arr
  FROM subscriptions s JOIN acc USING (account_id)
  CROSS JOIN (VALUES ('c2020', TIMESTAMP '2020-12-31 23:59:59'), ('c2023', TIMESTAMP '2023-12-31 23:59:59'),
                     ('c2025s', TIMESTAMP '2025-09-30 23:59:59'), ('c2026', TIMESTAMP '2026-09-30 23:59:59')) t(label, ts)
  WHERE s.started_at <= t.ts AND (s.ended_at IS NULL OR s.ended_at > t.ts)
  GROUP BY ALL)
SELECT * FROM snap
"""


def summarize(con, plan):
    snap = con.execute(SUMMARY_SQL).df()
    ms = con.execute("SELECT * FROM market_size").df()
    gc = con.execute("SELECT * FROM geo_countries").df().set_index("country_code")
    rv = con.execute("""
        SELECT c.country_code, r.review_id, r.score, year(r.created_at) AS yr FROM reviews r
        JOIN accounts a USING (account_id) JOIN geo_cities c ON c.city_id = a.hq_city_id""").df()
    rt = con.execute("""
        SELECT c.country_code, t.theme, t.sentiment, t.review_id FROM review_themes t JOIN reviews r USING (review_id)
        JOIN accounts a USING (account_id) JOIN geo_cities c ON c.city_id = a.hq_city_id""").df()

    def pivot(level):
        key = "country_code" if level == "country" else "state_code"
        d = snap[snap[key].notna()] if level == "state" else snap
        cust = d.pivot_table(index=key, columns="label", values="customers", aggfunc="sum").fillna(0)
        arr = d.pivot_table(index=key, columns="label", values="arr", aggfunc="sum").fillna(0)
        return cust, arr

    cust, arr = pivot("country")
    size_c = ms.groupby("country_code")["addressable_companies"].sum()
    src_c = ms.groupby("country_code")["source"].first()
    t = pd.DataFrame(index=gc.index)
    t["name"] = gc["name"]
    t["entered"] = [COUNTRY_PLAN[c][1] or "-" for c in t.index]
    for col in ["c2020", "c2023", "c2025s", "c2026"]:
        t[col] = cust[col].reindex(t.index).fillna(0).astype(int)
    t["arr"] = arr["c2026"].reindex(t.index).fillna(0)
    t["arr25"] = arr["c2025s"].reindex(t.index).fillna(0)
    t["addr"] = size_c.reindex(t.index)
    t["pen"] = t["c2026"] / t["addr"]
    t["arpc"] = (t["arr"] / t["c2026"]).where(t["c2026"] > 0)
    us_arpc = t.loc["USA", "arpc"]
    t["arpc_est"] = t["arpc"].fillna(us_arpc * gc["price_index"] / gc.loc["USA", "price_index"])
    mature = t.loc[t["c2026"] >= 100, "pen"].sort_values().to_numpy()
    bench = mature[int(len(mature) * 0.75)]
    t["ws"] = np.maximum(0, bench * t["addr"] - t["c2026"]) * t["arpc_est"]
    t["yoy"] = (t["c2026"] / t["c2025s"] - 1).where(t["c2025s"] > 0)
    t["arr_yoy"] = (t["arr"] / t["arr25"] - 1).where(t["arr25"] > 0)
    t["reviews"] = rv.groupby("country_code").size().reindex(t.index).fillna(0).astype(int)
    t["rating"] = rv.groupby("country_code")["score"].mean().reindex(t.index)
    t["source"] = src_c.reindex(t.index)

    # theme share vs global (share of reviews mentioning the theme)
    n_rev = rv.groupby("country_code").size()
    g_share = rt.groupby("theme")["review_id"].nunique() / len(rv)
    loc = rt.groupby(["country_code", "theme"])["review_id"].nunique().unstack(fill_value=0)
    ratio = loc.div(n_rev, axis=0).div(g_share, axis=1)
    neg = rt[rt.sentiment == "negative"].groupby(["country_code", "theme"]).size().unstack(fill_value=0)
    pos = rt[rt.sentiment == "positive"].groupby(["country_code", "theme"]).size().unstack(fill_value=0)

    def top_themes(c):
        if c not in ratio.index or n_rev.get(c, 0) < 10:
            return ""
        r = ratio.loc[c][loc.loc[c] >= 3].sort_values(ascending=False)[:2]
        sign = lambda th: "+" if pos.get(th, pd.Series()).get(c, 0) >= neg.get(th, pd.Series()).get(c, 0) else "-"
        return ", ".join(f"{sign(th)}{th.split(' &')[0]} {v:.1f}x" for th, v in r.items())

    t["themes"] = [top_themes(c) for c in t.index]
    t = t.sort_values(["c2026", "addr"], ascending=False)

    tot_c, tot_arr = int(t["c2026"].sum()), t["arr"].sum()
    print(f"\n{COMPANY} on Sep 30 2026: {tot_c:,} active customers in {int((t['c2026'] > 0).sum())} countries, "
          f"ARR ${tot_arr / 1e6:,.0f}M, ARR/customer ${tot_arr / tot_c / 1e3:,.1f}K, "
          f"benchmark (top-quartile pen. of {len(mature)} mature markets) {bench:.2%}")
    hdr = (f"{'':4}{'country':22}{'entered':>8}{'2020':>6}{'2023':>6}{'2026':>6}{'YoY':>6}{'ARR$M':>7}"
           f"{'$K/cust':>8}{'addressable':>12}{'pen%':>7}{'WS$M':>6}{'revs':>6}{'rating':>7}  {'top themes vs global':42}source")
    print(hdr)
    print("-" * len(hdr))
    for c, r in t.iterrows():
        yoy = f"{r['yoy']:+.0%}" if pd.notna(r["yoy"]) else ""
        arpc = f"{r['arpc'] / 1e3:.0f}" if pd.notna(r["arpc"]) else ""
        rating = f"{r['rating']:.2f}" if pd.notna(r["rating"]) else ""
        print(f"{c:4}{r['name'][:21]:22}{r['entered']:>8}{r['c2020']:>6}{r['c2023']:>6}{r['c2026']:>6}{yoy:>6}"
              f"{r['arr'] / 1e6:>7.1f}{arpc:>8}{int(r['addr']):>12,}{100 * r['pen']:>7.3f}{r['ws'] / 1e6:>6.0f}"
              f"{r['reviews']:>6}{rating:>7}  {r['themes']:42}{r['source']}")

    # US states
    sc, sa = pivot("state")
    st = ms[ms.state_code.notna()].set_index("state_code")[["addressable_companies"]].copy()
    st["c2026"] = sc["c2026"].reindex(st.index).fillna(0).astype(int)
    st["pen"] = st["c2026"] / st["addressable_companies"]
    st["ws"] = np.maximum(0, bench * st["addressable_companies"] - st["c2026"]) * us_arpc
    st = st.sort_values("ws", ascending=False)
    print("\nUS states by white space: " + ", ".join(
        f"{s[3:]} {r['pen']:.2%} ${r['ws'] / 1e6:.0f}M" for s, r in st.head(8).iterrows()))
    print("US states most saturated: " + ", ".join(
        f"{s[3:]} {r['pen']:.2%}" for s, r in st.sort_values("pen", ascending=False).head(6).iterrows()))
    return t, st, bench, ratio, pos, neg, n_rev, rv, g_share


def checks(con, t, st, ratio, pos, neg, n_rev, rv, g_share):
    results = []

    def check(name, ok, detail=""):
        results.append(ok)
        print(f"  {'OK ' if ok else 'FAIL'} {name}{': ' + detail if detail else ''}")

    print("\nIntegrity")
    gaps = con.execute("""
        SELECT count(*) FROM (SELECT account_id, started_at,
          lag(ended_at) OVER (PARTITION BY account_id ORDER BY started_at) AS prev_end,
          lag(subscription_id) OVER (PARTITION BY account_id ORDER BY started_at) AS prev_id
          FROM subscriptions) WHERE prev_id IS NOT NULL AND (prev_end IS NULL OR prev_end <> started_at)""").fetchone()[0]
    check("subscriptions chain with no gaps or overlaps", gaps == 0, f"{gaps} breaks")
    before = con.execute("""SELECT count(*) FROM subscriptions s JOIN accounts a USING (account_id)
                            WHERE s.started_at < a.created_at""").fetchone()[0]
    check("no subscription starts before its account's created_at", before == 0, f"{before} rows")
    first = con.execute("""SELECT count(*) FROM accounts a JOIN (SELECT account_id, min(started_at) AS f
                           FROM subscriptions GROUP BY 1) s USING (account_id) WHERE s.f <> a.created_at""").fetchone()[0]
    check("first subscription starts at created_at", first == 0, f"{first} rows")
    late = con.execute(f"""SELECT count(*) FROM subscriptions WHERE started_at > TIMESTAMP '{AS_OF}'
                           OR ended_at > TIMESTAMP '{AS_OF}'""").fetchone()[0]
    check("nothing after Sep 30 2026", late == 0, f"{late} rows")
    inactive = con.execute("""
        SELECT count(*) FROM reviews r WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.account_id = r.account_id
          AND s.started_at <= r.created_at AND (s.ended_at IS NULL OR s.ended_at > r.created_at))""").fetchone()[0]
    check("every review comes from an account active at that time", inactive == 0, f"{inactive} reviews")
    dup = con.execute("SELECT count(*) - count(DISTINCT name) FROM accounts").fetchone()[0]
    check("account names are unique", dup == 0, f"{dup} duplicates")

    print("\nPlanted insights")
    big = t[t["c2026"] >= 100]
    top_pen = list(big.sort_values("pen", ascending=False).index[:7])
    check("1 big != strong: US #1 by customers, not top 5 by penetration, SGP/Nordics/NLD/GBR lead",
          t.index[0] == "USA" and "USA" not in top_pen[:5] and top_pen[0] == "SGP"
          and {"NLD", "GBR"} <= set(top_pen) and len(NORDICS & set(top_pen)) >= 2,
          f"top penetration (100+ customers): {', '.join(top_pen)}; USA rank "
          f"{list(big.sort_values('pen', ascending=False).index).index('USA') + 1}")
    top_ws = list(t.sort_values("ws", ascending=False).index[:4])
    state_ws = list(st.index[:2])
    ca_pen_rank = list(st.sort_values("pen", ascending=False).index).index("US-CA") + 1
    ca_vs_tx = st.loc["US-CA", "ws"] / st.loc["US-TX", "ws"]
    check("2 biggest white space at home: US #1; TX and FL top states; CA saturated",
          top_ws[0] == "USA" and set(state_ws) == {"US-TX", "US-FL"} and ca_pen_rank <= 3 and ca_vs_tx < 0.25,
          f"countries {top_ws}; states {[s[3:] for s in state_ws]}; CA penetration rank {ca_pen_rank}, "
          f"white space {ca_vs_tx:.0%} of TX")

    def top_neg(c):  # complaint most over-represented vs global, as the app ranks it (3+ mentions)
        neg_ratio = (neg.loc[c] / n_rev[c]) / (neg.sum() / n_rev.sum())
        th = neg_ratio[neg.loc[c] >= 3].idxmax()
        return th, neg_ratio[th]
    planted = {"DEU": "Integrations", "JPN": "Language & localization", "CHN": "Performance"}
    detail = "; ".join(f"{c}: {top_neg(c)[0]} {top_neg(c)[1]:.1f}x" for c in planted)
    check("3 same gap, different fix (top complaint vs global)", all(top_neg(c)[0] == th for c, th in planted.items()),
          detail)
    jpn_lang = ratio.loc["JPN", "Language & localization"]
    glob = rv["score"].mean()
    check("3 Japan language ~3x global, rating ~3.4 vs ~4.1",
          2.5 <= jpn_lang <= 4.0 and abs(t.loc["JPN", "rating"] - 3.4) < 0.2 and abs(glob - 4.1) < 0.1,
          f"language {jpn_lang:.1f}x, JPN {t.loc['JPN', 'rating']:.2f}, global {glob:.2f}")
    g_pos = pos["Support"].sum() / n_rev.sum()
    sup = {c: pos.loc[c, "Support"] / n_rev[c] / g_pos for c in ["SWE", "DNK", "NOR", "FIN", "SGP", "VNM"]}
    check("4 Support praise in Nordics/SGP/VNM >= 1.5x global", min(sup.values()) >= 1.5,
          ", ".join(f"{c} {v:.1f}x" for c, v in sup.items()))
    arpc = t[t["c2026"] >= 20]["arpc"].sort_values(ascending=False)
    check("5 ARR/customer: CHE, ARE, SGP, ISR top 4; IND, VNM bottom 2 (20+ customers)",
          set(arpc.index[:4]) == HUBS and set(arpc.index[-2:]) == VALUE,
          f"top {list(arpc.index[:4])}, bottom {list(arpc.index[-2:])}")
    yoy = t[t["c2025s"] >= 10]["yoy"].sort_values(ascending=False)
    check("6 YoY 2026: France negative, Vietnam highest (10+ customers a year ago)",
          t.loc["FRA", "yoy"] < 0 and yoy.index[0] == "VNM",
          f"FRA {t.loc['FRA', 'yoy']:+.0%}, top {', '.join(f'{c} {v:+.0%}' for c, v in yoy.head(3).items())}")
    # docs/coverage-globe/data.md says ~$6M, but that figure came from a 0.85% benchmark; at 2.1% it is ~$14M
    check("7 Mexico and Poland untouched with ~$14M white space each",
          t.loc["MEX", "c2026"] == 0 and t.loc["POL", "c2026"] == 0
          and all(8e6 < t.loc[c, "ws"] < 20e6 for c in ["MEX", "POL"]),
          f"MEX ${t.loc['MEX', 'ws'] / 1e6:.1f}M, POL ${t.loc['POL', 'ws'] / 1e6:.1f}M")
    per_year = rv[rv.country_code.isin(["KEN", "EGY", "NGA"])].groupby(["country_code", "yr"]).size()
    check("8 Kenya, Egypt, Nigeria under 10 reviews a year", per_year.max() < 10 if len(per_year) else True,
          f"max {per_year.max() if len(per_year) else 0} in a year")
    return all(results)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true", help="re-download the public sources")
    ap.add_argument("--seed", type=int, default=SEED, help="random seed (robustness checks only)")
    args = ap.parse_args()
    globals()["SEED"] = args.seed

    print("Public sources")
    fetch(args.refresh)
    real, gdp, pcap, fit = load_market_sizes()
    print(f"  {len(real)} countries with published counts; fit firms50+ = e^{fit[0]:.2f} x GDP^{fit[1]:.3f} (n={fit[2]})")

    geo_countries, geo_states, geo_cities, market_size, plan, cities_by_market, rest_rate = build_geo(real, gdp, pcap, fit)
    print(f"  {len(geo_countries)} countries, {len(geo_states)} US states, {len(geo_cities)} cities, "
          f"{len(market_size)} market-size rows; unlisted US states at {rest_rate:.2f}%")

    accounts, subs = simulate(plan, cities_by_market, geo_countries)
    city_country = {c["city_id"]: c["country_code"] for c in geo_cities}
    reviews, review_themes = make_reviews(accounts, subs, city_country)
    write_db(dict(geo_countries=geo_countries, geo_states=geo_states, geo_cities=geo_cities,
                  market_size=market_size, accounts=accounts, subscriptions=subs, reviews=reviews,
                  review_themes=review_themes))
    print(f"\nWrote {DB.relative_to(ROOT)}: {len(accounts):,} accounts, {len(subs):,} subscriptions, "
          f"{len(reviews):,} reviews, {len(review_themes):,} review themes")

    con = duckdb.connect(str(DB), read_only=True)
    t, st, bench, ratio, pos, neg, n_rev, rv, g_share = summarize(con, plan)
    ok = checks(con, t, st, ratio, pos, neg, n_rev, rv, g_share)
    nrr = con.execute(f"""
        WITH a AS (SELECT account_id, sum(mrr_usd) FILTER (WHERE started_at <= TIMESTAMP '2025-09-30 23:59:59'
                     AND (ended_at IS NULL OR ended_at > TIMESTAMP '2025-09-30 23:59:59')) AS m0,
                   sum(mrr_usd) FILTER (WHERE started_at <= TIMESTAMP '{AS_OF}' AND ended_at IS NULL) AS m1
                   FROM subscriptions GROUP BY 1)
        SELECT sum(coalesce(m1, 0)) / sum(m0) FROM a WHERE m0 IS NOT NULL""").fetchone()[0]
    print(f"\nNet revenue retention (Sep 2025 -> Sep 2026): {nrr:.0%}")
    con.close()
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()

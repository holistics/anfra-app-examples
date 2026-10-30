"""The fictional person behind the demo data. Every literal here is invented.

Pham Thu Ha is a product designer in Ho Chi Minh City. She lives alone,
sends her mother money after every payday, keeps a Techcombank debit account
and credit card, a Timo account with money pots, and since early 2026 a MAX VIB
card she uses for online spend to chase its 8% points.

Nothing here comes from a real person. The SHAPE of her money (how spend is
spread over categories, weekdays and hours; how often money moves between
accounts) is calibrated from aggregate ratios; the LEVEL is set by SALARY_BASE.
"""
from __future__ import annotations

SEED = 20261014
MONTHS_OF_HISTORY = 18          # full calendar months before the end month
VIB_OPEN_MONTHS_BEFORE_END = 9  # MAX VIB's first cycle starts on the 16th, 9 months back

PERSONA_NAME = "PHAM THU HA"
EMPLOYER = "CONG TY TNHH LUMEN LABS"

TCB_CARD_LAST4 = "4071"
VIB_CARD_LAST4 = "8823"
TCB_ACCOUNT_REF = "1903xxxx0042"
TIMO_ACCOUNT_REF = "Timo Spend"

# Money level (VND). Everything calibrated is a ratio of SALARY_BASE.
SALARY_BASE = 38_000_000
SALARY_RAISE_PCT = 0.08         # every January
TET_BONUS_MONTHS = 1.0          # paid with January's salary, as a separate row
MIDYEAR_BONUS_MONTHS = 0.5      # July
MOM_AMOUNT = 10_000_000         # the flow rule's fixed "mom" amount
TIMO_TOPUP = 8_000_000          # the flow rule's fixed TCB -> Timo amount
OPENING_TCB = 60_000_000
OPENING_TIMO = 2_400_000

TCB_CLOSE_DAY = 20
TCB_DUE_AFTER_DAYS = 25
TCB_MIN_PAYMENT_RATIO = 0.05
VIB_CLOSE_DAY = 15

# MAX VIB terms (the bank's public "Gói hội viên"): Pro earns 8% up to
# 1,000,000 points a cycle, reached at 12.5tr. The step ladder is history.
VIB_RATE_THRESHOLD = 12_500_000
VIB_RATE_REWARD = 1_000_000
VIB_RATE_VALID_THROUGH = "2026-12-15"
VIB_OLD_STEPS = [(12_000_000, 1_500_000), (15_000_000, 2_000_000)]
REWARD_DESCRIPTION = "Hoàn tiền Max Card (đổi điểm)"

POTS = ["Da Lat trip", "Emergency fund", "Birthday gifts", "Bap the cat", "Bike repair"]   # 18 Oct: English names (were Vietnamese)
POT_OPENING = {"Da Lat trip": 4_000_000, "Emergency fund": 15_000_000, "Birthday gifts": 2_000_000,
               "Bap the cat": 1_500_000, "Bike repair": 3_000_000}

BRANCHES = ["Q1", "Q3", "THAO DIEN", "PHU NHUAN", "BINH THANH", "Q7", "TAN DINH", "GO VAP"]

# Merchant catalog. (clean merchant, description template, weight, amount scale vs the
# tag's median, legacy category). {ref} -> random code, {br} -> branch, {n} -> store no.
CATALOG: dict[str, list[tuple[str, str, float, float, str]]] = {
    "Shopee": [
        ("SHOPEE", "SHOPEE*{ref}", 1.0, 1.0, "Shopping"),
    ],
    "Đi lại": [
        ("GRAB", "GRAB*{ref}", 10, 1.0, "Transport"),
        ("BE", "BE GROUP*{ref}", 3, 0.9, "Transport"),
        ("XANH SM", "GSM XANH SM {ref}", 4, 1.1, "Transport"),
        ("PETROLIMEX", "PETROLIMEX CHXD {n}", 0.6, 2.5, "Transport"),
        ("VIETJET AIR", "VIETJET AIR {ref}", 0.08, 40, "Travel"),
    ],
    "Ăn uống": [
        ("GRABFOOD", "GRAB*FOOD-{ref}", 4, 1.6, "Food & Dining"),
        ("SHOPEEFOOD", "SHOPEEFOOD*{ref}", 3, 1.5, "Food & Dining"),
        ("HIGHLANDS COFFEE", "HIGHLANDS COFFEE {br}", 2, 0.6, "Food & Dining"),
        ("PHUC LONG", "PHUC LONG {br}", 1.5, 0.6, "Food & Dining"),
        ("KATINAT", "KATINAT SAI GON KAFE {br}", 1, 0.6, "Food & Dining"),
        ("PIZZA 4PS", "PIZZA 4P'S {br}", 0.5, 6.0, "Food & Dining"),
        ("BACH HOA XANH", "BACH HOA XANH {n}", 1.5, 3.0, "Groceries"),
        ("WINMART", "WINMART {br}", 1, 3.5, "Groceries"),
        ("CIRCLE K", "CIRCLE K {n}", 1.5, 0.5, "Food & Dining"),
    ],
    "Khác": [
        ("UNIQLO", "UNIQLO {br}", 1, 1.6, "Shopping"),
        ("AEON MALL", "AEON MALL TAN PHU", 0.6, 1.4, "Shopping"),
        ("GUARDIAN", "GUARDIAN {br}", 1, 0.6, "Shopping"),
        ("MINISO", "MINISO {br}", 0.8, 0.5, "Shopping"),
        ("CGV", "CGV CINEMAS {br}", 1, 0.5, "Entertainment"),
        ("TIKI", "TIKI*{ref}", 1, 0.9, "Shopping"),
    ],
    "Well-being": [
        ("PHARMACITY", "PHARMACITY {n}", 2, 0.5, "Health"),
        ("LONG CHAU", "NHA THUOC LONG CHAU {n}", 2, 0.7, "Health"),
        ("CALIFORNIA FITNESS", "CALIFORNIA FITNESS {br}", 0.5, 3.0, "Health"),
    ],
    "Học tập": [
        ("FAHASA", "FAHASA {br}", 2, 1.0, "Education"),
        ("COURSERA", "COURSERA*{ref}", 0.5, 2.0, "Education"),
    ],
    "Mèo": [
        ("PET MART", "PET MART {br}", 1, 1.0, "Shopping"),
        ("SHOPEE", "SHOPEE*{ref}", 1.5, 0.8, "Shopping"),
    ],
}

# Online tags move to MAX VIB once it opens (the cashback chase).
VIB_TAGS = {"Shopee": 0.9, "Đi lại": 0.85, "Ăn uống": 0.6, "Mèo": 0.5, "Khác": 0.3}

LEGACY = {"Shopee": "Shopping", "Mèo": "Shopping", "Ăn uống": "Food & Dining",
          "Đi lại": "Transport", "Học tập": "Education", "Well-being": "Health",
          "Subscription": "Subscriptions", "Hoá đơn": "Bills & Utilities", "Khác": "Other",
          "Tiết kiệm": "Other", "Đầu tư": "Other"}

# Recurring card charges: (merchant, description, day, amount, currency, card, tag, first_month_offset)
# first_month_offset: months after the start it begins (0 = from the start).
SUBSCRIPTIONS = [
    ("NETFLIX", "NETFLIX.COM", 5, 260_000, "VND", "tcb", "Subscription", 0),
    ("SPOTIFY", "SPOTIFY P2F8C1", 9, 59_000, "VND", "tcb", "Subscription", 0),
    ("YOUTUBE", "GOOGLE*YOUTUBEPREMIUM", 12, 79_000, "VND", "tcb", "Subscription", 0),
    ("APPLE ICLOUD", "APPLE.COM/BILL ICLOUD", 3, 59_000, "VND", "tcb", "Subscription", 0),
    ("GOOGLE ONE", "GOOGLE*GOOGLE ONE", 17, 45_000, "VND", "tcb", "Subscription", 0),
    ("OPENAI", "OPENAI *CHATGPT SUBSCR SAN FRANCISCO USA", 21, 20.00, "USD", "tcb", "Subscription", 0),
    ("ANTHROPIC", "CLAUDE.AI SUBSCRIPTION SAN FRANCISCO USA", 8, 20.00, "USD", "tcb", "Subscription", 6),
    ("FPT TELECOM", "FPT TELECOM INTERNET", 6, 255_000, "VND", "tcb", "Hoá đơn", 0),
    ("NOTION", "NOTION LABS, INC.", 14, 10.00, "USD", "vib", "Subscription", 0),
]
APPLE_SMALL = ("APPLE", "APPLE.COM/BILL", "Subscription")  # 1-3 small app charges a month
NETFLIX_PRICE_RISE = (9, 288_000)  # from the 9th month on

# Fallback shapes, used when db/private/calibration.json is absent.
DEFAULT_SHAPE = {
    "rows": {"credit": (80, 0.4), "vib_credit": (50, 0.45), "timo": (10, 0.5), "tcb_debit": (7.5, 0.3)},
    # Card "Hoá đơn" is the fixed FPT bill in SUBSCRIPTIONS, so it is not drawn at random.
    "card_mix": {"Shopee": 0.2, "Đi lại": 0.55, "Ăn uống": 0.06, "Khác": 0.03,
                 "Well-being": 0.02, "Học tập": 0.01, "Mèo": 0.03},
    "card_amount": {"Shopee": (0.01, 1.0), "Đi lại": (0.0009, 0.85), "Ăn uống": (0.0015, 0.75),
                    "Hoá đơn": (0.007, 0.3), "Khác": (0.006, 0.9), "Well-being": (0.012, 0.7),
                    "Học tập": (0.006, 0.6), "Mèo": (0.008, 0.6)},
    "weekday": [0.17, 0.14, 0.16, 0.14, 0.16, 0.14, 0.09],
    "hour": [0.005, 0, 0, 0, 0, 0, 0.005, 0.02, 0.08, 0.11, 0.07, 0.07, 0.06, 0.04, 0.05, 0.04,
             0.03, 0.06, 0.12, 0.08, 0.06, 0.05, 0.03, 0.01],
}

# Persona-only extras that the calibration has too few tagged rows to inform.
TIMO_MIX = {"Ăn uống": 0.52, "Đi lại": 0.15, "Khác": 0.15, "Well-being": 0.06, "Mèo": 0.07, "Shopee": 0.05}
TIMO_MEDIAN_RATIO = 0.0025
TCB_DEBIT_SPEND = {  # tag: (rows per month, median ratio, sigma)
    "Well-being": (1.2, 0.05, 0.5),
    "Ăn uống": (2.0, 0.025, 0.6),
    "Khác": (1.0, 0.03, 0.8),
    "Hoá đơn": (2.0, 0.02, 0.3),   # EVN + water/phone
}
FRIEND_NAMES = ["LE MINH KHOA", "TRAN BAO NGOC", "VO THANH TAM", "DANG GIA HUY"]
NOTES = ["qua sinh nhat An", "dat coc homestay", "do cho Bap", "an toi voi team", "sua laptop"]

# --------------------------------------------------------------------------- investments
# Ha's portfolio (Wealthfolio-shaped, built by invest.py). The tickers are public VN instruments;
# every quantity, cost and price here is invented. start = the first synthetic close (VND per
# share, per fund unit, per chỉ of gold, or index points); drift and vol are annual, for a
# seeded random walk on business days. VNINDEX is the benchmark, never held.
ASSETS = {
    "FPT":      {"name": "FPT Corporation", "asset_class": "EQUITY", "sub_class": "Stock",
                 "sector": "Technology", "country": "Vietnam", "start": 118_000, "drift": 0.12, "vol": 0.28, "tick": 100},
    "VNM":      {"name": "Vinamilk", "asset_class": "EQUITY", "sub_class": "Stock",
                 "sector": "Consumer Staples", "country": "Vietnam", "start": 64_000, "drift": 0.02, "vol": 0.20, "tick": 100},
    "MWG":      {"name": "Mobile World", "asset_class": "EQUITY", "sub_class": "Stock",
                 "sector": "Consumer Discretionary", "country": "Vietnam", "start": 58_000, "drift": 0.10, "vol": 0.32, "tick": 100},
    "HPG":      {"name": "Hoa Phat Group", "asset_class": "EQUITY", "sub_class": "Stock",
                 "sector": "Materials", "country": "Vietnam", "start": 26_500, "drift": 0.04, "vol": 0.30, "tick": 50},
    "FUEVFVND": {"name": "DCVFMVN Diamond ETF", "asset_class": "EQUITY", "sub_class": "ETF",
                 "sector": "Diversified", "country": "Vietnam", "start": 31_500, "drift": 0.09, "vol": 0.21, "tick": 10},
    "FUESSVFL": {"name": "SSIAM VNFIN LEAD ETF", "asset_class": "EQUITY", "sub_class": "ETF",
                 "sector": "Financials", "country": "Vietnam", "start": 22_000, "drift": 0.08, "vol": 0.24, "tick": 10},
    "DCBF":     {"name": "DCBF Bond Fund", "asset_class": "FIXED_INCOME", "sub_class": "Bond fund",
                 "sector": "Fixed Income", "country": "Vietnam", "start": 24_600, "drift": 0.06, "vol": 0.02, "tick": 1},
    "SJC":      {"name": "SJC 9999 gold (per chi, 3.75 g)", "asset_class": "COMMODITY", "sub_class": "Gold",
                 "sector": "Commodities", "country": "Vietnam", "start": 9_450_000, "drift": 0.10, "vol": 0.10, "tick": 10_000},
    "VNINDEX":  {"name": "VN-Index", "asset_class": "INDEX", "sub_class": "Benchmark",
                 "sector": None, "country": "Vietnam", "start": 1_260, "drift": 0.15, "vol": 0.17, "tick": 0.01},
}

# (id, name, account_type, account_group, currency, ledger src). src ties bank and card accounts
# to the existing ledger; the others live only in `activities`.
ACCOUNTS = [
    ("ssi",        "SSI Securities",      "SECURITIES",  "Investments", "VND", None),
    ("gold",       "Gold",                "SECURITIES",  "Investments", "VND", None),
    ("deposits",   "Term deposits",       "CASH",        "Cash",        "VND", None),
    ("usd",        "USD",                 "CASH",        "Cash",        "USD", None),
    ("tcb_debit",  "TCB debit",           "CASH",        "Cash",        "VND", "tcb_debit"),
    ("timo",       "Timo",                "CASH",        "Cash",        "VND", "timo"),
    ("credit",     "TCB Visa",            "CREDIT_CARD", "Liabilities", "VND", "credit"),
    ("vib_credit", "MAX VIB",             "CREDIT_CARD", "Liabilities", "VND", "vib_credit"),
]

# What Ha already owns on the first data day: (account, symbol, quantity, average cost per unit).
OPENING_HOLDINGS = [
    ("ssi", "FPT", 400, 86_500), ("ssi", "VNM", 600, 71_200), ("ssi", "MWG", 700, 47_800),
    ("ssi", "HPG", 1_500, 23_900), ("ssi", "FUEVFVND", 2_500, 26_300), ("ssi", "FUESSVFL", 2_000, 18_700),
    ("ssi", "DCBF", 1_400, 21_900), ("gold", "SJC", 5, 7_250_000),
]
OPENING_SSI_CASH = 4_850_000
OPENING_USD_CENTS = 240_000            # $2,400 cash
OPENING_TD = {"principal": 60_000_000, "rate": 0.052, "opened_days_before": 160}  # 12 months, auto-renewed

BUY_WEIGHTS = {"FUEVFVND": 3.0, "FUESSVFL": 2.0, "FPT": 2.0, "DCBF": 1.5, "MWG": 1.0, "VNM": 0.5}
LOTS = {"DCBF": 1, "SJC": 1}           # everything else trades in lots of 100
BROKER_FEE = 0.0015
DIVIDENDS = [("FPT", 5, 2_000), ("FPT", 12, 1_000), ("VNM", 4, 1_500), ("VNM", 9, 2_500), ("MWG", 8, 1_000)]
DIVIDEND_TAX = 0.05                    # withheld; the activity books the net cash
SELLS = [("HPG", 4)]                   # sell the whole position, N months before the end month

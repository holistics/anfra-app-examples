# Hiring Board

Every hiring question, one page 🧑‍💼

A People team's hiring board: where every candidate is, where good candidates come from, which interview steps are slow, and whether headcount lands on plan.

- Demo: https://anfra-heidi.pages.holistics.dev/apps/DIY/hiring-board
- Video: https://media.holistics.io/anfra/competition-2026/hiring-board.mp4
- Author: Di Hoang

Four tabs share one filter bar (department, position, source, applied date). Pipeline shows the funnel from applied to hired; click a stage to list its candidates and open anyone's CV, rounds and HR notes. Candidate quality shows which sources and traits reach the final round. Interview process shows the waits between rounds, the withdrawals they cause and each interviewer's scores. Headcount compares the plan for 31 December with the forecast. Every number opens to its definition and the query behind it.

## Run it

```sh
anfra validate
anfra serve      # http://127.0.0.1:7878/apps/hiring-board/hiring-board
```

`.anfra/data_sources.yml` opens `data/hiring.duckdb` read-only with a relative path, so there is nothing to set up.

## Data

Synthetic sample data: 12 open roles and about 620 invented applicants from 22 April to 18 October 2026, with their interview rounds, a few HR notes and a headcount plan. Names, emails and companies are invented, and emails use example.com. Avatars are DiceBear drawings, so no real faces are shown.

To rebuild the data (needs `uv`; it writes the same file):

```sh
uv run scripts/hiring-board/seed.py
uv run scripts/hiring-board/check.py     # prints each story beat straight from SQL
```

## What is in this folder

| Path | What it is |
|---|---|
| `apps/hiring-board/hiring-board.html` | The Data App: one HTML file that queries the dataset through the anfra SDK |
| `datasets/hiring_board.dataset.aml` | Positions, candidates, interview rounds, notes and headcount |
| `models/hiring/` | AML models over the hiring tables |
| `data/hiring.duckdb` | The data |
| `scripts/hiring-board/` | How the data was generated, and a check of its story |

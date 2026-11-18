# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/joycelon/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/joycelon/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads one frozen DefiLlama snapshot of the protocol universe, finds the protocols that record no token yet and are not a wrapped, staked or bridged product of one that trades, prices each of them as if it launched today, ranks them by that implied value, and hands the reader a concrete farm plan for every row. The deliverable is a static dashboard — a sortable, filterable board, a detail view per protocol with the full valuation audit trail, a live-tokens view priced by the market itself, and the model written out in full — that renders with no network.

## The model (catmult-2)

Every figure is derived from the snapshot's own records; nothing is fetched and no protocol name is special-cased.

- **Multiple.** For each DefiLlama category, the median market cap / TVL of the snapshot's token-bearing protocols in it, each ratio first clamped to [0.01, 5]. A category with fewer than 4 token-bearing peers falls back to its family median (lending, trading, yield, staking, bridges, asset issuers, allocators), then to the snapshot-wide median. Each row records the level that priced it, the peer count, and the three largest peers, so any price can be audited.
- **Implied value.** `round(TVL × multiple × growth factor × maturity factor)`, where the growth factor is `1 + clamp(change_7d, −50, 100)/100 × 0.35` and the maturity factor runs from 0.8 to 1.0 over five years of being tracked (unknown listing date: 0.9).
- **Population.** The snapshot's watchlist rule applied at every size: all 40 watchlist protocols (≥ $50M TVL) plus every smaller pre-token protocol that passes the same product exclusions — 198 rows on this snapshot.
- **Radar score (0–100).** A triage signal beside the rank, never the rank: size 35 (log TVL), momentum 20, track record 20, chain reach 10, multiple confidence 15.
- **Farm plans.** Six steps per protocol, generated from its category (the core action and its standing risk), its chains (a second chain in the record adds a second-chain step), its TVL tier (the suggested capital) and its age (the holding period). Every step states its cost and its time.

The program is deterministic — no clock, no randomness — so two runs over the same snapshot write byte-identical output.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Node.js 22.18 or later, standard library only; nothing to install. In the grader's container the snapshot is mounted at `/input/snapshot.json` and output goes to `/output`. The run writes `board.json` (the ranked board), `data.js` (the dashboard's dataset), `dashboard/`, `screenshots/` and `dossier.json` (written by `vendor/makefun-board.ts`, the kit's own library). Open `out/dashboard/index.html` from a static server rooted at `out/` to read the board.

## Layout

- `main.ts` — the entry program: snapshot in, board + dashboard data + dossier out.
- `lib/model.ts` — the valuation model, the farm-plan generator and the board's self-check.
- `vendor/makefun-board.ts` — make.fun's dossier library, vendored byte for byte from the kit.
- `dashboard/` — the static page (index.html, app.css, app.js); its data is the `data.js` the program writes beside it.
- `screenshots/` — the board, one protocol's detail view, and a filtered view, captured from the running page.

An implied value is what a token would be worth if it were priced like the snapshot's already-trading peers at the snapshot's figures. It is not a forecast, not a promise of an airdrop, and not financial advice.

---

<sub>Entered on [make.fun](https://make.fun/?ref=p1j0w86y&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

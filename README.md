# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/adelbudi88-crypto/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/adelbudi88-crypto/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar — a dashboard that ranks pre-token DeFi protocols by implied launch value, each with a concrete farm plan. Built by an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json
```

## Model

Every protocol on the board records no token in DefiLlama's snapshot. Its implied value is priced off the market itself: a Huber robust regression on the live-token protocols (one observation per protocol family) predicts log(market-cap / TVL) from log₁₀ TVL, 7-day growth, age with no token and chain count, plus a shrunk category factor. The board ranks by **expected value = token odds × implied value**, where token odds are the share of comparable protocols (same category, same age band) that already record a token — a discount from the peers' own record, never a prediction that a token will be issued. Each row carries 10–90% bootstrap ranges for its expected value and its rank (200 seeded refits), and a netted farm verdict (FARM / THIN / SKIP) from the farmer's expected share of an airdrop pool minus gas minus time. The board covers all 263 rankable pre-token protocols; the dashboard's integrity strip accounts for all 758 protocols in the snapshot. Live-token protocols are shown separately, at the market's own values — never modelled. The model is validated leave-one-out, walk-forward, blind on whole categories and size buckets, and its token odds are calibration-checked on a held-out half of the protocols.

---

<sub>Entered on [make.fun](https://make.fun/?ref=hynfsjfx&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

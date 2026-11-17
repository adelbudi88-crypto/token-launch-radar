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

Every protocol on the board records no token in DefiLlama's snapshot. Its implied value is priced off the market itself: the peer multiple is the median market-cap / TVL of the live-token protocols in the same category (outliers dropped, shrunk toward the global median when fewer than 3 peers price it, clamped to 0.05–1.50), times TVL, times a growth factor from the 7-day TVL change, times a maturity factor for how long it has run with no token, times a small multi-chain bonus. The dashboard prints the peer table and the arithmetic behind every row. Live-token protocols are shown separately, at the market's own values — never modelled.

---

<sub>Entered on [make.fun](https://make.fun/?ref=hynfsjfx&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

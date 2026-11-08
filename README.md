# The vote said 0.1 NEAR. The request said 0.2.

[Live demo](https://harshitlalwani21.github.io/mandate-near/) · [Recorded round replay](https://harshitlalwani21.github.io/mandate-near/?capture=1) · [Video](public/budget-walkthrough.mp4)

Mandate checks the connection between a community budget decision, an exact treasury request and its settled recipient receipt. It layers member choice over an existing Sputnik DAO or Trezu treasury; the DAO retains custody and council approval.

## What works

- A shared nine-credit ballot across several requests, with request-specific support and opposition. An allocation of +2 or −2 costs four credits. Zero is abstention.
- Named, one-hop delegation: the represented member retains their own allowance. Cycles and chains do not count.
- Eligibility at a committed registry block, an explicit electorate, deadline and quorum. Every exclusion includes its actual proposal ID.
- Each request requires positive net support, at least the committed number of supporting members, and enough remaining budget. No global retain vote suppresses unrelated requests.
- Exact native-NEAR recipient, amount and mandate-reference checks. Unsigned proposals preserve the existing DAO approval policy.
- Trezu Notes serialization and parsing, demonstrated by an actually settled Sputnik proposal using that format. This is **format compatibility**, not a completed hosted Trezu user-flow test.
- Receipt traversal verifies the successful native transfer. Downloadable evidence has a reproducible digest and a pinned public-chain replay link.
- Saved raw RPC responses replay through the same reader and verifier with no external network. A browser worker also supports the recorded replay.

## Reproduce the real round

Open **Recorded round replay** above. It loads local static responses, checks their file checksum, reconstructs the budget, replays the eligibility/delegation rules and checks both payment receipts. This is a consistency check against saved RPC data; it does not independently authenticate the chain. For that, open the public round in live mode or run the separate live command.

Round: testnet / mandate-mw7zz0zl.sputnikv2.testnet / proposal **7**.

| Request   | Amount    | Net votes | Outcome                                |
| --------- | --------- | --------- | -------------------------------------- |
| Translate | 0.1 NEAR  | 5         | Funded and settled                     |
| Workshop  | 0.15 NEAR | 4         | Funded and settled; Trezu Notes format |
| Testing   | 0.2 NEAR  | -1        | Not funded                             |

Three members are represented: Alice, Ben, and Cara, who delegates to Alice. The round also contains real on-chain declarations excluded because the account has no eligible credential (proposal 11), is outside the electorate (12), or already declared (13). The team filed the changed 0.2 NEAR translation request (14), rejected it, and settled correct requests 15 and 16. This was a controlled test, not an adversary caught in production.

All accounts, the roster, the council and the demo credential issuer are team controlled. There is no independent participant and no neutral issuer in this demonstration. Credentials establish eligibility under that issuer, not unique human identity.

### Transaction evidence

- [v2-budget-filed](https://testnet.nearblocks.io/txns/CFW1WBFfKjMt1QuHLKdAHU5X27n2y38CAuKsN6RyaZq1)
- [v2-budget-approved](https://testnet.nearblocks.io/txns/7TGsM2dRda6sR33SDXTkU1f2dYF5nj4sPSepsWEUYUgg)
- [v2-alice](https://testnet.nearblocks.io/txns/88gE5Tqx3dsaZd7KjcHqfRDTW1SHPi1MWNa8DvrPhcMS)
- [v2-ben](https://testnet.nearblocks.io/txns/E8GwfdCYe4VnGJ3txM7U1hhJ8AkPbkCQPYh6gK9KGWo5)
- [v2-cara](https://testnet.nearblocks.io/txns/H7XZWvfNgx6bW9wspiWqPBu8WptXpadojPLQEqm45Kgf)
- [v2-ineligible](https://testnet.nearblocks.io/txns/9sVZev2FE3JPQTssWMbDL6Evxi3uTMbP9wB2vu3u9KUe)
- [v2-outside-roster](https://testnet.nearblocks.io/txns/9Z4nNKsGr2PhwDnk3Ct1cgvMu5uqqu4tfAATXcnnxZcN)
- [v2-repeated-declaration](https://testnet.nearblocks.io/txns/4UhMWbaxjkdAzKAFyMyN27vsxYJ2DzHZMenQwQcYBatA)
- [changed-amount-filed](https://testnet.nearblocks.io/txns/7LyystUfP9WiCyrG7GALwGMBKrJF75FGaoLWhXEferMQ)
- [changed-amount-rejected](https://testnet.nearblocks.io/txns/ACXqQebPXM8AoaqtWLT8RpejKHo6ctvaDweBHrhqRVJm)
- [translate-payment-filed](https://testnet.nearblocks.io/txns/FC1Ae77sZCwu3pCvL3HzgPK4xGY5vzVnDMgKEij73g6f)
- [translate-payment-approved](https://testnet.nearblocks.io/txns/T7v27UzSqtTajjCv5fPHYwH19r6QkTYcKfgnPg8m99u)
- [workshop-payment-filed](https://testnet.nearblocks.io/txns/EbATPEi3vZSBcLKW59dmjegdALXtsfcLzSsppLwojcwU)
- [workshop-payment-approved](https://testnet.nearblocks.io/txns/9Ra9zB6cuDswcj3i8YEezNQWuLvt2yYTaFsw1mQozdSG)

The complete recorded metadata, pinned block, payment receipts and evidence digest are in [testnet-round.json](public/testnet-round.json). Raw responses are in [rpc-capture.json](public/rpc-capture.json), with a companion SHA-256 checksum. The checkpoint digest is **0fca4dcafcbb2a1430d8ba1bd28e776829ab9e218918cbe14f34aae358d4b424**.

## Run locally or verify without internet

Requires Node 22 or newer. There are no package downloads or runtime dependencies.

```sh
npm test
npm run test:replay
npm start
```

The default test command makes no live RPC calls. The offline command fails on missing responses, inconsistent data or a changed checksum. Serve the app over HTTP for browser worker support; opening the file directly is not equivalent.

Optional, internet required:

```sh
npm run test:public
```

An unavailable or restricted RPC endpoint can make that separate live check fail. This does not prevent offline verification. Only maintainers updating the capture should run capture:public.

## Trust and design limits

The council selects the roster, issuer and mandate. Mandate provides an auditable review, not trust-minimized governance. The official registry represents each issuer/token pair with one owner; the transfer implementation removes the previous owner's balance and updates ownership. A same-pair/two-wallet fixture tests defensive consistency and is not a realistic Sybil-resistance demonstration. One person obtaining several credentials remains an issuer problem. [Registry source](https://github.com/near-ndc/i-am-human/tree/93e07da/contracts/registry/src).

The council can bypass Mandate and pay using another route. A passing member budget is advisory until the council approves the exact request. This separation lets members express priorities without taking treasury custody from the existing DAO; small teams that do not need separate member input may reasonably prefer the DAO alone.

Quadratic costs do not prove optimal allocations or collusion resistance. Ranking is deterministic and greedy: net votes descending, request ID breaks ties, then requests that fit are selected. Fixed project costs, delegate concentration, issuer bias and coercion remain limitations. A minimum of two supporters is a committed policy choice, not a general security guarantee.

The v2 schema changes voting semantics. Historical v1 budgets remain readable under their original global-retain rule; they are not silently reinterpreted. The legacy payment page is retained for reference and removed from primary navigation. CSV export is removed from the main workflow to avoid a second payment path. near.social remains an unsigned draft helper until an actual post exists.

## Track fit and inspiration

The [Social Money brief](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/12-social.md) asks for community coordination using Sputnik DAO, Trezu and named accounts while preserving treasury custody and approvals. Mandate addresses shared budgets; the bounty-board text is an example prompt, not a claim that Mandate implements its reputation tiers.

- [WNS.Vote](https://ethglobal.com/showcase/wns-vote-cw6na): identity-aware participation and quadratic governance. Mandate uses named NEAR accounts and issuer-defined eligibility; it does not inherit World ID guarantees. Its disabled World ID verification comment states that the Sepolia Worldcoin implementation was broken, so that code is not evidence of a deliberate design improvement.
- [ActionForge](https://ethglobal.com/showcase/actionforge-09b09): connecting a vote to a concrete action. Mandate checks exact existing treasury requests and receipts; it does not copy autonomous execution or enforce payments on-chain.
- [Eternal Commons](https://ethglobal.com/showcase/eternal-commons-dnt9j): allocating across projects and keeping evidence through payout. Mandate retains raw declarations, pinned identity reads and settlement receipts.

These are conceptual inspirations, not claims that their code or guarantees were imported. We do not claim receipt verification alone is novel. Mandate's specific proposition is the reproducible comparison between the committed member mandate and the treasury request, with existing-treasury compatibility.

## Evaluation boundaries

No first-place or top-three ranking is established. Test counts are not comparable measures of project quality. Independent users, a neutral issuer and a hosted Trezu workflow are still unproven. They need real participants and testing, not simulated accounts or extra features. Milestones, new tokens, an AI watchdog and a new multisig are outside this submission.

## Review a single request

[Open the translation payment history](https://harshitlalwani21.github.io/mandate-near/?capture=1&request=translate#requestHistory). Select proposal 14 to compare the staged 0.2 request with the authorized 0.1 payment. Proposal 15 matches. The history includes council status and the verified settlement transaction. In a live round, proposal ID lookup reads the filed DAO proposal directly, including proposals with missing Notes. Captured mode covers the saved referenced payments.

In an open live round, select your own roster account and allocations, then connect your wallet. Mandate checks the connected account, the committed credential snapshot and the live DAO bond. Review the signer, network, contract and bond before opening the wallet to sign a single add_proposal call. Refresh the live round to verify inclusion. The closed public round remains team-run. The testnet demonstration uses Trezu-compatible Notes. Trezu's published wallet connector currently configures mainnet only.

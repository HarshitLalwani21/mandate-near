# Mechanism, integrations and evidence

## What a round commits

A `treasury-budget/v1` signaling Vote commits a title, native NEAR budget, up to ten requests, electorate, quorum, closing timestamp and identity snapshot. Each request has a unique ID, exact recipient, exact amount and purpose. A `budget-ballot/v1` declaration assigns whole votes from zero to three to requests and retaining funds. The sum of squared vote counts must be at most nine.

A `budget-delegation/v1` declaration names one enrolled account. Its eligible direct ballot is copied using the delegating member's allowance. Delegation chains and cycles yield zero turnout. The first eligible declaration per account and issuer/token pair reserves that identity. Invalid declarations are logged and skipped. An eligible zero-zero ballot counts as participation.

Once quorum is reached, a request needs strictly more votes than retaining funds. Requests are ordered by votes descending, then request ID ascending using ASCII order. Each full request is selected only if it fits the remaining budget. No request is partly funded. The selection rule and the global retain threshold are Mandate design choices.

## The research connection

The basic quadratic price comes from Lalley and Weyl. Georgescu, Fox, Gautier and Wooldridge study fixed-budget voting across multiple issues, including strategic and collusive behavior. Mandate adopts the shared-credit tradeoff. Its treasury-specific selection and delegation rules differ from those theoretical mechanisms. The cited work supplies the design background, while the tests establish the application's disclosed invariants.

- [Lalley and Weyl, Quadratic Voting](https://doi.org/10.1257/pandp.20181002)
- [Georgescu et al., Fixed-budget and Multiple-issue Quadratic Voting](https://arxiv.org/abs/2409.06614)

## What the earlier winners contributed

| Project                                                                             | Verified inspiration                                                                                                                                   | What Mandate implements                                                                                                           |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| [WNS.Vote, ETHGlobal London](https://ethglobal.com/showcase/wns-vote-cw6na)         | Worldcoin public-goods winner and ENS second place. Named identities and delegation with quadratic voting.                                             | Named NEAR members, a committed identity snapshot, credential reuse detection and delegation.                                     |
| [ActionForge, ETHGlobal Istanbul](https://ethglobal.com/showcase/actionforge-09b09) | Scroll deploy pool and Chainlink Other Services award. Associates concrete actions with vote outcomes.                                                 | Passing budget results produce exact native payment proposals. DAO approval and successful payment receipts have distinct states. |
| [Eternal Commons, Superhack](https://ethglobal.com/showcase/eternal-commons-dnt9j)  | Optimism second place in RetroPGF, public goods or impact, and a Worldcoin pool prize. Allocation across projects and evidence through funding stages. | A shared ballot across requests, a public stage ledger, evidence digest and a replay link.                                        |

These were sponsor awards. Mandate has no guaranteed award or comparative ranking.

I reviewed the full narration and frames sampled across the WNS.Vote and ActionForge demos, then inspected their contracts and frontend flow. The WNS.Vote Sepolia registry's World ID verification call is commented out. ActionForge's attachment, scheduled request and execution event occur at different stages. Those findings informed the explicit identity labels and settlement checks here.

- [WNS.Vote registry source at the inspected commit](https://github.com/arr00/wns/blob/0c07c439463fce741e3b0a85b4492a4a42f92305/contracts/ENSWorldIdRegistry.sol)
- [WNS.Vote governor](https://github.com/arr00/wns/blob/0c07c439463fce741e3b0a85b4492a4a42f92305/contracts/GovernorDelegate.sol)
- [WNS.Vote frontend](https://github.com/benlevy0/wns-vote/blob/d569fdcede177bad8803cf76f30a14ae89e51a6b/packages/nextjs/app/page.tsx)
- [ActionForge contract](https://github.com/action-forge/protocol/blob/672a94e91a71e3223f92165218605a7a36967b8e/contracts/ActionForge.sol)
- [ActionForge frontend](https://github.com/action-forge/app/blob/106bc429503cf3b21ffa49727bf9f2f772f85dfe/components/ActionWidget.vue)
- [Eternal Commons source](https://github.com/tnkshuuhei/superhack)

## NEAR track fit

Social Money invites shared budgets, programmable rewards and collective ownership using Sputnik DAO, Trezu and named accounts. This app follows the shared-budget direction. The separate sample bounty-board prompt illustrates earned trust and payout tiers. The current hackathon rules say suggested integrations are optional and testnet projects qualify.

- [Social Money brief and sample](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/12-social.md)
- [Current hackathon rules](https://nearhackathon.com/HACKATHON.md)

## Sputnik and identity deployment

The public demonstration uses a DAO created through `sputnikv2.testnet`. The factory required a storage deposit of approximately 5.397 testnet NEAR. The creation attached six free testnet NEAR. Proposal bonds were one testnet NEAR, read from the actual policy.

The identity registry is the official `contracts/deployed/registry.wasm` from the NEAR I-Am-Human source at commit `93e07da335668e401800a8c1c1a5f25c798c6dc6`. The artifact SHA-256 is `a0adc1f646921511a73e57c9d5d00a4388500d9382bce2bb06a66bc9505a5bb4`. Its configured issuer and authority are the team council account. That registered issuer called `sbt_mint` for the three members.

The registry's real `is_human` response proves the presence of the required issuer/class credential. In this demo, the team issued those credentials and controls all the accounts. Independent proof of personhood and outside community adoption remain unestablished.

The committed registry is accepted as a custom source only on testnet, with `identityPolicy: "team-issued-testnet"`. Standard registry deployments are the default elsewhere. Eligibility is evaluated at the pinned block. Later revocation does not rewrite a past round.

- [Registry source](https://github.com/near-ndc/i-am-human/tree/93e07da335668e401800a8c1c1a5f25c798c6dc6)
- [Registry standard, NEP-393](https://github.com/near/NEPs/blob/master/neps/nep-0393.md)
- [Sputnik contract](https://github.com/near-daos/sputnik-dao-contract)

## Trezu compatibility

The native payment form passes the user's memo as `notes` to `encodeToMarkdown`. For a native NEAR payment, the description is `* Notes: {reference JSON}`. The app accepts a raw reference JSON or that exact one-field Notes wrapper. It rejects descriptions it cannot decode.

Use **Prepare Trezu form details** to obtain recipient, amount, asset, Notes and the expected resulting Sputnik description. The real workshop transfer used this Notes encoding and settled successfully. It was submitted directly to Sputnik, so this verifies on-chain format compatibility. Opening, submitting and reviewing it through Trezu's hosted UI remains untested.

- [Trezu payment form at the inspected commit](https://github.com/NEAR-DevHub/trezu/blob/a6aaaf6742099069634a25fb20c4287a2852dd62/nt-fe/app/%28treasury%29/%5BtreasuryId%5D/payments/page.tsx)
- [Trezu description encoder](https://github.com/NEAR-DevHub/trezu/blob/a6aaaf6742099069634a25fb20c4287a2852dd62/nt-fe/lib/utils.ts)
- [Trezu payment documentation](https://docs.trezu.org/payments/single-payment)
- [Trezu CSV documentation](https://docs.trezu.org/payments/bulk-payment)

## Evidence and near.social

The public artifact lists registry deployment, credential mint, budget filing and approval, declarations, the altered request and rejection, valid payment requests, deciding approval transactions and successful transfer receipt IDs. Public proposal state and receipt RPCs are the authority for those stages.

Downloaded evidence contains the mandate, snapshot, raw credential responses, ballot results, transfer fields and any settlements verified in this browser. Its SHA-256 identifies those exact contents. Sharing the replay URL lets a second observer recompute the round at the same block. A digest by itself authenticates no author.

**Prepare near.social post** produces unsigned FastData `__fastdata_kv` arguments to receiver `social`. It contains the digest and public replay URL. A user must publish from a real mainnet account. The transaction is expected to show CodeDoesNotExist because `social` has no contract. Verify indexing through `GET https://api2.near.social/v1/tx/{hash}`. The project has prepared this format but has posted no mainnet evidence.

- [near.social agent and write guide](https://near.social/skill.md)
- [NEAR transaction and receipt RPCs](https://docs.near.org/api/rpc/transactions)
- [NEAR RPC provider list](https://docs.near.org/api/rpc/providers)

## Enforcement and operating limits

Mandate performs reproducible review and prepares proposals. It holds no treasury assets and casts no automatic council votes. A treasury can pay through other paths. A shared reference on a proposal detects a duplicate claim within the inspected history, while concurrent new requests need a fresh check.

The settlement verifier requires final execution, one direct `act_proposal` / `VoteApprove` call for the selected proposal, the DAO's approval receipt, and one directly emitted native transfer with the exact recipient and amount. It then verifies that the recipient receipt succeeded. Gas refunds have a different predecessor and are excluded. A bond refund emitted by a later callback is excluded by its receipt ancestry. Batched calls and ambiguous matches require manual review.

Ballots are public. Credential issuers can make mistakes or issue more than one credential per physical person. Strategic coordination and collusion remain possible. The software's guarantees depend on its stated identity and voting assumptions.

The public round uses testnet funds only. No production wallet keys are present in this repository. Team demo signing keys are stored separately from all published artifacts.

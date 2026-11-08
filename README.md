# The vote said 30 NEAR. The request said 40.

[Open the live demo](https://harshitlalwani21.github.io/mandate-near/) · [Replay our public budget round](https://harshitlalwani21.github.io/mandate-near/?network=testnet&dao=mandate-mw7zz0zl.sputnikv2.testnet&id=0) · [Watch the walkthrough](public/budget-walkthrough.mp4)

Mandate connects a community's budget choices to exact NEAR treasury payments and successful recipient receipts. Members spend one shared nine-credit allowance across several requests. Named delegation preserves each member's allowance. The treasury keeps its existing Sputnik or Trezu approval policy.

Built for NEAR HACKATHON 2026, Social Money.

## Try it in two minutes

1. Open the demo. Three fictional members allocate credits among translation, a workshop and user testing. Move one member's votes between requests. The app charges the square of each allocation across the entire ballot. Two allocations of three votes exceed the allowance.
2. Choose **Try a changed amount**. Members authorized 0.2 NEAR for translation. A 0.3 NEAR request is held. Choose the translation request again to restore the voted amount, then choose **Prepare exact payment**.
3. Choose the alias account in the member selector and cast its ballot. Its credential duplicates Asha's, so its votes are excluded in **Who was represented?**
4. Choose **Open a public round**, then **Open our public testnet round**. You will see three real declarations, one delegation, two funded requests, a rejected changed amount and the actual payment proposals.
5. Under **Check what the treasury will send**, select translation or the workshop, then **Verify this payment's settlement**. The recorded signer and transaction are filled for you. Choose **Verify settlement** to follow the public receipts.
6. Download the evidence or copy its pinned replay link. Anyone can rerun it from the public chain. A fresh state check finds later payment proposals.

The public round uses our own official I-Am-Human registry deployment and team-issued test credentials. All accounts are controlled by the team. This demonstrates the software with real contracts and transactions. The issuer controls eligibility.

## Our public testnet results

The council approved a 0.3 NEAR budget. Alice and Ben filed direct ballots, and Cara delegated to Alice. Their requests received 5, 4 and 1 votes.

| Request                     | Amount                  | Result                                                     |
| --------------------------- | ----------------------- | ---------------------------------------------------------- |
| Translation                 | 0.1 NEAR                | Funded and settled                                         |
| Welcome workshop            | 0.15 NEAR               | Funded and settled, using Trezu's Notes description format |
| User testing                | 0.2 NEAR                | Outside the remaining 0.05 NEAR budget                     |
| Changed translation request | 0.2 NEAR instead of 0.1 | Detected by the reviewer and rejected by the council       |

- [Budget proposal transaction](https://testnet.nearblocks.io/txns/5nPeQCqkXB4M3zgx6Wt3mfKegSxFCyXprZFR622JbJaX)
- [Named delegation](https://testnet.nearblocks.io/txns/44nUG9A7S5hKa2ger8ddL5YiBu58AbNPNh3DSrGN5SZx)
- [Rejection of the changed amount](https://testnet.nearblocks.io/txns/B1RCHPzg8ovi4W5UYQ84UWjDDfaEKWi98Ge9bb2yPgca)
- [Settled translation payment](https://testnet.nearblocks.io/txns/cBjk5HsePq1bx1gGaucfy57hFW15sk56s2VmTVb5qJs)
- [Settled workshop payment](https://testnet.nearblocks.io/txns/J7Kf8H5ZZMP2Ln8WMCHY6mq42yXunyyrJFyDnfAvBvmT)

[All public accounts, transactions, snapshot and evidence digest](public/testnet-round.json)

## Run locally

Node 22 or newer is sufficient. The app and verification suite have no npm dependencies.

```sh
npm start
```

Open http://127.0.0.1:4173. Or open index.html directly for the fictional example. Use HTTP or HTTPS for evidence hashing and copying replay links.

```sh
npm test
npm run test:public
```

The offline suite exercises shared credits, budget selection, identity reuse, delegation, quorum, deadlines, changed payment fields, Trezu Notes, evidence hashes and successful or failed settlement receipts. The public check reads the saved review block, verifies both real payments, rejects the altered amount and recomputes the evidence digest. Public archival RPCs can be rate limited. A provider error leaves the review incomplete.

## Integration and scope

- **Sputnik DAO.** Approved signaling Vote proposals commit the round. Member-authored Vote proposals record declarations. Native Transfer proposals preserve custody and the council's approval rules. The verifier follows the deciding approval transaction to its exact directly generated native transfer receipt.
- **Trezu.** The native payment form stores its memo under Notes. Mandate produces the exact recipient, amount and JSON Notes, and reads Trezu's `* Notes: ...` wrapper. We tested that description format on the real workshop payout through Sputnik. The hosted Trezu interface has not been exercised with our testnet treasury. A CSV is also available.
- **near.social.** Mandate prepares a FastData post containing the evidence digest and replay link. Posting uses `__fastdata_kv` on `social`. This project has not published a mainnet social post.
- **Identity.** Standard public registries are the default. A custom registry is accepted only for an explicitly disclosed team-issued testnet round. The demo uses the official registry binary, with its source and artifact digest recorded.
- **Research.** A shared budget across several choices creates an actual allocation tradeoff. The nine-credit allowance, full-request selection rule and delegation semantics are disclosed design choices.

Read the [mechanism, source attribution and trust assumptions](docs/guide.md). The legacy [single-payment reviewer](payment.html) remains available for v1–v3 mandates.

## Limits

The current app reviews native NEAR transfers, up to 100 members, ten requests and 500 intervening proposals. It refuses certification when proposal history is incomplete. Ballots and allocations are public. Identity depends on issuer policy. Named delegation is one hop and needs an eligible direct ballot.

The client prepares and reviews transactions. Treasury signers can authorize payments through other paths. Concurrent requests submitted after a review snapshot can conflict. Recheck the actual filed proposal before approving it. The settlement verifier supports one direct `act_proposal` / `VoteApprove` call and an unambiguous matching receipt.

## Attribution

WNS.Vote inspired the named identity and delegation flow. ActionForge inspired binding a concrete action to a voting outcome. Eternal Commons inspired evidence across funding stages. Mandate adapts those patterns to NEAR treasury records. The published app code was developed during this hackathon with Codex assistance. No Solidity contracts from those projects are deployed by Mandate.

Original authors retain ownership of their repositories. The research references and official registry artifact provenance are in [the guide](docs/guide.md).

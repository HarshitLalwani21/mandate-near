const test = require('node:test');
const assert = require('node:assert/strict');
const loadEngine = require('./engine.cjs');
const engine = loadEngine();
const amount = (value) => String(BigInt(value) * 10n ** 23n);
const budget = {
  schema: 'treasury-budget/v1',
  title: 'Community budget',
  asset: 'NEAR',
  amount: '0.3',
  requests: [
    { id: 'a', recipient: 'recipient.testnet', purpose: 'Translate', amount: '0.1' },
    { id: 'b', recipient: 'recipient.testnet', purpose: 'Workshop', amount: '0.15' },
    { id: 'c', recipient: 'recipient.testnet', purpose: 'Testing', amount: '0.2' },
  ],
  round: {
    members: ['alice.testnet', 'ben.testnet', 'cara.testnet', 'alias.testnet'],
    quorum: 2,
    closesNs: '1800000000000000000',
    identityBlock: '4'.repeat(44),
  },
};
const proof = (id) => [['issuer.testnet', [id]]];
const proofs = new Map([
  ['alice.testnet', proof(1)],
  ['ben.testnet', proof(2)],
  ['cara.testnet', proof(3)],
  ['alias.testnet', proof(1)],
]);
const records = [
  { account: 'alice.testnet', allocations: { a: 2, b: 1 }, retain: 0 },
  { account: 'ben.testnet', allocations: { a: 1, b: 2, c: 1 }, retain: 0 },
  { account: 'cara.testnet', delegate: 'alice.testnet' },
];
const review = () => ({
  network: 'testnet',
  dao: 'dao.testnet',
  reference: 'testnet/dao.testnet/7',
  block: '5'.repeat(44),
  budget,
  result: engine.tallyBudget(budget, records, proofs),
  closed: true,
  proposal: { id: 7 },
  ballots: records,
  transfers: [],
  proofs: [...proofs],
});
test('a single personal credit budget is shared across requests', () => {
  assert.equal(engine.creditCost(budget, records[0]), 5);
  assert.throws(
    () => engine.creditCost(budget, { allocations: { a: 3, b: 1 }, retain: 0 }),
    /cost 10/,
  );
  assert.throws(
    () => engine.creditCost(budget, { allocations: { a: 2, b: 2 }, retain: 2 }),
    /cost 12/,
  );
  assert.throws(
    () => engine.creditCost(budget, { allocations: { unknown: 1 }, retain: 0 }),
    /unknown/,
  );
});
test('named delegation uses each person’s allowance and total funding stays within budget', () => {
  const result = review().result;
  assert.equal(result.represented, 3);
  assert.deepEqual(
    Array.from(result.requests, (r) => r.votes),
    [5, 4, 1],
  );
  assert.deepEqual(
    Array.from(result.requests, (r) => r.funded),
    [true, true, false],
  );
  assert.equal(result.remaining, '0.05');
});
test('a second wallet with the same credential cannot add influence', () => {
  const result = engine.tallyBudget(
    budget,
    [...records, { account: 'alias.testnet', allocations: { c: 3 }, retain: 0 }],
    proofs,
  );
  assert.equal(result.represented, 3);
  assert.match(result.log[3].reason, /Credential already/);
});
test('invalid declarations do not consume a credential, and chains and cycles do not count', () => {
  const validAfterInvalid = engine.tallyBudget(
    budget,
    [{ account: 'alice.testnet', allocations: { a: 3, b: 3 }, retain: 0 }, ...records],
    proofs,
  );
  assert.equal(validAfterInvalid.represented, 3);
  const cycle = engine.tallyBudget(
    budget,
    [
      { account: 'alice.testnet', delegate: 'cara.testnet' },
      { account: 'cara.testnet', delegate: 'alice.testnet' },
    ],
    proofs,
  );
  assert.equal(cycle.represented, 0);
  assert.equal(
    cycle.requests.some((request) => request.funded),
    false,
  );
});
test('retaining funds wins ties and quorum is enforced', () => {
  const tie = engine.tallyBudget(
    budget,
    [
      { account: 'alice.testnet', allocations: { a: 1 }, retain: 1 },
      { account: 'ben.testnet', allocations: { a: 1 }, retain: 1 },
    ],
    proofs,
  );
  assert.equal(tie.requests[0].funded, false);
  const one = engine.tallyBudget(budget, [records[0]], proofs);
  assert.equal(one.quorumMet, false);
});
test('request IDs break vote ties deterministically regardless of request input order', () => {
  const tied = { ...budget, amount: '0.2', requests: [budget.requests[1], budget.requests[0]] };
  const result = engine.tallyBudget(
    tied,
    [
      { account: 'alice.testnet', allocations: { a: 2, b: 2 }, retain: 0 },
      { account: 'ben.testnet', allocations: { a: 1, b: 1 }, retain: 0 },
    ],
    proofs,
  );
  assert.equal(result.requests.find((request) => request.id === 'a').funded, true);
  assert.equal(result.requests.find((request) => request.id === 'b').funded, false);
});
test('the exact native payment includes its reference and request ID', () => {
  const args = engine.budgetPaymentArguments(review(), 'a');
  assert.equal(args.proposal.kind.Transfer.amount, amount(1));
  assert.equal(JSON.parse(args.proposal.description).requestId, 'a');
  assert.throws(() => engine.budgetPaymentArguments({ ...review(), closed: false }, 'a'), /closed/);
  assert.throws(() => engine.budgetPaymentArguments(review(), 'c'), /passing/);
  const entry = { requestId: 'a', proposal: { status: 'InProgress' } };
  assert.throws(
    () => engine.budgetPaymentArguments({ ...review(), transfers: [entry] }, 'a'),
    /already/,
  );
});
test('Trezu memo wrapper preserves the mandate and a changed transfer is detected', () => {
  const r = review(),
    memo = engine.trezuMemo(r, 'a');
  const proposal = {
    ...engine.budgetPaymentArguments(r, 'a').proposal,
    id: 11,
    status: 'Approved',
    submission_time: '1800000001000000000',
    description: memo.expectedSputnikDescription,
  };
  assert.equal(engine.matchBudgetPayment(r, { requestId: 'a', proposal }), true);
  proposal.kind.Transfer.amount = amount(2);
  assert.equal(engine.matchBudgetPayment(r, { requestId: 'a', proposal }), false);
});
test('custom demo registries require the explicit testnet disclosure', () => {
  assert.throws(
    () =>
      engine.registryForRound('mainnet', {
        registry: 'registry.testnet',
        identityPolicy: 'team-issued-testnet',
      }),
    /testnet/,
  );
  assert.throws(
    () => engine.registryForRound('testnet', { registry: 'registry.testnet' }),
    /explicitly/,
  );
  assert.equal(
    engine.registryForRound('testnet', {
      registry: 'registry.testnet',
      identityPolicy: 'team-issued-testnet',
    }),
    'registry.testnet',
  );
});
test('evidence hashes and replay URLs are reproducible and social drafts use FastData', async () => {
  const evidence = engine.evidenceForBudget(review());
  assert.equal(
    await engine.fingerprintEvidence(evidence),
    await engine.fingerprintEvidence(evidence),
  );
  assert.notEqual(
    await engine.fingerprintEvidence(evidence),
    await engine.fingerprintEvidence({ ...evidence, closed: false }),
  );
  const link = new URL(
    engine.evidenceLink(review(), 'https://example.com/mandate/index.html?old=value#x'),
  );
  assert.equal(link.searchParams.get('block'), '5'.repeat(44));
  assert.equal(link.searchParams.has('old'), false);
  const withReceipts = new URL(
    engine.evidenceLink(review(), 'https://example.com/', [
      {
        requestId: 'a',
        proposalId: 11,
        transactionHash: '4'.repeat(44),
        signer: 'council.testnet',
        receipt: 'verified',
      },
    ]),
  );
  assert.equal(JSON.parse(withReceipts.searchParams.get('payments'))[0].proposalId, 11);
  const social = engine.nearSocialArguments('A verified stage', 123);
  assert.equal(social.actions[0].params.methodName, '__fastdata_kv');
  assert.equal(social.actions[0].params.args['post/123'].text, 'A verified stage');
});

test('evidence is stable when credential reads and receipt checks finish in another order', async () => {
  const first = review();
  const reordered = { ...first, proofs: [...first.proofs].reverse() };
  const payments = [
    {
      requestId: 'a',
      proposalId: 11,
      transactionHash: 'a',
      signer: 'council.testnet',
      receipt: 'r1',
      verified: true,
    },
    {
      requestId: 'b',
      proposalId: 12,
      transactionHash: 'b',
      signer: 'council.testnet',
      receipt: 'r2',
      verified: true,
    },
  ];
  const a = engine.evidenceForBudget(first, payments);
  const b = engine.evidenceForBudget(reordered, [...payments].reverse());
  assert.equal(await engine.fingerprintEvidence(a), await engine.fingerprintEvidence(b));
});

test('pinned live reader excludes late votes and refuses a missing history page', async () => {
  const block = '5'.repeat(44),
    identity = budget.round.identityBlock;
  let missing = false,
    late = false,
    closed = true;
  const chain = loadEngine({
    fetch: async (url, options) => {
      if (url.includes('archival-rpc')) throw Error('Simulated provider outage');
      assert.equal(url, 'https://test.rpc.fastnear.com');
      const { method, params } = JSON.parse(options.body);
      let data;
      if (method === 'block')
        return {
          ok: true,
          json: async () => ({
            result: {
              header: {
                hash: params.block_id,
                timestamp_nanosec:
                  params.block_id === identity
                    ? '1'
                    : closed
                      ? '1800000001000000000'
                      : '1799999999000000000',
              },
            },
          }),
        };
      const args = JSON.parse(atob(params.args_base64));
      if (params.method_name === 'get_proposal')
        data = {
          id: 7,
          kind: 'Vote',
          status: 'Approved',
          submission_time: '2',
          description: JSON.stringify(budget),
        };
      else if (params.method_name === 'get_last_proposal_id') data = 11;
      else if (params.method_name === 'is_human') {
        assert.equal(params.block_id, identity);
        data = proofs.get(args.account);
      } else {
        assert.equal(params.block_id, block);
        data = records.map((record, index) => ({
          id: index + 8,
          kind: 'Vote',
          proposer: record.account,
          submission_time: late && index === 0 ? budget.round.closesNs : '3',
          description: JSON.stringify({
            schema: record.delegate ? 'budget-delegation/v1' : 'budget-ballot/v1',
            reference: 'testnet/dao.testnet/7',
            ...record,
          }),
        }));
        if (missing) data.pop();
      }
      return {
        ok: true,
        json: async () => ({
          result: {
            block_hash: params.method_name === 'is_human' ? identity : block,
            result: Array.from(new TextEncoder().encode(JSON.stringify(data))),
          },
        }),
      };
    },
  });
  const result = await chain.inspectBudget('testnet', 'dao.testnet', '7', block);
  assert.equal(result.result.represented, 3);
  late = true;
  const lateResult = await chain.inspectBudget('testnet', 'dao.testnet', '7', block);
  assert.equal(lateResult.result.represented, 1);
  closed = false;
  const open = await chain.inspectBudget('testnet', 'dao.testnet', '7', block);
  assert.equal(open.closed, false);
  missing = true;
  await assert.rejects(chain.inspectBudget('testnet', 'dao.testnet', '7', block), /Incomplete/);
});

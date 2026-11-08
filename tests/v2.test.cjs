const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./engine.cjs");
const engine = load();
const budget = {
  schema: "treasury-budget/v2",
  title: "Request-specific preferences",
  asset: "NEAR",
  amount: "0.3",
  requests: [
    {
      id: "a",
      recipient: "recipient.testnet",
      purpose: "Translate",
      amount: "0.1",
    },
    {
      id: "b",
      recipient: "recipient.testnet",
      purpose: "Workshop",
      amount: "0.15",
    },
    {
      id: "c",
      recipient: "recipient.testnet",
      purpose: "Testing",
      amount: "0.2",
    },
  ],
  round: {
    members: [
      "alice.testnet",
      "ben.testnet",
      "cara.testnet",
      "visitor.testnet",
    ],
    quorum: 2,
    minSupporters: 2,
    closesNs: "1800000000000000000",
    identityBlock: "4".repeat(44),
  },
};
const proofs = new Map([
  ["alice.testnet", [["issuer.testnet", [1]]]],
  ["ben.testnet", [["issuer.testnet", [2]]]],
  ["cara.testnet", [["issuer.testnet", [3]]]],
  ["visitor.testnet", []],
]);
const ballots = [
  {
    account: "alice.testnet",
    proposalId: 8,
    allocations: { a: 2, b: 1, c: -1 },
  },
  { account: "ben.testnet", proposalId: 9, allocations: { a: 1, b: 2, c: 1 } },
  { account: "cara.testnet", proposalId: 10, delegate: "alice.testnet" },
];
test("opposing one request cannot subtract support from another", () => {
  const result = engine.tallyBudget(budget, ballots, proofs);
  assert.deepEqual(
    Array.from(result.requests, (r) => r.votes),
    [5, 4, -1],
  );
  assert.equal(result.requests[0].funded, true);
  assert.equal(result.requests[1].funded, true);
  assert.equal(result.requests[2].funded, false);
  assert.equal(result.requests[2].opposition, 2);
  assert.equal(Object.hasOwn(result, "retain"), false);
});
test("signed allocations share one square-cost allowance and reject the old global field", () => {
  assert.equal(
    engine.creditCost(budget, { allocations: { a: 2, b: -2, c: 1 } }),
    9,
  );
  assert.throws(
    () => engine.creditCost(budget, { allocations: { a: 3, b: -1 } }),
    /10 credits/,
  );
  assert.throws(
    () => engine.creditCost(budget, { allocations: { a: 1 }, retain: 0 }),
    /Remove the global/,
  );
  assert.throws(
    () => engine.creditCost(budget, { allocations: { a: -4 } }),
    /invalid/,
  );
});
test("abstentions can meet round quorum but cannot satisfy a request supporter threshold", () => {
  const result = engine.tallyBudget(
    budget,
    [
      { account: "alice.testnet", allocations: { a: 3 } },
      { account: "ben.testnet", allocations: { a: 0 } },
    ],
    proofs,
  );
  assert.equal(result.quorumMet, true);
  assert.equal(result.requests[0].funded, false);
  assert.equal(result.requests[0].reason, "Too few supporters");
});
test("each exclusion retains its actual proposal ID", () => {
  const result = engine.tallyBudget(
    budget,
    [
      ...ballots,
      { account: "visitor.testnet", proposalId: 11, allocations: { a: 3 } },
      { account: "outsider.testnet", proposalId: 12, allocations: { a: 3 } },
      { account: "alice.testnet", proposalId: 13, allocations: { a: 3 } },
    ],
    proofs,
  );
  assert.deepEqual(
    Array.from(
      result.log.filter((e) => !e.counted),
      (e) => [e.proposalId, e.reason],
    ),
    [
      [11, "No eligible credential"],
      [12, "Outside electorate"],
      [13, "Account already used"],
    ],
  );
});
test("v2 mandates require a committed supporter threshold", () => {
  assert.throws(
    () =>
      engine.checkBudget({
        ...budget,
        round: { ...budget.round, minSupporters: 0 },
      }),
    /supporters/,
  );
  assert.throws(
    () =>
      engine.checkBudget({
        ...budget,
        round: { ...budget.round, minSupporters: 5 },
      }),
    /supporters/,
  );
  assert.equal(engine.ballotSchema(budget), "budget-ballot/v2");
});

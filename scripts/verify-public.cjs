const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const loadEngine = require('../tests/engine.cjs');
const recorded = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'public', 'testnet-round.json'), 'utf8'),
);
async function main() {
  const engine = loadEngine({ fetch });
  const review = await engine.inspectBudget(
    'testnet',
    recorded.dao,
    recorded.budgetProposalId,
    recorded.reviewBlock,
  );
  assert.equal(review.result.represented, 3);
  assert.equal(review.result.requests.filter((request) => request.funded).length, 2);
  const altered = review.transfers.find((entry) => entry.proposal.id === recorded.badProposalId);
  assert.equal(altered.proposal.status, 'Rejected');
  assert.equal(engine.matchBudgetPayment(review, altered), false);
  const settlements = [];
  for (const payment of recorded.payments) {
    const entry = review.transfers.find((item) => item.proposal.id === payment.proposalId);
    assert.equal(engine.matchBudgetPayment(review, entry), true);
    const transfer = entry.proposal.kind.Transfer;
    const receipt = await engine.findPaymentReceipt(
      {
        network: 'testnet',
        dao: recorded.dao,
        id: payment.proposalId,
        recipient: transfer.receiver_id,
        amount: transfer.amount,
      },
      payment.transactionHash,
      payment.signer,
    );
    assert.equal(receipt, payment.receipt);
    settlements.push({ ...payment, receipt });
    console.log('Verified', payment.requestId, transfer.amount, 'yoctoNEAR', receipt);
  }
  const evidence = engine.evidenceForBudget(review, settlements);
  const digest = await engine.fingerprintEvidence(evidence);
  assert.equal(digest, recorded.evidenceHash);
  console.log('Verified public round', recorded.reference);
  console.log('Evidence SHA-256', digest);
  console.log(recorded.identityDisclosure);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

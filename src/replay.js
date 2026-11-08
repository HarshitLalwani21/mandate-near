async function verifyRecordedRound(recorded) {
  const requireCheck = (condition, message) => {
    if (!condition) throw Error(message);
  };
  const review = await inspectBudget(
    "testnet",
    recorded.dao,
    recorded.budgetProposalId,
    recorded.reviewBlock,
  );
  requireCheck(
    review.result.represented === (recorded.expected?.represented ?? 3),
    "Unexpected represented count.",
  );
  requireCheck(
    review.result.requests.filter((request) => request.funded).length ===
      (recorded.expected?.funded ?? 2),
    "Unexpected funding result.",
  );
  for (const expected of recorded.expected?.exclusions || []) {
    requireCheck(
      review.result.log.some(
        (entry) =>
          entry.account === expected.account &&
          !entry.counted &&
          entry.reason === expected.reason,
      ),
      "Missing expected declaration exclusion.",
    );
  }
  const altered = review.transfers.find(
    (entry) => entry.proposal.id === recorded.badProposalId,
  );
  requireCheck(
    altered?.proposal.status === "Rejected" &&
      !matchBudgetPayment(review, altered),
    "The altered payment was not rejected.",
  );
  const settlements = [];
  for (const payment of recorded.payments) {
    const entry = review.transfers.find(
      (item) => item.proposal.id === payment.proposalId,
    );
    requireCheck(
      entry && matchBudgetPayment(review, entry),
      "A settled payment differs from the mandate.",
    );
    const transfer = entry.proposal.kind.Transfer;
    const receipt = await findPaymentReceipt(
      {
        network: "testnet",
        dao: recorded.dao,
        id: payment.proposalId,
        recipient: transfer.receiver_id,
        amount: transfer.amount,
      },
      payment.transactionHash,
      payment.signer,
    );
    requireCheck(
      receipt === payment.receipt,
      "The payment receipt differs from the recorded receipt.",
    );
    settlements.push({ ...payment, receipt });
  }
  const evidence = evidenceForBudget(review, settlements);
  const digest = await fingerprintEvidence(evidence);
  requireCheck(
    digest === recorded.evidenceHash,
    "The reconstructed evidence digest differs.",
  );
  return {
    reference: recorded.reference,
    digest,
    represented: review.result.represented,
    exclusions: review.result.log.filter((entry) => !entry.counted),
    payments: settlements.length,
    review,
    settlements,
  };
}

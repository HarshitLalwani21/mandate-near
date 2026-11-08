async function fingerprintEvidence(evidence) {
  const bytes = new TextEncoder().encode(JSON.stringify(evidence));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function evidenceLink(review, baseUrl, settlements = []) {
  if (!BLOCK_HASH.test(review.block)) throw Error('A public round is required for a replay link.');
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = '';
  url.searchParams.set('network', review.network);
  url.searchParams.set('dao', review.dao);
  url.searchParams.set('id', review.proposal.id);
  url.searchParams.set('block', review.block);
  if (settlements.length)
    url.searchParams.set(
      'payments',
      JSON.stringify(
        settlements.map((payment) => ({
          requestId: payment.requestId,
          proposalId: payment.proposalId,
          transactionHash: payment.transactionHash,
          signer: payment.signer,
        })),
      ),
    );
  return url.toString();
}

function downloadJson(filename, content) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }),
  );
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function trezuRow(request) {
  if (!ACCOUNT.test(request.recipient)) throw Error('Invalid recipient.');
  return request.recipient + ',' + decimal(units(request.amount)) + '\r\n';
}

function socialEvidencePost(review, digest, link) {
  const policy =
    review.budget.round.identityPolicy === 'team-issued-testnet'
      ? 'Team-issued testnet credentials. All demo accounts are team controlled.'
      : 'Eligibility checked against the public identity registry.';
  return (
    'Mandate budget review\n' +
    review.budget.title +
    '\n' +
    policy +
    '\n' +
    review.result.represented +
    ' represented, quorum ' +
    review.result.quorum +
    '.\n' +
    review.result.requests
      .filter((request) => request.funded)
      .map((request) => request.id + ': ' + request.amount + ' NEAR to ' + request.recipient)
      .join('\n') +
    '\nReview block ' +
    review.block +
    '\nEvidence SHA-256 ' +
    digest +
    '\nRe-run ' +
    link
  );
}

function nearSocialArguments(text, postId) {
  if (!Number.isSafeInteger(postId) || postId <= 0) throw Error('Invalid near.social post ID.');
  if (typeof text !== 'string' || text.length > 25000)
    throw Error('The evidence post is too long.');
  return {
    receiverId: 'social',
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: '__fastdata_kv',
          args: { ['post/' + postId]: { text } },
          gas: '1000000000',
          deposit: '0',
        },
      },
    ],
  };
}

function trezuMemo(review, requestId) {
  const args = budgetPaymentArguments(review, requestId);
  return {
    recipient: args.proposal.kind.Transfer.receiver_id,
    amount: decimal(args.proposal.kind.Transfer.amount),
    asset: 'NEAR',
    notes: args.proposal.description,
    expectedSputnikDescription: '* Notes: ' + args.proposal.description,
  };
}

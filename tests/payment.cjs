/* Run with Node 22+. Use --testnet to replay the two archived public records. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const page = fs.readFileSync(path.join(__dirname, '..', 'payment.html'), 'utf8');
const application = ['core.js', 'payment.js']
  .map((name) => fs.readFileSync(path.join(__dirname, '..', 'src', name), 'utf8'))
  .join('\n');

// Only the document methods used by Mandate are needed for this offline test.
function element() {
  return {
    value: '',
    textContent: '',
    dataset: {},
    classList: { toggle() {} },
    append() {},
    replaceChildren() {},
    click() {
      if (!this.disabled) this.onclick?.();
    },
  };
}
const controls = new Map([...page.matchAll(/\bid="([^"]+)"/g)].map((m) => [m[1], element()]));
for (const [id, value] of Object.entries({
  mode: 'demo',
  net: 'testnet',
  choice: 'delegate',
  vp: '2',
  vk: '1',
}))
  controls.get(id).value = value;
const document = {
  body: element(),
  createElement: element,
  getElementById: (id) => controls.get(id),
};
const context = {
  document,
  TextEncoder,
  TextDecoder,
  btoa,
  atob,
  AbortSignal,
  URLSearchParams,
  location: { search: '' },
};
context.window = context;
const tests = async function () {
  function expect(ok, label) {
    if (!ok) throw Error(label);
  }

  el('restore').click();
  expect(!el('csv').disabled, 'matching demo');
  el('alias').click();
  expect(el('votes').textContent.includes('Credential already counted'), 'alias');
  el('scenario').value = 'missing';
  el('scenario').onchange();
  expect(el('csv').disabled, 'quorum');
  el('scenario').value = 'reserve';
  el('scenario').onchange();
  expect(el('csv').disabled, 'opposition');
  el('scenario').value = 'attack';
  el('scenario').onchange();
  expect(
    el('comparison').textContent.includes('pay 4 · reserve 3') &&
      el('votes').textContent.includes('pay 2 · reserve 3') &&
      el('csv').disabled,
    'split-wallet reversal',
  );
  const ballots = [{ account: 'asha.testnet', pay: 3, keep: 1 }];
  expect(!tally(demoRound, ballots, demoProof).passed, 'overspend');
  const snap = 'pinned',
    dao = 'example-dao.testnet',
    r = 'testnet/' + dao + '/7';
  const a = {
    kind: 'Vote',
    id: 7,
    status: 'Approved',
    submission_time: '100',
    description: JSON.stringify({
      ...sample,
      schema: 'treasury-mandate/v2',
      round: { ...demoRound, closesNs: '200' },
    }),
  };
  const b = (id, account) => ({
    kind: 'Vote',
    id,
    proposer: account,
    submission_time: '150',
    description: JSON.stringify({ schema: 'mandate-ballot/v1', reference: r, pay: 2, keep: 1 }),
  });
  const intervening = [b(8, 'asha.testnet'), b(9, 'asha-alt.testnet'), b(10, 'ben.testnet')];
  const p = {
    kind: { Transfer: { token_id: '', receiver_id: sample.recipient, amount: units('30') } },
    id: 11,
    status: 'InProgress',
    submission_time: '201',
    description: JSON.stringify({
      schema: 'treasury-request/v1',
      reference: r,
      purpose: sample.purpose,
    }),
  };
  let proofs = new Map(demoProof);
  window.fetch = async (url, opts) => {
    const params = JSON.parse(opts.body).params,
      args = JSON.parse(atob(params.args_base64));
    expect(
      params.block_id === snap || (params.finality === 'final' && args.id === 7),
      'block mismatch',
    );
    let data;
    if (params.method_name === 'get_proposal') data = args.id === 7 ? a : p;
    else if (params.method_name === 'get_proposals') data = intervening;
    else {
      expect(
        params.account_id === REGISTRIES.testnet && params.method_name === 'is_human',
        'bad registry',
      );
      data = proofs.get(args.account);
    }
    return {
      ok: true,
      json: async () => ({
        result: { block_hash: snap, result: [...new TextEncoder().encode(JSON.stringify(data))] },
      }),
    };
  };
  el('mode').value = 'live';
  reset();
  el('dao').value = dao;
  el('aid').value = '7';
  el('pid').value = '11';
  const read = () => el('fetch').onclick();
  await read();
  expect(!el('review').hidden && !el('csv').disabled, 'v2 pass: ' + el('rpcstatus').textContent);
  expect(el('votes').textContent.includes('Credential already counted'), 'alias in live reader');
  proofs.set('ben.testnet', []);
  await read();
  expect(!el('review').hidden && el('csv').disabled, 'unverified member');
  proofs.set('ben.testnet', demoProof.get('ben.testnet'));
  p.kind.Transfer.amount = units('31');
  await read();
  expect(el('csv').disabled, 'tampering');
  intervening.pop();
  await read();
  expect(el('review').hidden, 'incomplete history');

  const identityHash = '4'.repeat(44);
  let snapshotTime = '90';
  a.description = JSON.stringify({
    ...sample,
    schema: 'treasury-mandate/v3',
    round: { ...demoRound, identityBlock: identityHash, closesNs: '200' },
  });
  const delegation = { schema: 'mandate-delegation/v1', reference: r, delegate: 'ben.testnet' };
  intervening[0].description = JSON.stringify(delegation);
  intervening.push(b(10, 'ben.testnet'));
  p.kind.Transfer.amount = units('30');
  p.status = 'Approved';
  const previous = window.fetch;
  window.fetch = async (url, options) => {
    const { method, params } = JSON.parse(options.body);
    expect(url === 'https://archival-rpc.testnet.near.org', 'archive endpoint');
    if (method === 'block') {
      expect(params.block_id === identityHash, 'expected snapshot block');
      return {
        ok: true,
        json: async () => ({
          result: { header: { hash: identityHash, timestamp_nanosec: snapshotTime } },
        }),
      };
    }
    if (params.method_name === 'is_human') {
      expect(params.block_id === identityHash, 'proof queried at wrong block');
      const args = JSON.parse(atob(params.args_base64));
      const data = proofs.get(args.account);
      return {
        ok: true,
        json: async () => ({
          result: {
            block_hash: identityHash,
            result: [...new TextEncoder().encode(JSON.stringify(data))],
          },
        }),
      };
    }
    return previous(url, options);
  };
  await read();
  expect(
    !el('review').hidden &&
      !el('csv').disabled &&
      el('votes').textContent.includes('2 represented / quorum 2 · pay 4 · reserve 2'),
    'delegation: ' + el('rpcstatus').textContent,
  );
  expect(
    el('votes').textContent.includes('Credential already counted'),
    'delegating alias duplicate',
  );
  intervening[2].description = JSON.stringify({ ...delegation, delegate: 'asha.testnet' });
  await read();
  expect(
    !el('review').hidden && el('csv').disabled && el('votes').textContent.includes('0 represented'),
    'cycle',
  );
  intervening[2] = b(10, 'ben.testnet');
  intervening[2].submission_time = '200';
  await read();
  expect(!el('review').hidden && el('csv').disabled, 'deadline is exclusive');
  intervening[2].submission_time = '150';
  intervening[1] = { ...p, id: 9, status: 'InProgress' };
  await read();
  expect(
    el('review').hidden && el('rpcstatus').textContent.includes('Earlier transfer #9'),
    'reused mandate',
  );
  intervening[1].status = 'Rejected';
  await read();
  expect(!el('review').hidden && !el('csv').disabled, 'rejected transfer');
  snapshotTime = '101';
  await read();
  expect(
    el('review').hidden && el('rpcstatus').textContent.includes('identity snapshot'),
    'future snapshot',
  );
  snapshotTime = '90';
  const voteReader = window.fetch;
  let now = '201';
  window.fetch = async (url, opts) => {
    const { method, params } = JSON.parse(opts.body);
    if (method === 'block' && params.block_id === snap)
      return {
        ok: true,
        json: async () => ({ result: { header: { hash: snap, timestamp_nanosec: now } } }),
      };
    if (params.method_name === 'get_last_proposal_id') {
      expect(params.block_id === snap && params.account_id === dao, 'payout history snapshot');
      return {
        ok: true,
        json: async () => ({
          result: { block_hash: snap, result: [...new TextEncoder().encode('11')] },
        }),
      };
    }
    return voteReader(url, opts);
  };
  el('pid').value = '';
  const make = () => el('makeTransfer').onclick();
  await make();
  const output = JSON.parse(el('transferArguments').textContent).proposal;
  expect(
    output.kind.Transfer.receiver_id === sample.recipient &&
      output.kind.Transfer.amount === units('30') &&
      JSON.parse(output.description).reference === r,
    'approved payment preparation',
  );
  now = '199';
  await make();
  expect(
    !el('transferArguments').textContent && el('rpcstatus').textContent.includes('still open'),
    'open round',
  );
  now = '201';
  intervening[1].status = 'Approved';
  await make();
  expect(
    !el('transferArguments').textContent &&
      el('rpcstatus').textContent.includes('Earlier transfer'),
    'prior payment',
  );
  intervening[1].status = 'Rejected';
  proofs.set('ben.testnet', []);
  await make();
  expect(
    !el('transferArguments').textContent &&
      el('rpcstatus').textContent.includes('did not authorize'),
    'insufficient eligible votes',
  );
  el('ballotRef').value = r;
  el('delegateTo').value = 'ben.testnet';
  compose();
  expect(
    !el('downloadVote').disabled &&
      JSON.parse(prepared.proposal.description).delegate === 'ben.testnet',
    'delegate composer',
  );
  el('choice').value = 'vote';
  el('vp').value = '3';
  el('vk').value = '1';
  compose();
  expect(el('downloadVote').disabled, 'composer over budget');
  el('vk').value = '0';
  compose();
  expect(
    !el('downloadVote').disabled && JSON.parse(prepared.proposal.description).pay === 3,
    'vote composer',
  );
  el('ballotRef').value = 'garbled';
  compose();
  expect(el('downloadVote').disabled, 'reference validation');
  const claim = { dao, id: 11, recipient: sample.recipient, amount: units('30') };
  const sender = 'ben.testnet',
    hash = '4'.repeat(44);
  const receiptRecord = {
    final_execution_status: 'FINAL',
    status: { SuccessValue: '' },
    transaction: {
      signer_id: sender,
      receiver_id: dao,
      hash,
      actions: [
        {
          FunctionCall: {
            method_name: 'act_proposal',
            args: btoa(JSON.stringify({ id: 11, action: 'VoteApprove' })),
          },
        },
      ],
    },
    transaction_outcome: { outcome: { receipt_ids: ['approve'] } },
    receipts: [
      {
        receipt_id: 'paid',
        predecessor_id: dao,
        receiver_id: sample.recipient,
        receipt: { Action: { actions: [{ Transfer: { deposit: claim.amount } }] } },
      },
    ],
    receipts_outcome: [
      {
        id: 'approve',
        outcome: { executor_id: dao, status: { SuccessValue: '' }, receipt_ids: ['paid'] },
      },
      {
        id: 'paid',
        outcome: { executor_id: sample.recipient, status: { SuccessValue: '' }, receipt_ids: [] },
      },
    ],
  };
  expect(checkPaymentReceipt(receiptRecord, claim, hash, sender) === 'paid', 'linked settlement');
  function rejects(record, expected = claim) {
    try {
      checkPaymentReceipt(record, expected, hash, sender);
      return false;
    } catch {
      return true;
    }
  }
  expect(rejects(receiptRecord, { ...claim, id: 12 }), 'wrong proposal ID');
  expect(rejects(receiptRecord, { ...claim, amount: units('31') }), 'wrong receipt amount');
  expect(
    rejects({ ...receiptRecord, final_execution_status: 'EXECUTED_OPTIMISTIC' }),
    'pending finality',
  );
  expect(
    rejects({
      ...receiptRecord,
      receipts_outcome: [
        receiptRecord.receipts_outcome[0],
        { id: 'paid', outcome: { executor_id: sample.recipient, status: { Failure: {} } } },
      ],
    }),
    'failed recipient receipt',
  );
  expect(
    rejects({ ...receiptRecord, transaction_outcome: { outcome: { receipt_ids: ['unrelated'] } } }),
    'unrelated receipt',
  );
  expect(
    rejects({
      ...receiptRecord,
      receipts: [{ ...receiptRecord.receipts[0], predecessor_id: 'system' }],
    }),
    'refund receipt',
  );
  el('roundNet').value = 'testnet';
  el('roundDao').value = dao;
  el('roundPayee').value = sample.recipient;
  el('roundPurpose').value = sample.purpose;
  el('roundAmount').value = '30';
  el('roundClose').value = '2030-03-02T11:30';
  el('roundQuorum').value = '2';
  el('roundMembers').value = 'asha.testnet,ben.testnet';
  window.fetch = async (url, options) => {
    const { method, params } = JSON.parse(options.body);
    const member = method === 'query' ? JSON.parse(atob(params.args_base64)).account : null;
    if (method === 'block')
      return {
        ok: true,
        json: async () => ({
          result: { header: { hash: identityHash, timestamp_nanosec: '100' } },
        }),
      };
    if (member) expect(params.block_id === identityHash, 'enrollment snapshot');
    const value = member ? proofs.get(member) : { proposal_bond: '0' };
    return {
      ok: true,
      json: async () => ({
        result: {
          block_hash: identityHash,
          result: [...new TextEncoder().encode(JSON.stringify(value))],
        },
      }),
    };
  };
  await el('enroll').onclick();
  expect(!el('openRoundArgs').textContent, 'insufficient eligible roster');
  proofs.set('ben.testnet', demoProof.get('ben.testnet'));
  await el('enroll').onclick();
  expect(
    JSON.parse(JSON.parse(el('openRoundArgs').textContent).proposal.description).round
      .identityBlock === identityHash,
    'creation binds the eligibility snapshot',
  );
  el('roundMembers').value += ',asha-alt.testnet';
  await el('enroll').onclick();
  expect(
    !el('openRoundArgs').textContent &&
      el('enrollment').textContent.includes('shares a credential'),
    'overlapping roster',
  );
};
const online = process.argv.includes('--testnet');
if (online) context.fetch = fetch;
const entry = online
  ? 'Promise.all([replayTestnetRecords(),replayPublicPayment()]).then(results=>results.join("\\n"))'
  : '(' + tests.toString() + ')()';
const run = vm.runInNewContext(application + '\n' + entry, context);
run
  .then((result) =>
    console.log(
      online
        ? result
        : 'Passed: ballots, delegated payouts, duplicate requests, roster eligibility, proposal preparation and settlement receipt verification.',
    ),
  )
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });

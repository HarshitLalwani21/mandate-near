const el = (id) => document.getElementById(id);
const sample = {
  schema: 'treasury-mandate/v1',
  asset: 'NEAR',
  recipient: 'translations.testnet',
  amount: '30',
  purpose: 'Translate the onboarding guide',
};
const sampleRef = 'testnet/example-dao.testnet/7';
const demoRound = {
  members: ['asha.testnet', 'asha-alt.testnet', 'ben.testnet'],
  quorum: 2,
  closesNs: '1800000000000000000',
};
const demoProof = new Map([
  ['asha.testnet', [['issuer.testnet', [7]]]],
  ['asha-alt.testnet', [['issuer.testnet', [7]]]],
  ['ben.testnet', [['issuer.testnet', [8]]]],
]);
let authorization = null,
  extraBallot = false;
function showTally(result) {
  authorization = result;
  el('votes').textContent = result.summary + '\n' + result.log.join('\n');
}
function runDemoRound() {
  const votes = [
    { account: 'asha.testnet', pay: 3, keep: 0 },
    { account: 'ben.testnet', pay: 2, keep: 1 },
  ];
  if (extraBallot) votes.push({ account: 'asha-alt.testnet', pay: 3, keep: 0 });
  if (el('scenario').value === 'missing') votes.splice(1, 1);
  if (el('scenario').value === 'reserve') votes[0] = { account: 'asha.testnet', pay: 0, keep: 3 };
  if (['delegated', 'absent'].includes(el('scenario').value))
    votes[0] = { account: 'asha.testnet', delegate: 'ben.testnet' };
  if (el('scenario').value === 'absent') votes.splice(1, 1);
  const compare = el('scenario').value === 'attack';
  el('comparison').hidden = !compare;
  el('alias').disabled = compare;
  if (compare) {
    votes.splice(
      0,
      votes.length,
      { account: 'asha.testnet', pay: 2, keep: 0 },
      { account: 'ben.testnet', pay: 0, keep: 3 },
      { account: 'asha-alt.testnet', pay: 2, keep: 0 },
    );
    const walletProofs = new Map(
      votes.map((vote, index) => [vote.account, [['issuer.testnet', [index + 1]]]]),
    );
    const walletCount = tallyDelegated(demoRound, votes, walletProofs);
    el('comparison').textContent =
      'If every wallet got nine credits: ' +
      walletCount.summary +
      '. The payout would pass. Asha’s two accounts share a credential, so the verified result above retains the funds.';
  }
  showTally(tallyDelegated(demoRound, votes, demoProof));
  update();
}
const fields = ['recipient', 'amount', 'purpose', 'ref'];
let mandate,
  reference,
  revision = 0,
  reviewedPayment,
  receiptRevision = 0;
function baseline(m, r, v, src) {
  mandate = m;
  reference = r;
  el('source').textContent = src;
  el('baseline').replaceChildren();
  for (const [label, value] of Object.entries({
    Purpose: m.purpose,
    Recipient: m.recipient,
    Amount: m.amount + ' NEAR',
    Reference: r,
  })) {
    const dt = document.createElement('dt'),
      dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    el('baseline').append(dt, dd);
  }
  el('votes').textContent = v;
  el('review').hidden = false;
}
function setDraft(d) {
  for (const f of fields) el(f).value = d[f === 'ref' ? 'reference' : f];
  update();
}
function update() {
  if (!mandate) return;
  const checks = inspect(mandate, reference, {
    amount: el('amount').value,
    recipient: el('recipient').value,
    asset: 'NEAR',
    purpose: el('purpose').value,
    reference: el('ref').value,
  });
  if (authorization) checks.unshift(['Credentialed ballot result', authorization.passed]);
  const failed = checks.filter((c) => !c[1]).map((c) => c[0]);
  el('checks').replaceChildren(
    ...checks.map(([label, ok]) => {
      const li = document.createElement('li');
      li.textContent = label + ' — ' + (ok ? 'matches' : 'differs');
      return li;
    }),
  );
  const reasons = [];
  if (authorization && !authorization.passed)
    reasons.push(authorization.reason || 'Members did not authorize payment');
  if (failed.includes('Amount'))
    reasons.push(
      'the request asks for ' +
        el('amount').value +
        ' NEAR and the mandate authorizes ' +
        mandate.amount +
        ' NEAR',
    );
  for (const item of failed.filter(
    (item) => item !== 'Amount' && item !== 'Credentialed ballot result',
  ))
    reasons.push(item + ' differs');
  el('verdict').textContent = failed.length
    ? 'Hold · ' + reasons.join(' · ')
    : authorization
      ? 'Member authorization and payment details match'
      : 'Payment details match · legacy approval only';
  el('verdict').classList.toggle('pass', !failed.length);
  el('csv').disabled = !!failed.length;
  if (el('mode').value === 'demo')
    el('exampleArguments').textContent = failed.length
      ? 'Payment on hold. ' + failed.join(', ')
      : JSON.stringify(paymentArguments(mandate, reference), null, 2);
}
function reset() {
  reviewedPayment = null;
  el('settlement').hidden = true;
  clearReceipt();
  el('exampleAction').hidden = el('mode').value !== 'demo';
  el('transferArguments').textContent = '';
  revision++;
  mandate = null;
  authorization = null;
  extraBallot = false;
  let live = el('mode').value === 'live';
  el('live').hidden = !live;
  el('review').hidden = live;
  el('dup').hidden = live;
  el('restore').hidden = live;
  el('rpcstatus').textContent = '';
  el('aliasResult').textContent = '';
  for (const f of fields) el(f).readOnly = live;
  if (!live) {
    baseline(sample, sampleRef, '', 'Simulated member approval');
    el('requestSource').textContent = 'Editable example';
    el('note').textContent = 'Example export contains fictional testnet data.';
    el('scenario').value = 'delegated';
    setDraft({ ...sample, amount: '40', reference: sampleRef });
    runDemoRound();
  }
}
el('fetch').onclick = async () => {
  reset();
  const ticket = revision;
  try {
    const dao = el('dao').value.trim(),
      network = el('net').value,
      a = el('aid').value,
      p = el('pid').value;
    if (!ACCOUNT.test(dao) || a === p)
      throw Error('Enter a DAO account and two different proposal IDs.');
    el('rpcstatus').textContent = 'Reading finalized proposals…';
    const approval = await rpcProposal(network, dao, a),
      payment = await rpcProposal(network, dao, p, approval.block);
    if (ticket !== revision) return;
    const m = readMandate(approval.data),
      d = parseRequest(payment.data),
      r = [network, dao, approval.data.id].join('/');
    if (payment.data.id <= approval.data.id || payment.block !== approval.block)
      throw Error('The payment must follow its mandate and share the same snapshot.');
    const result =
      m.schema !== 'treasury-mandate/v1'
        ? await readRound(
            network,
            dao,
            approval.data,
            payment.data.id,
            payment.data.submission_time,
            r,
            approval.block,
            m.round,
            m.schema === 'treasury-mandate/v3',
          )
        : null;
    if (ticket !== revision) return;
    baseline(m, r, JSON.stringify(approval.data.votes, null, 2), 'Approved Sputnik Vote');
    if (result) showTally(result);
    el('requestSource').textContent = payment.data.status + ' transfer #' + p;
    el('note').textContent =
      'This transfer proposal already exists. The export is for reconciliation.';
    setDraft(d);
    el('rpcstatus').textContent =
      'Review block ' +
      approval.block +
      (m.schema === 'treasury-mandate/v3' ? ' · Identity block ' + m.round.identityBlock : '');
    if (result?.passed && !el('csv').disabled && payment.data.status === 'Approved') {
      reviewedPayment = {
        network,
        dao,
        id: payment.data.id,
        recipient: d.recipient,
        amount: units(d.amount),
      };
      el('settlement').hidden = false;
    }
  } catch (error) {
    if (ticket === revision)
      el('rpcstatus').textContent = 'Could not complete review. ' + error.message;
  }
};
function showDemoCase(attack) {
  el('mode').value = 'demo';
  reset();
  if (attack) {
    el('scenario').value = 'attack';
    el('scenario').onchange();
    el('restore').click();
  }
  el('review').scrollIntoView({ block: 'start' });
}
el('tryAlias').onclick = () => showDemoCase(true);
el('tryAmount').onclick = () => showDemoCase(false);
el('trySettlement').onclick = () => {
  el('historicalPayment').open = true;
  el('historicalPayment').scrollIntoView({ block: 'center' });
  el('paidReplay').click();
};
function clearReceipt() {
  receiptRevision++;
  el('settled').textContent = '';
  el('explorer').hidden = true;
}
for (const id of ['txHash', 'txSigner']) el(id).oninput = clearReceipt;
el('trace').onclick = async () => {
  clearReceipt();
  if (!reviewedPayment) return;
  const ticket = receiptRevision,
    payment = reviewedPayment,
    hash = el('txHash').value.trim();
  el('settled').textContent = 'Following the approval and its transfer receipt…';
  try {
    const receipt = await findPaymentReceipt(payment, hash, el('txSigner').value.trim());
    if (ticket !== receiptRevision) return;
    el('settled').textContent =
      'Settled · ' +
      decimal(payment.amount) +
      ' NEAR to ' +
      payment.recipient +
      '\nReceipt ' +
      receipt;
    el('explorer').href =
      'https://' + (payment.network === 'testnet' ? 'testnet.' : '') + 'nearblocks.io/txns/' + hash;
    el('explorer').hidden = false;
  } catch (error) {
    if (ticket === receiptRevision)
      el('settled').textContent = 'Settlement unverified. ' + error.message;
  }
};
let enrollmentRevision = 0;
function clearEnrollment() {
  enrollmentRevision++;
  el('enrollment').textContent = '';
  el('openRoundArgs').textContent = '';
}
for (const id of [
  'roundNet',
  'roundDao',
  'roundPayee',
  'roundPurpose',
  'roundAmount',
  'roundClose',
  'roundMembers',
  'roundQuorum',
])
  el(id).oninput = clearEnrollment;
el('enroll').onclick = async () => {
  clearEnrollment();
  const ticket = enrollmentRevision;
  try {
    const network = el('roundNet').value,
      dao = el('roundDao').value.trim(),
      recipient = el('roundPayee').value.trim();
    const purpose = el('roundPurpose').value.trim(),
      amount = el('roundAmount').value.trim();
    const closes = new Date(el('roundClose').value).getTime();
    if (!ACCOUNT.test(dao) || !ACCOUNT.test(recipient) || !purpose || !Number.isFinite(closes))
      throw Error('Enter a DAO, a recipient, a purpose and a voting deadline.');
    units(amount);
    const round = {
      members: el('roundMembers')
        .value.split(',')
        .map((s) => s.trim()),
      quorum: Number(el('roundQuorum').value),
      closesNs: (BigInt(closes) * 1000000n).toString(),
    };
    checkRound(round);
    el('enrollment').textContent = 'Reading the DAO policy and member credentials…';
    const { data: policy, block } = await readView(network, dao, 'get_policy', {});
    if (typeof policy?.proposal_bond !== 'string' || !/^\d+$/.test(policy.proposal_bond))
      throw Error('The DAO did not return a proposal bond.');
    const { header } = await callRpc(network, 'block', { block_id: block });
    if (header?.hash !== block || BigInt(header.timestamp_nanosec) >= BigInt(round.closesNs))
      throw Error('Choose a deadline after the finalized block.');
    round.identityBlock = block;
    const proofs = await readProofs(network, round.members, block);
    if (ticket !== enrollmentRevision) return;
    const seen = new Set(),
      rows = [];
    let eligible = 0,
      overlap = false;
    for (const member of round.members) {
      const ids = proofIds(proofs.get(member));
      const repeated = ids.some((id) => seen.has(id));
      if (repeated) overlap = true;
      else if (ids.length) eligible++;
      ids.forEach((id) => seen.add(id));
      rows.push(
        member +
          ' · ' +
          (repeated
            ? 'shares a credential in this roster'
            : ids.length
              ? 'eligible'
              : 'no eligible credential'),
      );
    }
    const summary = rows.join('\n') + '\nSnapshot ' + block;
    if (overlap || eligible < round.quorum) {
      el('enrollment').textContent = summary + '\nReview the roster before opening the round.';
      return;
    }
    const m = { schema: 'treasury-mandate/v3', asset: 'NEAR', recipient, amount, purpose, round };
    el('enrollment').textContent =
      summary +
      '\nSubmit add_proposal to ' +
      dao +
      ' with its required bond of ' +
      decimal(policy.proposal_bond) +
      ' NEAR.';
    el('openRoundArgs').textContent = JSON.stringify(
      { proposal: { kind: 'Vote', description: JSON.stringify(m) } },
      null,
      2,
    );
  } catch (error) {
    if (ticket === enrollmentRevision)
      el('enrollment').textContent = 'Round preparation stopped. ' + error.message;
  }
};
async function replayPublicPayment() {
  const network = 'testnet',
    dao = 'testnet-demo-74ohgb.sputnikv2.testnet',
    id = 0;
  const signer = 'bob_cm.commons-spike-mw75h7o0.testnet',
    hash = '764sHLfGmpvzDrHyGA8uFsLJRL9xUhPTf63oaYpRf2HF';
  const { data } = await rpcProposal(
    network,
    dao,
    '0',
    '7GwX5DbbJvwJ9q4tEL6Y8fzvLhyH99K8oznowUirvaUg',
  );
  const transfer = data.kind?.Transfer;
  if (
    data.status !== 'Approved' ||
    transfer?.token_id !== '' ||
    transfer.msg != null ||
    transfer.amount !== units('0.1') ||
    transfer.receiver_id !== signer
  )
    throw Error('Unexpected historical proposal.');
  const receipt = await findPaymentReceipt(
    { network, dao, id, recipient: transfer.receiver_id, amount: transfer.amount },
    hash,
    signer,
  );
  return (
    'Proposal #0 · ' +
    dao +
    '\nSettled · 0.1 testnet NEAR to ' +
    transfer.receiver_id +
    '\nReceipt ' +
    receipt
  );
}
el('paidReplay').onclick = async () => {
  el('paidReplay').disabled = true;
  el('paidResult').textContent = 'Reading the public proposal and transfer receipts…';
  try {
    el('paidResult').textContent = await replayPublicPayment();
  } catch (error) {
    el('paidResult').textContent = 'Settlement unverified. ' + error.message;
  } finally {
    el('paidReplay').disabled = false;
  }
};
async function preparePayment(network, dao, id) {
  if (!ACCOUNT.test(dao)) throw Error('Enter the trusted DAO account.');
  const approval = await rpcProposal(network, dao, id);
  const m = readMandate(approval.data);
  if (m.schema !== 'treasury-mandate/v3') throw Error('Preparing a payment requires a v3 mandate.');
  const reference = [network, dao, approval.data.id].join('/');
  const [blockInfo, next] = await Promise.all([
    callRpc(network, 'block', { block_id: approval.block }),
    readView(network, dao, 'get_last_proposal_id', {}, approval.block),
  ]);
  const header = blockInfo.header;
  if (
    header?.hash !== approval.block ||
    typeof header.timestamp_nanosec !== 'string' ||
    !/^[0-9]+$/.test(header.timestamp_nanosec)
  )
    throw Error('Could not verify the voting deadline.');
  if (BigInt(header.timestamp_nanosec) < BigInt(m.round.closesNs))
    throw Error('Voting is still open.');
  const result = await readRound(
    network,
    dao,
    approval.data,
    next.data,
    header.timestamp_nanosec,
    reference,
    approval.block,
    m.round,
    true,
  );
  if (!result.passed) throw Error('The member vote did not authorize payment. ' + result.summary);
  return { args: paymentArguments(m, reference), block: approval.block, result };
}
el('makeTransfer').onclick = async () => {
  reset();
  const ticket = revision;
  try {
    if (el('pid').value.trim())
      throw Error('Review the existing payment or clear its ID to prepare a new request.');
    el('rpcstatus').textContent =
      'Checking the closed vote and scanning for earlier payment requests…';
    const draft = await preparePayment(
      el('net').value,
      el('dao').value.trim(),
      el('aid').value.trim(),
    );
    if (ticket !== revision) return;
    el('transferArguments').textContent = JSON.stringify(draft.args, null, 2);
    el('rpcstatus').textContent =
      draft.result.summary +
      ' · Unsigned add_proposal arguments at block ' +
      draft.block +
      '. Check again before filing. The DAO must approve and execute this transfer.';
  } catch (error) {
    if (ticket === revision) el('rpcstatus').textContent = 'No payment prepared. ' + error.message;
  }
};
el('alias').onclick = () => {
  extraBallot = true;
  runDemoRound();
  el('aliasResult').textContent =
    'Both accounts presented the same demo credential. See the excluded alias in the authorization record.';
};
el('scenario').onchange = () => {
  extraBallot = false;
  el('aliasResult').textContent = '';
  runDemoRound();
};
el('restore').onclick = () => setDraft({ ...mandate, reference });
el('csv').onclick = () => {
  update();
  if (el('csv').disabled) return;
  const link = document.createElement('a');
  const url = URL.createObjectURL(
    new Blob([mandate.recipient + ',' + decimal(units(mandate.amount)) + '\r\n'], {
      type: 'text/csv',
    }),
  );
  link.href = url;
  link.download = el('mode').value === 'demo' ? 'example-trezu.csv' : 'reviewed-trezu.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
async function replayTestnetRecords() {
  const block = '5g4bmJDpUcGGSriG16Z5EKQKiVE2Q6aG7bbqtHVCK4Uq';
  const dao = 'genesis.sputnik-v2.testnet';
  const registry = REGISTRIES.testnet;
  const [proposal, identity] = await Promise.all([
    rpcProposal('testnet', dao, '0', block),
    readView('testnet', registry, 'is_human', { account: registry }, block),
  ]);
  if (!proposal.data.kind?.AddMemberToRole || proofIds(identity.data).length !== 0)
    throw Error('The historical records differ from the expected example.');
  return (
    'Sputnik · ' +
    dao +
    ' · proposal #0 · ' +
    proposal.data.description +
    '\n' +
    'Identity registry · ' +
    registry +
    ' · no eligible credential for its own account\n' +
    'Testnet block 276747286 · ' +
    block
  );
}
el('replay').onclick = async () => {
  el('replay').disabled = true;
  el('replayResult').textContent = 'Reading testnet records…';
  try {
    el('replayResult').textContent = await replayTestnetRecords();
  } catch (error) {
    el('replayResult').textContent = 'Public records unavailable. ' + error.message;
  } finally {
    el('replay').disabled = false;
  }
};
let prepared = null;
function compose() {
  const delegated = el('choice').value === 'delegate';
  el('delegateInputs').hidden = !delegated;
  el('directInputs').hidden = delegated;
  prepared = null;
  el('proposalText').textContent = '';
  el('downloadVote').disabled = true;
  const ref = el('ballotRef').value.trim(),
    [net, dao, id, ...rest] = ref.split('/');
  const message = (s) => (el('composerStatus').textContent = s);
  if (
    rest.length ||
    !['testnet', 'mainnet'].includes(net) ||
    !dao ||
    !ACCOUNT.test(dao) ||
    !id ||
    !/^(0|[1-9]\d*)$/.test(id) ||
    !Number.isSafeInteger(Number(id))
  )
    return message('Enter the network, DAO account and mandate proposal ID.');
  const b = { schema: delegated ? 'mandate-delegation/v1' : 'mandate-ballot/v1', reference: ref };
  if (delegated) {
    b.delegate = el('delegateTo').value.trim();
    if (!ACCOUNT.test(b.delegate)) return message('Enter an enrolled representative account.');
    message('The representative must cast a direct ballot for this same mandate.');
  } else {
    const pay = el('vp').value,
      keep = el('vk').value;
    if (!/^[0-3]$/.test(pay) || !/^[0-3]$/.test(keep))
      return message('Choose whole vote counts from zero to three.');
    b.pay = Number(pay);
    b.keep = Number(keep);
    const cost = b.pay ** 2 + b.keep ** 2;
    if (cost > 9) return message('This allocation costs ' + cost + ' credits. Nine are available.');
    message(cost + ' of nine credits used.');
  }
  prepared = { proposal: { description: JSON.stringify(b), kind: 'Vote' } };
  el('proposalText').textContent = JSON.stringify(prepared, null, 2);
  el('downloadVote').disabled = false;
}
for (const id of ['choice', 'ballotRef', 'delegateTo', 'vp', 'vk']) el(id).oninput = compose;
el('downloadVote').onclick = () => {
  compose();
  if (!prepared) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(prepared, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'sputnik-vote-arguments.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
compose();
el('mode').onchange = reset;
for (const id of ['net', 'dao', 'aid', 'pid']) el(id).oninput = reset;
for (const f of fields) el(f).oninput = update;
el('formats').textContent =
  JSON.stringify(
    {
      ...sample,
      schema: 'treasury-mandate/v3',
      round: { ...demoRound, identityBlock: 'REPLACE_WITH_FINALIZED_BLOCK_HASH' },
    },
    null,
    2,
  ) +
  '\n\nBallot Vote description\n' +
  JSON.stringify({ schema: 'mandate-ballot/v1', reference: sampleRef, pay: 2, keep: 1 }, null, 2) +
  '\n\nDelegation Vote description\n' +
  JSON.stringify(
    { schema: 'mandate-delegation/v1', reference: sampleRef, delegate: 'ben.testnet' },
    null,
    2,
  ) +
  '\n\nTransfer description\n' +
  JSON.stringify(
    { schema: 'treasury-request/v1', reference: sampleRef, purpose: sample.purpose },
    null,
    2,
  );
reset();
if (new URLSearchParams(location.search).get('example') === 'split-wallet') {
  el('scenario').value = 'attack';
  el('scenario').onchange();
  el('restore').click();
}

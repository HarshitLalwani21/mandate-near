// Amounts in a Sputnik Transfer are integer strings in yoctoNEAR.
const SCALE = 10n ** 24n;
const ACCOUNT = /^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
function units(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,38})(\.\d{1,24})?$/.test(value))
    throw Error('Enter a positive NEAR amount with at most 24 decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const result = BigInt(whole) * SCALE + BigInt(fraction.padEnd(24, '0'));
  if (result <= 0n || result >= 2n ** 128n)
    throw Error('Amount outside the supported transfer range.');
  return result.toString();
}
function decimal(value) {
  const n = BigInt(value);
  const tail = (n % SCALE).toString().padStart(24, '0').replace(/0+$/, '');
  return (n / SCALE).toString() + (tail ? '.' + tail : '');
}
function readMandate(proposal) {
  if (proposal.kind !== 'Vote' || proposal.status !== 'Approved')
    throw Error('Select an approved Sputnik Vote proposal.');
  const m = JSON.parse(proposal.description);
  if (
    !['treasury-mandate/v1', 'treasury-mandate/v2', 'treasury-mandate/v3'].includes(m.schema) ||
    m.asset !== 'NEAR' ||
    typeof m.recipient !== 'string' ||
    !ACCOUNT.test(m.recipient) ||
    typeof m.purpose !== 'string' ||
    !m.purpose.trim()
  )
    throw Error('This vote does not contain a supported NEAR payment mandate.');
  units(m.amount);
  return m;
}
function inspect(m, reference, draft) {
  let amount;
  try {
    amount = units(draft.amount);
  } catch {
    amount = null;
  }
  return [
    ['Authorization', draft.reference === reference],
    ['Purpose', draft.purpose === m.purpose],
    ['Asset', draft.asset === m.asset],
    ['Recipient', draft.recipient === m.recipient],
    ['Amount', amount === units(m.amount)],
  ];
}
function parseRequest(p) {
  const t = p.kind?.Transfer;
  if (!t || !['InProgress', 'Approved'].includes(p.status) || t.token_id !== '' || t.msg != null)
    throw Error('Select a pending or approved native NEAR Transfer without a transfer message.');
  const d = JSON.parse(p.description);
  if (
    d.schema !== 'treasury-request/v1' ||
    typeof d.reference !== 'string' ||
    typeof d.purpose !== 'string'
  )
    throw Error(
      'Request description must contain the reference and purpose in the documented format.',
    );
  if (typeof t.amount !== 'string' || !/^[1-9]\d{0,38}$/.test(t.amount))
    throw Error('Invalid transfer amount.');
  return {
    reference: d.reference,
    purpose: d.purpose,
    asset: 'NEAR',
    recipient: t.receiver_id,
    amount: decimal(t.amount),
  };
}
function demoBallot(registry, ledger, account, votes) {
  const member = registry.find((x) => x.account === account);
  if (!member || !Number.isInteger(votes) || votes === 0 || votes * votes > member.credits)
    throw Error('Vote exceeds the member’s voice credits.');
  if (ledger.has(member.memberId))
    throw Error('Duplicate member. The first ballot is already recorded.');
  ledger.set(member.memberId, { account, votes });
}

const REGISTRIES = {
  mainnet: 'registry.i-am-human.near',
  testnet: 'registry-unstable-v2.i-am-human.testnet',
};
// A v2 mandate freezes the electorate, the deadline and the required quorum.
function checkRound(round) {
  if (
    !round ||
    !Array.isArray(round.members) ||
    !round.members.length ||
    round.members.length > 100 ||
    round.members.some((a) => typeof a !== 'string' || !ACCOUNT.test(a)) ||
    new Set(round.members).size !== round.members.length ||
    !Number.isInteger(round.quorum) ||
    round.quorum < 1 ||
    round.quorum > round.members.length ||
    typeof round.closesNs !== 'string' ||
    !/^[1-9]\d{0,19}$/.test(round.closesNs)
  ) {
    throw Error('Invalid electorate, quorum or ballot deadline.');
  }
}
function proofIds(proof) {
  if (!Array.isArray(proof)) throw Error('Unrecognized registry response.');
  const ids = new Set();
  for (const item of proof) {
    if (
      !Array.isArray(item) ||
      item.length !== 2 ||
      typeof item[0] !== 'string' ||
      !ACCOUNT.test(item[0]) ||
      !Array.isArray(item[1]) ||
      !item[1].length
    )
      throw Error('Malformed identity credential.');
    for (const token of item[1]) {
      if (!Number.isSafeInteger(token) || token <= 0) throw Error('Invalid credential number.');
      ids.add(item[0] + '/' + token);
    }
  }
  return [...ids];
}
// Each identity contributes its own nine-credit allocation. A delegation
// copies a named representative's direct choice for this mandate only.
function tallyDelegated(round, records, proofs) {
  checkRound(round);
  const used = new Set(),
    choices = new Map(),
    entries = [];
  for (const record of records) {
    const account = record.account;
    let issue = '';
    const delegated = Object.hasOwn(record, 'delegate');
    if (!round.members.includes(account)) issue = 'Outside electorate';
    else if (delegated && (record.delegate === account || !round.members.includes(record.delegate)))
      issue = 'Invalid representative';
    else if (
      !delegated &&
      (![record.pay, record.keep].every((n) => Number.isInteger(n) && n >= 0 && n <= 3) ||
        record.pay * record.pay + record.keep * record.keep > 9)
    )
      issue = 'Voice credit budget exceeded';
    else if (choices.has(account)) issue = 'Account already used';
    else {
      const ids = proofIds(proofs.get(account));
      if (!ids.length) issue = 'No eligible credential';
      else if (ids.some((id) => used.has(id))) issue = 'Credential already counted';
      else {
        ids.forEach((id) => used.add(id));
        choices.set(account, record);
      }
    }
    entries.push({ record, issue });
  }
  let pay = 0,
    keep = 0,
    count = 0;
  const log = [];
  for (const { record, issue } of entries) {
    const named = record.delegate ? record.account + ' → ' + record.delegate : record.account;
    const choice = record.delegate ? choices.get(record.delegate) : record;
    if (issue || !choice || Object.hasOwn(choice, 'delegate')) {
      log.push(
        named + ' · excluded · ' + (issue || 'representative has no eligible direct ballot'),
      );
      continue;
    }
    pay += choice.pay;
    keep += choice.keep;
    count++;
    log.push(
      named +
        ' · pay ' +
        choice.pay +
        ' / reserve ' +
        choice.keep +
        ' · ' +
        (choice.pay ** 2 + choice.keep ** 2) +
        '/9 credits',
    );
  }
  return {
    passed: count >= round.quorum && pay > keep,
    log,
    reason:
      count < round.quorum
        ? 'Quorum was not reached'
        : pay === keep
          ? 'The vote ended in a tie'
          : 'More votes favored keeping the funds',
    summary:
      count + ' represented / quorum ' + round.quorum + ' · pay ' + pay + ' · reserve ' + keep,
  };
}

function tally(round, ballots, proofs) {
  checkRound(round);
  const seenAccounts = new Set(),
    seenIds = new Set(),
    log = [];
  let support = 0,
    reserve = 0;
  for (const b of ballots) {
    let reason;
    if (!round.members.includes(b.account)) reason = 'Outside electorate';
    else if (
      ![b.pay, b.keep].every((v) => Number.isInteger(v) && v >= 0 && v <= 3) ||
      b.pay * b.pay + b.keep * b.keep > 9
    )
      reason = 'Invalid allocation of nine credits';
    else if (seenAccounts.has(b.account)) reason = 'Duplicate account ballot';
    else {
      const ids = proofIds(proofs.get(b.account));
      if (!ids.length) reason = 'No eligible credential';
      else if (ids.some((id) => seenIds.has(id))) reason = 'Credential already counted';
      else {
        seenAccounts.add(b.account);
        ids.forEach((id) => seenIds.add(id));
        support += b.pay;
        reserve += b.keep;
      }
    }
    log.push(b.account + ' · ' + (reason || 'counted · pay ' + b.pay + ', reserve ' + b.keep));
  }
  const passed = seenAccounts.size >= round.quorum && support > reserve;
  return {
    passed,
    log,
    summary:
      seenAccounts.size +
      ' distinct credentialed ballots / quorum ' +
      round.quorum +
      ' · pay ' +
      support +
      ' · reserve ' +
      reserve,
  };
}
const rpcPreference = new Map();
async function callRpc(network, method, params) {
  if (
    !['mainnet', 'testnet'].includes(network) ||
    !['query', 'block', 'EXPERIMENTAL_tx_status'].includes(method)
  )
    throw Error('Only supported read-only NEAR RPC calls are allowed.');
  const archive = 'https://archival-rpc.' + network + '.near.org';
  const fallback =
    network === 'testnet' ? 'https://test.rpc.fastnear.com' : 'https://free.rpc.fastnear.com';
  const endpoints =
    rpcPreference.get(network) === fallback ? [fallback, archive] : [archive, fallback];
  let issue = '';
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'review', method, params }),
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw Error('HTTP ' + response.status);
      const body = await response.json();
      if (!body.result) throw Error(body.error?.message || 'The requested record is unavailable.');
      rpcPreference.set(network, endpoint);
      return body.result;
    } catch (error) {
      issue = error.message;
    }
  }
  throw Error('NEAR providers could not complete the read. ' + issue.slice(0, 200));
}
async function readView(network, account, method, args, block) {
  const params = {
    request_type: 'call_function',
    account_id: account,
    method_name: method,
    args_base64: btoa(JSON.stringify(args)),
    ...(block ? { block_id: block } : { finality: 'final' }),
  };
  const body = { result: await callRpc(network, 'query', params) };
  if (
    !Array.isArray(body.result?.result) ||
    !body.result.block_hash ||
    (block && body.result.block_hash !== block)
  )
    throw Error('RPC could not verify ' + method + ' at the review block.');
  return {
    data: JSON.parse(new TextDecoder().decode(Uint8Array.from(body.result.result))),
    block: body.result.block_hash,
  };
}
async function readRound(
  network,
  dao,
  approval,
  endId,
  endTime,
  reference,
  block,
  round,
  delegation = false,
) {
  if (delegation && !/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(round?.identityBlock || ''))
    throw Error('Version 3 requires a registry snapshot block hash in the approved mandate.');
  const identityBlock = delegation ? round.identityBlock : block;
  if (delegation) {
    if (typeof identityBlock !== 'string') throw Error('Invalid registry snapshot.');
    const header = (await callRpc(network, 'block', { block_id: identityBlock })).header;
    if (
      header?.hash !== identityBlock ||
      typeof header.timestamp_nanosec !== 'string' ||
      !/^[0-9]+$/.test(header.timestamp_nanosec) ||
      BigInt(header.timestamp_nanosec) > BigInt(approval.submission_time)
    )
      throw Error('The identity snapshot must exist when the mandate is proposed.');
  }
  checkRound(round);
  const close = BigInt(round.closesNs);
  if (BigInt(approval.submission_time) >= close || BigInt(endTime) < close)
    throw Error('The payment must follow the committed voting window.');
  if (!Number.isSafeInteger(endId) || endId <= approval.id)
    throw Error('Invalid proposal history boundary.');
  if (endId - approval.id > 501)
    throw Error('Round exceeds the prototype limit of 500 intervening proposals.');
  const ballots = [];
  for (let start = approval.id + 1; start < endId; start += 25) {
    const limit = Math.min(25, endId - start);
    const { data } = await readView(
      network,
      dao,
      'get_proposals',
      { from_index: start, limit },
      block,
    );
    if (!Array.isArray(data) || data.length !== limit || data.some((p, i) => p.id !== start + i))
      throw Error('Incomplete ballot history. Review cannot certify this round.');
    for (const p of data) {
      if (delegation && p.kind?.Transfer && ['InProgress', 'Approved'].includes(p.status)) {
        let earlier;
        try {
          earlier = JSON.parse(p.description);
        } catch {
          /* Unrelated transfer */
        }
        if (earlier?.schema === 'treasury-request/v1' && earlier.reference === reference)
          throw Error(
            'Earlier transfer #' +
              p.id +
              ' already claims this mandate. Check it before reviewing a second request.',
          );
      }
      if (p.kind !== 'Vote' || BigInt(p.submission_time) >= close) continue;
      let b;
      try {
        b = JSON.parse(p.description);
      } catch {
        continue;
      }
      if (delegation && b?.schema === 'mandate-delegation/v1' && b.reference === reference)
        ballots.push({ account: p.proposer, delegate: b.delegate });
      if (b?.schema === 'mandate-ballot/v1' && b.reference === reference)
        ballots.push({ account: p.proposer, pay: b.pay, keep: b.keep });
    }
  }
  const accounts = [
    ...new Set(ballots.map((b) => b.account).filter((a) => round.members.includes(a))),
  ];
  const proofs = await readProofs(network, accounts, identityBlock);
  return delegation ? tallyDelegated(round, ballots, proofs) : tally(round, ballots, proofs);
}
async function readProofs(network, accounts, identityBlock) {
  const proofs = new Map();
  for (let i = 0; i < accounts.length; i += 8) {
    await Promise.all(
      accounts.slice(i, i + 8).map(async (account) => {
        const { data } = await readView(
          network,
          REGISTRIES[network],
          'is_human',
          { account },
          identityBlock,
        );
        proofs.set(account, data);
      }),
    );
  }
  return proofs;
}

async function rpcProposal(network, dao, id, block) {
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)))
    throw Error('Enter a valid proposal ID.');
  const result = await readView(network, dao, 'get_proposal', { id: Number(id) }, block);
  if (result.data.id !== Number(id)) throw Error('The returned proposal ID differs.');
  return result;
}

function checkPaymentReceipt(record, payment, hash, signer) {
  const tx = record.transaction;
  if (
    record.final_execution_status !== 'FINAL' ||
    !Object.hasOwn(record.status || {}, 'SuccessValue') ||
    tx?.hash !== hash ||
    tx.signer_id !== signer ||
    tx.receiver_id !== payment.dao
  )
    throw Error(
      'A finalized, successful transaction from this signer to the selected DAO is required.',
    );
  const action = tx.actions?.length === 1 && tx.actions[0].FunctionCall;
  if (action?.method_name !== 'act_proposal') throw Error('Choose a single Sputnik approval call.');
  const vote = JSON.parse(atob(action.args));
  if (vote.id !== payment.id || vote.action !== 'VoteApprove')
    throw Error('The transaction did not approve the selected proposal.');
  const rootIds = record.transaction_outcome?.outcome?.receipt_ids;
  const outcomes = new Map(
    (record.receipts_outcome || []).map((entry) => [entry.id, entry.outcome]),
  );
  const root = rootIds?.length === 1 && outcomes.get(rootIds[0]);
  if (
    root?.executor_id !== payment.dao ||
    !Array.isArray(root.receipt_ids) ||
    !('SuccessValue' in root.status || 'SuccessReceiptId' in root.status)
  )
    throw Error('The DAO approval receipt is missing or unsuccessful.');
  const matches = (record.receipts || []).filter((receipt) => {
    const actions = receipt.receipt?.Action?.actions;
    return (
      root.receipt_ids.includes(receipt.receipt_id) &&
      receipt.predecessor_id === payment.dao &&
      receipt.receiver_id === payment.recipient &&
      actions?.length === 1 &&
      actions[0].Transfer?.deposit === payment.amount
    );
  });
  if (matches.length !== 1)
    throw Error('No unique direct transfer receipt matches the approved recipient and amount.');
  const id = matches[0].receipt_id,
    out = outcomes.get(id);
  if (out?.executor_id !== payment.recipient || !Object.hasOwn(out.status || {}, 'SuccessValue'))
    throw Error('The recipient’s transfer receipt did not complete successfully.');
  return id;
}
async function findPaymentReceipt(payment, hash, signer) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(hash) || !ACCOUNT.test(signer))
    throw Error('Enter a valid transaction hash and signer account.');
  const record = await callRpc(payment.network, 'EXPERIMENTAL_tx_status', {
    tx_hash: hash,
    sender_account_id: signer,
    wait_until: 'FINAL',
  });
  return checkPaymentReceipt(record, payment, hash, signer);
}

function paymentArguments(m, reference) {
  return {
    proposal: {
      description: JSON.stringify({ schema: 'treasury-request/v1', reference, purpose: m.purpose }),
      kind: {
        Transfer: { token_id: '', receiver_id: m.recipient, amount: units(m.amount), msg: null },
      },
    },
  };
}

/* Community budget rounds. Shared credits are spent once across all requests. */
const BUDGET_SCHEMA = "treasury-budget/v2";
const BUDGET_BALLOT_SCHEMA = "budget-ballot/v2";
const BUDGET_DELEGATION_SCHEMA = "budget-delegation/v1";
const BUDGET_PAYMENT_SCHEMA = "treasury-budget-payment/v1";
const BLOCK_HASH = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;
const REQUEST_ID = /^[a-z][a-z0-9-]{0,31}$/;

function usesRequestOpposition(budget) {
  return budget.schema === BUDGET_SCHEMA;
}

function ballotSchema(budget) {
  return usesRequestOpposition(budget)
    ? BUDGET_BALLOT_SCHEMA
    : "budget-ballot/v1";
}

function decodeBudgetDescription(description) {
  if (typeof description !== "string")
    throw Error("Missing proposal description.");
  try {
    const parsed = JSON.parse(description);
    return typeof parsed?.notes === "string"
      ? JSON.parse(parsed.notes)
      : parsed;
  } catch {
    // Trezu's native payment form encodes the memo as one Notes field.
    if (!description.startsWith("* Notes: "))
      throw Error("Unrecognized budget description.");
    return JSON.parse(description.slice("* Notes: ".length));
  }
}

function checkBudget(budget) {
  if (
    !["treasury-budget/v1", BUDGET_SCHEMA].includes(budget?.schema) ||
    budget.asset !== "NEAR" ||
    typeof budget.title !== "string" ||
    !budget.title.trim() ||
    budget.title.length > 160
  )
    throw Error("Enter a named NEAR budget round.");
  checkRound(budget.round);
  if (
    usesRequestOpposition(budget) &&
    (!Number.isInteger(budget.round.minSupporters) ||
      budget.round.minSupporters < 1 ||
      budget.round.minSupporters > budget.round.members.length)
  )
    throw Error("Commit a valid minimum number of supporters per request.");
  units(budget.amount);
  if (
    !Array.isArray(budget.requests) ||
    !budget.requests.length ||
    budget.requests.length > 10
  )
    throw Error("A round must contain one to ten payment requests.");
  const ids = new Set();
  for (const request of budget.requests) {
    if (
      !REQUEST_ID.test(request?.id) ||
      ids.has(request.id) ||
      typeof request.recipient !== "string" ||
      !ACCOUNT.test(request.recipient) ||
      typeof request.purpose !== "string" ||
      !request.purpose.trim() ||
      request.purpose.length > 500
    )
      throw Error(
        "Each request needs a unique ID, a named recipient and a purpose.",
      );
    units(request.amount);
    if (BigInt(units(request.amount)) > BigInt(units(budget.amount)))
      throw Error("A request exceeds the entire round budget.");
    ids.add(request.id);
  }
  return budget;
}

function registryForRound(network, round) {
  if (!["mainnet", "testnet"].includes(network))
    throw Error("Select a supported network.");
  if (round.registry == null) return REGISTRIES[network];
  if (
    network !== "testnet" ||
    !ACCOUNT.test(round.registry) ||
    !round.registry.endsWith(".testnet") ||
    round.identityPolicy !== "team-issued-testnet"
  )
    throw Error(
      "A custom registry requires an explicitly labeled team-issued testnet round.",
    );
  return round.registry;
}

function creditCost(budget, ballot) {
  const allocations = ballot?.allocations;
  if (
    !allocations ||
    typeof allocations !== "object" ||
    Array.isArray(allocations) ||
    (!usesRequestOpposition(budget) &&
      (!Number.isInteger(ballot.retain) ||
        ballot.retain < 0 ||
        ballot.retain > 3))
  )
    throw Error("Allocate whole votes from zero to three.");
  const allowed = new Set(budget.requests.map((request) => request.id));
  if (usesRequestOpposition(budget) && Object.hasOwn(ballot, "retain"))
    throw Error(
      "Version 2 uses opposition on individual requests. Remove the global retain field.",
    );
  let cost = usesRequestOpposition(budget) ? 0 : ballot.retain ** 2;
  for (const [id, value] of Object.entries(allocations)) {
    if (
      !allowed.has(id) ||
      !Number.isInteger(value) ||
      value < (usesRequestOpposition(budget) ? -3 : 0) ||
      value > 3
    )
      throw Error(
        "An allocation contains an unknown request or an invalid vote count.",
      );
    cost += value ** 2;
  }
  if (cost > 9)
    throw Error(
      "These allocations cost " + cost + " credits. Nine are available.",
    );
  return cost;
}

function tallyBudget(budget, records, proofs) {
  checkBudget(budget);
  const members = new Set(budget.round.members);
  const credentials = new Set(),
    choices = new Map(),
    entries = [];
  for (const record of records) {
    let reason = "";
    const delegated = Object.hasOwn(record, "delegate");
    if (!members.has(record.account)) reason = "Outside electorate";
    else if (
      delegated &&
      (record.delegate === record.account || !members.has(record.delegate))
    )
      reason = "Invalid representative";
    else if (choices.has(record.account)) reason = "Account already used";
    else {
      if (!delegated) {
        try {
          creditCost(budget, record);
        } catch (error) {
          reason = error.message;
        }
      }
      if (!reason) {
        const ids = proofIds(proofs.get(record.account));
        if (!ids.length) reason = "No eligible credential";
        else if (ids.some((id) => credentials.has(id)))
          reason = "Credential already counted";
        else {
          ids.forEach((id) => credentials.add(id));
          choices.set(record.account, record);
        }
      }
    }
    entries.push({ record, reason });
  }
  const totals = new Map(budget.requests.map((request) => [request.id, 0]));
  const supports = new Map(budget.requests.map((request) => [request.id, 0]));
  const oppositions = new Map(
    budget.requests.map((request) => [request.id, 0]),
  );
  const supporterCounts = new Map(
    budget.requests.map((request) => [request.id, 0]),
  );
  let represented = 0,
    retain = 0;
  const log = [];
  for (const entry of entries) {
    const record = entry.record;
    const choice = Object.hasOwn(record, "delegate")
      ? choices.get(record.delegate)
      : record;
    const issue =
      entry.reason ||
      (!choice || Object.hasOwn(choice, "delegate")
        ? "Representative has no eligible direct ballot"
        : "");
    if (issue) {
      log.push({
        account: record.account,
        ...(usesRequestOpposition(budget)
          ? { proposalId: record.proposalId }
          : {}),
        delegate: record.delegate || null,
        counted: false,
        reason: issue,
      });
      continue;
    }
    represented++;
    if (!usesRequestOpposition(budget)) retain += choice.retain;
    for (const id of totals.keys()) {
      const value = choice.allocations[id] || 0;
      totals.set(id, totals.get(id) + value);
      if (value > 0) {
        supports.set(id, supports.get(id) + value);
        supporterCounts.set(id, supporterCounts.get(id) + 1);
      }
      if (value < 0) oppositions.set(id, oppositions.get(id) - value);
    }
    const counted = {
      account: record.account,
      ...(usesRequestOpposition(budget)
        ? { proposalId: record.proposalId }
        : {}),
      delegate: record.delegate || null,
      counted: true,
      allocations: { ...choice.allocations },
      ...(!usesRequestOpposition(budget) ? { retain: choice.retain } : {}),
      credits: creditCost(budget, choice),
    };
    log.push(counted);
  }
  const quorumMet = represented >= budget.round.quorum;
  let remaining = BigInt(units(budget.amount));
  const selection = [...budget.requests].sort(
    (a, b) =>
      totals.get(b.id) - totals.get(a.id) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const results = new Map();
  for (const request of selection) {
    const votes = totals.get(request.id);
    const amount = BigInt(units(request.amount));
    const minimumSupport =
      usesRequestOpposition(budget) &&
      supporterCounts.get(request.id) < budget.round.minSupporters;
    const reason = !quorumMet
      ? "Quorum unmet"
      : minimumSupport
        ? "Too few supporters"
        : votes <= (usesRequestOpposition(budget) ? 0 : retain)
          ? usesRequestOpposition(budget)
            ? "Opposition wins or ties"
            : "Retain wins or ties"
          : amount > remaining
            ? "Budget exhausted"
            : "Funded";
    const funded = reason === "Funded";
    if (funded) remaining -= amount;
    const result = { ...request, votes, funded, reason };
    if (usesRequestOpposition(budget))
      Object.assign(result, {
        support: supports.get(request.id),
        opposition: oppositions.get(request.id),
        supporters: supporterCounts.get(request.id),
        minSupporters: budget.round.minSupporters,
      });
    results.set(request.id, result);
  }
  const result = {
    represented,
    quorum: budget.round.quorum,
    quorumMet,
    retain,
    log,
    remaining: decimal(remaining.toString()),
    requests: budget.requests.map((request) => results.get(request.id)),
  };
  if (usesRequestOpposition(budget)) delete result.retain;
  return result;
}

async function readBudgetProofs(network, round, accounts) {
  const registry = registryForRound(network, round);
  const proofs = new Map();
  for (let start = 0; start < accounts.length; start += 6) {
    await Promise.all(
      accounts.slice(start, start + 6).map(async (account) => {
        const { data } = await readView(
          network,
          registry,
          "is_human",
          { account },
          round.identityBlock,
        );
        proofs.set(account, data);
      }),
    );
  }
  return proofs;
}

async function inspectBudget(network, dao, id, pinnedBlock) {
  if (!ACCOUNT.test(dao)) throw Error("Enter the trusted Sputnik DAO.");
  const approval = await rpcProposal(network, dao, String(id), pinnedBlock);
  if (approval.data.status !== "Approved" || approval.data.kind !== "Vote")
    throw Error("Choose an approved Sputnik signaling Vote.");
  const budget = checkBudget(JSON.parse(approval.data.description));
  registryForRound(network, budget.round);
  if (!BLOCK_HASH.test(budget.round.identityBlock || ""))
    throw Error("The mandate lacks an identity snapshot.");
  const reference = [network, dao, approval.data.id].join("/");
  const [snapshot, current, count] = await Promise.all([
    callRpc(network, "block", { block_id: budget.round.identityBlock }),
    callRpc(network, "block", { block_id: approval.block }),
    readView(network, dao, "get_last_proposal_id", {}, approval.block),
  ]);
  if (
    snapshot.header?.hash !== budget.round.identityBlock ||
    current.header?.hash !== approval.block ||
    typeof snapshot.header.timestamp_nanosec !== "string" ||
    typeof current.header.timestamp_nanosec !== "string"
  )
    throw Error("Could not verify the identity and review snapshots.");
  if (
    BigInt(snapshot.header.timestamp_nanosec) >
    BigInt(approval.data.submission_time)
  )
    throw Error("The identity snapshot postdates the mandate.");
  if (BigInt(approval.data.submission_time) >= BigInt(budget.round.closesNs))
    throw Error("The voting deadline must follow the mandate.");
  const next = count.data;
  if (
    !Number.isSafeInteger(next) ||
    next <= approval.data.id ||
    next - approval.data.id > 501
  )
    throw Error("The prototype supports up to 500 intervening proposals.");
  const ballots = [],
    transfers = [];
  for (let start = approval.data.id + 1; start < next; start += 25) {
    const limit = Math.min(25, next - start);
    const { data } = await readView(
      network,
      dao,
      "get_proposals",
      { from_index: start, limit },
      approval.block,
    );
    if (
      !Array.isArray(data) ||
      data.length !== limit ||
      data.some((proposal, index) => proposal.id !== start + index)
    )
      throw Error(
        "Incomplete proposal history. This round cannot be certified.",
      );
    for (const proposal of data) {
      let description;
      try {
        description = decodeBudgetDescription(proposal.description);
      } catch {
        continue;
      }
      if (description?.reference !== reference) continue;
      if (
        proposal.kind === "Vote" &&
        BigInt(proposal.submission_time) < BigInt(budget.round.closesNs)
      ) {
        if (description.schema === ballotSchema(budget))
          ballots.push({
            ...description,
            account: proposal.proposer,
            proposalId: proposal.id,
          });
        if (description.schema === BUDGET_DELEGATION_SCHEMA)
          ballots.push({
            account: proposal.proposer,
            delegate: description.delegate,
            proposalId: proposal.id,
          });
      }
      if (
        description.schema === BUDGET_PAYMENT_SCHEMA &&
        proposal.kind?.Transfer
      )
        transfers.push({ proposal, requestId: description.requestId });
    }
  }
  const accounts = [
    ...new Set(
      ballots
        .map((ballot) => ballot.account)
        .filter((account) => budget.round.members.includes(account)),
    ),
  ];
  const proofs = await readBudgetProofs(network, budget.round, accounts);
  const result = tallyBudget(budget, ballots, proofs);
  const closed =
    BigInt(current.header.timestamp_nanosec) >= BigInt(budget.round.closesNs);
  return {
    network,
    dao,
    reference,
    budget,
    result,
    closed,
    ballots,
    transfers,
    proofs: [...proofs],
    proposal: approval.data,
    block: approval.block,
    nextProposal: next,
  };
}

function budgetPaymentArguments(review, requestId) {
  const request = review.result.requests.find(
    (request) => request.id === requestId,
  );
  if (!review.closed || !request?.funded)
    throw Error("A closed, passing round is required.");
  const conflict = review.transfers.some(
    (entry) =>
      entry.requestId === requestId &&
      ["InProgress", "Approved"].includes(entry.proposal.status),
  );
  if (conflict)
    throw Error(
      "This request already has a pending or approved transfer. Review that proposal.",
    );
  return {
    proposal: {
      description: JSON.stringify({
        schema: BUDGET_PAYMENT_SCHEMA,
        reference: review.reference,
        requestId,
        purpose: request.purpose,
      }),
      kind: {
        Transfer: {
          token_id: "",
          receiver_id: request.recipient,
          amount: units(request.amount),
          msg: null,
        },
      },
    },
  };
}

function matchBudgetPayment(review, entry) {
  const request = review.result.requests.find(
    (request) => request.id === entry.requestId,
  );
  const transfer = entry.proposal.kind?.Transfer;
  let description;
  try {
    description = decodeBudgetDescription(entry.proposal.description);
  } catch {
    return false;
  }
  return Boolean(
    review.closed &&
      request?.funded &&
      BigInt(entry.proposal.submission_time) >=
        BigInt(review.budget.round.closesNs) &&
      description.schema === BUDGET_PAYMENT_SCHEMA &&
      description.reference === review.reference &&
      description.purpose === request.purpose &&
      transfer?.token_id === "" &&
      transfer.msg == null &&
      transfer.receiver_id === request.recipient &&
      transfer.amount === units(request.amount),
  );
}

function evidenceForBudget(review, settlements = []) {
  return {
    schema: "mandate-evidence/v1",
    reference: review.reference,
    reviewBlock: review.block,
    identityRegistry: registryForRound(review.network, review.budget.round),
    identityPolicy: review.budget.round.identityPolicy || "public-registry",
    identityBlock: review.budget.round.identityBlock,
    mandate: review.budget,
    result: review.result,
    closed: review.closed,
    declarationProposals: review.ballots.map((ballot) => ballot.proposalId),
    ...(usesRequestOpposition(review.budget)
      ? { declarations: review.ballots }
      : {}),
    credentials: [...review.proofs].sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
    transfers: review.transfers.map((entry) => ({
      id: entry.proposal.id,
      requestId: entry.requestId,
      status: entry.proposal.status,
      matches: matchBudgetPayment(review, entry),
      proposal: entry.proposal,
    })),
    settlements: settlements
      .map((payment) => ({
        requestId: payment.requestId,
        proposalId: payment.proposalId,
        transactionHash: payment.transactionHash,
        signer: payment.signer,
        receipt: payment.receipt,
        verified: payment.verified === true,
      }))
      .sort((left, right) => left.proposalId - right.proposalId),
  };
}

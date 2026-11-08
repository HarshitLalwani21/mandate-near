const ui = (id) => document.getElementById(id);
const state = {
  review: null,
  demo: true,
  capture: false,
  settlements: [],
  ticket: 0,
  evidenceTicket: 0,
  receiptPayment: null,
  receiptTicket: 0,
};
let publicRoundMetadata = null;
const demoBudget = {
  schema: BUDGET_SCHEMA,
  title: "A better welcome for new members",
  asset: "NEAR",
  amount: "0.3",
  requests: [
    {
      id: "translate",
      recipient: "translations.testnet",
      amount: "0.1",
      purpose: "Translate the onboarding guide",
    },
    {
      id: "workshop",
      recipient: "workshop.testnet",
      amount: "0.15",
      purpose: "Run a community welcome workshop",
    },
    {
      id: "testing",
      recipient: "testing.testnet",
      amount: "0.2",
      purpose: "Test the guide with first-time users",
    },
  ],
  round: {
    members: ["asha.testnet", "ben.testnet", "cara.testnet", "visitor.testnet"],
    quorum: 2,
    minSupporters: 2,
    closesNs: "1800000000000000000",
    identityBlock: "4".repeat(44),
  },
};
let demoBallots, demoProofs;

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function populate(select, entries, previous) {
  select.replaceChildren(
    ...entries.map(([value, label]) => {
      const option = node("option", label);
      option.value = value;
      return option;
    }),
  );
  if (entries.some(([value]) => value === previous)) select.value = previous;
}

function resetExample() {
  state.ticket++;
  state.receiptTicket++;
  state.demo = true;
  state.capture = false;
  state.settlements = [];
  state.receiptPayment = null;
  ui("receiptPanel").hidden = true;
  demoBallots = [
    {
      account: "asha.testnet",
      allocations: { translate: 2, workshop: 1, testing: 0 },
      proposalId: 8,
    },
    {
      account: "ben.testnet",
      allocations: { translate: 1, workshop: 2, testing: -1 },
      proposalId: 9,
    },
    { account: "cara.testnet", delegate: "asha.testnet", proposalId: 10 },
  ];
  demoProofs = new Map([
    ["asha.testnet", [["issuer.testnet", [1]]]],
    ["visitor.testnet", []],
    ["ben.testnet", [["issuer.testnet", [2]]]],
    ["cara.testnet", [["issuer.testnet", [3]]]],
  ]);
  updateExample();
}

function updateExample() {
  state.review = {
    network: "testnet",
    dao: "example-dao.testnet",
    reference: "testnet/example-dao.testnet/7",
    proposal: { id: 7 },
    budget: demoBudget,
    result: tallyBudget(demoBudget, demoBallots, demoProofs),
    closed: true,
    block: "simulated",
    ballots: demoBallots,
    transfers: [],
    proofs: [...demoProofs],
  };
  renderRound();
}

function renderRound() {
  const review = state.review,
    budget = review.budget,
    result = review.result;
  ui("sourceLabel").textContent = state.demo
    ? "Interactive example"
    : state.capture
      ? "Saved RPC replay · no live chain reads"
      : "Public Sputnik round";
  ui("identityLabel").textContent = state.demo
    ? "Fictional credentials"
    : budget.round.identityPolicy === "team-issued-testnet"
      ? "Team-issued testnet credentials · team-controlled accounts"
      : "Public registry · " + registryForRound(review.network, budget.round);
  ui("roundState").textContent = state.demo
    ? "Example · voting has closed"
    : review.closed
      ? "Voting has closed"
      : "Voting is open · provisional tally";
  ui("budgetTitle").textContent = budget.title;
  ui("roundReference").textContent = review.reference;
  ui("budgetAmount").textContent = budget.amount + " NEAR";
  ui("budgetRemaining").textContent =
    result.remaining + " NEAR stays in reserve";
  ui("turnout").textContent =
    result.represented + " represented / quorum " + result.quorum;
  const oldMember = ui("budgetMember").value;
  populate(
    ui("budgetMember"),
    budget.round.members.map((account) => [account, account]),
    oldMember,
  );
  populate(
    ui("budgetDelegate"),
    budget.round.members.map((account) => [account, account]),
    ui("budgetDelegate").value,
  );
  renderBallot();
  ui("requestResults").replaceChildren(
    ...result.requests.map((request) => {
      const article = node("article", null, "request");
      const heading = node("div", null, "request-head");
      heading.append(
        node("h3", request.purpose),
        node("strong", request.amount + " NEAR"),
      );
      const status = node(
        "span",
        request.reason,
        request.funded ? "funded" : "withheld",
      );
      const bar = node("div", null, "vote-bar"),
        fill = node("span");
      fill.style.width =
        (Math.max(0, request.votes) /
          Math.max(1, ...result.requests.map((item) => item.votes))) *
          100 +
        "%";
      bar.append(fill);
      const meta = node("div", null, "request-meta");
      meta.append(
        node(
          "span",
          usesRequestOpposition(budget)
            ? request.support +
                " support − " +
                request.opposition +
                " opposition · " +
                request.supporters +
                " supporting members"
            : request.votes + " votes · " + request.recipient,
        ),
        status,
      );
      article.append(heading, bar, meta);
      return article;
    }),
  );
  ui("resultStatus").textContent = usesRequestOpposition(budget)
    ? result.quorumMet
      ? result.requests.filter((request) => request.funded).length +
        " requests fit the budget. Each needs at least " +
        budget.round.minSupporters +
        " supporting members."
      : "Quorum has not been reached."
    : result.quorumMet
      ? result.retain +
        " votes favored keeping funds. " +
        result.requests.filter((request) => request.funded).length +
        " requests fit the budget."
      : "Quorum has not been reached. No payment can be prepared.";
  ui("memberLedger").replaceChildren(
    ...result.log.map((entry) => {
      const line = node("div", null, "ledger-row");
      line.append(
        node(
          "strong",
          entry.account + (entry.delegate ? " → " + entry.delegate : ""),
        ),
        node(
          "p",
          entry.counted
            ? "Counted · " +
                entry.credits +
                "/9 credits · " +
                Object.entries(entry.allocations)
                  .map(([key, value]) => key + " " + value)
                  .join(", ")
            : "Excluded · " + entry.reason,
        ),
      );
      return line;
    }),
  );
  populate(
    ui("selectedRequest"),
    result.requests.map((request) => [request.id, request.purpose]),
    ui("selectedRequest").value,
  );
  const linkedRequest = new URL(location.href).searchParams.get("request");
  if (!state.demo && result.requests.some(item => item.id === linkedRequest)) ui("selectedRequest").value = linkedRequest;
  selectPayment();
  ui("shareBudget").hidden = state.demo;
  ui("refreshBudget").hidden = state.demo;
  ui("socialDraft").hidden = state.demo;
  ui("evidenceKind").textContent = state.demo
    ? "Simulated records"
    : "Pinned block · " + review.block.slice(0, 9) + "…";
  ui("socialArguments").hidden = true;
  ui("evidenceStatus").textContent = "";
  updateEvidence();
}

function renderBallot() {
  const budget = state.review.budget;
  const member = ui("budgetMember").value;
  const record = state.review.ballots.find(
    (ballot) => ballot.account === member,
  );
  const delegated = record && Object.hasOwn(record, "delegate");
  ui("participation").value = delegated ? "delegate" : "direct";
  if (delegated) ui("budgetDelegate").value = record.delegate;
  ui("allocationFields").replaceChildren(
    ...budget.requests.map((request) => {
      const row = node("div", null, "allocation");
      const label = node("label", request.purpose);
      const cost = node("small", request.amount + " NEAR");
      label.append(node("br"), cost);
      const input = document.createElement("input"),
        output = node("output", String(record?.allocations?.[request.id] || 0));
      input.type = "range";
      input.min = usesRequestOpposition(budget) ? "-3" : "0";
      input.max = "3";
      input.step = "1";
      input.value = output.textContent;
      input.dataset.requestId = request.id;
      input.setAttribute("aria-label", "Votes for " + request.purpose);
      input.oninput = () => {
        output.textContent = input.value;
        previewBallot();
      };
      row.append(label, input, output);
      return row;
    }),
  );
  ui("retainVotes").value = String(record?.retain || 0);
  resetWalletAction();
  ui("ballotArgs").hidden = true;
  ui("ballotHelp").textContent = state.demo
    ? "This changes the fictional example. Each person gets nine credits, including when delegating."
    : "Submit these signaling Vote arguments from your own enrolled account before the deadline. The DAO proposal bond applies.";
  ui("submitBallot").textContent = state.demo
    ? "Cast in the example"
    : "Prepare my declaration";
  previewBallot();
}

function currentBallot() {
  const account = ui("budgetMember").value;
  if (ui("participation").value === "delegate")
    return { account, delegate: ui("budgetDelegate").value };
  const allocations = {};
  for (const input of document.querySelectorAll("[data-request-id]"))
    allocations[input.dataset.requestId] = Number(input.value);
  return usesRequestOpposition(state.review.budget)
    ? { account, allocations }
    : { account, allocations, retain: Number(ui("retainVotes").value) };
}

function previewBallot() {
  const ballot = currentBallot(),
    delegated = Object.hasOwn(ballot, "delegate");
  ui("delegateField").hidden = !delegated;
  ui("allocationFields").hidden = delegated;
  ui("retainField").hidden =
    delegated || usesRequestOpposition(state.review.budget);
  ui("retainValue").textContent = ui("retainVotes").value;
  resetWalletAction();
  ui("ballotArgs").hidden = true;
  ui("ballotStatus").textContent = "";
  ui("creditCount").classList.remove("invalid");
  try {
    if (delegated && ballot.account === ballot.delegate)
      throw Error("Choose another enrolled representative.");
    const cost = delegated ? null : creditCost(state.review.budget, ballot);
    ui("creditCount").textContent = delegated
      ? "Personal credits retained"
      : cost + " / 9 credits";
    ui("submitBallot").disabled = !state.demo && state.review.closed;
    if (!state.demo && state.review.closed)
      ui("ballotStatus").textContent = "This round has closed.";
  } catch (error) {
    ui("creditCount").textContent = "Over budget or invalid";
    ui("creditCount").classList.add("invalid");
    ui("ballotStatus").textContent = error.message;
    ui("submitBallot").disabled = true;
  }
}

ui("budgetMember").onchange = renderBallot;
ui("participation").onchange = previewBallot;
ui("budgetDelegate").onchange = previewBallot;
ui("retainVotes").oninput = previewBallot;
ui("submitBallot").onclick = () => {
  previewBallot();
  if (ui("submitBallot").disabled) return;
  const ballot = currentBallot();
  if (state.demo) {
    const index = demoBallots.findIndex(
      (item) => item.account === ballot.account,
    );
    if (index < 0)
      demoBallots.push({ ...ballot, proposalId: demoBallots.length + 8 });
    else
      demoBallots[index] = {
        ...ballot,
        proposalId: demoBallots[index].proposalId,
      };
    updateExample();
    return;
  }
  const description = {
    schema: Object.hasOwn(ballot, "delegate")
      ? BUDGET_DELEGATION_SCHEMA
      : ballotSchema(state.review.budget),
    reference: state.review.reference,
    ...ballot,
  };
  delete description.account;
  ui("ballotArgs").textContent = JSON.stringify(
    { proposal: { kind: "Vote", description: JSON.stringify(description) } },
    null,
    2,
  );
  ui("ballotArgs").hidden = false;
  ui("ballotStatus").textContent =
    "File from " + ballot.account + ". Sputnik records the actual proposer.";
};

function selectedPayment() {
  return state.review.result.requests.find(
    (request) => request.id === ui("selectedRequest").value,
  );
}

function clearSettlement() {
  state.receiptTicket++;
  state.receiptPayment = null;
  ui("receiptPanel").hidden = true;
  ui("receiptExplorer").hidden = true;
  ui("receiptStatus").textContent = "";
}

function selectPayment() {
  clearSettlement();
  const request = selectedPayment();
  ui("requestPayee").value = request.recipient;
  ui("requestAmount").value = request.amount;
  ui("requestPayee").readOnly = !state.demo;
  ui("requestAmount").readOnly = !state.demo;
  ui("paymentArgs").hidden = true;
  ui("trezuFields").hidden = true;
  ui("paymentSource").textContent = state.demo
    ? "Unsigned example"
    : "Checked against the public mandate";
  checkPayment();
  renderTransfers();
  showRequestHistory();
}

function checkPayment() {
  const request = selectedPayment();
  let same = false;
  try {
    same =
      ui("requestPayee").value === request.recipient &&
      units(ui("requestAmount").value) === units(request.amount);
  } catch {}
  const conflict = state.review.transfers.some(
    (entry) =>
      entry.requestId === request.id &&
      ["InProgress", "Approved"].includes(entry.proposal.status),
  );
  const passes = state.review.closed && request.funded && same && !conflict;
  ui("paymentMatch").textContent = !state.review.closed
    ? "The voting window is still open."
    : !request.funded
      ? "Payment on hold · " + request.reason
      : !same
        ? "Hold · members authorized " +
          request.amount +
          " NEAR to " +
          request.recipient +
          "."
        : conflict
          ? "A pending or approved transfer already claims this request. Review it below before creating another."
          : "The request matches the voted recipient and " +
            request.amount +
            " NEAR amount.";
  ui("paymentMatch").classList.toggle("pass", passes);
  ui("prepareRequest").disabled = !passes;

  ui("tamperRequest").hidden = !state.demo;
  ui("paymentArgs").hidden = true;
  ui("trezuFields").hidden = true;
}

function renderTransfers() {
  const review = state.review;
  const entries = review.transfers.filter(
    (entry) => entry.requestId === ui("selectedRequest").value,
  );
  ui("existingTransfers").replaceChildren(
    ...entries.map((entry) => {
      const container = node("div", null, "transfer-row");
      const match = matchBudgetPayment(review, entry);
      container.append(
        node(
          "p",
          "Sputnik proposal #" +
            entry.proposal.id +
            " · " +
            entry.proposal.status +
            " · " +
            (match
              ? "matches the mandate"
              : "payment differs from the mandate"),
        ),
      );
      if (match && entry.proposal.status === "Approved") {
        const button = node(
          "button",
          "Verify this payment’s settlement",
          "secondary",
        );
        button.onclick = () => {
          clearSettlement();
          const request = selectedPayment();
          state.receiptPayment = {
            network: review.network,
            dao: review.dao,
            id: entry.proposal.id,
            recipient: request.recipient,
            amount: units(request.amount),
            requestId: request.id,
          };
          const recorded =
            publicRoundMetadata?.dao === review.dao &&
            publicRoundMetadata.payments.find(
              (payment) => payment.proposalId === entry.proposal.id,
            );
          ui("receiptSigner").value = recorded ? recorded.signer : "";
          ui("receiptHash").value = recorded ? recorded.transactionHash : "";
          ui("receiptStatus").textContent = state.capture
            ? "Receipt verified in the saved replay. This is not a fresh chain read."
            : "";
          ui("receiptPanel").hidden = false;
          ui("receiptPanel").scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        };
        container.append(button);
      }
      return container;
    }),
  );
}

ui("selectedRequest").onchange = selectPayment;
ui("requestPayee").oninput = checkPayment;
ui("requestAmount").oninput = checkPayment;
ui("tamperRequest").onclick = () => {
  ui("requestAmount").value = decimal(
    (BigInt(units(selectedPayment().amount)) + 10n ** 23n).toString(),
  );
  checkPayment();
};
ui("prepareRequest").onclick = () => {
  checkPayment();
  if (ui("prepareRequest").disabled) return;
  try {
    const args = budgetPaymentArguments(
      state.review,
      ui("selectedRequest").value,
    );
    ui("paymentArgs").textContent = JSON.stringify(args, null, 2);
    ui("paymentArgs").hidden = false;
  } catch (error) {
    ui("paymentMatch").textContent = error.message;
  }
};
ui("trezuInstructions").onclick = () => {
  checkPayment();
  if (ui("prepareRequest").disabled) return;
  try {
    ui("trezuFields").textContent = JSON.stringify(
      trezuMemo(state.review, ui("selectedRequest").value),
      null,
      2,
    );
    ui("trezuFields").hidden = false;
  } catch (error) {
    ui("paymentMatch").textContent = error.message;
  }
};

async function updateEvidence() {
  const ticket = ++state.evidenceTicket;
  try {
    const digest = await fingerprintEvidence(
      evidenceForBudget(state.review, state.settlements),
    );
    if (ticket === state.evidenceTicket)
      ui("evidenceDigest").textContent = "Evidence SHA-256 · " + digest;
  } catch {
    if (ticket === state.evidenceTicket)
      ui("evidenceDigest").textContent =
        "Open through a local server or HTTPS to compute the evidence digest.";
  }
}

async function loadPublicRound(pinnedBlock, recordedPayments = []) {
  const ticket = ++state.ticket;
  state.receiptTicket++;
  ui("roundView").hidden = true;
  ui("receiptPanel").hidden = true;
  ui("loadStatus").textContent =
    "Reading the mandate, declarations and identity snapshot…";
  try {
    const network = ui("network").value,
      dao = ui("budgetDao").value.trim(),
      id = ui("budgetId").value.trim();
    const review = await inspectBudget(network, dao, id, pinnedBlock);
    if (ticket !== state.ticket) return;
    if (!Array.isArray(recordedPayments) || recordedPayments.length > 10)
      throw Error("The replay contains an invalid settlement list.");
    const verified = [];
    for (const payment of recordedPayments) {
      const entry = review.transfers.find(
        (entry) =>
          entry.requestId === payment.requestId &&
          entry.proposal.id === payment.proposalId,
      );
      if (
        !entry ||
        entry.proposal.status !== "Approved" ||
        !matchBudgetPayment(review, entry)
      )
        throw Error("A replay settlement does not match an approved request.");
      const transfer = entry.proposal.kind.Transfer;
      const receipt = await findPaymentReceipt(
        {
          network,
          dao,
          id: entry.proposal.id,
          recipient: transfer.receiver_id,
          amount: transfer.amount,
        },
        payment.transactionHash,
        payment.signer,
      );
      verified.push({ ...payment, receipt, verified: true });
    }
    if (ticket !== state.ticket) return;
    state.demo = false;
    state.capture = false;
    state.review = review;
    state.settlements = verified;
    ui("roundView").hidden = false;
    renderRound();
    ui("loadStatus").textContent = "Read at finalized block " + review.block;
  } catch (error) {
    if (ticket === state.ticket)
      ui("loadStatus").textContent = "Review incomplete. " + error.message;
  }
}

ui("loadBudget").onclick = () => loadPublicRound();
for (const id of ["network", "budgetDao", "budgetId"])
  ui(id).oninput = () => {
    state.ticket++;
    clearSettlement();
    ui("loadStatus").textContent = "";
    ui("roundView").hidden = true;
  };
ui("openLive").onclick = () => {
  ui("liveInputs").hidden = false;
  ui("budgetDao").focus();
};
ui("resetBudget").onclick = () => {
  ui("roundView").hidden = false;
  resetExample();
};
ui("downloadEvidence").onclick = async () => {
  const evidence = evidenceForBudget(state.review, state.settlements);
  const digest = await fingerprintEvidence(evidence);
  downloadJson(state.demo ? "example-evidence.json" : "mandate-evidence.json", {
    digest,
    source: state.demo
      ? "simulated"
      : state.capture
        ? "captured-rpc"
        : "public-chain",
    evidence,
  });
};
ui("rerunBudget").onclick = () => {
  if (state.demo) {
    updateExample();
    ui("evidenceStatus").textContent =
      "Recomputed from the fictional declarations and credentials.";
  } else if (state.capture) loadCapturedRound();
  else loadPublicRound(state.review.block, state.settlements);
};
ui("refreshBudget").onclick = () => loadPublicRound();
ui("shareBudget").onclick = async () => {
  try {
    await navigator.clipboard.writeText(
      state.capture
        ? new URL("?capture=1", location.href).href
        : evidenceLink(state.review, location.href, state.settlements),
    );
    ui("evidenceStatus").textContent =
      "Copied a link that reruns the public round at the same block.";
  } catch (error) {
    ui("evidenceStatus").textContent = error.message;
  }
};
ui("socialDraft").onclick = async () => {
  const review = state.review;
  const evidence = evidenceForBudget(review, state.settlements),
    digest = await fingerprintEvidence(evidence);
  const text = socialEvidencePost(
    review,
    digest,
    evidenceLink(review, location.href, state.settlements),
  );
  ui("socialArguments").textContent = JSON.stringify(
    nearSocialArguments(text, Date.now()),
    null,
    2,
  );
  ui("socialArguments").hidden = false;
  ui("evidenceStatus").textContent =
    "Review the text before posting from your own near.social account. The evidence digest verifies content when the check is rerun.";
};

for (const id of ["receiptSigner", "receiptHash"])
  ui(id).oninput = () => {
    state.receiptTicket++;
    ui("receiptStatus").textContent = "";
    ui("receiptExplorer").hidden = true;
  };
ui("checkReceipt").onclick = async () => {
  if (!state.receiptPayment) return;
  if (state.capture) {
    ui("receiptStatus").textContent =
      "Settlement already verified from saved RPC responses. Use live round mode for a fresh chain check.";
    return;
  }
  const ticket = ++state.receiptTicket,
    payment = { ...state.receiptPayment };
  const signer = ui("receiptSigner").value.trim(),
    hash = ui("receiptHash").value.trim();
  ui("receiptStatus").textContent =
    "Following the council approval and its transfer receipts…";
  try {
    const receipt = await findPaymentReceipt(payment, hash, signer);
    if (ticket !== state.receiptTicket) return;
    ui("receiptStatus").textContent =
      "Settled · " +
      decimal(payment.amount) +
      " NEAR to " +
      payment.recipient +
      " · receipt " +
      receipt;
    ui("receiptExplorer").href =
      "https://" +
      (payment.network === "testnet" ? "testnet." : "") +
      "nearblocks.io/txns/" +
      hash;
    ui("receiptExplorer").hidden = false;
    if (!state.settlements.some((item) => item.transactionHash === hash))
      state.settlements.push({
        requestId: payment.requestId,
        proposalId: payment.id,
        transactionHash: hash,
        signer,
        receipt,
        verified: true,
      });
    showRequestHistory();
    updateEvidence();
  } catch (error) {
    if (ticket === state.receiptTicket)
      ui("receiptStatus").textContent =
        "Settlement unverified. " + error.message;
  }
};

let createTicket = 0;
for (const id of ["newBudget", "createNetwork", "createDao"])
  ui(id).oninput = () => {
    createTicket++;
    ui("createStatus").textContent = "";
    ui("createArgs").textContent = "";
  };
ui("prepareBudget").onclick = async () => {
  const ticket = ++createTicket;
  ui("createArgs").textContent = "";
  try {
    const budget = checkBudget(JSON.parse(ui("newBudget").value));
    const network = ui("createNetwork").value,
      dao = ui("createDao").value.trim();
    if (!ACCOUNT.test(dao)) throw Error("Enter a Sputnik DAO account.");
    registryForRound(network, budget.round);
    ui("createStatus").textContent =
      "Reading the DAO policy and all member credentials…";
    const { data: policy, block } = await readView(
      network,
      dao,
      "get_policy",
      {},
    );
    const { header } = await callRpc(network, "block", { block_id: block });
    if (
      header?.hash !== block ||
      BigInt(header.timestamp_nanosec) >= BigInt(budget.round.closesNs)
    )
      throw Error(
        "The voting deadline must follow the current finalized block.",
      );
    if (
      typeof policy.proposal_bond !== "string" ||
      !/^\d+$/.test(policy.proposal_bond)
    )
      throw Error("The DAO did not return a valid proposal bond.");
    budget.round.identityBlock = block;
    const proofs = await readBudgetProofs(
      network,
      budget.round,
      budget.round.members,
    );
    const used = new Set(),
      lines = [];
    let eligible = 0,
      duplicates = false;
    for (const account of budget.round.members) {
      const ids = proofIds(proofs.get(account)),
        duplicate = ids.some((id) => used.has(id));
      ids.forEach((id) => used.add(id));
      if (duplicate) duplicates = true;
      else if (ids.length) eligible++;
      lines.push(
        account +
          " · " +
          (duplicate
            ? "credential also used in this roster"
            : ids.length
              ? "eligible"
              : "no eligible credential"),
      );
    }
    if (ticket !== createTicket) return;
    ui("createStatus").textContent = lines.join("\n");
    if (duplicates || eligible < budget.round.quorum)
      throw Error(
        "Review the electorate. Credentials overlap or quorum cannot be reached.",
      );
    ui("createArgs").textContent = JSON.stringify(
      { proposal: { kind: "Vote", description: JSON.stringify(budget) } },
      null,
      2,
    );
    ui("createStatus").textContent +=
      "\nSubmit to " +
      dao +
      " with a " +
      decimal(policy.proposal_bond) +
      " NEAR proposal bond. Credentials are pinned at " +
      block +
      ".";
  } catch (error) {
    if (ticket === createTicket)
      ui("createStatus").textContent +=
        "\nPreparation stopped. " + error.message;
  }
};

async function loadCapturedRound() {
  const ticket = ++state.ticket;
  ui("loadStatus").textContent =
    "Checking the saved response checksum and replaying the application…";
  let worker;
  try {
    const [response, checksum] = await Promise.all([
      fetch("public/rpc-capture.json"),
      fetch("public/rpc-capture.json.sha256"),
    ]);
    if (!response.ok || !checksum.ok)
      throw Error("Saved responses unavailable.");
    const bytes = await response.arrayBuffer();
    const hash = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    if (hash !== (await checksum.text()).trim())
      throw Error("Saved response checksum differs.");
    const bundle = JSON.parse(new TextDecoder().decode(bytes));
    worker = new Worker("src/offline-worker.js");
    const result = await new Promise((resolve, reject) => {
      worker.onmessage = (e) =>
        e.data.ok ? resolve(e.data) : reject(Error(e.data.message));
      worker.onerror = () => reject(Error("Offline replay worker failed."));
      worker.postMessage(bundle);
    });
    if (ticket !== state.ticket) return;
    state.demo = false;
    state.capture = true;
    state.review = result.review;
    state.settlements = result.settlements;
    publicRoundMetadata = bundle.recorded;
    ui("network").value = "testnet";
    ui("budgetDao").value = bundle.recorded.dao;
    ui("budgetId").value = bundle.recorded.budgetProposalId;
    ui("receiptPanel").hidden = true;
    renderRound();
    ui("loadStatus").textContent =
      "Saved RPC replay passed: three exclusions and two settled payments. No live RPC was used. Capture integrity is not independent chain verification.";
  } catch (error) {
    if (ticket === state.ticket)
      ui("loadStatus").textContent = "Replay stopped. " + error.message;
  } finally {
    worker?.terminate();
  }
}
ui("replayCapture").onclick = () => loadCapturedRound();

resetExample();
ui("newBudget").value = JSON.stringify(
  {
    ...demoBudget,
    round: {
      ...demoBudget.round,
      members: ["alice.testnet", "ben.testnet"],
      identityBlock: "REPLACED_BY_PREFLIGHT",
      closesNs: ((BigInt(Date.now()) + 86400000n) * 1000000n).toString(),
    },
  },
  null,
  2,
);
const query = new URLSearchParams(location.search);
if (query.get("capture") === "1") loadCapturedRound();
else if (query.has("dao")) {
  ui("liveInputs").hidden = false;
  ui("network").value =
    query.get("network") === "mainnet" ? "mainnet" : "testnet";
  ui("budgetDao").value = query.get("dao");
  ui("budgetId").value = query.get("id") || "";
  const block = query.get("block");
  if (block && !BLOCK_HASH.test(block))
    ui("loadStatus").textContent = "The replay block hash is invalid.";
  else {
    try {
      const payments = query.has("payments")
        ? JSON.parse(query.get("payments"))
        : [];
      loadPublicRound(block || undefined, payments);
    } catch {
      ui("loadStatus").textContent = "The replay settlement list is invalid.";
    }
  }
}
fetch("public/testnet-round.json")
  .then((response) => (response.ok ? response.json() : null))
  .then((round) => {
    if (!round?.dao || !Number.isSafeInteger(round.budgetProposalId)) return;
    publicRoundMetadata = round;
    ui("teamRound").hidden = false;
    ui("teamRound").onclick = () => {
      ui("network").value = "testnet";
      ui("budgetDao").value = round.dao;
      ui("budgetId").value = String(round.budgetProposalId);
      loadPublicRound();
    };
  })
  .catch(() => {});

installReviewTools();


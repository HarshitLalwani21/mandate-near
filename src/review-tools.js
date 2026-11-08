let walletPreparation;
let walletConnector;
let walletNetwork;
let walletRevision = 0;
let inspectionRevision = 0;

function resetWalletAction() {
  walletRevision++;
  walletPreparation = undefined;
  ui("walletConnect").hidden =
    state.demo || state.capture || state.review?.closed;
  ui("walletSign").hidden = true;
  ui("walletStatus").textContent = "";
}

function showRequestHistory() {
  inspectionRevision++;
  ui("filedReport").textContent = "";
  ui("requestHistory").hidden = state.demo;
  if (state.demo) return;
  const review = state.review;
  const request = selectedPayment();
  const list = ui("historyRows");
  list.replaceChildren(
    node(
      "p",
      "Mandate " +
        review.reference +
        " · " +
        request.amount +
        " NEAR to " +
        request.recipient,
    ),
  );
  list.append(node("p", request.votes + " net votes · " + request.reason));
  const entries = review.transfers.filter((e) => e.requestId === request.id);
  for (const entry of entries) {
    const p = entry.proposal;
    const row = node(
      "p",
      "Proposal " +
        p.id +
        " · " +
        p.status +
        " · " +
        (matchBudgetPayment(review, entry) ? "matches" : "differs"),
    );
    const payment = state.settlements.find(
      (item) => item.proposalId === p.id && item.verified,
    );
    if (payment) {
      const link = node("a", "View verified settlement");
      link.href =
        "https://" +
        (review.network === "testnet" ? "testnet." : "") +
        "nearblocks.io/txns/" +
        encodeURIComponent(payment.transactionHash);
      row.append(" · ", link);
    }
    list.append(row);
  }
  if (!entries.length)
    list.append(
      node("p", "No payment with this request reference at the review block."),
    );
  const link = new URL(
    state.capture
      ? "?capture=1"
      : evidenceLink(review, location.href, state.settlements),
    location.href,
  );
  link.searchParams.set("request", request.id);
  link.hash = "requestHistory";
  ui("historyLink").href = link.href;
  ui("inspectId").value = entries[0]?.proposal.id ?? "";
}

async function inspectFiled() {
  const revision = ++inspectionRevision;
  const review = state.review,
    request = selectedPayment();
  try {
    const raw = ui("inspectId").value.trim();
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)))
      throw Error("Enter a valid proposal ID.");
    const id = Number(raw);
    ui("filedReport").textContent = "Reading filed proposal…";
    const proposal = state.capture
      ? review.transfers.find((e) => e.proposal.id === id)?.proposal
      : (await readView(review.network, review.dao, "get_proposal", { id }))
          .data;
    if (!proposal || proposal.id !== id)
      throw Error(
        "Proposal unavailable in this source. Open a live round to look up other proposals in this DAO.",
      );
    const tx = proposal.kind?.Transfer;
    let details;
    try {
      details = decodeBudgetDescription(proposal.description);
    } catch {}
    const matches = matchBudgetPayment(review, {
      requestId: request.id,
      proposal,
    });
    const report = [
      (matches
        ? "Matches the funded mandate"
        : "Review differences before approval") +
        " · " +
        proposal.status,
      "Source: " +
        (state.capture ? "saved responses" : "finalized DAO proposal"),
      "Field | Mandate | Filed",
      "Recipient | " +
        request.recipient +
        " | " +
        (tx?.receiver_id ?? "no transfer"),
      "Amount (NEAR) | " +
        request.amount +
        " | " +
        (tx?.token_id === "" && /^\d+$/.test(tx.amount)
          ? decimal(tx.amount)
          : "unavailable"),
      "Asset | native NEAR | " +
        (tx?.token_id === "" ? "native NEAR" : (tx?.token_id ?? "unavailable")),
      "Reference | " +
        review.reference +
        " | " +
        (details?.reference ?? "missing"),
      "Request | " + request.id + " | " + (details?.requestId ?? "missing"),
      "Purpose | " + request.purpose + " | " + (details?.purpose ?? "missing"),
    ];
    if (revision === inspectionRevision && review === state.review)
      ui("filedReport").textContent = report.join("\n");
  } catch (error) {
    if (revision === inspectionRevision)
      ui("filedReport").textContent = error.message;
  }
}

async function prepareWallet() {
  resetWalletAction();
  const revision = walletRevision,
    review = state.review,
    ballot = currentBallot();
  try {
    if (state.demo || state.capture || review.closed)
      throw Error("Open an active live round.");
    ui("walletStatus").textContent =
      "Connecting for " + ballot.account + " on " + review.network + "…";
    const { default: lib } = await import("../vendor/near-connect-0.12.0.js");
    if (walletNetwork !== review.network) {
      walletConnector = new lib.NearConnector({
        network: review.network,
        autoConnect: false,
      });
      walletNetwork = review.network;
    }
    await walletConnector.whenManifestLoaded;
    const wallet = await walletConnector.connect();
    const accounts = await wallet.getAccounts({network: review.network});
    if (!accounts.some((a) => a.accountId === ballot.account))
      throw Error("Select your connected account in the member list.");
    const latest = await inspectBudget(
      review.network,
      review.dao,
      String(review.proposal.id),
    );
    if (
      latest.closed ||
      latest.result.log.some(
        (entry) => entry.account === ballot.account && entry.counted,
      )
    )
      throw Error("Round closed or member already represented.");
    const proofs = await readBudgetProofs(review.network, review.budget.round, [
      ballot.account,
    ]);
    if (!proofIds(proofs.get(ballot.account)).length)
      throw Error("No eligible credential at the committed snapshot.");
    const policy = (
      await readView(review.network, review.dao, "get_policy", {})
    ).data;
    if (!/^\d+$/.test(policy.proposal_bond))
      throw Error("Missing DAO proposal bond.");
    if (revision !== walletRevision || review !== state.review) return;
    ui("submitBallot").click();
    if (ui("ballotArgs").hidden) throw Error("Review your allocations first.");
    walletPreparation = {
      wallet,
      review,
      account: ballot.account,
      bond: policy.proposal_bond,
      args: JSON.parse(ui("ballotArgs").textContent),
    };
    ui("walletStatus").textContent =
      "Signer " +
      ballot.account +
      " · " +
      review.network +
      " · " +
      review.dao +
      " · proposal bond " +
      decimal(policy.proposal_bond) +
      " NEAR plus gas.";
    ui("walletSign").hidden = false;
  } catch (error) {
    if (revision === walletRevision)
      ui("walletStatus").textContent = error.message;
  }
}

async function signDeclaration() {
  const prepared = walletPreparation;
  if (!prepared || prepared.review !== state.review) return;
  walletPreparation = undefined;
  ui("walletSign").hidden = true;
  try {
    if (
      BigInt(Date.now()) * 1000000n >=
      BigInt(prepared.review.budget.round.closesNs)
    )
      throw Error("Voting has closed.");
    const outcome = await prepared.wallet.signAndSendTransaction({
      signerId: prepared.account,
      receiverId: prepared.review.dao,
      actions: [
        {
          type: "FunctionCall",
          params: {
            methodName: "add_proposal",
            args: prepared.args,
            gas: "100000000000000",
            deposit: prepared.bond,
          },
        },
      ],
    });
    if (outcome?.status?.Failure)
      throw Error("The declaration transaction failed.");
    if (prepared.review !== state.review) return;
    ui("walletStatus").textContent =
      "Refresh the live round to verify inclusion. Wallet transaction " +
      (outcome?.transaction?.hash ?? "awaiting confirmation") +
      ".";
  } catch (error) {
    if (prepared.review === state.review)
      ui("walletStatus").textContent = error.message;
  }
}

function installReviewTools() {
  ui("inspectFiled").onclick = inspectFiled;
  ui("walletConnect").onclick = prepareWallet;
  ui("walletSign").onclick = signDeclaration;
}


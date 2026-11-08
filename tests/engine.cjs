const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function loadEngine(extra = {}) {
  const context = vm.createContext({
    TextEncoder,
    TextDecoder,
    atob,
    btoa,
    AbortSignal,
    URL,
    crypto: require('node:crypto').webcrypto,
    ...extra,
  });
  const source = ['core.js', 'budget.js', 'evidence.js']
    .map((name) => fs.readFileSync(path.join(__dirname, '..', 'src', name), 'utf8'))
    .join('\n');
  vm.runInContext(
    source +
      '\nglobalThis.engine={checkBudget,tallyBudget,creditCost,inspectBudget,' +
      'budgetPaymentArguments,matchBudgetPayment,evidenceForBudget,fingerprintEvidence,decodeBudgetDescription,' +
      'registryForRound,checkPaymentReceipt,findPaymentReceipt,trezuMemo,trezuRow,evidenceLink,nearSocialArguments};',
    context,
  );
  return context.engine;
}
module.exports = loadEngine;

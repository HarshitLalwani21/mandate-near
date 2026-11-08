const loadEngine = require("../tests/engine.cjs");
async function verifyRound(recorded, fetch) {
  const result = await loadEngine({ fetch }).verifyRecordedRound(recorded);
  const { review, settlements, ...summary } = result;
  return summary;
}
module.exports = verifyRound;

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const { savedResponses, replay } = require("../scripts/replay.cjs");
const verifyRound = require("../scripts/verify-round.cjs");
const file = path.resolve(__dirname, "../public/rpc-capture.json");
test("the saved public round replays without a real network implementation", async () => {
  const result = await replay();
  assert.ok(result.payments >= 1);
  assert.ok(result.savedReads >= 5);
});
test("missing or altered saved RPC responses fail verification", async () => {
  const bundle = JSON.parse(fs.readFileSync(file, "utf8"));
  const missing = structuredClone(bundle);
  missing.records = [];
  await assert.rejects(
    verifyRound(missing.recorded, savedResponses(missing).fetch),
    /Missing captured response/,
  );
  const changed = structuredClone(bundle);
  const receipt = changed.records.find(
    (record) => record.method === "EXPERIMENTAL_tx_status",
  );
  receipt.response.result.final_execution_status = "EXECUTED_OPTIMISTIC";
  await assert.rejects(
    verifyRound(changed.recorded, savedResponses(changed).fetch),
    /finalized/,
  );
});
test("editing captured bytes is detected before replay", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mandate-replay-"));
  const target = path.join(dir, "capture.json");
  try {
    fs.writeFileSync(target, fs.readFileSync(file, "utf8") + " ");
    fs.copyFileSync(file + ".sha256", target + ".sha256");
    await assert.rejects(replay(target), /checksum/);
  } finally {
    fs.unlinkSync(target);
    fs.unlinkSync(target + ".sha256");
    fs.rmdirSync(dir);
  }
});

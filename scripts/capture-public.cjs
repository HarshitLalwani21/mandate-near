const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const verifyRound = require("./verify-round.cjs");
const file = path.resolve(__dirname, "..", "public", "testnet-round.json");
const expected = JSON.parse(fs.readFileSync(file, "utf8"));
const records = new Map();
async function recordFetch(url, options) {
  const request = JSON.parse(options.body);
  const response = await fetch(url, options);
  const body = await response.json();
  if (response.ok && body.result)
    records.set(
      JSON.stringify({ method: request.method, params: request.params }),
      { method: request.method, params: request.params, response: body },
    );
  return { ok: response.ok, status: response.status, json: async () => body };
}
(async () => {
  const result = await verifyRound(expected, recordFetch);
  const bundle = {
    schema: "mandate-rpc-capture/v1",
    network: "testnet",
    capturedAt: new Date().toISOString(),
    disclosure:
      "Captured public RPC responses. Offline replay checks consistency and application behavior. Live RPC verification independently checks chain state.",
    recorded: expected,
    records: [...records.values()],
  };
  const bytes = JSON.stringify(bundle, null, 2) + "\n";
  const target = path.resolve(__dirname, "..", "public", "rpc-capture.json");
  fs.writeFileSync(target, bytes);
  fs.writeFileSync(
    target + ".sha256",
    crypto.createHash("sha256").update(bytes).digest("hex") + "\n",
  );
  console.log("Captured", records.size, "read responses", result.reference);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

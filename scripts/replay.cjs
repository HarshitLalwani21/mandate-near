const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const verifyRound = require("./verify-round.cjs");

function savedResponses(bundle) {
  const entries = new Map(
    bundle.records.map((entry) => [
      JSON.stringify({ method: entry.method, params: entry.params }),
      entry.response,
    ]),
  );
  const reads = new Set();
  const fetch = async (url, options) => {
    const request = JSON.parse(options.body);
    const key = JSON.stringify({
      method: request.method,
      params: request.params,
    });
    const response = entries.get(key);
    if (!response)
      throw Error("Missing captured response for " + request.method);
    reads.add(key);
    return {
      ok: true,
      status: 200,
      json: async () => structuredClone(response),
    };
  };
  return { fetch, reads };
}
async function replay(
  file = path.resolve(__dirname, "..", "public", "rpc-capture.json"),
) {
  const bytes = fs.readFileSync(file);
  const checksum = fs.readFileSync(file + ".sha256", "utf8").trim();
  const actual = crypto.createHash("sha256").update(bytes).digest("hex");
  if (checksum !== actual) throw Error("Captured response checksum mismatch.");
  const bundle = JSON.parse(bytes);
  if (bundle.schema !== "mandate-rpc-capture/v1")
    throw Error("Unsupported capture.");
  const responses = savedResponses(bundle);
  const result = await verifyRound(bundle.recorded, responses.fetch);
  return { ...result, savedReads: responses.reads.size };
}
module.exports = { savedResponses, replay };
if (require.main === module) {
  globalThis.fetch = () => {
    throw Error("Network access is disabled during offline replay.");
  };
  replay()
    .then((result) =>
      console.log(
        "OFFLINE REPLAY PASSED · zero network requests\n" +
          JSON.stringify(result, null, 2),
      ),
    )
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

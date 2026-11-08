importScripts("core.js", "budget.js", "evidence.js", "replay.js");
self.onmessage = async (event) => {
  try {
    const bundle = event.data;
    if (bundle.schema !== "mandate-rpc-capture/v1")
      throw Error("Unsupported capture.");
    const records = new Map(
      bundle.records.map((entry) => [
        JSON.stringify({ method: entry.method, params: entry.params }),
        entry.response,
      ]),
    );
    self.fetch = async (url, options) => {
      const request = JSON.parse(options.body);
      const response = records.get(
        JSON.stringify({ method: request.method, params: request.params }),
      );
      if (!response) throw Error("The saved capture lacks this RPC response.");
      return {
        ok: true,
        status: 200,
        json: async () => structuredClone(response),
      };
    };
    const result = await verifyRecordedRound(bundle.recorded);
    self.postMessage({ ok: true, ...result });
  } catch (error) {
    self.postMessage({ ok: false, message: error.message });
  }
};

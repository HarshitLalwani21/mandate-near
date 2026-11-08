const fs = require("node:fs");
const path = require("node:path");
const verifyRound = require("./verify-round.cjs");
const file = path.resolve(__dirname, "..", "public", "testnet-round.json");
verifyRound(JSON.parse(fs.readFileSync(file, "utf8")), fetch)
  .then((result) => console.log("Live chain verified", JSON.stringify(result)))
  .catch((error) => {
    console.error(
      "Live verification requires reachable NEAR RPCs. " + error.message,
    );
    console.error(
      "Run npm run test:replay for the offline captured-response check.",
    );
    process.exitCode = 1;
  });

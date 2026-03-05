import { expect } from "chai";
import { buildDkgBlockchainConfig } from "../dist/blockchainConfig.mjs";

describe("buildDkgBlockchainConfig", () => {
  it("omits rpc when custom rpc is missing or blank", () => {
    const base = {
      name: "otp:20430",
      privateKey: "a".repeat(64),
      publicKey: "0x123",
    };

    const withoutRpc = buildDkgBlockchainConfig(base);
    const blankRpc = buildDkgBlockchainConfig(base, "   ");

    expect(withoutRpc).to.not.have.property("rpc");
    expect(blankRpc).to.not.have.property("rpc");
  });

  it("includes trimmed rpc when provided", () => {
    const base = {
      name: "otp:20430",
      privateKey: "a".repeat(64),
      publicKey: "0x123",
    };

    const config = buildDkgBlockchainConfig(base, "  https://rpc.example  ");

    expect(config).to.have.property("rpc", "https://rpc.example");
  });
});

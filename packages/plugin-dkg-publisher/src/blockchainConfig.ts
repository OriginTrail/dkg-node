export interface DkgBlockchainConfigBase {
  name: string;
  privateKey: string;
  publicKey?: string;
}

export function buildDkgBlockchainConfig(
  base: DkgBlockchainConfigBase,
  customRpc?: string,
) {
  const rpc = customRpc?.trim();
  return {
    ...base,
    ...(rpc ? { rpc } : {}),
  };
}

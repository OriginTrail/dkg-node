const PRIVATE_KEY_BODY_PATTERN = /^[0-9a-fA-F]{64}$/;

export function normalizePrivateKey(privateKey: string) {
  const trimmed = privateKey.trim();
  const body = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;

  if (!PRIVATE_KEY_BODY_PATTERN.test(body)) {
    throw new Error(
      "Private key must be 64 hexadecimal characters, with or without a 0x prefix",
    );
  }

  return `0x${body}`;
}

export function stripPrivateKeyPrefix(privateKey: string) {
  return normalizePrivateKey(privateKey).slice(2);
}

export function isValidPrivateKey(privateKey: string) {
  try {
    normalizePrivateKey(privateKey);
    return true;
  } catch {
    return false;
  }
}

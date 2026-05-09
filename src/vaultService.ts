export interface VaultPublicKeys {
  vgs: { vault_id: string; environment: string }
}

export async function getVaultPublicKeys(): Promise<VaultPublicKeys> {
  const urls = [
    'https://mypowerly.com/v1/api/payments/vault/public-keys/',
    'https://esign-admin.signmary.com/api/payments/vault/public-keys/',
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      return data.keys;
    } catch { continue; }
  }
  throw new Error('Failed to fetch vault public keys');
}

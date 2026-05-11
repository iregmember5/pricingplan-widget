export interface RouterChargePayload {
  vault_token: string;
  vault_provider: string;
  target_gateway?: string;
  amount: string;
  currency: string;
  business_email?: string;
  widget_id: string;
  aliased_card?: { exp_month: string; exp_year: string; cvc: string };
}

export interface RouterChargeResponse {
  success: boolean;
  transaction_id: number;
  gateway_tx_id: string;
  status: string;
  error: string | null;
}

export async function routerCharge(payload: RouterChargePayload): Promise<RouterChargeResponse> {
  const urls = [
    'https://esign-admin.signmary.com/api/payments/router/charge/',
    'https://mypowerly.com/v1/api/payments/router/charge/',
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) continue;
      return res.json();
    } catch { continue; }
  }
  throw new Error('Router charge failed');
}

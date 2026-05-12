export interface RouterInitPayload {
  widget_id: string;
  amount: string;
  currency: string;
  customer_email: string;
  variant_id?: string;
}

export interface RouterInitResponse {
  success: boolean;
  flow: 'vgs' | 'lemonsqueezy' | 'paypal';
  gateway?: string;
  checkout_url?: string;
  approval_url?: string;
  transaction_id?: number;
}

export async function routerInit(payload: RouterInitPayload): Promise<RouterInitResponse> {
  const urls = [
    'https://esign-admin.signmary.com/api/payments/router/init/',
    'https://mypowerly.com/v1/api/payments/router/init/',
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
  throw new Error('Router init failed');
}

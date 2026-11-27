export function customerCheckoutMessage(value: unknown): string {
  if (typeof value !== 'string') return '';
  const message = value.trim().replace(/\s+/g, ' ');
  if (!message || message.length > 400
    || /^(?:[{[<]|internal (?:server )?error\b|validation failed\.?$)|traceback|stack trace|\b(?:https?:\/\/|authorization:|bearer\s+|(?:purchase_token|recovery_secret|idempotency_key)\s*[:=])/i.test(message)) return '';
  return message;
}

export function widgetCheckoutStatusTitle(status: string, attempted: boolean): string {
  switch (status) {
    case 'processing': return 'Your payment is processing';
    case 'failed': return 'Your payment did not complete';
    case 'cancelled': return 'This payment was cancelled';
    case 'review_required': return 'Your payment needs review';
    case 'requires_action': return 'Payment verification required';
    case 'expired': return attempted ? 'Check your original payment' : 'Checkout expired';
    case 'offer_changed': return attempted ? 'Check your original payment' : 'Payment page updated';
    default: return attempted ? 'We’re checking your payment' : 'Checkout unavailable';
  }
}

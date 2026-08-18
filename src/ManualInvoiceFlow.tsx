import React, { useState } from 'react';

interface ManualInvoiceFlowProps {
  widgetId: string;
  widgetIds?: string[];
  planId: string;
  planName?: string;
  amount?: string;
  currency?: string;
  onBack: () => void;
  onDone: () => void;
}

const INVOICE_API_URLS = [
  'https://esign-admin.signmary.com/api/widgets/manual-invoice/request/',
  'https://mypowerly.com/api/widgets/manual-invoice/request/',
];

export const ManualInvoiceFlow: React.FC<ManualInvoiceFlowProps> = ({
  widgetId,
  widgetIds = [],
  planId,
  planName,
  amount = '0.00',
  currency = 'USD',
  onBack,
  onDone,
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [invoiceRef, setInvoiceRef] = useState('');
  const [invoicePdfUrl, setInvoicePdfUrl] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError('Please enter your name and email.');
      return;
    }

    setLoading(true);
    setError('');

    const candidateWidgetIds = Array.from(new Set([widgetId, ...widgetIds].filter(Boolean)));
    const payload = {
      widget_id: widgetId || candidateWidgetIds[0],
      plan_id: planId,
      plan_name: planName,
      customer_name: name,
      customer_email: email,
      note: note,
      amount,
      currency: currency.toUpperCase(),
    };

    let lastError: string | null = null;
    for (const url of INVOICE_API_URLS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));

        // ── Rate limited (429) ────────────────────────────────────────────
        if (res.status === 429) {
          setError('Too many requests. Please try again in a minute.');
          setLoading(false);
          return;
        }

        // ── Validation / server error (400-499, 5xx) ──────────────────────
        if (!res.ok) {
          // Nested shape: { success:false, errors: { field: ["msg", ...] } }
          if (data?.errors && typeof data.errors === 'object') {
            const fieldMessages = Object.entries(data.errors)
              .map(([field, msgs]) => {
                const list = Array.isArray(msgs) ? msgs : [msgs];
                return `${field}: ${list.join(', ')}`;
              })
              .join('; ');
            if (fieldMessages) {
              lastError = fieldMessages;
              continue;
            }
          }
          lastError = data?.message || data?.error || `HTTP ${res.status}`;
          continue;
        }

        // ── Success (both nested & flat shapes supported) ──────────────────
        const payloadData = data?.data && typeof data.data === 'object'
          ? data.data
          : data;
        setInvoiceRef(payloadData?.invoice_id || payloadData?.invoice_no || payloadData?.id || '');
        setInvoicePdfUrl(payloadData?.pdf_url || payloadData?.pdfUrl || payloadData?.invoice_pdf || '');
        setSuccess(true);
        setLoading(false);
        return;
      } catch (err: any) {
        lastError = err?.message || 'Network error';
        console.warn(`Manual invoice request failed for ${url}:`, err);
      }
    }

    setError(lastError || 'Failed to request invoice. Please try again.');
    setLoading(false);
  };

  if (success) {
    return (
      <div style={{ maxWidth: '400px', margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>📄</div>
        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '10px', color: '#10b981' }}>
          Invoice Request Received!
        </h2>
        <p style={{ color: '#6b7280', fontSize: '14px', lineHeight: 1.6 }}>
          Thank you, {name.split(' ')[0]}. Our team will review your request and email your
          invoice to <strong>{email}</strong> shortly.
        </p>
        {invoiceRef && (
          <p style={{ fontSize: '13px', color: '#9ca3af', fontFamily: 'monospace', marginTop: '12px' }}>
            Invoice #: {invoiceRef}
          </p>
        )}
        {invoicePdfUrl && (
          <a
            href={invoicePdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              marginTop: '20px',
              padding: '12px 24px',
              background: '#10b981',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '8px',
              fontWeight: '600',
            }}
          >
            View Invoice
          </a>
        )}
        <button
          onClick={onDone}
          style={{
            display: 'block',
            width: '100%',
            marginTop: '12px',
            padding: '12px 24px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '500',
          }}
        >
          Back to Plans
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '400px', margin: '0 auto', padding: '20px' }}>
      <button
        onClick={onBack}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '20px',
          background: 'none',
          border: 'none',
          color: '#6b7280',
          cursor: 'pointer',
          fontSize: '14px',
        }}
      >
        ← Back to Plans
      </button>

      <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center' }}>
        Request a Manual Invoice
      </h2>
      <p style={{ fontSize: '13px', color: '#6b7280', textAlign: 'center', marginBottom: '24px', lineHeight: 1.5 }}>
        Leave your details and we'll email you an invoice for{' '}
        <strong>{currency} {amount}</strong>
        {planName ? ` (${planName})` : ''}.
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
            Full Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. John Smith"
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '16px',
              boxSizing: 'border-box',
            }}
            required
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
            Email Address *
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '16px',
              boxSizing: 'border-box',
            }}
            required
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
            Note <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything we should know?"
            rows={3}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '14px',
              boxSizing: 'border-box',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {error && (
          <div style={{
            padding: '12px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            color: '#dc2626',
            fontSize: '14px',
            marginBottom: '16px',
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '16px',
            background: loading ? '#9ca3af' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: '500',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Submitting...' : 'Request Invoice'}
        </button>
      </form>
    </div>
  );
};

export default ManualInvoiceFlow;

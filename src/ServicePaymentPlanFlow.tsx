import React, { useEffect, useMemo, useState } from 'react';
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { AlertCircle, CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';
import { formatCheckoutAmount } from './CheckoutUI';
import type { WidgetCheckoutIdentity, WidgetCheckoutSession } from './widgetCheckoutService';
import { chargeWidgetPlanQuote, checkoutWidgetPlanQuote, clearWidgetPlanQuote, enrollWidgetServicePlan, getWidgetPlanStatus, readWidgetPlanForRoot, readWidgetPlanQuote, readWidgetPlanQuotePreview, reconcileWidgetServicePlan, requestWidgetPlanQuote } from './servicePaymentPlanService';

const moneyPattern = /^(0|[1-9]\d*)(\.\d{1,2})?$/;
const field = (row: any, snake: string, camel = snake) => row?.[snake] ?? row?.[camel];

function PlanCardForm({ checkout, quoteId, planId, onResult }: { checkout: any; quoteId: string; planId: string; onResult: (result: any) => void }) {
  const stripe = useStripe(); const elements = useElements();
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const key = `payora.service-plan.attempt.${planId}.${checkout.purchase_id}`;
  const locked = Boolean(sessionStorage.getItem(key));
  const pay = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements || busy || locked || checkout.can_submit !== true) return;
    setBusy(true); setError(''); let dispatched = false;
    try {
      const card = elements.getElement(CardElement); if (!card) throw new Error('Secure card fields are not ready.');
      const created = await stripe.createPaymentMethod({ type: 'card', card });
      if (created.error || !created.paymentMethod?.id) throw new Error(created.error?.message || 'Card details could not be prepared.');
      sessionStorage.setItem(key, 'started'); dispatched = true;
      const result = await chargeWidgetPlanQuote(checkout, quoteId, created.paymentMethod.id);
      if (result.status === 'requires_action') {
        const secret = field(result.next_action, 'client_secret', 'clientSecret');
        if (!secret) throw new Error('Bank approval is required. Check this payment status before continuing.');
        const action = await stripe.confirmCardPayment(secret);
        if (action.error) throw new Error(action.error.message || 'Bank approval was not completed.');
      }
      const reconciled = await reconcileWidgetServicePlan(planId, quoteId);
      const status = await getWidgetPlanStatus(planId);
      onResult({ result, reconciled, status });
    } catch (reason: any) {
      if (dispatched) {
        try { onResult({ reconciled: await reconcileWidgetServicePlan(planId, quoteId), status: await getWidgetPlanStatus(planId), statusUnknown: true }); }
        catch { setError('We could not confirm the result. Do not pay again. Check the original plan status.'); }
      } else setError(reason?.message || 'Secure payment could not be prepared. No charge was submitted.');
    } finally { setBusy(false); }
  };
  return <form onSubmit={pay} className="mt-4 space-y-3">
    <div className="rounded-lg border border-slate-300 bg-white p-4"><CardElement options={{ hidePostalCode: true }} /></div>
    {error && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">{error}</p>}
    <button className="payora-checkout__button" disabled={!stripe || busy || locked || checkout.can_submit !== true}>{busy ? 'Checking payment securely…' : locked ? 'Payment submitted · check status' : `Pay ${formatCheckoutAmount(checkout.amount, checkout.currency)}`}</button>
  </form>;
}

function StripeChild({ checkout, quoteId, planId, onResult }: { checkout: any; quoteId: string; planId: string; onResult: (result: any) => void }) {
  const descriptor = checkout.collection || {};
  const stripePromise = useMemo(() => {
    const key = descriptor.publishable_key || descriptor.publishableKey;
    const account = descriptor.stripe_account || descriptor.stripeAccount;
    if (typeof key !== 'string' || !key.startsWith('pk_')) return null;
    return loadStripe(key, account ? { stripeAccount: account } : undefined);
  }, [descriptor.publishable_key, descriptor.publishableKey, descriptor.stripe_account, descriptor.stripeAccount]);
  if (!stripePromise) return <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Secure Stripe setup was not issued. No payment was submitted. Contact the business.</p>;
  return <Elements stripe={stripePromise}><PlanCardForm checkout={checkout} quoteId={quoteId} planId={planId} onResult={onResult} /></Elements>;
}

export function ServicePaymentPlanFlow({ identity, checkout, buyerEmail, onBack }: { identity: WidgetCheckoutIdentity; checkout: WidgetCheckoutSession; buyerEmail?: string; onBack: () => void }) {
  const config = checkout.servicePaymentPlan || {};
  const policy = config.policy || {};
  const [planId, setPlanId] = useState(() => readWidgetPlanForRoot(checkout.purchaseId) || '');
  const [status, setStatus] = useState<any>(null); const [quote, setQuote] = useState<any>(null); const [child, setChild] = useState<any>(null);
  const [option, setOption] = useState('scheduled'); const [amount, setAmount] = useState(''); const [extra, setExtra] = useState('');
  const [agreed, setAgreed] = useState(false); const [includeDeposit, setIncludeDeposit] = useState(Boolean(policy.deposit_required));
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [result, setResult] = useState<any>(null);
  const currency = String(config.currency || checkout.currency || 'USD').toUpperCase();
  const activePlan = field(status, 'plan') || status || {};
  const currentQuote = quote || (planId ? readWidgetPlanQuotePreview(planId) : null);
  const quoteId = String(field(currentQuote, 'id') || (planId ? readWidgetPlanQuote(planId) : '') || '');
  const collection = child?.collection || {};
  const schedule = field(activePlan, 'schedule') || activePlan.installments || [];
  const options = [
    ...(policy.allow_full_payment ? ['full', 'payoff'] : []), ...(policy.allow_deposit ? ['deposit'] : []),
    ...(policy.installments_enabled ? ['scheduled'] : []), ...(policy.allow_custom_amount ? ['custom'] : []), ...(policy.allow_pay_ahead ? ['due_plus_extra'] : []),
  ];

  useEffect(() => {
    if (!planId) return;
    let live = true;
    void getWidgetPlanStatus(planId).then((value) => { if (live) setStatus(value); }).catch((reason: any) => { if (live) setError(reason.message || 'Could not restore private plan status. Do not pay again.'); });
    return () => { live = false; };
  }, [planId]);
  useEffect(() => {
    if (!planId || !quoteId) return;
    const raw = sessionStorage.getItem(`payora.service-plan.child.${planId}.${quoteId}`);
    if (raw) { try { setChild(JSON.parse(raw)); } catch { setError('The saved payment session could not be read. Check status before continuing.'); } }
  }, [planId, quoteId]);

  const run = async (fn: () => Promise<any>) => { setBusy(true); setError(''); try { return await fn(); } catch (reason: any) { setError(reason.message || 'The request could not be confirmed.'); return null; } finally { setBusy(false); } };
  const accept = async () => {
    if (!agreed || !identity || !checkout.purchaseToken) return;
    const response = await run(() => enrollWidgetServicePlan(checkout, policy.allow_deposit ? includeDeposit : null, buyerEmail));
    if (response) { setPlanId(response.id); setStatus({ plan: response.plan }); }
  };
  const getQuote = async () => {
    const response = await run(() => requestWidgetPlanQuote(planId, option, option === 'custom' ? amount : undefined, option === 'due_plus_extra' ? extra : undefined));
    if (response) { setQuote(response); setChild(null); setResult(null); }
  };
  const continueQuote = async () => {
    const response = await run(() => checkoutWidgetPlanQuote(planId, quoteId));
    if (response) { setChild(response); sessionStorage.setItem(`payora.service-plan.child.${planId}.${quoteId}`, JSON.stringify(response)); }
  };
  const refresh = async () => {
    const response = await run(async () => { if (quoteId && child) await reconcileWidgetServicePlan(planId, quoteId); return getWidgetPlanStatus(planId); });
    if (response) setStatus(response);
  };
  const resolved = async (value: any) => {
    setResult(value);
    if (value.status) setStatus(value.status);
    const freshPlan = field(value.status, 'plan') || value.status;
    if (quoteId && child && freshPlan?.can_quote === true) {
      clearWidgetPlanQuote(planId, quoteId);
      setQuote(null); setChild(null);
    }
  };
  const quoteExpiry = field(currentQuote, 'expires_at', 'expiresAt');
  const expired = Boolean(field(currentQuote, 'expired')) || Boolean(quoteExpiry && Date.parse(quoteExpiry) <= Date.now());
  const native = collection.flow === 'native_stripe' && collection.gateway === 'stripe';

  return <div className="payora-checkout"><div className="payora-checkout__container">
    <div className="payora-checkout__header"><div><div className="payora-checkout__brand-title">Service payment plan</div><div className="payora-checkout__brand-caption">A shared agreement with separate confirmed payments</div></div></div>
    <main className="payora-checkout__main">
      <button className="payora-checkout__back" type="button" onClick={onBack}>Back</button>
      <h1 className="payora-checkout__title">{planId ? 'Your payment plan' : 'Review your payment agreement'}</h1>
      <p className="payora-checkout__description">Accepting the agreement or requesting a quote does not charge you. Each payment uses a separate server-approved amount.</p>
      {error && <p role="alert" className="payora-checkout__alert"><AlertCircle size={15} /> {error}</p>}
      {!planId ? <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt>Agreement revision</dt><dd>{config.revision || config.revision_id || '—'}</dd></div><div><dt>Total for this purchase</dt><dd>{formatCheckoutAmount(checkout.amount, checkout.currency)}</dd></div><div><dt>Schedule</dt><dd>{policy.installments_enabled ? `${policy.installment_count} ${policy.frequency} installments` : 'No installments'}</dd></div><div><dt>Deposit</dt><dd>{policy.allow_deposit ? `${policy.deposit_required ? 'Required' : 'Optional'} · ${policy.deposit_value} ${policy.deposit_type}` : 'Not offered'}</dd></div><div><dt>Minimum</dt><dd>{policy.allow_custom_amount ? `${policy.minimum_value} (${policy.minimum_type})` : 'Scheduled amount'}</dd></div><div><dt>Shortfall</dt><dd>{policy.shortfall_behavior || 'stay'}</dd></div></dl>
        {policy.allow_deposit && !policy.deposit_required && <label className="mt-4 block"><input type="checkbox" checked={includeDeposit} onChange={(e) => setIncludeDeposit(e.target.checked)} /> Include optional deposit</label>}
        <label className="mt-4 block"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> I accept this agreement and its payment rules.</label>
        <button className="payora-checkout__button mt-4" type="button" disabled={!agreed || busy || !checkout.purchaseToken} onClick={() => void accept()}>{busy ? 'Saving agreement…' : 'Accept payment agreement'}</button>
      </section> : <>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">{[['Status', String(activePlan.financial_status || activePlan.status || '—').replaceAll('_', ' ')], ['Total', activePlan.total_amount || '—'], ['Paid', activePlan.paid_to_date || '—'], ['Remaining', activePlan.remaining_balance || activePlan.remaining_amount || '—']].map(([label, value]) => <div className="rounded-lg bg-white p-3" key={label}><small>{label}</small><strong className="block">{value}{label === 'Status' ? '' : ` ${currency}`}</strong></div>)}</div>
        {Array.isArray(schedule) && schedule.length > 0 && <div className="mt-4 overflow-x-auto rounded-lg border bg-white"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Installment</th><th>Due</th><th>Remaining</th><th>Status</th></tr></thead><tbody>{schedule.map((item: any, i: number) => <tr key={item.id || i}><td className="p-2">{item.label || `Payment ${i + 1}`}</td><td>{item.due_date || '—'}</td><td>{item.remaining_amount || item.amount || '—'} {currency}</td><td>{String(item.status || 'scheduled').replaceAll('_', ' ')}</td></tr>)}</tbody></table></div>}
        <section className="mt-4 rounded-xl border bg-white p-4"><div className="flex flex-wrap items-end gap-3"><label className="min-w-52 flex-1">Payment option<select className="payora-checkout__input mt-1" value={option} onChange={(e) => setOption(e.target.value)}>{options.map((item) => <option key={item} value={item}>{({ full: 'Pay full amount', payoff: 'Pay off remaining balance', deposit: 'Pay deposit', scheduled: 'Pay scheduled amount', custom: 'Pay a different amount', due_plus_extra: 'Due amount plus extra' } as Record<string, string>)[item]}</option>)}</select></label>{option === 'custom' && <label>Amount<input className="payora-checkout__input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>}{option === 'due_plus_extra' && <label>Extra amount<input className="payora-checkout__input" inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} /></label>}<button className="payora-checkout__button" type="button" disabled={busy || !activePlan.can_quote || (option === 'custom' && !moneyPattern.test(amount)) || (option === 'due_plus_extra' && !moneyPattern.test(extra))} onClick={() => void getQuote()}>{busy ? 'Preparing…' : 'Get server quote'}</button><button className="payora-checkout__button payora-checkout__button--subtle" type="button" disabled={busy} onClick={() => void refresh()}><RefreshCw size={15} /> Check status</button></div></section>
        {currentQuote && <section className="mt-4 rounded-xl border border-blue-200 bg-white p-4"><h2 className="font-semibold">Server quote</h2><p>Quote {field(currentQuote, 'id')} · expires {quoteExpiry || 'as returned by the payment service'}</p><dl className="mt-3 grid gap-3 sm:grid-cols-3"><div>Charge today<strong className="block">{field(currentQuote, 'amount')} {currency}</strong></div><div>Balance after<strong className="block">{field(currentQuote, 'balance_after', 'balanceAfter')} {currency}</strong></div><div>Next due<strong className="block">{field(currentQuote, 'next_due_amount', 'nextDueAmount') || '—'} · {field(currentQuote, 'next_due_date', 'nextDueDate') || 'date pending'}</strong></div></dl>{Array.isArray(currentQuote.allocations) && currentQuote.allocations.map((allocation: any, i: number) => <p key={allocation.id || i} className="mt-2 flex justify-between">{allocation.installment_label || allocation.label || `Installment ${i + 1}`}<strong>{allocation.amount} {currency}</strong></p>)}<button className="payora-checkout__button mt-3" type="button" disabled={busy || expired || !quoteId || Boolean(child)} onClick={() => void continueQuote()}>{child ? 'Checkout ready' : 'Continue with this quote'}</button></section>}
        {child && <section className="mt-4 rounded-xl border bg-white p-4"><h2 className="font-semibold">Secure payment</h2><p>Pay exactly {child.amount} {child.currency}; the amount and route are pinned to this quote.</p>{native && child.can_submit && <StripeChild checkout={child} quoteId={quoteId} planId={planId} onResult={(value) => void resolved(value)} />}{child.can_submit && !native && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">This child checkout requires {collection.provider || collection.flow || collection.gateway}. No other route will be selected and no payment details were sent. The secure collector needs implementation before this payment method can be used.</p>}{!child.can_submit && <p className="mt-3 text-amber-900">{child.unavailable_reason || 'This checkout cannot be submitted. Check plan status before continuing.'}</p>}</section>}
        {result && <p role="status" className="mt-4 rounded-lg bg-amber-50 p-3">{result.status?.status === 'succeeded' || result.result?.status === 'succeeded' ? 'Payment status returned by the payment service. Plan balance is refreshed below.' : 'Payment result is unresolved. Do not pay again; check the original plan status.'}</p>}
      </>}
      <p className="mt-5 flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={14} />The payment service controls balances and allocations. A confirmed payment is not a statement that funds are available for withdrawal.</p>
    </main>
  </div></div>;
}

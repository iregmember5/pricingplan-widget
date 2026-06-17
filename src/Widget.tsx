import React, { useMemo, useRef, useState, useEffect } from 'react';
import { ComparisonTablePreview } from './previews/ComparisonTablePreview';
import { PricingCardPreview } from './previews/PricingCardPreview';
import NewPricingTemplatePreview, { normalizeTemplateDoc } from './previews/NewPricingTemplatePreview';
import { PaymentFlow } from './PaymentFlow';
import { MOCK_NEW_PRICING_WIDGET } from './mockNewPricingWidget';

const MOCK_NEW_PRICING_ID = 'mock-new-pricing';
const NEW_PRICING_TYPES = new Set([
  'new_pricing_widget',
  'new_pricing_template',
  'pricing_template_json',
  'pricing_columns',
]);

function hasRenderableNewPricingDoc(doc: any) {
  return !!(
    doc
    && typeof doc === 'object'
    && (
      doc.layout
      || (Array.isArray(doc.plans) && doc.plans.length > 0)
      || (doc.theme && typeof doc.theme === 'object' && Object.keys(doc.theme).length > 0)
    )
  );
}

function unwrapTemplatePayload(payload: any) {
  if (payload && typeof payload === 'object') {
    if (payload.data && typeof payload.data === 'object') return payload.data;
    if (payload.result && typeof payload.result === 'object') return payload.result;
  }
  return payload;
}

function resolveRouterWidgetId(payload: any, fallback: string) {
  const source = unwrapTemplatePayload(payload);
  return `${payload?.widget_id || payload?.widgetId || payload?.slug || source?.widget_id || source?.widgetId || source?.slug || fallback}`.trim();
}

function collectRouterWidgetIds(fallback: string, ...payloads: any[]) {
  const ids = new Set<string>();
  const add = (value: any) => {
    const id = `${value ?? ''}`.trim();
    if (id && id !== 'undefined') ids.add(id);
  };

  add(fallback);
  payloads.forEach((payload) => {
    if (!payload) return;
    const source = unwrapTemplatePayload(payload);
    add(payload.widget_id);
    add(payload.widgetId);
    add(payload.slug);
    add(payload.id);
    add(payload.data?.id);
    add(payload.data?.widget_id);
    add(payload.data?.widgetId);
    add(payload.data?.slug);
    add(source?.id);
    add(source?.widget_id);
    add(source?.widgetId);
    add(source?.slug);
  });

  return Array.from(ids);
}

function isEmbedMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get('embed') === 'true' || window.location.pathname.startsWith('/embed/');
}

function isObject(value: any): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

type CheckoutPlan = {
  planId: string;
  buttonText: string;
  paymentType?: string;
  interval?: string;
  price?: string;
  currency?: string;
  paymentGateway?: string;
  trialDays?: number;
  prorationBehavior?: string;
};

function normalizeGatewaySlug(value: any) {
  const raw = `${value ?? ''}`.trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes('lemon')) return 'lemonsqueezy';
  if (raw.includes('pay safe') || raw.includes('paysafe')) return 'paysafe';
  if (raw.includes('pay pal') || raw.includes('paypal')) return 'paypal';
  if (raw.includes('stripe')) return 'stripe';
  return raw.replace(/[^a-z0-9]/g, '');
}

function normalizeCurrencyCode(value: any, fallback = 'USD') {
  const raw = `${value ?? ''}`.trim();
  if (!raw) return fallback;
  if (/^[a-z]{3}$/i.test(raw)) return raw.toUpperCase();
  if (raw === '$' || raw.toLowerCase().includes('usd')) return 'USD';
  return fallback;
}

function getDocPaymentGateway(doc: any) {
  const explicitGateway = normalizeGatewaySlug(doc?.payment_gateway ?? doc?.paymentGateway);
  if (explicitGateway) return explicitGateway;

  const priorityGroups = doc?.payment_gateway_priorities ?? doc?.paymentGatewayPriorities;
  if (isObject(priorityGroups)) {
    const ordered = ['creditCard', 'bank', 'crypto']
      .flatMap((group) => Array.isArray(priorityGroups[group]) ? priorityGroups[group] : [])
      .filter((gateway: any) => gateway && gateway.enabled !== false)
      .sort((a: any, b: any) => Number(a?.priority ?? 999) - Number(b?.priority ?? 999));
    const firstGateway = normalizeGatewaySlug(ordered[0]?.gateway);
    if (firstGateway) return firstGateway;
  }

  return undefined;
}

function collectCheckoutPlans(doc: any) {
  const plans: CheckoutPlan[] = [];
  const seen = new Set<string>();
  const docPaymentType = `${doc?.paymentType || doc?.payment_type || ''}`.trim().toLowerCase() || undefined;
  const docInterval = `${doc?.interval || ''}`.trim().toLowerCase() || undefined;
  const docCurrency = normalizeCurrencyCode(doc?.currency || doc?.globalCurrency);
  const docPaymentGateway = getDocPaymentGateway(doc);
  const docTrialDays = Number(doc?.trialDays ?? doc?.trial_days);
  const docProrationBehavior = `${doc?.proration_behavior || doc?.prorationBehavior || ''}`.trim() || undefined;

  const getTrialDays = (entry: any) => {
    const entryTrialDays = Number(entry?.trialDays ?? entry?.trial_days);
    if (Number.isFinite(entryTrialDays) && entryTrialDays > 0) return entryTrialDays;
    if (Number.isFinite(docTrialDays) && docTrialDays > 0) return docTrialDays;
    return undefined;
  };

  const pushPlan = (entry: any) => {
    if (!isObject(entry)) return;
    const planId = `${entry.planId || entry.plan_id || entry.id || ''}`.trim();
    if (!planId || seen.has(planId)) return;
    seen.add(planId);
    plans.push({
      planId,
      buttonText: `${entry.buttonText || entry.button_text || entry.text || ''}`.trim(),
      paymentType: `${entry.paymentType || entry.payment_type || docPaymentType || ''}`.trim().toLowerCase() || undefined,
      interval: `${entry.interval || docInterval || ''}`.trim().toLowerCase() || undefined,
      price: entry.price_amount
        ? (entry.price_amount / 100).toFixed(2)
        : entry.priceAmount
          ? (entry.priceAmount / 100).toFixed(2)
          : `${entry.price || ''}`.trim().replace(/[^0-9.]/g, '') || undefined,
      currency: normalizeCurrencyCode(entry.currency, docCurrency),
      paymentGateway: normalizeGatewaySlug(entry.payment_gateway ?? entry.paymentGateway) || docPaymentGateway,
      trialDays: getTrialDays(entry),
      prorationBehavior: `${entry.proration_behavior || entry.prorationBehavior || docProrationBehavior || ''}`.trim() || undefined,
    });
  };

  if (Array.isArray(doc?.plans)) {
    doc.plans.forEach(pushPlan);
  }
  if (Array.isArray(doc?.cards)) {
    doc.cards.forEach(pushPlan);
  }
  if (Array.isArray(doc?.tables)) {
    doc.tables.forEach((table: any) => {
      if (Array.isArray(table?.cards)) table.cards.forEach(pushPlan);
    });
  }

  const walkLayout = (node: any, inheritedPlan: any = null) => {
    if (!isObject(node)) return;
    let activePlan = inheritedPlan;

    if (node.type === 'photo-card' && (node.planId || node.id)) {
      activePlan = {
        planId: `${node.planId || node.id}`.trim(),
        paymentType: `${node.paymentType || node.payment_type || docPaymentType || ''}`.trim().toLowerCase() || undefined,
        interval: `${node.interval || docInterval || ''}`.trim().toLowerCase() || undefined,
        currency: normalizeCurrencyCode(node.currency, docCurrency),
        paymentGateway: normalizeGatewaySlug(node.payment_gateway ?? node.paymentGateway) || docPaymentGateway,
        trialDays: getTrialDays(node),
        prorationBehavior: `${node.proration_behavior || node.prorationBehavior || docProrationBehavior || ''}`.trim() || undefined,
      };
    }

    if (node.type === 'button') {
      const planId = `${node.planId || node.id || activePlan?.planId || ''}`.trim();
      if (planId && !seen.has(planId)) {
        seen.add(planId);
        plans.push({
          planId,
          buttonText: `${node.text || node.buttonText || ''}`.trim(),
          paymentType: `${node.paymentType || node.payment_type || activePlan?.paymentType || docPaymentType || ''}`.trim().toLowerCase() || undefined,
          interval: `${node.interval || activePlan?.interval || docInterval || ''}`.trim().toLowerCase() || undefined,
          currency: normalizeCurrencyCode(node.currency, activePlan?.currency || docCurrency),
          paymentGateway: normalizeGatewaySlug(node.payment_gateway ?? node.paymentGateway) || activePlan?.paymentGateway || docPaymentGateway,
          trialDays: getTrialDays(node) || activePlan?.trialDays,
          prorationBehavior: `${node.proration_behavior || node.prorationBehavior || activePlan?.prorationBehavior || docProrationBehavior || ''}`.trim() || undefined,
        });
      }
    }

    if (Array.isArray(node.children)) {
      node.children.forEach((child) => walkLayout(child, activePlan));
    }
  };

  if (isObject(doc?.layout)) {
    walkLayout(doc.layout);
  }

  return plans;
}

function hasCustomLinksInDoc(doc: any) {
  const hasLinkOnEntry = (entry: any) => {
    if (!isObject(entry)) return false;
    return ['buttonLink', 'href', 'url', 'link'].some((key) => `${entry?.[key] || ''}`.trim().length > 0);
  };

  if (Array.isArray(doc?.plans) && doc.plans.some(hasLinkOnEntry)) return true;
  if (Array.isArray(doc?.cards) && doc.cards.some(hasLinkOnEntry)) return true;
  if (Array.isArray(doc?.tables) && doc.tables.some((table: any) => Array.isArray(table?.cards) && table.cards.some(hasLinkOnEntry))) return true;

  const walkLayout = (node: any): boolean => {
    if (!isObject(node)) return false;
    if (node.type === 'button' && hasLinkOnEntry(node)) return true;
    if (Array.isArray(node.children)) return node.children.some((child: any) => walkLayout(child));
    return false;
  };

  if (isObject(doc?.layout) && walkLayout(doc.layout)) return true;
  return false;
}

function shouldUseNewWidgetPayment(doc: any, plans: Array<{ planId: string }>) {
  const buttonAction = `${doc?.globalButtonAction || ''}`.trim().toLowerCase();
  const paymentType = `${doc?.payment_type || doc?.paymentType || ''}`.trim().toLowerCase();

  if (buttonAction === 'link') return false;
  if (buttonAction === 'payment') return true;
  
  // If payment_type is set (one_time or subscription), enable payment
  if (paymentType === 'one_time' || paymentType === 'subscription') return true;

  return plans.length > 0 && !hasCustomLinksInDoc(doc);
}

function normalizeAppearance(raw: any): Record<string, any> {
  if (!raw) return {};
  return {
    primaryColor: raw.primary_color ?? raw.primaryColor,
    secondaryColor: raw.secondary_color ?? raw.secondaryColor,
    buttonColor: raw.button_color ?? raw.buttonColor,
    font: raw.font,
    fontSize: raw.font_size ?? raw.fontSize,
    fontWeight: raw.font_weight ?? raw.fontWeight,
    buttonShape: raw.button_shape ?? raw.buttonShape,
    buttonRadius: raw.button_radius ?? raw.buttonRadius,
    buttonType: raw.button_type ?? raw.buttonType,
    columnStyle: raw.column_style ?? raw.columnStyle,
    categoryTextColor: raw.category_text_color ?? raw.categoryTextColor,
    widgetBackgroundColor: raw.widget_background_color ?? raw.widgetBackgroundColor,
  };
}

function normalizeWidgetData(raw: any): Record<string, any> {
  if (!raw) return {};
  return {
    ...raw,
    multiTableMode: raw.multi_table_mode ?? raw.multiTableMode,
    showWidgetTitle: raw.show_widget_title ?? raw.showWidgetTitle,
    widgetTitle: raw.widget_title ?? raw.widgetTitle,
    widgetTitleCaption: raw.widget_title_caption ?? raw.widgetTitleCaption,
    widgetTitleColor: raw.widget_title_color ?? raw.widgetTitleColor,
    widgetCaptionColor: raw.widget_caption_color ?? raw.widgetCaptionColor,
    paymentType: raw.payment_type ?? raw.paymentType,
    paymentGateway: raw.payment_gateway ?? raw.paymentGateway,
    interval: raw.interval ?? null,
    plans: (raw.plans || []).map((p: any) => ({
      ...p,
      imageUrl: p.image_url ?? p.imageUrl,
      buttonText: p.button_text ?? p.buttonText,
      buttonCaption: p.button_caption ?? p.buttonCaption,
      buttonLink: p.button_link ?? p.buttonLink,
      buttonLinkTarget: p.button_link_target ?? p.buttonLinkTarget,
      headerColor: p.header_color ?? p.headerColor,
      headerTextColor: p.header_text_color ?? p.headerTextColor,
      buttonColor: p.button_color ?? p.buttonColor,
      planId: p.plan_id ?? p.planId,
      priceAmount: p.price_amount ?? p.priceAmount,
    })),
    tables: (raw.tables || []).map((t: any) => ({
      ...t,
      showWidgetTitle: t.show_widget_title ?? t.showWidgetTitle,
      widgetTitle: t.widget_title ?? t.widgetTitle,
      widgetTitleCaption: t.widget_title_caption ?? t.widgetTitleCaption,
      widgetTitleColor: t.widget_title_color ?? t.widgetTitleColor,
      widgetCaptionColor: t.widget_caption_color ?? t.widgetCaptionColor,
    })),
    cards: (raw.cards || []).map((c: any) => ({
      ...c,
      imageUrl: c.image_url ?? c.imageUrl,
      titleCaption: c.title_caption ?? c.titleCaption,
      priceCaption: c.price_caption ?? c.priceCaption,
      priceAmount: c.price_amount ?? c.priceAmount,
      priceColor: c.price_color ?? c.priceColor,
      buttonText: c.button_text ?? c.buttonText,
      buttonCaption: c.button_caption ?? c.buttonCaption,
      buttonLink: c.button_link ?? c.buttonLink,
      buttonLinkTarget: c.button_link_target ?? c.buttonLinkTarget,
      planId: c.plan_id ?? c.planId,
      useCustomPriceText: c.use_custom_price_text ?? c.useCustomPriceText,
      customPriceText: c.custom_price_text ?? c.customPriceText,
    })),
  };
}

const Widget: React.FC<{ widgetId: string }> = ({ widgetId }) => {
  const [content, setContent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actualWidgetId, setActualWidgetId] = useState<string>('');
  const [routerWidgetIds, setRouterWidgetIds] = useState<string[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<CheckoutPlan | null>(null);
  const [showPaymentFlow, setShowPaymentFlow] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentTransactionId, setPaymentTransactionId] = useState<string>('');
  const newPreviewRootRef = useRef<HTMLDivElement | null>(null);

  // Check for PayPal/Lemon Squeezy return
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const paymentSuccess = urlParams.get('payment_success');
    const transactionId = urlParams.get('transaction_id');
    
    if (paymentSuccess === 'true' && transactionId) {
      setPaymentSuccess(true);
      setPaymentTransactionId(transactionId);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const newWidgetPlans = useMemo(() => {
    if (!content?.data || !NEW_PRICING_TYPES.has(content?.type)) return [];
    return collectCheckoutPlans(content.data);
  }, [content]);

  const newWidgetPaymentEnabled = useMemo(() => {
    if (!content?.data || !NEW_PRICING_TYPES.has(content?.type)) return false;
    return shouldUseNewWidgetPayment(content.data, newWidgetPlans);
  }, [content, newWidgetPlans]);

  useEffect(() => {
    let cancelled = false;

    if (widgetId === MOCK_NEW_PRICING_ID) {
      setActualWidgetId(MOCK_NEW_PRICING_ID);
      setContent({
        type: 'new_pricing_widget',
        data: MOCK_NEW_PRICING_WIDGET,
      });
      setLoading(false);
      return;
    }

    if (!widgetId || widgetId === 'undefined' || widgetId.trim() === '') {
      setLoading(false);
      return;
    }

    const publicTemplateUrls = [
      `https://esign-admin.signmary.com/api/widgets/new-pricing-widget/public/${widgetId}/`,
      `https://mypowerly.com/v1/api/widgets/new-pricing-widget/public/${widgetId}/`,
    ];

    const legacyWidgetUrls = [
      `https://esign-admin.signmary.com/api/widgets/widget-data/public/${widgetId}/`,
      `https://mypowerly.com/v1/api/widgets/widget-data/public/${widgetId}/`,
    ];

    const tryJsonFetch = async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return res.json();
    };

    const loadContent = async () => {
      try {
        for (const apiUrl of publicTemplateUrls) {
          try {
            console.log('Trying new pricing public template endpoint:', apiUrl);
            const result = await tryJsonFetch(apiUrl);
            const normalizedDoc = normalizeTemplateDoc(unwrapTemplatePayload(result));

            if (hasRenderableNewPricingDoc(normalizedDoc)) {
              if (cancelled) return;
              const candidateIds = collectRouterWidgetIds(widgetId, result, normalizedDoc);
              for (const legacyUrl of legacyWidgetUrls) {
                try {
                  const legacyResult = await tryJsonFetch(legacyUrl);
                  candidateIds.push(...collectRouterWidgetIds(widgetId, legacyResult, legacyResult?.data, legacyResult?.data?.data));
                  break;
                } catch (legacyErr) {
                  console.warn(`Legacy widget id lookup failed for ${legacyUrl}:`, legacyErr);
                }
              }
              const uniqueCandidateIds = Array.from(new Set(candidateIds));
              setRouterWidgetIds(uniqueCandidateIds);
              setActualWidgetId(resolveRouterWidgetId(result, widgetId));
              setContent({
                type: 'new_pricing_template',
                data: normalizedDoc,
              });
              setLoading(false);
              return;
            }
          } catch (err) {
            console.warn(`New pricing template fetch failed for ${apiUrl}:`, err);
          }
        }

        for (const apiUrl of legacyWidgetUrls) {
          try {
            console.log('Trying legacy widget endpoint:', apiUrl);
            const result = await tryJsonFetch(apiUrl);
            const widget = result?.data;
            const innerData = widget?.data;
            const appearance = innerData?.appearance;
            const widgetType = widget?.type;

            if (!widget) {
              throw new Error('Legacy widget response missing data payload');
            }

            if (cancelled) return;
            setActualWidgetId(widget?.id || widgetId);
            setRouterWidgetIds(collectRouterWidgetIds(widgetId, result, widget, innerData));

            if (widgetType === 'pricing_columns') {
              // pricing_columns uses cards array — keep normalizeWidgetData, not normalizeTemplateDoc
              setContent({
                type: 'pricing_columns',
                data: normalizeWidgetData(innerData),
                appearance: normalizeAppearance(appearance),
              });
            } else if (NEW_PRICING_TYPES.has(widgetType) || innerData?.config_json) {
              const normalizedDoc = normalizeTemplateDoc(unwrapTemplatePayload(innerData));
              setContent({
                type: widgetType || 'new_pricing_widget',
                data: normalizedDoc,
              });
            } else {
              setContent({
                type: widgetType,
                data: normalizeWidgetData(innerData),
                appearance: normalizeAppearance(appearance),
              });
            }

            setLoading(false);
            return;
          } catch (err) {
            console.warn(`Legacy widget fetch failed for ${apiUrl}:`, err);
          }
        }

        if (!cancelled) {
          setContent(null);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load widget:', err);
        if (!cancelled) {
          setContent(null);
          setLoading(false);
        }
      }
    };

    setLoading(true);
    setContent(null);
    loadContent();

    return () => {
      cancelled = true;
    };
  }, [widgetId]);

  useEffect(() => {
    setSelectedPlan(null);
    setShowPaymentFlow(false);
  }, [widgetId]);

  const handleNewWidgetButtonCapture: React.MouseEventHandler<HTMLDivElement> = (event) => {
    if (!newWidgetPaymentEnabled || showPaymentFlow) return;
    const target = event.target as HTMLElement | null;
    const clickedButton = target?.closest('button');
    if (!clickedButton) return;

    const explicitPlanId = `${clickedButton.getAttribute('data-plan-id') || ''}`.trim();
    const explicitPaymentType = `${clickedButton.getAttribute('data-payment-type') || ''}`.trim().toLowerCase();
    const explicitInterval = `${clickedButton.getAttribute('data-interval') || ''}`.trim().toLowerCase();
    const explicitPrice = `${clickedButton.getAttribute('data-price') || ''}`.trim();
    const rawCurrency = `${clickedButton.getAttribute('data-currency') || ''}`.trim();
    const explicitCurrency = rawCurrency ? normalizeCurrencyCode(rawCurrency) : '';
    const explicitGateway = normalizeGatewaySlug(clickedButton.getAttribute('data-payment-gateway'));
    const explicitTrialDays = Number(clickedButton.getAttribute('data-trial-days'));
    const explicitProration = `${clickedButton.getAttribute('data-proration-behavior') || ''}`.trim();

    // Try to find price from nearest price-block in the DOM if not in data attribute
    const resolvePrice = (): string => {
      if (explicitPrice) return explicitPrice.replace(/[^0-9.]/g, '');
      // walk up DOM tree to find a price-block sibling
      let el: HTMLElement | null = clickedButton;
      while (el) {
        // look for a data-price attribute on any ancestor or sibling
        const priceEl = el.querySelector('[data-price]');
        if (priceEl) return (priceEl.getAttribute('data-price') || '').replace(/[^0-9.]/g, '');
        // look for text that looks like a price (e.g. "$4,990" or "4990")
        const allText = el.querySelectorAll('span, div, p');
        for (const t of Array.from(allText)) {
          const txt = (t.textContent || '').trim();
          const match = txt.match(/^\$?([\d,]+(?:\.\d{1,2})?)$/);
          if (match) return match[1].replace(/,/g, '');
        }
        el = el.parentElement;
        if (el === document.body) break;
      }
      return '0.00';
    };

    if (explicitPlanId) {
      event.preventDefault();
      event.stopPropagation();
      const matchedPlan = newWidgetPlans.find(p => p.planId === explicitPlanId);
      setSelectedPlan({
        planId: explicitPlanId,
        buttonText: matchedPlan?.buttonText || `${clickedButton.textContent || ''}`.trim(),
        paymentType: explicitPaymentType || matchedPlan?.paymentType || 'one_time',
        interval: explicitInterval || matchedPlan?.interval || undefined,
        price: matchedPlan?.price || resolvePrice(),
        currency: explicitCurrency || matchedPlan?.currency || normalizeCurrencyCode(content.data?.currency || content.data?.globalCurrency),
        paymentGateway: explicitGateway || matchedPlan?.paymentGateway || getDocPaymentGateway(content.data),
        trialDays: Number.isFinite(explicitTrialDays) && explicitTrialDays > 0 ? explicitTrialDays : matchedPlan?.trialDays,
        prorationBehavior: explicitProration || matchedPlan?.prorationBehavior,
      });
      setShowPaymentFlow(true);
      return;
    }

    const label = `${clickedButton.textContent || ''}`.trim();
    if (!label) return;

    const exactMatch = newWidgetPlans.find((plan) => plan.buttonText && plan.buttonText === label);
    const fallbackPlan = exactMatch || newWidgetPlans[0];
    if (!fallbackPlan) return;

    event.preventDefault();
    event.stopPropagation();

    setSelectedPlan({
      planId: fallbackPlan.planId,
      buttonText: fallbackPlan.buttonText,
      paymentType: fallbackPlan.paymentType || 'one_time',
      interval: fallbackPlan.interval,
      price: fallbackPlan.price || resolvePrice(),
      currency: fallbackPlan.currency || normalizeCurrencyCode(content.data?.currency || content.data?.globalCurrency),
      paymentGateway: fallbackPlan.paymentGateway || getDocPaymentGateway(content.data),
      trialDays: fallbackPlan.trialDays,
      prorationBehavior: fallbackPlan.prorationBehavior,
    });
    setShowPaymentFlow(true);
  };

  if (loading) {
    return (
      <div style={{
        padding: isEmbedMode() ? '20px' : '60px',
        textAlign: 'center',
        color: '#666',
        fontSize: '16px',
        background: isEmbedMode() ? 'transparent' : 'white'
      }}>
        Loading your pricing widget...
      </div>
    );
  }

  if (!content) {
    return (
      <div style={{
        padding: isEmbedMode() ? '20px' : '60px',
        textAlign: 'center',
        color: '#ef4444',
        fontSize: '16px',
        background: isEmbedMode() ? 'transparent' : 'white'
      }}>
        Widget not found or invalid ID
      </div>
    );
  }

  // Show success screen if returning from PayPal/Lemon Squeezy
  if (paymentSuccess) {
    return (
      <div style={{ maxWidth: '400px', margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '64px', marginBottom: '20px' }}>✅</div>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '12px', color: '#10b981' }}>
          Payment Successful!
        </h2>
        <p style={{ color: '#6b7280', marginBottom: '20px' }}>
          Your payment has been processed successfully.
        </p>
        {paymentTransactionId && (
          <p style={{ fontSize: '14px', color: '#9ca3af' }}>
            Transaction ID: {paymentTransactionId}
          </p>
        )}
        <button
          onClick={() => {
            setPaymentSuccess(false);
            setPaymentTransactionId('');
          }}
          style={{
            marginTop: '30px',
            padding: '12px 24px',
            background: '#7c3aed',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '500'
          }}
        >
          Back to Plans
        </button>
      </div>
    );
  }

  if (
    NEW_PRICING_TYPES.has(content.type)
    && showPaymentFlow
    && selectedPlan
    && newWidgetPaymentEnabled
  ) {
    return (
      <PaymentFlow
        widgetId={actualWidgetId}
        widgetIds={routerWidgetIds}
        planId={selectedPlan.planId}
        paymentType={selectedPlan.paymentType || 'one_time'}
        interval={selectedPlan.paymentType === 'subscription' ? selectedPlan.interval : undefined}
        amount={selectedPlan.price || '0.00'}
        currency={selectedPlan.currency || normalizeCurrencyCode(content.data?.currency || content.data?.globalCurrency)}
        targetGateway={selectedPlan.paymentGateway || getDocPaymentGateway(content.data)}
        trialDays={selectedPlan.trialDays}
        prorationBehavior={selectedPlan.prorationBehavior}
        useNewPaymentApi
        paymentMethod={content.data?.payment_method === 'stripe_direct' ? 'stripe_direct' : 'vault'}
        onBack={() => {
          setShowPaymentFlow(false);
          setSelectedPlan(null);
        }}
      />
    );
  }

  const widgetBg = content?.appearance?.widgetBackgroundColor ?? (isEmbedMode() ? 'transparent' : 'white');

  return (
    <div style={{ background: widgetBg }}>
      {content.type === 'pricing_columns' ? (
        <PricingCardPreview data={content.data} appearance={content.appearance} widgetId={actualWidgetId} />
      ) : content.type === 'comparison_table' ? (
        <ComparisonTablePreview data={content.data} appearance={content.appearance} widgetId={actualWidgetId} />
      ) : NEW_PRICING_TYPES.has(content.type) ? (
        content.data ? (
          <div ref={newPreviewRootRef} onClickCapture={handleNewWidgetButtonCapture}>
            <NewPricingTemplatePreview doc={content.data} />
          </div>
        ) : (
          <div style={{
            padding: isEmbedMode() ? '20px' : '60px',
            textAlign: 'center',
            color: '#ef4444',
            background: isEmbedMode() ? 'transparent' : 'white'
          }}>
            New pricing widget data is empty or invalid
          </div>
        )
      ) : (
        <div style={{
          padding: isEmbedMode() ? '20px' : '60px',
          textAlign: 'center',
          color: '#ef4444',
          background: isEmbedMode() ? 'transparent' : 'white'
        }}>
          Unsupported widget type: {content.type}
        </div>
      )}
    </div>
  );
};

export default Widget;

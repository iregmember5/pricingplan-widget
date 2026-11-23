import React, { useMemo, useRef, useState, useEffect } from 'react';
import { ComparisonTablePreview } from './previews/ComparisonTablePreview';
import { PricingCardPreview } from './previews/PricingCardPreview';
import NewPricingTemplatePreview, { normalizeTemplateDoc } from './previews/NewPricingTemplatePreview';
import { PaymentFlow } from './PaymentFlow';
import { ManualInvoiceFlow } from './ManualInvoiceFlow';
import { MOCK_NEW_PRICING_WIDGET } from './mockNewPricingWidget';
import { API_BASE_URL } from './apiConfig';

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
  planName?: string;
  planFeatures?: string[];
  billingText?: string;
  savingsText?: string;
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

// Resolve an entry's price in dollars. Zero is a real price (free plan) and
// must survive — a plan with price 0 / price_amount 0 returns "0.00", not undefined.
function resolveEntryPrice(entry: any): string | undefined {
  const minor = entry?.price_amount ?? entry?.priceAmount;
  if (minor != null && Number.isFinite(Number(minor))) {
    return (Number(minor) / 100).toFixed(2);
  }
  if (entry?.price != null && `${entry.price}`.trim() !== '') {
    const cleaned = `${entry.price}`.trim().replace(/[^0-9.]/g, '');
    if (cleaned !== '') return cleaned;
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

  const getPlanFeatures = (entry: any): string[] => {
    const raw = entry?.features ?? entry?.included_features ?? entry?.includedFeatures;
    const clean = (features: string[]) => features
      .map((feature) => feature.trim().replace(/^everything in .*?plus:\s*/i, '').trim())
      .filter((feature) => feature && !/^(includes?:?)$/i.test(feature) && !/^billed annually/i.test(feature) && !/save\s+\$?\d/i.test(feature))
      .slice(0, 3);
    if (Array.isArray(raw)) return clean(raw.map((feature) => typeof feature === 'string' ? feature : feature?.text || feature?.label || '').filter(Boolean));
    if (typeof raw === 'string') return clean(raw.split(/\r?\n/));
    return [];
  };
  const getBillingCopy = (entry: any) => {
    const explicitBilling = `${entry?.billingText || entry?.billing_text || entry?.billing_period || ''}`.trim();
    const rawFeatures = entry?.features ?? entry?.included_features ?? entry?.includedFeatures;
    const featureLines = Array.isArray(rawFeatures) ? rawFeatures.map((feature) => typeof feature === 'string' ? feature : feature?.text || feature?.label || '') : typeof rawFeatures === 'string' ? rawFeatures.split(/\r?\n/) : [];
    const savingsSource = `${entry?.savingsText || entry?.savings_text || featureLines.find((feature) => /save\s+\$?\d/i.test(feature)) || ''}`.trim();
    const savingsAmount = savingsSource.match(/save\s+(\$?\s?[\d,.]+)/i)?.[1]?.replace(/\s/g, '');
    const savings = savingsAmount ? `Save ${savingsAmount} with annual billing` : savingsSource;
    const interval = `${entry?.interval || docInterval || ''}`.trim().toLowerCase();
    const billingHint = featureLines.find((feature) => /billed annually|annual billing/i.test(feature));
    const billing = explicitBilling || (billingHint ? 'Billed annually' : interval ? `Billed ${interval === 'year' ? 'annually' : interval === 'month' ? 'monthly' : interval}` : 'One-time payment');
    return { billingText: billing, savingsText: savings };
  };

  const pushPlan = (entry: any) => {
    if (!isObject(entry)) return;
    const planId = `${entry.planId || entry.plan_id || entry.id || ''}`.trim();
    if (!planId || seen.has(planId)) return;
    seen.add(planId);
    const billingCopy = getBillingCopy(entry);
    plans.push({
      planId,
      planName: `${entry.name || entry.plan_name || entry.title || ''}`.trim(),
      planFeatures: getPlanFeatures(entry),
      ...billingCopy,
      buttonText: `${entry.buttonText || entry.button_text || entry.text || ''}`.trim(),
      paymentType: `${entry.paymentType || entry.payment_type || docPaymentType || ''}`.trim().toLowerCase() || undefined,
      interval: `${entry.interval || docInterval || ''}`.trim().toLowerCase() || undefined,
      price: resolveEntryPrice(entry),
      currency: normalizeCurrencyCode(entry.currency, docCurrency),
      paymentGateway: normalizeGatewaySlug(entry.payment_gateway ?? entry.paymentGateway) || docPaymentGateway,
      trialDays: getTrialDays(entry),
      prorationBehavior: `${entry.proration_behavior || entry.prorationBehavior || docProrationBehavior || ''}`.trim() || undefined,
    });
  };

  if (Array.isArray(doc?.plans)) {
    doc.plans.forEach(pushPlan);
  }
  // Tiered-slider widgets keep their plans inside tiered_config.pro.tiers
  // (the free card is intentionally excluded — it has no paid plan).
  const tieredConfig = doc?.tiered_config ?? doc?.tieredConfig;
  const tieredPro = isObject(tieredConfig) ? (tieredConfig.pro ?? tieredConfig?.pro) : null;
  const tieredTiers = isObject(tieredPro) ? (tieredPro.tiers ?? tieredPro?.tiers) : null;
  if (Array.isArray(tieredTiers)) {
    tieredTiers.forEach(pushPlan);
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
      const billingCopy = getBillingCopy(node);
      activePlan = {
        planId: `${node.planId || node.id}`.trim(),
        planName: `${node.planName || node.plan_name || node.title || node.name || ''}`.trim(),
        planFeatures: getPlanFeatures(node),
        ...billingCopy,
        priceAmount: node.priceAmount ?? node.price_amount,
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
        const billingCopy = getBillingCopy(node);
        plans.push({
          planId,
          planName: `${node.planName || node.plan_name || node.title || activePlan?.planName || ''}`.trim(),
          planFeatures: getPlanFeatures(node).length ? getPlanFeatures(node) : (activePlan?.planFeatures || []),
          billingText: billingCopy.billingText || activePlan?.billingText,
          savingsText: billingCopy.savingsText || activePlan?.savingsText,
          buttonText: `${node.text || node.buttonText || ''}`.trim(),
          paymentType: `${node.paymentType || node.payment_type || activePlan?.paymentType || docPaymentType || ''}`.trim().toLowerCase() || undefined,
          interval: `${node.interval || activePlan?.interval || docInterval || ''}`.trim().toLowerCase() || undefined,
          price: resolveEntryPrice(node) ?? resolveEntryPrice(activePlan),
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

// Strict: only true when a price is explicitly present AND parses to <= 0.
// A missing/blank price means "not a priced entry" (e.g. a plain link
// button), not "free" — that distinction matters below, where treating every
// unpriced link as "free" would wrongly disable payment mode entirely for
// widgets that legitimately don't set a price anywhere.
function isExplicitFreePrice(price: any) {
  if (price == null || `${price}`.trim() === '') return false;
  const parsed = Number.parseFloat(`${price}`.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) && parsed <= 0;
}

function hasCustomLinksInDoc(doc: any) {
  const hasLinkOnEntry = (entry: any) => {
    if (!isObject(entry)) return false;
    const hasLink = ['buttonLink', 'href', 'url', 'link'].some((key) => `${entry?.[key] || ''}`.trim().length > 0);
    if (!hasLink) return false;
    // A link on an explicitly free ($0) plan/button is just the redirect-
    // instead-of-$0-checkout escape hatch — it must not disable payment mode
    // for the rest of the (paid) plans/buttons in the same widget.
    const priceSource = entry?.price ?? entry?.priceAmount ?? entry?.price_amount;
    if (isExplicitFreePrice(priceSource)) return false;
    return true;
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
  if (buttonAction === 'payment_link') return false;
  if (buttonAction === 'manual_invoice') return false;
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
  const [showManualInvoice, setShowManualInvoice] = useState(false);
  const [invoicePlan, setInvoicePlan] = useState<{ planId: string; planName: string; price?: string; currency?: string } | null>(null);
  const newPreviewRootRef = useRef<HTMLDivElement | null>(null);

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
      `${API_BASE_URL}/widgets/new-pricing-widget/public/${widgetId}/`,
    ];

    const legacyWidgetUrls = [
      `${API_BASE_URL}/widgets/widget-data/public/${widgetId}/`,
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
              // A successful new-pricing lookup is already authoritative. Do
              // not probe the legacy widget-data endpoint with this pricing
              // widget ID: it is a different model and commonly returns 404.
              const candidateIds = collectRouterWidgetIds(widgetId, result, normalizedDoc);
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
    setShowManualInvoice(false);
    setInvoicePlan(null);
  }, [widgetId]);

  const handleNewWidgetButtonCapture: React.MouseEventHandler<HTMLDivElement> = (event) => {
    const target = event.target as HTMLElement | null;
    const clickedButton = target?.closest('button');
    if (!clickedButton) return;

    // ── Action routing (works regardless of payment mode) ───────────────────
    const action = `${clickedButton.getAttribute('data-action') || ''}`.trim().toLowerCase();

    if (action === 'payment_link') {
      event.preventDefault();
      event.stopPropagation();
      const paymentLink = `${clickedButton.getAttribute('data-payment-link') || ''}`.trim();
      if (paymentLink) {
        window.open(paymentLink, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    if (action === 'manual_invoice') {
      event.preventDefault();
      event.stopPropagation();
      const planId = `${clickedButton.getAttribute('data-plan-id') || ''}`.trim();
      const matchedPlan = planId ? newWidgetPlans.find(p => p.planId === planId) : undefined;
      setInvoicePlan({
        planId: planId || matchedPlan?.planId || 'default',
        planName: matchedPlan?.buttonText || `${clickedButton.textContent || ''}`.trim(),
        price: matchedPlan?.price || `${clickedButton.getAttribute('data-price') || ''}`.trim().replace(/[^0-9.]/g, ''),
        currency: matchedPlan?.currency || normalizeCurrencyCode(clickedButton.getAttribute('data-currency') || content.data?.currency || content.data?.globalCurrency),
      });
      setShowManualInvoice(true);
      return;
    }

    if (!newWidgetPaymentEnabled || showPaymentFlow) return;

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
      // walk up DOM tree to find a price-block sibling — but stay inside THIS
      // plan's card: once an ancestor contains other plan buttons, any price
      // found there could belong to a sibling plan (e.g. a free card would
      // pick up the next card's price), so stop and treat the plan as free.
      let el: HTMLElement | null = clickedButton;
      while (el) {
        const buttonsInScope = el.querySelectorAll('button');
        const containsOtherButtons = Array.from(buttonsInScope).some((b) => b !== clickedButton);
        if (containsOtherButtons) break;
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
        planName: matchedPlan?.planName || matchedPlan?.buttonText || '',
        planFeatures: matchedPlan?.planFeatures || [],
        billingText: matchedPlan?.billingText,
        savingsText: matchedPlan?.savingsText,
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
      planName: fallbackPlan.planName || fallbackPlan.buttonText || '',
      planFeatures: fallbackPlan.planFeatures || [],
      billingText: fallbackPlan.billingText,
      savingsText: fallbackPlan.savingsText,
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

  if (
    NEW_PRICING_TYPES.has(content.type)
    && showManualInvoice
    && invoicePlan
  ) {
    return (
      <ManualInvoiceFlow
        widgetId={actualWidgetId}
        widgetIds={routerWidgetIds}
        planId={invoicePlan.planId}
        planName={invoicePlan.planName}
        amount={invoicePlan.price || '0.00'}
        currency={invoicePlan.currency || normalizeCurrencyCode(content.data?.currency || content.data?.globalCurrency)}
        onBack={() => {
          setShowManualInvoice(false);
          setInvoicePlan(null);
        }}
        onDone={() => {
          setShowManualInvoice(false);
          setInvoicePlan(null);
        }}
      />
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
        widgetKind="new"
        planId={selectedPlan.planId}
        planName={selectedPlan.planName}
        planFeatures={selectedPlan.planFeatures}
        billingText={selectedPlan.billingText}
        savingsText={selectedPlan.savingsText}
        amount={selectedPlan.price}
        currency={selectedPlan.currency || normalizeCurrencyCode(content.data?.currency || content.data?.globalCurrency)}
        supportEmail={content.data?.support_email || content.data?.supportEmail}
        paymentType={selectedPlan.paymentType || 'one_time'}
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

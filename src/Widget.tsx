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
]);

function hasRenderableNewPricingDoc(doc: any) {
  return !!(doc && typeof doc === 'object' && (doc.layout || (Array.isArray(doc.plans) && doc.plans.length >= 0)));
}

function isEmbedMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get('embed') === 'true' || window.location.pathname.startsWith('/embed/');
}

function isObject(value: any): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function collectCheckoutPlans(doc: any) {
  const plans: Array<{ planId: string; buttonText: string; paymentType?: string; interval?: string }> = [];
  const seen = new Set<string>();

  const pushPlan = (entry: any) => {
    if (!isObject(entry)) return;
    const planId = `${entry.planId || entry.id || ''}`.trim();
    if (!planId || seen.has(planId)) return;
    seen.add(planId);
    plans.push({
      planId,
      buttonText: `${entry.buttonText || entry.text || ''}`.trim(),
      paymentType: `${entry.paymentType || doc?.paymentType || ''}`.trim().toLowerCase() || undefined,
      interval: `${entry.interval || doc?.interval || ''}`.trim().toLowerCase() || undefined,
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
        paymentType: `${node.paymentType || doc?.paymentType || ''}`.trim().toLowerCase() || undefined,
        interval: `${node.interval || doc?.interval || ''}`.trim().toLowerCase() || undefined,
      };
    }

    if (node.type === 'button') {
      const planId = `${node.planId || node.id || activePlan?.planId || ''}`.trim();
      if (planId && !seen.has(planId)) {
        seen.add(planId);
        plans.push({
          planId,
          buttonText: `${node.text || node.buttonText || ''}`.trim(),
          paymentType: `${node.paymentType || activePlan?.paymentType || doc?.paymentType || ''}`.trim().toLowerCase() || undefined,
          interval: `${node.interval || activePlan?.interval || doc?.interval || ''}`.trim().toLowerCase() || undefined,
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
  const gateway = `${doc?.payment_gateway || ''}`.trim().toLowerCase();
  const buttonAction = `${doc?.globalButtonAction || ''}`.trim().toLowerCase();

  if (buttonAction === 'link') return false;
  if (gateway === 'stripe' || buttonAction === 'payment') return true;

  // Fallback for older saved templates: if they expose plan targets and no custom links,
  // treat buttons as payment CTAs.
  return plans.length > 0 && !hasCustomLinksInDoc(doc);
}

const Widget: React.FC<{ widgetId: string }> = ({ widgetId }) => {
  const [content, setContent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actualWidgetId, setActualWidgetId] = useState<string>('');
  const [selectedPlan, setSelectedPlan] = useState<{ planId: string; paymentType?: string; interval?: string } | null>(null);
  const [showPaymentFlow, setShowPaymentFlow] = useState(false);
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
      `https://mypowerly.com/v1/api/widgets/new-pricing-widget/public/${widgetId}/`,
      `https://esign-admin.signmary.com/api/widgets/new-pricing-widget/public/${widgetId}/`,
    ];

    const legacyWidgetUrls = [
      `https://mypowerly.com/v1/api/widgets/widget-data/public/${widgetId}/`,
      `https://esign-admin.signmary.com/api/widgets/widget-data/public/${widgetId}/`,
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
            const normalizedDoc = normalizeTemplateDoc(result);

            if (hasRenderableNewPricingDoc(normalizedDoc)) {
              if (cancelled) return;
              setActualWidgetId(result?.id || widgetId);
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

            if (NEW_PRICING_TYPES.has(widgetType) || innerData?.config_json) {
              const normalizedDoc = normalizeTemplateDoc(innerData);
              setContent({
                type: widgetType || 'new_pricing_widget',
                data: normalizedDoc,
              });
            } else {
              setContent({
                type: widgetType,
                data: innerData,
                appearance,
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

    if (explicitPlanId) {
      event.preventDefault();
      event.stopPropagation();
      setSelectedPlan({
        planId: explicitPlanId,
        paymentType: explicitPaymentType || 'one_time',
        interval: explicitInterval || undefined,
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
      paymentType: fallbackPlan.paymentType || 'one_time',
      interval: fallbackPlan.interval,
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
    && showPaymentFlow
    && selectedPlan
    && newWidgetPaymentEnabled
  ) {
    return (
      <PaymentFlow
        widgetId={actualWidgetId}
        planId={selectedPlan.planId}
        paymentType={selectedPlan.paymentType || 'one_time'}
        interval={selectedPlan.paymentType === 'subscription' ? selectedPlan.interval : undefined}
        useNewPaymentApi
        onBack={() => {
          setShowPaymentFlow(false);
          setSelectedPlan(null);
        }}
      />
    );
  }

  return (
    <div style={{ background: isEmbedMode() ? 'transparent' : 'white' }}>
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



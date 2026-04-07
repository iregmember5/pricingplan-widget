import React, { useState, useEffect } from 'react';
import { ComparisonTablePreview } from './previews/ComparisonTablePreview';
import { PricingCardPreview } from './previews/PricingCardPreview';
import NewPricingTemplatePreview, { normalizeTemplateDoc } from './previews/NewPricingTemplatePreview';
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

const Widget: React.FC<{ widgetId: string }> = ({ widgetId }) => {
  const [content, setContent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actualWidgetId, setActualWidgetId] = useState<string>('');

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

  return (
    <div style={{ background: isEmbedMode() ? 'transparent' : 'white' }}>
      {content.type === 'pricing_columns' ? (
        <PricingCardPreview data={content.data} appearance={content.appearance} widgetId={actualWidgetId} />
      ) : content.type === 'comparison_table' ? (
        <ComparisonTablePreview data={content.data} appearance={content.appearance} widgetId={actualWidgetId} />
      ) : NEW_PRICING_TYPES.has(content.type) ? (
        content.data ? (
          <NewPricingTemplatePreview doc={content.data} />
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

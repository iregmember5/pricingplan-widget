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

const Widget: React.FC<{ widgetId: string }> = ({ widgetId }) => {
  const [content, setContent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actualWidgetId, setActualWidgetId] = useState<string>('');

  const isEmbedMode = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('embed') === 'true' || window.location.pathname.startsWith('/embed/');
  };

  useEffect(() => {
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

    const apiUrls = [
      `https://mypowerly.com/v1/api/widgets/widget-data/public/${widgetId}/`,
      `https://esign-admin.signmary.com/api/widgets/widget-data/public/${widgetId}/`
    ];

    let fetchAttempt = 0;

    const tryFetch = () => {
      const apiUrl = apiUrls[fetchAttempt];
      console.log('Fetching widget from:', apiUrl);

      fetch(apiUrl)
        .then(res => {
          if (!res.ok) throw new Error('Widget not found');
          return res.json();
        })
        .then(result => {
          console.log('API Response:', result);

          const widget = result?.data;
          const innerData = widget?.data;
          const appearance = innerData?.appearance;
          const widgetType = widget?.type;

          setActualWidgetId(widget?.id || widgetId);

          if (NEW_PRICING_TYPES.has(widgetType)) {
            const normalizedDoc = normalizeTemplateDoc(innerData);
            setContent({
              type: widgetType,
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
        })
        .catch(err => {
          console.error(`Failed to load from ${apiUrl}:`, err);
          fetchAttempt++;
          if (fetchAttempt < apiUrls.length) {
            tryFetch();
          } else {
            setContent(null);
            setLoading(false);
          }
        });
    };

    tryFetch();
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

import React, { useEffect, useState } from 'react';
import FormRenderer from './FormRenderer';

interface FormWidgetProps {
  widgetId: string;
}

// Map API response (snake_case) to FormRenderer expected shape
function normalizeConfig(data: any) {
  return {
    id: data.id,
    name: data.name,
    title: data.title,
    description: data.description,
    success_message: data.success_msg || data.success_message || 'Thank you for your submission!',
    fields: data.widget_fields || data.fields || [],
    theme: data.theme || {},
    submitButton: data.submit_button || data.submitButton || {},
    displaySettings: data.display_settings || data.displaySettings || {},
    header: data.header,
    footer: data.footer,
    fontFamily: data.font_family || data.fontFamily || 'system-ui, sans-serif',
    titleSize: data.title_size || data.titleSize || '24px',
    textSize: data.text_size || data.textSize || '16px',
    post_submit_action: data.post_submit_action,
    redirect_url: data.redirect_url,
  };
}

const FormWidget: React.FC<FormWidgetProps> = ({ widgetId }) => {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`https://esign-admin.signmary.com/api/widgets/form-widgets/public/${widgetId}/`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load form');
        return res.json();
      })
      .then(data => setConfig(normalizeConfig(data)))
      .catch(err => setError(err.message || 'Failed to load form'))
      .finally(() => setLoading(false));
  }, [widgetId]);

  if (loading) return (
    <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{
        display: 'inline-block', width: '40px', height: '40px',
        border: '4px solid #f3f4f6', borderTopColor: '#3b82f6',
        borderRadius: '50%', animation: 'spin 1s linear infinite'
      }} />
      <p style={{ marginTop: '16px', color: '#6b7280' }}>Loading form...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
      <h3 style={{ color: '#dc2626', marginBottom: '8px' }}>Failed to Load Form</h3>
      <p style={{ color: '#6b7280' }}>{error}</p>
    </div>
  );

  if (!config) return null;

  return <FormRenderer config={config} />;
};

export default FormWidget;

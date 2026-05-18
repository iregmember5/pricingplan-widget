import React, { useState } from 'react';

const FormRenderer: React.FC<{ config: any }> = ({ config }) => {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const theme = config.theme || {};
  const submitButton = config.submitButton || {};
  const primaryColor = theme.primary_color || '#3b82f6';
  const bgColor = theme.background_color || '#ffffff';
  const textColor = theme.text_color || '#111827';

  const handleChange = (fieldId: string, value: any) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
    setErrors(prev => { const e = { ...prev }; delete e[fieldId]; return e; });
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    (config.fields || []).forEach((field: any) => {
      if (field.required && !formData[field.id]) {
        newErrors[field.id] = 'This field is required';
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(
        `https://esign-admin.signmary.com/api/widgets/form-widgets/${config.id}/submit/`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) }
      );
      if (!res.ok) throw new Error('Submission failed');
      setIsSubmitted(true);
      setFormData({});
      if (config.post_submit_action === 'REDIRECT_URL' && config.redirect_url) {
        setTimeout(() => window.open(config.redirect_url, '_blank'), 2000);
      } else {
        setTimeout(() => setIsSubmitted(false), 3000);
      }
    } catch {
      alert('Failed to submit. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyle = (fieldId: string) => ({
    width: '100%',
    padding: '10px 12px',
    border: `1px solid ${errors[fieldId] ? '#ef4444' : '#d1d5db'}`,
    borderRadius: '6px',
    fontSize: config.textSize || '16px',
    fontFamily: config.fontFamily || 'inherit',
    outline: 'none',
    boxSizing: 'border-box' as const,
    backgroundColor: '#fff',
    color: textColor,
  });

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '6px',
    fontWeight: '500',
    fontSize: config.textSize || '16px',
    color: textColor,
  };

  const renderField = (field: any) => {
    const key = field.id;
    const error = errors[field.id];
    const label = (
      <label style={labelStyle}>
        {field.label}
        {field.required && <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>}
      </label>
    );
    const errorMsg = error && <p style={{ color: '#ef4444', fontSize: '13px', marginTop: '4px' }}>{error}</p>;

    switch (field.type) {
      case 'short-text':
      case 'email':
      case 'phone':
      case 'number':
        return (
          <div key={key} style={{ marginBottom: '20px' }}>
            {label}
            <input
              type={field.type === 'email' ? 'email' : field.type === 'number' ? 'number' : field.type === 'phone' ? 'tel' : 'text'}
              placeholder={field.placeholder || ''}
              value={formData[field.id] || ''}
              onChange={e => handleChange(field.id, e.target.value)}
              style={inputStyle(field.id)}
            />
            {errorMsg}
          </div>
        );

      case 'long-text':
        return (
          <div key={key} style={{ marginBottom: '20px' }}>
            {label}
            <textarea
              placeholder={field.placeholder || ''}
              value={formData[field.id] || ''}
              onChange={e => handleChange(field.id, e.target.value)}
              rows={4}
              style={{ ...inputStyle(field.id), resize: 'vertical' }}
            />
            {errorMsg}
          </div>
        );

      case 'select':
        return (
          <div key={key} style={{ marginBottom: '20px' }}>
            {label}
            <select
              value={formData[field.id] || ''}
              onChange={e => handleChange(field.id, e.target.value)}
              style={inputStyle(field.id)}
            >
              <option value="">Select an option</option>
              {(field.options || []).map((opt: any, i: number) => (
                <option key={i} value={typeof opt === 'string' ? opt : opt.value}>{typeof opt === 'string' ? opt : opt.label}</option>
              ))}
            </select>
            {errorMsg}
          </div>
        );

      case 'radio':
        return (
          <div key={key} style={{ marginBottom: '20px' }}>
            {label}
            {(field.options || []).map((opt: any, i: number) => {
              const val = typeof opt === 'string' ? opt : opt.value;
              const lbl = typeof opt === 'string' ? opt : opt.label;
              return (
                <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', cursor: 'pointer', color: textColor }}>
                  <input type="radio" name={field.id} value={val} checked={formData[field.id] === val} onChange={() => handleChange(field.id, val)} />
                  {lbl}
                </label>
              );
            })}
            {errorMsg}
          </div>
        );

      case 'checkbox':
        return (
          <div key={key} style={{ marginBottom: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: textColor }}>
              <input type="checkbox" checked={!!formData[field.id]} onChange={e => handleChange(field.id, e.target.checked)} style={{ width: '16px', height: '16px' }} />
              <span style={{ fontWeight: '500' }}>{field.label}{field.required && <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>}</span>
            </label>
            {errorMsg}
          </div>
        );

      case 'checkbox-group':
        return (
          <div key={key} style={{ marginBottom: '20px' }}>
            {label}
            {(field.options || []).map((opt: any, i: number) => {
              const val = typeof opt === 'string' ? opt : opt.value;
              const lbl = typeof opt === 'string' ? opt : opt.label;
              const checked = (formData[field.id] || []).includes(val);
              return (
                <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', cursor: 'pointer', color: textColor }}>
                  <input type="checkbox" checked={checked} onChange={() => {
                    const current = formData[field.id] || [];
                    handleChange(field.id, checked ? current.filter((v: string) => v !== val) : [...current, val]);
                  }} style={{ width: '16px', height: '16px' }} />
                  {lbl}
                </label>
              );
            })}
            {errorMsg}
          </div>
        );

      case 'date':
        return (
          <div key={key} style={{ marginBottom: '20px' }}>
            {label}
            <input type="date" value={formData[field.id] || ''} onChange={e => handleChange(field.id, e.target.value)} style={inputStyle(field.id)} />
            {errorMsg}
          </div>
        );

      case 'time':
        return (
          <div key={key} style={{ marginBottom: '20px' }}>
            {label}
            <input type="time" value={formData[field.id] || ''} onChange={e => handleChange(field.id, e.target.value)} style={inputStyle(field.id)} />
            {errorMsg}
          </div>
        );

      case 'paragraph':
        return (
          <div key={key} style={{ marginBottom: '20px', color: textColor, fontSize: config.textSize || '16px' }}>
            {field.label && <p>{field.label}</p>}
          </div>
        );

      default:
        return (
          <div key={key} style={{ marginBottom: '20px' }}>
            {label}
            <input type="text" placeholder={field.placeholder || ''} value={formData[field.id] || ''} onChange={e => handleChange(field.id, e.target.value)} style={inputStyle(field.id)} />
            {errorMsg}
          </div>
        );
    }
  };

  if (isSubmitted) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f0fdf4', borderRadius: '12px', border: '2px solid #86efac' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
        <h3 style={{ color: '#166534' }}>{config.success_message || 'Thank you for your submission!'}</h3>
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: '600px',
      margin: '0 auto',
      padding: '24px',
      backgroundColor: bgColor,
      borderRadius: '12px',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      fontFamily: config.fontFamily || 'system-ui, sans-serif',
    }}>
      {/* Header */}
      {config.header?.visible !== false && (
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: config.titleSize || '24px', fontWeight: 'bold', color: textColor, margin: '0 0 8px' }}>
            {config.title}
          </h2>
          {config.description && (
            <p style={{ fontSize: config.textSize || '16px', color: '#6b7280', margin: 0 }}>
              {config.description}
            </p>
          )}
        </div>
      )}

      {/* Fields */}
      <form onSubmit={handleSubmit}>
        {(config.fields || []).map((field: any) => renderField(field))}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            width: submitButton.full_width ? '100%' : 'auto',
            padding: `${submitButton.spacing?.vertical ?? 12}px ${submitButton.spacing?.horizontal ?? 24}px`,
            backgroundColor: isSubmitting ? '#9ca3af' : (submitButton.colors?.background || primaryColor),
            color: submitButton.colors?.text || '#ffffff',
            border: `1px solid ${submitButton.colors?.border || 'transparent'}`,
            borderRadius: '6px',
            fontSize: config.textSize || '16px',
            fontWeight: '600',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {isSubmitting ? 'Submitting...' : (submitButton.text || 'Submit')}
        </button>
      </form>

      {/* Footer */}
      {config.footer?.enabled && (
        <div style={{
          marginTop: '24px',
          paddingTop: '16px',
          borderTop: '1px solid #e5e7eb',
          textAlign: config.footer.alignment || 'center',
          fontSize: '14px',
          color: '#6b7280',
        }}>
          {config.footer.text}
        </div>
      )}
    </div>
  );
};

export default FormRenderer;

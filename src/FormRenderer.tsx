import React, { useState, useRef, useEffect } from 'react';
import { API_BASE_URL } from './apiConfig';

// ── Signature Pad ─────────────────────────────────────────────────────────────
const SignaturePad: React.FC<{ fieldId: string; value: string; onChange: (val: string) => void; error?: string }> = ({ fieldId, value, onChange, error }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawing.current = true;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDraw = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL());
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange('');
  };

  return (
    <div style={{ marginBottom: '20px' }}>
      <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
        {/* label passed from parent */}
      </label>
      <div style={{ border: `1px solid ${error ? '#ef4444' : '#2563eb'}`, borderRadius: '6px', overflow: 'hidden', background: '#fff' }}>
        <canvas
          ref={canvasRef}
          width={560}
          height={160}
          style={{ display: 'block', width: '100%', height: '160px', cursor: 'crosshair', touchAction: 'none' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderTop: '1px solid #e5e7eb', background: '#f9fafb' }}>
          <span style={{ fontSize: '12px', color: '#9ca3af' }}>Sign above</span>
          <button type="button" onClick={clear} style={{ fontSize: '12px', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 8px', borderRadius: '4px' }}>
            Clear
          </button>
        </div>
      </div>
      {value && (
        <img src={value} alt="signature preview" style={{ marginTop: '6px', height: '40px', border: '1px solid #e5e7eb', borderRadius: '4px' }} />
      )}
      {error && <p style={{ color: '#ef4444', fontSize: '13px', marginTop: '4px' }}>{error}</p>}
    </div>
  );
};

const API_BASE_URLS = [API_BASE_URL];

const FormRenderer: React.FC<{ config: any }> = ({ config }) => {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [removedGroups, setRemovedGroups] = useState<string[]>([]);

  const pages = config.layout?.type === 'multi-step' ? (config.layout.pages || []) : [];
  const isMultiStep = pages.length > 0;
  const currentPage = isMultiStep ? pages[currentPageIndex] : null;
  const fieldsForCurrentPage = () => {
    const fields = config.fields || [];
    if (!isMultiStep) return fields;
    return (currentPage?.field_ids || [])
      .map((id: string) => fields.find((field: any) => String(field.id) === String(id)))
      .filter(Boolean);
  };

  const theme = config.theme || {};
  const submitButton = config.submitButton || {};
  const primaryColor = theme.primary_color || '#3b82f6';
  const bgColor = theme.background_color || '#ffffff';
  const textColor = theme.text_color || '#111827';

  const handleChange = (fieldId: string, value: any) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
    setErrors(prev => { const e = { ...prev }; delete e[fieldId]; return e; });
  };

  const validate = (fields: any[] = config.fields || []) => {
    const newErrors: Record<string, string> = {};
    fields.forEach((field: any) => {
      const value = formData[field.id];
      if (field.required && (value === undefined || value === null || value === '' || value === false)) {
        newErrors[field.id] = 'This field is required';
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate(fieldsForCurrentPage())) return;
    if (isMultiStep && currentPageIndex < pages.length - 1) {
      setCurrentPageIndex(index => index + 1);
      return;
    }
    setIsSubmitting(true);
    let lastError: Error | null = null;
    for (const base of API_BASE_URLS) {
      try {
        const res = await fetch(
          `${base}/widgets/form-widgets/${config.id}/submit/`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) }
        );
        if (!res.ok) throw new Error('Submission failed');
        setIsSubmitted(true);
        setFormData({});
        setCurrentPageIndex(0);
        setRemovedGroups([]);
        if (config.post_submit_action === 'REDIRECT_URL' && config.redirect_url) {
          setTimeout(() => window.open(config.redirect_url, '_blank'), 2000);
        } else {
          setTimeout(() => setIsSubmitted(false), 3000);
        }
        setIsSubmitting(false);
        return;
      } catch (err: any) {
        console.warn(`[FormRenderer] ${base} submit failed:`, err.message);
        lastError = err;
      }
    }
    alert(lastError?.message || 'Failed to submit. Please try again.');
    setIsSubmitting(false);
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
    fontWeight: '600',
    fontSize: '13px',
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

      case 'signature':
        return (
          <div key={key} style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>
              {field.label}{field.required && <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>}
            </label>
            <SignaturePad
              fieldId={field.id}
              value={formData[field.id] || ''}
              onChange={val => handleChange(field.id, val)}
              error={error}
            />
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

  const renderFieldGridItem = (field: any) => (
    <div key={field.id} style={{ minWidth: 0 }}>{renderField(field)}</div>
  );

  const renderGroupedCard = (groupId: string, title: string, fields: any[]) => {
    if (removedGroups.includes(groupId)) return null;
    return (
      <section key={groupId} style={{ gridColumn: '1 / -1', border: '1px solid #d7e2ec', borderRadius: '16px', padding: '20px', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
          <strong style={{ color: '#17324d', fontSize: '13px' }}>{title}</strong>
          <button type="button" onClick={() => {
            setRemovedGroups(previous => [...previous, groupId]);
            setFormData(previous => {
              const next = { ...previous };
              fields.forEach(field => delete next[field.id]);
              return next;
            });
          }} style={{ padding: '10px 18px', border: '1px solid #9bb5ca', borderRadius: '10px', background: '#fff', color: '#12415f', fontWeight: 600, cursor: 'pointer' }}>Remove</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0 12px' }}>
          {fields.map(renderFieldGridItem)}
        </div>
      </section>
    );
  };

  const renderCurrentPageFields = () => {
    const fields = fieldsForCurrentPage();
    if (currentPage?.id === 'spending') {
      return Array.from({ length: Math.ceil(fields.length / 2) }, (_, index) => {
        const group = fields.slice(index * 2, index * 2 + 2);
        return renderGroupedCard('spending-' + index, group[0]?.label || 'Category ' + (index + 1), group);
      });
    }
    if (currentPage?.id === 'peers') {
      return Array.from({ length: Math.ceil(fields.length / 5) }, (_, index) => {
        const group = fields.slice(index * 5, index * 5 + 5);
        return renderGroupedCard('peer-' + index, 'Peer ' + (index + 1), group);
      });
    }
    return fields.map(renderFieldGridItem);
  };

  const stepLabels: Record<string, string> = {
    firm: 'Firm', spending: 'Spending', peers: 'Peers', referral: 'Referral credit', review: 'Review',
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
      maxWidth: isMultiStep ? '1000px' : '600px',
      width: '100%',
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

      {isMultiStep && (
        <nav aria-label="Form steps" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
          {pages.map((page: any, index: number) => (
            <button key={page.id} type="button" aria-current={currentPageIndex === index ? 'step' : undefined}
              onClick={() => setCurrentPageIndex(index)}
              style={{ border: '1px solid ' + (currentPageIndex === index ? primaryColor : '#9bb5ca'), borderRadius: '10px', padding: '12px 16px', background: currentPageIndex === index ? primaryColor : '#fff', color: currentPageIndex === index ? '#fff' : '#12415f', fontWeight: 700, cursor: 'pointer' }}>
              {index + 1} - {stepLabels[page.id] || page.title}
            </button>
          ))}
        </nav>
      )}

      {isMultiStep && currentPage && (
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: '23px', fontWeight: 700, color: '#102b46', margin: '0 0 8px' }}>{currentPage.title}</h2>
          {currentPage.description && <p style={{ fontSize: '14px', color: textColor, lineHeight: 1.5, margin: 0 }}>{currentPage.description}</p>}
        </div>
      )}

      {currentPage?.id === 'review' && (
        <div style={{ margin: '12px 0', padding: '16px', border: '1px solid #f2d08e', borderRadius: '10px', background: '#fff8e8', color: '#8a5312', fontSize: '14px', lineHeight: 1.6 }}>
          <p style={{ margin: 0 }}><strong>Applicant</strong> - Firm {formData['2'] || 'not entered'}</p>
          <p style={{ margin: '12px 0 0' }}>Interested in: practice - {['22', '27', '32'].filter(id => String(formData[id] || '').trim()).length} professional peer nominations - {['11', '13', '15', '17', '19', '21'].filter(id => String(formData[id] || '').trim()).length} vendor/product entries</p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0 16px' }}>
          {renderCurrentPageFields()}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '8px' }}>
          {isMultiStep && currentPageIndex > 0 && (
            <button type="button" onClick={() => setCurrentPageIndex(index => index - 1)}
              style={{ padding: '12px 18px', border: '1px solid #9bb5ca', borderRadius: '10px', background: '#fff', color: '#12415f', fontWeight: 700, cursor: 'pointer' }}>&larr; Back</button>
          )}
          <button type="submit" disabled={isSubmitting}
            style={{ width: isMultiStep ? 'auto' : (submitButton.full_width ? '100%' : 'auto'), padding: (submitButton.spacing?.vertical ?? 12) + 'px ' + (submitButton.spacing?.horizontal ?? 24) + 'px', backgroundColor: isSubmitting ? '#9ca3af' : (submitButton.colors?.background || primaryColor), color: submitButton.colors?.text || '#ffffff', border: '1px solid ' + (submitButton.colors?.border || 'transparent'), borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: isSubmitting ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}>
            {isSubmitting ? 'Submitting...' : (isMultiStep && currentPageIndex < pages.length - 1 ? (currentPageIndex === 0 && pages[currentPageIndex + 1]?.id === 'spending' ? 'Continue to spending' : 'Continue') : (submitButton.text || 'Submit application'))}
          </button>
        </div>
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

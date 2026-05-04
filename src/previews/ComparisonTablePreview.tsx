import React, { useState, useMemo } from 'react';
import { PaymentFlow } from '../PaymentFlow';

/** Normalize a string to a canonical key for fuzzy matching: lowercase, alphanumeric only */
function canonicalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Build a map from canonical feature name → actual key in plan.features */
function buildFeatureLookup(features: Record<string, string | boolean>): Map<string, string> {
  const map = new Map<string, string>();
  for (const key of Object.keys(features)) {
    map.set(canonicalize(key), key);
  }
  return map;
}

/** Look up a feature value by display name, falling back to fuzzy canonical match */
function getFeatureValue(
  features: Record<string, string | boolean>,
  lookup: Map<string, string>,
  featName: string
): string | boolean | undefined {
  // Exact match first
  if (featName in features) return features[featName];
  // Canonical match
  const actualKey = lookup.get(canonicalize(featName));
  if (actualKey !== undefined) return features[actualKey];
  return undefined;
}

interface Plan {
  name: string;
  price: string;
  period: string;
  imageUrl?: string | null;
  image_url?: string | null;
  buttonText?: string;
  button_text?: string;
  buttonCaption?: string;
  button_caption?: string;
  buttonLink?: string;
  button_link?: string;
  buttonLinkTarget?: "_self" | "_blank";
  button_link_target?: "_self" | "_blank";
  features: Record<string, string | boolean>;
  headerColor?: string;
  header_color?: string;
  buttonColor?: string;
  button_color?: string;
  headerTextColor?: string;
  header_text_color?: string;
}

interface Category {
  name: string;
  features: { name: string; type: "text" | "boolean" }[];
}

interface AppearanceSettings {
  primaryColor: string;
  secondaryColor: string;
  buttonColor?: string;
  font: string;
  fontWeight: "400" | "700";
  fontSize: number;
  buttonRadius: number;
  buttonType: "filled" | "outline" | "gradient";
  categoryTextColor?: string;
  widgetBackgroundColor?: string;
  columnStyle?: string;
}

interface ComparisonTablePreviewProps {
  data: {
    title: string;
    plans: Plan[];
    categories: Category[];
    currency?: string;
    interval?: string | null;
    paymentType?: string;
    payment_type?: string;
    paymentGateway?: string;
    payment_gateway?: string;
  };
  appearance: AppearanceSettings;
  widgetId?: string;
}

const styles = `
  .desktop-view { display: block; }
  .mobile-view { display: none; }
  
  @media (max-width: 1023px) {
    .desktop-view { display: none !important; }
    .mobile-view { display: flex !important; }
  }
`;

export const ComparisonTablePreview: React.FC<ComparisonTablePreviewProps> = ({ data, appearance, widgetId }) => {
  const [showPaymentFlow, setShowPaymentFlow] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(data.categories.map(c => c.name))
  );

  // Resolve camelCase or snake_case plan fields
  const pf = (plan: Plan) => ({
    imageUrl: plan.imageUrl ?? plan.image_url,
    buttonText: plan.buttonText ?? plan.button_text ?? '',
    buttonCaption: plan.buttonCaption ?? plan.button_caption,
    buttonLink: plan.buttonLink ?? plan.button_link,
    buttonLinkTarget: plan.buttonLinkTarget ?? plan.button_link_target,
    headerColor: plan.headerColor ?? plan.header_color,
    headerTextColor: plan.headerTextColor ?? plan.header_text_color,
    buttonColor: plan.buttonColor ?? plan.button_color,
  });

  // Resolve data-level fields
  const paymentGateway = data.paymentGateway ?? data.payment_gateway;
  const paymentType = data.paymentType ?? data.payment_type ?? 'one_time';
  const interval = data.interval ?? undefined;

  // Build per-plan feature lookup maps once
  const featureLookups = useMemo(
    () => data.plans.map(p => buildFeatureLookup(p.features)),
    [data.plans]
  );

  const app = appearance || {
    primaryColor: "#1F2937",
    secondaryColor: "#F3F4F6",
    buttonColor: "#7c3aed",
    font: "Inter",
    fontWeight: "400",
    fontSize: 16,
    buttonRadius: 12,
    buttonType: "filled",
    categoryTextColor: "#3b82f6"
  };

  const toggleCategory = (name: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const buttonRadius = `${app.buttonRadius}px`;

  if (showPaymentFlow && selectedPlan) {
    return (
      <PaymentFlow
        widgetId={widgetId || ''}
        planId={selectedPlan.planId}
        interval={interval}
        paymentType={paymentType}
        onBack={() => {
          setShowPaymentFlow(false);
          setSelectedPlan(null);
        }}
      />
    );
  }

  return (
    <>
      <style>{styles}</style>
      <div style={{
        fontFamily: app.font === "system-ui" ? "system-ui, sans-serif" : `"${app.font}", sans-serif`,
        fontWeight: app.fontWeight,
        fontSize: `${app.fontSize}px`,
        color: app.primaryColor,
        width: '100%',
        padding: '20px',
        background: app.widgetBackgroundColor || 'transparent',
      }}>
        <h3 style={{ 
          textAlign: "center", 
          marginBottom: "40px", 
          fontSize: "2.2em",
          padding: '0 16px'
        }}>
          {data.title}
        </h3>

        {/* Desktop View - Hidden on mobile */}
        <div className="desktop-view">
          <div style={{ display: "grid", gap: "32px", gridTemplateColumns: `220px repeat(${data.plans.length}, 1fr)` }}>
            <div />
            {data.plans.map((plan, i) => {
              const f = pf(plan);
              return (
              <div key={i} style={{ textAlign: "center" }}>
                {f.imageUrl && (
                  <div style={{ marginBottom: "20px", borderRadius: "16px", overflow: "hidden", boxShadow: "0 8px 20px rgba(0,0,0,0.1)" }}>
                    <img src={f.imageUrl} alt={plan.name} style={{ width: "100%", height: "180px", objectFit: "cover" }} />
                  </div>
                )}

                <div style={{
                  backgroundColor: f.headerColor || app.primaryColor || '#3b82f6',
                  color: f.headerTextColor || '#ffffff',
                  padding: "24px 16px",
                  borderRadius: "16px",
                  marginBottom: "20px",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
                }}>
                  <h4 style={{ fontSize: "1.6em", margin: "0 0 8px 0" }}>
                    {plan.name}
                  </h4>
                  <div style={{ fontSize: "2.8em", lineHeight: "1" }}>
                    {plan.price}
                  </div>
                  <div style={{ opacity: 0.9, fontSize: "1em", marginTop: "4px" }}>
                    {plan.period}
                  </div>
                </div>

                {paymentGateway === "stripe" ? (
                  <button
                    onClick={() => {
                      setSelectedPlan(plan);
                      setShowPaymentFlow(true);
                    }}
                    style={{
                      background: app.buttonType === "filled"
                        ? (f.buttonColor || app.buttonColor || app.primaryColor)
                        : app.buttonType === "gradient"
                          ? `linear-gradient(to right, ${f.buttonColor || app.buttonColor || app.primaryColor}, ${app.secondaryColor})`
                          : "transparent",
                      border: app.buttonType === "outline"
                        ? `3px solid ${f.buttonColor || app.buttonColor || app.primaryColor}`
                        : "none",
                      color: app.buttonType === "outline" || app.buttonType === "gradient"
                        ? (f.buttonColor || app.buttonColor || app.primaryColor)
                        : "#ffffff",
                      borderRadius: buttonRadius,
                      padding: "16px 32px",
                      fontWeight: "600",
                      fontSize: `${app.fontSize * 1.1}px`,
                      textDecoration: "none",
                      display: "block",
                      textAlign: "center",
                      transition: "all 0.3s ease",
                      width: "100%",
                      cursor: "pointer"
                    }}
                  >
                    {f.buttonText}
                  </button>
                ) : f.buttonLink ? (
                  <a
                    href={f.buttonLink}
                    target={f.buttonLinkTarget || "_self"}
                    rel={f.buttonLinkTarget === "_blank" ? "noopener noreferrer" : undefined}
                    style={{
                      background: app.buttonType === "filled"
                        ? (f.buttonColor || app.buttonColor || app.primaryColor)
                        : app.buttonType === "gradient"
                          ? `linear-gradient(to right, ${f.buttonColor || app.buttonColor || app.primaryColor}, ${app.secondaryColor})`
                          : "transparent",
                      border: app.buttonType === "outline"
                        ? `3px solid ${f.buttonColor || app.buttonColor || app.primaryColor}`
                        : "none",
                      color: app.buttonType === "outline" || app.buttonType === "gradient"
                        ? (f.buttonColor || app.buttonColor || app.primaryColor)
                        : "#ffffff",
                      borderRadius: buttonRadius,
                      padding: "16px 32px",
                      fontWeight: "600",
                      fontSize: `${app.fontSize * 1.1}px`,
                      textDecoration: "none",
                      display: "block",
                      textAlign: "center",
                      transition: "all 0.3s ease",
                      width: "100%",
                    }}
                  >
                    {f.buttonText}
                  </a>
                ) : (
                  <button style={{
                    background: app.buttonType === "filled"
                      ? (f.buttonColor || app.buttonColor || app.primaryColor)
                      : "transparent",
                    border: app.buttonType === "outline"
                      ? `3px solid ${f.buttonColor || app.buttonColor || app.primaryColor}`
                      : "none",
                    color: app.buttonType === "outline"
                      ? (f.buttonColor || app.buttonColor || app.primaryColor)
                      : "#ffffff",
                    borderRadius: buttonRadius,
                    padding: "16px 32px",
                    fontWeight: "600",
                    textAlign: "center",
                    width: "100%",
                    cursor: "pointer",
                  }}>
                    {f.buttonText}
                  </button>
                )}

                {f.buttonCaption && (
                  <p style={{ margin: "16px 0 0", opacity: 0.8, fontSize: "0.95em" }}>
                    {f.buttonCaption}
                  </p>
                )}
              </div>
              );
            })}
          </div>

          {/* Desktop Features Table */}
          <div style={{ marginTop: "48px" }}>
            {data.categories.map((cat) => (
              <div key={cat.name}>
                <button
                  onClick={() => toggleCategory(cat.name)}
                  style={{
                    width: "100%",
                    padding: "18px 24px",
                    backgroundColor: app.secondaryColor || '#f3f4f6',
                    border: "none",
                    textAlign: "left",
                    fontWeight: "600",
                    fontSize: "1.3em",
                    display: "flex",
                    gap: "12px",
                    alignItems: "center",
                    cursor: "pointer",
                    color: app.categoryTextColor || "#3b82f6",
                    borderBottom: "2px solid #e5e7eb",
                    textTransform: "uppercase",
                  }}
                >
                  <span style={{
                    transform: expandedCategories.has(cat.name) ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 0.3s ease",
                    color:  app.primaryColor || "gray"
                  }}>
                    ▸
                  </span>
                  {cat.name}
                </button>

                {expandedCategories.has(cat.name) && (
                  <div>
                    {cat.features.map((feat, featIndex) => (
                      <div
                        key={feat.name}
                        style={{
                          display: "grid",
                          gap: "16px",
                          padding: "16px 24px",
                          fontWeight: "500",
                          borderBottom: "1px solid #e5e7eb",
                          gridTemplateColumns: `220px repeat(${data.plans.length}, 1fr)`,
                          alignItems: "center",
                          backgroundColor: featIndex % 2 === 0 ? "transparent" : "#f9fafb",
                        }}
                      >
                        <div style={{ color: app.primaryColor }}>
                          {feat.name}
                        </div>
                        {data.plans.map((plan, planIdx) => {
                          const value = getFeatureValue(plan.features, featureLookups[planIdx], feat.name);
                          return (
                            <div key={plan.name} style={{ textAlign: "center" }}>
                              {feat.type === "boolean" ? (
                                value ? (
                                  <span style={{ color: "#10b981", fontSize: "1.8em" }}>✓</span>
                                ) : (
                                  <span style={{ color: "#ef4444", fontSize: "1.8em" }}>✗</span>
                                )
                              ) : (
                                <span style={{ fontWeight: "500" }}>
                                  {(value as string) || "-"}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Mobile View - Card Layout */}
        <div className="mobile-view" style={{ flexDirection: 'column', gap: '24px' }}>
          {data.plans.map((plan, planIdx) => {
            const f = pf(plan);
            return (
            <div key={planIdx} style={{
              border: '2px solid #e5e7eb',
              borderRadius: '16px',
              overflow: 'hidden',
              backgroundColor: '#ffffff',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}>
              {/* Plan Header */}
              {f.imageUrl && (
                <div style={{ width: '100%' }}>
                  <img src={f.imageUrl} alt={plan.name} style={{ width: '100%', height: '160px', objectFit: 'cover' }} />
                </div>
              )}

              <div style={{
                padding: '20px',
                backgroundColor: f.headerColor || app.primaryColor || '#3b82f6',
                color: f.headerTextColor || '#ffffff',
                textAlign: 'center'
              }}>
                <h4 style={{ fontSize: '1.5em', fontWeight: 'bold', margin: '0 0 8px 0' }}>
                  {plan.name}
                </h4>
                <div style={{ fontSize: '2.5em', fontWeight: 'bold', margin: '8px 0' }}>
                  {plan.price}
                </div>
                <div style={{ fontSize: '1em', opacity: 0.9 }}>
                  {plan.period}
                </div>
              </div>

              {/* CTA Button */}
              <div style={{ padding: '20px' }}>
                {paymentGateway === "stripe" ? (
                  <button
                    onClick={() => {
                      setSelectedPlan(plan);
                      setShowPaymentFlow(true);
                    }}
                    style={{
                      background: app.buttonType === "filled"
                        ? (f.buttonColor || app.buttonColor)
                        : app.buttonType === "gradient"
                          ? `linear-gradient(to right, ${f.buttonColor || app.buttonColor}, ${app.secondaryColor})`
                          : "transparent",
                      border: app.buttonType === "outline" ? `3px solid ${f.buttonColor || app.buttonColor}` : "none",
                      color: app.buttonType === "outline" || app.buttonType === "gradient" ? (f.buttonColor || app.buttonColor) : "#fff",
                      borderRadius: buttonRadius,
                      padding: '14px 24px',
                      fontWeight: '600',
                      fontSize: '1em',
                      textDecoration: 'none',
                      display: 'block',
                      textAlign: 'center',
                      width: '100%',
                      cursor: 'pointer'
                    }}
                  >
                    {f.buttonText}
                  </button>
                ) : f.buttonLink ? (
                  <a
                    href={f.buttonLink}
                    target={f.buttonLinkTarget || "_self"}
                    rel={f.buttonLinkTarget === "_blank" ? "noopener noreferrer" : undefined}
                    style={{
                      background: app.buttonType === "filled"
                        ? (f.buttonColor || app.buttonColor)
                        : app.buttonType === "gradient"
                          ? `linear-gradient(to right, ${f.buttonColor || app.buttonColor}, ${app.secondaryColor})`
                          : "transparent",
                      border: app.buttonType === "outline" ? `3px solid ${f.buttonColor || app.buttonColor}` : "none",
                      color: app.buttonType === "outline" || app.buttonType === "gradient" ? (f.buttonColor || app.buttonColor) : "#fff",
                      borderRadius: buttonRadius,
                      padding: '14px 24px',
                      fontWeight: '600',
                      fontSize: '1em',
                      textDecoration: 'none',
                      display: 'block',
                      textAlign: 'center',
                      width: '100%'
                    }}
                  >
                    {f.buttonText}
                  </a>
                ) : (
                  <button style={{
                    background: app.buttonType === "filled" ? (f.buttonColor || app.buttonColor) : "transparent",
                    border: app.buttonType === "outline" ? `3px solid ${f.buttonColor || app.buttonColor}` : "none",
                    color: app.buttonType === "outline" ? (f.buttonColor || app.buttonColor) : "#fff",
                    borderRadius: buttonRadius,
                    padding: '14px 24px',
                    fontWeight: '600',
                    textAlign: 'center',
                    width: '100%',
                    cursor: 'pointer'
                  }}>
                    {f.buttonText}
                  </button>
                )}

                {f.buttonCaption && (
                  <p style={{ textAlign: 'center', marginTop: '12px', fontSize: '0.9em', opacity: 0.8 }}>
                    {f.buttonCaption}
                  </p>
                )}
              </div>

              {/* Features List */}
              <div style={{ borderTop: '2px solid #e5e7eb' }}>
                {data.categories.map((cat) => (
                  <div key={cat.name}>
                    <div style={{
                      backgroundColor: app.secondaryColor || '#f3f4f6',
                      padding: '12px 20px',
                      fontWeight: 'bold',
                      color: app.categoryTextColor || app.primaryColor || '#3b82f6',
                      fontSize: '1em',
                      borderBottom: '1px solid #e5e7eb',
                      textTransform: 'uppercase'
                    }}>
                      {cat.name}
                    </div>
                    {cat.features.map((feat) => (
                      <div
                        key={feat.name}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '12px 20px',
                          borderBottom: '1px solid #f3f4f6'
                        }}
                      >
                        <span style={{ fontWeight: '500', fontSize: '0.95em', color: app.primaryColor }}>
                          {feat.name}
                        </span>
                        <div>
                          {feat.type === "boolean" ? (
                            getFeatureValue(plan.features, featureLookups[planIdx], feat.name) ? (
                              <span style={{ color: '#10b981', fontSize: '1.5em' }}>✓</span>
                            ) : (
                              <span style={{ color: '#ef4444', fontSize: '1.5em' }}>✗</span>
                            )
                          ) : (
                            <span style={{ fontWeight: '500', fontSize: '0.95em' }}>
                              {(getFeatureValue(plan.features, featureLookups[planIdx], feat.name) as string) || "-"}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </>
  );
};
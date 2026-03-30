import { ArrowLeft, ArrowRight, Atom, Building2, Camera, Dumbbell, Download, Globe, Hexagon, LayoutGrid, LayoutTemplate, Monitor, Palette, Pencil, Search, Sparkles, Star, Tag, Utensils, X, Zap } from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";
import {
  getWidgetTemplates,
  getUserWidgets,
  createUserWidget,
  updateUserWidget,
  deleteUserWidget,
  publishUserWidget,
  duplicateUserWidget,
} from "@/services/api/widgets/index";

const ANIMATION_KEYFRAMES = `
  @keyframes wings-left  { from { opacity:1; transform: perspective(800px) rotateY(90deg) scaleX(0.96); } to   { opacity:1; transform: perspective(800px) rotateY(0deg) scaleX(1); } }
  @keyframes wings-right { from { opacity:1; transform: perspective(800px) rotateY(90deg) scaleX(0.96); } to   { opacity:1; transform: perspective(800px) rotateY(0deg) scaleX(1); } }
  @keyframes wings-mid   { from { opacity:1; transform: perspective(800px) rotateX(-90deg) scaleY(0.96); } to   { opacity:1; transform: perspective(800px) rotateX(0deg) scaleY(1); } }
  @keyframes anim-fade-up    { from { opacity:0; transform:translateY(50px);         } to { opacity:1; transform:translateY(0);      } }
  @keyframes anim-fade-in    { from { opacity:0;                                     } to { opacity:1;                               } }
  @keyframes anim-zoom       { from { opacity:0; transform:scale(0.82);              } to { opacity:1; transform:scale(1);            } }
  @keyframes anim-flip       { from { opacity:0; transform:perspective(700px) rotateY(-50deg); } to { opacity:1; transform:perspective(700px) rotateY(0); } }
  @keyframes anim-slide-left { from { opacity:0; transform:translateX(-70px);        } to { opacity:1; transform:translateX(0);       } }
  @keyframes anim-slide-up   { from { opacity:0; transform:translateY(70px);         } to { opacity:1; transform:translateY(0);       } }
  @keyframes anim-bounce     { from { opacity:0; transform:translateY(-60px);        } to { opacity:1; transform:translateY(0);       } }
  @keyframes glowSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes glowPulse { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
`;

function AnimStyleTag() {
  return <style dangerouslySetInnerHTML={{ __html: ANIMATION_KEYFRAMES }} />;
}

function resolveTransform(node) {
  const parts = [];
  if (node?.rotate) parts.push(`rotate(${node.rotate}deg)`);
  if (node?.skewX) parts.push(`skewX(${node.skewX}deg)`);
  if (node?.skewY) parts.push(`skewY(${node.skewY}deg)`);
  if (node?.transform) parts.push(node.transform);
  return parts.length ? parts.join(" ") : undefined;
}

function HoverButton({ baseStyle, normalStyle, hoverStyle, text }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      style={{ ...baseStyle, ...normalStyle, ...(hovered ? hoverStyle : {}) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {text}
    </button>
  );
}

let _glowCardId = 0;

function GlowCard({ colors, thickness = 2, speed = 3, blur = 12, borderRadius = 12, children, style }) {
  const idRef = useRef(`gc-${++_glowCardId}`);
  const id = idRef.current;

  const colorStr = Array.isArray(colors) && colors.length
    ? [...colors, colors[0]].join(", ")
    : "#00ffff, #ff00ff, #ff8800, #00ffff";

  const css = `
    @property --${id}-a { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
    @keyframes ${id}-spin { to { --${id}-a: 360deg; } }
    .${id}-wrap { position: relative; border-radius: ${borderRadius}px; padding: ${thickness}px; }
    .${id}-wrap::before {
      content: ''; position: absolute; inset: 0;
      border-radius: ${borderRadius}px;
      background: conic-gradient(from var(--${id}-a), ${colorStr});
      animation: ${id}-spin ${speed}s linear infinite;
    }
    .${id}-wrap::after {
      content: ''; position: absolute; inset: 0;
      border-radius: ${borderRadius}px;
      background: conic-gradient(from var(--${id}-a), ${colorStr});
      animation: ${id}-spin ${speed}s linear infinite;
      filter: blur(${blur}px); opacity: 0.75;
    }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className={`${id}-wrap`} style={{ display: "flex", flexDirection: "column", height: "100%", ...style }}>
        <div style={{
          position: "relative", zIndex: 1,
          borderRadius: Math.max(0, borderRadius - thickness),
          overflow: "hidden",
          display: "flex", flexDirection: "column", flex: 1,
        }}>
          {children}
        </div>
      </div>
    </>
  );
}

let _glowBtnId = 0;

function GlowButton({ node, fontFamily }) {
  const idRef = useRef(`gb-${++_glowBtnId}`);
  const id = idRef.current;
  const [hovered, setHovered] = useState(false);

  const colors = Array.isArray(node.glowColors) && node.glowColors.length
    ? [...node.glowColors, node.glowColors[0]].join(", ")
    : "#00ffff, #ff00ff, #ff8800, #00ffff";

  const speed = node.glowSpeed ?? 3;
  const blur = node.glowBlur ?? 10;
  const thickness = node.glowThickness ?? 2;
  const br = node.borderRadius ?? 8;

  const css = `
    @property --${id}-a { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
    @keyframes ${id}-spin { to { --${id}-a: 360deg; } }
    .${id}-wrap { position: relative; border-radius: ${br + thickness}px; padding: ${thickness}px; display: inline-flex; width: ${node.fullWidth ? "100%" : "auto"}; box-sizing: border-box; cursor: pointer; }
    .${id}-wrap::before {
      content: ''; position: absolute; inset: 0;
      border-radius: ${br + thickness}px;
      background: conic-gradient(from var(--${id}-a), ${colors});
      animation: ${id}-spin ${speed}s linear infinite;
    }
    .${id}-wrap::after {
      content: ''; position: absolute; inset: 0;
      border-radius: ${br + thickness}px;
      background: conic-gradient(from var(--${id}-a), ${colors});
      animation: ${id}-spin ${speed}s linear infinite;
      filter: blur(${blur}px); opacity: 0.7;
    }
  `;

  const sizeMap = { sm: { fontSize: 11, padding: "8px 12px" }, md: { fontSize: 12, padding: "10px 14px" }, lg: { fontSize: 14, padding: "12px 18px" } };
  const sizing = sizeMap[node.size || "md"];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className={`${id}-wrap`}>
        <button
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            position: "relative", zIndex: 1,
            width: "100%",
            background: hovered ? (node.hoverBg || node.color || "#111") : (node.color || "#111"),
            color: hovered ? (node.hoverColor || node.textColor || "#fff") : (node.textColor || "#fff"),
            border: "none",
            borderRadius: br,
            cursor: "pointer",
            fontFamily: node.fontFamily || fontFamily,
            fontWeight: 700,
            letterSpacing: node.letterSpacing,
            textTransform: node.transform,
            transition: "all 0.18s ease",
            ...sizing,
          }}
        >
          {node.text}
        </button>
      </div>
    </>
  );
}

function useContainerWidth(ref) {
  const [width, setWidth] = useState(800);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return width;
}

function px(val) {
  if (val == null) return undefined;
  if (typeof val === "number") return `${val}px`;
  return val;
}

const SPACING_TOKENS = {
  none: 0, xs: 4, sm: 8, md: 16, lg: 24, xl: 40, "2xl": 60, "3xl": 80,
};

function resolveSpacing(val) {
  if (val == null) return undefined;
  if (typeof val === "number") return `${val}px`;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (SPACING_TOKENS[trimmed] !== undefined) {
      return `${SPACING_TOKENS[trimmed]}px`;
    }
    if (trimmed.includes(" ")) {
      return trimmed
        .split(/\s+/)
        .map((part) => (SPACING_TOKENS[part] !== undefined ? `${SPACING_TOKENS[part]}px` : part))
        .join(" ");
    }
  }
  return val;
}

function useVisibleOnce(ref) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.12 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return visible;
}

function getCardAnim(animType, idx, total, stagger = 110) {
  if (!animType || animType === "none") return {};
  const delay = animType === "wings" ? "0ms" : `${idx * stagger}ms`;
  const ease = "cubic-bezier(0.34,1.18,0.64,1)";
  const dur = "1.4s";

  let kf;
  if (animType === "wings") {
    const mid = (total - 1) / 2;
    const isMid = total % 2 === 1 && idx === Math.floor(mid);

    if (isMid) {
      return {
        animation: `wings-mid 0.55s cubic-bezier(0.22,0.61,0.36,1) 0ms both`,
        transformOrigin: "center top",
      };
    }

    const isLeft = idx < total / 2;
    return {
      animation: `${isLeft ? "wings-left" : "wings-right"} 0.65s cubic-bezier(0.22,0.61,0.36,1) 300ms both`,
      transformOrigin: isLeft ? "right top" : "left top",
    };
  } else {
    const map = {
      "fade-up": "anim-fade-up",
      "fade-in": "anim-fade-in",
      "zoom": "anim-zoom",
      "flip": "anim-flip",
      "slide-left": "anim-slide-left",
      "slide-up": "anim-slide-up",
      "bounce": "anim-bounce",
    };
    kf = map[animType] || "anim-fade-up";
  }
  return { animation: `${kf} ${dur} ${ease} ${delay} both` };
}

// ═══════════════════════════════════════════════════════════════════════════
// THE ENGINE
// Django sends a JSON doc -> PricingRenderer reads doc.layout -> picks one of
// 5 layout components -> each layout calls resolver functions with doc.theme
// -> resolvers return CSS/JSX based on theme values -> widget renders.
//
// Adding a new template = storing a new JSON in Django. Zero React changes.
// ═══════════════════════════════════════════════════════════════════════════


// ───────────────────────────────────────────────────────────────────────────
// SECTION 1 — RESOLVER FUNCTIONS
// These are the brain. They translate theme values -> actual CSS / JSX.
// Every layout component calls these. Nothing is hardcoded in the layouts.
// ───────────────────────────────────────────────────────────────────────────

// 1a. Card container CSS — driven by theme.cardStyle
function resolveCardCSS(theme, plan) {
  const isHighlighted = plan.highlighted;
  const isDark = theme.colorMode === "dark";

  const base = {
    borderRadius: theme.borderRadius,
    overflow: "hidden",
    position: "relative",
    transition: "box-shadow .2s, transform .2s",
    transform: isHighlighted ? "translateY(-6px) scale(1.01)" : "none",
    zIndex: isHighlighted ? 2 : 1,
  };

  const styles = {
    elevated: {
      background: isDark ? "#1e293b" : "#fff",
      boxShadow: isHighlighted
        ? `0 24px 60px ${plan.color}35, 0 0 0 2px ${plan.color}`
        : isDark ? "0 4px 20px rgba(0,0,0,0.4)" : "0 4px 20px rgba(0,0,0,0.08)",
      border: isHighlighted ? `2px solid ${plan.color}` : `2px solid ${isDark ? "rgba(255,255,255,0.06)" : "transparent"}`,
    },
    flat: {
      background: isDark ? "rgba(255,255,255,0.04)" : "#fff",
      border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "#e5e7eb"}`,
      boxShadow: isHighlighted ? `0 0 0 2px ${plan.color}` : "none",
    },
    outlined: {
      background: isHighlighted ? `${plan.color}07` : isDark ? "transparent" : "#fff",
      border: isHighlighted ? `2px solid ${plan.color}` : `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "#e2e8f0"}`,
      boxShadow: isHighlighted ? `0 12px 40px ${plan.color}20` : "none",
    },
    "full-color": {
      background: plan.color,
      border: "none",
      boxShadow: isHighlighted ? `0 20px 50px ${plan.color}60` : `0 8px 24px ${plan.color}30`,
      transform: isHighlighted ? "scale(1.04)" : "none",
    },
    "image-bg": {
      background: plan.bgImage ? `url(${plan.bgImage}) center/cover` : plan.bgGradient,
      border: isHighlighted ? `3px solid ${plan.color}` : "none",
      boxShadow: isHighlighted ? `0 0 0 3px ${plan.color}, 0 20px 50px rgba(0,0,0,0.6)` : "0 8px 30px rgba(0,0,0,0.5)",
    },
    glass: {
      background: isHighlighted ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.1)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      border: isHighlighted ? "1px solid rgba(255,255,255,0.45)" : "1px solid rgba(255,255,255,0.15)",
      boxShadow: isHighlighted ? "0 30px 60px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3)" : "0 8px 32px rgba(0,0,0,0.15)",
    },
    "bordered-heavy": {
      background: isDark ? "#080808" : "#fff",
      border: `3px solid ${isDark ? plan.color : "#111"}`,
      boxShadow: `6px 6px 0 ${isDark ? plan.color + "80" : plan.color}`,
      transform: isHighlighted ? "translateY(-4px)" : "none",
    },
  };

  const resolved = { ...base, ...(styles[theme.cardStyle] || styles.elevated) };

  // NEW: allow theme to override card background color directly
  if (theme.cardBg) {
    resolved.background = theme.cardBg;
    resolved.border = "none";
    resolved.boxShadow = "none";
  }

  return resolved;
}

// 1b. Accent line CSS — driven by theme.accentLine
function resolveAccentLine(theme, plan) {
  if (theme.accentLine === "none") return null;
  const style = {
    top: { position: "absolute", top: 0, left: 0, right: 0, height: 4, background: plan.color },
    bottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: 4, background: plan.color },
    left: { position: "absolute", top: 0, left: 0, bottom: 0, width: 4, background: plan.color },
  }[theme.accentLine];
  return style ? <div style={style} /> : null;
}

// 1c. Card header — driven by theme.headerLayout
function resolveHeader(plan, theme) {
  const isDark = theme.colorMode === "dark" || theme.cardStyle === "image-bg" || theme.cardStyle === "full-color" || theme.cardStyle === "glass";
  const textColor = isDark ? "#fff" : "#111";
  const mutedColor = isDark ? "rgba(255,255,255,0.6)" : "#6b7280";

  if (theme.headerLayout === "image-bg") {
    return (
      <div style={{ position: "relative", height: 180 }}>
        <div style={{ position: "absolute", inset: 0, background: plan.bgImage ? `url(${plan.bgImage}) center/cover` : plan.bgGradient }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.75) 100%)" }} />
        {plan.badge?.trim() && <div style={{ position: "absolute", top: 12, right: 12, background: plan.color, color: "#fff", fontSize: 9, fontWeight: 900, padding: "3px 10px", borderRadius: theme.buttonShape === "pill" ? 99 : 3, letterSpacing: 1.5, textTransform: "uppercase" }}>{plan.badge}</div>}
        <div style={{ position: "absolute", bottom: 14, left: 18 }}>
          <div style={{ color: "#fff", fontWeight: 900, fontSize: 20, fontFamily: theme.font }}>{plan.name}</div>
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 }}>{plan.description}</div>
        </div>
      </div>
    );
  }

  if (theme.headerLayout === "icon-top") {
    return (
      <div style={{ textAlign: "center", padding: "28px 20px 0" }}>
        <div style={{ width: 68, height: 68, borderRadius: "50%", background: theme.cardStyle === "full-color" ? "rgba(255,255,255,0.25)" : `${plan.color}18`, margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>{plan.emoji}</div>
        {plan.badge?.trim() && <div style={{ background: plan.color, color: "#fff", fontSize: 9, fontWeight: 900, padding: "3px 12px", borderRadius: 99, display: "inline-block", marginBottom: 10, letterSpacing: 1.5, textTransform: "uppercase" }}>{plan.badge}</div>}
        <div style={{ color: theme.cardStyle === "full-color" ? "#fff" : textColor, fontWeight: 800, fontSize: 20, fontFamily: theme.font }}>{plan.name}</div>
        <div style={{ color: theme.cardStyle === "full-color" ? "rgba(255,255,255,0.7)" : mutedColor, fontSize: 12, marginTop: 4 }}>{plan.description}</div>
      </div>
    );
  }

  if (theme.headerLayout === "left") {
    return (
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "24px 22px 0" }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: `${plan.color}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{plan.emoji}</div>
        <div>
          {plan.badge?.trim() && <div style={{ background: plan.color, color: "#fff", fontSize: 9, fontWeight: 900, padding: "2px 8px", borderRadius: 99, display: "inline-block", marginBottom: 6, letterSpacing: 1 }}>{plan.badge}</div>}
          <div style={{ color: textColor, fontWeight: 800, fontSize: 17, fontFamily: theme.font }}>{plan.name}</div>
          <div style={{ color: mutedColor, fontSize: 11, marginTop: 2 }}>{plan.description}</div>
        </div>
      </div>
    );
  }

  if (theme.headerLayout === "none") {
    return null;
  }

  // default: "top"
  return (
    <div style={{ padding: "24px 22px 0", textAlign: theme.titleAlign ?? "left" }}>
      {plan.badge?.trim() && (
        <div style={{
          background: plan.color, color: "#fff", fontSize: 9, fontWeight: 900, padding: "3px 12px",
          borderRadius: theme.buttonShape === "pill" ? 99 : 3,
          display: "inline-block", marginBottom: 10, letterSpacing: 1.5, textTransform: "uppercase"
        }}>{plan.badge}</div>
      )}
      <div style={{ color: theme.cardStyle === "full-color" ? "#fff" : textColor, fontWeight: theme.titleWeight ?? 800, fontSize: theme.titleSize ?? 18, fontFamily: theme.font, letterSpacing: theme.titleLetterSpacing ?? -0.3, textTransform: theme.titleTransform ?? "none", textAlign: theme.titleAlign ?? "left" }}>{plan.name}</div>
      <div style={{ color: theme.cardStyle === "full-color" ? "rgba(255,255,255,0.7)" : mutedColor, fontSize: 11, marginTop: 3, textAlign: theme.titleAlign ?? "left" }}>{plan.description}</div>
    </div>
  );
}

// 1d. Price block — driven by theme.priceDisplay
function resolvePrice(plan, theme) {
  const onFullColor = theme.cardStyle === "full-color";
  const onDark = theme.colorMode === "dark" || theme.cardStyle === "glass" || theme.cardStyle === "image-bg" || onFullColor;
  const mainColor = onFullColor ? "#fff" : onDark ? "#fff" : "#111";
  const accentColor = onFullColor ? "rgba(255,255,255,0.8)" : plan.color;
  const mutedColor = onFullColor ? "rgba(255,255,255,0.6)" : onDark ? "rgba(255,255,255,0.5)" : "#9ca3af";
  const priceAlign = theme.priceAlign ?? "left";

  if (theme.priceDisplay === "hero") return (
    <div style={{ textAlign: priceAlign }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 2, justifyContent: priceAlign === "center" ? "center" : priceAlign === "right" ? "flex-end" : "flex-start" }}>
        <span style={{ color: accentColor, fontSize: 20, fontWeight: 700, marginTop: 10, fontFamily: theme.font }}>{plan.currency}</span>
        <span style={{ color: mainColor, fontWeight: 900, fontSize: 58, lineHeight: 1, letterSpacing: -2, fontFamily: theme.font }}>{plan.price}</span>
        <span style={{ color: mutedColor, fontSize: 12, marginTop: "auto", marginBottom: 8 }}>/{plan.period}</span>
      </div>
    </div>
  );

  if (theme.priceDisplay === "stacked-currency") return (
    <div style={{ textAlign: priceAlign }}>
      <div style={{ lineHeight: 1, display: "flex", flexDirection: "column", alignItems: priceAlign === "center" ? "center" : priceAlign === "right" ? "flex-end" : "flex-start", justifyContent: priceAlign === "center" ? "center" : priceAlign === "right" ? "flex-end" : "flex-start" }}>
        <div style={{ color: accentColor, fontSize: 18, fontWeight: 700, fontFamily: theme.font, letterSpacing: 1, marginBottom: 2 }}>
          {plan.currency}
        </div>
        <span style={{ color: accentColor, fontWeight: 900, fontSize: 54, letterSpacing: -2, fontFamily: theme.font }}>
          {plan.price}{plan.suffixDash ? ".-" : ""}
        </span>
        {plan.period && (
          <div style={{ color: mutedColor, fontSize: 12, marginTop: 4 }}>
            {plan.period}
          </div>
        )}
      </div>
    </div>
  );

  if (theme.priceDisplay === "slash") return (
    <div style={{ textAlign: priceAlign }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: priceAlign === "center" ? "center" : priceAlign === "right" ? "flex-end" : "flex-start" }}>
        <span style={{ color: plan.color, fontWeight: 900, fontSize: 44, letterSpacing: -1, fontFamily: theme.font, textShadow: theme.colorMode === "dark" ? `0 0 30px ${plan.color}60` : "none" }}>{plan.currency}{plan.price}</span>
        <span style={{ color: mutedColor, fontSize: 11, fontFamily: theme.font }}>/{plan.period}</span>
      </div>
    </div>
  );

  if (theme.priceDisplay === "inline") return (
    <div style={{ textAlign: priceAlign }}>
      <span style={{ color: mainColor, fontWeight: 800, fontSize: 32, fontFamily: theme.font }}>
        {plan.currency}{plan.price}
        <small style={{ fontWeight: 400, fontSize: 13, color: mutedColor, marginLeft: 4 }}>/{plan.period}</small>
      </span>
    </div>
  );

  // compact
  return (
    <div style={{ textAlign: priceAlign }}>
      <div>
        <span style={{ color: mainColor, fontWeight: 900, fontSize: 38, letterSpacing: -1, fontFamily: theme.font }}>{plan.currency}{plan.price}</span>
        <span style={{ color: mutedColor, fontSize: 12 }}>/{plan.period}</span>
      </div>
    </div>
  );
}

// 1e. Feature list — driven by theme.featureStyle
function resolveFeatures(plan, theme) {
  const onFullColor = theme.cardStyle === "full-color";
  const onDark = theme.colorMode === "dark" || theme.cardStyle === "glass" || theme.cardStyle === "image-bg" || onFullColor;
  const textColor = onFullColor ? "rgba(255,255,255,0.9)" : onDark ? "rgba(255,255,255,0.8)" : "#374151";
  const mutedText = onFullColor ? "rgba(255,255,255,0.4)" : onDark ? "rgba(255,255,255,0.3)" : "#d1d5db";
  const borderColor = theme.cardBg
    ? "rgba(0,0,0,0.1)"
    : onFullColor ? "rgba(255,255,255,0.15)"
      : onDark ? "rgba(255,255,255,0.08)"
        : "#f3f4f6";
  const featureAlign = theme.featureAlign ?? "left";

  const allFeatures = [
    ...plan.features.map(f => ({ text: f, disabled: false })),
    ...(plan.disabledFeatures || []).map(f => ({ text: f, disabled: true })),
  ];

  if (theme.featureStyle === "checklist") return (
    <div style={{ textAlign: featureAlign }}>
      {allFeatures.map((f, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
          {f.disabled
            ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1, opacity: 0.35 }}><circle cx="8" cy="8" r="7" stroke={plan.color} strokeWidth="1.5" /><path d="M5 11L11 5M5 5L11 11" stroke={plan.color} strokeWidth="1.5" strokeLinecap="round" /></svg>
            : <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="8" cy="8" r="7" fill={plan.color + "25"} stroke={plan.color} strokeWidth="1" /><path d="M4.5 8L7 10.5L11.5 5.5" stroke={plan.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          }
          <span style={{ color: f.disabled ? mutedText : textColor, fontSize: 12, lineHeight: 1.5, textDecoration: f.disabled ? "line-through" : "none" }}>{f.text}</span>
        </div>
      ))}
    </div>
  );

  if (theme.featureStyle === "dotlist") return (
    <div style={{ textAlign: featureAlign }}>
      {allFeatures.map((f, i) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: f.disabled ? "#334155" : plan.color, boxShadow: f.disabled ? "none" : `0 0 8px ${plan.color}` }} />
          <span style={{ color: f.disabled ? mutedText : textColor, fontSize: 12, textDecoration: f.disabled ? "line-through" : "none" }}>{f.text}</span>
        </div>
      ))}
    </div>
  );

  if (theme.featureStyle === "tags") return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, textAlign: featureAlign }}>
      {plan.features.map((f, i) => (
        <span key={i} style={{ background: onFullColor ? "rgba(255,255,255,0.2)" : onDark ? "rgba(255,255,255,0.12)" : `${plan.color}15`, color: onDark || onFullColor ? "#fff" : plan.color, fontSize: 11, padding: "4px 10px", borderRadius: 99, fontWeight: 500 }}>{f}</span>
      ))}
    </div>
  );

  if (theme.featureStyle === "minimal") return (
    <div style={{ textAlign: featureAlign }}>
      {allFeatures.map((f, i) => (
        <div key={i} style={{ borderBottom: `1px solid ${borderColor}`, padding: "8px 0", color: f.disabled ? mutedText : textColor, fontSize: 12, opacity: f.disabled ? 0.45 : 1, display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: f.disabled ? "#555" : plan.color, fontWeight: 900, fontSize: 10 }}>{f.disabled ? "×" : "›"}</span>
          {f.text}
        </div>
      ))}
    </div>
  );

  if (theme.featureStyle === "plain") return (
    <div style={{ textAlign: featureAlign }}>
      {allFeatures.map((f, i) => (
        <div key={i} style={{ color: f.disabled ? mutedText : textColor, fontSize: 12, padding: "6px 0", opacity: f.disabled ? 0.4 : 1 }}>{f.text}</div>
      ))}
    </div>
  );
  // table-rows (used inside comparison layouts, handled separately)
  return (
    <div style={{ textAlign: featureAlign }}>
      {allFeatures.map((f, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${borderColor}` }}>
          {f.disabled
            ? <span style={{ color: mutedText, fontSize: 14 }}>—</span>
            : <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7L5.5 10L11.5 4" stroke={plan.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          }
          <span style={{ color: f.disabled ? mutedText : textColor, fontSize: 12, textDecoration: f.disabled ? "line-through" : "none" }}>{f.text}</span>
        </div>
      ))}
    </div>
  );
}

// 1f. Button — driven by theme.buttonShape + cardStyle
function resolveButton(plan, theme) {
  const onFullColor = theme.cardStyle === "full-color";
  const onDark = theme.colorMode === "dark" || theme.cardStyle === "glass" || theme.cardStyle === "image-bg";
  const isDark = onDark || onFullColor;

  const radiusMap = { pill: 99, rounded: 8, square: 0, underline: 0 };
  const radius = radiusMap[theme.buttonShape] ?? 8;

  if (theme.buttonShape === "underline") {
    return {
      background: "transparent", border: "none",
      borderBottom: `2px solid ${plan.color}`,
      color: plan.color, fontWeight: 900, fontSize: 13,
      padding: "4px 0", cursor: "pointer",
      borderRadius: 0, fontFamily: theme.font, fontStyle: "italic",
      width: "auto", display: "inline-block",
    };
  }

  if (onFullColor) {
    return {
      background: plan.highlighted ? "#fff" : "rgba(255,255,255,0.2)",
      color: plan.highlighted ? plan.color : "#fff",
      border: "1px solid rgba(255,255,255,0.3)",
      borderRadius: radius, cursor: "pointer",
      fontWeight: 800, fontSize: 13, padding: "13px 0",
      width: "100%", fontFamily: theme.font,
    };
  }

  if (theme.cardStyle === "glass") {
    return {
      background: plan.highlighted ? "#fff" : "rgba(255,255,255,0.18)",
      color: plan.highlighted ? plan.color : "#fff",
      border: "1px solid rgba(255,255,255,0.3)",
      borderRadius: radius, cursor: "pointer",
      fontWeight: 800, fontSize: 13, padding: "13px 0",
      width: "100%", fontFamily: theme.font,
      backdropFilter: "blur(4px)",
    };
  }

  if (theme.cardStyle === "image-bg") {
    return {
      background: plan.highlighted ? plan.color : "transparent",
      color: "#fff",
      border: `2px solid ${plan.color}`,
      borderRadius: radius, cursor: "pointer",
      fontWeight: 900, fontSize: 12, padding: "12px 0",
      width: "100%", fontFamily: theme.font,
      letterSpacing: 1, textTransform: "uppercase",
    };
  }

  if (theme.cardStyle === "bordered-heavy") {
    return {
      background: plan.highlighted ? (theme.colorMode === "dark" ? plan.color : "#111") : "transparent",
      color: plan.highlighted ? "#fff" : (theme.colorMode === "dark" ? plan.color : "#111"),
      border: `2px solid ${theme.colorMode === "dark" ? plan.color : "#111"}`,
      borderRadius: radius, cursor: "pointer",
      fontWeight: 900, fontSize: 12, padding: "12px 0",
      width: "100%", fontFamily: theme.font,
      letterSpacing: 2, textTransform: "uppercase",
      boxShadow: `3px 3px 0 ${plan.color}`,
    };
  }

  if (theme.cardBg) {
    return {
      background: plan.color,
      color: "#fff",
      border: "none",
      borderRadius: radius, cursor: "pointer",
      fontWeight: 800, fontSize: 13, padding: "12px 0",
      width: "100%", fontFamily: theme.font,
      letterSpacing: 1,
    };
  }
  // elevated, flat, outlined — standard
  return {
    background: plan.highlighted ? plan.color : "transparent",
    color: plan.highlighted ? "#fff" : plan.color,
    border: `2px solid ${plan.color}`,
    borderRadius: radius, cursor: "pointer",
    fontWeight: 700, fontSize: 13, padding: "12px 0",
    width: "100%", fontFamily: theme.font,
    boxShadow: plan.highlighted ? `0 8px 24px ${plan.color}40` : "none",
  };
}

// 1g. Rating stars
function Stars({ rating, color }) {
  if (!rating) return null;
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "center", marginBottom: 12 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} width="11" height="11" viewBox="0 0 12 12"
          fill={i <= Math.round(rating) ? color : "none"} stroke={color} strokeWidth="1.2">
          <polygon points="6,1 7.8,4.5 11.5,5 8.75,7.7 9.5,11.5 6,9.5 2.5,11.5 3.25,7.7 0.5,5 4.2,4.5" />
        </svg>
      ))}
      <span style={{ fontSize: 10, color, marginLeft: 3, fontWeight: 700 }}>{rating}</span>
    </div>
  );
}


// ───────────────────────────────────────────────────────────────────────────
// SECTION 2 — LAYOUT COMPONENTS
// These handle STRUCTURE only. All visual decisions go through resolvers.
// They receive the full doc object: { layout, theme, plans, ... }
// ───────────────────────────────────────────────────────────────────────────

// Layout: grid-3, grid-4, grid-5
function GridLayout({ doc }) {
  const { theme, plans } = doc;
  const containerRef = useRef(null);
  const width = useContainerWidth(containerRef);
  const visible = useVisibleOnce(containerRef);
  const hasAnim = !!theme.animation && theme.animation !== "none";
  const baseCols = doc.layout === "grid-5" ? 5 : doc.layout === "grid-3" ? 3 : 4;
  const cols = width < 480 ? 1
    : width < 720 ? Math.min(2, baseCols)
      : width < 960 ? Math.min(3, baseCols)
        : baseCols;
  const onDark = theme.colorMode === "dark" || theme.cardStyle === "glass";

  const titleColor = onDark ? "#fff" : "#111";
  const subtitleColor = onDark ? "rgba(255,255,255,0.5)" : "#6b7280";

  return (
    <div ref={containerRef} style={{ background: theme.bg || "transparent", padding: theme.widgetPadding ?? (width < 480 ? "24px 16px" : "48px 28px"), fontFamily: theme.font, minHeight: 480, position: "relative", overflow: "visible" }}>
      <AnimStyleTag />
      {/* Page header */}
      {doc.pageTitle && (
        <div style={{ textAlign: "center", marginBottom: 44, position: "relative" }}>
          {doc.pageSubtitle && <p style={{ color: plans[0]?.color || "#6366f1", fontWeight: 700, fontSize: 11, letterSpacing: 3, textTransform: "uppercase", marginBottom: 8 }}>{doc.pageSubtitle}</p>}
          <h2 style={{ fontSize: width < 480 ? 24 : 36, fontWeight: 900, color: titleColor, margin: 0, letterSpacing: -0.5, fontFamily: theme.font }}>{doc.pageTitle}</h2>
          {doc.pageDescription && <p style={{ color: subtitleColor, marginTop: 8, fontSize: 14 }}>{doc.pageDescription}</p>}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gap: theme.cardGap ?? (cols === 5 ? 12 : 20), maxWidth: cols === 5 ? 1300 : 1100, margin: "0 auto" }}>
        {plans.map((plan, idx) => {
          const cardCSS = resolveCardCSS(theme, plan);
          const btnCSS = resolveButton(plan, theme);
          const animStyle = hasAnim
            ? (visible ? getCardAnim(theme.animation, idx, plans.length) : { opacity: 0 })
            : {};
          const cardBr = parseInt(theme.borderRadius, 10) || 12;
          const cardContent = (
            <>
              {plan.bgImage && (
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.6) 100%)", borderRadius: "inherit", zIndex: 0, pointerEvents: "none" }} />
              )}
              {theme.cardStyle === "full-color" && plan.bgGradient && (
                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)", borderRadius: "inherit", zIndex: 0, pointerEvents: "none" }} />
              )}
              {resolveAccentLine(theme, plan)}

              <div style={{ position: "relative", zIndex: 1, padding: theme.headerLayout === "image-bg" ? "0" : "0" }}>
                {resolveHeader(plan, theme)}
              </div>

              <div style={{ position: "relative", zIndex: 1, padding: theme.bodyPadding ?? "20px 22px 24px", flex: 1, display: "flex", flexDirection: "column" }}>
                {/* Rating */}
                {!!plan.rating && theme.headerLayout !== "image-bg" && (
                  <Stars rating={plan.rating} color={plan.color} />
                )}

                {/* Price */}
                <div style={{ marginBottom: 20 }}>
                  {resolvePrice(plan, theme)}
                </div>

                {/* Divider */}
                {!theme.cardBg && (theme.cardStyle === "elevated" || theme.cardStyle === "outlined" || theme.cardStyle === "flat") && (
                  <div style={{ height: 1, background: "#f1f5f9", marginBottom: 18 }} />
                )}

                {/* Features */}
                <div style={{ marginBottom: 24, flex: 1 }}>
                  {resolveFeatures(plan, theme)}
                </div>

                {/* Button */}
                {theme.buttonShape === "underline"
                  ? <button style={btnCSS}>{plan.buttonText} &rarr;</button>
                  : <button style={btnCSS}>{plan.buttonText}</button>
                }
              </div>
            </>
          );

          if (theme.glowBorder) {
            return (
              <GlowCard
                key={plan.id}
                colors={theme.glowColors || [plan.color, "#fff", plan.color]}
                thickness={theme.glowThickness ?? 2}
                speed={theme.glowSpeed ?? 3}
                blur={theme.glowBlur ?? 12}
                borderRadius={cardBr}
              >
                <div style={{ ...cardCSS, ...animStyle, border: "none", borderRadius: cardBr, display: "flex", flexDirection: "column", height: "100%" }}>
                  {cardContent}
                </div>
              </GlowCard>
            );
          }

          return (
            <div key={plan.id} style={{ ...cardCSS, ...animStyle }}>
              {cardContent}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Layout: horizontal-list (full-width columns side by side)
function HorizontalLayout({ doc }) {
  const { theme, plans } = doc;
  const containerRef = useRef(null);
  const width = useContainerWidth(containerRef);
  const visible = useVisibleOnce(containerRef);
  const hasAnim = !!theme.animation && theme.animation !== "none";

  return (
    <div ref={containerRef} style={{ fontFamily: theme.font, display: "flex", flexDirection: width < 600 ? "column" : "row", minHeight: 480 }}>
      <AnimStyleTag />
      {plans.map((plan, idx) => {
        const btnCSS = resolveButton(plan, theme);
        const animStyle = hasAnim
          ? (visible ? getCardAnim(theme.animation, idx, plans.length) : { opacity: 0 })
          : {};

        return (
          <div key={plan.id} style={{ flex: 1, display: "flex", flexDirection: "column", ...animStyle }}>
            {/* Colored header section */}
            <div style={{ background: plan.color, padding: "28px 22px 22px", position: "relative" }}>
              {resolveAccentLine(theme, plan)}
              {plan.badge?.trim() && (
                <div style={{
                  background: "rgba(0,0,0,0.25)", color: "#fff", fontSize: 9, fontWeight: 900,
                  padding: "3px 10px", borderRadius: 2, letterSpacing: 2, display: "inline-block",
                  marginBottom: 12, textTransform: "uppercase"
                }}>{plan.badge}</div>
              )}
              <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: 900, fontSize: 22, letterSpacing: -0.3 }}>{plan.name}</div>
              <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 11, marginTop: 2, marginBottom: 16 }}>{plan.description}</div>
              <div style={{ color: "#fff", fontWeight: 900, fontSize: 52, lineHeight: 1, letterSpacing: -2 }}>
                <span style={{ fontSize: 18, fontWeight: 700, verticalAlign: "super" }}>{plan.currency}</span>
                {plan.price}
              </div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>per {plan.period}</div>
            </div>

            {/* White body */}
            <div style={{ background: theme.cardBg || "#fff", flex: 1, padding: theme.bodyPadding ?? "20px 22px 24px", borderLeft: `3px solid ${plan.color}` }}>
              {!!plan.rating && <Stars rating={plan.rating} color={plan.color} />}
              <div style={{ marginBottom: 20 }}>
                {resolveFeatures(plan, theme)}
              </div>
              <button style={btnCSS}>{plan.buttonText}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Layout: tall-portrait (photo header cards)
function TallPortraitLayout({ doc }) {
  const { theme, plans } = doc;
  const containerRef = useRef(null);
  const width = useContainerWidth(containerRef);
  const visible = useVisibleOnce(containerRef);
  const hasAnim = !!theme.animation && theme.animation !== "none";
  const baseCols = plans.length;
  const cols = width < 480 ? 1
    : width < 720 ? Math.min(2, baseCols)
      : width < 960 ? Math.min(3, baseCols)
        : baseCols;

  return (
    <div ref={containerRef} style={{ background: theme.bg || "transparent", padding: theme.widgetPadding ?? (width < 480 ? "24px 16px" : "48px 28px"), fontFamily: theme.font }}>
      <AnimStyleTag />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gap: 16, maxWidth: 1100, margin: "0 auto" }}>
        {plans.map((plan, idx) => {
          const cardCSS = resolveCardCSS(theme, plan);
          const btnCSS = resolveButton(plan, theme);
          const animStyle = hasAnim
            ? (visible ? getCardAnim(theme.animation, idx, plans.length) : { opacity: 0 })
            : {};

          return (
            <div key={plan.id} style={{ ...cardCSS, ...animStyle }}>
              {theme.cardStyle === "full-color" && plan.bgGradient && (
                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)", borderRadius: "inherit", zIndex: 0, pointerEvents: "none" }} />
              )}
              {resolveAccentLine(theme, plan)}

              {/* image-bg: card IS the photo — no separate header image, just overlay content */}
              {theme.cardStyle === "image-bg" ? (
                <>
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.45) 40%, rgba(0,0,0,0.85) 100%)" }} />
                  {plan.badge?.trim() && <div style={{ position: "absolute", top: 12, right: 12, background: plan.color, color: "#fff", fontSize: 9, fontWeight: 900, padding: "3px 10px", borderRadius: theme.buttonShape === "pill" ? 99 : 2, letterSpacing: 1.5, zIndex: 2 }}>{plan.badge}</div>}
                  <div style={{ position: "relative", zIndex: 2, minHeight: cols === 1 ? "auto" : 360, display: "flex", flexDirection: "column", justifyContent: cols === 1 ? "flex-start" : "flex-end", padding: "18px 18px 22px" }}>
                    <div style={{ color: "#fff", fontWeight: 900, fontSize: 18, fontFamily: theme.font, marginBottom: 4 }}>{plan.name}</div>
                    {resolvePrice(plan, theme)}
                    <div style={{ margin: "14px 0 18px" }}>{resolveFeatures(plan, theme)}</div>
                    <button style={resolveButton(plan, theme)}>{plan.buttonText}</button>
                  </div>
                </>
              ) : (
                <>
                  {/* Non image-bg: classic image header */}
                  <div style={{ height: 200, background: plan.bgImage ? `url(${plan.bgImage}) center/cover` : plan.bgGradient, position: "relative" }}>
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom,transparent 35%,rgba(0,0,0,0.75))" }} />
                    {plan.badge?.trim() && <div style={{ position: "absolute", top: 12, right: 12, background: plan.color, color: "#fff", fontSize: 9, fontWeight: 900, padding: "3px 10px", borderRadius: theme.buttonShape === "pill" ? 99 : 2, letterSpacing: 1.5 }}>{plan.badge}</div>}
                    <div style={{ position: "absolute", bottom: 14, left: 16 }}>
                      <div style={{ color: "#fff", fontWeight: 900, fontSize: 20, fontFamily: theme.font }}>{plan.name}</div>
                      <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 }}>{plan.description}</div>
                    </div>
                  </div>
                  <div style={{ padding: "18px 18px 22px" }}>
                    {!!plan.rating && <Stars rating={plan.rating} color={plan.color} />}
                    <div style={{ marginBottom: 14 }}>
                      {resolvePrice(plan, theme)}
                    </div>
                    <div style={{ marginBottom: 20 }}>
                      {resolveFeatures(plan, theme)}
                    </div>
                    <button style={btnCSS}>{plan.buttonText}</button>
                  </div> {/* closes padding div */}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Layout: feature-matrix (plans as columns, features as rows)
function FeatureMatrixLayout({ doc }) {
  const { theme, plans } = doc;
  const features = doc.comparisonFeatures || [];

  return (
    <div style={{ background: theme.bg, padding: "40px 28px", fontFamily: theme.font }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {doc.pageTitle && (
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <h2 style={{ fontSize: 32, fontWeight: 800, color: "#111", margin: 0, fontFamily: theme.font }}>{doc.pageTitle}</h2>
            {doc.pageDescription && <p style={{ color: "#6b7280", marginTop: 8 }}>{doc.pageDescription}</p>}
          </div>
        )}
        <div style={{ background: "#fff", borderRadius: theme.borderRadius, overflow: "hidden", border: "1px solid #e5e7eb", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
          {/* Plan header row */}
          <div style={{ display: "grid", gridTemplateColumns: `200px repeat(${plans.length},1fr)`, background: "#f8fafc", borderBottom: "2px solid #e5e7eb" }}>
            <div style={{ padding: "20px 22px" }} />
            {plans.map(plan => (
              <div key={plan.id} style={{
                padding: "20px 16px", textAlign: "center", borderLeft: "1px solid #e5e7eb",
                background: plan.highlighted ? `${plan.color}08` : "transparent",
                borderTop: plan.highlighted ? `4px solid ${plan.color}` : "4px solid transparent"
              }}>
                {plan.badge?.trim() && <div style={{ background: plan.color, color: "#fff", fontSize: 9, fontWeight: 900, padding: "2px 8px", borderRadius: 99, display: "inline-block", marginBottom: 6, letterSpacing: 1 }}>{plan.badge}</div>}
                <div style={{ fontWeight: 800, fontSize: 16, color: "#111", fontFamily: theme.font }}>{plan.name}</div>
                <div style={{ fontWeight: 900, fontSize: 28, color: plan.color, letterSpacing: -1, fontFamily: theme.font }}>
                  {plan.currency}{plan.price}
                  <span style={{ fontWeight: 400, fontSize: 11, color: "#9ca3af" }}>/{plan.period}</span>
                </div>
                <div style={{ color: "#9ca3af", fontSize: 11, marginBottom: 10 }}>{plan.description}</div>
                <button style={{ padding: "8px 18px", background: plan.highlighted ? plan.color : "transparent", color: plan.highlighted ? "#fff" : plan.color, border: `1px solid ${plan.color}`, borderRadius: parseInt(theme.borderRadius) > 8 ? 8 : 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: theme.font }}>{plan.buttonText}</button>
              </div>
            ))}
          </div>

          {/* Feature rows */}
          {features.map((feat, fi) => (
            <div key={fi} style={{ display: "grid", gridTemplateColumns: `200px repeat(${plans.length},1fr)`, background: fi % 2 === 0 ? "#fff" : "#fafafa", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ padding: "13px 22px", fontWeight: 600, fontSize: 13, color: "#374151", display: "flex", alignItems: "center", fontFamily: theme.font }}>{feat.label}</div>
              {plans.map(plan => {
                const val = feat.values?.[plan.id] ?? "—";
                return (
                  <div key={plan.id} style={{ padding: "13px 16px", borderLeft: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", background: plan.highlighted ? `${plan.color}04` : "transparent" }}>
                    {val === "✓"
                      ? <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill={plan.color + "25"} stroke={plan.color} strokeWidth="1" /><path d="M4.5 8L7 10.5L11.5 5.5" stroke={plan.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      : val === "—"
                        ? <span style={{ color: "#d1d5db", fontSize: 16 }}>—</span>
                        : <span style={{ fontWeight: 700, fontSize: 13, color: "#374151" }}>{val}</span>
                    }
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Layout: comparison-table (styled differently from feature-matrix)
function ComparisonTableLayout({ doc }) {
  const { theme, plans } = doc;
  const features = doc.comparisonFeatures || [];

  return (
    <div style={{ background: theme.bg, padding: "40px 28px", fontFamily: theme.font }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {doc.pageTitle && (
          <div style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 40, fontWeight: 900, color: "#111", margin: 0, letterSpacing: -1, fontFamily: theme.font }}>{doc.pageTitle}</h2>
            {doc.pageDescription && <p style={{ color: "#6b7280", marginTop: 8, fontSize: 15 }}>{doc.pageDescription}</p>}
          </div>
        )}

        {/* Plan cards row */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${plans.length},1fr)`, gap: 16, marginBottom: 32 }}>
          {plans.map(plan => {
            const cardCSS = resolveCardCSS(theme, plan);
            const btnCSS = resolveButton(plan, theme);
            return (
              <div key={plan.id} style={{ ...cardCSS, ...animStyle }}>
                {resolveAccentLine(theme, plan)}
                {resolveHeader(plan, theme)}
                <div style={{ padding: "16px 22px 22px" }}>
                  {resolvePrice(plan, theme)}
                  <div style={{ height: 1, background: "#f1f5f9", margin: "16px 0" }} />
                  {resolveFeatures(plan, theme)}
                  <div style={{ marginTop: 20 }}>
                    <button style={btnCSS}>{plan.buttonText}</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Comparison rows */}
        {features.length > 0 && (
          <div style={{ background: "#fff", borderRadius: theme.borderRadius, border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: `200px repeat(${plans.length},1fr)`, background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
              <div style={{ padding: "12px 20px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>Feature</div>
              {plans.map(p => <div key={p.id} style={{ padding: "12px 16px", textAlign: "center", borderLeft: "1px solid #e2e8f0", fontWeight: 800, fontSize: 13, color: p.color, fontFamily: theme.font }}>{p.name}</div>)}
            </div>
            {features.map((feat, fi) => (
              <div key={fi} style={{ display: "grid", gridTemplateColumns: `200px repeat(${plans.length},1fr)`, background: fi % 2 === 0 ? "#fff" : "#f9fafb", borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ padding: "11px 20px", fontSize: 13, color: "#374151", fontWeight: 500, display: "flex", alignItems: "center" }}>{feat.label}</div>
                {plans.map(plan => {
                  const val = feat.values?.[plan.id] ?? "—";
                  return (
                    <div key={plan.id} style={{ padding: "11px 16px", borderLeft: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {val === "✓" ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2.5 8L6 11.5L13.5 4" stroke={plan.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        : val === "—" ? <span style={{ color: "#d1d5db" }}>—</span>
                          : <span style={{ fontWeight: 700, fontSize: 12, color: "#374151" }}>{val}</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


// ───────────────────────────────────────────────────────────────────────────
// SECTION 3 — THE ROUTER
// This is the entire engine entry point.
// Feed it any valid JSON doc -> it renders. No id mapping. No hardcoding.
// ───────────────────────────────────────────────────────────────────────────

const LAYOUT_MAP = {
  "grid-3": GridLayout,
  "grid-4": GridLayout,
  "grid-5": GridLayout,
  "horizontal-list": HorizontalLayout,
  "tall-portrait": TallPortraitLayout,
  "feature-matrix": FeatureMatrixLayout,
  "comparison-table": ComparisonTableLayout,
};

const VALID_NODE_TYPES = new Set([
  "row", "column", "photo-card", "grid", "scroll-row",
  "comparison-grid", "absolute", "absolute-band", "overlay",
  "text", "badge", "button", "price-block", "feature-list",
  "divider", "spacer", "stars", "image", "icon", "icon-link", "crest",
]);

const NODE_TYPE_ALIASES = {
  "section": "column",
  "card": "column",
  "container": "column",
  "div": "column",
  "box": "column",
  "hero": "photo-card",
  "wrapper": "column",
  "block": "column",
};

function normalizeNodeType(node) {
  if (!node || typeof node !== "object") return node;
  const alias = NODE_TYPE_ALIASES[node.type];
  if (!alias) return node;
  console.warn(
    `[NodeRenderer] "${node.type}" is not a valid type. Auto-remapped to "${alias}".`,
    node
  );
  return { ...node, type: alias };
}

function normalizeTree(node) {
  if (!node || typeof node !== "object") return node;
  const normalized = normalizeNodeType(node);
  if (Array.isArray(normalized.children)) {
    return {
      ...normalized,
      children: normalized.children.map((child) => normalizeTree(child)),
    };
  }
  return normalized;
}

function validateNodeTree(node, path = "root") {
  if (!node || typeof node !== "object") return;

  if (node.type && !VALID_NODE_TYPES.has(node.type)) {
    console.warn(`[NodeRenderer] Invalid type "${node.type}" at path: ${path}`, node);
  }

  if (Array.isArray(node.children)) {
    node.children.forEach((child, index) => {
      validateNodeTree(child, `${path}.children[${index}]`);
    });
  }
}

function NodeRenderer({ node, theme, depth = 0, containerWidth = 800 }) {
  const containerRef = useRef(null);
  const visible = useVisibleOnce(containerRef);
  const hasAnim = depth === 0 && !!theme?.animation && theme.animation !== "none";
  if (!node || typeof node !== "object") return null;

  const type = node.type;
  const children = Array.isArray(node.children) ? node.children : [];
  const fontFamily = node.fontFamily || theme?.font;
  const padding = resolveSpacing(node.padding);
  const gap = resolveSpacing(node.gap);
  const columns = typeof node.columns === "number" ? `repeat(${node.columns},1fr)` : (node.columns || `repeat(${children.length},1fr)`);
  const flexStyle = node.flex != null ? { flex: node.flex } : {};

  const renderChildren = () => children.map((child, idx) => (
    <NodeRenderer key={child?.id ?? `${type}-${idx}`} node={child} theme={theme} depth={depth + 1} containerWidth={containerWidth} />
  ));
  if (type === "row") {
    const isMobile = containerWidth < 600;
    const shouldStack = isMobile && (node.mobileLayout === "stack" || node.mobileStack);
    const resolvedHeight = px(node.height) || (depth === 0 ? undefined : "100%");
    return (
      <div ref={hasAnim ? containerRef : null} style={{
        display: "flex",
        flexDirection: shouldStack ? "column" : "row",
        position: "relative",
        alignItems: node.align,
        justifyContent: node.justify,
        gap: gap !== undefined ? gap : (node.gap === undefined ? "20px" : undefined),
        background: node.background,
        padding: padding,
        height: resolvedHeight,
        width: px(node.width),
        minHeight: px(node.minHeight),
        overflow: node.overflow,
        borderRadius: node.borderRadius,
        border: node.border,
        backdropFilter: node.backdropFilter,
        WebkitBackdropFilter: node.backdropFilter,
        transform: resolveTransform(node),
        flexShrink: node.flexShrink,
        flexBasis: px(node.flexBasis),
        boxSizing: "border-box",
        ...flexStyle,
      }}>
        {children.map((child, idx) => {
          const animStyle = hasAnim
            ? (visible ? getCardAnim(theme.animation, idx, children.length) : { opacity: 0 })
            : {};
          return (
            <div key={child?.id ?? `row-${idx}`} style={{ minWidth: 0, display: "flex", flexDirection: "column", alignSelf: "stretch", ...animStyle, ...(child?.flex ? { flex: child.flex } : {}) }}>
              <NodeRenderer node={child} theme={theme} depth={depth + 1} containerWidth={containerWidth} />
            </div>
          );
        })}
      </div>
    );
  }

  if (type === "column") {
    const resolvedHeight = px(node.height) || (depth === 0 ? undefined : "100%");
    const colStyle = {
      display: "flex",
      flexDirection: "column",
      position: "relative",
      alignItems: node.align,
      justifyContent: node.justify,
      gap: gap !== undefined ? gap : (() => {
        if (!node.gap && Array.isArray(node.children) && node.children.length) {
          const maxSize = node.children.reduce((m, c) => {
            if (c?.type === "text") return Math.max(m, c.size || 16);
            if (c?.type === "price-block") return Math.max(m, 32);
            if (c?.type === "button") return Math.max(m, 16);
            return m;
          }, 14);
          if (maxSize >= 36) return "16px";
          if (maxSize >= 24) return "12px";
          if (maxSize >= 18) return "8px";
          return "6px";
        }
        return undefined;
      })(),
      background: node.background,
      padding,
      height: resolvedHeight,
      width: px(node.width),
      minHeight: px(node.minHeight),
      overflow: node.overflow,
      borderRadius: node.borderRadius,
      border: node.glowBorder ? "none" : node.border,
      backdropFilter: node.backdropFilter,
      WebkitBackdropFilter: node.backdropFilter,
      transform: resolveTransform(node),
      flexShrink: node.flexShrink,
      flexBasis: px(node.flexBasis),
      boxSizing: "border-box",
      ...flexStyle,
    };

    if (depth === 1 && node.padding == null && node.background) {
      if (!colStyle.padding) {
        colStyle.paddingTop = colStyle.paddingTop || 48;
        colStyle.paddingBottom = colStyle.paddingBottom || 48;
      }
    }

    if (node.glowBorder) {
      const br = parseInt(node.borderRadius, 10) || 12;
      return (
        <GlowCard
          colors={node.glowColors}
          thickness={node.glowThickness ?? 2}
          speed={node.glowSpeed ?? 3}
          blur={node.glowBlur ?? 10}
          borderRadius={br}
          style={flexStyle}
        >
          <div style={{ ...colStyle, borderRadius: br }}>
            {renderChildren()}
          </div>
        </GlowCard>
      );
    }

    return <div style={colStyle}>{renderChildren()}</div>;
  }

  if (type === "photo-card") {
    const bgImage = normalizeAssetUrl(node.bgImage);
    const backgroundImage = node.bgGradient && bgImage
      ? `${node.bgGradient}, url(${bgImage})`
      : node.bgGradient || (bgImage ? `url(${bgImage})` : undefined);
    return (
      <div style={{
        position: "relative",
        overflow: node.overflow || "hidden",
        backgroundImage,
        backgroundSize: "cover",
        backgroundPosition: node.objectPosition || "center",
        backgroundRepeat: "no-repeat",
        height: px(node.height) || "100%",
        minHeight: px(node.minHeight) || (bgImage && !node.height ? "200px" : undefined),
        width: px(node.width),
        borderRadius: node.borderRadius,
        border: node.border,
        alignSelf: "stretch",
        transition: "background-image 0.2s ease",
        boxSizing: "border-box",
        ...flexStyle,
      }}>
        {renderChildren()}
      </div>
    );
  }
  if (type === "grid") {
    return (
      <div ref={hasAnim ? containerRef : null} style={{
        display: "grid",
        gridTemplateColumns: columns,
        gap, padding, background: node.background,
        width: node.width, maxWidth: node.maxWidth,
        margin: node.margin, boxSizing: "border-box",
      }}>
        {children.map((child, idx) => {
          const animStyle = hasAnim
            ? (visible ? getCardAnim(theme.animation, idx, children.length) : { opacity: 0 })
            : {};
          return (
            <div key={child?.id ?? `grid-${idx}`} style={animStyle}>
              <NodeRenderer node={child} theme={theme} depth={depth + 1} containerWidth={containerWidth} />
            </div>
          );
        })}
      </div>
    );
  }

  if (type === "comparison-grid") {
    const cols = node.columns || 4;
    const rowBg = node.rowBackground || [];
    return (
      <div style={{
        display: "grid",
        gridTemplateColumns: node.columnSizes || `repeat(${cols}, 1fr)`,
        background: node.background || "transparent",
        borderRadius: node.borderRadius,
        overflow: "hidden",
        width: node.width,
      }}>
        {children.map((child, idx) => {
          const rowIndex = Math.floor(idx / cols);
          const bg = rowBg.length ? rowBg[rowIndex % rowBg.length] : undefined;
          return (
            <div key={child?.id ?? idx} style={{
              background: bg,
              borderBottom: node.rowDivider ? `1px solid ${node.rowDivider}` : undefined,
              borderRight: node.colDivider && (idx + 1) % cols !== 0 ? `1px solid ${node.colDivider}` : undefined,
              padding: node.cellPadding || "10px 12px",
              minWidth: 0,
              boxSizing: "border-box",
            }}>
              <NodeRenderer node={child} theme={theme} containerWidth={containerWidth} />
            </div>
          );
        })}
      </div>
    );
  }
  if (type === "scroll-row") {
    return (
      <div style={{
        display: "flex",
        flexDirection: "row",
        gap,
        padding,
        background: node.background,
        overflowX: "scroll",
        overflowY: "visible",
        WebkitOverflowScrolling: "touch",
        scrollSnapType: node.snap ? "x mandatory" : undefined,
        boxSizing: "border-box",
        flexWrap: "nowrap",
        msOverflowStyle: "none",
        scrollbarWidth: node.hideScrollbar ? "none" : "auto",
      }}>
        {children.map((child, idx) => (
          <div key={child?.id ?? `scroll-${idx}`} style={{
            flexShrink: 0,
            scrollSnapAlign: node.snap ? "start" : undefined,
          }}>
            <NodeRenderer node={child} theme={theme} depth={depth + 1} containerWidth={containerWidth} />
          </div>
        ))}
      </div>
    );
  }

  if (type === "overlay") {
    return (
      <div style={{ position: "absolute", inset: 0, background: node.gradient || "transparent", pointerEvents: "none", zIndex: 0 }} />
    );
  }

  if (type === "absolute") {
    return (
      <div style={{
        position: "absolute",
        top: px(node.top),
        bottom: px(node.bottom),
        left: px(node.left),
        right: px(node.right),
        padding,
        zIndex: node.zIndex ?? 1,
        width: px(node.width),
        maxWidth: px(node.maxWidth),
        transform: node.transform,
        pointerEvents: node.pointerEvents,
        boxSizing: "border-box",
      }}>
        {renderChildren()}
      </div>
    );
  }

  if (type === "absolute-band") {
    const transformParts = [];
    if (node.center) transformParts.push("translateY(-50%)");
    if (node.translateY != null) {
      const ty = typeof node.translateY === "number" ? `${node.translateY}px` : node.translateY;
      transformParts.push(`translateY(${ty})`);
    }
    const top = node.center && node.top == null && node.bottom == null ? "50%" : node.top;
    return (
      <div style={{
        position: "absolute",
        left: 0,
        right: 0,
        top,
        bottom: node.center ? undefined : node.bottom,
        background: node.background,
        padding,
        backdropFilter: node.backdropFilter,
        WebkitBackdropFilter: node.backdropFilter,
        transform: transformParts.length ? transformParts.join(" ") : undefined,
        zIndex: node.zIndex ?? 1,
        boxSizing: "border-box",
      }}>
        {renderChildren()}
      </div>
    );
  }

  if (type === "price-block") {
    const size = node.size ?? 1;
    const color = node.color || "#111";
    const amount = node.amount ?? "";
    const currency = node.currency ?? "";
    const period = node.period ?? "";
    const suffix = node.suffixDash ? ".-" : "";

    if (node.style === "hero") {
      return (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
          <span style={{ color, fontSize: 18 * size, fontWeight: 700, marginTop: 10 * size, fontFamily }}>{currency}</span>
          <span style={{ color, fontWeight: 900, fontSize: 64 * size, lineHeight: 0.95, letterSpacing: -2, fontFamily }}>{amount}{suffix}</span>
          {period && <span style={{ color, fontSize: 12 * size, opacity: 0.7, marginTop: "auto", marginBottom: 8 * size }}>/ {period}</span>}
        </div>
      );
    }

    if (node.style === "stacked-currency") {
      return (
        <div style={{ lineHeight: 1, fontFamily }}>
          <div style={{ color, fontSize: 18 * size, fontWeight: 700, letterSpacing: 1, marginBottom: 2 }}>{currency}</div>
          <span style={{ color, fontWeight: 900, fontSize: 54 * size, letterSpacing: -2 }}>{amount}{suffix}</span>
          {period && <div style={{ color, fontSize: 12 * size, opacity: 0.7, marginTop: 4 }}>{period}</div>}
        </div>
      );
    }

    if (node.style === "slash") {
      return (
        <div>
          <span style={{ color, fontWeight: 900, fontSize: 44 * size, letterSpacing: -1, fontFamily }}>{currency}{amount}{suffix}</span>
          {period && <span style={{ color, fontSize: 12 * size, opacity: 0.65, fontFamily }}>/{period}</span>}
        </div>
      );
    }

    if (node.style === "inline") {
      return (
        <span style={{ color, fontWeight: 800, fontSize: 30 * size, fontFamily }}>
          {currency}{amount}{suffix}
          {period && <small style={{ fontWeight: 500, fontSize: 12 * size, opacity: 0.7, marginLeft: 4 }}>/{period}</small>}
        </span>
      );
    }

    return (
      <div>
        <span style={{ color, fontWeight: 900, fontSize: 34 * size, letterSpacing: -1, fontFamily }}>{amount}{suffix}</span>
      </div>
    );
  }

  if (type === "feature-list") {
    const items = Array.isArray(node.items)
      ? node.items.filter((item) => `${item ?? ""}`.trim())
      : [];
    const disabled = new Set(
      Array.isArray(node.disabledItems)
        ? node.disabledItems.filter((item) => `${item ?? ""}`.trim())
        : []
    );
    const accent = node.color || "#4f46e5";
    const textColor = node.textColor || node.color || "#1f2937";
    const muted = "rgba(0,0,0,0.45)";

    if (node.style === "checklist") {
      return (
        <div>
          {items.map((text, idx) => {
            const isDisabled = disabled.has(text);
            return (
              <div key={`${text}-${idx}`} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
                {isDisabled ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ marginTop: 2, opacity: 0.4 }}>
                    <circle cx="8" cy="8" r="7" stroke={accent} strokeWidth="1.5" />
                    <path d="M5 11L11 5M5 5L11 11" stroke={accent} strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ marginTop: 2 }}>
                    <circle cx="8" cy="8" r="7" fill={accent + "25"} stroke={accent} strokeWidth="1" />
                    <path d="M4.5 8L7 10.5L11.5 5.5" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                <span style={{ color: isDisabled ? muted : textColor, fontSize: 12, lineHeight: 1.5, textDecoration: isDisabled ? "line-through" : "none" }}>{text}</span>
              </div>
            );
          })}
        </div>
      );
    }

    if (node.style === "dotlist") {
      return (
        <div>
          {items.map((text, idx) => {
            const isDisabled = disabled.has(text);
            return (
              <div key={`${text}-${idx}`} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: isDisabled ? "#cbd5f5" : accent, boxShadow: isDisabled ? "none" : `0 0 8px ${accent}` }} />
                <span style={{ color: isDisabled ? muted : textColor, fontSize: 12, textDecoration: isDisabled ? "line-through" : "none" }}>{text}</span>
              </div>
            );
          })}
        </div>
      );
    }

    if (node.style === "tags") {
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {items.map((text, idx) => (
            <span key={`${text}-${idx}`} style={{ background: accent + "22", color: accent, fontSize: 11, padding: "4px 10px", borderRadius: 999 }}>{text}</span>
          ))}
        </div>
      );
    }

    if (node.style === "minimal") {
      return (
        <div>
          {items.map((text, idx) => {
            const isDisabled = disabled.has(text);
            return (
              <div key={`${text}-${idx}`} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(0,0,0,0.06)", fontSize: 12, color: isDisabled ? muted : textColor }}>
                <span style={{ color: isDisabled ? "#94a3b8" : accent, fontWeight: 900, fontSize: 10 }}>{isDisabled ? "x" : ">"}</span>
                <span style={{ textDecoration: isDisabled ? "line-through" : "none" }}>{text}</span>
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div>
        {items.map((text, idx) => (
          <div key={`${text}-${idx}`} style={{ color: node.textColor || node.color || "rgba(255,255,255,0.85)", fontSize: 12, marginBottom: 8, lineHeight: 1.5 }}>{text}</div>
        ))}
      </div>
    );
  }

  if (type === "button") {
    if (node.glowBorder) {
      return <GlowButton node={node} fontFamily={fontFamily} />;
    }
    const variant = node.variant || "solid";
    const size = node.size || "md";
    const sizeMap = {
      sm: { fontSize: 11, padding: "8px 12px" },
      md: { fontSize: 12, padding: "10px 14px" },
      lg: { fontSize: 14, padding: "12px 18px" },
    };
    const sizing = sizeMap[size] || sizeMap.md;
    const color = node.color || "#4f46e5";
    const textColor = node.textColor || (variant === "solid" ? "#fff" : color);

    const baseStyle = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      fontWeight: 700,
      borderRadius: node.borderRadius || 6,
      cursor: "pointer",
      fontFamily: node.fontFamily || fontFamily,
      letterSpacing: node.letterSpacing,
      textTransform: node.transform,
      width: node.fullWidth ? "100%" : "auto",
      transition: "all 0.18s ease",
      ...sizing,
    };

    let normalStyle = {};
    let hoverStyle = {};

    if (variant === "ghost") {
      normalStyle = { background: "transparent", color, border: "none" };
      hoverStyle = { background: node.hoverBg || `${color}18`, color: node.hoverColor || color };
    } else if (variant === "ghost-border") {
      const borderCol = node.borderColor || color;
      normalStyle = { background: "transparent", color: textColor, border: `2px solid ${borderCol}` };
      hoverStyle = { background: node.hoverBg || borderCol, color: node.hoverColor || "#fff" };
    } else if (variant === "white") {
      normalStyle = { background: "#fff", color, border: "none" };
      hoverStyle = { background: node.hoverBg || "#f3f4f6", color: node.hoverColor || color };
    } else if (variant === "underline") {
      normalStyle = { background: "transparent", color, border: "none", borderBottom: `2px solid ${color}`, borderRadius: 0, fontStyle: "italic", padding: 0 };
      hoverStyle = { color: node.hoverColor || color, opacity: 0.75 };
    } else {
      normalStyle = { background: color, color: textColor, border: "none" };
      hoverStyle = { background: node.hoverBg || `${color}cc`, color: node.hoverColor || textColor };
    }

    return (
      <HoverButton
        baseStyle={baseStyle}
        normalStyle={normalStyle}
        hoverStyle={hoverStyle}
        text={node.text}
      />
    );
  }

  if (type === "icon-link") {
    const justifyMap = { left: "flex-start", center: "center", right: "flex-end" };
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: justifyMap[node.align] || "flex-start", gap: 6, color: node.color, fontSize: 11 }}>
        <span>{node.icon}</span>
        <span>{node.text}</span>
      </div>
    );
  }

  if (type === "text") {
    const rawValue = typeof node.value === "string" ? node.value : "";
    if (!rawValue.trim()) return null;
    const size = node.size || 16;
    let autoMarginBottom = 4;
    if (size >= 36) autoMarginBottom = 14;
    else if (size >= 24) autoMarginBottom = 10;
    else if (size >= 18) autoMarginBottom = 8;

    return (
      <div style={{
        color: node.color || "#111",
        fontSize: node.size,
        fontWeight: node.weight,
        letterSpacing: node.letterSpacing,
        textTransform: node.transform,
        fontStyle: node.italic ? "italic" : "normal",
        textAlign: node.align,
        marginBottom: node.marginBottom !== undefined ? resolveSpacing(node.marginBottom) : autoMarginBottom,
        marginTop: node.marginTop !== undefined ? resolveSpacing(node.marginTop) : 0,
        fontFamily: node.fontFamily || fontFamily,
        lineHeight: node.lineHeight,
        transform: resolveTransform(node),
      }}>
        {node.value}
      </div>
    );
  }

  if (type === "badge") {
    if (!`${node.text ?? ""}`.trim()) return null;
    return (
      <span style={{ display: "inline-block", background: node.color || "#111", color: node.textColor || "#fff", padding: "4px 10px", fontSize: 10, letterSpacing: node.letterSpacing || 1.5, borderRadius: node.pill ? 999 : 3, fontWeight: 700, fontFamily: node.fontFamily || fontFamily, transform: resolveTransform(node) }}>
        {node.text}
      </span>
    );
  }

  if (type === "divider") {
    return (
      <div style={{ height: 1, background: node.color || "rgba(0,0,0,0.1)", margin: node.margin ?? "10px 0", opacity: node.opacity ?? 1 }} />
    );
  }

  if (type === "spacer") {
    return (
      <div style={{ flex: node.size ? "0 0 auto" : 1, height: node.size || undefined }} />
    );
  }

  if (type === "stars") {
    const rating = Math.max(0, Math.min(5, Number(node.rating) || 0));
    const starColor = node.color || "#f59e0b";
    const size = node.size || 12;
    return (
      <div style={{ display: "flex", gap: 2 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <span key={i} style={{ color: starColor, fontSize: size, opacity: i <= rating ? 1 : 0.25 }}>★</span>
        ))}
      </div>
    );
  }

  if (type === "crest") {
    const crestColor = node.color || "#111";
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {node.wingEmoji && <span style={{ fontSize: 14 }}>{node.wingEmoji}</span>}
          <div style={{ width: 36, height: 36, borderRadius: 6, border: `2px solid ${crestColor}`, display: "flex", alignItems: "center", justifyContent: "center", color: crestColor, fontWeight: 900, fontSize: 16 }}>
            {node.text}
          </div>
          {node.wingEmoji && <span style={{ fontSize: 14 }}>{node.wingEmoji}</span>}
        </div>
        {node.subtitle && <div style={{ fontSize: 10, letterSpacing: 1, color: crestColor }}>{node.subtitle}</div>}
        {node.tagline && <div style={{ fontSize: 10, opacity: 0.6, color: crestColor }}>{node.tagline}</div>}
      </div>
    );
  }

  if (type === "image") {
    const src = normalizeAssetUrl(node.src);
    return (
      <img
        src={src}
        alt=""
        onError={e => {
          e.currentTarget.style.opacity = "0.15";
          e.currentTarget.style.filter = "grayscale(1)";
        }}
        style={{
          width: node.width,
          height: node.height,
          borderRadius: node.borderRadius,
          objectFit: node.objectFit || "cover",
          objectPosition: node.objectPosition || "center",
          display: "block",
        }}
      />
    );
  }

  if (type === "icon") {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: node.background || "rgba(0,0,0,0.08)", borderRadius: node.borderRadius ?? 999, padding: node.padding ?? 6, fontSize: node.size || 14, transform: resolveTransform(node) }}>
        {node.emoji}
      </div>
    );
  }

  console.warn(`[NodeRenderer] Unknown node type: "${node.type}"`, node);
  return (
    <div style={{
      border: "2px dashed #ff4444",
      borderRadius: "8px",
      padding: "12px 16px",
      margin: "8px 0",
      background: "rgba(255,68,68,0.08)",
      color: "#ff4444",
      fontFamily: "monospace",
      fontSize: "13px",
    }}>
      <span>Unknown node type: </span>
      <strong>"{node.type}"</strong>
      <div style={{ fontSize: "11px", opacity: 0.7, marginTop: 4 }}>
        Valid types: row, column, photo-card, grid, scroll-row, comparison-grid,
        absolute, absolute-band, overlay, text, badge, button, price-block,
        feature-list, divider, spacer, stars, image, icon, icon-link, crest
      </div>
    </div>
  );
}

function PricingRenderer({ doc }) {
  const normalizedDoc = normalizeTemplateDoc(doc);
  const containerRef = useRef(null);
  const width = useContainerWidth(containerRef);
  const safeLayout = typeof normalizedDoc?.layout === "object" && normalizedDoc.layout !== null
    ? normalizeTree(normalizedDoc.layout)
    : null;
  useEffect(() => {
    const font = normalizedDoc?.theme?.font;
    if (!font) return;
    const match = font.match(/'([^']+)'|"([^"]+)"/);
    const name = match?.[1] || match?.[2];
    if (!name) return;
    const systemFonts = ["Arial", "Helvetica", "Georgia", "Verdana", "Times New Roman",
      "Courier New", "system-ui", "sans-serif", "serif", "monospace", "Trebuchet MS",
      "Palatino", "Segoe UI", "Tahoma", "Impact"];
    if (systemFonts.some(f => name.toLowerCase().includes(f.toLowerCase()))) return;
    const id = `gf-${name.replace(/\s/g, "-")}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name)}:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700&display=swap`;
    document.head.appendChild(link);
  }, [normalizedDoc?.theme?.font]);
  useEffect(() => {
    if (safeLayout) validateNodeTree(safeLayout);
  }, [safeLayout]);
  if (!normalizedDoc) return null;
  if (safeLayout) {
    return (
      <div ref={containerRef} style={{ fontFamily: normalizedDoc.theme?.font, background: normalizedDoc.theme?.bg }}>
        <AnimStyleTag />
        <NodeRenderer node={safeLayout} theme={normalizedDoc.theme} depth={0} containerWidth={width} />
      </div>
    );
  }
  const Layout = LAYOUT_MAP[normalizedDoc.layout] || GridLayout;
  return <Layout doc={normalizedDoc} />;
}

const TEMPLATE_META_KEYS = new Set(["id", "name", "category", "tag", "image"]);

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function normalizeTemplateDoc(raw) {
  if (!isPlainObject(raw)) return null;

  const source = isPlainObject(raw.template_data)
    ? raw.template_data
    : isPlainObject(raw.widget_data)
      ? raw.widget_data
      : raw;

  const config = isPlainObject(source.config_json) ? source.config_json : null;
  const doc = config
    ? {
      id: source.id,
      name: source.name,
      category: source.category,
      tag: source.tag,
      image: source.image ?? "",
      ...config,
    }
    : { ...source };

  if (!isPlainObject(doc)) return null;
  if (!isPlainObject(doc.theme)) doc.theme = {};
  if (!Array.isArray(doc.plans)) doc.plans = [];
  if (typeof doc.image !== "string") doc.image = "";
  return doc;
}

function serializeTemplateDoc(doc) {
  if (!isPlainObject(doc)) return null;

  const config_json = {};
  for (const [key, value] of Object.entries(doc)) {
    if (key.startsWith("_") || TEMPLATE_META_KEYS.has(key) || value === undefined) continue;
    config_json[key] = value;
  }

  if (!isPlainObject(config_json.theme)) config_json.theme = {};
  if (!Array.isArray(config_json.plans)) config_json.plans = [];

  return {
    id: doc.id ?? "",
    name: doc.name ?? "Template",
    category: doc.category ?? "General",
    tag: doc.tag ?? "",
    image: typeof doc.image === "string" ? doc.image : "",
    config_json,
  };
}


// ───────────────────────────────────────────────────────────────────────────
// SECTION 4 — DEMO TEMPLATE DOCUMENTS
// These are complete JSON documents — exactly what Django would store + serve.
// The engine doesn't know they're "demos". It just receives and renders.
// ───────────────────────────────────────────────────────────────────────────





const CAT_COLORS = { SaaS: "#14b8a6", Fitness: "#f97316", Restaurant: "#ec4899", Photography: "#06b6d4", Agency: "#8b5cf6", Lifestyle: "#a78bfa", Creative: "#ec4899", Enterprise: "#3b82f6", Bold: "#f59e0b", Premium: "#6366f1", Minimal: "#10b981" };
const CAT_ICONS = {
  "All": <LayoutGrid size={11} />,
  "SaaS": <Monitor size={11} />,
  "Fitness": <Dumbbell size={11} />,
  "Restaurant": <Utensils size={11} />,
  "Agency": <Building2 size={11} />,
  "Lifestyle": <Sparkles size={11} />,
  "Creative": <Palette size={11} />,
  "Enterprise": <Building2 size={11} />,
  "Bold": <Zap size={11} />,
  "Premium": <Star size={11} />,
  "Photography": <Camera size={11} />,
  "Travel": <Globe size={11} />,
  "Gaming": <Zap size={11} />,
};
const DEMO_DOCS = DEMO_TEMPLATES
  .map((template) => normalizeTemplateDoc(template))
  .filter(Boolean);
const ALL_CATS = ["All", ...Array.from(new Set(DEMO_DOCS.map(t => t.category)))];


// ───────────────────────────────────────────────────────────────────────────
// SECTION 5 — MINI PREVIEW (scaled-down renderer for gallery thumbnails)
// ───────────────────────────────────────────────────────────────────────────

function MiniPreview({ doc }) {
  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative", borderRadius: 10 }}>
      <div style={{ position: "absolute", inset: 0, transform: "scale(0.27)", transformOrigin: "top left", width: "370%", height: "370%", pointerEvents: "none" }}>
        <PricingRenderer doc={doc} />
      </div>
    </div>
  );
}


// ───────────────────────────────────────────────────────────────────────────
// SECTION 6 — EDITOR SIDEBAR
// ───────────────────────────────────────────────────────────────────────────

const INP = { width: "100%", padding: "7px 10px", border: "1.5px solid #e5e7eb", borderRadius: 6, fontSize: 12, color: "#1f2937", background: "#fafafa", boxSizing: "border-box", fontFamily: "inherit", outline: "none" };
const PRESET_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#0ea5e9", "#06b6d4", "#84cc16", "#000", "#fff"];

// --- UNIVERSAL TREE EDITOR HELPERS -------------------------------------------------

const EDITABLE_NODE_TYPES = [
  "text", "price-block", "button", "badge",
  "feature-list", "photo-card", "image", "column", "row", "stars"
];

function findEditableNodes(node, path = [], results = []) {
  if (!node || typeof node !== "object") return results;
  if (EDITABLE_NODE_TYPES.includes(node.type)) {
    results.push({ node, path: [...path] });
  }
  if (Array.isArray(node.children)) {
    node.children.forEach((child, idx) => {
      findEditableNodes(child, [...path, "children", idx], results);
    });
  }
  return results;
}

function updateAtPath(obj, path, updater) {
  if (path.length === 0) return updater(obj);
  const [key, ...rest] = path;
  if (Array.isArray(obj)) {
    const copy = [...obj];
    copy[key] = updateAtPath(copy[key], rest, updater);
    return copy;
  }
  return { ...obj, [key]: updateAtPath(obj[key], rest, updater) };
}

function cloneNodeShell(node) {
  if (!node || typeof node !== "object") return { type: "column", children: [] };
  const { children, ...rest } = node;
  return { ...rest, children: [] };
}

function ensureTargetParentPath(layout, targetCardPath, sourceCardPath, sourceParentPath) {
  let nextLayout = layout;
  let currentTargetPath = [...targetCardPath];
  let currentSourcePath = [...(sourceCardPath || [])];

  for (let i = 0; i < (sourceParentPath || []).length; i += 2) {
    const key = sourceParentPath[i];
    const sourceIndex = sourceParentPath[i + 1];
    if (key !== "children" || typeof sourceIndex !== "number") break;

    currentSourcePath = [...currentSourcePath, key, sourceIndex];
    const sourceNode = getAtPath(layout, currentSourcePath);
    if (!sourceNode || typeof sourceNode !== "object") break;

    let targetChildren = getAtPath(nextLayout, [...currentTargetPath, "children"]);
    if (!Array.isArray(targetChildren)) {
      nextLayout = updateAtPath(nextLayout, currentTargetPath, (node) => ({
        ...node,
        children: [],
      }));
      targetChildren = [];
    }

    let actualIndex = sourceIndex;
    const existingAtSourceIndex = getAtPath(nextLayout, [...currentTargetPath, "children", sourceIndex]);
    if (!existingAtSourceIndex) {
      actualIndex = Math.max(0, Math.min(sourceIndex, targetChildren.length));
      nextLayout = updateAtPath(nextLayout, currentTargetPath, (node) => {
        const children = [...(node.children || [])];
        children.splice(actualIndex, 0, cloneNodeShell(sourceNode));
        return { ...node, children };
      });
    }

    currentTargetPath = [...currentTargetPath, "children", actualIndex];
  }

  return { layout: nextLayout, targetParentPath: currentTargetPath };
}

function addMissingNodeToCard(layout, targetCardPath, nodeToAdd, sourceCardPath, sourceParentPath, insertIndex) {
  const { layout: preparedLayout, targetParentPath } = ensureTargetParentPath(
    layout,
    targetCardPath,
    sourceCardPath,
    sourceParentPath
  );

  return updateAtPath(preparedLayout, targetParentPath, (node) => ({
    ...node,
    children: (() => {
      const children = [...(node.children || [])];
      const slotIndex = nodeToAdd?._slotKey
        ? children.findIndex((child) => child?._slotKey === nodeToAdd._slotKey)
        : -1;
      if (slotIndex >= 0) {
        children[slotIndex] = { ...children[slotIndex], ...nodeToAdd };
        return children;
      }

      const nextIndex = typeof insertIndex === "number"
        ? Math.max(0, Math.min(insertIndex, children.length))
        : children.length;
      const existingChild = children[nextIndex];
      if (existingChild?.type === nodeToAdd?.type) {
        children[nextIndex] = { ...existingChild, ...nodeToAdd };
      } else {
        children.splice(nextIndex, 0, { ...nodeToAdd });
      }
      return children;
    })(),
  }));
}

function createEmptyNodeClone(node) {
  if (!node || typeof node !== "object") return node;

  if (node.type === "badge") return { ...node, text: "" };
  if (node.type === "text") return { ...node, value: "" };
  if (node.type === "button") return { ...node, text: "" };

  return { ...node };
}

function normalizeAssetUrl(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  const markdownMatch = trimmed.match(/^\[[^\]]*\]\((https?:\/\/[^)\s]+)\)$/i);
  if (markdownMatch) return markdownMatch[1];

  const quotedMatch = trimmed.match(/^["'](https?:\/\/[^"']+)["']$/i);
  if (quotedMatch) return quotedMatch[1];

  return trimmed;
}

function normalizeDocAssetUrls(node) {
  if (Array.isArray(node)) {
    return node.map(normalizeDocAssetUrls);
  }

  if (!node || typeof node !== "object") return node;

  const next = { ...node };
  if (typeof next.bgImage === "string") {
    next.bgImage = normalizeAssetUrl(next.bgImage);
  }
  if (typeof next.src === "string") {
    next.src = normalizeAssetUrl(next.src);
  }
  if (Array.isArray(next.children)) {
    next.children = next.children.map(normalizeDocAssetUrls);
  }
  if (next.layout && typeof next.layout === "object") {
    next.layout = normalizeDocAssetUrls(next.layout);
  }
  if (Array.isArray(next.plans)) {
    next.plans = next.plans.map((plan) => {
      if (!plan || typeof plan !== "object") return plan;
      return {
        ...plan,
        bgImage: typeof plan.bgImage === "string" ? normalizeAssetUrl(plan.bgImage) : plan.bgImage,
      };
    });
  }

  return next;
}

function getNodeLabel(node, index) {
  if (node.type === "text") return `"${(node.value || "").slice(0, 28)}${node.value?.length > 28 ? "..." : ""}"`;
  if (node.type === "price-block") return `Price: ${node.currency || ""}${node.amount || ""}`;
  if (node.type === "button") return `Button: "${node.text || ""}"`;
  if (node.type === "badge") return `Badge: "${node.text || ""}"`;
  if (node.type === "feature-list") return `Features (${node.items?.length || 0} items)`;
  if (node.type === "photo-card") return `Photo Card`;
  if (node.type === "image") return `Image`;
  if (node.type === "column") return `Column bg`;
  if (node.type === "row") return `Row bg`;
  if (node.type === "stars") return `Stars: ${node.rating}`;
  return node.type;
}

function ColorField({ label, value, onChange, INP2, LBL }) {
  const pickerValue = typeof value === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)
    ? value
    : "#000000";

  return (
    <div>
      <label style={LBL}>{label}</label>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type="color"
          value={pickerValue}
          onChange={e => onChange(e.target.value)}
          style={{
            width: 34, height: 30, borderRadius: 5,
            border: "1.5px solid #e5e7eb", padding: 2, cursor: "pointer"
          }}
        />
        <input
          style={{ ...INP2, flex: 1 }}
          value={value || ""}
          onChange={e => onChange(e.target.value)}
          placeholder="#ffffff"
        />
      </div>
      <div style={{ display: "flex", gap: 3, marginTop: 6, flexWrap: "wrap" }}>
        {PRESET_COLORS.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            style={{
              width: 18, height: 18, borderRadius: 4,
              background: c,
              border: value === c ? "2px solid #6366f1" : "1.5px solid #e5e7eb",
              cursor: "pointer"
            }}
          />
        ))}
      </div>
    </div>
  );
}

function componentToHex(value) {
  return Math.max(0, Math.min(255, Number(value) || 0)).toString(16).padStart(2, "0");
}

function rgbToHex(r, g, b) {
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
}

function parseEditableBackground(value) {
  if (typeof value !== "string" || !value.trim()) {
    return { color: "#4d4d4d", alpha: 70, raw: "" };
  }

  const trimmed = value.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) {
    const hex = trimmed.length === 4
      ? `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`
      : trimmed;
    return { color: hex, alpha: 100, raw: trimmed };
  }

  const rgbaMatch = trimmed.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i);
  if (rgbaMatch) {
    const [, r, g, b, a] = rgbaMatch;
    return {
      color: rgbToHex(r, g, b),
      alpha: a == null ? 100 : Math.round(Number(a) * 100),
      raw: trimmed,
    };
  }

  return { color: "#4d4d4d", alpha: 70, raw: trimmed };
}

function buildBackgroundColorValue(color, alpha) {
  const normalizedAlpha = Math.max(0, Math.min(100, Number(alpha) || 0));
  if (!/^#([0-9a-f]{6})$/i.test(color)) return color;
  const hex = color.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if (normalizedAlpha >= 100) return color;
  return `rgba(${r}, ${g}, ${b}, ${(normalizedAlpha / 100).toFixed(2).replace(/0+$/, "").replace(/\.$/, "")})`;
}

const FONT_OPTIONS = [
  "'Inter', sans-serif",
  "'DM Sans', sans-serif",
  "'Plus Jakarta Sans', sans-serif",
  "'Poppins', sans-serif",
  "'Nunito', sans-serif",
  "'Space Grotesk', sans-serif",
  "'Playfair Display', serif",
  "'Cormorant Garamond', serif",
  "'DM Serif Display', serif",
  "'Lora', serif",
  "'Oswald', sans-serif",
  "'Bebas Neue', sans-serif",
  "'Barlow Condensed', sans-serif",
  "'Dancing Script', cursive",
  "'Pacifico', cursive",
  "'JetBrains Mono', monospace",
  "'Space Mono', monospace",
];

function FontFamilyField({ label, value, onChange, INP2, LBL }) {
  const listId = "mode-b-font-options";
  return (
    <div>
      <label style={LBL}>{label}</label>
      <input
        list={listId}
        style={INP2}
        value={value || ""}
        onChange={e => onChange(e.target.value)}
        placeholder="'Inter', sans-serif"
      />
      <datalist id={listId}>
        {FONT_OPTIONS.map((font) => (
          <option key={font} value={font} />
        ))}
      </datalist>
    </div>
  );
}

function BackgroundField({ label, value, onChange, INP2, LBL }) {
  const parsed = parseEditableBackground(value);

  return (
    <div>
      <label style={LBL}>{label}</label>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type="color"
          value={parsed.color}
          onChange={(e) => onChange(buildBackgroundColorValue(e.target.value, parsed.alpha))}
          style={{
            width: 34, height: 30, borderRadius: 5,
            border: "1.5px solid #e5e7eb", padding: 2, cursor: "pointer"
          }}
        />
        <input
          style={{ ...INP2, flex: 1 }}
          value={parsed.color}
          onChange={(e) => onChange(buildBackgroundColorValue(e.target.value, parsed.alpha))}
          placeholder="#4d4d4d"
        />
        <input
          style={{ ...INP2, width: 56, textAlign: "center" }}
          value={parsed.alpha}
          onChange={(e) => onChange(buildBackgroundColorValue(parsed.color, Number(e.target.value)))}
          placeholder="70%"
        />
        <button
          type="button"
          onClick={() => onChange("")}
          style={{
            border: "1.5px solid #e5e7eb",
            background: "#fff",
            borderRadius: 6,
            height: 32,
            padding: "0 10px",
            cursor: "pointer",
            fontSize: 11,
            color: "#64748b",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
          }}
        >
          Clear
        </button>
      </div>
      <div style={{ display: "flex", gap: 3, marginTop: 6, flexWrap: "wrap" }}>
        {PRESET_COLORS.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(buildBackgroundColorValue(c, parsed.alpha))}
            style={{
              width: 18, height: 18, borderRadius: 4,
              background: c,
              border: parsed.color.toLowerCase() === c.toLowerCase() ? "2px solid #6366f1" : "1.5px solid #e5e7eb",
              cursor: "pointer"
            }}
          />
        ))}
      </div>
      <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 4 }}>
        Pick a color like Mode A, set opacity as a percentage, or clear it to make the parent transparent.
      </div>
      <input
        style={{ ...INP2, marginTop: 6 }}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#1e3a6e, rgba(...), or linear-gradient(...)"
      />
    </div>
  );
}

function NodeEditor({ node, path, onUpdate }) {
  const update = (field, value) => onUpdate(path, field, value);

  const INP2 = {
    width: "100%", padding: "7px 10px", border: "1.5px solid #e5e7eb",
    borderRadius: 6, fontSize: 12, color: "#1f2937", background: "#fafafa",
    boxSizing: "border-box", fontFamily: "inherit", outline: "none"
  };
  const LBL = {
    fontSize: 9, fontWeight: 700, color: "#6b7280", letterSpacing: 1,
    textTransform: "uppercase", marginBottom: 4, display: "block"
  };

  if (node.type === "text") return (
    <div>
      <label style={LBL}>Text</label>
      <input style={INP2} value={node.value || ""} onChange={e => update("value", e.target.value)} />
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        <div style={{ flex: 1 }}>
          <ColorField label="Color" value={node.color || ""} onChange={(value) => update("color", value)} INP2={INP2} LBL={LBL} />
        </div>
        <div style={{ width: 52 }}>
          <label style={LBL}>Size</label>
          <input style={INP2} value={node.size || ""} onChange={e => update("size", Number(e.target.value) || e.target.value)} placeholder="14" />
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        <div style={{ flex: 1 }}>
          <label style={LBL}>Weight</label>
          <select style={INP2} value={node.weight || 400} onChange={e => update("weight", Number(e.target.value) || 400)}>
            {[300, 400, 500, 600, 700, 800, 900].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={LBL}>Align</label>
          <select style={INP2} value={node.align || "left"} onChange={e => update("align", e.target.value)}>
            {["left", "center", "right"].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        <div style={{ flex: 1 }}>
          <label style={LBL}>Transform</label>
          <select style={INP2} value={node.transform || "none"} onChange={e => update("transform", e.target.value === "none" ? undefined : e.target.value)}>
            {["none", "uppercase", "capitalize", "lowercase"].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div style={{ width: 74 }}>
          <label style={LBL}>Letter Spacing</label>
          <input style={INP2} value={node.letterSpacing ?? ""} onChange={e => update("letterSpacing", e.target.value === "" ? undefined : Number(e.target.value))} placeholder="0" />
        </div>
      </div>
      <div style={{ marginTop: 6 }}>
        <FontFamilyField label="Font Family" value={node.fontFamily || ""} onChange={(value) => update("fontFamily", value || undefined)} INP2={INP2} LBL={LBL} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#475569", cursor: "pointer" }}>
          <input type="checkbox" checked={!!node.italic} onChange={e => update("italic", e.target.checked)} />
          Italic
        </label>
      </div>
    </div>
  );

  if (node.type === "price-block") return (
    <div>
      <label style={LBL}>Price</label>
      <div style={{ display: "flex", gap: 4 }}>
        <input style={{ ...INP2, width: 36 }} value={node.currency || ""} onChange={e => update("currency", e.target.value)} placeholder="$" />
        <input style={{ ...INP2, flex: 1 }} value={node.amount || ""} onChange={e => update("amount", e.target.value)} placeholder="49" />
        <input style={{ ...INP2, width: 52 }} value={node.period || ""} onChange={e => update("period", e.target.value)} placeholder="mo" />
      </div>
      <div style={{ fontSize: 9, color: "#9ca3af", marginTop: 2 }}>symbol - amount - period</div>
      <div style={{ marginTop: 6 }}>
        <ColorField label="Color" value={node.color || ""} onChange={(value) => update("color", value)} INP2={INP2} LBL={LBL} />
      </div>
    </div>
  );

  if (node.type === "button") return (
    <div>
      <label style={LBL}>Button Text</label>
      <input style={INP2} value={node.text || ""} onChange={e => update("text", e.target.value)} />
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        <div style={{ flex: 1 }}>
          <ColorField label="Background" value={node.color || ""} onChange={(value) => update("color", value)} INP2={INP2} LBL={LBL} />
        </div>
        <div style={{ flex: 1 }}>
          <ColorField label="Text Color" value={node.textColor || ""} onChange={(value) => update("textColor", value)} INP2={INP2} LBL={LBL} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        <div style={{ flex: 1 }}>
          <label style={LBL}>Size</label>
          <select style={INP2} value={node.size || "md"} onChange={e => update("size", e.target.value)}>
            {["sm", "md", "lg"].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={LBL}>Transform</label>
          <select style={INP2} value={node.transform || "none"} onChange={e => update("transform", e.target.value === "none" ? undefined : e.target.value)}>
            {["none", "uppercase", "capitalize", "lowercase"].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        <div style={{ width: 84 }}>
          <label style={LBL}>Radius</label>
          <input style={INP2} value={node.borderRadius ?? ""} onChange={e => update("borderRadius", e.target.value === "" ? undefined : Number(e.target.value))} placeholder="6" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={LBL}>Letter Spacing</label>
          <input style={INP2} value={node.letterSpacing ?? ""} onChange={e => update("letterSpacing", e.target.value === "" ? undefined : Number(e.target.value))} placeholder="0" />
        </div>
      </div>
      <div style={{ marginTop: 6 }}>
        <FontFamilyField label="Font Family" value={node.fontFamily || ""} onChange={(value) => update("fontFamily", value || undefined)} INP2={INP2} LBL={LBL} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#475569", cursor: "pointer" }}>
          <input type="checkbox" checked={!!node.fullWidth} onChange={e => update("fullWidth", e.target.checked)} />
          Full Width
        </label>
      </div>
    </div>
  );

  if (node.type === "badge") return (
    <div>
      <label style={LBL}>Badge Text</label>
      <input style={INP2} value={node.text || ""} onChange={e => update("text", e.target.value)} />
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        <div style={{ flex: 1 }}>
          <ColorField label="Background" value={node.color || ""} onChange={(value) => update("color", value)} INP2={INP2} LBL={LBL} />
        </div>
        <div style={{ flex: 1 }}>
          <ColorField label="Text Color" value={node.textColor || ""} onChange={(value) => update("textColor", value)} INP2={INP2} LBL={LBL} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        <div style={{ flex: 1 }}>
          <label style={LBL}>Letter Spacing</label>
          <input style={INP2} value={node.letterSpacing ?? ""} onChange={e => update("letterSpacing", e.target.value === "" ? undefined : Number(e.target.value))} placeholder="1.5" />
        </div>
      </div>
      <div style={{ marginTop: 6 }}>
        <FontFamilyField label="Font Family" value={node.fontFamily || ""} onChange={(value) => update("fontFamily", value || undefined)} INP2={INP2} LBL={LBL} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#475569", cursor: "pointer" }}>
          <input type="checkbox" checked={!!node.pill} onChange={e => update("pill", e.target.checked)} />
          Pill Shape
        </label>
      </div>
    </div>
  );

  if (node.type === "feature-list") return (
    <div>
      <label style={LBL}>Items (one per line)</label>
      <textarea
        style={{ ...INP2, height: 90, resize: "vertical", lineHeight: 1.7 }}
        value={(node.items || []).join("\n")}
        onChange={e => update("items", e.target.value.split("\n"))}
      />
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        <div style={{ flex: 1 }}>
          <label style={LBL}>Style</label>
          <select style={INP2} value={node.style || "plain"} onChange={e => update("style", e.target.value)}>
            {["plain", "checklist", "dotlist", "tags", "minimal"].map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        <div style={{ flex: 1 }}>
          <ColorField label="Accent Color" value={node.color || ""} onChange={(value) => update("color", value)} INP2={INP2} LBL={LBL} />
        </div>
        <div style={{ flex: 1 }}>
          <ColorField label="Text Color" value={node.textColor || ""} onChange={(value) => update("textColor", value)} INP2={INP2} LBL={LBL} />
        </div>
      </div>
      {node.disabledItems?.length > 0 && (
        <>
          <label style={{ ...LBL, marginTop: 6 }}>Disabled Items (crossed out)</label>
          <textarea
            style={{ ...INP2, height: 60, resize: "vertical", lineHeight: 1.7 }}
            value={(node.disabledItems || []).join("\n")}
            onChange={e => update("disabledItems", e.target.value.split("\n"))}
          />
        </>
      )}
    </div>
  );

  if (node.type === "photo-card") return (
    <div>
      <label style={LBL}>Photo URL</label>
      <input style={INP2} value={normalizeAssetUrl(node.bgImage || "")} onChange={e => update("bgImage", normalizeAssetUrl(e.target.value))} placeholder="https://images.unsplash.com/..." />
      {node.bgImage && (
        <div style={{ marginTop: 6, borderRadius: 6, overflow: "hidden", height: 60, background: `url(${normalizeAssetUrl(node.bgImage)}) center/cover` }} />
      )}
      <label style={{ ...LBL, marginTop: 8 }}>Focal Point</label>
      <select style={{ ...INP2 }} value={node.objectPosition || "center"} onChange={e => update("objectPosition", e.target.value)}>
        {["center", "top", "bottom", "center top", "center bottom", "50% 30%", "50% 70%"].map(v => (
          <option key={v} value={v}>{v}</option>
        ))}
      </select>
    </div>
  );

  if (node.type === "image") return (
    <div>
      <label style={LBL}>Image URL</label>
      <input style={INP2} value={normalizeAssetUrl(node.src || "")} onChange={e => update("src", normalizeAssetUrl(e.target.value))} />
    </div>
  );

  if (node.type === "column" || node.type === "row") return (
    <div>
      <BackgroundField
        label={`${node.type === "column" ? "Column" : "Row"} Background`}
        value={node.background || ""}
        onChange={(value) => update("background", value)}
        INP2={INP2}
        LBL={LBL}
      />
    </div>
  );

  if (node.type === "stars") return (
    <div>
      <label style={LBL}>Rating (0-5)</label>
      <input style={INP2} type="number" min="0" max="5" step="0.1"
        value={node.rating || 0} onChange={e => update("rating", parseFloat(e.target.value) || 0)} />
    </div>
  );

  return null;
}

const TAB_COLORS = [
  "#6366f1", "#f97316", "#10b981", "#ec4899",
  "#f59e0b", "#3b82f6", "#8b5cf6", "#14b8a6",
];

const SECTION_META = {
  "Identity": { icon: "Aa", tone: "#6366f1" },
  "Pricing": { icon: "$", tone: "#10b981" },
  "Features": { icon: "==", tone: "#f59e0b" },
  "Actions": { icon: "Go", tone: "#ec4899" },
  "Media": { icon: "Img", tone: "#3b82f6" },
  "Layout": { icon: "Lay", tone: "#8b5cf6" },
  "Content": { icon: "Aa", tone: "#6366f1" },
};

function findCards(layout) {
  if (!layout) return { cards: [], containerPath: [] };

  const isCardContainer = (node) =>
    (node?.type === "row" || node?.type === "grid") &&
    Array.isArray(node.children) &&
    node.children.length >= 2 &&
    node.children.some((c) => c?.type === "column" || c?.type === "photo-card");

  // Root is directly a row/grid of cards
  if (isCardContainer(layout)) {
    return { cards: layout.children, containerPath: ["children"] };
  }

  // Root is a column — scan direct children for a card row/grid
  if (layout.type === "column" && Array.isArray(layout.children)) {
    for (let i = 0; i < layout.children.length; i++) {
      if (isCardContainer(layout.children[i])) {
        return {
          cards: layout.children[i].children,
          containerPath: ["children", i, "children"],
        };
      }
    }
  }

  return { cards: [], containerPath: [] };
}

function getHeaderNodes(layout, containerPath) {
  if (!layout || containerPath.length === 0) return [];

  const results = [];
  const cardRowIndex = containerPath[1];

  if (EDITABLE_NODE_TYPES.includes(layout.type)) {
    results.push({ node: layout, path: [] });
  }

  if (layout.type !== "column" || !Array.isArray(layout.children) || typeof cardRowIndex !== "number") {
    return results;
  }

  layout.children.forEach((child, index) => {
    if (index === cardRowIndex) return;
    findEditableNodes(child, ["children", index], results);
  });

  return results;
}

function UniversalTreeEditor({ doc, onUpdateTree }) {
  const [activeCard, setActiveCard] = useState(-1);

  const { cards, containerPath } = findCards(doc.layout);
  const isSingleRoot = cards.length === 0;
  const headerNodes = getHeaderNodes(doc.layout, containerPath);

  const handleUpdate = useCallback((path, field, value) => {
    const newLayout = updateAtPath(doc.layout, path, (node) => ({
      ...node,
      [field]: value,
    }));
    onUpdateTree(newLayout);
  }, [doc.layout, onUpdateTree]);

  const handleAddToCard = useCallback((nodeToAdd, sourceCardPath, sourceParentPath, targetCardPath, insertIndex) => {
    const newLayout = addMissingNodeToCard(
      doc.layout,
      targetCardPath,
      nodeToAdd,
      sourceCardPath,
      sourceParentPath,
      insertIndex
    );
    onUpdateTree(newLayout);
  }, [doc.layout, onUpdateTree]);

  // ── Single root (no card structure detected) ──────────────────────────
  if (isSingleRoot) {
    return (
      <div>
        <div style={{
          padding: "10px 14px 8px",
          borderBottom: "1px solid #f3f4f6",
          background: "#f8fafc",
        }}>
          <div style={{
            fontSize: 9, fontWeight: 700, color: "#9ca3af",
            letterSpacing: 1.5, textTransform: "uppercase",
          }}>
            Single Layout — All Fields
          </div>
        </div>
        <FlatNodeEditor
          nodes={findEditableNodes(doc.layout)}
          onUpdate={handleUpdate}
        />
      </div>
    );
  }

  const hasPageTab = headerNodes.length > 0;
  const isPageActive = hasPageTab && activeCard === -1;
  const safeActive = Math.min(Math.max(activeCard, 0), cards.length - 1);
  const activeCardPath = [...containerPath, safeActive];
  const activeCardName = isPageActive ? "Page Content" : getCardName(cards[safeActive], safeActive);
  const activeColor = isPageActive ? "#6366f1" : TAB_COLORS[safeActive % TAB_COLORS.length];

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* ── Tab strip ─────────────────────────────────────────────── */}
      <div style={{
        background: "linear-gradient(180deg,#f8fafc 0%,#f1f5f9 100%)",
        borderBottom: "1px solid #e2e8f0",
        padding: "12px 12px 0",
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: 8, fontWeight: 700, color: "#b0b8c8",
          letterSpacing: 1.5, textTransform: "uppercase",
          marginBottom: 10, paddingLeft: 2,
        }}>
          {hasPageTab ? cards.length + 1 : cards.length} Tabs
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {hasPageTab && (
            <button
              onClick={() => setActiveCard(-1)}
              style={{
                padding: "7px 12px",
                borderRadius: 10,
                border: isPageActive ? "1px solid rgba(99,102,241,0.22)" : "1px solid rgba(148,163,184,0.15)",
                borderBottom: isPageActive ? "2px solid #6366f1" : "2px solid transparent",
                cursor: "pointer",
                fontSize: 10,
                fontWeight: isPageActive ? 800 : 500,
                fontFamily: "inherit",
                background: isPageActive ? "#fff" : "rgba(255,255,255,0.55)",
                color: isPageActive ? "#6366f1" : "#9ca3af",
                transition: "all .15s",
                display: "flex",
                alignItems: "center",
                gap: 5,
                boxShadow: isPageActive ? "0 10px 24px rgba(15,23,42,0.08)" : "0 2px 8px rgba(15,23,42,0.04)",
                whiteSpace: "nowrap",
              }}
            >
              <div style={{
                width: 6, height: 6, borderRadius: "50%",
                background: isPageActive ? "#6366f1" : "#d1d5db",
                flexShrink: 0,
                boxShadow: isPageActive ? "0 0 6px #6366f1" : "none",
                transition: "all .15s",
              }} />
              Page
            </button>
          )}
          {cards.map((card, i) => {
            const isActive = !isPageActive && i === safeActive;
            const color = TAB_COLORS[i % TAB_COLORS.length];
            const name = getCardName(card, i);
            return (
              <button
                key={i}
                onClick={() => setActiveCard(i)}
                style={{
                  padding: "7px 12px",
                  borderRadius: 10,
                  border: isActive ? `1px solid ${color}35` : "1px solid rgba(148,163,184,0.15)",
                  borderBottom: isActive
                    ? `2px solid ${color}`
                    : "2px solid transparent",
                  cursor: "pointer",
                  fontSize: 10,
                  fontWeight: isActive ? 800 : 500,
                  fontFamily: "inherit",
                  background: isActive ? "#fff" : "rgba(255,255,255,0.55)",
                  color: isActive ? color : "#9ca3af",
                  transition: "all .15s",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  boxShadow: isActive
                    ? "0 10px 24px rgba(15,23,42,0.08)"
                    : "0 2px 8px rgba(15,23,42,0.04)",
                  whiteSpace: "nowrap",
                }}
              >
                <div style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: isActive ? color : "#d1d5db",
                  flexShrink: 0,
                  boxShadow: isActive ? `0 0 6px ${color}` : "none",
                  transition: "all .15s",
                }} />
                {name.slice(0, 14)}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Active card header ─────────────────────────────────────── */}
      <div style={{
        padding: "10px 14px",
        background: `linear-gradient(90deg, ${activeColor}12, rgba(255,255,255,0.9))`,
        borderBottom: `1px solid ${activeColor}22`,
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexShrink: 0,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: activeColor,
          boxShadow: `0 0 8px ${activeColor}`,
        }} />
        <span style={{
          fontSize: 11, fontWeight: 700, color: activeColor,
        }}>
          Editing: {activeCardName}
        </span>
        <span style={{
          fontSize: 9, color: "#9ca3af", marginLeft: "auto",
          background: "rgba(0,0,0,0.04)", padding: "2px 7px",
          borderRadius: 99, border: "1px solid rgba(0,0,0,0.06)",
        }}>
          {isPageActive ? 1 : safeActive + (hasPageTab ? 2 : 1)} / {hasPageTab ? cards.length + 1 : cards.length}
        </span>
      </div>

      {/* ── Card editor body ───────────────────────────────────────── */}
      {isPageActive ? (
        <FlatNodeEditor nodes={headerNodes} onUpdate={handleUpdate} />
      ) : (
        <CardEditor
          card={cards[safeActive]}
          cardPath={activeCardPath}
          allCards={cards}
          onUpdate={handleUpdate}
          onAddToCard={handleAddToCard}
        />
      )}
    </div>
  );
}

function getCardName(card, index) {
  const texts = [];
  function collectTexts(node) {
    if (!node) return;
    if (node.type === "text" && node.value) texts.push(node.value);
    if (node.type === "badge" && node.text) texts.push(node.text);
    (node.children || []).forEach(collectTexts);
  }
  collectTexts(card);
  const name = texts.find(t => t.length < 30);
  return name ? name.slice(0, 14) : `Card ${index + 1}`;
}

function CardEditor({ card, cardPath, allCards, onUpdate, onAddToCard }) {
  const [openSections, setOpenSections] = useState({
    "Identity": true, "Pricing": true, "Features": true,
    "Actions": true, "Media": true, "Layout": false
  });

  const toggleSection = name => setOpenSections(p => ({ ...p, [name]: !p[name] }));

  const unionNodes = buildUnionNodes(card, cardPath, allCards);

  const SECTIONS = {
    "Identity": ["text", "badge"],
    "Pricing": ["price-block"],
    "Features": ["feature-list"],
    "Actions": ["button"],
    "Media": ["photo-card", "image"],
    "Layout": ["column", "row"],
  };

  const grouped = {};
  unionNodes.forEach(item => {
    if (item.missing && item.node?.type === "text") return;
    for (const [section, types] of Object.entries(SECTIONS)) {
      if (types.includes(item.node?.type)) {
        if (!grouped[section]) grouped[section] = [];
        grouped[section].push(item);
        break;
      }
    }
  });

  const INP2 = { width: "100%", padding: "7px 10px", border: "1.5px solid #e5e7eb", borderRadius: 6, fontSize: 12, color: "#1f2937", background: "#fafafa", boxSizing: "border-box", fontFamily: "inherit", outline: "none" };
  const LBL = { fontSize: 9, fontWeight: 700, color: "#6b7280", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4, display: "block" };

  return (
    <div style={{ padding: 14, background: "linear-gradient(180deg,#fcfcff 0%,#f8fafc 100%)" }}>
      {Object.entries(grouped).map(([sectionName, items]) => {
        if (!items?.length) return null;
        const isOpen = openSections[sectionName];
        const meta = SECTION_META[sectionName] || { icon: "..", tone: "#6366f1" };
        return (
          <div key={sectionName} style={{ marginBottom: 12 }}>
            <button onClick={() => toggleSection(sectionName)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: isOpen ? "#ffffff" : "rgba(255,255,255,0.78)", border: `1px solid ${isOpen ? `${meta.tone}28` : "rgba(148,163,184,0.18)"}`, borderRadius: 12, padding: "10px 12px", cursor: "pointer", marginBottom: isOpen ? 8 : 0, fontFamily: "inherit", boxShadow: isOpen ? "0 12px 24px rgba(15,23,42,0.06)" : "0 2px 8px rgba(15,23,42,0.03)", transition: "all .16s ease" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                <span style={{ width: 22, height: 22, borderRadius: 999, background: `${meta.tone}16`, color: meta.tone, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
                  {meta.icon}
                </span>
                <span style={{ fontSize: 9, fontWeight: 800, color: "#334155", letterSpacing: 1.5, textTransform: "uppercase" }}>
                  {sectionName}
                </span>
                <span style={{ color: meta.tone, fontSize: 9, fontWeight: 700, background: `${meta.tone}12`, padding: "2px 7px", borderRadius: 999 }}>
                  {items.length}
                </span>
              </span>
              <span style={{ color: "#9ca3af", fontSize: 10 }}>{isOpen ? "▲" : "▼"}</span>
            </button>

            {isOpen && items.map((item, i) => (
              <div key={i} style={{ marginBottom: 8, padding: "12px 12px 11px", background: "#fff", borderRadius: 12, border: item.missing ? `1px dashed ${meta.tone}45` : "1px solid rgba(226,232,240,0.95)", boxShadow: "0 10px 24px rgba(15,23,42,0.04)" }}>
                {item.missing && (
                  <div style={{ fontSize: 9, color: meta.tone, marginBottom: 8, display: "flex", alignItems: "center", gap: 6, background: `${meta.tone}0f`, border: `1px dashed ${meta.tone}30`, borderRadius: 8, padding: "6px 8px" }}>
                    <span>◌</span> Not set on this card
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#64748b", fontFamily: "monospace" }}>
                    {getNodeLabel(item.node || item.placeholder, i)}
                  </div>
                  <div style={{ fontSize: 8, color: meta.tone, background: `${meta.tone}10`, borderRadius: 999, padding: "2px 6px", textTransform: "uppercase", letterSpacing: 1 }}>
                    {item.node?.type || "node"}
                  </div>
                </div>
                <UnionNodeEditor
                  item={item}
                  onUpdate={onUpdate}
                  INP2={INP2}
                  LBL={LBL}
                  cardPath={cardPath}
                  onAddToCard={onAddToCard}
                />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ─── DEV: JSON TEST INTERFACE ─────────────────────────────────────────────
// Remove before production. Paste any template JSON to preview it.

function JsonTestModal({ onClose, onOpen }) {
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");

  const tryParse = () => {
    try {
      const parsed = JSON.parse(raw.trim());
      const doc = normalizeTemplateDoc(parsed);
      if (!doc) { setError("Template JSON must be an object."); return; }
      if (!doc.layout) { setError("Missing 'layout' field in template/config_json."); return; }
      setError("");
      onOpen(doc);
    } catch (e) {
      setError("Invalid JSON: " + e.message);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: 600, maxHeight: "85vh", display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 24px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#1e1b4b" }}>Test JSON</div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>Paste template JSON in either legacy format or the new `config_json` format</div>
          </div>
          <button onClick={onClose} style={{ background: "#f3f4f6", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, color: "#6b7280", fontFamily: "inherit" }}>✕ Close</button>
        </div>

        <textarea
          value={raw}
          onChange={e => { setRaw(e.target.value); setError(""); }}
          placeholder='Paste your template JSON here...'
          style={{ flex: 1, minHeight: 300, fontFamily: "monospace", fontSize: 11, padding: 12, border: "1.5px solid #e5e7eb", borderRadius: 8, resize: "vertical", outline: "none", lineHeight: 1.6, color: "#374151" }}
        />

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#dc2626" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setRaw("")} style={{ background: "#f3f4f6", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 12, color: "#6b7280", fontFamily: "inherit" }}>Clear</button>
          <button onClick={tryParse} style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", borderRadius: 8, padding: "8px 20px", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "inherit" }}>Preview →</button>
        </div>
      </div>
    </div>
  );
}
// ─── END DEV BLOCK ────────────────────────────────────────────────────────

function getAtPath(obj, path) {
  let cur = obj;
  for (const key of path) {
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return cur;
}

function getSlotKey(nodeType, path, cardPath) {
  return `${nodeType}:${path.slice(cardPath.length).join(".")}`;
}

function getParentSlotKey(path, cardPath) {
  return path.slice(cardPath.length, -2).join(".");
}

const SINGLE_INSTANCE_EDITOR_TYPES = new Set([
  "badge",
  "price-block",
  "button",
  "feature-list",
  "photo-card",
  "image",
  "stars",
]);

const REPEATABLE_EDITOR_TYPES = new Set([
  "text",
]);

function buildUnionNodes(card, cardPath, allCards) {
  const thisNodes = findEditableNodes(card, cardPath);
  const cardBasePath = cardPath.slice(0, -1);

  // Occupied slots: by structural path or by stamped slot identity.
  const occupiedKeys = new Set();
  const presentTypes = new Set();
  const repeatableCounts = new Map();
  const occupiedRepeatableKeys = new Set();
  for (const { node, path } of thisNodes) {
    occupiedKeys.add(getSlotKey(node.type, path, cardPath));
    if (node._slotKey) occupiedKeys.add(node._slotKey);
    presentTypes.add(node.type);
    if (REPEATABLE_EDITOR_TYPES.has(node.type)) {
      const parentKey = getParentSlotKey(path, cardPath);
      const repeatableBaseKey = `${node.type}:${parentKey}`;
      const repeatableIndex = repeatableCounts.get(repeatableBaseKey) ?? 0;
      occupiedRepeatableKeys.add(`${repeatableBaseKey}:${repeatableIndex}`);
      repeatableCounts.set(repeatableBaseKey, repeatableIndex + 1);
    }
  }

  const missingNodes = [];
  const seenSlotKeys = new Set();
  const seenRepeatableKeys = new Set();
  allCards.forEach((otherCard, ci) => {
    const otherCardPath = [...cardBasePath, ci];
    if (otherCardPath.join(".") === cardPath.join(".")) return;
    const otherNodes = findEditableNodes(otherCard, otherCardPath);
    const otherRepeatableCounts = new Map();
    otherNodes.forEach((otherNode) => {
      if (REPEATABLE_EDITOR_TYPES.has(otherNode.node.type)) {
        const parentKey = getParentSlotKey(otherNode.path, otherCardPath);
        const repeatableBaseKey = `${otherNode.node.type}:${parentKey}`;
        const repeatableIndex = otherRepeatableCounts.get(repeatableBaseKey) ?? 0;
        const repeatableKey = `${repeatableBaseKey}:${repeatableIndex}`;
        otherRepeatableCounts.set(repeatableBaseKey, repeatableIndex + 1);

        if (occupiedRepeatableKeys.has(repeatableKey)) return;
        if (seenRepeatableKeys.has(repeatableKey)) return;
        seenRepeatableKeys.add(repeatableKey);
        return;
      }

      if (
        SINGLE_INSTANCE_EDITOR_TYPES.has(otherNode.node.type) &&
        presentTypes.has(otherNode.node.type)
      ) {
        return;
      }

      const slotKey = getSlotKey(
        otherNode.node.type,
        otherNode.path,
        otherCardPath
      );

      if (occupiedKeys.has(slotKey)) return;
      if (seenSlotKeys.has(slotKey)) return;
      seenSlotKeys.add(slotKey);

      const childIndex = otherNode.path[otherNode.path.length - 1];
      missingNodes.push({
        ...otherNode,
        node: createEmptyNodeClone(otherNode.node),
        missing: true,
        slotKey,
        sourcePath: otherNode.path,
        sourceCardPath: otherCardPath,
        sourceChildIndex: typeof childIndex === "number" ? childIndex : undefined,
      });
    });
  });

  return [
    ...thisNodes.map(n => ({ ...n, missing: false })),
    ...missingNodes,
  ];
}

function MissingNodeEditor({ item, cardPath, onAddToCard }) {
  const { node, sourcePath, sourceCardPath, sourceChildIndex, slotKey } = item;
  const [draft, setDraft] = useState({});
  const wrapperRef = useRef(null);

  useEffect(() => {
    setDraft({});
  }, [slotKey]);

  const sourceParentPath = sourceCardPath
    ? sourcePath.slice(sourceCardPath.length, -2)
    : sourcePath.slice(0, -2);

  const commitDraft = () => {
    if (!Object.keys(draft).length) return;
    onAddToCard(
      { ...node, ...draft, _slotKey: slotKey },
      sourceCardPath,
      sourceParentPath,
      cardPath,
      sourceChildIndex
    );
    setDraft({});
  };

  return (
    <div
      ref={wrapperRef}
      onBlurCapture={(e) => {
        const nextFocused = e.relatedTarget;
        if (nextFocused && wrapperRef.current?.contains(nextFocused)) return;
        commitDraft();
      }}
    >
      <div style={{
        fontSize: 9, color: "#6366f1", marginBottom: 6,
        display: "flex", alignItems: "center", gap: 4,
        background: "rgba(99,102,241,0.06)",
        border: "1px dashed rgba(99,102,241,0.25)",
        borderRadius: 4, padding: "4px 8px",
      }}>
        <span>+</span> Edit below to add to this card
      </div>
      <NodeEditor
        node={{ ...node, ...draft }}
        path={sourcePath}
        onUpdate={(_, field, value) => {
          setDraft(prev => ({ ...prev, [field]: value }));
        }}
      />
    </div>
  );
}

function UnionNodeEditor({ item, onUpdate, INP2, LBL, cardPath, onAddToCard }) {
  const { node, path, missing } = item;

  if (missing) {
    return <MissingNodeEditor item={item} cardPath={cardPath} onAddToCard={onAddToCard} />;
    // Parent path relative to the source card root
    const sourceParentPath = sourceCardPath
      ? sourcePath.slice(sourceCardPath.length, -2)
      : sourcePath.slice(0, -2);
    return (
      <div>
        <div style={{
          fontSize: 9, color: "#6366f1", marginBottom: 6,
          display: "flex", alignItems: "center", gap: 4,
          background: "rgba(99,102,241,0.06)",
          border: "1px dashed rgba(99,102,241,0.25)",
          borderRadius: 4, padding: "4px 8px",
        }}>
          <span>＋</span> Edit below to add to this card
        </div>
        <NodeEditor
          node={node}
          path={sourcePath}
          onUpdate={(_, field, value) => {
            // Clone node from source card with this one field changed,
            // then insert it into the target card
            onAddToCard(
              { ...node, [field]: value, _slotKey: slotKey },
              sourceCardPath,
              sourceParentPath,
              cardPath,
              sourceChildIndex
            );
          }}
        />
      </div>
    );
  }

  return <NodeEditor node={node} path={path} onUpdate={onUpdate} />;
}

function FlatNodeEditor({ nodes, onUpdate }) {
  const [openGroups, setOpenGroups] = useState({
    "Content": true, "Pricing": true, "Actions": true,
    "Features": true, "Media": false, "Layout": false
  });
  const toggleGroup = name => setOpenGroups(p => ({ ...p, [name]: !p[name] }));

  const GROUP_TYPES = {
    "Content": ["text", "badge"],
    "Pricing": ["price-block"],
    "Actions": ["button"],
    "Features": ["feature-list"],
    "Media": ["photo-card", "image"],
    "Layout": ["column", "row"],
  };

  const grouped = {};
  nodes.forEach(({ node, path }) => {
    for (const [g, types] of Object.entries(GROUP_TYPES)) {
      if (types.includes(node.type)) {
        if (!grouped[g]) grouped[g] = [];
        grouped[g].push({ node, path });
        break;
      }
    }
  });

  return (
    <div style={{ padding: 14, background: "linear-gradient(180deg,#fcfcff 0%,#f8fafc 100%)" }}>
      {Object.entries(grouped).map(([groupName, items]) => {
        if (!items?.length) return null;
        const isOpen = openGroups[groupName];
        const meta = SECTION_META[groupName] || { icon: "..", tone: "#6366f1" };
        return (
          <div key={groupName} style={{ marginBottom: 12 }}>
            <button onClick={() => toggleGroup(groupName)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: isOpen ? "#ffffff" : "rgba(255,255,255,0.78)", border: `1px solid ${isOpen ? `${meta.tone}28` : "rgba(148,163,184,0.18)"}`, borderRadius: 12, padding: "10px 12px", cursor: "pointer", marginBottom: isOpen ? 8 : 0, fontFamily: "inherit", boxShadow: isOpen ? "0 12px 24px rgba(15,23,42,0.06)" : "0 2px 8px rgba(15,23,42,0.03)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ width: 22, height: 22, borderRadius: 999, background: `${meta.tone}16`, color: meta.tone, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800 }}>
                  {meta.icon}
                </span>
                <span style={{ fontSize: 9, fontWeight: 800, color: "#334155", letterSpacing: 1.5, textTransform: "uppercase" }}>
                  {groupName}
                </span>
                <span style={{ color: meta.tone, fontSize: 9, fontWeight: 700, background: `${meta.tone}12`, padding: "2px 7px", borderRadius: 999 }}>
                  {items.length}
                </span>
              </span>
              <span style={{ color: "#9ca3af", fontSize: 10 }}>{isOpen ? "▲" : "▼"}</span>
            </button>
            {isOpen && items.map(({ node, path }, i) => (
              <div key={i} style={{ marginBottom: 8, padding: "12px 12px 11px", background: "#fff", borderRadius: 12, border: "1px solid rgba(226,232,240,0.95)", boxShadow: "0 10px 24px rgba(15,23,42,0.04)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#64748b", fontFamily: "monospace" }}>
                    {getNodeLabel(node, i)}
                  </div>
                  <div style={{ fontSize: 8, color: meta.tone, background: `${meta.tone}10`, borderRadius: 999, padding: "2px 6px", textTransform: "uppercase", letterSpacing: 1 }}>
                    {node.type}
                  </div>
                </div>
                <NodeEditor node={node} path={path} onUpdate={onUpdate} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
function EditorSidebar({ doc, onUpdatePlan, onUpdateTree, selIdx, setSel }) {
  const isGeneralized = typeof doc?.layout === "object" && doc.layout !== null;
  const plan = doc.plans?.[selIdx] ?? null;
  const [featText, setFeatText] = useState(plan?.features?.join("\n") ?? "");
  const [disText, setDisText] = useState(plan?.disabledFeatures?.join("\n") ?? "");

  const swap = i => {
    if (!doc.plans?.[i]) return;
    setSel(i);
    setFeatText(doc.plans[i].features.join("\n"));
    setDisText(doc.plans[i].disabledFeatures?.join("\n") ?? "");
  };

  return (
    <aside style={{ width: 288, flexShrink: 0, background: "linear-gradient(180deg,#ffffff 0%,#f8fafc 100%)", borderRight: "1px solid rgba(226,232,240,0.9)", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "2px 0 24px rgba(15,23,42,0.04)" }}>

      {/* Header */}
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid rgba(226,232,240,0.9)", background: "linear-gradient(180deg,#ffffff 0%,#fafbff 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 999, background: isGeneralized ? "rgba(99,102,241,0.12)" : "rgba(16,185,129,0.12)", color: isGeneralized ? "#6366f1" : "#059669", fontSize: 10, fontWeight: 800 }}>
            {isGeneralized ? "B" : "A"}
          </span>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", letterSpacing: 1.5, textTransform: "uppercase" }}>
              {isGeneralized ? "Mode B" : "Mode A"}
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#1e293b", marginTop: 2 }}>
              {isGeneralized ? "Layout Editor" : "Plan Editor"}
            </div>
          </div>
        </div>
        {!isGeneralized && doc.plans?.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {doc.plans.map((p, i) => (
              <button key={p.id} onClick={() => swap(i)} style={{ padding: "6px 11px", borderRadius: 10, border: i === selIdx ? `1px solid ${p.color}40` : "1px solid rgba(226,232,240,0.9)", cursor: "pointer", fontSize: 10, fontWeight: 700, background: i === selIdx ? p.color : "rgba(255,255,255,0.72)", color: i === selIdx ? "#fff" : "#374151", boxShadow: i === selIdx ? "0 10px 18px rgba(15,23,42,0.08)" : "none", fontFamily: "inherit" }}>{p.name}</button>
            ))}
          </div>
        )}
        {isGeneralized && (
          <div style={{ fontSize: 10, color: "#64748b", lineHeight: 1.55, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.12)", borderRadius: 10, padding: "8px 10px" }}>
            Page content stays at the top. Card-specific content appears below in colored tabs.
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", background: "linear-gradient(180deg,#fcfcff 0%,#f8fafc 100%)" }}>

        {/* MODE B - Universal tree editor */}
        {isGeneralized && (
          <UniversalTreeEditor doc={doc} onUpdateTree={onUpdateTree} />
        )}

        {/* MODE A - existing plan editor */}
        {!isGeneralized && (
          <div style={{ padding: 14 }}>
            {plan ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, background: "#ffffff", border: "1px solid rgba(226,232,240,0.92)", borderRadius: 14, padding: 14, boxShadow: "0 12px 24px rgba(15,23,42,0.04)" }}>
                {[
                  ["Name", "name"],
                  ["Description", "description"],
                  ["Badge", "badge"],
                  ["Button Text", "buttonText"],
                  ["Emoji", "emoji"],
                  ...(doc.theme?.cardStyle === "image-bg" || doc.layout === "tall-portrait"
                    ? [["Image URL", "bgImage"]]
                    : []),
                ].map(([l, f]) => (
                  <div key={f}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{l}</div>
                    <input style={INP} value={plan[f] || ""} onChange={e => onUpdatePlan(selIdx, f, e.target.value || null)} />
                  </div>
                ))}

                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Price</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <input style={{ ...INP, width: 36 }} value={plan.currency} onChange={e => onUpdatePlan(selIdx, "currency", e.target.value)} />
                    <input style={{ ...INP, flex: 1 }} value={plan.price} onChange={e => onUpdatePlan(selIdx, "price", e.target.value)} />
                    <input style={{ ...INP, width: 36 }} value={plan.period} onChange={e => onUpdatePlan(selIdx, "period", e.target.value)} />
                  </div>
                  <div style={{ fontSize: 9, color: "#9ca3af", marginTop: 2 }}>symbol - amount - period</div>
                </div>

                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Accent Color</div>
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <input type="color" value={plan.color} onChange={e => onUpdatePlan(selIdx, "color", e.target.value)} style={{ width: 34, height: 30, borderRadius: 5, border: "1.5px solid #e5e7eb", padding: 2, cursor: "pointer" }} />
                    <input style={{ ...INP, flex: 1 }} value={plan.color} onChange={e => onUpdatePlan(selIdx, "color", e.target.value)} />
                  </div>
                  <div style={{ display: "flex", gap: 3, marginTop: 6, flexWrap: "wrap" }}>
                    {PRESET_COLORS.map(c => (
                      <button key={c} onClick={() => onUpdatePlan(selIdx, "color", c)} style={{ width: 18, height: 18, borderRadius: 4, background: c, border: plan.color === c ? "2px solid #6366f1" : "1.5px solid #e5e7eb", cursor: "pointer" }} />
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Rating (0�5)</div>
                  <input style={INP} type="number" min="0" max="5" step="0.1" value={plan.rating || 0} onChange={e => onUpdatePlan(selIdx, "rating", parseFloat(e.target.value) || 0)} />
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
                  <input type="checkbox" checked={plan.highlighted || false} onChange={e => onUpdatePlan(selIdx, "highlighted", e.target.checked)} style={{ accentColor: plan.color, width: 14, height: 14 }} />
                  <span style={{ fontSize: 11, color: "#374151", fontWeight: 500 }}>Featured / Highlighted card</span>
                </label>

                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
                    Features <span style={{ fontWeight: 400, textTransform: "none" }}>(one per line)</span>
                  </div>
                  <textarea style={{ ...INP, height: 120, resize: "vertical", lineHeight: 1.7 }}
                    value={featText}
                    onChange={e => { setFeatText(e.target.value); onUpdatePlan(selIdx, "features", e.target.value.split("\n").filter(Boolean)); }} />
                </div>

                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
                    Disabled Features <span style={{ fontWeight: 400, textTransform: "none" }}>(grayed out / crossed)</span>
                  </div>
                  <textarea style={{ ...INP, height: 72, resize: "vertical", lineHeight: 1.7 }}
                    value={disText}
                    onChange={e => { setDisText(e.target.value); onUpdatePlan(selIdx, "disabledFeatures", e.target.value.split("\n").filter(Boolean)); }} />
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "#9ca3af", background: "#ffffff", border: "1px solid rgba(226,232,240,0.92)", borderRadius: 14, margin: 14, boxShadow: "0 12px 24px rgba(15,23,42,0.04)" }}>
                <div style={{ fontSize: 11 }}>No plan selected.</div>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// SECTION 7 — MAIN APP (Gallery + Editor)
// ───────────────────────────────────────────────────────────────────────────

export default function PricingWidgetEngine() {
  const [view, setView] = useState("gallery");
  const [activeDoc, setActiveDoc] = useState(null);
  const [editDoc, setEditDoc] = useState(null);
  const [selIdx, setSelIdx] = useState(0);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("All");
  const [showJsonTest, setShowJsonTest] = useState(false);
  const [backendTemplates, setBackendTemplates] = useState([]);
  const [backendLoading, setBackendLoading] = useState(false);
  const [backendError, setBackendError] = useState("");
  const [userWidgets, setUserWidgets] = useState([]);
  const [userWidgetsLoading, setUserWidgetsLoading] = useState(false);
  const [userWidgetsError, setUserWidgetsError] = useState("");
  const [activeUserWidgetId, setActiveUserWidgetId] = useState(null);
  const [activeTemplateId, setActiveTemplateId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const editorRootRef = useRef(null);
  const editorScrollRef = useRef(null);
  const sidebarScrollRef = useRef(null);

  const openEditor = (doc, userWidgetId = null, templateId = null) => {
    const normalizedDoc = normalizeTemplateDoc(doc);
    if (!normalizedDoc) return;
    const clone = normalizeDocAssetUrls(JSON.parse(JSON.stringify(normalizedDoc)));
    setActiveDoc(clone);
    setEditDoc(clone);
    setSelIdx(0);
    setActiveUserWidgetId(userWidgetId);
    setActiveTemplateId(templateId);
    setSaveStatus(null);
    setView("editor");
  };

  const updatePlan = useCallback((pi, field, val) => {
    setEditDoc(prev => {
      const next = { ...prev, plans: [...prev.plans] };
      next.plans[pi] = { ...next.plans[pi], [field]: val };
      return next;
    });
  }, []);

  const updateTree = useCallback((newLayout) => {
    setEditDoc(prev => ({ ...prev, layout: newLayout }));
  }, []);

  useEffect(() => {
    let alive = true;
    setBackendLoading(true);
    setBackendError("");
    getWidgetTemplates()
      .then((data) => {
        if (!alive) return;
        setBackendTemplates(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!alive) return;
        setBackendError(err?.message || "Failed to load templates.");
      })
      .finally(() => {
        if (!alive) return;
        setBackendLoading(false);
      });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    setUserWidgetsLoading(true);
    getUserWidgets()
      .then(data => { if (alive) setUserWidgets(Array.isArray(data) ? data : []); })
      .catch(err => { if (alive) setUserWidgetsError(err?.message || "Failed to load"); })
      .finally(() => { if (alive) setUserWidgetsLoading(false); });
    return () => { alive = false; };
  }, []);

  const refreshUserWidgets = async () => {
    try {
      setUserWidgetsLoading(true);
      const data = await getUserWidgets();
      setUserWidgets(Array.isArray(data) ? data : []);
    } catch {
    } finally {
      setUserWidgetsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editDoc) return;
    setSaving(true);
    setSaveStatus(null);

    try {
      if (activeUserWidgetId) {
        await updateUserWidget(activeUserWidgetId, {
          name: editDoc.name || "My Widget",
          widgetData: serializeTemplateDoc(editDoc),
        });
      } else {
        const result = await createUserWidget({
          name: editDoc.name || "My Widget",
          templateId: activeTemplateId,
          widgetData: serializeTemplateDoc(editDoc),
        });
        setActiveUserWidgetId(result.id);
      }
      setSaveStatus("saved");
      await refreshUserWidgets();
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!activeUserWidgetId) {
      await handleSave();
    }
    if (!activeUserWidgetId) return;
    setPublishing(true);
    try {
      await publishUserWidget(activeUserWidgetId);
      setSaveStatus("published");
      await refreshUserWidgets();
      setTimeout(() => setSaveStatus(null), 3000);
    } catch {
      setSaveStatus("error");
    } finally {
      setPublishing(false);
    }
  };

  useEffect(() => {
    if (view !== "editor") return;
    const reset = () => {
      if (editorRootRef.current) editorRootRef.current.scrollTop = 0;
      if (editorScrollRef.current) editorScrollRef.current.scrollTop = 0;
      if (sidebarScrollRef.current) sidebarScrollRef.current.scrollTop = 0;
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    requestAnimationFrame(() => {
      reset();
      requestAnimationFrame(reset);
    });
  }, [view]);

  useEffect(() => {
    if (view !== "editor") return;
    const resetScroll = () => {
      if (editorScrollRef.current) editorScrollRef.current.scrollTop = 0;
      if (sidebarScrollRef.current) sidebarScrollRef.current.scrollTop = 0;
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };
    requestAnimationFrame(() => {
      resetScroll();
      requestAnimationFrame(resetScroll);
    });
  }, [view]);

  const backendDocs = backendTemplates
    .map((t) => {
      const doc = normalizeTemplateDoc(t);
      if (!doc) return null;
      return {
        ...doc,
        _templateId: t.id,
        id: doc.id ?? t.id ?? t.name,
        name: t.name ?? doc.name ?? "Template",
        description: t.description ?? doc.description,
        category: doc.category ?? "Backend",
        tag: doc.tag ?? t.template_type ?? "Backend",
      };
    })
    .filter(Boolean);

  const userWidgetDocs = userWidgets
    .map((w) => {
      const doc = normalizeTemplateDoc(w);
      if (!doc) return null;
      return {
        ...doc,
        _userWidgetId: w.id,
        _templateId: w.template,
        _status: w.status,
        id: doc.id ?? w.id,
        name: w.name ?? doc.name ?? "My Widget",
        category: doc.category ?? "My Widgets",
        tag: doc.tag ?? w.status ?? "Saved",
      };
    })
    .filter(Boolean);

  const filtered = DEMO_DOCS.filter(t =>
    (cat === "All" || t.category === cat) &&
    (t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase()) ||
      t.tag?.toLowerCase().includes(search.toLowerCase()))
  );
  const backendFiltered = backendDocs.filter(t =>
    (cat === "All" || t.category === cat) &&
    (t.name?.toLowerCase?.().includes(search.toLowerCase()) ||
      t.category?.toLowerCase?.().includes(search.toLowerCase()) ||
      t.tag?.toLowerCase?.().includes(search.toLowerCase()))
  );
  const allCats = ["All", ...Array.from(new Set([
    ...DEMO_DOCS.map(t => t.category),
    ...backendDocs.map(t => t.category),
  ]))];

  const renderTemplateCard = (t) => (
    <div
      key={t.id || t.name}
      onClick={() => openEditor(t, null, t._templateId || null)}
      style={{
        background: "rgba(255,255,255,0.72)",
        borderRadius: 20,
        overflow: "hidden",
        cursor: "pointer",
        border: "1.5px solid rgba(255,255,255,0.95)",
        transition: "all .22s cubic-bezier(0.34,1.2,0.64,1)",
        boxShadow: "0 4px 20px rgba(99,102,241,0.06), inset 0 1px 0 rgba(255,255,255,0.9)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = "translateY(-6px) scale(1.01)";
        e.currentTarget.style.boxShadow = "0 24px 60px rgba(99,102,241,0.18), inset 0 1px 0 rgba(255,255,255,0.9)";
        e.currentTarget.style.borderColor = "rgba(99,102,241,0.3)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "0 4px 20px rgba(99,102,241,0.06), inset 0 1px 0 rgba(255,255,255,0.9)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.95)";
      }}
    >
      <div style={{ height: 210, position: "relative", overflow: "hidden", background: "linear-gradient(135deg, #f8f7ff, #fff5fb)" }}>
        <MiniPreview doc={t} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.3) 35%, transparent 60%)" }} />

        <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 5 }}>
          <div style={{ background: CAT_COLORS[t.category] || "#6366f1", color: "#fff", fontSize: 9, fontWeight: 700, padding: "3px 9px", borderRadius: 99, letterSpacing: 0.3, boxShadow: `0 2px 8px ${CAT_COLORS[t.category] || "#6366f1"}55`, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ display: "flex", alignItems: "center", opacity: 0.85 }}>{CAT_ICONS[t.category] || <Tag size={9} />}</span>
            {t.category}
          </div>
          {typeof t.layout === "object" && (
            <div style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)", color: "#fff", fontSize: 8, fontWeight: 600, padding: "3px 8px", borderRadius: 99, display: "flex", alignItems: "center", gap: 4 }}>
              <Atom size={9} color="#fff" />
              Atomic
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "14px 18px 18px" }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: "#1e1b4b", marginBottom: 8, letterSpacing: -0.3 }}>{t.name}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            <code style={{ color: "#8b83c4", fontSize: 9, background: "rgba(99,102,241,0.07)", padding: "2px 8px", borderRadius: 6, fontWeight: 600, border: "1px solid rgba(99,102,241,0.1)" }}>
              {typeof t.layout === "object" ? t.layout.type : t.layout}
            </code>
            <span style={{ fontSize: 9, color: "#9ca3af", background: "rgba(0,0,0,0.04)", padding: "2px 8px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.06)" }}>
              {typeof t.layout === "object" ? "∞ atoms" : `${t.plans?.length || 0} plans`}
            </span>
            <span style={{ fontSize: 9, color: "#9ca3af", background: "rgba(0,0,0,0.04)", padding: "2px 8px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.06)" }}>
              {t.tag}
            </span>
          </div>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg,rgba(99,102,241,0.12),rgba(168,85,247,0.12))", display: "flex", alignItems: "center", justifyContent: "center", color: "#6366f1", fontWeight: 800, flexShrink: 0, border: "1px solid rgba(99,102,241,0.15)" }}>
            <ArrowRight size={14} color="#6366f1" />
          </div>
        </div>
      </div>
    </div>
  );

  const renderUserWidgetCard = (t) => (
    <div key={t._userWidgetId || t.id} style={{ position: "relative" }}>
      <div style={{
        position: "absolute", top: 10, right: 10, zIndex: 10,
        background: t._status === "published"
          ? "rgba(16,185,129,0.9)"
          : t._status === "archived"
            ? "rgba(100,116,139,0.9)"
            : "rgba(245,158,11,0.9)",
        backdropFilter: "blur(8px)",
        color: "#fff", fontSize: 8, fontWeight: 700,
        padding: "2px 8px", borderRadius: 99, letterSpacing: 0.5,
      }}>
        {t._status === "published" ? "✓ Published" : t._status === "archived" ? "Archived" : "Draft"}
      </div>

      <div
        onClick={() => openEditor(t, t._userWidgetId, t._templateId || null)}
        style={{
          background: "rgba(255,255,255,0.72)",
          borderRadius: 20, overflow: "hidden", cursor: "pointer",
          border: "1.5px solid rgba(16,185,129,0.25)",
          transition: "all .22s cubic-bezier(0.34,1.2,0.64,1)",
          boxShadow: "0 4px 20px rgba(16,185,129,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
          backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = "translateY(-6px) scale(1.01)";
          e.currentTarget.style.boxShadow = "0 24px 60px rgba(16,185,129,0.18), inset 0 1px 0 rgba(255,255,255,0.9)";
          e.currentTarget.style.borderColor = "rgba(16,185,129,0.4)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = "none";
          e.currentTarget.style.boxShadow = "0 4px 20px rgba(16,185,129,0.08), inset 0 1px 0 rgba(255,255,255,0.9)";
          e.currentTarget.style.borderColor = "rgba(16,185,129,0.25)";
        }}
      >
        <div style={{ height: 190, position: "relative", overflow: "hidden", background: "linear-gradient(135deg, #f0fff8, #f0f9ff)" }}>
          <MiniPreview doc={t} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.3) 35%, transparent 60%)" }} />
        </div>

        <div style={{ padding: "12px 16px 14px" }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: "#1e1b4b", marginBottom: 6, letterSpacing: -0.3 }}>{t.name}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 5 }}>
              <code style={{ color: "#059669", fontSize: 9, background: "rgba(16,185,129,0.07)", padding: "2px 8px", borderRadius: 6, fontWeight: 600, border: "1px solid rgba(16,185,129,0.15)" }}>
                {typeof t.layout === "object" ? t.layout.type : t.layout}
              </code>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await duplicateUserWidget(t._userWidgetId);
                    await refreshUserWidgets();
                  } catch { }
                }}
                style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 6, color: "#6366f1", fontSize: 9, fontWeight: 700, padding: "3px 8px", cursor: "pointer" }}
              >⎘</button>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!confirm(`Delete "${t.name}"?`)) return;
                  try {
                    await deleteUserWidget(t._userWidgetId);
                    await refreshUserWidgets();
                  } catch { }
                }}
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 6, color: "#ef4444", fontSize: 9, fontWeight: 700, padding: "3px 8px", cursor: "pointer" }}
              ><X size={9} /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ── GALLERY ──────────────────────────────────────────────────────────────
  if (view === "gallery") return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, fontFamily: "'DM Sans', system-ui, sans-serif", zIndex: 50, overflow: "auto", background: "linear-gradient(135deg, #f0f4ff 0%, #faf8ff 40%, #fff5f8 70%, #f0fff4 100%)" }}>

      {/* Animated mesh blobs */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
        <div style={{ position: "absolute", width: 700, height: 700, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)", top: -200, left: -150, animation: "blobFloat1 12s ease-in-out infinite" }} />
        <div style={{ position: "absolute", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(236,72,153,0.08) 0%, transparent 70%)", top: 100, right: -100, animation: "blobFloat2 15s ease-in-out infinite" }} />
        <div style={{ position: "absolute", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(16,185,129,0.07) 0%, transparent 70%)", bottom: -100, left: "30%", animation: "blobFloat3 18s ease-in-out infinite" }} />
        <div style={{ position: "absolute", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(245,158,11,0.07) 0%, transparent 70%)", bottom: 200, right: "20%", animation: "blobFloat1 14s ease-in-out infinite reverse" }} />
      </div>

      <style>{`
      @keyframes blobFloat1 { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(30px,-20px) scale(1.04); } 66% { transform: translate(-20px,30px) scale(0.97); } }
      @keyframes blobFloat2 { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(-25px,20px) scale(1.03); } 66% { transform: translate(20px,-25px) scale(0.98); } }
      @keyframes blobFloat3 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(15px,-30px) scale(1.05); } }
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
    `}</style>

      {/* Sticky Header */}
      <div style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderBottom: "1px solid rgba(255,255,255,0.9)", padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, height: 62, boxShadow: "0 1px 24px rgba(99,102,241,0.07)" }}>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,#6366f1,#a855f7,#ec4899)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(99,102,241,0.4)" }}>
            <Hexagon size={16} color="#fff" fill="rgba(255,255,255,0.3)" />
          </div>
          <div>
            <div style={{ color: "#1e1b4b", fontWeight: 800, fontSize: 15, letterSpacing: -0.4 }}>PricingEngine</div>
            <div style={{ color: "#a09ec9", fontSize: 9, letterSpacing: 0.5, textTransform: "uppercase" }}>Template Studio</div>
          </div>
        </div>

        {/* Right controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center" }}>
              <Search size={13} color="#a09ec9" />
            </span>
            <input
              style={{ background: "rgba(255,255,255,0.85)", border: "1.5px solid rgba(99,102,241,0.15)", borderRadius: 12, padding: "8px 16px 8px 34px", color: "#1e1b4b", fontSize: 12, width: 240, outline: "none", boxSizing: "border-box", fontFamily: "inherit", backdropFilter: "blur(8px)", boxShadow: "0 2px 12px rgba(99,102,241,0.08)" }}
              placeholder="Search templates..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.85)", border: "1.5px solid rgba(16,185,129,0.25)", borderRadius: 10, padding: "6px 14px", backdropFilter: "blur(8px)", boxShadow: "0 2px 8px rgba(16,185,129,0.1)" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 10px #10b981" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "#065f46" }}>{DEMO_DOCS.length} templates live</span>
          </div>
          <button
            onClick={() => setShowJsonTest(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(245,158,11,0.1)", border: "1.5px solid rgba(245,158,11,0.3)", borderRadius: 10, color: "#d97706", fontSize: 11, fontWeight: 700, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit" }}
          >
            🧪 Test JSON
          </button>
        </div>
      </div>

      <div style={{ position: "relative", zIndex: 1 }}>

        {/* Hero */}
        <div style={{ padding: "72px 32px 52px", maxWidth: 780, margin: "0 auto", textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.85)", border: "1.5px solid rgba(99,102,241,0.2)", borderRadius: 99, padding: "6px 18px", marginBottom: 28, backdropFilter: "blur(12px)", boxShadow: "0 4px 16px rgba(99,102,241,0.1)" }}>
            <Sparkles size={13} color="#6366f1" />
            <span style={{ color: "#6366f1", fontSize: 11, fontWeight: 600, letterSpacing: 0.3 }}>Professional pricing widgets — zero code required</span>
          </div>

          <h1 style={{ fontSize: 56, fontWeight: 900, color: "#1e1b4b", margin: "0 0 18px", letterSpacing: -2.5, lineHeight: 1.05 }}>
            Pick a template.<br />
            <span style={{ background: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Make it yours.</span>
          </h1>

          <p style={{ color: "#6b7280", fontSize: 15, lineHeight: 1.8, margin: "0 auto 44px", maxWidth: 500 }}>
            Browse {DEMO_DOCS.length} beautifully crafted templates. Click any to open the live editor — change colors, text, pricing, then export.
          </p>

          {/* Stats row */}
          <div style={{ display: "inline-flex", background: "rgba(255,255,255,0.8)", border: "1.5px solid rgba(255,255,255,0.95)", borderRadius: 20, overflow: "hidden", backdropFilter: "blur(20px)", boxShadow: "0 8px 32px rgba(99,102,241,0.1), inset 0 1px 0 rgba(255,255,255,0.9)" }}>
            {[
              [<Palette size={20} color="#6366f1" />, DEMO_DOCS.filter(t => typeof t.layout === "string").length + "", "Legacy"],
              [<Atom size={20} color="#a855f7" />, DEMO_DOCS.filter(t => typeof t.layout === "object").length + "", "Atomic"],
              [<LayoutTemplate size={20} color="#ec4899" />, "7", "Layouts"],
              [<Tag size={20} color="#f59e0b" />, Array.from(new Set(DEMO_DOCS.map(t => t.category))).length + "", "Categories"],
            ].map(([icon, num, label], i) => (
              <div key={i} style={{ padding: "18px 32px", borderRight: i < 3 ? "1px solid rgba(99,102,241,0.08)" : "none", textAlign: "center" }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>{icon}</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: "#1e1b4b", letterSpacing: -1 }}>{num}</div>
                <div style={{ fontSize: 10, color: "#a09ec9", fontWeight: 600, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Category Filter */}
        <div style={{ maxWidth: 1360, margin: "0 auto", padding: "0 32px 36px", display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
          {allCats.map(c => {
            const count = c === "All"
              ? (DEMO_DOCS.length + backendDocs.length)
              : (DEMO_DOCS.filter(t => t.category === c).length + backendDocs.filter(t => t.category === c).length);
            const isActive = cat === c;
            return (
              <button key={c} onClick={() => setCat(c)} style={{
                padding: "7px 14px", borderRadius: 99, cursor: "pointer", fontSize: 11, fontWeight: 600,
                border: `1.5px solid ${isActive ? "transparent" : "rgba(99,102,241,0.12)"}`,
                background: isActive ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "rgba(255,255,255,0.75)",
                color: isActive ? "#fff" : "#6b7280",
                backdropFilter: "blur(12px)",
                boxShadow: isActive ? "0 4px 16px rgba(99,102,241,0.35)" : "0 2px 8px rgba(0,0,0,0.04)",
                transition: "all .18s",
                display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit",
              }}>
                <span style={{ display: "flex", alignItems: "center", opacity: isActive ? 1 : 0.7 }}>
                  {CAT_ICONS[c] || <Tag size={11} />}
                </span>
                {c}
                <span style={{ background: isActive ? "rgba(255,255,255,0.25)" : "rgba(99,102,241,0.08)", color: isActive ? "#fff" : "#9ca3af", fontSize: 9, padding: "1px 6px", borderRadius: 99, fontWeight: 700 }}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Template Grid */}
        <div style={{ padding: "0 32px 100px", maxWidth: 1360, margin: "0 auto" }}>

          {/* ── MY WIDGETS ── */}
          <div style={{ marginBottom: 40 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#1e1b4b" }}>✦ My Widgets</span>
                <span style={{ background: "rgba(16,185,129,0.1)", color: "#059669", fontSize: 10, padding: "3px 10px", borderRadius: 99, fontWeight: 600 }}>
                  {userWidgetDocs.length}
                </span>
                {userWidgetsLoading && <span style={{ fontSize: 10, color: "#94a3b8" }}>Loading...</span>}
              </div>
              <button
                onClick={refreshUserWidgets}
                disabled={userWidgetsLoading}
                style={{
                  fontSize: 10,
                  color: "#6366f1",
                  background: "rgba(99,102,241,0.07)",
                  border: "1px solid rgba(99,102,241,0.15)",
                  borderRadius: 8,
                  padding: "4px 12px",
                  cursor: userWidgetsLoading ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  opacity: userWidgetsLoading ? 0.6 : 1,
                }}
              >
                {userWidgetsLoading ? "Refreshing..." : "↻ Refresh"}
              </button>
            </div>

            {userWidgetDocs.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
                {userWidgetDocs.map(renderUserWidgetCard)}
              </div>
            ) : (
              !userWidgetsLoading && (
                <div style={{ background: "rgba(255,255,255,0.6)", border: "1.5px dashed rgba(99,102,241,0.2)", borderRadius: 16, padding: "32px 20px", textAlign: "center", backdropFilter: "blur(8px)" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>No saved widgets yet</div>
                  <div style={{ fontSize: 11, color: "#a09ec9" }}>Pick a template below, customize it, then save it here</div>
                </div>
              )
            )}
          </div>

          {/* ── DIVIDER ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
            <div style={{ flex: 1, height: 1, background: "rgba(99,102,241,0.1)" }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: "#a09ec9", letterSpacing: 1.5, textTransform: "uppercase" }}>Template Library</span>
            <div style={{ flex: 1, height: 1, background: "rgba(99,102,241,0.1)" }} />
          </div>

          {/* ── GALLERY TEMPLATES (from backend) ── */}
          {backendFiltered.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#1e1b4b" }}>All Templates</span>
                <span style={{ background: "rgba(99,102,241,0.08)", color: "#6366f1", fontSize: 10, padding: "3px 10px", borderRadius: 99 }}>{backendFiltered.length}</span>
                {backendLoading && <span style={{ fontSize: 10, color: "#94a3b8" }}>Loading...</span>}
                {backendError && <span style={{ fontSize: 10, color: "#ef4444" }}>{backendError}</span>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 20 }}>
                {backendFiltered.map(renderTemplateCard)}
              </div>
            </div>
          )}

          {/* Toolbar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#1e1b4b" }}>Demo Templates</span>
              <span style={{ background: "rgba(99,102,241,0.08)", color: "#6366f1", fontSize: 10, padding: "3px 10px", borderRadius: 99 }}>{filtered.length}</span>
              {cat !== "All" && (
                <span style={{ background: `${CAT_COLORS[cat] || "#6366f1"}18`, color: CAT_COLORS[cat] || "#6366f1", fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 99, display: "flex", alignItems: "center", gap: 4 }}>
                  {CAT_ICONS[cat]}
                  {cat}
                </span>
              )}
              {search && (
                <span style={{ background: "rgba(99,102,241,0.08)", color: "#6366f1", fontSize: 10, padding: "3px 10px", borderRadius: 99 }}>"{search}"</span>
              )}
            </div>
            {(cat !== "All" || search) && (
              <button
                onClick={() => { setCat("All"); setSearch(""); }}
                style={{ fontSize: 11, color: "#6b7280", background: "rgba(255,255,255,0.8)", border: "1.5px solid rgba(0,0,0,0.06)", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", gap: 5 }}
              >
                Clear filters <X size={11} />
              </button>
            )}
          </div>

          {/* Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 20 }}>
            {filtered.map(renderTemplateCard)}
          </div>

          {/* Empty state */}
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "100px 20px" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                <Search size={52} color="#c4b5fd" />
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#1e1b4b", marginBottom: 8 }}>No templates found</div>
              <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 24 }}>Try a different search or category</div>
              <button
                onClick={() => { setCat("All"); setSearch(""); }}
                style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", border: "none", borderRadius: 12, padding: "10px 24px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 16px rgba(99,102,241,0.4)", display: "inline-flex", alignItems: "center", gap: 7 }}
              >
                <X size={14} /> Clear filters
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid rgba(99,102,241,0.1)", padding: "24px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.6)", backdropFilter: "blur(20px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: 7, background: "linear-gradient(135deg,#6366f1,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Hexagon size={11} color="#fff" />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#1e1b4b" }}>PricingEngine</span>
            <span style={{ color: "#e8e6e0" }}>·</span>
            <span style={{ fontSize: 11, color: "#a09ec9" }}>Template Studio</span>
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            {[
              [<Palette size={14} color="#6366f1" />, "Mode A", "Legacy layouts"],
              [<Atom size={14} color="#a855f7" />, "Mode B", "Atomic renderer"],
              [<Pencil size={14} color="#ec4899" />, "Editor", "Live editing"],
            ].map(([icon, title, sub]) => (
              <div key={title} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                {icon}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#374151" }}>{title}</div>
                  <div style={{ fontSize: 9, color: "#a09ec9" }}>{sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {showJsonTest && (
          <JsonTestModal
            onClose={() => setShowJsonTest(false)}
            onOpen={doc => {
              setShowJsonTest(false);
              openEditor(doc);
            }}
          />
        )}

      </div>
    </div>
  );

  // ── EDITOR ────────────────────────────────────────────────────────────────
  return (
    <div ref={editorRootRef} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, fontFamily: "'DM Sans', system-ui, sans-serif", zIndex: 50, overflow: "auto", background: "linear-gradient(135deg, #f0f4ff 0%, #faf8ff 40%, #fff5f8 70%, #f0fff4 100%)" }}>

      {/* Ambient blobs — same as gallery */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
        <div style={{ position: "absolute", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)", top: -150, left: -100 }} />
        <div style={{ position: "absolute", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(236,72,153,0.07) 0%, transparent 70%)", bottom: -100, right: -80 }} />
      </div>

      {/* Sticky Topbar */}
      <div style={{
        height: 58, flexShrink: 0, position: "relative", zIndex: 100,
        background: "rgba(255,255,255,0.75)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
        borderBottom: "1px solid rgba(255,255,255,0.9)",
        boxShadow: "0 1px 24px rgba(99,102,241,0.07)",
        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px",
      }}>
        {/* Left */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setView("gallery")}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(99,102,241,0.07)", border: "1.5px solid rgba(99,102,241,0.15)", borderRadius: 9, color: "#6366f1", fontSize: 11, fontWeight: 700, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit", transition: "all .15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(99,102,241,0.12)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(99,102,241,0.07)"}
          >
            <ArrowLeft size={13} />
            Gallery
          </button>

          <div style={{ width: 1, height: 20, background: "rgba(99,102,241,0.12)" }} />

          {/* Logo mark */}
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#6366f1,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 10px rgba(99,102,241,0.35)" }}>
            <Hexagon size={14} color="#fff" fill="#fff" />
          </div>

          <div style={{ width: 1, height: 20, background: "rgba(99,102,241,0.12)" }} />

          {/* Template info */}
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ color: "#1e1b4b", fontWeight: 800, fontSize: 13, letterSpacing: -0.3 }}>{activeDoc?.name}</span>
            <span style={{
              background: `${CAT_COLORS[activeDoc?.category] || "#6366f1"}18`,
              color: CAT_COLORS[activeDoc?.category] || "#6366f1",
              fontSize: 9, fontWeight: 700, padding: "2px 9px", borderRadius: 99,
              border: `1px solid ${CAT_COLORS[activeDoc?.category] || "#6366f1"}30`
            }}>{activeDoc?.category}</span>
            <code style={{ background: "rgba(99,102,241,0.07)", color: "#8b83c4", fontSize: 9, padding: "2px 8px", borderRadius: 6, border: "1px solid rgba(99,102,241,0.1)", fontWeight: 600 }}>
              {typeof activeDoc?.layout === "object" ? `⬡ ${activeDoc.layout.type}` : activeDoc?.layout}
            </code>
          </div>
        </div>

        {/* Right */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Live indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(16,185,129,0.08)", border: "1.5px solid rgba(16,185,129,0.2)", borderRadius: 9, padding: "5px 12px" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "#065f46" }}>Live Preview</span>
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              background: saveStatus === "saved" || saveStatus === "published"
                ? "linear-gradient(135deg,#10b981,#059669)"
                : saveStatus === "error"
                  ? "linear-gradient(135deg,#ef4444,#dc2626)"
                  : "linear-gradient(135deg,#f59e0b,#d97706)",
              border: "none", borderRadius: 10, color: "#fff",
              fontSize: 11, fontWeight: 700, padding: "7px 14px",
              cursor: saving ? "not-allowed" : "pointer",
              fontFamily: "inherit", opacity: saving ? 0.7 : 1,
              boxShadow: "0 4px 14px rgba(245,158,11,0.35)",
              transition: "all .2s",
            }}
          >
            {saving ? "Saving..." : saveStatus === "saved" ? "✓ Saved" : saveStatus === "error" ? "✕ Failed" : saveStatus === "published" ? "✓ Published" : (
              <><Sparkles size={12} /> Save</>
            )}
          </button>

          {/* Publish button — only show if already saved */}
          {activeUserWidgetId && (
            <button
              onClick={handlePublish}
              disabled={publishing}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                background: "linear-gradient(135deg,#10b981,#059669)",
                border: "none", borderRadius: 10, color: "#fff",
                fontSize: 11, fontWeight: 700, padding: "7px 14px",
                cursor: publishing ? "not-allowed" : "pointer",
                fontFamily: "inherit", opacity: publishing ? 0.7 : 1,
                boxShadow: "0 4px 14px rgba(16,185,129,0.35)",
              }}
            >
              {publishing ? "Publishing..." : "⬆ Publish"}
            </button>
          )}

          {/* Export button */}
          <button
            onClick={() => {
              const payload = serializeTemplateDoc(editDoc);
              const j = JSON.stringify(payload, null, 2);
              const b = new Blob([j], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(b);
              a.download = `${editDoc?.id}.json`;
              a.click();
            }}
            style={{ display: "flex", alignItems: "center", gap: 7, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", borderRadius: 10, color: "#fff", fontSize: 11, fontWeight: 700, padding: "7px 16px", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 14px rgba(99,102,241,0.4)", transition: "all .15s" }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = "0 6px 20px rgba(99,102,241,0.55)"}
            onMouseLeave={e => e.currentTarget.style.boxShadow = "0 4px 14px rgba(99,102,241,0.4)"}
          >
            <Download size={13} />
            Export JSON
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative", zIndex: 1 }}>

        {/* Sidebar — glassy */}
        <div ref={sidebarScrollRef} style={{
          width: 272, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden",
          background: "rgba(255,255,255,0.7)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
          borderRight: "1px solid rgba(255,255,255,0.9)",
          boxShadow: "2px 0 24px rgba(99,102,241,0.06)",
        }}>
          <EditorSidebar
            doc={editDoc || activeDoc}
            onUpdatePlan={updatePlan}
            onUpdateTree={updateTree}
            selIdx={selIdx}
            setSel={setSelIdx}
          />
        </div>

        {/* Canvas */}
        <main ref={editorScrollRef} style={{ flex: 1, overflowY: "auto", overflowX: "visible", display: "flex", flexDirection: "column" }}>

          {/* Canvas label bar */}
          <div style={{ padding: "12px 24px 0", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <Sparkles size={11} color="#a09ec9" />
            <span style={{ fontSize: 9, fontWeight: 700, color: "#a09ec9", letterSpacing: 2, textTransform: "uppercase" }}>Preview Canvas</span>
            <div style={{ flex: 1, height: 1, background: "rgba(99,102,241,0.1)" }} />
            <span style={{ fontSize: 9, color: "#c4bef0", fontWeight: 500 }}>
              {typeof editDoc?.layout === "object" ? "Atomic · NodeRenderer" : `Mode A · ${editDoc?.layout}`}
              {editDoc?.theme?.cardStyle ? ` · ${editDoc.theme.cardStyle}` : ""}
            </span>
            {!activeUserWidgetId && (
              <span style={{ fontSize: 9, color: "#f59e0b", fontWeight: 600, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 6, padding: "2px 8px" }}>
                Unsaved — click Save to keep your changes
              </span>
            )}
            {activeUserWidgetId && (
              <span style={{ fontSize: 9, color: "#10b981", fontWeight: 600 }}>
                ✓ Saved to My Widgets
              </span>
            )}
          </div>

          {/* Widget preview card */}
          <div style={{ padding: "16px 24px 32px", flex: 1 }}>
            <div style={{
              background: "rgba(255,255,255,0.75)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              borderRadius: 20,
              overflow: "visible",
              border: "1.5px solid rgba(255,255,255,0.95)",
              boxShadow: "0 8px 40px rgba(99,102,241,0.1), inset 0 1px 0 rgba(255,255,255,0.9)",
            }}>
              <PricingRenderer doc={editDoc || activeDoc} />
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}

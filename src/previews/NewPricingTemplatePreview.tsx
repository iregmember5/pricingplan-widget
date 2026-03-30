import React, { useEffect, useRef, useState } from "react";

function normalizeAssetUrl(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  const markdownMatch = trimmed.match(/^\[[^\]]*\]\((https?:\/\/[^)\s]+)\)$/i);
  if (markdownMatch) return markdownMatch[1];

  return trimmed.replace(/^\"|\"$/g, "").replace(/^\'|\'$/g, "");
}

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

function spacingToNumber(val) {
  const resolved = resolveSpacing(val);
  if (typeof resolved === "number") return resolved;
  if (typeof resolved !== "string") return 0;
  const parsed = Number.parseFloat(resolved);
  return Number.isFinite(parsed) ? parsed : 0;
}

function useVisibleOnce(ref) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const timeout = setTimeout(() => setVisible(true), 400);
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
          clearTimeout(timeout);
        }
      },
      { threshold: 0.01, rootMargin: "120px 0px" }
    );
    obs.observe(ref.current);
    return () => { obs.disconnect(); clearTimeout(timeout); };
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// THE ENGINE
// Django sends a JSON doc -> PricingRenderer reads doc.layout -> picks one of
// 5 layout components -> each layout calls resolver functions with doc.theme
// -> resolvers return CSS/JSX based on theme values -> widget renders.
//
// Adding a new template = storing a new JSON in Django. Zero React changes.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SECTION 1 â€” RESOLVER FUNCTIONS
// These are the brain. They translate theme values -> actual CSS / JSX.
// Every layout component calls these. Nothing is hardcoded in the layouts.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// 1a. Card container CSS â€” driven by theme.cardStyle
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

// 1b. Accent line CSS â€” driven by theme.accentLine
function resolveAccentLine(theme, plan) {
  if (theme.accentLine === "none") return null;
  const style = {
    top: { position: "absolute", top: 0, left: 0, right: 0, height: 4, background: plan.color },
    bottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: 4, background: plan.color },
    left: { position: "absolute", top: 0, left: 0, bottom: 0, width: 4, background: plan.color },
  }[theme.accentLine];
  return style ? <div style={style} /> : null;
}

// 1c. Card header â€” driven by theme.headerLayout
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

// 1d. Price block â€” driven by theme.priceDisplay
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

// 1e. Feature list â€” driven by theme.featureStyle
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
          <span style={{ color: f.disabled ? "#555" : plan.color, fontWeight: 900, fontSize: 10 }}>{f.disabled ? "Ã—" : "â€º"}</span>
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
            ? <span style={{ color: mutedText, fontSize: 14 }}>â€”</span>
            : <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7L5.5 10L11.5 4" stroke={plan.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          }
          <span style={{ color: f.disabled ? mutedText : textColor, fontSize: 12, textDecoration: f.disabled ? "line-through" : "none" }}>{f.text}</span>
        </div>
      ))}
    </div>
  );
}

// 1f. Button â€” driven by theme.buttonShape + cardStyle
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
  // elevated, flat, outlined â€” standard
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


// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SECTION 2 â€” LAYOUT COMPONENTS
// These handle STRUCTURE only. All visual decisions go through resolvers.
// They receive the full doc object: { layout, theme, plans, ... }
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
            ? (visible ? getCardAnim(theme.animation, idx, plans.length) : { opacity: 0, willChange: "opacity, transform" })
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

              {/* image-bg: card IS the photo â€” no separate header image, just overlay content */}
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
                const val = feat.values?.[plan.id] ?? "â€”";
                return (
                  <div key={plan.id} style={{ padding: "13px 16px", borderLeft: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", background: plan.highlighted ? `${plan.color}04` : "transparent" }}>
                    {val === "âœ“"
                      ? <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill={plan.color + "25"} stroke={plan.color} strokeWidth="1" /><path d="M4.5 8L7 10.5L11.5 5.5" stroke={plan.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      : val === "â€”"
                        ? <span style={{ color: "#d1d5db", fontSize: 16 }}>â€”</span>
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
                  const val = feat.values?.[plan.id] ?? "â€”";
                  return (
                    <div key={plan.id} style={{ padding: "11px 16px", borderLeft: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {val === "âœ“" ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2.5 8L6 11.5L13.5 4" stroke={plan.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        : val === "â€”" ? <span style={{ color: "#d1d5db" }}>â€”</span>
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


// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SECTION 3 â€” THE ROUTER
// This is the entire engine entry point.
// Feed it any valid JSON doc -> it renders. No id mapping. No hardcoding.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    const stackEnabled = node.mobileLayout === "stack" || node.mobileStack;
    const resolvedGap = gap !== undefined ? gap : (node.gap === undefined ? "20px" : undefined);
    const gapSize = spacingToNumber(resolvedGap);
    const estimatedChildWidth = children.length > 0
      ? Math.max(0, (containerWidth - (gapSize * Math.max(0, children.length - 1))) / children.length)
      : containerWidth;
    const isMobile = containerWidth < 600;
    const tabletStackBreakpoint = children.length >= 3 ? 980 : 760;
    const hasExplicitHeight = !!node.height;
    const shouldStack = stackEnabled && (
      hasExplicitHeight
        ? isMobile
        : (isMobile || containerWidth < tabletStackBreakpoint || estimatedChildWidth < 300)
    );
    const resolvedHeight = shouldStack ? undefined : (px(node.height) || (depth === 0 ? undefined : "100%"));
    const resolvedMinHeight = shouldStack
      ? (px(node.minHeight) || px(node.height))
      : px(node.minHeight);
    const resolvedPadding = shouldStack ? resolveSpacing(node.mobilePadding ?? node.padding) : padding;
    const childContainerWidth = shouldStack ? containerWidth : estimatedChildWidth;
    return (
      <div ref={hasAnim ? containerRef : null} style={{
        display: "flex",
        flexDirection: shouldStack ? "column" : "row",
        position: "relative",
        alignItems: node.align,
        justifyContent: node.justify,
        gap: resolvedGap,
        background: node.background,
        padding: resolvedPadding,
        height: resolvedHeight,
        width: px(node.width),
        minHeight: resolvedMinHeight,
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
            ? (visible ? getCardAnim(theme.animation, idx, children.length) : { opacity: 0, willChange: "opacity, transform" })
            : {};
          const childFlexStyle = !shouldStack && child?.flex ? { flex: child.flex } : {};
          return (
            <div key={child?.id ?? `row-${idx}`} style={{ minWidth: 0, width: shouldStack ? "100%" : undefined, height: !shouldStack && node.height ? "100%" : undefined, display: "flex", flexDirection: "column", alignSelf: "stretch", ...animStyle, ...childFlexStyle }}>
              <NodeRenderer node={child} theme={theme} depth={depth + 1} containerWidth={childContainerWidth} />
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
    const canGrowForContent = containerWidth < 360 && !!node.height;
    return (
      <div style={{
        position: "relative",
        overflow: node.overflow || "hidden",
        backgroundImage,
        backgroundSize: "cover",
        backgroundPosition: node.objectPosition || "center",
        backgroundRepeat: "no-repeat",
        height: canGrowForContent ? "auto" : (px(node.height) || "100%"),
        minHeight: canGrowForContent
          ? (px(node.height) || px(node.minHeight) || (bgImage ? "200px" : undefined))
          : (px(node.minHeight) || (bgImage && !node.height ? "200px" : undefined)),
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
          <span key={i} style={{ color: starColor, fontSize: size, opacity: i <= rating ? 1 : 0.25 }}>â˜…</span>
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

export { normalizeTemplateDoc };
export default PricingRenderer;

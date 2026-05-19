import React from 'react';
import ReactDOM from 'react-dom/client';
import Widget from './Widget';
import FormWidget from './FormWidget';
import './index.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSlug(): string | null {
  const params = new URLSearchParams(window.location.search);
  let slug = params.get('slug');
  if (!slug && window.location.pathname.startsWith('/embed/')) {
    slug = window.location.pathname.split('/embed/')[1];
  }
  return slug;
}

function isEmbedMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('embed') === 'true' || window.location.pathname.startsWith('/embed/');
}

// When loaded as widget-loader.js?slug=xxx, read slug from script src
function getSlugFromScriptSrc(): string | null {
  const scripts = document.querySelectorAll('script[src*="widget-loader"]');
  for (const s of scripts) {
    const src = (s as HTMLScriptElement).src;
    const match = src.match(/[?&]slug=([^&]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

function getWidgetType(container: Element): 'pricing' | 'form' {
  if (container.className.includes('cont-app-')) return 'form';
  return 'pricing';
}

function getWidgetId(container: Element): string {
  const formMatch = container.className.match(/cont-app-([a-f0-9-]+)/);
  if (formMatch) return formMatch[1];
  const pricingMatch = container.className.match(/widget-([a-zA-Z0-9-]+)/);
  if (pricingMatch) return pricingMatch[1];
  return container.getAttribute('data-widget-id') || '';
}

// ── Entry point ───────────────────────────────────────────────────────────────

const scriptSlug = getSlugFromScriptSrc();
const urlSlug = getSlug();
const embedMode = isEmbedMode();

// ── FLOW 1: Loaded as widget-loader.js?slug=xxx (form embed code from backend)
// Form widgets have <div id="{slug}"> exactly matching the slug
// Pricing widgets have <div id="widget-{slug}"> — different pattern
if (scriptSlug && document.getElementById(scriptSlug)) {
  // <div id="slug"> exists → this is a form widget embed
  ReactDOM.createRoot(document.getElementById(scriptSlug)!).render(<FormWidget widgetId={scriptSlug} />);

// ── FLOW 2: No slug in URL — scan page for widget containers by class
} else if (!urlSlug || urlSlug.trim() === '') {
  const formContainers = document.querySelectorAll('[class*="cont-app-"]');
  const pricingContainers = document.querySelectorAll('[class*="widget-"], .pricing-widget');

  if (formContainers.length > 0 || pricingContainers.length > 0) {
    [...formContainers, ...pricingContainers].forEach((container) => {
      const widgetType = getWidgetType(container);
      const widgetId = getWidgetId(container);
      if (!widgetId) return;
      const root = ReactDOM.createRoot(container);
      if (widgetType === 'form') {
        root.render(<FormWidget widgetId={widgetId} />);
      } else {
        root.render(<Widget widgetId={widgetId} />);
      }
    });
  } else {
    document.body.innerHTML = `
      <div style="font-family:system-ui,sans-serif;text-align:center;padding:${embedMode ? '20px' : '100px'};color:#666;">
        <h2>No widget slug found</h2>
        <p>Use: <code style="background:#eee;padding:4px 8px;border-radius:6px;">?slug=your-widget-name</code></p>
      </div>`;
  }

// ── FLOW 3: ?slug=xxx in URL
} else {
  const widgetTypeParam = new URLSearchParams(window.location.search).get('type');

  if (widgetTypeParam === 'form') {
    // Form widget via URL param
    const container = document.createElement('div');
    document.body.appendChild(container);
    ReactDOM.createRoot(container).render(<FormWidget widgetId={urlSlug} />);

  } else {
    // ── Pricing widget (existing flow — unchanged) ────────────────────────
    let container = document.getElementById(`widget-${urlSlug}`);
    if (!container) {
      container = document.createElement('div');
      container.id = `widget-${urlSlug}`;
      container.style.cssText = embedMode
        ? 'margin:0;padding:0;background:transparent;width:100%;overflow:visible;'
        : 'max-width:1300px;margin:0px;padding:0px;background:white;border-radius:16px;box-shadow:0 20px 40px rgba(0,0,0,0.08);';
      document.body.appendChild(container);
    }

    ReactDOM.createRoot(container).render(<Widget widgetId={urlSlug} />);

    let lastHeight = 0;
    function sendResize() {
      const height = Math.max(document.body.scrollHeight, document.body.offsetHeight, document.documentElement.scrollHeight, document.documentElement.offsetHeight);
      if (Math.abs(height - lastHeight) > 10) { lastHeight = height; parent.postMessage({ type: 'resize', height }, '*'); }
    }
    setTimeout(sendResize, 500);
    setTimeout(sendResize, 1500);
    const observer = new MutationObserver(() => setTimeout(sendResize, 100));
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

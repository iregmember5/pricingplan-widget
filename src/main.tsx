import React from 'react';
import ReactDOM from 'react-dom/client';
import Widget from './Widget';
import FormWidget from './FormWidget';
import './index.css';

// Check if we're in embed mode
function isEmbedMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('embed') === 'true' || window.location.pathname.startsWith('/embed/');
}

function getSlug(): string | null {
  const params = new URLSearchParams(window.location.search);
  let slug = params.get('slug');
  
  // Also check path for /embed/slug format
  if (!slug && window.location.pathname.startsWith('/embed/')) {
    slug = window.location.pathname.split('/embed/')[1];
  }
  
  return slug;
}

// Detect widget type from container class
function getWidgetType(container: Element): 'pricing' | 'form' {
  // Form widgets use class pattern: cont-app-{id}
  if (container.className.includes('cont-app-')) {
    return 'form';
  }
  // Pricing widgets use: pricing-widget or widget-{slug}
  return 'pricing';
}

// Extract widget ID from container
function getWidgetId(container: Element): string {
  const className = container.className;
  
  // Form widget: cont-app-{id}
  const formMatch = className.match(/cont-app-([a-f0-9-]+)/);
  if (formMatch) {
    return formMatch[1];
  }
  
  // Pricing widget: widget-{slug}
  const pricingMatch = className.match(/widget-([a-zA-Z0-9-]+)/);
  if (pricingMatch) {
    return pricingMatch[1];
  }
  
  // Fallback to data attribute
  return container.getAttribute('data-widget-id') || '';
}

const slug = getSlug();
const embedMode = isEmbedMode();

if (embedMode) {
  // Embed mode - minimal styling
  // document.body.style.margin = '0';
  // document.body.style.padding = '0';
  // document.body.style.background = 'transparent';
}

if (!slug || slug.trim() === '') {
  // Check if there are any widget containers on the page
  const formContainers = document.querySelectorAll('[class*="cont-app-"]');
  const pricingContainers = document.querySelectorAll('[class*="widget-"], .pricing-widget');
  
  if (formContainers.length > 0 || pricingContainers.length > 0) {
    // Render widgets in their containers
    [...formContainers, ...pricingContainers].forEach((container) => {
      const widgetType = getWidgetType(container);
      const widgetId = getWidgetId(container);
      
      if (widgetId) {
        console.log(`Rendering ${widgetType} widget:`, widgetId);
        const root = ReactDOM.createRoot(container);
        
        if (widgetType === 'form') {
          root.render(<FormWidget widgetId={widgetId} />);
        } else {
          root.render(<Widget widgetId={widgetId} />);
        }
      }
    });
  } else {
    // No slug and no containers found
    document.body.innerHTML = `
      <div style="font-family: system-ui, sans-serif; text-align: center; padding: ${embedMode ? '20px' : '100px'}; color: #666; background: ${embedMode ? 'transparent' : '#f9fafb'}; min-height: ${embedMode ? 'auto' : '100vh'};">
        <h2>No widget slug found</h2>
        <p style="font-size: 18px; margin-top: 16px;">
          Use: <code style="background:#eee; padding:4px 8px; border-radius:6px;">?slug=your-widget-name</code>
        </p>
      </div>
    `;
  }
} else {
  // Slug-based mode — check ?type=form to route to form widget
  const widgetTypeParam = new URLSearchParams(window.location.search).get('type');

  if (widgetTypeParam === 'form') {
    const container = document.createElement('div');
    document.body.appendChild(container);
    ReactDOM.createRoot(container).render(<FormWidget widgetId={slug} />);
  } else {
    // ── Pricing widget (existing flow — unchanged) ──────────────────────────
    let container = document.getElementById(`widget-${slug}`);

    if (!container) {
      container = document.createElement('div');
      container.id = `widget-${slug}`;

      if (embedMode) {
        container.style.cssText = `
          margin: 0;
          padding: 0;
          background: transparent;
          width: 100%;
          overflow: visible;
        `;
      } else {
        container.style.cssText = `
          max-width: 1300px;
          margin: 0px;
          padding: 0px;
          background: white;
          border-radius: 16px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.08);
        `;
      }

      document.body.appendChild(container);
    }

    const root = ReactDOM.createRoot(container);
    root.render(<Widget widgetId={slug} />);

    // Send resize messages to parent window
    let lastHeight = 0;
    function sendResize() {
      const height = Math.max(
        document.body.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight
      );
      if (Math.abs(height - lastHeight) > 10) {
        lastHeight = height;
        parent.postMessage({ type: 'resize', height }, '*');
      }
    }

    setTimeout(sendResize, 500);
    setTimeout(sendResize, 1500);

    const observer = new MutationObserver(() => {
      setTimeout(sendResize, 100);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}
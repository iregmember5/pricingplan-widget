(function () {
  'use strict';

  const script = document.currentScript || document.querySelector('script[src*="widget-loader"]');

  function resolveBaseUrl(scriptEl) {
    try {
      const url = new URL(scriptEl.src, window.location.href);
      return `${url.origin}/`;
    } catch (e) {
      return window.location.origin + '/';
    }
  }

  function loadWidget(slug) {
    if (!slug) return;

    const containerId = 'widget-' + slug;
    let container = document.getElementById(containerId) || document.getElementById(slug);

    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      document.body.appendChild(container);
    }

    container.innerHTML = '';
    container.style.cssText = 'width:100%; margin:0; padding:0; overflow:visible;';

    const iframe = document.createElement('iframe');
    const baseUrl = resolveBaseUrl(script);
    iframe.src = baseUrl + '?slug=' + encodeURIComponent(slug) + '&embed=true';
    iframe.style.cssText = [
      'width: 100% !important',
      'min-height: 800px !important',
      'border: none !important',
      'display: block !important',
      'background: transparent !important',
      'overflow: hidden !important'
    ].join('; ');
    iframe.frameBorder = '0';
    iframe.scrolling = 'no';
    iframe.allowTransparency = true;

    container.appendChild(iframe);

    let lastSetHeight = 0;

    iframe.onload = function() {
      try {
        const height = iframe.contentWindow.document.documentElement.scrollHeight;
        iframe.style.height = height + 'px';
        lastSetHeight = height;
      } catch (e) {
        // Cross-origin: resize will come through postMessage.
      }
    };

    function onMessage(e) {
      if (e.data && e.data.type === 'resize' && e.data.height) {
        const newHeight = e.data.height;
        if (Math.abs(newHeight - lastSetHeight) > 10) {
          iframe.style.height = newHeight + 'px';
          lastSetHeight = newHeight;
        }
      }
    }

    window.addEventListener('message', onMessage);
  }

  if (script) {
    try {
      const url = new URL(script.src, window.location.href);
      const slug = url.searchParams.get('slug');
      if (slug) {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => loadWidget(slug));
        } else {
          loadWidget(slug);
        }
      }
    } catch (e) {
      console.warn('Failed to load widget slug');
    }
  }
})();

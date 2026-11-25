(function () {
  'use strict';

  var currentScript = document.currentScript || document.querySelector('script[src*="pwyw.js"]');
  if (!currentScript) return;

  var widgetOrigin;
  try { widgetOrigin = new URL(currentScript.src, window.location.href).origin; }
  catch (_) { return; }

  var apiRoot = widgetOrigin + '/v1/api';
  var mounts = document.querySelectorAll('[data-mypowerly-pwyw]');

  function unwrap(body) {
    var value = body;
    if (value && value.data && typeof value.data === 'object') value = value.data;
    if (value && value.data && typeof value.data === 'object') value = value.data;
    var config = value && (value.config_json || value.configJson || value);
    return { root: value, config: config, settings: config && (config.pay_what_you_want || config.payWhatYouWant) };
  }

  function loadPublicConfig(id) {
    return fetch(apiRoot + '/widgets/new-pricing-widget/public/' + encodeURIComponent(id) + '/', {
      method: 'GET', credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' },
    }).then(function (response) {
      if (response.status === 404) throw new Error('This payment page is not available.');
      return response.json().then(function (body) {
        if (!response.ok || body.success === false) throw new Error(body.message || 'This payment page is not available.');
        return unwrap(body);
      });
    });
  }

  function createButton(mount, id, settings) {
    var root = mount.shadowRoot || mount.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent = ':host{display:inline-block;max-width:100%;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button{appearance:none;border:0;border-radius:8px;padding:12px 20px;color:#fff;font-family:inherit;font-size:15px;font-weight:600;line-height:1.25;cursor:pointer;box-shadow:0 2px 6px rgba(16,24,40,.15);transition:filter .15s,transform .15s}button:hover{filter:brightness(.94);transform:translateY(-1px)}button:focus-visible{outline:3px solid #93c5fd;outline-offset:3px}button:disabled{opacity:.65;cursor:wait;transform:none}.error{font:13px/1.4 system-ui,sans-serif;color:#b42318}';
    root.replaceChildren(style);
    var color = settings && settings.button && /^#[0-9a-f]{6}$/i.test(settings.button.color || '') ? settings.button.color : '#2B59C3';
    var label = settings && settings.button && settings.button.label || 'Pay What You Want';
    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.backgroundColor = color;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', function () { openCheckout(id); });
    root.appendChild(button);
  }

  function showError(mount, message) {
    var root = mount.shadowRoot || mount.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent = ':host{font:13px/1.4 system-ui,sans-serif;color:#b42318}';
    var error = document.createElement('span');
    error.className = 'error';
    error.setAttribute('role', 'status');
    error.textContent = message;
    root.replaceChildren(style, error);
  }

  function openCheckout(id) {
    var parentHost = window.location.hostname.toLowerCase();
    if (parentHost === 'localhost' || parentHost === '127.0.0.1' || parentHost === '::1') {
      window.open(widgetOrigin + '/pay/' + encodeURIComponent(id), '_blank', 'noopener,noreferrer');
      return;
    }
    var overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Secure payment');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.72);display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box';
    var frameWrap = document.createElement('div');
    frameWrap.style.cssText = 'position:relative;width:min(100%,560px);height:min(92vh,850px);background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.32)';
    var close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    close.setAttribute('aria-label', 'Close payment window');
    close.style.cssText = 'position:absolute;z-index:2;right:12px;top:12px;border:1px solid #d0d5dd;border-radius:8px;background:#fff;color:#344054;padding:7px 11px;font:600 13px system-ui;cursor:pointer';
    var frame = document.createElement('iframe');
    frame.title = 'Secure MyPowerly payment';
    var query = '?embed=1';
    var host = window.location.hostname.toLowerCase();
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') {
      query += '&origin=' + encodeURIComponent(window.location.origin);
    }
    frame.src = widgetOrigin + '/pay/' + encodeURIComponent(id) + query;
    frame.allow = 'payment';
    frame.referrerPolicy = 'strict-origin';
    frame.style.cssText = 'width:100%;height:100%;border:0;display:block;background:#f7f8fa';
    var processing = false;
    var closed = false;
    function closeOverlay() {
      if (closed || processing) return;
      closed = true;
      window.removeEventListener('message', onMessage);
      window.removeEventListener('keydown', onKeyDown);
      overlay.remove();
    }
    function onMessage(event) {
      if (event.origin !== widgetOrigin || event.source !== frame.contentWindow || !event.data || typeof event.data !== 'object') return;
      if (event.data.type === 'payment_processing') processing = true;
      if (event.data.type === 'payment_ready') processing = false;
      if (event.data.type === 'payment_succeeded') {
        processing = false;
        overlay.setAttribute('aria-label', 'Payment completed');
        window.setTimeout(function () { closeOverlay(); }, 1200);
      }
      if (event.data.type === 'close') closeOverlay();
    }
    function onKeyDown(event) { if (event.key === 'Escape') closeOverlay(); }
    close.addEventListener('click', closeOverlay);
    overlay.addEventListener('click', function (event) { if (event.target === overlay) closeOverlay(); });
    frameWrap.appendChild(close);
    frameWrap.appendChild(frame);
    overlay.appendChild(frameWrap);
    window.addEventListener('message', onMessage);
    window.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);
  }

  Array.prototype.forEach.call(mounts, function (mount) {
    var id = (mount.getAttribute('data-mypowerly-pwyw') || '').trim();
    if (!id) return;
    loadPublicConfig(id).then(function (publicConfig) {
      var root = publicConfig && publicConfig.root;
      var config = publicConfig && publicConfig.config;
      var settings = publicConfig && publicConfig.settings;
      if (!root || !config || !settings
        || String(config.widget_type || config.widgetType || '').toUpperCase() !== 'PAY_WHAT_YOU_WANT'
        || root.is_active !== true || root.is_published !== true) {
        throw new Error('This payment page is not available.');
      }
      createButton(mount, id, settings);
    }).catch(function (error) {
      showError(mount, error && error.message || 'Payment button could not be loaded.');
    });
  });
})();

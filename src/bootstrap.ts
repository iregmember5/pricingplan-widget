if (window.location.pathname.replace(/\/$/, '') === '/payment-status') {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const statusToken = fragment.get('widget_status');
  let scrubbed = false;
  try {
    window.history.replaceState(null, '', window.location.pathname);
    scrubbed = true;
  } catch { /* Never load or exchange a token if it cannot be scrubbed. */ }
  if (scrubbed) {
    void import('./WidgetPaymentStatusPage').then(({ mountPaymentStatus }) => {
      mountPaymentStatus(statusToken?.startsWith('ws_') ? statusToken : null);
    });
  } else {
    document.body.textContent = 'This private status link could not be opened. Contact the merchant for help.';
  }
} else {
  void import('./main');
}

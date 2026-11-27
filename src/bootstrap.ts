import { appointmentRoute } from "./appointments/routing";

const appointment = appointmentRoute(window.location.pathname, window.location.search);

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
} else if (appointment) {
  let token = '';
  let scrubbed = true;
  if (appointment.management) {
    token = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    try { window.history.replaceState(null, '', window.location.pathname); }
    catch { scrubbed = false; }
  }
  if (scrubbed) {
    void import('./appointments/mount').then(({ mountAppointment }) => {
      mountAppointment(appointment.widgetId, token, appointment.management);
    });
  } else {
    document.body.textContent = 'This private appointment link could not be opened. Contact the business for help.';
  }
} else {
  void import('./main');
}

import React from "react";
import { createRoot } from "react-dom/client";
import PublicAppointmentPage from "./PublicAppointmentPage";
import CustomerManagementPage from "./CustomerManagementPage";
import "../index.css";

export function mountAppointment(
  widgetId: string,
  managementToken: string,
  isManagement: boolean
) {
  const container = document.createElement("div");
  container.className = "appointment-widget";
  document.body.appendChild(container);
  createRoot(container).render(
    isManagement ? (
      <CustomerManagementPage managementToken={managementToken} />
    ) : (
      <PublicAppointmentPage widgetId={widgetId} />
    )
  );
  // Only geometry crosses the iframe boundary; customer details and tokens never do.
  if (window.parent !== window) {
    let height = 0;
    let frame = 0;
    const send = () => {
      frame = 0;
      const next = Math.ceil(container.getBoundingClientRect().height);
      if (next !== height && next > 0) {
        height = next;
        window.parent.postMessage({ type: "resize", height }, "*");
      }
    };
    const observer = new ResizeObserver(() => {
      if (!frame) frame = requestAnimationFrame(send);
    });
    observer.observe(container);
    send();
    window.addEventListener(
      "pagehide",
      () => {
        observer.disconnect();
        cancelAnimationFrame(frame);
      },
      { once: true }
    );
  }
}

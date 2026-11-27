import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppointmentError,
  book,
  errorText,
  getAvailability,
  getPublicWidget,
  RecordData,
  Slot,
} from "./api";
import {
  BookingSummary,
  buttonClass,
  inputClass,
  SlotPicker,
} from "./BookingUI";

export default function PublicAppointmentPage({
  widgetId,
}: {
  widgetId: string;
}) {
  const [widget, setWidget] = useState<RecordData | null>(null);
  const [service, setService] = useState("");
  const [slot, setSlot] = useState<Slot | null>(null);
  const [zone, setZone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  );
  const [details, setDetails] = useState({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    notes: "",
  });
  const [error, setError] = useState("");
  const [fields, setFields] = useState<RecordData>({});
  const [booking, setBooking] = useState<RecordData | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const lastAvailability = useRef<RecordData | null>(null);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    let active = true;
    setWidget(null);
    setError("");
    setBooking(null);
    attempt.current = null;
    getPublicWidget(widgetId)
      .then((data) => {
        if (active) {
          setWidget(data);
          setService(data.services?.[0]?.id || "");
        }
      })
      .catch((err) => {
        if (active) setError(errorText(err));
      });
    return () => {
      active = false;
    };
  }, [widgetId]);
  const load = useCallback(
    (params: RecordData, signal: AbortSignal) => {
      lastAvailability.current = { ...params, service };
      return getAvailability(widgetId, lastAvailability.current, signal);
    },
    [widgetId, service]
  );
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!slot || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    setFields({});
    const payload = { service, starts_at: slot.starts_at, ...details };
    const fingerprint = JSON.stringify(payload);
    if (attempt.current?.fingerprint !== fingerprint)
      attempt.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const result = await book(widgetId, {
        ...payload,
        idempotency_key: attempt.current.key,
      });
      setBooking(result);
      setVersion((n) => n + 1);
      attempt.current = null;
      if (lastAvailability.current)
        void getAvailability(widgetId, lastAvailability.current).catch(
          () => {}
        );
    } catch (err) {
      setError(errorText(err));
      if (err instanceof AppointmentError) {
        if (err.status === 400)
          setFields(err.body?.errors || err.body?.data || err.body || {});
        if (err.status === 409) {
          setSlot(null);
          setVersion((n) => n + 1);
          attempt.current = null;
        }
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  const embedded = ["1", "true"].includes(
    new URLSearchParams(window.location.search).get("embed") || ""
  );
  return (
    <main
      className={`${
        embedded ? "p-3" : "mx-auto max-w-3xl p-6"
      } min-h-screen bg-white text-gray-900`}
    >
      {error && (
        <p role="alert" className="my-3 rounded-lg bg-red-50 p-3 text-red-800">
          {error}
        </p>
      )}
      {!widget && !error && <p role="status">Loading appointment widget…</p>}
      {widget && (
        <>
          <h1
            className="mb-2 text-3xl font-bold"
            style={{ color: widget.accent_color }}
          >
            {widget.name}
          </h1>
          <p>{widget.description}</p>
          <p className="mb-5 text-sm">Schedule timezone: {widget.timezone}</p>
          {booking ? (
            <>
              <BookingSummary booking={booking} />
              <button
                className={`${buttonClass} my-4`}
                onClick={() => {
                  setBooking(null);
                  setSlot(null);
                  setDetails({
                    customer_name: "",
                    customer_email: "",
                    customer_phone: "",
                    notes: "",
                  });
                }}
              >
                Book another appointment
              </button>
            </>
          ) : (
            <>
              <label>
                Service
                <select
                  className={`${inputClass} mb-4`}
                  value={service}
                  disabled={busy}
                  onChange={(e) => {
                    setService(e.target.value);
                    setSlot(null);
                  }}
                >
                  {widget.services?.map((item: RecordData) => (
                    <option key={item.id} value={item.id}>
                      {item.name} — {item.duration_minutes} minutes
                    </option>
                  ))}
                </select>
              </label>
              {service && (
                <SlotPicker
                  load={load}
                  value={slot}
                  onSelect={setSlot}
                  zone={zone}
                  onZone={setZone}
                  version={version}
                />
              )}
              <form onSubmit={submit} className="mt-5 space-y-3">
                <fieldset disabled={busy} className="space-y-3">
                  {(
                    [
                      "customer_name",
                      "customer_email",
                      "customer_phone",
                      "notes",
                    ] as const
                  ).map((key) => (
                    <label className="block" key={key}>
                      {
                        {
                          customer_name: "Name",
                          customer_email: "Email",
                          customer_phone: "Phone (optional)",
                          notes: "Notes (optional)",
                        }[key]
                      }
                      <input
                        className={inputClass}
                        type={
                          key === "customer_email"
                            ? "email"
                            : key === "customer_phone"
                            ? "tel"
                            : "text"
                        }
                        required={
                          key === "customer_name" || key === "customer_email"
                        }
                        value={details[key]}
                        onChange={(e) =>
                          setDetails((current) => ({
                            ...current,
                            [key]: e.target.value,
                          }))
                        }
                        aria-invalid={Boolean(fields[key])}
                      />
                      {fields[key] && (
                        <span role="alert" className="text-red-700">
                          {String(fields[key])}
                        </span>
                      )}
                    </label>
                  ))}
                  <button
                    className={buttonClass}
                    disabled={!slot || !service || busy}
                  >
                    {busy ? "Confirming…" : "Book appointment"}
                  </button>
                </fieldset>
              </form>
            </>
          )}
          <details className="mt-6 text-sm">
            <summary>Booking help</summary>
            <p>
              If you receive the same confirmation twice with the same booking
              reference, it’s one appointment. Use your booking link to check
              the current details.
            </p>
          </details>
        </>
      )}
    </main>
  );
}

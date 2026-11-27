import React, { useEffect, useState } from "react";
import { Availability, errorText, RecordData, Slot } from "./api";

export const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white p-2 text-gray-900";
export const buttonClass =
  "rounded-lg bg-cyan-700 px-4 py-2 text-white disabled:opacity-50";
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;
}
export function rangeEnd(start: string) {
  const date = new Date(`${start}T12:00:00`);
  date.setDate(date.getDate() + 6);
  return localDate(date);
}
export function slotLabel(value: string, zone: string) {
  return new Date(value).toLocaleString(undefined, {
    timeZone: zone,
    dateStyle: "medium",
    timeStyle: "short",
  });
}
export function downloadCalendar(text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/calendar;charset=utf-8" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "appointment.ics";
  link.click();
  URL.revokeObjectURL(url);
}
export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="my-3 rounded-lg bg-cyan-50 p-3 text-gray-900">
      {children}
    </p>
  );
}
export function SlotPicker({
  load,
  value,
  onSelect,
  zone,
  onZone,
  version = 0,
  showReasons = false,
}: {
  load: (params: RecordData, signal: AbortSignal) => Promise<Availability>;
  value: Slot | null;
  onSelect: (slot: Slot | null) => void;
  zone: string;
  onZone: (zone: string) => void;
  version?: number;
  showReasons?: boolean;
}) {
  const [start, setStart] = useState(localDate());
  const [end, setEnd] = useState(rangeEnd(localDate()));
  const [result, setResult] = useState<Availability | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setLoading(false);
    setError("");
    onSelect(null);
    const days = (Date.parse(end) - Date.parse(start)) / 86400000;
    try {
      new Intl.DateTimeFormat(undefined, { timeZone: zone });
    } catch {
      setError("Enter a valid timezone, such as America/New_York.");
      return;
    }
    if (!start || !end || days < 0 || days > 30) {
      setError("Choose a range of 1–31 dates.");
      return;
    }
    setLoading(true);
    load(
      { start_date: start, end_date: end, display_timezone: zone },
      controller.signal
    )
      .then((data) => {
        if (!controller.signal.aborted) setResult(data);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(errorText(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [load, start, end, zone, version, retry]);
  return (
    <section aria-label="Appointment availability" className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          From
          <input
            aria-label="From date"
            type="date"
            className={inputClass}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          Through
          <input
            aria-label="Through date"
            type="date"
            className={inputClass}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <label>
          Timezone
          <input
            aria-label="Display timezone"
            className={inputClass}
            value={zone}
            onChange={(e) => onZone(e.target.value)}
          />
        </label>
      </div>
      <p className="text-sm text-gray-600">
        Times shown in {zone}. Booked and unavailable times cannot be selected.
      </p>
      {loading && <Notice>Loading availability…</Notice>}
      {error && (
        <>
          <p role="alert">{error}</p>
          <button
            type="button"
            className={buttonClass}
            onClick={() => setRetry((n) => n + 1)}
          >
            Retry availability
          </button>
        </>
      )}
      {result &&
        !result.dates.some((day) =>
          day.slots.some((slot) => slot.status === "available")
        ) && (
          <Notice>No available times in this range. Try other dates.</Notice>
        )}
      {result?.dates.map((day) => (
        <div key={day.date}>
          <h3 className="font-semibold">{day.date}</h3>
          <div className="flex flex-wrap gap-2 py-2">
            {day.slots.map((slot) => (
              <button
                type="button"
                key={slot.starts_at}
                disabled={slot.status !== "available"}
                aria-pressed={value?.starts_at === slot.starts_at}
                className={`rounded-lg border p-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                  value?.starts_at === slot.starts_at
                    ? "bg-cyan-700 text-white"
                    : "bg-white"
                }`}
                onClick={() => onSelect(slot)}
              >
                {new Date(slot.starts_at).toLocaleTimeString(undefined, {
                  timeZone: zone,
                  hour: "numeric",
                  minute: "2-digit",
                })}
                {slot.status !== "available" && ` — ${slot.status}`}
                {showReasons && slot.reason && ` (${slot.reason})`}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
export function BookingSummary({ booking }: { booking: RecordData }) {
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="text-xl font-bold">
        Appointment {booking.status || "confirmed"}
      </h2>
      <p>Reference: {booking.id}</p>
      <p>{booking.service_name || booking.service?.name}</p>
      {booking.starts_at && (
        <p>
          {slotLabel(booking.starts_at, booking.timezone || "UTC")} (
          {booking.timezone || "UTC"})
        </p>
      )}
      {booking.ends_at && (
        <p>Ends: {slotLabel(booking.ends_at, booking.timezone || "UTC")}</p>
      )}
      {booking.location && <p>Location: {booking.location}</p>}
      {booking.change_cutoff_at && (
        <p>
          Customer changes allowed until{" "}
          {slotLabel(booking.change_cutoff_at, booking.timezone || "UTC")}.
        </p>
      )}
      {booking.manage_url && (
        <a
          className="block text-cyan-700 underline"
          href={booking.manage_url}
          rel="noreferrer"
        >
          Manage your booking
        </a>
      )}
      {booking.calendar_ics && (
        <button
          type="button"
          className={buttonClass}
          onClick={() => downloadCalendar(booking.calendar_ics)}
        >
          Download calendar file
        </button>
      )}
      {booking.status === "confirmed" && (
        <p className="text-sm">
          Your appointment is confirmed. If you don’t see it on a connected
          calendar yet, use the confirmation details above.
        </p>
      )}
    </section>
  );
}

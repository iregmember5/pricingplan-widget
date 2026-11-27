import React, { useCallback, useEffect, useRef, useState } from "react";
import { customer, errorText, RecordData, Slot } from "./api";
import { BookingSummary, buttonClass, SlotPicker } from "./BookingUI";

export default function CustomerManagementPage({
  managementToken,
}: {
  managementToken: string;
}) {
  const token = useRef(managementToken);
  const [ready, setReady] = useState(false);
  const [booking, setBooking] = useState<RecordData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [zone, setZone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  );
  const [version, setVersion] = useState(0);
  const [rescheduling, setRescheduling] = useState(false);
  const locked = useRef(false);
  useEffect(() => {
    if (!token.current) {
      setError(
        "Open the private management link from your booking confirmation."
      );
      return;
    }
    setReady(true);
    let active = true;
    customer("lookup", token.current)
      .then((data) => {
        if (active) setBooking(data);
      })
      .catch((err) => {
        if (active) setError(errorText(err));
      });
    return () => {
      active = false;
    };
  }, []);
  const load = useCallback(
    (params: RecordData, signal: AbortSignal) =>
      customer("availability", token.current, params, signal),
    []
  );
  const act = async (action: "cancel" | "reschedule") => {
    if (locked.current || (action === "reschedule" && !slot)) return;
    if (action === "cancel" && !window.confirm("Cancel this appointment?"))
      return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      setBooking(
        await customer(
          action,
          token.current,
          action === "reschedule" ? { starts_at: slot!.starts_at } : {}
        )
      );
      setRescheduling(false);
      setSlot(null);
    } catch (err) {
      setError(errorText(err));
      setVersion((n) => n + 1);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const canChange =
    booking?.status === "confirmed" &&
    (!booking.change_cutoff_at ||
      Date.now() < Date.parse(booking.change_cutoff_at));
  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-4 bg-white p-6 text-gray-900">
      <h1 className="text-3xl font-bold">Manage appointment</h1>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {ready && !booking && !error && (
        <p role="status">Loading your booking…</p>
      )}
      {booking && (
        <>
          <BookingSummary booking={{ ...booking, manage_url: undefined }} />
          {canChange ? (
            <div className="flex gap-3">
              <button
                disabled={busy}
                className={buttonClass}
                onClick={() => setRescheduling((open) => !open)}
              >
                Choose a new time
              </button>
              <button
                disabled={busy}
                className={buttonClass}
                onClick={() => act("cancel")}
              >
                Cancel appointment
              </button>
            </div>
          ) : (
            <p>
              Online changes are unavailable for this appointment. Contact the
              business for help.
            </p>
          )}
          {rescheduling && canChange && (
            <>
              <SlotPicker
                load={load}
                value={slot}
                onSelect={setSlot}
                zone={zone}
                onZone={setZone}
                version={version}
              />
              <button
                disabled={!slot || busy}
                className={buttonClass}
                onClick={() => act("reschedule")}
              >
                {busy ? "Saving…" : "Confirm new time"}
              </button>
            </>
          )}
        </>
      )}
    </main>
  );
}

import { API_BASE_URL } from "../apiConfig";

export type RecordData = Record<string, any>;
export interface Slot {
  starts_at: string;
  ends_at: string;
  status: string;
  reason?: string;
}
export interface Availability {
  dates: { date: string; slots: Slot[] }[];
  next_available_date: string | null;
}
export class AppointmentError extends Error {
  constructor(public status: number, public body: any) {
    super(
      typeof body?.message === "string"
        ? body.message
        : typeof body?.detail === "string"
        ? body.detail
        : "Appointment request failed."
    );
  }
}
export function errorText(error: unknown): string {
  if (error instanceof AppointmentError) {
    if (error.status === 409)
      return "That time is no longer available. Choose another time; your contact details have been kept.";
    if (error.status === 503)
      return "Calendar availability is temporarily unavailable. Please try again later.";
    if (error.status === 429)
      return "Too many requests. Please wait before trying again.";
    if (error.status === 404)
      return "This appointment widget or booking is unavailable.";
    const fields = error.body?.errors || error.body?.data || error.body;
    return `${error.message}${
      fields && typeof fields === "object" ? ` ${JSON.stringify(fields)}` : ""
    }`;
  }
  return error instanceof Error
    ? error.message
    : "Unable to complete the request.";
}
// This client deliberately has no staff session, workspace state, auth refresh or key conversion.
async function request<T = RecordData>(
  path: string,
  options: {
    method?: string;
    data?: RecordData;
    params?: RecordData;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  const url = new URL(`${API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(options.params || {}))
    if (value !== undefined) url.searchParams.set(key, String(value));
  const response = await fetch(url.toString(), {
    method: options.method || "GET",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: options.signal,
    ...(options.data
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options.data),
        }
      : {}),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success === false)
    throw new AppointmentError(response.status, body);
  if (!body || !Object.prototype.hasOwnProperty.call(body, "data"))
    throw new Error(
      "The appointment API returned an invalid response. Please try again later."
    );
  return body.data;
}
const base = (id: string) =>
  `/widgets/public/appointment-widgets/${encodeURIComponent(id)}/`;
export const getPublicWidget = (id: string) => request(base(id));
export const getAvailability = (
  id: string,
  params: RecordData,
  signal?: AbortSignal
) => request<Availability>(`${base(id)}availability/`, { params, signal });
export const book = (id: string, data: RecordData) =>
  request(`${base(id)}book/`, { method: "POST", data });
export const customer = (
  action: string,
  token: string,
  data: RecordData = {},
  signal?: AbortSignal
) =>
  request<any>(`/appointments/public/customer-bookings/${action}/`, {
    method: "POST",
    data: { ...data, token },
    signal,
  });

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { build } from "esbuild";
async function load(path) {
  const result = await build({
    entryPoints: [new URL(path, import.meta.url).pathname],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(
      result.outputFiles[0].text
    ).toString("base64")}`
  );
}
const api = await load("../src/appointments/api.ts");
const { appointmentRoute } = await load("../src/appointments/routing.ts");
const loader = await readFile(
  new URL("../public/widget-loader.js", import.meta.url),
  "utf8"
);
function intercept(t, replies) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), ...init });
    const response = replies.shift() || { status: 200, body: { data: {} } };
    return new Response(JSON.stringify(response.body), {
      status: response.status,
    });
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}
test("public booking uses its dedicated endpoint and no staff credentials", async (t) => {
  const calls = intercept(t, [
    { status: 201, body: { data: { id: "booking" } } },
    { status: 200, body: { data: { id: "booking" } } },
  ]);
  const body = {
    service: "service",
    starts_at: "2026-12-08T14:00:00Z",
    idempotency_key: "same-key",
  };
  assert.deepEqual(await api.book("widget", body), { id: "booking" });
  await api.book("widget", body);
  assert.equal(
    calls[0].url,
    "https://mypowerly.com/v1/api/widgets/public/appointment-widgets/widget/book/"
  );
  assert.equal(calls[0].credentials, "omit");
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.equal(calls[0].body, calls[1].body);
  assert.equal(new URL(calls[0].url).search, "");
});
test("availability preserves service UUID, dates, timezone and cancellation signal", async (t) => {
  const calls = intercept(t, [
    { status: 200, body: { data: { dates: [], next_available_date: null } } },
  ]);
  const signal = new AbortController().signal;
  await api.getAvailability(
    "widget",
    {
      service: "uuid",
      start_date: "2026-12-01",
      end_date: "2026-12-07",
      display_timezone: "America/New_York",
    },
    signal
  );
  const url = new URL(calls[0].url);
  assert.equal(url.searchParams.get("display_timezone"), "America/New_York");
  assert.equal(url.searchParams.get("service"), "uuid");
  assert.equal(calls[0].signal, signal);
});
test("customer token is carried in JSON only", async (t) => {
  const calls = intercept(t, [
    { status: 200, body: { data: { status: "cancelled" } } },
  ]);
  await api.customer("cancel", "private-token");
  assert.match(
    calls[0].url,
    /\/appointments\/public\/customer-bookings\/cancel\/$/
  );
  assert.ok(!calls[0].url.includes("private-token"));
  assert.deepEqual(JSON.parse(calls[0].body), { token: "private-token" });
});
test("HTTP errors retain status and validation detail; malformed success is rejected", async (t) => {
  intercept(t, [
    { status: 400, body: { errors: { customer_email: ["Invalid email"] } } },
    { status: 409, body: { message: "Conflict" } },
    { status: 200, body: {} },
  ]);
  await assert.rejects(
    api.book("widget", {}),
    (error) =>
      error.status === 400 &&
      error.body.errors.customer_email[0] === "Invalid email"
  );
  await assert.rejects(api.book("widget", {}), (error) => error.status === 409);
  await assert.rejects(api.getPublicWidget("widget"), /invalid response/);
});
test("appointment routing does not intercept pricing, forms or payment status", () => {
  assert.deepEqual(appointmentRoute("/appointments/id/", "?embed=1"), {
    management: false,
    widgetId: "id",
  });
  assert.deepEqual(appointmentRoute("/appointments/manage/", ""), {
    management: true,
    widgetId: "",
  });
  assert.deepEqual(appointmentRoute("/", "?slug=id&type=appointment"), {
    management: false,
    widgetId: "id",
  });
  for (const [path, search] of [
    ["/", "?slug=id"],
    ["/", "?slug=id&type=form"],
    ["/pay/id", ""],
    ["/payment-status", ""],
    ["/embed/id", ""],
  ])
    assert.equal(appointmentRoute(path, search), null);
});
function loaderResult({ type, query = "" } = {}) {
  let iframe;
  const handlers = {};
  const container = {
    style: {},
    getAttribute: (name) => (name === "data-type" ? type : null),
    appendChild: (node) => {
      iframe = node;
    },
  };
  const script = {
    src: `https://pricingwidget.example/widget-loader.js?slug=id${query}`,
  };
  const document = {
    currentScript: script,
    readyState: "complete",
    getElementById: () => container,
    createElement: () => ({ style: {}, contentWindow: {} }),
  };
  const window = {
    location: { href: "https://host.example/", origin: "https://host.example" },
    addEventListener: (name, handler) => {
      handlers[name] = handler;
    },
  };
  vm.runInNewContext(loader, { document, window, URL, console });
  return { iframe, handlers };
}
test("loader preserves existing pricing and form iframe URLs exactly", () => {
  assert.equal(
    loaderResult().iframe.src,
    "https://pricingwidget.example/?slug=id&embed=true"
  );
  assert.equal(
    loaderResult({ type: "form" }).iframe.src,
    "https://pricingwidget.example/?slug=id&embed=true&type=form"
  );
});
test("appointment loader accepts data-type or query type and checks resize sender", () => {
  const result = loaderResult({ type: "appointment" });
  assert.equal(
    result.iframe.src,
    "https://pricingwidget.example/appointments/id/?embed=1"
  );
  assert.equal(
    loaderResult({ query: "&type=appointment" }).iframe.src,
    result.iframe.src
  );
  result.handlers.message({
    origin: "https://other.example",
    source: result.iframe.contentWindow,
    data: { type: "resize", height: 900 },
  });
  assert.equal(result.iframe.style.height, undefined);
  result.handlers.message({
    origin: "https://pricingwidget.example",
    source: result.iframe.contentWindow,
    data: { type: "resize", height: 900 },
  });
  assert.equal(result.iframe.style.height, "900px");
});

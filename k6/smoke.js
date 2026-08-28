import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL, login, authHeaders, sampleDeliveryPayload } from "./helpers.js";

// Smoke test: tiny load, just confirms the critical path works before
// running anything heavier. Run this first, on every environment.
export const options = {
  vus: 1,
  iterations: 5,
  thresholds: {
    http_req_failed: ["rate==0"],
    http_req_duration: ["p(95)<800"],
  },
};

export default function () {
  const retailerToken = login("retailer@reflex.demo");
  const dispatcherToken = login("dispatcher@reflex.demo");
  const riderToken = login("rider@reflex.demo");

  const created = http.post(
    `${BASE_URL}/api/deliveries`,
    sampleDeliveryPayload(),
    authHeaders(retailerToken)
  );
  check(created, { "delivery created": (r) => r.status === 201 });

  const list = http.get(`${BASE_URL}/api/deliveries`, authHeaders(dispatcherToken));
  check(list, { "dispatcher can list deliveries": (r) => r.status === 200 });

  const health = http.get(`${BASE_URL}/health`);
  check(health, { "health check ok": (r) => r.status === 200 });

  // Just confirm the rider can see their own (possibly empty) list.
  const riderMe = http.get(`${BASE_URL}/api/auth/me`, authHeaders(riderToken));
  check(riderMe, { "rider identity resolves": (r) => r.status === 200 });

  sleep(1);
}

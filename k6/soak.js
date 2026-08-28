import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL, login, authHeaders, sampleDeliveryPayload } from "./helpers.js";

// Soak / endurance test: a soak test and an endurance test are the same
// technique — moderate, realistic load held for a long stretch of time to
// surface memory leaks, connection-pool exhaustion, or slow degradation
// that short tests can't reveal. Override DURATION via env for longer runs,
// e.g. `k6 run -e DURATION=4h k6/soak.js`.
const DURATION = __ENV.DURATION || "30m";

export const options = {
  stages: [
    { duration: "1m", target: 30 },
    { duration: DURATION, target: 30 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<600"],
  },
};

export default function () {
  const retailerToken = login("retailer@reflex.demo");
  const dispatcherToken = login("dispatcher@reflex.demo");

  const created = http.post(
    `${BASE_URL}/api/deliveries`,
    sampleDeliveryPayload(),
    authHeaders(retailerToken)
  );
  check(created, { "delivery created": (r) => r.status === 201 });

  const list = http.get(`${BASE_URL}/api/deliveries`, authHeaders(dispatcherToken));
  check(list, { "list still fast after sustained load": (r) => r.status === 200 });

  sleep(2);
}

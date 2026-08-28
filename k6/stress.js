import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL, login, authHeaders, sampleDeliveryPayload } from "./helpers.js";

// Stress test: ramps well beyond expected normal load to see how the
// system degrades (error rate, latency) rather than whether it "passes".
export const options = {
  stages: [
    { duration: "1m", target: 50 },
    { duration: "2m", target: 150 },
    { duration: "2m", target: 300 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.1"], // looser than load.js — we expect some strain
  },
};

export default function () {
  const retailerToken = login("retailer@reflex.demo");

  const created = http.post(
    `${BASE_URL}/api/deliveries`,
    sampleDeliveryPayload(),
    authHeaders(retailerToken)
  );
  check(created, { "delivery created or gracefully rejected": (r) => r.status < 500 });

  sleep(0.5);
}

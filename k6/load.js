import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL, login, authHeaders, sampleDeliveryPayload } from "./helpers.js";

// Load test: simulates expected day-to-day traffic from a handful of
// retailers and a dispatcher checking the board, sustained for a few minutes.
export const options = {
  stages: [
    { duration: "30s", target: 20 }, // ramp up
    { duration: "3m", target: 20 }, // sustain expected load
    { duration: "30s", target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500", "p(99)<1000"],
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

  const list = http.get(`${BASE_URL}/api/deliveries?status=OPEN`, authHeaders(dispatcherToken));
  check(list, { "dispatcher board loads": (r) => r.status === 200 });

  const riders = http.get(`${BASE_URL}/api/riders`, authHeaders(dispatcherToken));
  check(riders, { "rider roster loads": (r) => r.status === 200 });

  sleep(Math.random() * 2 + 1);
}

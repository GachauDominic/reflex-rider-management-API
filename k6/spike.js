import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL, login, authHeaders } from "./helpers.js";

// Spike test: simulates a sudden burst — e.g. every retailer refreshing
// the dispatcher board at once after a WhatsApp announcement — then a
// sudden drop back to baseline.
export const options = {
  stages: [
    { duration: "10s", target: 10 }, // baseline
    { duration: "10s", target: 400 }, // sudden spike
    { duration: "30s", target: 400 }, // hold the spike
    { duration: "10s", target: 10 }, // sudden drop
    { duration: "20s", target: 10 }, // recovery check
  ],
  thresholds: {
    http_req_failed: ["rate<0.2"],
  },
};

export default function () {
  const dispatcherToken = login("dispatcher@reflex.demo");
  const res = http.get(`${BASE_URL}/api/deliveries`, authHeaders(dispatcherToken));
  check(res, { "board still responds during spike": (r) => r.status === 200 });
  sleep(0.2);
}

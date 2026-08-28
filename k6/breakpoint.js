import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL, login, authHeaders } from "./helpers.js";

// Breakpoint test: ramps traffic up in a continuous staircase until the
// system starts failing, to find the actual capacity ceiling rather than
// guessing at it. Watch error rate and latency together — the ceiling is
// wherever one of them bends sharply upward.
export const options = {
  executor: "ramping-arrival-rate",
  startRate: 10,
  timeUnit: "1s",
  preAllocatedVUs: 50,
  maxVUs: 1000,
  stages: [
    { duration: "2m", target: 50 },
    { duration: "2m", target: 150 },
    { duration: "2m", target: 300 },
    { duration: "2m", target: 500 },
    { duration: "2m", target: 800 },
  ],
};

export default function () {
  const dispatcherToken = login("dispatcher@reflex.demo");
  const res = http.get(`${BASE_URL}/api/deliveries`, authHeaders(dispatcherToken));
  check(res, { "still responding": (r) => r.status === 200 });
  sleep(0.1);
}

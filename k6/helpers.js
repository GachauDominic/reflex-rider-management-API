import http from "k6/http";
import { check } from "k6";

export const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";

// Requires the seeded demo accounts (npm run db:seed) to exist on the
// target environment. Never point these scripts at production.
const DEMO_PASSWORD = "Password123!";

export function login(email) {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email, password: DEMO_PASSWORD }),
    { headers: { "Content-Type": "application/json" } }
  );
  check(res, {
    "login succeeded": (r) => r.status === 200,
  });
  return res.json("token");
}

export function authHeaders(token) {
  return { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } };
}

export function randomKenyanPhone() {
  const n = Math.floor(10000000 + Math.random() * 89999999);
  return `07${String(n).slice(0, 8)}`;
}

export function sampleDeliveryPayload() {
  return JSON.stringify({
    customerName: "Load Test Customer",
    customerPhone: randomKenyanPhone(),
    address: "Westlands, Nairobi",
    itemDescription: "k6 test package",
  });
}

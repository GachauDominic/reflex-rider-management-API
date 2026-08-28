/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  setupFiles: ["dotenv/config"],
  clearMocks: true,
  verbose: true,
  testTimeout: 15000,
};

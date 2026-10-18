import { defineConfig } from "vitest/config";

// STORY-009-01: every test runs with the version check off; tests of the check inject env and fetch.
export default defineConfig({ test: { env: { WIKEEPER_NO_UPDATE_CHECK: "1" } } });

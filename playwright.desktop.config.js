import base from "./playwright.config.js";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  ...base,
  testDir: "tests/desktop",
  use: { ...base.use, baseURL: "http://127.0.0.1:4174" },
  webServer: {
    command: "npm run preview -- --port 4174 --strictPort",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false,
  },
});

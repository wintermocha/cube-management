import { defineConfig, devices } from 'playwright/test';

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseUrl || 'http://127.0.0.1:8788';
const mobileSpecs = /(?:inventory-scroll|login-session|stitch-ui|mobile-navigation|mobile-tap-matrix|stock-lifecycle|ingredient-lifecycle|combo-meal-lifecycle|profile-history-auth)\.spec\.js/;
const responsiveCanonicalSpecs = /(?:visual-contract|persistence-failures|responsive-all-screens)\.spec\.js/;
const responsiveCaptureSpecs = /(?:responsive-all-screens|canonical-35)\.spec\.js/;
const realD1Spec = /real-d1-lifecycle\.spec\.js/;

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results/e2e',
  reporter: [['list']],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: externalBaseUrl ? undefined : {
    command: 'npm run dev',
    url: 'http://127.0.0.1:8788',
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'mobile-chromium',
      testMatch: process.env.REAL_D1 === '1' ? realD1Spec : mobileSpecs,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'responsive-375',
      testMatch: responsiveCaptureSpecs,
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } },
    },
    {
      name: 'responsive-390',
      testMatch: /(?:visual-contract|persistence-failures|responsive-all-screens|canonical-35)\.spec\.js/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'responsive-768',
      testMatch: responsiveCaptureSpecs,
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'responsive-1280',
      testMatch: responsiveCaptureSpecs,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],
});

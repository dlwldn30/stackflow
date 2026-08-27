import { defineConfig, devices } from '@playwright/test'

const outputRoot = '../output/playwright'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: {
    timeout: 20_000,
  },
  outputDir: `${outputRoot}/test-results`,
  reporter: process.env.CI
    ? [['line'], ['html', { outputFolder: `${outputRoot}/report`, open: 'never' }]]
    : [['list']],
  use: {
    baseURL: process.env.STACKFLOW_FRONTEND_URL ?? 'http://127.0.0.1:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})

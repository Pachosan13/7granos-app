import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4173;

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: `npm run dev -- --host --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      VITE_SUPABASE_FUNCTIONS_URL: 'http://localhost:8787/functions/v1',
      VITE_SUPABASE_URL: 'https://demo.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'demo-key',
      VITE_DEMO: '1',
    },
  },
});

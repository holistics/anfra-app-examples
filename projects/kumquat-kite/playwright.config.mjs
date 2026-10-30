// Browser tests of the real interface: the app server and its Anfra core on the isolated local test database
// (kumquat_test). The test server (scripts/test_server.mjs, port 8788) resets that database to the starting demo data
// as it starts, and refuses anything but a local database whose name ends in _test, so the demo database and the dev
// server on 8787 are never touched.
const PORT = Number(process.env.KK_TEST_PORT || 8788);
export default {
  testDir: 'tests/ui',
  timeout: 120000,
  expect: { timeout: 30000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['json', { outputFile: 'test-results/ui-report.json' }]],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure', screenshot: 'only-on-failure', locale: 'en-GB', timezoneId: 'Asia/Ho_Chi_Minh' },
  outputDir: 'test-results/ui-artifacts',
  // A new server for every run, so every run starts from the same data.
  webServer: { command: 'node scripts/test_server.mjs', url: `http://127.0.0.1:${PORT}/readyz`, reuseExistingServer: false, timeout: 240000,
    env: { KK_TEST_PORT: String(PORT) } },
};

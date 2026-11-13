// Shared by the e2e server script and the tests. A fixed token is fine: it guards a
// throwaway backend on loopback that only ever holds synthetic test data.
export const E2E_PORT = 4317;
export const E2E_SYNC_TOKEN = 'e2e0'.repeat(16);
export const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

import { runtimeConfig } from './runtimeConfig';

// Deliberately memory-only. Reloading the page requires unlocking again.
let token = '';
export const getLocalUserToken = () => token;
export const setLocalUserToken = value => { token = value || ''; };
export async function userRequest(endpoint, body, { keepalive = false } = {}) {
  const response = await fetch(`${runtimeConfig.apiBasePath}/users${endpoint}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    keepalive,
    headers: { 'X-SSB-Client': 'private-ui', 'X-SSB-Session': token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || 'Local user request failed'), { status: response.status });
  return result;
}

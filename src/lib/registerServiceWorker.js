import { runtimeConfig } from './runtimeConfig';

/** True only for a production client-only build running in a browser (never desktop). */
export function shouldRegisterServiceWorker({ isProd, config, nav }) {
  return Boolean(
    isProd &&
    config?.deploymentProfile === 'client-only' &&
    !config?.isDesktop &&
    nav &&
    'serviceWorker' in nav,
  );
}

/** Registers /sw.js when allowed. Never throws: the app works the same without it. */
export async function registerServiceWorker({
  isProd = import.meta.env.PROD,
  config = runtimeConfig,
  nav = typeof navigator === 'undefined' ? undefined : navigator,
  log = console,
} = {}) {
  if (!shouldRegisterServiceWorker({ isProd, config, nav })) return null;
  try {
    return await nav.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (error) {
    log.warn('Service worker registration failed; the app still works online.', error);
    return null;
  }
}

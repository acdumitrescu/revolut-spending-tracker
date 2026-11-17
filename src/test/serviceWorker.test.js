import { describe, expect, it, vi } from 'vitest';
import {
  buildCacheName,
  buildPrecacheList,
  renderServiceWorker,
  resolveDeploymentProfile,
  shouldEmitServiceWorker,
} from '../../scripts/vite/serviceWorkerPlugin.js';
import { registerServiceWorker, shouldRegisterServiceWorker } from '../lib/registerServiceWorker';

describe('service worker build plugin helpers', () => {
  it('lists the app shell and leaves out lazy and demo files', () => {
    const list = buildPrecacheList([
      'index.html',
      'assets/index-abc.js',
      'assets/index-abc.css',
      'assets/exceljs.min-xyz.js',
      'assets/exceljs-xyz.js',
      'assets/index-abc.js.map',
      'demo-revolut.csv',
      '_redirects',
      'sw.js',
      'manifest.webmanifest',
      'icon-192.png',
      'favicon.svg',
    ]);
    expect(list).toEqual([
      '/',
      '/assets/index-abc.css',
      '/assets/index-abc.js',
      '/favicon.svg',
      '/icon-192.png',
      '/manifest.webmanifest',
    ]);
  });

  it('gives a cache name that changes with the file list or file contents', () => {
    const a = buildCacheName(['/', '/assets/a.js']);
    expect(a).toMatch(/^ssb-[0-9a-f]{12}$/);
    expect(buildCacheName(['/', '/assets/a.js'])).toBe(a);
    expect(buildCacheName(['/', '/assets/b.js'])).not.toBe(a);
    expect(buildCacheName(['/', '/assets/a.js'], ['x'])).not.toBe(a);
  });

  it('follows the runtimeConfig profile rule', () => {
    expect(resolveDeploymentProfile({})).toBe('client-only');
    expect(resolveDeploymentProfile({ VITE_ENABLE_SERVER_SYNC: 'true' })).toBe('private-sync');
    expect(
      resolveDeploymentProfile({
        VITE_DEPLOYMENT_PROFILE: 'client-only',
        VITE_ENABLE_SERVER_SYNC: 'true',
      }),
    ).toBe('client-only');
    expect(resolveDeploymentProfile({ VITE_DEPLOYMENT_PROFILE: 'private-sync' })).toBe(
      'private-sync',
    );
  });

  it('emits only for client-only builds outside desktop mode', () => {
    expect(shouldEmitServiceWorker({ mode: 'production', env: {} })).toBe(true);
    expect(shouldEmitServiceWorker({ mode: 'desktop', env: {} })).toBe(false);
    expect(
      shouldEmitServiceWorker({
        mode: 'production',
        env: { VITE_DEPLOYMENT_PROFILE: 'private-sync' },
      }),
    ).toBe(false);
  });

  it('renders a worker that skips the API and cross-origin requests', () => {
    const source = renderServiceWorker({ cacheName: 'ssb-test', precache: ['/', '/a.js'] });
    expect(() => new Function(source)).not.toThrow();
    expect(source).toContain('"ssb-test"');
    expect(source).toContain('"/a.js"');
    expect(source).toContain("url.pathname.startsWith('/api/')");
    expect(source).toContain('url.origin !== self.location.origin');
  });
});

describe('service worker registration gating', () => {
  const nav = () => ({ serviceWorker: { register: vi.fn().mockResolvedValue({ scope: '/' }) } });
  const clientOnly = { deploymentProfile: 'client-only', isDesktop: false };

  it('registers in a production client-only browser build', async () => {
    const n = nav();
    await registerServiceWorker({ isProd: true, config: clientOnly, nav: n });
    expect(n.serviceWorker.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it.each([
    ['development', { isProd: false, config: clientOnly }],
    [
      'private-sync',
      { isProd: true, config: { ...clientOnly, deploymentProfile: 'private-sync' } },
    ],
    ['desktop', { isProd: true, config: { ...clientOnly, isDesktop: true } }],
  ])('does not register for %s', async (_name, options) => {
    const n = nav();
    expect(await registerServiceWorker({ ...options, nav: n })).toBeNull();
    expect(n.serviceWorker.register).not.toHaveBeenCalled();
  });

  it('does nothing without service worker support', async () => {
    expect(shouldRegisterServiceWorker({ isProd: true, config: clientOnly, nav: {} })).toBe(false);
    expect(await registerServiceWorker({ isProd: true, config: clientOnly, nav: {} })).toBeNull();
  });

  it('fails silently with a warning', async () => {
    const log = { warn: vi.fn() };
    const n = { serviceWorker: { register: vi.fn().mockRejectedValue(new Error('nope')) } };
    expect(
      await registerServiceWorker({ isProd: true, config: clientOnly, nav: n, log }),
    ).toBeNull();
    expect(log.warn).toHaveBeenCalledOnce();
  });
});

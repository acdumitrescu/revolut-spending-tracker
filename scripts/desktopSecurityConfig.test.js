// @vitest-environment node
// Static guards for the desktop app's security posture. Each assertion is a line
// in docs/desktop/security-checklist.md: if one fails, the checklist is no longer true.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const json = (file) => JSON.parse(read(file));

describe('Tauri configuration', () => {
  const config = json('src-tauri/tauri.conf.json');

  it('grants no IPC capabilities to the webview', () => {
    expect(config.app.security.capabilities).toEqual([]);
    expect(fs.existsSync(path.join(root, 'src-tauri/capabilities'))).toBe(false);
    expect(JSON.stringify(config)).not.toMatch(/"remote"|dangerousRemoteDomainIpcAccess|dangerousDisableAssetCspModification/);
  });

  it('does not expose the Tauri JS API or the asset protocol', () => {
    expect(config.app.withGlobalTauri).toBe(false);
    expect(config.app.security.assetProtocol).toBeUndefined();
    expect(config.app.security.pattern).toBeUndefined();
  });

  it('has no updater and no hidden auto-open windows', () => {
    expect(config.plugins?.updater).toBeUndefined();
    expect(config.bundle.createUpdaterArtifacts).toBeUndefined();
    expect(config.app.windows).toEqual([]); // the shell opens the window after the backend is healthy
  });

  it('bundles only the sidecar runtime and staged resources', () => {
    expect(config.bundle.externalBin).toEqual(['binaries/node']);
    expect(Object.keys(config.bundle.resources).sort()).toEqual(['resources/staged/backend/', 'resources/staged/dist/']);
  });
});

describe('Rust crate', () => {
  const cargo = read('src-tauri/Cargo.toml');

  it('has no devtools, shell, updater, fs, http or asset-protocol surface', () => {
    expect(cargo).not.toMatch(/devtools|tauri-plugin-shell|tauri-plugin-updater|tauri-plugin-fs|tauri-plugin-http|protocol-asset|tauri-plugin-process|tauri-plugin-dialog/);
  });

  it('pins tauri crates exactly and the toolchain to one release', () => {
    const tauriLines = cargo.split('\n').filter((l) => /^(tauri|tauri-build|tauri-plugin-[a-z-]+)\s*=/.test(l));
    expect(tauriLines.length).toBeGreaterThanOrEqual(4); // tauri, tauri-build, single-instance, opener
    for (const line of tauriLines) expect(line, line).toMatch(/"=\d+\.\d+\.\d+"/);
    expect(read('rust-toolchain.toml')).toMatch(/channel = "\d+\.\d+\.\d+"/);
    expect(fs.existsSync(path.join(root, 'src-tauri/Cargo.lock'))).toBe(true);
  });

  it('aborts on panic and strips release binaries', () => {
    expect(cargo).toMatch(/panic = "abort"/);
    expect(cargo).toMatch(/strip = true/);
  });

  it('denies new windows and only opens https/mailto externally', () => {
    const window = read('src-tauri/src/window.rs');
    expect(window).toContain('on_new_window');
    expect(window).toContain('NewWindowResponse::Deny');
    expect(window).not.toMatch(/"http"\s*\|\s*"https"\s*\|\s*"mailto"\s*=>\s*Navigation::OpenExternally/);
  });

  it('verifies the backend listener belongs to the child before injecting the token', () => {
    expect(read('src-tauri/src/backend.rs')).toContain('listener_owned_by(self.child.id(), self.port)');
  });

  it('starts the sidecar with a cleared environment', () => {
    expect(read('src-tauri/src/backend.rs')).toMatch(/\.env_clear\(\)/);
  });
});

describe('macOS entitlements', () => {
  const plist = read('src-tauri/Entitlements.plist');
  const granted = [...plist.matchAll(/<key>([^<]+)<\/key>\s*<true\/>/g)].map((m) => m[1]).sort();

  it('grants only JIT and (while ad-hoc signed) disabled library validation', () => {
    expect(granted).toEqual(['com.apple.security.cs.allow-jit', 'com.apple.security.cs.disable-library-validation']);
  });

  it('never allows debugging, DYLD injection or unsigned executable memory', () => {
    expect(plist).not.toMatch(/get-task-allow|allow-dyld-environment-variables|disable-executable-page-protection|allow-unsigned-executable-memory/);
  });
});

describe('backend defaults', () => {
  it('binds to loopback unless the Docker image says otherwise', () => {
    expect(read('backend/server.js')).toContain("process.env.HOST || '127.0.0.1'");
    expect(read('backend/Dockerfile')).toMatch(/^ENV HOST=0\.0\.0\.0$/m);
  });

  it('pins backend dependencies exactly', () => {
    const { dependencies } = json('backend/package.json');
    for (const [name, range] of Object.entries(dependencies)) {
      if (name === 'express') continue; // semver range kept for Express 4 patch releases
      expect(range, name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});

describe('desktop build scripts', () => {
  const prepare = read('scripts/desktop/prepareSidecar.mjs');

  it('verifies the Node runtime against a pinned and a published checksum', () => {
    expect(prepare).toContain('platform.sha256');
    expect(prepare).toContain('SHASUMS256.txt');
    expect(json('desktop/node-version.json').platforms['aarch64-apple-darwin'].sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('builds the sidecar with a minimal environment and audits production dependencies', () => {
    expect(prepare).toContain('minimalEnv');
    expect(prepare).toMatch(/'audit', '--omit=dev', '--audit-level=high'/);
    expect(prepare).not.toMatch(/\.\.\.process\.env/);
  });
});

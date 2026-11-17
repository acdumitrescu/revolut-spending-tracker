// @vitest-environment node
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { protectRecoveryKey, unlockRecoveryKey } from './passwordRecovery.js';

describe('password-protected recovery key', () => {
  const password = Buffer.from('Synthetic recovery password only!');
  it('round trips the exact key after JSON serialization without plaintext secrets', async () => {
    const key = randomBytes(32);
    const envelope = await protectRecoveryKey(key, password);
    const serialized = JSON.stringify(envelope);
    expect(serialized.includes(key.toString('hex'))).toBe(false);
    expect(serialized.includes(password.toString())).toBe(false);
    expect(await unlockRecoveryKey(JSON.parse(serialized), password)).toEqual(key);
  });
  it('uses fresh salt and nonce for repeated protection', async () => {
    const key = randomBytes(32);
    const a = await protectRecoveryKey(key, password);
    const b = await protectRecoveryKey(key, password);
    expect(a.salt).not.toBe(b.salt);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
  it('rejects wrong passwords, tampering and unsupported parameters', async () => {
    const envelope = await protectRecoveryKey(randomBytes(32), password);
    await expect(
      unlockRecoveryKey(envelope, Buffer.from('A different synthetic password')),
    ).rejects.toThrow('Wrong recovery password');
    const changed = {
      ...envelope,
      tag: (envelope.tag[0] === '0' ? '1' : '0') + envelope.tag.slice(1),
    };
    await expect(unlockRecoveryKey(changed, password)).rejects.toThrow('damaged');
    await expect(unlockRecoveryKey({ ...envelope, kdf: 'unbounded' }, password)).rejects.toThrow(
      'Invalid recovery file',
    );
    await expect(
      unlockRecoveryKey({ ...envelope, salt: 'x'.repeat(64) }, password),
    ).rejects.toThrow('Invalid recovery file');
  });
  it('rejects short and oversized passwords', async () => {
    await expect(protectRecoveryKey(randomBytes(32), Buffer.from('short'))).rejects.toThrow(
      '16 to 256',
    );
    await expect(protectRecoveryKey(randomBytes(32), Buffer.alloc(257))).rejects.toThrow(
      '16 to 256',
    );
  });
});

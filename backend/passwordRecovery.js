import { Buffer } from 'node:buffer';
import { randomBytes, scrypt, createCipheriv, createDecipheriv } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const format = 'ssb-password-recovery-v1';
const aad = Buffer.from(format);
const options = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

function checkPassword(password, allowShortPassword = false) {
  const minimum = allowShortPassword ? 4 : 16;
  if (!Buffer.isBuffer(password) || password.length < minimum || password.length > 256) {
    throw new Error(`Use a recovery password of ${minimum} to 256 UTF-8 bytes`);
  }
}
export async function protectRecoveryKey(key, password, { allowShortPassword = false } = {}) {
  checkPassword(password, allowShortPassword);
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Invalid database key');
  const salt = randomBytes(32);
  const nonce = randomBytes(12);
  const wrappingKey = await derive(password, salt, 32, options);
  try {
    const cipher = createCipheriv('aes-256-gcm', wrappingKey, nonce);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(key), cipher.final()]);
    return {
      format,
      kdf: 'scrypt-N131072-r8-p1',
      cipher: 'aes-256-gcm',
      salt: salt.toString('hex'),
      nonce: nonce.toString('hex'),
      ciphertext: ciphertext.toString('hex'),
      tag: cipher.getAuthTag().toString('hex'),
    };
  } finally {
    wrappingKey.fill(0);
  }
}
export async function unlockRecoveryKey(envelope, password, { allowShortPassword = false } = {}) {
  checkPassword(password, allowShortPassword);
  if (
    !envelope ||
    envelope.format !== format ||
    envelope.kdf !== 'scrypt-N131072-r8-p1' ||
    envelope.cipher !== 'aes-256-gcm' ||
    !/^[a-f0-9]{64}$/.test(envelope.salt) ||
    !/^[a-f0-9]{24}$/.test(envelope.nonce) ||
    !/^[a-f0-9]{64}$/.test(envelope.ciphertext) ||
    !/^[a-f0-9]{32}$/.test(envelope.tag)
  )
    throw new Error('Invalid recovery file');
  const wrappingKey = await derive(password, Buffer.from(envelope.salt, 'hex'), 32, options);
  let partial;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      wrappingKey,
      Buffer.from(envelope.nonce, 'hex'),
    );
    decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
    partial = decipher.update(Buffer.from(envelope.ciphertext, 'hex'));
    return Buffer.concat([partial, decipher.final()]);
  } catch {
    throw new Error('Wrong recovery password or damaged recovery file');
  } finally {
    wrappingKey.fill(0);
    partial?.fill(0);
  }
}

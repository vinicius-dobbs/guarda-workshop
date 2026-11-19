const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { Buffer } = require('buffer');
const { ed25519 } = require('@noble/curves/ed25519.js');

const file = path.join(__dirname, 'workshopProofRetry.js');
const original = fs.readFileSync(file, 'utf8');
assert.doesNotMatch(original, /(?:from\([^\n]*|toString\()'base64url'/);
const code = original
  .replace(/^import AsyncStorage.*$/m, "const AsyncStorage = require('@react-native-async-storage/async-storage');")
  .replace(/^import \{ ed25519 \}.*$/m, "const { ed25519 } = require('@noble/curves/ed25519.js');")
  .replace(/^import \{ Buffer \}.*$/m, "const { Buffer } = require('buffer');")
  .replace('export async function resignWorkshopProof', 'async function resignWorkshopProof')
  + '\nmodule.exports = { resignWorkshopProof };';

const privateKey = Buffer.alloc(32, 7);
const publicKey = Buffer.from(ed25519.getPublicKey(privateKey));
const jwk = { kty: 'OKP', crv: 'Ed25519', x: publicKey.toString('base64url') };
let stored = JSON.stringify({ privateKeyHex: privateKey.toString('hex'), pubJwk: jwk });
const rnBuffer = {
  from(...args) {
    if (args[1] === 'base64url') throw new TypeError('Unknown encoding: base64url');
    return Buffer.from(...args);
  },
};

const moduleUnderTest = new Module(file);
moduleUnderTest.filename = file;
moduleUnderTest.paths = module.paths;
moduleUnderTest.require = (id) => id === '@react-native-async-storage/async-storage'
  ? { getItem: async () => stored }
  : id === 'buffer'
    ? { Buffer: rnBuffer }
  : require(id);
moduleUnderTest._compile(code, file);

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const header = { typ: 'openid4vci-proof+jwt', alg: 'EdDSA', jwk };
const claims = { iss: 'wallet-demo', aud: 'http://certify', iat: 1, nonce: 'old' };
const originalJwt = `${encode(header)}.${encode(claims)}.original`;

(async () => {
  const signed = await moduleUnderTest.exports.resignWorkshopProof(originalJwt, 'fresh');
  const [encodedHeader, encodedClaims, signature] = signed.split('.');
  const nextClaims = JSON.parse(Buffer.from(encodedClaims, 'base64url').toString('utf8'));
  assert.equal(nextClaims.nonce, 'fresh');
  assert.equal(nextClaims.iss, claims.iss);
  assert.equal(nextClaims.aud, claims.aud);
  assert.equal(encodedHeader, originalJwt.split('.')[0]);
  assert.ok(ed25519.verify(Buffer.from(signature, 'base64url'), Buffer.from(`${encodedHeader}.${encodedClaims}`), publicKey));

  stored = null;
  await assert.rejects(moduleUnderTest.exports.resignWorkshopProof(originalJwt, 'fresh'), /indisponível/);
  stored = JSON.stringify({ privateKeyHex: Buffer.alloc(32, 8).toString('hex'), pubJwk: jwk });
  await assert.rejects(moduleUnderTest.exports.resignWorkshopProof(originalJwt, 'fresh'), /não corresponde/);
  console.log('Proof retry: assinatura válida, chave ausente e chave incorreta rejeitadas');
})().catch((error) => { console.error(error); process.exitCode = 1; });
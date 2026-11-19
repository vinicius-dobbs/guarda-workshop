import AsyncStorage from '@react-native-async-storage/async-storage';
import { ed25519 } from '@noble/curves/ed25519.js';
import { Buffer } from 'buffer';

const KEY_NAME = 'Ed25519_Issuer_KeyPair';

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='), 'base64');
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function decodePart(part) {
  return JSON.parse(decodeBase64Url(part).toString('utf8'));
}

function encodePart(value) {
  return encodeBase64Url(Buffer.from(JSON.stringify(value), 'utf8'));
}

export async function resignWorkshopProof(jwt, nonce) {
  const parts = jwt.split('.');
  if (parts.length !== 3 || !nonce) throw new Error('Proof JWT inválida para o retry da oficina.');

  const header = decodePart(parts[0]);
  const claims = decodePart(parts[1]);
  const stored = await AsyncStorage.getItem(KEY_NAME);
  if (header.typ !== 'openid4vci-proof+jwt' || header.alg !== 'EdDSA' || !stored) {
    throw new Error('Chave de assinatura da proof da oficina indisponível.');
  }

  const { privateKeyHex, pubJwk } = JSON.parse(stored);
  if (!/^[a-f0-9]{64}$/i.test(privateKeyHex) ||
      pubJwk?.kty !== 'OKP' || pubJwk?.crv !== 'Ed25519' ||
      header.jwk?.x !== pubJwk.x || header.jwk?.kty !== pubJwk.kty ||
      header.jwk?.crv !== pubJwk.crv) {
    throw new Error('Chave de assinatura da proof da oficina não corresponde ao JWT original.');
  }

  const privateKey = Buffer.from(privateKeyHex, 'hex');
  if (encodeBase64Url(ed25519.getPublicKey(privateKey)) !== pubJwk.x) {
    throw new Error('Chave pública da proof da oficina não corresponde à chave privada.');
  }

  const payload = { ...claims, nonce, iat: Math.floor(Date.now() / 1000) };
  const signingInput = `${parts[0]}.${encodePart(payload)}`;
  const signature = ed25519.sign(Buffer.from(signingInput, 'utf8'), privateKey);
  return `${signingInput}.${encodeBase64Url(signature)}`;
}
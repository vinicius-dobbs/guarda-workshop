import * as Crypto from 'expo-crypto';
import { PkceData } from './types';
import { isWorkshopMode, workshopClientId } from '../../services/workshopIssuer';

const WORKSHOP_REDIRECT_URI = 'io.mosip.residentapp.inji://oauthredirect';
const WORKSHOP_AUTH_URL = process.env.EXPO_PUBLIC_WORKSHOP_AUTH_URL || 'https://esignet-mock.collab.mosip.net/authorize';

export const getWorkshopMimotoUrl = () => {
  const url = process.env.EXPO_PUBLIC_WORKSHOP_MIMOTO_URL;
  if (!url) throw new Error('EXPO_PUBLIC_WORKSHOP_MIMOTO_URL não configurada');
  return url.replace(/\/$/, '');
};

export const getOAuthConfig = () => isWorkshopMode ? ({
  authorizationUrl: WORKSHOP_AUTH_URL,
  clientId: workshopClientId,
  redirectUri: WORKSHOP_REDIRECT_URI,
  scopes: 'mock_identity_vc_ldp',
  mimotoUrl: getWorkshopMimotoUrl(),
}) : ({
  authorizationUrl: process.env.EXPO_PUBLIC_OAUTH_AUTHORIZATION_URL!,
  clientId:         process.env.EXPO_PUBLIC_OAUTH_CLIENT_ID!,
  redirectUri:      process.env.EXPO_PUBLIC_OAUTH_REDIRECT_URI!,
  scopes:           'openid email profile govbr_confiabilidades',
  mimotoUrl:        process.env.EXPO_PUBLIC_MIMOTO_URL!,
});

const toBase64Url = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

export const generatePkce = async (): Promise<PkceData> => {
  const random = Crypto.getRandomBytes(32);
  const codeVerifier = toBase64Url(random.buffer as ArrayBuffer);
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    codeVerifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );
  const codeChallenge = digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return { codeVerifier, codeChallenge };
};

export const buildAuthorizationUrl = (pkce: PkceData, state?: string): string => {
  const cfg = getOAuthConfig();
  const url = new URL(cfg.authorizationUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('scope', cfg.scopes);
  url.searchParams.set('redirect_uri', cfg.redirectUri);
  url.searchParams.set('nonce', isWorkshopMode ? Crypto.randomUUID() : 'q1w2e3r4t5y6u7i8o9p0');
  url.searchParams.set('state', state ?? 'p0o9i8u7y6t5r4e3w2q1');
  url.searchParams.set('code_challenge', pkce.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (isWorkshopMode) {
    url.searchParams.set('acr_values', 'mosip:idp:acr:generated-code');
    url.searchParams.set('display', 'popup');
    url.searchParams.set('prompt', 'login');
    url.searchParams.set('claims_locales', 'en');
  }
  return url.toString();
};

export const exchangeWorkshopCode = async (code: string, pkce: PkceData) => {
  const cfg = getOAuthConfig();
  const response = await fetch(`${getWorkshopMimotoUrl()}/v1/mimoto/get-token/Farmer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: pkce.codeVerifier,
      redirect_uri: cfg.redirectUri,
    }).toString(),
  });
  if (!response.ok) throw new Error(`Falha ao trocar código no Mimoto: HTTP ${response.status}`);
  const token = await response.json();
  if (!token.access_token) throw new Error('Mimoto não retornou access_token');
  return token;
};

export const fetchUserProfile = async (code: string, pkce: PkceData): Promise<any> => {
  const cfg = getOAuthConfig();
  const url = new URL(`${cfg.mimotoUrl}/v1/mimoto/user/profile`);
  url.searchParams.set('code', code);
  url.searchParams.set('codeVerifier', pkce.codeVerifier);
  url.searchParams.set('redirectUri', cfg.redirectUri);

  const response = await fetch(url.toString());

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Profile request failed: ${response.status} - ${errorBody}`);
  }

  const json = await response.json();
  return json.data;
};

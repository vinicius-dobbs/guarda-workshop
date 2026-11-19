import { jwtDecode } from 'jwt-decode';

const workshopAuthUrl = process.env.EXPO_PUBLIC_WORKSHOP_AUTH_URL;
const localIssuer = workshopAuthUrl ? new URL(workshopAuthUrl).origin : null;
const expectedIssuer = localIssuer || 'https://esignet-mock.collab.mosip.net/v1/esignet';
const acceptedAudiences = [
  ...(localIssuer
    ? [`${localIssuer}/v1/esignet/vci/credential`, `${new URL(process.env.EXPO_PUBLIC_WORKSHOP_CERTIFY_URL!).origin}/v1/certify/issuance/credential`]
    : ['http://certify-nginx:80/v1/certify/issuance/credential', 'https://esignet-mock.collab.mosip.net/v1/esignet/vci/credential']),
];

type WorkshopClaims = {
  iss?: string;
  aud?: string | string[];
  scope?: string;
  exp?: number;
  sub?: string;
  client_id?: string;
};

export function getWorkshopTokenProblem(token: string): string | null {
  try {
    const claims = jwtDecode<WorkshopClaims>(token);
    if (!claims.exp || claims.exp * 1000 <= Date.now()) return 'Sessão da oficina expirada. Entre novamente.';
    if (claims.iss !== expectedIssuer) return 'O emissor do token não corresponde ao configurado no Certify.';
    const audiences = typeof claims.aud === 'string' ? [claims.aud] : claims.aud ?? [];
    if (!audiences.some((audience) => acceptedAudiences.includes(audience))) {
      return 'A audiência do token não corresponde às permitidas pelo Certify.';
    }
    if (!claims.sub || !claims.client_id) return 'Faltam claims de identidade ou cliente no token.';
    if (!claims.scope?.split(' ').includes('mock_identity_vc_ldp')) {
      return 'O token não contém o escopo da credencial de demonstração.';
    }
    return null;
  } catch {
    return 'O token recebido não é um JWT válido para emissão.';
  }
}

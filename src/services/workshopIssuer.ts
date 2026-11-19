export const workshopCertifyUrl = process.env.EXPO_PUBLIC_WORKSHOP_CERTIFY_URL?.replace(/\/$/, '');

export const isWorkshopMode = Boolean(workshopCertifyUrl);
export const workshopClientId = 'wallet-demo';

export async function getWorkshopIssuerSections() {
  if (!workshopCertifyUrl) return [];

  const response = await fetch(`${workshopCertifyUrl}/.well-known/openid-credential-issuer`);
  if (!response.ok) throw new Error(`Falha ao consultar o emissor da oficina: ${response.status}`);

  const metadata = await response.json();
  const configurations = metadata.credential_configurations_supported;
  if (!configurations || Object.keys(configurations).length === 0) {
    throw new Error('Nenhuma credencial disponível no Certify da oficina');
  }
  const credentialEndpoint = `${workshopCertifyUrl.endsWith('/v1/certify') ? workshopCertifyUrl : `${workshopCertifyUrl}/v1/certify`}/issuance/credential`;

  const issuer = {
    id: 'ECA',
    name: 'Emissor de maioridade (oficina)',
    issuerUrl: workshopCertifyUrl,
    // SDK npm 1.0.11 usa client_id como iss da proof; o Certify exige o cliente OIDC.
    client_id: workshopClientId,
    credential_issuer: metadata.credential_issuer,
    // O metadata upstream anuncia um nome interno do Docker; use a URL alcançável pelo app.
    credential_endpoint: credentialEndpoint,
  };
  const data = Object.entries(configurations).map(([id, configuration]: [string, any]) => {
    return {
      id,
      name: configuration.display?.[0]?.name || id,
      format: configuration.format,
      credentialDefinitionTypes: configuration.credential_definition?.type,
      credentialSubject: configuration.credential_definition?.credentialSubject,
      fullConfig: configuration,
    };
  });

  return [{ title: issuer.name, issuer, data }];
}
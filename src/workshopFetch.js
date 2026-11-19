// O SDK exige um catálogo do Mimoto durante init(), antes de listar credenciais.
// No modo oficina, fornecemos apenas esse catálogo a partir do Certify local.
const certifyUrl = process.env.EXPO_PUBLIC_WORKSHOP_CERTIFY_URL?.replace(/\/$/, '');
const workshopClientId = 'wallet-demo';

if (certifyUrl) {
  const { resignWorkshopProof } = require('./services/workshopProofRetry');
  const originalFetch = global.fetch;
  const workshopOrigin = new URL(certifyUrl).origin;
  const credentialEndpoint = `${certifyUrl}/issuance/credential`;

  global.fetch = async (resource, options) => {
    if (typeof resource === 'string' && resource === `${workshopOrigin}/v1/mimoto/issuers`) {
      const metadataResponse = await originalFetch(`${certifyUrl}/.well-known/openid-credential-issuer`);
      if (!metadataResponse.ok) return metadataResponse;

      const metadata = await metadataResponse.json();
      if (!Object.keys(metadata.credential_configurations_supported ?? {}).length) {
        throw new Error('Nenhuma credencial disponível no Certify da oficina');
      }

      return new Response(JSON.stringify({ issuers: [{
        issuer_id: 'ECA',
        credential_issuer: metadata.credential_issuer,
        credential_issuer_host: certifyUrl,
        // O SDK usa o client_id do issuer no iss da proof durante o compartilhamento.
        client_id: workshopClientId,
        display: [{ name: 'Emissor de maioridade (oficina)' }],
        protocol: 'OpenId4VCI',
        enabled: true,
      }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (resource === credentialEndpoint && options?.method?.toUpperCase() === 'POST' &&
        typeof options.body === 'string') {
      const response = await originalFetch(resource, options);
      if (response.status !== 400) return response;

      const challenge = await response.clone().json().catch(() => null);
      if (challenge?.error !== 'invalid_proof' || typeof challenge.c_nonce !== 'string' ||
          !challenge.c_nonce || !(Number(challenge.c_nonce_expires_in) > 0)) return response;

      let request;
      try { request = JSON.parse(options.body); } catch { return response; }
      if (request?.proof?.proof_type !== 'jwt' || typeof request.proof.jwt !== 'string') return response;

      const jwt = await resignWorkshopProof(request.proof.jwt, challenge.c_nonce);
      return originalFetch(resource, {
        ...options,
        body: JSON.stringify({ ...request, proof: { ...request.proof, jwt } }),
      });
    }

    return originalFetch(resource, options);
  };
}
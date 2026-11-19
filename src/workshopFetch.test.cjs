const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const certifyUrl = 'http://workshop.example:31090/v1/certify';
const endpoint = `${certifyUrl}/issuance/credential`;
process.env.EXPO_PUBLIC_WORKSHOP_CERTIFY_URL = certifyUrl;

async function runScenario(responses, expectedRequests, expectedStatus) {
  const file = path.join(__dirname, 'workshopFetch.js');
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return responses.shift();
  };

  const moduleUnderTest = new Module(file);
  moduleUnderTest.filename = file;
  moduleUnderTest.paths = module.paths;
  moduleUnderTest.require = (id) => id === './services/workshopProofRetry'
    ? { resignWorkshopProof: async (jwt, nonce) => `signed-${jwt}-${nonce}` }
    : require(id);
  try {
    moduleUnderTest._compile(fs.readFileSync(file, 'utf8'), file);
    const result = await global.fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer fake' },
      body: JSON.stringify({ proof: { proof_type: 'jwt', jwt: 'original' } }),
    });
    assert.equal(result.status, expectedStatus);
    assert.equal(calls.length, expectedRequests);
    if (expectedRequests === 2) {
      assert.equal(JSON.parse(calls[1].options.body).proof.jwt, 'signed-original-fresh');
      assert.equal(calls[1].options.headers.Authorization, 'Bearer fake');
    }
  } finally {
    global.fetch = originalFetch;
  }
}

const response = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

(async () => {
  await runScenario([
    response(400, { error: 'invalid_proof', c_nonce: 'fresh', c_nonce_expires_in: 40 }),
    response(200, { credential: {} }),
  ], 2, 200);
  await runScenario([response(200, { credential: {} })], 1, 200);
  await runScenario([response(400, { error: 'invalid_proof' })], 1, 400);
  await runScenario([
    response(400, { error: 'invalid_proof', c_nonce: 'fresh', c_nonce_expires_in: 40 }),
    response(400, { error: 'invalid_proof', c_nonce: 'second', c_nonce_expires_in: 40 }),
  ], 2, 400);
  console.log('Workshop fetch: retry único só para desafio válido; demais respostas preservadas');
})().catch((error) => { console.error(error); process.exitCode = 1; });
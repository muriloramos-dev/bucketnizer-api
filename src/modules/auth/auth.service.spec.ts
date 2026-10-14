// import { generateKeyPairSync, sign } from 'node:crypto';
// import { ConfigService } from '@nestjs/config';
// import { AuthService } from './auth.service.js';

// const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
// const issuer = 'https://cognito-idp.sa-east-1.amazonaws.com/sa-east-1_pH4Ci7vwe';
// function token(overrides = {}) {
//   const head = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test' })).toString('base64url');
//   const body = Buffer.from(JSON.stringify({ iss: issuer, sub: 'owner-a', client_id: '3h87bpmsuvc9rkk3c2s7s2pjn8', token_use: 'access', exp: Math.floor(Date.now() / 1000) + 300, ...overrides })).toString('base64url');
//   return `${head}.${body}.${sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url')}`;
// }
// function service() {
//   const auth = new AuthService(new ConfigService({COGNITO_USER_POOL_ID:'sa-east-1_pH4Ci7vwe',COGNITO_CLIENT_ID:'3h87bpmsuvc9rkk3c2s7s2pjn8'}));
//   auth['verifier'].cacheJwks({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'test', alg: 'RS256', use: 'sig' }] });
//   return auth;
// }
// it('accepts a signed access token from the configured user pool and app', async () => {
//   await expect(service().verify(token())).resolves.toMatchObject({ sub: 'owner-a' });
// });
// it.each([
//   { client_id: 'another-app' }, { iss: 'https://other-issuer' },
//   { token_use: 'id', aud: '3h87bpmsuvc9rkk3c2s7s2pjn8' }, { exp: 1 },
// ])('rejects incorrect Cognito claims %j', async (claims) => {
//   await expect(service().verify(token(claims))).rejects.toMatchObject({ status: 401 });
// });
// it('rejects malformed tokens and signatures', async () => {
//   await expect(service().verify('invalid')).rejects.toMatchObject({ status: 401 });
//   await expect(service().verify(`${token().split('.').slice(0, 2).join('.')}.AAAA`)).rejects.toMatchObject({ status: 401 });
// });

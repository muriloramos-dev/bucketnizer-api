import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { Module } from '@nestjs/common';
import { NestFactory, APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

const compiled = process.env.BUCKETNIZER_TEST_DIST || '../dist';
const { AuthService } = await import(`${compiled}/auth/auth.service.js`);
const { AuthGuard } = await import(`${compiled}/auth/auth.guard.js`);
const { EventsModule } = await import(`${compiled}/events/events.module.js`);
const { EventsService } = await import(`${compiled}/events/events.service.js`);
const { FilesController } = await import(`${compiled}/files/files.controller.js`);
const { FilesService } = await import(`${compiled}/files/files.service.js`);
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const auth = new AuthService(new ConfigService());
auth.verifier.cacheJwks({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'test', alg: 'RS256', use: 'sig' }] });
function token(sub, seconds = 60) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test' })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({ iss: 'https://cognito-idp.sa-east-1.amazonaws.com/sa-east-1_pH4Ci7vwe', sub, client_id: '3h87bpmsuvc9rkk3c2s7s2pjn8', token_use: 'access', exp: Math.floor(Date.now()/1000) + seconds })).toString('base64url');
  return `${header}.${claims}.${sign('RSA-SHA256', Buffer.from(`${header}.${claims}`), privateKey).toString('base64url')}`;
}
const calls = [];
class TestModule {}
Module({
  imports: [EventsModule], controllers: [FilesController],
  providers: [
    { provide: AuthService, useValue: auth },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: FilesService, useValue: {
      sendObject: (...args) => { calls.push(args); return { objectId: 'mock-id', url: 'https://example.com/mock' }; },
      listFolders: (userId) => [userId],
    } },
  ],
})(TestModule);

void test('HTTP endpoints require Cognito tokens and SSE stays isolated until token expiry', { timeout: 12000 }, async () => {
  const app = await NestFactory.create(TestModule, { logger: false, abortOnError: false });
  const abort = new AbortController();
  let reader;
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    assert.equal((await fetch(`${base}/files/folders`)).status, 401);
    assert.equal((await fetch(`${base}/events`)).status, 401);
    assert.equal((await fetch(`${base}/files/folders`, { headers: { Authorization: 'Bearer invalid' } })).status, 401);
    const headers = { Authorization: `Bearer ${token('owner')}`, 'Content-Type': 'application/json' };
    const upload = await fetch(`${base}/files/upload`, { method: 'POST', headers, body: JSON.stringify({ userId: 'victim', path: 'Recentes', originalName: 'a.jpg', contentType: 'image/jpeg', size: 1 }) });
    assert.equal(upload.status, 201);
    assert.equal(calls[0][0], 'owner');
    const folders = await fetch(`${base}/files/folders`, { headers });
    assert.deepEqual(await folders.json(), ['owner']);
    const response = await fetch(`${base}/events`, { headers: { Authorization: `Bearer ${token('owner', 2)}` }, signal: abort.signal });
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    reader = response.body.getReader();
    let text = '';
    const decoder = new TextDecoder();
    while (!text.includes('event: connected')) {
      const chunk = await reader.read();
      assert.equal(chunk.done, false);
      text += decoder.decode(chunk.value);
    }
    app.get(EventsService).fileReady('victim', 'hidden', 'Private');
    app.get(EventsService).fileReady('owner', 'visible', 'Recentes');
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break; // Server closes the connection when access token expires.
      text += decoder.decode(chunk.value);
    }
    assert.match(text, /visible/);
    assert.doesNotMatch(text, /hidden/);
  } finally {
    abort.abort();
    await reader?.cancel().catch(() => {});
    await app.close();
  }
});

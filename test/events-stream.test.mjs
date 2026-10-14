import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { EventsModule } from '../dist/events/events.module.js';
import { EventsService } from '../dist/events/events.service.js';

void test('Nest SSE delivers READY over HTTP without a polling request', { timeout: 10000 }, async () => {
  // Starts only EventsModule: no real MongoDB, SQS, S3 or application process.
  const app = await NestFactory.create(EventsModule, { logger: false });
  const abort = new AbortController();
  let reader;
  try {
    // This isolated module tests streaming, not the app-wide authentication guard.
    app.use((req, _res, next) => { req.user = { sub: 'userId', exp: Math.floor(Date.now() / 1000) + 60 }; next(); });
    await app.listen(0, '127.0.0.1');
    const response = await fetch(`${await app.getUrl()}/events`, { signal: abort.signal });
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    assert.equal(response.headers.get('x-accel-buffering'), 'no');
    reader = response.body.getReader();
    let text = '';
    const decoder = new TextDecoder();
    async function receive(marker) {
      while (!text.includes(marker)) {
        const chunk = await reader.read();
        assert.equal(chunk.done, false);
        text += decoder.decode(chunk.value, { stream: true });
      }
    }
    await receive('event: connected');
    app.get(EventsService).fileReady('another-user', 'hidden-file', 'secret');
    app.get(EventsService).fileReady('userId', 'example-id', 'Viagens/Praia');
    await receive('event: file.ready');
    assert.match(text, /"objectId":"example-id"/);
    assert.match(text, /"pathName":"Viagens\/Praia"/);
    assert.doesNotMatch(text, /hidden-file/);
  } finally {
    abort.abort();
    await reader?.cancel().catch(() => {});
    await app.close();
  }
});
